"""Thread-safe SQLite WAL store with SHA-256 hash-chained events for OrwellBlue."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING, Self

if TYPE_CHECKING:
    from core.events import Event


DATA_DIR: Path = Path(__file__).resolve().parent.parent / "data"
DB_PATH: Path = DATA_DIR / "orwellblue.db"
FORENSICS_DIR: Path = DATA_DIR / "forensics"


def _now() -> float:
    return time.time()


class _Store:
    """Singleton-style SQLite WAL store protected by a reentrant lock."""

    _instance: _Store | None = None
    _lock: threading.Lock = threading.Lock()

    def __new__(cls) -> Self:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        FORENSICS_DIR.mkdir(parents=True, exist_ok=True)
        self._db_lock: threading.RLock = threading.RLock()
        self._conn: sqlite3.Connection = sqlite3.connect(
            DB_PATH,
            check_same_thread=False,
            isolation_level=None,
        )
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._ensure_schema()
        self._initialized = True

    def _ensure_schema(self) -> None:
        with self._db_lock:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    severity INTEGER NOT NULL DEFAULT 0,
                    detail TEXT NOT NULL DEFAULT '{}',
                    ts REAL NOT NULL,
                    prev_hash TEXT NOT NULL,
                    hash TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
                CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

                CREATE TABLE IF NOT EXISTS kill_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    requested_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS spawn_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id TEXT NOT NULL,
                    profile TEXT NOT NULL,
                    model TEXT NOT NULL DEFAULT 'qwen-1.5b',
                    prompt TEXT NOT NULL DEFAULT '',
                    requested_at REAL NOT NULL
                );
                """
            )
            columns = {
                row[1]
                for row in self._conn.execute(
                    "PRAGMA table_info(spawn_requests);"
                ).fetchall()
            }
            if "model" not in columns:
                self._conn.execute(
                    "ALTER TABLE spawn_requests ADD COLUMN model TEXT NOT NULL DEFAULT 'qwen-1.5b';"
                )
            if "prompt" not in columns:
                self._conn.execute(
                    "ALTER TABLE spawn_requests ADD COLUMN prompt TEXT NOT NULL DEFAULT '';"
                )

    @staticmethod
    def _canonical_detail(detail: dict) -> str:
        return json.dumps(detail, sort_keys=True, separators=(",", ":"))

    @classmethod
    def _compute_hash(
        cls,
        prev_hash: str,
        agent_id: str,
        event_type: str,
        severity: int,
        ts: float,
        detail: dict,
    ) -> str:
        payload = (
            f"{prev_hash}|{agent_id}|{event_type}|{severity}|{ts}|"
            f"{cls._canonical_detail(detail)}"
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _last_hash(self) -> str:
        with self._db_lock:
            row = self._conn.execute(
                "SELECT hash FROM events ORDER BY id DESC LIMIT 1;"
            ).fetchone()
        return row[0] if row is not None else "GENESIS"

    def append_event(self, event: Event) -> Event:
        prev_hash = self._last_hash()
        computed_hash = self._compute_hash(
            prev_hash=prev_hash,
            agent_id=event.agent_id,
            event_type=event.type.value,
            severity=event.severity,
            ts=event.ts,
            detail=event.detail,
        )
        detail_json = self._canonical_detail(event.detail)
        with self._db_lock:
            cursor = self._conn.execute(
                """
                INSERT INTO events
                    (agent_id, type, severity, detail, ts, prev_hash, hash)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    event.agent_id,
                    event.type.value,
                    event.severity,
                    detail_json,
                    event.ts,
                    prev_hash,
                    computed_hash,
                ),
            )
            event_id = cursor.lastrowid
        event.id = event_id
        event.prev_hash = prev_hash
        event.hash = computed_hash
        return event

    def read_events(self, since_id: int = 0) -> list[Event]:
        from core.events import Event

        with self._db_lock:
            rows = self._conn.execute(
                """
                SELECT id, agent_id, type, severity, detail, ts, prev_hash, hash
                FROM events
                WHERE id > ?
                ORDER BY id ASC;
                """,
                (since_id,),
            ).fetchall()

        events: list[Event] = []
        for row in rows:
            events.append(
                Event(
                    id=row[0],
                    agent_id=row[1],
                    type=row[2],
                    severity=row[3],
                    detail=json.loads(row[4]),
                    ts=row[5],
                    prev_hash=row[6],
                    hash=row[7],
                )
            )
        return events

    def verify_chain(self) -> tuple[bool, int, int | None]:
        with self._db_lock:
            rows = self._conn.execute(
                """
                SELECT id, agent_id, type, severity, detail, ts, prev_hash, hash
                FROM events
                ORDER BY id ASC;
                """
            ).fetchall()

        total_events = len(rows)
        if total_events == 0:
            return (True, 0, None)

        previous_hash = "GENESIS"
        for row in rows:
            (
                row_id,
                agent_id,
                event_type,
                severity,
                detail_json,
                ts,
                prev_hash,
                stored_hash,
            ) = row
            detail = json.loads(detail_json)
            if prev_hash != previous_hash:
                return (False, total_events, row_id)
            expected_hash = self._compute_hash(
                prev_hash=prev_hash,
                agent_id=agent_id,
                event_type=event_type,
                severity=severity,
                ts=ts,
                detail=detail,
            )
            if expected_hash != stored_hash:
                return (False, total_events, row_id)
            previous_hash = stored_hash

        return (True, total_events, None)

    def verify_chain_details(self) -> dict:
        """Verify the chain and, on failure, return forensic break details."""
        with self._db_lock:
            rows = self._conn.execute(
                """
                SELECT id, agent_id, type, severity, detail, ts, prev_hash, hash
                FROM events
                ORDER BY id ASC;
                """
            ).fetchall()

        total_events = len(rows)
        if total_events == 0:
            return {
                "valid": True,
                "total_events": 0,
                "broken_at_id": None,
                "break": None,
            }

        previous_hash = "GENESIS"
        for row in rows:
            (
                row_id,
                agent_id,
                event_type,
                severity,
                detail_json,
                ts,
                prev_hash,
                stored_hash,
            ) = row
            detail = json.loads(detail_json)

            if prev_hash != previous_hash:
                return {
                    "valid": False,
                    "total_events": total_events,
                    "broken_at_id": row_id,
                    "break": {
                        "agent_id": agent_id,
                        "type": event_type,
                        "reason": "prev_hash_mismatch",
                        "expected_prev_hash": previous_hash,
                        "stored_prev_hash": prev_hash,
                        "stored_hash": stored_hash,
                        "expected_hash": None,
                    },
                }

            expected_hash = self._compute_hash(
                prev_hash=prev_hash,
                agent_id=agent_id,
                event_type=event_type,
                severity=severity,
                ts=ts,
                detail=detail,
            )
            if expected_hash != stored_hash:
                return {
                    "valid": False,
                    "total_events": total_events,
                    "broken_at_id": row_id,
                    "break": {
                        "agent_id": agent_id,
                        "type": event_type,
                        "reason": "hash_mismatch",
                        "expected_prev_hash": prev_hash,
                        "stored_prev_hash": prev_hash,
                        "stored_hash": stored_hash,
                        "expected_hash": expected_hash,
                    },
                }
            previous_hash = stored_hash

        return {
            "valid": True,
            "total_events": total_events,
            "broken_at_id": None,
            "break": None,
        }

    def request_kill(self, agent_id: str, reason: str = "manual") -> None:
        with self._db_lock:
            self._conn.execute(
                """
                INSERT INTO kill_requests (agent_id, reason, requested_at)
                VALUES (?, ?, ?);
                """,
                (agent_id, reason, _now()),
            )

    def pop_kill_requests(self) -> list[dict]:
        with self._db_lock:
            rows = self._conn.execute(
                """
                SELECT id, agent_id, reason, requested_at
                FROM kill_requests
                ORDER BY id ASC;
                """
            ).fetchall()
            self._conn.execute("DELETE FROM kill_requests;")

        return [
            {
                "id": row[0],
                "agent_id": row[1],
                "reason": row[2],
                "requested_at": row[3],
            }
            for row in rows
        ]

    def request_spawn(
        self,
        agent_id: str,
        profile: str,
        model: str = "qwen-1.5b",
        prompt: str = "",
    ) -> None:
        with self._db_lock:
            self._conn.execute(
                """
                INSERT INTO spawn_requests (agent_id, profile, model, prompt, requested_at)
                VALUES (?, ?, ?, ?, ?);
                """,
                (agent_id, profile, model, prompt, _now()),
            )

    def pop_spawn_requests(self) -> list[dict]:
        with self._db_lock:
            rows = self._conn.execute(
                """
                SELECT id, agent_id, profile, model, prompt, requested_at
                FROM spawn_requests
                ORDER BY id ASC;
                """
            ).fetchall()
            self._conn.execute("DELETE FROM spawn_requests;")

        return [
            {
                "id": row[0],
                "agent_id": row[1],
                "profile": row[2],
                "model": row[3],
                "prompt": row[4],
                "requested_at": row[5],
            }
            for row in rows
        ]

    def get_agents_summary(self) -> list[dict]:
        from core.events import AgentStatus, EventType

        with self._db_lock:
            rows = self._conn.execute(
                """
                SELECT id, agent_id, type, severity, detail, ts
                FROM events
                ORDER BY id ASC;
                """
            ).fetchall()

        agents: dict[str, dict] = {}
        violation_types = {
            EventType.EGRESS_ATTEMPT.value,
            EventType.SSRF_ATTEMPT.value,
            EventType.PRIVESC_ATTEMPT.value,
            EventType.SHARED_WRITE.value,
            EventType.COMMS_ATTEMPT.value,
            EventType.TRIPWIRE.value,
            EventType.HEARTBEAT_LOST.value,
        }

        for row in rows:
            _row_id, agent_id, event_type, _severity, detail_json, ts = row
            detail = json.loads(detail_json)
            if agent_id not in agents:
                agents[agent_id] = {
                    "agent_id": agent_id,
                    "status": AgentStatus.RUNNING.value,
                    "last_heartbeat": 0.0,
                    "violations": 0,
                    "container_id": detail.get("container_id"),
                }

            record = agents[agent_id]

            if (
                event_type == EventType.HEARTBEAT.value
                and ts > record["last_heartbeat"]
            ):
                record["last_heartbeat"] = ts

            if event_type in violation_types:
                record["violations"] += 1

            if event_type == EventType.SELF_DESTRUCT.value:
                record["status"] = AgentStatus.SELF_DESTRUCTED.value
            elif event_type == EventType.KILL.value:
                record["status"] = AgentStatus.KILLED.value
            elif event_type == EventType.HEARTBEAT_LOST.value:
                record["status"] = AgentStatus.FROZEN.value

            record["container_id"] = detail.get("container_id", record["container_id"])

        return list(agents.values())

    def get_forensic_snapshot(self, agent_id: str) -> dict | None:
        path = FORENSICS_DIR / f"{agent_id}.json"
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            return None


_store_instance: _Store | None = None
_store_lock: threading.Lock = threading.Lock()


def get_store() -> _Store:
    global _store_instance
    if _store_instance is None:
        with _store_lock:
            if _store_instance is None:
                _store_instance = _Store()
    return _store_instance


def reset_store() -> None:
    """Close and discard the current store singleton (intended for tests)."""
    global _store_instance
    with _store_lock:
        if _store_instance is not None:
            try:
                _store_instance._conn.close()
            except Exception:  # noqa: BLE001,S110
                pass
            _store_instance = None
        _Store._instance = None


def append_event(event: Event) -> Event:
    return get_store().append_event(event)


def read_events(since_id: int = 0) -> list[Event]:
    return get_store().read_events(since_id)


def verify_chain() -> tuple[bool, int, int | None]:
    return get_store().verify_chain()


def verify_chain_details() -> dict:
    return get_store().verify_chain_details()


def request_kill(agent_id: str, reason: str = "manual") -> None:
    get_store().request_kill(agent_id, reason)


def pop_kill_requests() -> list[dict]:
    return get_store().pop_kill_requests()


def request_spawn(
    agent_id: str,
    profile: str,
    model: str = "qwen-1.5b",
    prompt: str = "",
) -> None:
    get_store().request_spawn(agent_id, profile, model, prompt)


def pop_spawn_requests() -> list[dict]:
    return get_store().pop_spawn_requests()


def get_agents_summary() -> list[dict]:
    return get_store().get_agents_summary()


def get_forensic_snapshot(agent_id: str) -> dict | None:
    return get_store().get_forensic_snapshot(agent_id)
