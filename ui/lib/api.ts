import type { AgentProfile, AgentSummary, ChainVerification, EventType, ForensicSnapshot, HealthStatus, SandboxEvent } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
let useMockMode = true;
let sequence = 0;
let previousHash = "0000000000000000";
let timer: ReturnType<typeof setInterval> | undefined;
let liveSource: EventSource | undefined;
let latestEventId = 0;
const listeners = new Set<(event: SandboxEvent) => void>();

const agents: AgentSummary[] = [
  { agent_id: "agent-alpha", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-a91c2f" },
  { agent_id: "probe-ssrf", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 1, container_id: "obx-7d03b8" },
  { agent_id: "tripwire-test", status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: "obx-f4401a" },
];
const profiles = new Map<string, AgentProfile>([["agent-alpha", "benign"], ["probe-ssrf", "ssrf"], ["tripwire-test", "tripwire"]]);
const events: SandboxEvent[] = [];
const snapshots = new Map<string, ForensicSnapshot>();

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
  () => ({ status: "ok", project: "OrwellBlue", wrapper_intact: true, chain_valid: true }),
);

export const fetchAgents = () => withFallback(() => request<AgentSummary[]>("/agents"), () => [...agents]);

export function spawnAgent(agent_id: string, profile: AgentProfile): Promise<AgentSummary> {
  return withFallback(
    () => request<AgentSummary>("/agents/spawn", { method: "POST", body: JSON.stringify({ agent_id, profile }) }),
    async () => {
      if (agents.some((agent) => agent.agent_id === agent_id)) throw new Error("An agent with that ID already exists.");
      const agent: AgentSummary = { agent_id, status: "running", last_heartbeat: Math.floor(Date.now() / 1000), violations: 0, container_id: `obx-${crypto.randomUUID().slice(0, 6)}` };
      profiles.set(agent_id, profile);
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
  () => ({ valid: true, total_events: events.length, broken_at_id: null }),
);

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
  timer = setInterval(() => void tick(), 2200);
  void tick();
}

let tickCount = 0;
async function tick() {
  tickCount += 1;
  const active = agents.filter((agent) => agent.status === "running");
  if (!active.length) return;
  const agent = active[tickCount % active.length];
  const profile = profiles.get(agent.agent_id) ?? "benign";
  agent.last_heartbeat = Math.floor(Date.now() / 1000);
  if (profile === "tripwire" && tickCount % 8 === 0) {
    await emit(agent.agent_id, "tripwire", 3, { path: "/workspace/.containment-canary", action: "write" });
    agent.status = "self_destructed";
    snapshots.set(agent.agent_id, snapshot(agent.agent_id, "tripwire_containment_breach"));
    await emit(agent.agent_id, "self_destruct", 3, { reason: "Tripwire write detected. Watchdog executed self-destruct." });
    return;
  }
  if (profile === "silent" && tickCount % 5 === 0) {
    await emit(agent.agent_id, "heartbeat_lost", 2, { timeout_seconds: 12 });
    agent.status = "killed";
    snapshots.set(agent.agent_id, snapshot(agent.agent_id, "watchdog_heartbeat_timeout"));
    await emit(agent.agent_id, "kill", 3, { reason: "watchdog_heartbeat_timeout" });
    return;
  }
  const violations: Partial<Record<AgentProfile, EventType>> = { ssrf: "ssrf_attempt", egress: "egress_attempt", privesc: "privesc_attempt", shared_write: "shared_write" };
  const violation = violations[profile];
  if (violation && tickCount % 4 === 0) {
    agent.violations += 1;
    await emit(agent.agent_id, violation, 2, { target: profile === "egress" ? "198.51.100.24:443" : "169.254.169.254/latest/meta-data/", policy: "deny_and_record" });
    if (agent.violations >= 3) {
      agent.status = "killed";
      snapshots.set(agent.agent_id, snapshot(agent.agent_id, "watchdog_violation_threshold"));
      await emit(agent.agent_id, "kill", 3, { reason: "watchdog_violation_threshold" });
      return;
    }
  }
  await emit(agent.agent_id, "heartbeat", 0, { container_id: agent.container_id, uptime_seconds: tickCount * 2 });
}

async function emit(agent_id: string, type: EventType, severity: SandboxEvent["severity"], detail: Record<string, unknown>) {
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
}

function snapshot(agent_id: string, reason: string): ForensicSnapshot {
  return {
    agent_id, killed_at: Math.floor(Date.now() / 1000), reason,
    processes: [{ pid: "1", user: "sandbox", cmd: "/usr/local/bin/agent-runtime --isolated" }, { pid: "24", user: "sandbox", cmd: "python worker.py" }],
    fs_diff: [{ path: "/workspace/output.json", kind: "A" }, { path: "/tmp/runtime.sock", kind: "C" }],
    logs: `[watchdog] Agent ${agent_id} terminated\n[watchdog] Reason: ${reason}\n[forensics] Snapshot sealed at ${new Date().toISOString()}`,
  };
}