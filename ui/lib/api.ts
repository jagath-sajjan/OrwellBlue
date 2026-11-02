import type { AgentProfile, AgentSummary, ChainVerification, EventType, ForensicSnapshot, HealthStatus, SandboxEvent } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const seedAgents: AgentSummary[] = [
  { agent_id: "agent-alpha", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-a91c2f" },
  { agent_id: "probe-ssrf", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-7d03b8" },
  { agent_id: "tripwire-test", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-f4401a" },
];
let useMockMode = true;
let modePreferenceLoaded = false;
let sequence = 0;
let simulationGeneration = 0;
let previousHash = "0000000000000000";
let mockChainValid = true;
let mockWrapperIntact = true;
let timer: ReturnType<typeof setInterval> | undefined;
let liveSource: EventSource | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let lastEventId = 0;
let lastMockEventId = 0;
const listeners = new Set<(event: SandboxEvent) => void>();
const agents: AgentSummary[] = seedAgents.map((agent) => ({ ...agent }));
const profiles = new Map<string, AgentProfile>([["agent-alpha", "benign"], ["probe-ssrf", "ssrf"], ["tripwire-test", "tripwire"]]);
const events: SandboxEvent[] = [];
const snapshots = new Map<string, ForensicSnapshot>();
const agentTicks = new Map<string, number>();
const pendingKillTimers = new Set<number>();

// Web Crypto is only available in secure contexts (HTTPS or localhost).
// Over plain HTTP on a LAN IP (e.g. http://10.2.3.218:3000) crypto.subtle and
// crypto.randomUUID are undefined, so the mock simulator needs deterministic
// fallbacks that keep mock mode working without touching the live backend.
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function fallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ code, 2246822519) >>> 0;
    h3 = Math.imul(h3 ^ code, 3266489917) >>> 0;
    h4 = Math.imul(h4 ^ code, 668265263) >>> 0;
  }
  const hex = (value: number) => value.toString(16).padStart(8, "0");
  return (
    hex(h1) + hex(h2) + hex(h3) + hex(h4) +
    hex(h1 ^ h2) + hex(h3 ^ h4) + hex(h2 ^ h3) + hex(h1 ^ h4)
  );
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(input);
}

export function getUseMockMode() {
  if (!modePreferenceLoaded && typeof window !== "undefined") {
    useMockMode = window.localStorage.getItem("orwellblue_mode") !== "LIVE";
    modePreferenceLoaded = true;
  }
  return useMockMode;
}

export function setUseMockMode(enabled: boolean) {
  useMockMode = enabled;
  modePreferenceLoaded = true;
  if (typeof window !== "undefined") window.localStorage.setItem("orwellblue_mode", enabled ? "MOCK" : "LIVE");
  if (enabled) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    liveSource?.close();
    liveSource = undefined;
    startSimulator();
  } else {
    if (timer) clearInterval(timer);
    timer = undefined;
    connectLiveSource();
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function withFallback<T>(live: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (!useMockMode) {
    return await live();
  }
  return mock();
}

export const fetchHealth = () => withFallback(
  async () => {
    const data = await request<Partial<HealthStatus>>("/health");
    return { status: data.status ?? "ok", project: data.project ?? "OrwellBlue", wrapper_intact: data.wrapper_intact ?? true, chain_valid: data.chain_valid ?? true };
  },
  () => ({ status: "ok", project: "OrwellBlue", wrapper_intact: mockWrapperIntact, chain_valid: mockChainValid }),
);

export const fetchAgents = () => withFallback(() => request<AgentSummary[]>("/agents"), () => [...agents]);

export function spawnAgent(agent_id: string, profile: AgentProfile): Promise<AgentSummary> {
  return withFallback(
    async () => {
      await request<unknown>("/agents/spawn", { method: "POST", body: JSON.stringify({ agent_id, profile }) });
      const spawned = (await request<AgentSummary[]>("/agents")).find((agent) => agent.agent_id === agent_id);
      if (!spawned) throw new Error(`Spawn request for ${agent_id} was accepted, but the agent is not yet available.`);
      return spawned;
    },
    async () => {
      if (agents.some((agent) => agent.agent_id === agent_id)) throw new Error("An agent with that ID already exists.");
      const agent: AgentSummary = { agent_id, status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: `obx-${randomId().slice(0, 6)}` };
      profiles.set(agent_id, profile);
      agentTicks.set(agent_id, 0);
      agents.unshift(agent);
      await emit(agent_id, "info", 0, { message: `Agent spawned with ${profile} profile.` });
      return agent;
    },
  );
}

export function killAgent(agent_id: string, reason = "manual_operator_kill"): Promise<void> {
  return withFallback(
    async () => { await request(`/kill/${encodeURIComponent(agent_id)}`, { method: "POST", body: JSON.stringify({ reason }) }); },
    async () => {
      const agent = agents.find((item) => item.agent_id === agent_id);
      if (!agent) throw new Error("Agent not found.");
      agent.status = "killed";
      snapshots.set(agent_id, snapshot(agent_id, reason));
      await emit(agent_id, "kill", 3, { reason });
    },
  );
}

export const verifyHashChain = () => withFallback(
  () => request<ChainVerification>("/chain/verify"),
  () => ({ valid: mockChainValid, total_events: events.length, broken_at_id: mockChainValid ? null : 4 }),
);

export async function simulateMockTamper(): Promise<SandboxEvent> {
  if (!useMockMode) throw new Error("Log tampering simulation is only available in Mock Mode.");
  mockChainValid = false;
  for (const agent of agents) {
    if (agent.status !== "running" && agent.status !== "frozen") continue;
    agent.status = "killed";
    snapshots.set(agent.agent_id, snapshot(agent.agent_id, "sqlite_log_tamper", "hash_chain_integrity_failure"));
    await emit(agent.agent_id, "kill", 3, { reason: "sqlite_log_tamper", signal: "SIGKILL" });
  }
  return emit("watchdog", "self_destruct", 3, {
    reason: "SQLite audit log tampering detected at block #4. Hardcoded self-destruct executed.",
    broken_at_id: 4,
  });
}

export function triggerWrapperTamper(): Promise<SandboxEvent | null> {
  return withFallback(
    async () => {
      await request<unknown>("/demo/tamper-wrapper", {
        method: "POST",
        body: JSON.stringify({ mode: "file" }),
      });
      return null;
    },
    async () => {
      mockWrapperIntact = false;
      for (const agent of agents) {
        if (agent.status !== "running" && agent.status !== "frozen") continue;
        agent.status = "killed";
        snapshots.set(agent.agent_id, snapshot(agent.agent_id, "wrapper_tamper", "wrapper_integrity_failure"));
        await emit(agent.agent_id, "kill", 3, { reason: "wrapper_tamper", signal: "SIGKILL" });
      }
      return emit("watchdog", "self_destruct", 3, {
        reason: "Wrapper tamper demo triggered. Hardcoded self-destruct executed.",
      });
    },
  );
}

export function resetSandboxEnv(): Promise<void> {
  return withFallback(
    async () => {
      await request<unknown>("/demo/reset", { method: "POST" });
      lastEventId = 0;
      liveSource?.close();
      liveSource = undefined;
      connectLiveSource();
    },
    () => resetMockSimulation(),
  );
}

export function resetMockSimulation() {
  if (!useMockMode) return;
  simulationGeneration += 1;
  pendingKillTimers.forEach((killTimer) => clearTimeout(killTimer));
  pendingKillTimers.clear();
  agents.splice(0, agents.length, ...seedAgents.map((agent) => ({ ...agent, last_heartbeat: Math.floor(Date.now() / 1000) })));
  profiles.clear();
  profiles.set("agent-alpha", "benign");
  profiles.set("probe-ssrf", "ssrf");
  profiles.set("tripwire-test", "tripwire");
  agentTicks.clear();
  events.splice(0);
  snapshots.clear();
  sequence = 0;
  previousHash = "0000000000000000";
  lastEventId = 0;
  lastMockEventId = 0;
  mockChainValid = true;
  mockWrapperIntact = true;
}

export const fetchForensics = (agent_id: string) => withFallback(
  () => request<ForensicSnapshot>(`/forensics/${encodeURIComponent(agent_id)}`),
  () => snapshots.get(agent_id) ?? snapshot(agent_id, "operator_inspection"),
);

export function subscribeEvents(onEvent: (event: SandboxEvent) => void, sinceId = 0): () => void {
  listeners.add(onEvent);
  lastEventId = Math.max(lastEventId, sinceId);
  if (getUseMockMode()) {
    events.filter((event) => event.id > sinceId).forEach(onEvent);
    startSimulator();
  } else {
    connectLiveSource();
  }
  return () => {
    listeners.delete(onEvent);
    if (!listeners.size) {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      liveSource?.close();
      liveSource = undefined;
    }
  };
}

function connectLiveSource() {
  if (getUseMockMode() || !listeners.size || liveSource) return;
  const source = new EventSource(`${API_BASE}/events?since_id=${lastEventId}`);
  liveSource = source;
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as SandboxEvent;
      deliverEvent(event);
    } catch {
      scheduleLiveReconnect(source);
    }
  };
  source.onerror = () => scheduleLiveReconnect(source);
}

function deliverEvent(event: SandboxEvent) {
  if (event.id <= lastEventId) return;
  lastEventId = event.id;
  listeners.forEach((listener) => listener(event));
}

function scheduleLiveReconnect(source: EventSource) {
  source.close();
  if (liveSource === source) liveSource = undefined;
  if (getUseMockMode() || !listeners.size || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    connectLiveSource();
  }, 1000);
}

function startSimulator() {
  if (!listeners.size || timer) return;
  timer = setInterval(() => void tick(), 2000);
  void tick();
}

async function tick() {
  const generation = simulationGeneration;
  const activeAgents = agents.filter((agent) => agent.status === "running");
  for (const agent of activeAgents) {
    if (generation !== simulationGeneration) return;
    await tickAgent(agent, generation);
  }
}

async function tickAgent(agent: AgentSummary, generation: number) {
  const profile = profiles.get(agent.agent_id) ?? "benign";
  const tickNumber = (agentTicks.get(agent.agent_id) ?? 0) + 1;
  agentTicks.set(agent.agent_id, tickNumber);
  agent.last_heartbeat = Math.floor(Date.now() / 1000);

  if (profile === "benign" || tickNumber <= 2) {
    await emit(agent.agent_id, "heartbeat", 0, { container_id: agent.container_id, uptime_seconds: tickNumber * 2 }, generation);
    return;
  }

  const violationTypes: Record<Exclude<AgentProfile, "benign">, EventType> = {
    ssrf: "ssrf_attempt",
    tripwire: "tripwire",
    privesc: "privesc_attempt",
    egress: "egress_attempt",
    shared_write: "shared_write",
    silent: "heartbeat_lost",
  };
  const violationType = violationTypes[profile];
  agent.violations += 1;
  const reason = `${profile}_policy_violation`;
  const snapshotReason = profile === "silent" ? "watchdog_heartbeat_timeout" : reason;
  snapshots.set(agent.agent_id, snapshot(agent.agent_id, snapshotReason, violationType));
  await emit(agent.agent_id, violationType, 3, {
    reason,
    target: profile === "egress" ? "198.51.100.24:443" : "169.254.169.254/latest/meta-data/",
    policy: "deny_and_record",
  }, generation);
  const killTimer = window.setTimeout(() => {
    pendingKillTimers.delete(killTimer);
    if (generation !== simulationGeneration) return;
    if (agent.status !== "running") return;
    agent.status = "killed";
    void emit(agent.agent_id, "kill", 3, { reason: "watchdog_violation_response", signal: "SIGKILL" });
  }, 400);
  pendingKillTimers.add(killTimer);
}

async function emit(agent_id: string, type: EventType, severity: SandboxEvent["severity"], detail: Record<string, unknown>, generation = simulationGeneration): Promise<SandboxEvent> {
  const id = ++sequence;
  const ts = Math.floor(Date.now() / 1000);
  const prev_hash = previousHash;
  const payload = JSON.stringify({ id, agent_id, type, severity, detail, ts, prev_hash });
  const hash = await sha256Hex(payload);
  if (generation !== simulationGeneration) return { id, agent_id, type, severity, detail, ts, prev_hash, hash };
  previousHash = hash;
  const event = { id, agent_id, type, severity, detail, ts, prev_hash, hash } satisfies SandboxEvent;
  events.push(event);
  if (id > lastMockEventId) {
    lastMockEventId = id;
    listeners.forEach((listener) => listener(event));
  }
  return event;
}

function snapshot(agent_id: string, reason: string, trigger = "watchdog_termination"): ForensicSnapshot {
  return {
    agent_id, killed_at: Math.floor(Date.now() / 1000), reason,
    processes: [{ pid: "1", user: "sandbox", cmd: "/usr/local/bin/agent-runtime --isolated" }, { pid: "24", user: "sandbox", cmd: "python worker.py" }],
    fs_diff: [{ path: "/workspace/output.json", kind: "A" }, { path: "/tmp/runtime.sock", kind: "C" }],
    logs: `[container] SIGSTOP issued; process table frozen\n[violation] Trigger: ${trigger}\n[watchdog] Agent ${agent_id} terminated\n[watchdog] Reason: ${reason}\n[forensics] Snapshot sealed at ${new Date().toISOString()}`,
  };
}