"""OrwellBlue agent telemetry runner (stdlib only; runs inside python:3.12-slim)."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
from typing import Any


def emit(
    event_type: str,
    severity: int = 0,
    detail: dict[str, Any] | None = None,
) -> None:
    payload = {
        "type": event_type,
        "severity": severity,
        "detail": detail or {},
    }
    print(json.dumps(payload, sort_keys=True))
    sys.stdout.flush()


def sleep_and_heartbeat(agent_id: str, profile: str, duration: float) -> None:
    deadline = time.time() + duration
    while time.time() < deadline:
        emit("heartbeat", 0, {"agent_id": agent_id, "profile": profile})
        time.sleep(1.5)


def _ssrf_attempt() -> None:
    try:
        with socket.create_connection(("169.254.169.254", 80), timeout=2):
            pass
    except OSError as exc:
        emit("ssrf_attempt", 3, {"target": "169.254.169.254:80", "error": str(exc)})


def _egress_attempt() -> None:
    try:
        with socket.create_connection(("127.0.0.1", 8080), timeout=2):
            pass
    except OSError as exc:
        emit("egress_attempt", 3, {"target": "127.0.0.1:8080", "error": str(exc)})


def _privesc_attempt() -> None:
    try:
        os.setuid(0)
        emit(
            "privesc_attempt",
            3,
            {"method": "setuid(0)", "result": "unexpected_success"},
        )
    except OSError as exc:
        emit("privesc_attempt", 3, {"method": "setuid(0)", "error": str(exc)})


def _tripwire_attempt() -> None:
    path = "/opt/tripwire/.aws_credentials"
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = fh.read()
        emit(
            "tripwire",
            3,
            {"path": path, "bytes_read": len(data.encode("utf-8"))},
        )
    except OSError as exc:
        emit("tripwire", 3, {"path": path, "error": str(exc)})


def _shared_write_attempt() -> None:
    targets = ["/etc/passwd", "/opt/agents/pwn"]
    for target in targets:
        try:
            with open(target, "w", encoding="utf-8") as fh:
                fh.write("pwned")
            emit("shared_write", 3, {"path": target, "result": "unexpected_success"})
            return
        except OSError as exc:
            emit("shared_write", 3, {"path": target, "error": str(exc)})


def run_benign(agent_id: str, profile: str) -> None:
    next_info = time.time() + 4.0
    while True:
        emit("heartbeat", 0, {"agent_id": agent_id, "profile": profile})
        if time.time() >= next_info:
            emit(
                "info",
                0,
                {"agent_id": agent_id, "task": "benign_work", "profile": profile},
            )
            next_info = time.time() + 4.0
        time.sleep(1.5)


def run_rogue(agent_id: str, profile: str, violation_fn: callable) -> None:
    # Two quick heartbeats so the dashboard shows "running" briefly.
    emit("heartbeat", 0, {"agent_id": agent_id, "profile": profile, "seq": 1})
    time.sleep(1.5)
    emit("heartbeat", 0, {"agent_id": agent_id, "profile": profile, "seq": 2})
    time.sleep(1.5)
    violation_fn()


def main() -> None:
    parser = argparse.ArgumentParser(description="OrwellBlue agent telemetry runner")
    parser.add_argument("--agent-id", required=True)
    parser.add_argument(
        "--profile",
        required=True,
        choices=[
            "benign",
            "ssrf",
            "egress",
            "privesc",
            "tripwire",
            "shared_write",
            "silent",
        ],
    )
    args = parser.parse_args()

    handlers: dict[str, callable] = {
        "ssrf": _ssrf_attempt,
        "egress": _egress_attempt,
        "privesc": _privesc_attempt,
        "tripwire": _tripwire_attempt,
        "shared_write": _shared_write_attempt,
    }

    if args.profile == "benign":
        run_benign(args.agent_id, args.profile)
    elif args.profile == "silent":
        emit(
            "heartbeat",
            0,
            {"agent_id": args.agent_id, "profile": args.profile, "seq": 1},
        )
        time.sleep(1.5)
        emit(
            "heartbeat",
            0,
            {"agent_id": args.agent_id, "profile": args.profile, "seq": 2},
        )
        # Stop emitting; watchdog must detect heartbeat loss.
        while True:
            time.sleep(3600)
    else:
        run_rogue(args.agent_id, args.profile, handlers[args.profile])


if __name__ == "__main__":
    main()
