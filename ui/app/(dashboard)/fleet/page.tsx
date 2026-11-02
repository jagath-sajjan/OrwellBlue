"use client";

import { FileSearch, HeartPulse, Server, ShieldAlert, Skull, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { formatClockTime } from "@/lib/format";
import type { AgentProfile, AgentSummary } from "@/lib/types";

const PROFILES: Array<{ value: AgentProfile; label: string }> = [
  { value: "benign", label: "Benign" },
  { value: "ssrf", label: "SSRF Metadata Probe" },
  { value: "egress", label: "Unauthorized Egress" },
  { value: "privesc", label: "Root Privesc Attempt" },
  { value: "tripwire", label: "Honeytoken Tripwire Read" },
  { value: "shared_write", label: "Shared Write" },
  { value: "silent", label: "Heartbeat Drop / Silent" },
];

function heartbeatLabel(agent: AgentSummary, queued: boolean): string {
  if (queued) return "Queued";
  if (agent.status !== "running") return "Stopped";
  return agent.last_heartbeat > 0 ? "Nominal" : "Awaiting heartbeat";
}

export default function FleetPage() {
  const { agents, queuedAgentIds, pending, spawnAgent, killAgent } = useDashboard();
  const router = useRouter();
  const pathname = usePathname();
  const [agentId, setAgentId] = useState("");
  const [profile, setProfile] = useState<AgentProfile>("benign");
  const [armedKill, setArmedKill] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (armTimer.current) window.clearTimeout(armTimer.current);
    };
  }, []);

  function armKill(id: string) {
    setArmedKill(id);
    if (armTimer.current) window.clearTimeout(armTimer.current);
    armTimer.current = window.setTimeout(() => setArmedKill(null), 3000);
  }

  async function handleKill(id: string) {
    if (armedKill === id) {
      setArmedKill(null);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      await killAgent(id);
    } else {
      armKill(id);
    }
  }

  async function handleSpawn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = agentId.trim();
    if (!id) return;
    await spawnAgent(id, profile);
    setAgentId("");
  }

  return (
    <div>
      <PageHeader
        eyebrow="01 / Fleet"
        title="Fleet"
        description="Deploy and manage isolated agent containers."
      />

      {/* Deploy form */}
      <form
        onSubmit={(event) => void handleSpawn(event)}
        className="mt-8 border-2 border-ink bg-bg p-5 shadow-sm"
      >
        <div className="flex items-center gap-2 border-b-2 border-ink pb-4">
          <Zap size={16} strokeWidth={2} />
          <span className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
            Deploy sandbox agent
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <Input
            label="Agent ID"
            placeholder="agent-delta"
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            maxLength={48}
          />
          <Select
            label="Scenario profile"
            value={profile}
            onValueChange={(value) => setProfile(value as AgentProfile)}
            options={PROFILES}
          />
          <Button type="submit" pending={pending.spawn} className="self-end">
            <Zap size={15} strokeWidth={2} />
            Spawn agent
          </Button>
        </div>
      </form>

      {/* Agent grid */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg uppercase tracking-[-0.02em]">Agent inventory</h2>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
          {agents.length} deployed
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="mt-4 border-2 border-dashed border-ink p-10 text-center">
          <Server size={22} strokeWidth={2} className="mx-auto" />
          <p className="mt-3 font-mono text-xs font-bold uppercase tracking-[0.08em]">No agents deployed</p>
          <p className="mt-1 font-mono text-[13px] text-ink-2">Initialize a sandbox above.</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const queued = queuedAgentIds.includes(agent.agent_id);
            const hb = heartbeatLabel(agent, queued);
            return (
              <article key={agent.agent_id} className="relative flex flex-col overflow-hidden border-2 border-ink bg-bg p-4 shadow-sm">
                {agent.status === "killed" ? (
                  <motion.span
                    initial={{ scale: 1.3, rotate: -6, opacity: 0 }}
                    animate={{ scale: 1, rotate: -3, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="pointer-events-none absolute right-2 top-2 border-2 border-ink bg-soft-red px-2 py-0.5 font-display text-xs uppercase tracking-[-0.02em]"
                  >
                    Killed
                  </motion.span>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-display text-base uppercase tracking-[-0.02em]">
                    {agent.agent_id}
                  </h3>
                  <StatusChip status={queued ? "queued" : agent.status} />
                </div>

                <div className="mt-1 truncate font-mono text-[11px] text-ink-2">
                  CONTAINER <span className="text-ink">{agent.container_id ?? "ID unavailable"}</span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-y-2 border-ink py-3">
                  <div>
                    <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
                      <HeartPulse size={11} strokeWidth={2} />
                      Heartbeat
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.04em]">
                      {hb}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
                      <ShieldAlert size={11} strokeWidth={2} />
                      Violations
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.04em]">
                      {agent.violations.toString().padStart(2, "0")}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
                      Last seen
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.04em] tabular-nums">
                      {agent.last_heartbeat ? formatClockTime(agent.last_heartbeat) : "--:--:--"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  {agent.status === "running" ? (
                    <Button
                      size="sm"
                      variant={armedKill === agent.agent_id ? "danger" : "secondary"}
                      pending={pending.kill === agent.agent_id}
                      onClick={() => void handleKill(agent.agent_id)}
                    >
                      <Skull size={14} strokeWidth={2} />
                      {armedKill === agent.agent_id ? "Confirm kill" : "Emergency kill"}
                    </Button>
                  ) : agent.status === "killed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`${pathname}?forensics=${encodeURIComponent(agent.agent_id)}`)}
                    >
                      <FileSearch size={14} strokeWidth={2} />
                      Inspect forensics
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

    </div>
  );
}
