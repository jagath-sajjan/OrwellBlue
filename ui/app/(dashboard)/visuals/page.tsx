"use client";

import dynamic from "next/dynamic";
import { Crosshair, Fingerprint, ShieldAlert, Skull } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { HowToRead } from "@/components/visuals/HowToRead";
import { Inspector } from "@/components/visuals/Inspector";
import { buildSceneModel } from "@/components/visuals/model";

const Scene = dynamic(() => import("@/components/visuals/Scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[min(80vh,760px)] items-center justify-center border-2 border-ink font-mono text-xs font-bold uppercase tracking-[0.08em]">
      Loading 3D scene…
    </div>
  ),
});

export default function VisualsPage() {
  const { agents, events, chain, breach } = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const running = agents.filter((agent) => agent.status === "running").length;
  const kills = events.filter((event) => event.type === "kill").length;
  const chainValid = chain?.valid ?? null;

  const model = useMemo(
    () => buildSceneModel(agents, events, breach.active, chain?.total_events ?? 0),
    [agents, events, breach.active, chain?.total_events],
  );

  return (
    <div>
      <PageHeader
        eyebrow="05 / Visuals"
        title="Visuals"
        description="Live 3D view of the containment lattice."
      />

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Agents running"
          value={`${running} / ${agents.length}`}
          hint="Active in containment"
          icon={<Crosshair size={16} strokeWidth={2} />}
          tone={running > 0 ? "green" : "default"}
        />
        <Stat
          label="Kills"
          value={kills}
          hint="Tombstoned"
          icon={<Skull size={16} strokeWidth={2} />}
          tone={kills > 0 ? "red" : "default"}
        />
        <Stat
          label="Chain blocks"
          value={chain?.total_events ?? 0}
          hint={chainValid === null ? "Pending" : chainValid ? "Verified" : "Broken"}
          icon={<Fingerprint size={16} strokeWidth={2} />}
          tone={chainValid === false ? "red" : chainValid ? "green" : "default"}
        />
        <Stat
          label="Wrapper"
          value={breach.active ? "Breach" : "Intact"}
          icon={<ShieldAlert size={16} strokeWidth={2} />}
          tone={breach.active ? "red" : "green"}
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_260px]">
        <Panel padded={false} shadow="md" className="overflow-hidden">
          <div className="h-[min(80vh,760px)]">
            <Scene model={model} events={events} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Inspector model={model} selectedId={selectedId} />
          <HowToRead />
        </div>
      </div>
    </div>
  );
}
