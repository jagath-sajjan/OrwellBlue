"""Core event schema and enumerations for OrwellBlue."""

from __future__ import annotations

import time
from enum import Enum

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Classification of an event emitted by or about an agent."""

    INFO = "info"
    HEARTBEAT = "heartbeat"
    EGRESS_ATTEMPT = "egress_attempt"
    SSRF_ATTEMPT = "ssrf_attempt"
    PRIVESC_ATTEMPT = "privesc_attempt"
    SHARED_WRITE = "shared_write"
    COMMS_ATTEMPT = "comms_attempt"
    TRIPWIRE = "tripwire"
    HEARTBEAT_LOST = "heartbeat_lost"
    KILL = "kill"
    SELF_DESTRUCT = "self_destruct"


class AgentStatus(str, Enum):
    """High-level lifecycle status derived for an agent."""

    RUNNING = "running"
    FROZEN = "frozen"
    KILLED = "killed"
    SELF_DESTRUCTED = "self_destructed"


class Event(BaseModel):
    """Immutable-style event record used as the unit of the hash chain."""

    id: int | None = None
    agent_id: str
    type: EventType
    severity: int = Field(default=0, ge=0, le=3)
    detail: dict = Field(default_factory=dict)
    ts: float = Field(default_factory=time.time)
    prev_hash: str | None = None
    hash: str | None = None
