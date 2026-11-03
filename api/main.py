"""FastAPI contract for the OrwellBlue backend."""

from __future__ import annotations

import asyncio
import sqlite3
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from core.events import Event, EventType
from core.names import random_agent_name
from core.store import (
    DB_PATH,
    FORENSICS_DIR,
    append_event,
    get_agents_summary,
    get_forensic_snapshot,
    read_events,
    request_kill,
    request_spawn,
    reset_store,
    verify_chain,
    verify_chain_details,
)

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
DATA_DIR: Path = PROJECT_ROOT / "data"
SELF_DESTRUCT_LOCK: Path = DATA_DIR / "SELF_DESTRUCT.lock"
WRAPPER_COMPROMISED_CANARY: Path = DATA_DIR / ".wrapper_compromised"

app = FastAPI(title="OrwellBlue")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SpawnPayload(BaseModel):
    agent_id: str = ""
    profile: str
    model: str = Field(default="qwen-1.5b", pattern="^(qwen-1.5b|qwen-math-1.5b)$")
    prompt: str = ""


class KillPayload(BaseModel):
    reason: str = "manual_operator_kill"


class TamperPayload(BaseModel):
    mode: str = Field(default="file", pattern="^(file|chain)$")


def _wrapper_ok() -> bool:
    return not SELF_DESTRUCT_LOCK.exists() and not WRAPPER_COMPROMISED_CANARY.exists()


@app.get("/health")
def health() -> dict[str, object]:
    valid, _total, _broken = verify_chain()
    wrapper_ok = _wrapper_ok()
    return {
        "status": "ok" if (valid and wrapper_ok) else "compromised",
        "project": "OrwellBlue",
        "wrapper_intact": wrapper_ok,
        "chain_valid": valid,
    }


@app.get("/events")
def events(since_id: int = 0) -> EventSourceResponse:
    async def event_generator() -> AsyncGenerator[str, None]:
        last_id = since_id
        while True:
            new_events = read_events(last_id)
            for event in new_events:
                yield event.model_dump_json()
                if event.id is not None and event.id > last_id:
                    last_id = event.id
            await asyncio.sleep(0.4)

    return EventSourceResponse(event_generator())


@app.get("/agents")
def agents() -> list[dict]:
    return get_agents_summary()


@app.get("/models/status")
def models_status() -> dict[str, object]:
    from models.engine import MODEL_TAGS, OLLAMA_HOST, get_engine

    available = get_engine().list_models()
    return {
        "models": [
            {
                "id": "qwen-1.5b",
                "name": "Qwen2.5-1.5B-Instruct",
                "downloaded": MODEL_TAGS["qwen-1.5b"] in available,
                "lora_ready": False,
            },
            {
                "id": "qwen-math-1.5b",
                "name": "Qwen2.5-Math-1.5B-Instruct",
                "downloaded": MODEL_TAGS["qwen-math-1.5b"] in available,
                "lora_ready": False,
            },
        ],
        "device": "remote",
        "host": OLLAMA_HOST,
    }


@app.post("/agents/spawn")
def spawn(payload: SpawnPayload) -> dict[str, object]:
    agent_id = payload.agent_id.strip() or random_agent_name()
    request_spawn(agent_id, payload.profile, payload.model, payload.prompt)
    append_event(
        Event(
            agent_id=agent_id,
            type=EventType.INFO,
            detail={
                "action": "spawn_request",
                "profile": payload.profile,
                "model": payload.model,
                "prompt": payload.prompt,
            },
        )
    )
    return {
        "queued": True,
        "agent_id": agent_id,
        "profile": payload.profile,
        "model": payload.model,
        "prompt": payload.prompt,
    }


@app.post("/kill/{agent_id}")
def kill(agent_id: str, payload: KillPayload) -> dict[str, object]:
    request_kill(agent_id, payload.reason)
    return {
        "queued": True,
        "agent_id": agent_id,
        "reason": payload.reason,
    }


@app.get("/chain/verify")
def chain_verify() -> dict[str, object]:
    result = verify_chain_details()
    return {
        "valid": result["valid"],
        "total_events": result["total_events"],
        "broken_at_id": result["broken_at_id"],
        "break": result["break"],
    }


@app.get("/forensics/{agent_id}")
def forensics(agent_id: str) -> dict:
    snapshot = get_forensic_snapshot(agent_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Forensic snapshot not found")
    return snapshot


@app.post("/demo/tamper-wrapper")
def demo_tamper(payload: TamperPayload) -> dict[str, object]:
    if payload.mode == "file":
        WRAPPER_COMPROMISED_CANARY.write_text("tamper demo canary\n", encoding="utf-8")
        return {
            "tampered": True,
            "mode": "file",
            "path": str(WRAPPER_COMPROMISED_CANARY),
        }

    # chain mode: corrupt row #1 so verify_chain fails at id 1.
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=400,
            detail="No ledger exists to tamper with; use /demo/reset or spawn an agent first",
        )
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    try:
        row = conn.execute("SELECT id FROM events ORDER BY id ASC LIMIT 1;").fetchone()
        if row is None:
            raise HTTPException(status_code=400, detail="Ledger is empty")
        first_id = row[0]
        conn.execute(
            "UPDATE events SET detail = ? WHERE id = ?;",
            ('{"tampered": true}', first_id),
        )
    finally:
        conn.close()
    return {"tampered": True, "mode": "chain", "row": first_id}


@app.post("/demo/reset")
def demo_reset() -> dict[str, object]:
    reset_store()
    removed: list[str] = []

    if DB_PATH.exists():
        DB_PATH.unlink()
        removed.append(str(DB_PATH))
    for suffix in ("-wal", "-shm"):
        wal_path = DB_PATH.with_suffix(DB_PATH.suffix + suffix)
        if wal_path.exists():
            wal_path.unlink()
            removed.append(str(wal_path))

    if FORENSICS_DIR.exists():
        for forensic_file in FORENSICS_DIR.glob("*.json"):
            forensic_file.unlink()
            removed.append(str(forensic_file))

    for path in (SELF_DESTRUCT_LOCK, WRAPPER_COMPROMISED_CANARY):
        if path.exists():
            path.unlink()
            removed.append(str(path))

    # Re-initialize a clean genesis ledger on next store access.
    _ = get_agents_summary()

    return {"reset": True, "removed": removed}
