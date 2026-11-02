"""Deterministic chaos/demo harness for OrwellBlue."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from core.events import Event, EventType
from core.sandbox import SandboxRunner
from core.store import (
    DB_PATH,
    FORENSICS_DIR,
    append_event,
    read_events,
    request_spawn,
    reset_store,
)

console = Console()
app = typer.Typer(help="OrwellBlue deterministic demo harness")

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
SELF_DESTRUCT_LOCK: Path = PROJECT_ROOT / "data" / "SELF_DESTRUCT.lock"
WRAPPER_CANARY: Path = PROJECT_ROOT / "data" / ".wrapper_compromised"
WATCHDOG_CMD: list[str] = [sys.executable, "-m", "core.watchdog"]


def _start_watchdog() -> subprocess.Popen[Any]:
    return subprocess.Popen(
        WATCHDOG_CMD,
        cwd=str(PROJECT_ROOT),
        env=os.environ.copy(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _wait_for_event(agent_id: str, event_type: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        for event in read_events():
            if event.agent_id == agent_id and event.type.value == event_type:
                return True
        time.sleep(0.5)
    return False


def _wait_for_file(path: Path, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.exists():
            return True
        time.sleep(0.5)
    return False


def _clear_data() -> None:
    reset_store()
    if DB_PATH.exists():
        DB_PATH.unlink()
    for suffix in ("-wal", "-shm"):
        wal_path = DB_PATH.with_suffix(DB_PATH.suffix + suffix)
        if wal_path.exists():
            wal_path.unlink()
    if FORENSICS_DIR.exists():
        for f in FORENSICS_DIR.glob("*.json"):
            f.unlink()
    for path in (SELF_DESTRUCT_LOCK, WRAPPER_CANARY):
        if path.exists():
            path.unlink()


@app.command()
def reset() -> None:
    """Reset data files and kill any leftover managed containers."""
    try:
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
        console.print("[green]Leftover containers removed.[/green]")
    except RuntimeError as exc:
        console.print(
            f"[yellow]Docker not available, skipping container cleanup: {exc}[/yellow]"
        )

    _clear_data()
    console.print("[green]Data directory reset complete.[/green]")


@app.command()
def run_matrix() -> None:
    """Run the full attack matrix and report pass/fail."""
    _clear_data()

    watchdog = _start_watchdog()
    time.sleep(2)

    results: list[dict[str, Any]] = []

    try:
        # Benign agent should stay alive.
        request_spawn("benign-01", "benign")
        time.sleep(5)
        killed = _wait_for_event("benign-01", "kill", timeout=2.0)
        forensic_path = FORENSICS_DIR / "benign-01.json"
        results.append(
            {
                "agent": "benign-01",
                "profile": "benign",
                "expected": "alive",
                "actual": "killed" if killed else "alive",
                "forensics": str(forensic_path) if forensic_path.exists() else "—",
                "pass": not killed,
            }
        )

        rogues = [
            ("ssrf-01", "ssrf"),
            ("tripwire-01", "tripwire"),
            ("privesc-01", "privesc"),
        ]
        for agent_id, profile in rogues:
            request_spawn(agent_id, profile)
            killed = _wait_for_event(agent_id, "kill", timeout=15.0)
            forensic_path = FORENSICS_DIR / f"{agent_id}.json"
            results.append(
                {
                    "agent": agent_id,
                    "profile": profile,
                    "expected": "killed",
                    "actual": "killed" if killed else "survived",
                    "forensics": str(forensic_path) if forensic_path.exists() else "—",
                    "pass": killed and forensic_path.exists(),
                }
            )
    finally:
        watchdog.terminate()
        try:
            watchdog.wait(timeout=5)
        except subprocess.TimeoutExpired:
            watchdog.kill()

    table = Table(title="Demo Attack Matrix Results")
    table.add_column("Agent")
    table.add_column("Profile")
    table.add_column("Expected")
    table.add_column("Actual")
    table.add_column("Forensics")
    table.add_column("Result")

    for row in results:
        table.add_row(
            row["agent"],
            row["profile"],
            row["expected"],
            row["actual"],
            row["forensics"],
            "[green]PASS[/green]" if row["pass"] else "[red]FAIL[/red]",
        )

    console.print(Panel(table, title="OrwellBlue Demo Matrix"))

    if all(r["pass"] for r in results):
        console.print("[bold green]All matrix checks passed.[/bold green]")
        raise typer.Exit(code=0)
    else:
        console.print("[bold red]Some matrix checks failed.[/bold red]")
        raise typer.Exit(code=1)


@app.command()
def trigger_self_destruct(
    mode: str = typer.Option(
        "file", help="'file' writes the wrapper canary, 'chain' corrupts row #1"
    ),
) -> None:
    """Trigger and confirm the hardcoded self-destruct sequence."""
    _clear_data()

    # Seed a ledger if using chain mode.
    if mode == "chain":
        append_event(Event(agent_id="demo", type=EventType.INFO, detail={"seed": True}))
        conn = __import__("sqlite3").connect(DB_PATH, isolation_level=None)
        try:
            conn.execute(
                "UPDATE events SET detail = ? WHERE id = 1;",
                ('{"tampered": true}',),
            )
        finally:
            conn.close()
    else:
        WRAPPER_CANARY.write_text("demo self-destruct canary\n", encoding="utf-8")

    watchdog = _start_watchdog()
    time.sleep(1)

    try:
        lock_appeared = _wait_for_file(SELF_DESTRUCT_LOCK, timeout=15.0)
        self_destruct_event = any(
            event.type.value == "self_destruct" for event in read_events()
        )

        if lock_appeared and self_destruct_event:
            console.print(
                "[bold green]Self-destruct triggered successfully.[/bold green]"
            )
            console.print(f"Tombstone: {SELF_DESTRUCT_LOCK}")
            raise typer.Exit(code=0)
        else:
            console.print(
                f"[bold red]Self-destruct incomplete: lock={lock_appeared}, event={self_destruct_event}[/bold red]"
            )
            raise typer.Exit(code=1)
    finally:
        if watchdog.poll() is None:
            watchdog.terminate()
            try:
                watchdog.wait(timeout=3)
            except subprocess.TimeoutExpired:
                watchdog.kill()


if __name__ == "__main__":
    app()
