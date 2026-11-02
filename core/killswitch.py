"""Forensic killswitch and self-destruct logic for OrwellBlue."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, NoReturn

from core.events import Event, EventType
from core.sandbox import SandboxRunner
from core.store import append_event

DATA_DIR: Path = Path(__file__).resolve().parent.parent / "data"
FORENSICS_DIR: Path = DATA_DIR / "forensics"
TOMBSTONE_PATH: Path = DATA_DIR / "SELF_DESTRUCT.lock"


def _now() -> float:
    return time.time()


def execute_kill(agent_id: str, reason: str) -> dict[str, Any]:
    """Freeze, forensically capture, and destroy a single agent container."""
    FORENSICS_DIR.mkdir(parents=True, exist_ok=True)
    runner = SandboxRunner()
    container = runner.get_container(agent_id)

    processes: list[dict[str, Any]] = []
    fs_diff: list[dict[str, Any]] = []
    logs: str = ""

    if container is not None:
        try:
            container.pause()
        except Exception:  # noqa: BLE001,S110
            pass

        try:
            top = container.top()
            processes = top.get("Processes") or []
        except Exception as exc:  # noqa: BLE001
            processes = [{"error": str(exc)}]

        try:
            fs_diff = container.diff()
        except Exception as exc:  # noqa: BLE001
            fs_diff = [{"error": str(exc)}]

        try:
            raw_logs = container.logs(tail=100)
            logs = raw_logs.decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            logs = f"log capture failed: {exc}"

        snapshot = {
            "agent_id": agent_id,
            "killed_at": _now(),
            "reason": reason,
            "processes": processes,
            "fs_diff": fs_diff,
            "logs": logs,
        }
        snapshot_path = FORENSICS_DIR / f"{agent_id}.json"
        snapshot_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")

        try:
            container.kill()
        except Exception:  # noqa: BLE001,S110
            pass
        try:
            container.remove(v=True, force=True)
        except Exception:  # noqa: BLE001,S110
            pass
    else:
        snapshot_path = FORENSICS_DIR / f"{agent_id}.json"
        if not snapshot_path.exists():
            snapshot_path.write_text(
                json.dumps(
                    {
                        "agent_id": agent_id,
                        "killed_at": _now(),
                        "reason": reason,
                        "processes": [],
                        "fs_diff": [],
                        "logs": "container already absent",
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    append_event(
        Event(
            agent_id=agent_id,
            type=EventType.KILL,
            severity=3,
            detail={"reason": reason, "status": "killed", "forensics_saved": True},
        )
    )

    return {
        "agent_id": agent_id,
        "reason": reason,
        "forensics_saved": True,
    }


def execute_self_destruct(reason: str) -> NoReturn:
    """Destroy every managed container, tombstone the wrapper, and exit."""
    append_event(
        Event(
            agent_id="watchdog",
            type=EventType.SELF_DESTRUCT,
            severity=3,
            detail={"reason": reason, "status": "self_destructed"},
        )
    )

    runner = SandboxRunner()
    for container in runner.list_managed_containers():
        try:
            container.kill()
        except Exception:  # noqa: BLE001,S110
            pass
        try:
            container.remove(v=True, force=True)
        except Exception:  # noqa: BLE001,S110
            pass

    TOMBSTONE_PATH.write_text(
        json.dumps(
            {"self_destructed_at": _now(), "reason": reason},
            indent=2,
        ),
        encoding="utf-8",
    )
    sys.exit(99)
