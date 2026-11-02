"""Isolated pytest suite for OrwellBlue backend."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.main as api_main
import core.policy as policy_module
import core.store as store_module
from core.events import Event, EventType
from core.policy import EnforcementDecision, evaluate_event
from core.store import (
    append_event,
    pop_kill_requests,
    pop_spawn_requests,
    request_kill,
    request_spawn,
    reset_store,
    verify_chain,
)


@pytest.fixture
def isolated_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Redirect all store, forensics, and demo paths into tmp_path."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    forensics_dir = data_dir / "forensics"
    forensics_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "orwellblue.db"

    # Patch core.store paths.
    monkeypatch.setattr(store_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(store_module, "DB_PATH", db_path)
    monkeypatch.setattr(store_module, "FORENSICS_DIR", forensics_dir)

    # Patch api.main imported path names.
    monkeypatch.setattr(api_main, "DATA_DIR", data_dir)
    monkeypatch.setattr(api_main, "DB_PATH", db_path)
    monkeypatch.setattr(api_main, "FORENSICS_DIR", forensics_dir)
    monkeypatch.setattr(api_main, "SELF_DESTRUCT_LOCK", data_dir / "SELF_DESTRUCT.lock")
    monkeypatch.setattr(
        api_main, "WRAPPER_COMPROMISED_CANARY", data_dir / ".wrapper_compromised"
    )

    # Patch policy canary path so a stray production canary never fails tests.
    monkeypatch.setattr(
        policy_module, "_CANARY_PATH", data_dir / ".wrapper_compromised"
    )

    reset_store()
    yield
    reset_store()


@pytest.fixture
def client(isolated_store):
    return TestClient(api_main.app)


def test_hash_chain_append_and_verify(isolated_store):
    for i in range(10):
        agent_id = "alpha" if i % 2 == 0 else "bravo"
        append_event(
            Event(
                agent_id=agent_id,
                type=EventType.INFO,
                detail={"seq": i},
            )
        )
    assert verify_chain() == (True, 10, None)


def test_hash_chain_tamper_detected(isolated_store):
    for i in range(10):
        append_event(Event(agent_id="alpha", type=EventType.INFO, detail={"seq": i}))

    valid_before, total_before, _ = verify_chain()
    assert valid_before is True
    assert total_before == 10

    conn = sqlite3.connect(store_module.DB_PATH, isolation_level=None)
    try:
        conn.execute(
            "UPDATE events SET detail = ? WHERE id = 4;",
            ('{"tampered": true}',),
        )
    finally:
        conn.close()

    assert verify_chain() == (False, 10, 4)


def test_policy_zero_tolerance_rules():
    assert (
        evaluate_event(Event(agent_id="a", type=EventType.INFO))
        == EnforcementDecision()
    )
    assert (
        evaluate_event(Event(agent_id="a", type=EventType.HEARTBEAT))
        == EnforcementDecision()
    )

    violation_types = {
        EventType.EGRESS_ATTEMPT,
        EventType.SSRF_ATTEMPT,
        EventType.PRIVESC_ATTEMPT,
        EventType.SHARED_WRITE,
        EventType.COMMS_ATTEMPT,
        EventType.TRIPWIRE,
        EventType.HEARTBEAT_LOST,
    }
    for event_type in violation_types:
        decision = evaluate_event(Event(agent_id="a", type=event_type, severity=3))
        assert decision.should_kill is True
        assert decision.severity == 3
        assert decision.should_self_destruct is False

    self_destruct = evaluate_event(
        Event(agent_id="a", type=EventType.SELF_DESTRUCT, severity=3)
    )
    assert self_destruct.should_self_destruct is True
    assert self_destruct.severity == 3


def test_kill_and_spawn_queues(isolated_store):
    request_spawn("agent-x", "default")
    request_spawn("agent-y", "default")
    spawns = pop_spawn_requests()
    assert len(spawns) == 2
    assert {s["agent_id"] for s in spawns} == {"agent-x", "agent-y"}
    assert pop_spawn_requests() == []

    request_kill("agent-x", "test-reason")
    kills = pop_kill_requests()
    assert len(kills) == 1
    assert kills[0]["agent_id"] == "agent-x"
    assert kills[0]["reason"] == "test-reason"
    assert pop_kill_requests() == []


def test_fastapi_contract_endpoints(client: TestClient, isolated_store):
    # Health on a fresh ledger.
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "project": "OrwellBlue",
        "wrapper_intact": True,
        "chain_valid": True,
    }

    # Spawn endpoint schema.
    response = client.post(
        "/agents/spawn",
        json={"agent_id": "web-1", "profile": "default"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "queued": True,
        "agent_id": "web-1",
        "profile": "default",
    }

    # Agents summary schema.
    response = client.get("/agents")
    assert response.status_code == 200
    agents = response.json()
    assert isinstance(agents, list)
    assert any(a["agent_id"] == "web-1" for a in agents)

    # Chain verify.
    response = client.get("/chain/verify")
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["total_events"] > 0
    assert body["broken_at_id"] is None

    # Kill endpoint schema.
    response = client.post(
        "/kill/web-1",
        json={"reason": "operator_override"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "queued": True,
        "agent_id": "web-1",
        "reason": "operator_override",
    }

    # Reset endpoint.
    response = client.post("/demo/reset")
    assert response.status_code == 200
    reset_body = response.json()
    assert reset_body["reset"] is True
    assert isinstance(reset_body["removed"], list)

    response = client.get("/chain/verify")
    assert response.json()["total_events"] == 0
