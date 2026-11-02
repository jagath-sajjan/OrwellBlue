"use client";

import {
  Activity,
  ArrowRight,
  Fingerprint,
  Server,
  ShieldAlert,
  ShieldCheck,
  Skull,
} from "lucide-react";
import Link from "next/link";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { StatusChip, SeverityChip } from "@/components/StatusChip";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatClockTime } from "@/lib/format";

export default function OverviewPage() {
  const { health, agents, events, chain, breach, mockMode, loading } = useDashboard();

  const running = agents.filter((agent) => agent.status === "running").length;
  const kills = events.filter((event) => event.type === "kill").length;
  const latestEvents = events.filter((event) => event.type !== "heartbeat").slice(0, 6);
  const chainBlocks = chain?.total_events ?? 0;
  const chainValid = chain?.valid ?? null;

  if (loading) {
    return (
      <div>
        <PageHeader
          eyebrow="Mission Control"
          title="Overview"
          description="Zero-trust agent containment status at a glance."
        />
        <div className="mt-8 flex flex-col gap-8">
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Mission Control"
        title="Overview"
        description="Zero-trust agent containment status at a glance."
        action={
          <Link
            href="/fleet"
            className="inline-flex h-11 items-center gap-2 rounded-none border-2 border-ink bg-ink px-4 font-mono text-xs font-bold uppercase tracking-[0.08em] text-bg shadow-sm transition-[transform,box-shadow] duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            Deploy agent
            <ArrowRight size={15} strokeWidth={2} />
          </Link>
        }
      />

      <div className="mt-8 flex flex-col gap-8">
        {/* Containment status */}
        <div
          className={`border-2 border-ink p-5 shadow-md ${breach.active ? "bg-soft-red" : "bg-soft-green"}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {breach.active ? (
                <ShieldAlert size={28} strokeWidth={2} className="mt-0.5 shrink-0" />
              ) : (
                <ShieldCheck size={28} strokeWidth={2} className="mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
                  {mockMode ? "Simulation" : "Wrapper containment"}
                </p>
                <p className="mt-1 font-display text-[clamp(28px,4vw,44px)] uppercase leading-none tracking-[-0.02em]">
                  {breach.active ? "Breach" : "Intact"}
                </p>
                <p className="mt-2 font-mono text-[13px] leading-snug">
                  {breach.active
                    ? breach.reason || "Wrapper integrity failure detected."
                    : "Watchdog armed. Hash chain linked and verified."}
                </p>
              </div>
            </div>
            <div className="hidden text-right font-mono text-[11px] font-bold uppercase tracking-[0.08em] sm:block">
              {health?.project ?? "OrwellBlue"}
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Agents running"
            value={`${running} / ${agents.length}`}
            hint="Of total fleet"
            icon={<Server size={16} strokeWidth={2} />}
            tone={running > 0 ? "green" : "default"}
          />
          <Stat
            label="Events loaded"
            value={events.length}
            hint="This session"
            icon={<Activity size={16} strokeWidth={2} />}
          />
          <Stat
            label="Chain blocks"
            value={chainBlocks}
            hint={chainValid === null ? "Pending" : chainValid ? "Verified" : "Broken"}
            icon={<Fingerprint size={16} strokeWidth={2} />}
            tone={chainValid === false ? "red" : chainValid ? "green" : "default"}
          />
          <Stat
            label="Kills"
            value={kills}
            icon={<Skull size={16} strokeWidth={2} />}
            tone={kills > 0 ? "red" : "default"}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          {/* Latest events */}
          <Panel title="Latest events" eyebrow="Last 6 non-heartbeat" shadow="sm">
            {latestEvents.length === 0 ? (
              <p className="py-8 text-center font-mono text-[13px] text-ink-2">
                Awaiting telemetry.
              </p>
            ) : (
              <ul className="divide-y-2 divide-ink">
                {latestEvents.map((event) => (
                  <li key={`${event.id}-${event.hash}`} className="flex items-center gap-3 py-3">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
                      {formatClockTime(event.ts)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold uppercase tracking-[0.04em]">
                      {event.agent_id}
                    </span>
                    <SeverityChip severity={event.severity} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Compact fleet */}
          <Panel
            title="Fleet"
            eyebrow="Compact list"
            shadow="sm"
            action={
              <Link href="/fleet" className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] underline">
                View all
              </Link>
            }
          >
            {agents.length === 0 ? (
              <p className="py-8 text-center font-mono text-[13px] text-ink-2">No agents deployed.</p>
            ) : (
              <ul className="divide-y-2 divide-ink">
                {agents.map((agent) => (
                  <li key={agent.agent_id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold uppercase tracking-[0.04em]">
                      {agent.agent_id}
                    </span>
                    <span className="font-mono text-[11px] text-ink-2 tabular-nums">
                      {agent.violations} v
                    </span>
                    <StatusChip status={agent.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
