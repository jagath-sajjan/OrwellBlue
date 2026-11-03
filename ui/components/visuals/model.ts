/** Pure derivation of scene state from the live data layer. */
import type { AgentSummary, SandboxEvent } from "@/lib/types";
import { SCENE } from "./theme";

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

export function orbitFor(id: string): Orbit {
  const h = hashString(id);
  return {
    radius: SCENE.orbitBase + h * SCENE.orbitRange,
    inclination: (hashString(`${id}:i`) - 0.5) * 0.7,
    speed: 0.1 + hashString(`${id}:s`) * 0.22,
    phase: hashString(`${id}:p`) * Math.PI * 2,
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
  let slot = 0;

  for (const agent of agents) {
    if (agent.status === "running" || agent.status === "frozen") {
      live.push({
        id: agent.agent_id,
        status: agent.status,
        profile: profiles.get(agent.agent_id) ?? null,
        containerId: agent.container_id ?? null,
        violations: agent.violations,
        lastHeartbeat: agent.last_heartbeat,
        orbit: orbitFor(agent.agent_id),
        graveyardSlot: slot,
      });
    } else {
      const info = killInfo.get(agent.agent_id);
      tombstones.push({
        id: agent.agent_id,
        reason: info?.reason ?? "killed",
        eventType: lastViolation.get(agent.agent_id) ?? "kill",
        killedAt: info?.killedAt ?? 0,
        slot,
      });
    }
    slot += 1;
  }

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
