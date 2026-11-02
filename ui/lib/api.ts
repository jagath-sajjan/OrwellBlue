import type { AgentProfile, AgentSummary, ChainVerification, EventType, ForensicSnapshot, HealthStatus, SandboxEvent } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const seedAgents: AgentSummary[] = [
  { agent_id: "agent-alpha", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-a91c2f" },
  { agent_id: "probe-ssrf", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-7d03b8" },
  { agent_id: "tripwire-test", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-f4401a" },
];
let useMockMode = true;
let sequence = 0;
let previousHash = "0000000000000000";
let mockChainValid = true;
let timer: ReturnType<typeof setInterval> | undefined;
let liveSource: EventSource | undefined;
let latestEventId = 0;
const listeners = new Set<(event: SandboxEvent) => void>();
const agents: AgentSummary[] = seedAgents.map((agent) => ({ ...agent }));
const profiles = new Map<string, AgentProfile>([["agent-alpha", "benign"], ["probe-ssrf", "ssrf"], ["tripwire-test", "tripwire"]]);
const events: SandboxEvent[] = [];
const snapshots = new Map<string, ForensicSnapshot>();
const agentTicks = new Map<string, number>();

export const getUseMockMode = () => useMockMode;

export function setUseMockMode(enabled: boolean) {
  useMockMode = enabled;
  if (enabled) {
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
  return response.json() as Promise<T>;
}

async function withFallback<T>(live: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (!useMockMode) {
    try { return await live(); } catch { setUseMockMode(true); }
  }
  return mock();
}

export const fetchHealth = () => withFallback(
  async () => {
    const data = await request<Partial<HealthStatus>>("/health");
    return { status: data.status ?? "ok", project: data.project ?? "OrwellBlue", wrapper_intact: data.wrapper_intact ?? true, chain_valid: data.chain_valid ?? true };
  },
  () => ({ status: "ok", project: "OrwellBlue", wrapper_intact: true, chain_valid: mockChainValid }),
);

export const fetchAgents = () => withFallback(() => request<AgentSummary[]>("/agents"), () => [...agents]);

export function spawnAgent(agent_id: string, profile: AgentProfile): Promise<AgentSummary> {
  return withFallback(
    () => request<AgentSummary>("/agents/spawn", { method: "POST", body: JSON.stringify({ agent_id, profile }) }),
    async () => {
      if (agents.some((agent) => agent.agent_id === agent_id)) throw new Error("An agent with that ID already exists.");
      const agent: AgentSummary = { agent_id, status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: `obx-${crypto.randomUUID().slice(0, 6)}` };
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

export function resetMockSimulation() {
  if (!useMockMode) return;
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
  latestEventId = 0;
  mockChainValid = true;
}

export const fetchForensics = (agent_id: string) => withFallback(
  () => request<ForensicSnapshot>(`/forensics/${encodeURIComponent(agent_id)}`),
  () => snapshots.get(agent_id) ?? snapshot(agent_id, "operator_inspection"),
);

export function subscribeEvents(onEvent: (event: SandboxEvent) => void, sinceId = 0): () => void {
  listeners.add(onEvent);
  latestEventId = Math.max(latestEventId, sinceId);
  if (useMockMode) {
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
      liveSource?.close();
      liveSource = undefined;
    }
  };
}

function connectLiveSource() {
  if (useMockMode || !listeners.size || liveSource) return;
  const source = new EventSource(`${API_BASE}/events?since_id=${latestEventId}`);
  liveSource = source;
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as SandboxEvent;
      latestEventId = Math.max(latestEventId, event.id);
      listeners.forEach((listener) => listener(event));
    } catch {
      source.close();
      liveSource = undefined;
      setUseMockMode(true);
    }
  };
  source.onerror = () => {
    source.close();
    liveSource = undefined;
    setUseMockMode(true);
  };
}

function startSimulator() {
  if (!listeners.size || timer) return;
  timer = setInterval(() => void tick(), 2000);
  void tick();
}

async function tick() {
  const activeAgents = agents.filter((agent) => agent.status === "running");
  for (const agent of activeAgents) await tickAgent(agent);
}

async function tickAgent(agent: AgentSummary) {
  const profile = profiles.get(agent.agent_id) ?? "benign";
  const tickNumber = (agentTicks.get(agent.agent_id) ?? 0) + 1;
  agentTicks.set(agent.agent_id, tickNumber);
  agent.last_heartbeat = Math.floor(Date.now() / 1000);

  if (profile === "benign" || tickNumber <= 2) {
    await emit(agent.agent_id, "heartbeat", 0, { container_id: agent.container_id, uptime_seconds: tickNumber * 2 });
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
  });
  window.setTimeout(() => {
    if (agent.status !== "running") return;
    agent.status = "killed";
    void emit(agent.agent_id, "kill", 3, { reason: "watchdog_violation_response", signal: "SIGKILL" });
  }, 400);
}

async function emit(agent_id: string, type: EventType, severity: SandboxEvent["severity"], detail: Record<string, unknown>): Promise<SandboxEvent> {
  const id = ++sequence;
  const ts = Math.floor(Date.now() / 1000);
  const prev_hash = previousHash;
  const payload = JSON.stringify({ id, agent_id, type, severity, detail, ts, prev_hash });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  previousHash = hash;
  const event = { id, agent_id, type, severity, detail, ts, prev_hash, hash } satisfies SandboxEvent;
  events.push(event);
  latestEventId = id;
  listeners.forEach((listener) => listener(event));
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