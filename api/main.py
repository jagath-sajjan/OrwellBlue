"""FastAPI contract for the OrwellBlue backend."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from core.events import Event, EventType
from core.store import (
    append_event,
    get_agents_summary,
    get_forensic_snapshot,
    read_events,
    request_kill,
    request_spawn,
    verify_chain,
)

app = FastAPI(title="OrwellBlue")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SpawnPayload(BaseModel):
    agent_id: str
    profile: str


class KillPayload(BaseModel):
    reason: str = "manual_operator_kill"


@app.get("/health")
def health() -> dict[str, object]:
    valid, _total, _broken = verify_chain()
    return {
        "status": "ok",
        "project": "OrwellBlue",
        "wrapper_intact": True,
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


@app.post("/agents/spawn")
def spawn(payload: SpawnPayload) -> dict[str, object]:
    request_spawn(payload.agent_id, payload.profile)
    append_event(
        Event(
            agent_id=payload.agent_id,
            type=EventType.INFO,
            detail={"action": "spawn_request", "profile": payload.profile},
        )
    )
    return {
        "queued": True,
        "agent_id": payload.agent_id,
        "profile": payload.profile,
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
    valid, total, broken_id = verify_chain()
    return {
        "valid": valid,
        "total_events": total,
        "broken_at_id": broken_id,
    }


@app.get("/forensics/{agent_id}")
def forensics(agent_id: str) -> dict:
    snapshot = get_forensic_snapshot(agent_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Forensic snapshot not found")
    return snapshot
