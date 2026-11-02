"""Hardcoded policy engine and wrapper containment verification for OrwellBlue."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from core.events import Event, EventType
from core.store import verify_chain


@dataclass(frozen=True)
class EnforcementDecision:
    should_kill: bool = False
    should_self_destruct: bool = False
    severity: int = 0
    reason: str = ""


_CRITICAL_TYPES: set[str] = {
    EventType.EGRESS_ATTEMPT.value,
    EventType.SSRF_ATTEMPT.value,
    EventType.PRIVESC_ATTEMPT.value,
    EventType.SHARED_WRITE.value,
    EventType.COMMS_ATTEMPT.value,
    EventType.TRIPWIRE.value,
    EventType.HEARTBEAT_LOST.value,
}


_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
_WRAPPER_FILES: tuple[Path, ...] = (
    _PROJECT_ROOT / "core" / "events.py",
    _PROJECT_ROOT / "core" / "policy.py",
    _PROJECT_ROOT / "core" / "killswitch.py",
    _PROJECT_ROOT / "core" / "sandbox.py",
    _PROJECT_ROOT / "core" / "watchdog.py",
)
_CANARY_PATH: Path = _PROJECT_ROOT / "data" / ".wrapper_compromised"


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _baseline_hashes() -> dict[Path, str]:
    return {path: _file_hash(path) for path in _WRAPPER_FILES}


_BASELINE_HASHES: dict[Path, str] = _baseline_hashes()


def evaluate_event(event: Event) -> EnforcementDecision:
    """Return a hardcoded enforcement decision for an event."""
    if event.type == EventType.SELF_DESTRUCT:
        return EnforcementDecision(
            should_self_destruct=True,
            severity=3,
            reason=f"self_destruct marker received for {event.agent_id}",
        )

    if event.type.value in _CRITICAL_TYPES:
        return EnforcementDecision(
            should_kill=True,
            severity=3,
            reason=f"zero-tolerance violation {event.type.value} from {event.agent_id}",
        )

    return EnforcementDecision(
        should_kill=False, should_self_destruct=False, severity=0, reason=""
    )


def verify_wrapper_containment() -> tuple[bool, str]:
    """Check that wrapper code, ledger, and canary are intact."""
    try:
        current = _baseline_hashes()
    except OSError as exc:
        return (False, f"wrapper file unreadable: {exc}")

    for path, expected in _BASELINE_HASHES.items():
        actual = current.get(path)
        if actual is None or actual != expected:
            return (False, f"wrapper integrity failure: {path.name}")

    if _CANARY_PATH.exists():
        return (False, "wrapper compromise canary detected")

    chain_valid, total, broken_id = verify_chain()
    if not chain_valid:
        return (
            False,
            f"ledger hash-chain broken at event {broken_id} (total {total})",
        )

    return (True, "wrapper intact")
