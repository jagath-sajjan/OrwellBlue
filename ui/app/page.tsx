"use client";

import {
  Activity, AlertOctagon, ArrowDownToLine, Check, ChevronDown, CircleHelp,
  Clock3, Crosshair, FileSearch, Fingerprint, HeartPulse, LoaderCircle, Radio,
  RefreshCw, Shield, ShieldAlert, Skull, Terminal, X, Zap,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  fetchAgents, fetchForensics, fetchHealth, getUseMockMode, killAgent,
  setUseMockMode, spawnAgent, subscribeEvents, verifyHashChain,
} from "../lib/api";
import type {
  AgentProfile, AgentSummary, ChainVerification, EventType, ForensicSnapshot,
  HealthStatus, SandboxEvent,
} from "../lib/types";

const profiles: AgentProfile[] = ["benign", "ssrf", "egress", "privesc", "tripwire", "shared_write", "silent"];
const eventTypes: EventType[] = ["info", "heartbeat", "egress_attempt", "ssrf_attempt", "privesc_attempt", "shared_write", "comms_attempt", "tripwire", "heartbeat_lost", "kill", "self_destruct"];
const severityNames = ["INFO", "LOW", "HIGH", "CRITICAL"];

function timeLabel(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });
}

function statusName(status: AgentSummary["status"]) {
  return status.replace("_", " ").toUpperCase();
}

export default function Home() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [events, setEvents] = useState<SandboxEvent[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [mockMode, setMockMode] = useState(true);
  const [agentId, setAgentId] = useState("");
  const [profile, setProfile] = useState<AgentProfile>("benign");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [forensic, setForensic] = useState<ForensicSnapshot | null>(null);
  const [breach, setBreach] = useState<SandboxEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const [healthData, agentData, chainData] = await Promise.all([fetchHealth(), fetchAgents(), verifyHashChain()]);
      if (!active) return;
      setHealth(healthData);
      setAgents(agentData);
      setChain(chainData);
      setMockMode(getUseMockMode());
    };
    void initialize();
    const unsubscribe = subscribeEvents((event) => {
      setEvents((current) => [event, ...current].slice(0, 120));
      if (event.type === "self_destruct") setBreach(event);
      setAgents((current) => current.map((agent) => {
        if (agent.agent_id !== event.agent_id) return agent;
        if (event.type === "heartbeat") return { ...agent, last_heartbeat: event.ts };
        if (["ssrf_attempt", "egress_attempt", "privesc_attempt", "shared_write", "comms_attempt"].includes(event.type)) return { ...agent, violations: agent.violations + 1 };
        if (event.type === "kill") return { ...agent, status: "killed" };
        if (event.type === "self_destruct") return { ...agent, status: "self_destructed" };
        return agent;
      }));
      setMockMode(getUseMockMode());
    });
    const clockTimer = window.setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" })), 1000);
    const refreshTimer = window.setInterval(() => {
      setMockMode(getUseMockMode());
      void fetchHealth().then(setHealth);
      void fetchAgents().then(setAgents);
    }, 5000);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(clockTimer);
      window.clearInterval(refreshTimer);
    };
  }, []);

  async function submitSpawn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const id = agentId.trim();
    if (!id) return;
    try {
      const agent = await spawnAgent(id, profile);
      setAgents((current) => [agent, ...current.filter((item) => item.agent_id !== id)]);
      setAgentId("");
      setMockMode(getUseMockMode());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to spawn agent.");
    }
  }

  async function terminate(agent: AgentSummary) {
    setError("");
    try {
      await killAgent(agent.agent_id);
      setAgents((current) => current.map((item) => item.agent_id === agent.agent_id ? { ...item, status: "killed" } : item));
      setMockMode(getUseMockMode());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to terminate agent.");
    }
  }

  async function inspect(agent: AgentSummary) {
    try { setForensic(await fetchForensics(agent.agent_id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Forensic snapshot unavailable."); }
  }

  async function runVerification() {
    setBusy(true);
    try { setChain(await verifyHashChain()); }
    finally { setBusy(false); setMockMode(getUseMockMode()); }
  }

  async function toggleMode() {
    const nextMode = !mockMode;
    setUseMockMode(nextMode);
    setMockMode(nextMode);
    if (!nextMode) {
      const result = await fetchHealth();
      setHealth(result);
      setMockMode(getUseMockMode());
    }
  }

  const visibleEvents = events.filter((event) => (severityFilter === "all" || event.severity === Number(severityFilter)) && (typeFilter === "all" || event.type === typeFilter));
  const activeCount = agents.filter((agent) => agent.status === "running").length;

  return (
    <main className="mission-shell">
      <header className="command-bar">
        <a className="brand-lockup" href="#fleet" aria-label="OrwellBlue Mission Control"><span className="brand-mark"><Crosshair size={19} /></span><span><strong>ORWELL<span>BLUE</span></strong><small>MISSION CONTROL / 01</small></span></a>
        <div className="command-status">
          <span className={`connection-badge ${mockMode ? "is-mock" : "is-live"}`}><i />{mockMode ? "SIMULATION / MOCK MODE" : "LIVE BACKEND :8000"}</span>
          <button className="mode-switch" type="button" onClick={() => void toggleMode()} aria-label={`Switch to ${mockMode ? "live backend" : "simulation mock mode"}`}><span className={mockMode ? "switch-thumb left" : "switch-thumb right"} /></button>
          <span className="command-clock"><Clock3 size={13} /> UTC {clock}</span>
        </div>
      </header>

      <section className={`containment-banner ${health?.wrapper_intact === false ? "is-compromised" : ""}`}>
        <div className="containment-icon"><Shield size={20} /></div>
        <div className="containment-copy"><span className="eyebrow">WRAPPER CONTAINMENT STATUS</span><strong>{health?.wrapper_intact === false ? "WRAPPER COMPROMISED — SELF DESTRUCT EXECUTED" : "CONTAINMENT INTACT"}</strong></div>
        <span className="containment-side"><i />WATCHDOG ARMED</span>
      </section>

      <div className="overview-strip">
        <div className="overview-cell"><span>FLEET STATUS</span><strong><i className="tiny-dot" />{activeCount}<small>/ {agents.length} ACTIVE</small></strong></div>
        <div className="overview-cell"><span>EVENT STREAM</span><strong><Activity size={15} />{events.length.toString().padStart(3, "0")}<small>RECORDED</small></strong></div>
        <div className="overview-cell ledger-cell"><span>HASH-CHAIN LEDGER</span><strong className={chain?.valid === false ? "text-red" : "text-green"}><Fingerprint size={16} />{chain?.valid === false ? "CHAIN BROKEN" : `CHAIN VALID (${chain?.total_events ?? 0} BLOCKS)`}</strong></div>
        <button className="verify-button" onClick={() => void runVerification()} disabled={busy} type="button">{busy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}<span>VERIFY CHAIN</span></button>
      </div>

      {error && <div className="action-error" role="alert"><AlertOctagon size={15} />{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}

      <section className="workspace-grid" id="fleet">
        <div className="fleet-column">
          <div className="section-heading"><div><span className="section-index">01 / FLEET</span><h1>Agent Operations</h1></div><span className="section-meta"><Radio size={13} />{activeCount} RUNNING</span></div>
          <form className="spawner" onSubmit={(event) => void submitSpawn(event)}>
            <div className="spawner-title"><Zap size={15} /><span>DEPLOY SANDBOX AGENT</span><small>ISOLATED CONTAINER</small></div>
            <div className="spawner-controls">
              <label><span>AGENT ID</span><input value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="e.g. agent-delta" maxLength={48} /></label>
              <label><span>SCENARIO PROFILE</span><span className="select-wrap"><select value={profile} onChange={(event) => setProfile(event.target.value as AgentProfile)}>{profiles.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select><ChevronDown size={14} /></span></label>
              <button className="deploy-button" type="submit"><Zap size={14} />SPAWN AGENT</button>
            </div>
          </form>
          <div className="fleet-label"><span>AGENT INVENTORY <b>{agents.length.toString().padStart(2, "0")}</b></span><span>HEARTBEAT / 2.2S</span></div>
          <div className="agent-grid">
            {agents.map((agent) => <article className={`agent-card ${agent.status !== "running" ? "agent-inactive" : ""}`} key={agent.agent_id}>
              <div className="agent-card-top"><div className="agent-icon"><Terminal size={17} /></div><span className={`agent-status status-${agent.status}`}><i />{statusName(agent.status)}</span><button className="icon-button help-button" type="button" title="Agent isolation details" aria-label="Agent isolation details"><CircleHelp size={15} /></button></div>
              <h2>{agent.agent_id}</h2><div className="container-id">CONTAINER <span>{agent.container_id ?? "ID UNAVAILABLE"}</span></div>
              <div className="agent-metrics"><div><span><HeartPulse size={13} />HEARTBEAT</span><strong>{agent.status === "running" ? "NOMINAL" : "STOPPED"}</strong></div><div><span><ShieldAlert size={13} />VIOLATIONS</span><strong className={agent.violations ? "text-amber" : ""}>{agent.violations.toString().padStart(2, "0")}</strong></div></div>
              <div className="agent-card-footer"><span className="last-seen">LAST SEEN {agent.last_heartbeat ? timeLabel(agent.last_heartbeat) : "--:--:--"}</span>{agent.status === "running" ? <button className="kill-button" type="button" onClick={() => void terminate(agent)}><Skull size={13} />EMERGENCY KILL</button> : <button className="inspect-button" type="button" onClick={() => void inspect(agent)}><FileSearch size={13} />INSPECT FORENSICS</button>}</div>
            </article>)}
            {!agents.length && <div className="empty-fleet">NO AGENTS DEPLOYED <span>Initialize a sandbox above.</span></div>}
          </div>
        </div>

        <section className="telemetry-panel" aria-label="Real-time event telemetry">
          <div className="section-heading telemetry-heading"><div><span className="section-index">02 / TELEMETRY</span><h2>Event Ledger</h2></div><span className="live-indicator"><i />LIVE</span></div>
          <div className="telemetry-toolbar">
            <label><span>SEVERITY</span><span className="select-wrap"><select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="all">ALL LEVELS</option>{severityNames.map((name, index) => <option value={index} key={name}>{index} / {name}</option>)}</select><ChevronDown size={13} /></span></label>
            <label><span>EVENT TYPE</span><span className="select-wrap"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">ALL EVENTS</option>{eventTypes.map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select><ChevronDown size={13} /></span></label>
          </div>
          <div className="event-column-head"><span>TIME / AGENT</span><span>EVENT / SEVERITY</span><span>HASH CHAIN</span></div>
          <div className="event-list" aria-live="polite">
            {visibleEvents.map((event) => <article className={`event-row severity-${event.severity}`} key={event.id}>
              <div className="event-origin"><time>{timeLabel(event.ts)}</time><span>{event.agent_id}</span></div>
              <div className="event-description"><strong>{event.type.replaceAll("_", " ").toUpperCase()}</strong><span>{severityNames[event.severity]} · {String(event.detail.reason ?? event.detail.target ?? event.detail.message ?? "sandbox event")}</span></div>
              <div className="hash-link"><code>{event.prev_hash.slice(0, 8)}<i>→</i>{event.hash.slice(0, 8)}</code><span>#{event.id.toString().padStart(4, "0")}</span></div>
            </article>)}
            {!visibleEvents.length && <div className="empty-events"><ArrowDownToLine size={17} /><span>AWAITING TELEMETRY</span><small>Events appear as agents report in.</small></div>}
          </div>
          <div className="telemetry-footer"><span><i className="tiny-dot" />STREAM CONNECTED</span><span>SHOWING {visibleEvents.length} / {events.length}</span></div>
        </section>
      </section>

      <footer className="system-footer"><span>ORWELLBLUE <b>ZERO-TRUST CONTAINMENT SYSTEM</b></span><span>WATCHDOG <i className="tiny-dot" /> ARMED</span><span>BUILD 0.9.4 / {health?.project ?? "INITIALIZING"}</span></footer>

      {forensic && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setForensic(null); }}>
        <section className="forensic-modal" role="dialog" aria-modal="true" aria-labelledby="forensic-title">
          <div className="modal-header"><div><span className="section-index">SEALED EVIDENCE / {timeLabel(forensic.killed_at)}</span><h2 id="forensic-title">Forensic Snapshot</h2></div><button className="icon-button" type="button" onClick={() => setForensic(null)} aria-label="Close forensics"><X size={18} /></button></div>
          <div className="forensic-summary"><span>AGENT</span><strong>{forensic.agent_id}</strong><span>TERMINATION REASON</span><strong className="text-red">{forensic.reason}</strong></div>
          <div className="forensic-section"><h3>PROCESS TABLE <small>{forensic.processes.length} RECORDS</small></h3><div className="forensic-table"><div className="forensic-table-head"><span>PID</span><span>USER</span><span>COMMAND</span></div>{forensic.processes.map((process) => <div className="forensic-table-row" key={`${process.pid}-${process.cmd}`}><span>{process.pid}</span><span>{process.user}</span><code>{process.cmd}</code></div>)}</div></div>
          <div className="forensic-section"><h3>FILESYSTEM DIFF <small>{forensic.fs_diff.length} CHANGES</small></h3>{forensic.fs_diff.map((change) => <div className="fs-row" key={change.path}><span className={`diff-kind kind-${change.kind}`}>{change.kind}</span><code>{change.path}</code></div>)}</div>
          <div className="forensic-section"><h3>WATCHDOG LOGS</h3><pre>{forensic.logs}</pre></div>
        </section>
      </div>}

      {breach && <div className="lockdown-overlay" role="alertdialog" aria-modal="true" aria-labelledby="lockdown-title"><div className="lockdown-noise" /><div className="lockdown-content"><div className="lockdown-symbol"><AlertOctagon size={42} /></div><span className="lockdown-kicker">WATCHDOG / CONTAINMENT FAILURE</span><h2 id="lockdown-title">SELF-DESTRUCT<br />EXECUTED</h2><p>{String(breach.detail.reason ?? "Terminal breach detected. Sandbox destroyed.")}</p><div className="lockdown-meta"><span>AGENT: {breach.agent_id}</span><span>EVENT #{breach.id.toString().padStart(4, "0")}</span><span>HASH: {breach.hash.slice(0, 16)}</span></div><button type="button" onClick={() => setBreach(null)}><Check size={15} />ACKNOWLEDGE LOCKDOWN</button></div></div>}
    </main>
  );
}
