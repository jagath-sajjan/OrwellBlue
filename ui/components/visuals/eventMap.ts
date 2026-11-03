/** Maps real event type strings -> violation motif + narration sentence. */
import type { EventType } from "@/lib/types";

export type Motif =
  | "tripwire"
  | "ssrf"
  | "egress"
  | "privesc"
  | "shared_write"
  | "heartbeat_lost"
  | "generic";

export interface ViolationMeta {
  motif: Motif;
  label: string;
  narration: (agentId: string) => string;
}

export const VIOLATION_META: Record<string, ViolationMeta> = {
  tripwire: {
    motif: "tripwire",
    label: ".AWS_CREDENTIALS (HONEYTOKEN)",
    narration: (id) =>
      `${id} read a fake credentials file. OrwellBlue sent the kill signal. Container frozen, then killed. Evidence sealed.`,
  },
  ssrf_attempt: {
    motif: "ssrf",
    label: "DECOY MIRROR",
    narration: (id) =>
      `${id} probed the decoy metadata mirror. OrwellBlue detected it and terminated the container.`,
  },
  egress_attempt: {
    motif: "egress",
    label: "BLOCKED",
    narration: (id) =>
      `${id} tried to leave the sandbox network. The boundary blocked it and OrwellBlue killed the agent.`,
  },
  privesc_attempt: {
    motif: "privesc",
    label: "ROOT ATTEMPT",
    narration: (id) =>
      `${id} tried to escalate to root. OrwellBlue froze and destroyed the container.`,
  },
  shared_write: {
    motif: "shared_write",
    label: "UNSANCTIONED CHANNEL",
    narration: (id) =>
      `${id} tried to write through a shared mount. OrwellBlue sealed and killed it.`,
  },
  heartbeat_lost: {
    motif: "heartbeat_lost",
    label: "HEARTBEAT LOST",
    narration: (id) =>
      `${id} stopped sending heartbeats. OrwellBlue declared it lost and killed the container.`,
  },
  comms_attempt: {
    motif: "generic",
    label: "COMMS ATTEMPT",
    narration: (id) =>
      `${id} attempted an unauthorized channel. OrwellBlue contained and killed it.`,
  },
};

export function motifFor(type: EventType | string): ViolationMeta {
  return VIOLATION_META[type] ?? {
    motif: "generic",
    label: "VIOLATION",
    narration: (id) => `${id} broke a containment rule. OrwellBlue terminated it.`,
  };
}
