"use client";

import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import type { SceneModel } from "./model";

function HeartbeatAge(ts: number): string {
  if (!ts) return "—";
  return `${Math.max(0, Math.floor(Date.now() / 1000 - ts))}s ago`;
}

export function Inspector({ model, selectedId }: { model: SceneModel; selectedId: string | null }) {
  const agent = selectedId
    ? model.live.find((item) => item.id === selectedId)
    : null;

  if (!agent) {
    return (
      <Panel title="Inspector" eyebrow="Summary">
        <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.04em]">
          <Row label="Active" value={String(model.live.length)} />
          <Row label="Tombstoned" value={String(model.tombstones.length)} />
          <Row label="Chain blocks" value={String(model.chainCount)} />
        </div>
        <div className="mt-4 border-t-2 border-ink pt-3">
          <Chip
            tone={model.breached ? "red" : "green"}
            label={model.breached ? "Breached" : "Armed"}
          />
        </div>
      </Panel>
    );
  }

  const frozen = agent.status === "frozen";
  return (
    <Panel title="Inspector" eyebrow={`Selected / ${agent.id}`}>
      <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.04em]">
        <Row label="Profile" value={agent.profile ?? "—"} />
        <Row label="Container" value={agent.containerId ?? "—"} />
        <Row label="Heartbeat" value={HeartbeatAge(agent.lastHeartbeat)} />
        <Row label="Violations" value={String(agent.violations)} />
        <Row label="Status" value={agent.status} />
      </div>
      <div className="mt-4 border-t-2 border-ink pt-3">
        <Chip tone={frozen ? "yellow" : "green"} label={frozen ? "Frozen" : "Running"} />
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-2">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
