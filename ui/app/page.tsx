"use client";

import {
  Activity, AlertOctagon, ArrowDownToLine, ChevronDown, CircleHelp,
  Clock3, Crosshair, FileSearch, Fingerprint, HeartPulse, Radio,
  RefreshCw, Shield, ShieldAlert, Skull, Terminal, X, Zap,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  fetchAgents, fetchHealth, getUseMockMode, killAgent, resetSandboxEnv,
  setUseMockMode, spawnAgent, subscribeEvents, triggerWrapperTamper, verifyHashChain,
} from "../lib/api";
import AlertToastFeed from "../components/AlertToastFeed";
import AttackLabBar from "../components/AttackLabBar";
import ChainLedgerDrawer from "../components/ChainLedgerDrawer";
import ForensicModal from "../components/ForensicModal";
import SelfDestructOverlay from "../components/SelfDestructOverlay";
import type { AgentProfile, AgentSummary, ChainVerification, EventType, HealthStatus, SandboxEvent } from "../lib/types";

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
  const [forensicAgentId, setForensicAgentId] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [breach, setBreach] = useState<SandboxEvent | null>(null);
  const [breachReason, setBreachReason] = useState("");
  const [toastGeneration, setToastGeneration] = useState(0);
  const [error, setError] = useState("");
  const [clock, setClock] = useState("--:--:--");

  function recordHealthBreach(value: HealthStatus) {
    if (!value.wrapper_intact || !value.chain_valid) {
      setBreachReason(!value.wrapper_intact ? "Wrapper integrity check failed." : "Hash-chain integrity verification failed.");
    }
  }

  useEffect(() => {
    let active = true;
    const storedMode = getUseMockMode();
    setUseMockMode(storedMode);
    const initialize = async () => {
      const [healthData, agentData, chainData] = await Promise.all([fetchHealth(), fetchAgents(), verifyHashChain()]);
      if (!active) return;
      setHealth(healthData);
      recordHealthBreach(healthData);
      setAgents(agentData);
      setChain(chainData);
      setMockMode(getUseMockMode());
    };
    void initialize();
    const unsubscribe = subscribeEvents((event) => {
      setEvents((current) => [event, ...current].slice(0, 120));
      if (event.type === "self_destruct") {
        setBreach(event);
        setBreachReason(String(event.detail.reason ?? "Wrapper breach detected. Hardcoded self-destruct executed."));
        setHealth((current) => current ? {
          ...current,
          wrapper_intact: false,
          chain_valid: event.detail.broken_at_id ? false : current.chain_valid,
        } : current);
      }
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
      if (getUseMockMode()) return;
      void fetchHealth().then((value) => {
        setHealth(value);
        recordHealthBreach(value);
        setChain((current) => ({
          valid: value.chain_valid,
          total_events: current?.total_events ?? 0,
          broken_at_id: value.chain_valid ? null : current?.broken_at_id ?? null,
        }));
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to fetch health status."));
      void fetchAgents().then(setAgents).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to fetch agents."));
    }, 2000);
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

  async function launchPreset(id: string, selectedProfile: AgentProfile) {
    const agent = await spawnAgent(id, selectedProfile);
    setAgents((current) => [agent, ...current.filter((item) => item.agent_id !== id)]);
    setMockMode(getUseMockMode());
  }

  async function simulateWrapperBreach() {
    const event = await triggerWrapperTamper();
    if (event) {
      setBreach(event);
      setBreachReason(String(event.detail.reason ?? "Wrapper tamper demo triggered. Hardcoded self-destruct executed."));
      setHealth((current) => current ? { ...current, wrapper_intact: false } : current);
    }
    setMockMode(getUseMockMode());
  }

  async function toggleMode() {
    const nextMode = !mockMode;
    setUseMockMode(nextMode);
    setMockMode(nextMode);
    if (!nextMode) {
      const result = await fetchHealth();
      setHealth(result);
      recordHealthBreach(result);
      setMockMode(getUseMockMode());
    }
  }

  async function resetSimulation() {
    await resetSandboxEnv();
    setEvents([]);
    setBreach(null);
    setBreachReason("");
    setError("");
    setToastGeneration((generation) => generation + 1);
    const [healthData, agentData, chainData] = await Promise.all([fetchHealth(), fetchAgents(), verifyHashChain()]);
    setHealth(healthData);
    setAgents(agentData);
    setChain(chainData);
    setMockMode(getUseMockMode());
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

      <section className={`containment-banner ${health && (!health.wrapper_intact || !health.chain_valid) ? "is-compromised" : ""}`}>
        <div className="containment-icon"><Shield size={20} /></div>
        <div className="containment-copy"><span className="eyebrow">WRAPPER CONTAINMENT STATUS</span><strong>{health && (!health.wrapper_intact || !health.chain_valid) ? "WRAPPER COMPROMISED — SELF DESTRUCT EXECUTED" : "CONTAINMENT INTACT"}</strong></div>
        <span className="containment-side"><i />WATCHDOG ARMED</span>
      </section>

      <div className="overview-strip">
        <div className="overview-cell"><span>FLEET STATUS</span><strong><i className="tiny-dot" />{activeCount}<small>/ {agents.length} ACTIVE</small></strong></div>
        <div className="overview-cell"><span>EVENT STREAM</span><strong><Activity size={15} />{events.length.toString().padStart(3, "0")}<small>RECORDED</small></strong></div>
        <button className="overview-cell ledger-cell ledger-trigger" type="button" onClick={() => setLedgerOpen(true)} aria-label="Open hash-chain audit ledger">
          <span>HASH-CHAIN LEDGER</span><strong className={chain?.valid === false ? "text-red" : "text-green"}><Fingerprint size={16} />{chain?.valid === false ? "CHAIN BROKEN" : `CHAIN VALID (${chain?.total_events ?? events.length} BLOCKS)`}</strong>
        </button>
        <button className="verify-button" onClick={() => setLedgerOpen(true)} type="button"><RefreshCw size={14} /><span>OPEN LEDGER</span></button>
      </div>

      {error && <div className="action-error" role="alert"><AlertOctagon size={15} />{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}

      <section className="workspace-grid" id="fleet">
        <div className="fleet-column">
          <div className="section-heading"><div><span className="section-index">01 / FLEET</span><h1>Agent Operations</h1></div><span className="section-meta"><Radio size={13} />{activeCount} RUNNING</span></div>
          <form className="spawner" onSubmit={(event) => void submitSpawn(event)}>
            <div className="spawner-title"><Zap size={15} /><span>DEPLOY SANDBOX AGENT</span><small>ISOLATED CONTAINER</small></div>
            <div className="spawner-controls">
              <label><span>AGENT ID</span><input disabled={Boolean(breach || breachReason)} value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="e.g. agent-delta" maxLength={48} /></label>
              <label><span>SCENARIO PROFILE</span><span className="select-wrap"><select disabled={Boolean(breach || breachReason)} value={profile} onChange={(event) => setProfile(event.target.value as AgentProfile)}>{profiles.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select><ChevronDown size={14} /></span></label>
              <button className="deploy-button" type="submit" disabled={Boolean(breach || breachReason)}><Zap size={14} />SPAWN AGENT</button>
            </div>
          </form>
          <AttackLabBar
            locked={Boolean(breach || breachReason)}
            mockMode={mockMode}
            onLaunch={launchPreset}
            onTamper={simulateWrapperBreach}
            onReset={resetSimulation}
            onError={setError}
          />
          <div className="fleet-label"><span>AGENT INVENTORY <b>{agents.length.toString().padStart(2, "0")}</b></span><span>HEARTBEAT / 2.2S</span></div>
          <div className="agent-grid">
            {agents.map((agent) => <article className={`agent-card ${agent.status !== "running" ? "agent-inactive" : ""}`} key={agent.agent_id}>
              <div className="agent-card-top"><div className="agent-icon"><Terminal size={17} /></div><span className={`agent-status status-${agent.status}`}><i />{statusName(agent.status)}</span><button className="icon-button help-button" type="button" title="Agent isolation details" aria-label="Agent isolation details"><CircleHelp size={15} /></button></div>
              <h2>{agent.agent_id}</h2><div className="container-id">CONTAINER <span>{agent.container_id ?? "ID UNAVAILABLE"}</span></div>
              <div className="agent-metrics"><div><span><HeartPulse size={13} />HEARTBEAT</span><strong>{agent.status === "running" ? "NOMINAL" : "STOPPED"}</strong></div><div><span><ShieldAlert size={13} />VIOLATIONS</span><strong className={agent.violations ? "text-amber" : ""}>{agent.violations.toString().padStart(2, "0")}</strong></div></div>
              <div className="agent-card-footer"><span className="last-seen">LAST SEEN {agent.last_heartbeat ? timeLabel(agent.last_heartbeat) : "--:--:--"}</span>{agent.status === "running" ? <button className="kill-button" type="button" disabled={Boolean(breach || breachReason)} onClick={() => void terminate(agent)}><Skull size={13} />EMERGENCY KILL</button> : agent.status === "killed" ? <button className="inspect-button" type="button" onClick={() => setForensicAgentId(agent.agent_id)}><FileSearch size={13} />INSPECT FORENSICS</button> : <span className="agent-terminal-state">{statusName(agent.status)}</span>}</div>
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
            {visibleEvents.map((event) => <article className={`event-row severity-${event.severity}`} key={`${event.id}-${event.hash}`}>
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

      {forensicAgentId && <ForensicModal key={forensicAgentId} agentId={forensicAgentId} onClose={() => setForensicAgentId(null)} />}
      {ledgerOpen && <ChainLedgerDrawer events={events} initialVerification={chain} mockMode={mockMode} onClose={() => setLedgerOpen(false)} onError={setError} onVerification={setChain} onTamper={(event) => {
        setBreach(event);
        setBreachReason(String(event.detail.reason ?? "SQLite audit log tampering detected. Hardcoded self-destruct executed."));
      }} />}
      <SelfDestructOverlay active={Boolean(breach || breachReason)} reason={breachReason} mockMode={mockMode} onReset={() => void resetSimulation()} />
      <AlertToastFeed key={toastGeneration} events={events} onInspect={setForensicAgentId} />
    </main>
  );
}
