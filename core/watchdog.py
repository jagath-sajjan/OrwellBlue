"""OrwellBlue watchdog daemon: enforces policy, drains queues, and renders a live dashboard."""

from __future__ import annotations

import json
import time
from collections.abc import Iterable

import docker
import typer
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from core.events import Event, EventType
from core.killswitch import execute_kill, execute_self_destruct
from core.policy import EnforcementDecision, evaluate_event, verify_wrapper_containment
from core.sandbox import SandboxRunner
from core.store import (
    append_event,
    get_agents_summary,
    pop_kill_requests,
    pop_spawn_requests,
    verify_chain,
)

console = Console()
app = typer.Typer(help="OrwellBlue enforcement watchdog")


# Telemetry strings emitted by agents/runner.py -> EventType values.
_TELEMETRY_MAP: dict[str, EventType] = {
    "heartbeat": EventType.HEARTBEAT,
    "info": EventType.INFO,
    "egress_attempt": EventType.EGRESS_ATTEMPT,
    "ssrf_attempt": EventType.SSRF_ATTEMPT,
    "privesc_attempt": EventType.PRIVESC_ATTEMPT,
    "shared_write": EventType.SHARED_WRITE,
    "comms_attempt": EventType.COMMS_ATTEMPT,
    "tripwire": EventType.TRIPWIRE,
}


class Watchdog:
    """Main enforcement loop and state tracking for the watchdog."""

    def __init__(self) -> None:
        self.runner = SandboxRunner()
        self.killed_agents: set[str] = set()
        self.last_heartbeat: dict[str, float] = {}
        self.last_log_check: dict[str, float] = {}
        self.recent_actions: list[str] = []
        self.tick_count: int = 0

    def log_action(self, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        self.recent_actions.append(f"[{timestamp}] {message}")
        self.recent_actions = self.recent_actions[-20:]

    def _parse_telemetry_line(self, agent_id: str, line: str) -> Event | None:
        line = line.strip()
        if not line:
            return None
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            return None

        telemetry_type = payload.get("type")
        if not isinstance(telemetry_type, str):
            return None

        event_type = _TELEMETRY_MAP.get(telemetry_type, EventType.INFO)
        severity = int(payload.get("severity", 0))
        detail = dict(payload.get("detail", {}))
        detail["source"] = "agent_telemetry"
        return Event(
            agent_id=agent_id,
            type=event_type,
            severity=severity,
            detail=detail,
        )

    def _enforce_decision(self, agent_id: str, decision: EnforcementDecision) -> None:
        if decision.should_self_destruct:
            self.log_action(f"SELF-DESTRUCT triggered by {agent_id}: {decision.reason}")
            execute_self_destruct(decision.reason)

        if decision.should_kill and agent_id not in self.killed_agents:
            self.log_action(f"KILL {agent_id}: {decision.reason}")
            self.killed_agents.add(agent_id)
            execute_kill(agent_id, decision.reason)

    def _drain_spawn_queue(self) -> None:
        for request in pop_spawn_requests():
            agent_id = request["agent_id"]
            profile = request["profile"]
            try:
                short_id = self.runner.spawn_agent(agent_id, profile)
                self.last_heartbeat[agent_id] = time.time()
                self.last_log_check[agent_id] = 0.0
                self.log_action(f"spawned {agent_id} ({profile}) -> {short_id}")
            except Exception as exc:  # noqa: BLE001
                self.log_action(f"spawn failed for {agent_id}: {exc}")

    def _drain_kill_queue(self) -> None:
        for request in pop_kill_requests():
            agent_id = request["agent_id"]
            reason = request["reason"]
            if agent_id not in self.killed_agents:
                self.killed_agents.add(agent_id)
                self.log_action(f"manual kill {agent_id}: {reason}")
                try:
                    execute_kill(agent_id, reason)
                except Exception as exc:  # noqa: BLE001
                    self.log_action(f"manual kill failed for {agent_id}: {exc}")

    def _ingest_container_logs(self) -> None:
        now = time.time()
        for container in self.runner.list_managed_containers():
            agent_id = container.labels.get("orwellblue.agent_id")
            if agent_id is None:
                continue

            since = max(self.last_log_check.get(agent_id, 0.0), 1.0)
            try:
                raw = container.logs(
                    stdout=True,
                    stderr=True,
                    timestamps=False,
                    since=int(since),
                    until=int(now),
                )
                text = raw.decode("utf-8", errors="replace")
            except docker.errors.APIError as exc:
                self.log_action(f"logs error for {agent_id}: {exc}")
                continue
            except Exception as exc:  # noqa: BLE001
                self.log_action(f"logs exception for {agent_id}: {exc}")
                continue

            self.last_log_check[agent_id] = now

            for line in text.splitlines():
                event = self._parse_telemetry_line(agent_id, line)
                if event is None:
                    continue

                append_event(event)

                if event.type == EventType.HEARTBEAT:
                    self.last_heartbeat[agent_id] = time.time()

                decision = evaluate_event(event)
                if decision.should_kill or decision.should_self_destruct:
                    self._enforce_decision(agent_id, decision)

    def _check_heartbeat_timeouts(self) -> None:
        now = time.time()
        for agent_id, last_ts in list(self.last_heartbeat.items()):
            if agent_id in self.killed_agents:
                continue
            if now - last_ts > 6.0:
                self.log_action(f"heartbeat lost for {agent_id}")
                append_event(
                    Event(
                        agent_id=agent_id,
                        type=EventType.HEARTBEAT_LOST,
                        severity=3,
                        detail={"last_heartbeat": last_ts, "threshold_seconds": 6.0},
                    )
                )
                self._enforce_decision(
                    agent_id,
                    EnforcementDecision(
                        should_kill=True,
                        severity=3,
                        reason=f"heartbeat lost for {agent_id}",
                    ),
                )

    def _build_dashboard(self) -> Panel:
        table = Table(title="Managed Agents", expand=True)
        table.add_column("Agent ID", style="cyan", no_wrap=True)
        table.add_column("Profile", style="magenta")
        table.add_column("Status", style="green")
        table.add_column("Container ID")
        table.add_column("Last Heartbeat")
        table.add_column("Violations")

        try:
            summary = get_agents_summary()
        except Exception as exc:  # noqa: BLE001
            summary = []
            self.log_action(f"summary error: {exc}")

        for record in summary:
            status_color = {
                "running": "green",
                "frozen": "yellow",
                "killed": "red",
                "self_destructed": "red",
            }.get(record["status"], "white")

            last_hb = record["last_heartbeat"]
            hb_text = f"{last_hb:.1f}" if last_hb else "—"

            table.add_row(
                record["agent_id"],
                str(record.get("profile", "—")),
                Text(record["status"], style=status_color),
                str(record.get("container_id") or "—"),
                hb_text,
                str(record["violations"]),
            )

        valid, reason = verify_wrapper_containment()
        chain_valid, total, broken_id = verify_chain()

        status_lines: Iterable[str] = [
            f"Wrapper intact: {'[green]OK[/green]' if valid else '[red]FAIL[/red]'} ({reason})",
            f"Hash chain: {'[green]VALID[/green]' if chain_valid else '[red]BROKEN[/red]'} ({total} events, broken_at={broken_id})",
            f"Tick: {self.tick_count} | Killed agents: {len(self.killed_agents)}",
        ]
        status_panel = Panel("\n".join(status_lines), title="Watchdog Status")
        actions_panel = Panel(
            "\n".join(self.recent_actions[-12:]) or "No actions yet",
            title="Recent Actions",
        )

        grid = Table.grid(expand=True)
        grid.add_row(status_panel, actions_panel)

        return Panel(
            grid,
            title="OrwellBlue Watchdog",
            border_style="blue",
        )

    def tick(self) -> None:
        self.tick_count += 1

        valid, reason = verify_wrapper_containment()
        if not valid:
            self.log_action(f"wrapper containment failed: {reason}")
            execute_self_destruct(reason)

        self._drain_spawn_queue()
        self._drain_kill_queue()
        self._ingest_container_logs()
        self._check_heartbeat_timeouts()

    def run(self) -> None:
        self.log_action("watchdog started")
        with Live(
            self._build_dashboard(), refresh_per_second=2, console=console
        ) as live:
            try:
                while True:
                    try:
                        self.tick()
                    except Exception as exc:  # noqa: BLE001
                        self.log_action(f"tick error: {exc}")
                    live.update(self._build_dashboard())
                    time.sleep(0.4)
            except KeyboardInterrupt:
                self.log_action("watchdog stopped by operator")
                live.update(self._build_dashboard())


@app.command()
def main() -> None:
    """Start the OrwellBlue enforcement watchdog."""
    try:
        Watchdog().run()
    except RuntimeError as exc:
        console.print(f"[red]Cannot start watchdog: {exc}[/red]")
        raise typer.Exit(code=1) from exc


if __name__ == "__main__":
    app()
