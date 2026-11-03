/** Pure derivation of scene state from the live data layer. */
import type { AgentSummary, SandboxEvent } from "@/lib/types";

export type Status = AgentSummary["status"];

export interface Orbit {
  radius: number;
  inclination: number;
  speed: number;
  phase: number;
}

export interface SceneAgent {
  id: string;
  status: Status;
  profile: string | null;
  containerId: string | null;
  violations: number;
  lastHeartbeat: number;
  orbit: Orbit;
  graveyardSlot: number;
}

export interface Tombstone {
  id: string;
  reason: string;
  eventType: string;
  killedAt: number;
  slot: number;
}

export interface SceneModel {
  live: SceneAgent[];
  tombstones: Tombstone[];
  chainCount: number;
  breached: boolean;
  kills: number;
  latestViolation: SandboxEvent | null;
  totalAgents: number;
}

/** Deterministic 0..1 hash so layout is identical across refreshes. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function orbitFor(id: string, index = 0, total = 1): Orbit {
  const phase = total > 1 ? (index / total) * Math.PI * 2 : hashString(id) * Math.PI * 2;
  return {
    radius: 4.8,
    inclination: 0,
    speed: 0.18,
    phase,
  };
}

function shortReason(detail: Record<string, unknown>): string {
  const reason = typeof detail.reason === "string" ? detail.reason : "";
  return (
    reason
      .replace(/^zero-tolerance violation /, "")
      .replace(/^heartbeat lost for /, "heartbeat lost")
      .slice(0, 42) || "killed"
  );
}

const VIOLATION_TYPES = new Set<SandboxEvent["type"]>([
  "ssrf_attempt",
  "egress_attempt",
  "privesc_attempt",
  "shared_write",
  "comms_attempt",
  "tripwire",
  "heartbeat_lost",
]);

export function buildSceneModel(
  agents: AgentSummary[],
  events: SandboxEvent[],
  breached: boolean,
  chainCount: number,
): SceneModel {
  const killInfo = new Map<string, { reason: string; killedAt: number }>();
  const lastViolation = new Map<string, string>();
  const profiles = new Map<string, string>();

  for (const event of events) {
    if (event.type === "kill" && !killInfo.has(event.agent_id)) {
      killInfo.set(event.agent_id, {
        reason: shortReason(event.detail),
        killedAt: event.ts,
      });
    }
    if (VIOLATION_TYPES.has(event.type)) {
      lastViolation.set(event.agent_id, event.type);
    }
    if (
      event.type === "info" &&
      event.detail.action === "spawn_request" &&
      typeof event.detail.profile === "string"
    ) {
      profiles.set(event.agent_id, event.detail.profile);
    }
  }

  const live: SceneAgent[] = [];
  const tombstones: Tombstone[] = [];

  for (const agent of agents) {
    if (agent.status === "running" || agent.status === "frozen") {
      live.push({
        id: agent.agent_id,
        status: agent.status,
        profile: profiles.get(agent.agent_id) ?? null,
        containerId: agent.container_id ?? null,
        violations: agent.violations,
        lastHeartbeat: agent.last_heartbeat,
        orbit: { radius: 4.8, inclination: 0, speed: 0.18, phase: 0 },
        graveyardSlot: -1,
      });
    } else {
      const info = killInfo.get(agent.agent_id);
      tombstones.push({
        id: agent.agent_id,
        reason: info?.reason ?? "killed",
        eventType: lastViolation.get(agent.agent_id) ?? "kill",
        killedAt: info?.killedAt ?? 0,
        slot: 0,
      });
    }
  }

  // Sort live agents deterministically and distribute their orbits cleanly on the line
  live.sort((a, b) => a.id.localeCompare(b.id));
  live.forEach((agent, index) => {
    agent.orbit = orbitFor(agent.id, index, live.length);
  });

  // Sort tombstones chronologically so they line up neatly in contiguous order on the line
  tombstones.sort((a, b) => a.killedAt - b.killedAt || a.id.localeCompare(b.id));
  tombstones.forEach((tombstone, index) => {
    tombstone.slot = index;
  });

  const latestViolation =
    [...events].reverse().find((event) => VIOLATION_TYPES.has(event.type)) ?? null;

  return {
    live,
    tombstones,
    chainCount,
    breached,
    kills: events.filter((event) => event.type === "kill").length,
    latestViolation,
    totalAgents: agents.length,
  };
}
