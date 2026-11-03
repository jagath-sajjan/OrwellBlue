export type EventType =
  | "info"
  | "heartbeat"
  | "egress_attempt"
  | "ssrf_attempt"
  | "privesc_attempt"
  | "shared_write"
  | "comms_attempt"
  | "tripwire"
  | "heartbeat_lost"
  | "kill"
  | "self_destruct";

export type AgentProfile = "benign" | "ssrf" | "egress" | "privesc" | "tripwire" | "shared_write" | "silent" | "autonomous";

export interface SandboxEvent {
  id: number;
  agent_id: string;
  type: EventType;
  severity: 0 | 1 | 2 | 3;
  detail: Record<string, unknown>;
  ts: number;
  prev_hash: string;
  hash: string;
}

export interface AgentSummary {
  agent_id: string;
  status: "running" | "frozen" | "killed" | "self_destructed";
  last_heartbeat: number;
  violations: number;
  container_id?: string | null;
}

export interface ChainBreakDetail {
  agent_id: string;
  type: string;
  reason: "prev_hash_mismatch" | "hash_mismatch";
  expected_prev_hash: string;
  stored_prev_hash: string;
  stored_hash: string;
  expected_hash: string | null;
}

export interface ChainVerification {
  valid: boolean;
  total_events: number;
  broken_at_id: number | null;
  break?: ChainBreakDetail | null;
}

export interface ForensicSnapshot {
  agent_id: string;
  killed_at: number;
  reason: string;
  processes: Array<{ pid: string; user: string; cmd: string }>;
  fs_diff: Array<{ path: string; kind: "A" | "C" | "D" }>;
  logs: string;
}

export interface HealthStatus {
  status: string;
  project: string;
  wrapper_intact: boolean;
  chain_valid: boolean;
}