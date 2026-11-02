"use client";

import { FlaskConical, RotateCcw, ShieldCheck, Siren, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AgentProfile } from "@/lib/types";

interface Scenario {
  profile: AgentProfile;
  title: string;
  description: string;
  expected: string;
  safe?: boolean;
}

const SCENARIOS: Scenario[] = [
  {
    profile: "benign",
    title: "Safe Agent",
    description: "Runs heartbeat telemetry indefinitely.",
    expected: "Stays running",
    safe: true,
  },
  {
    profile: "ssrf",
    title: "SSRF Metadata Probe",
    description: "Attempts to reach the cloud metadata endpoint.",
    expected: "Killed — zero-tolerance",
  },
  {
    profile: "tripwire",
    title: "Honeytoken Tripwire Read",
    description: "Reads a planted honeytoken credential file.",
    expected: "Killed — zero-tolerance",
  },
  {
    profile: "privesc",
    title: "Root Privesc Attempt",
    description: "Attempts setuid(0) privilege escalation.",
    expected: "Killed — zero-tolerance",
  },
  {
    profile: "egress",
    title: "Unauthorized Egress",
    description: "Attempts an outbound socket connection.",
    expected: "Killed — zero-tolerance",
  },
  {
    profile: "silent",
    title: "Heartbeat Drop / Silent",
    description: "Emits two heartbeats then goes silent.",
    expected: "Killed — heartbeat lost",
  },
  {
    profile: "shared_write",
    title: "Shared Write",
    description: "Attempts to write to a read-only mount.",
    expected: "Killed — zero-tolerance",
  },
];

export default function LabPage() {
  const { mockMode, pending, spawnAgent, tamperWrapper, reset } = useDashboard();
  const [launching, setLaunching] = useState<string | null>(null);
  const counter = useRef(0);

  async function launch(profile: AgentProfile) {
    counter.current += 1;
    const agentId = `${profile}-${counter.current}`;
    setLaunching(agentId);
    try {
      await spawnAgent(agentId, profile);
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="02 / Attack Lab"
        title="Attack Lab"
        description="Deterministic containment scenarios with known outcomes."
      />

      {/* Mode banner */}
      <div className="mt-8 flex items-center gap-3 border-2 border-ink bg-surface-2 p-4">
        <FlaskConical size={18} strokeWidth={2} />
        <span className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
          {mockMode ? "Simulated environment" : "Live container environment"}
        </span>
        <Chip tone={mockMode ? "yellow" : "green"} label={mockMode ? "Mock" : "Live"} className="ml-auto" />
      </div>

      {/* Scenario cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCENARIOS.map((scenario) => {
          const isLaunching = launching === scenario.profile;
          return (
            <article key={scenario.profile} className="flex flex-col border-2 border-ink bg-bg p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base uppercase tracking-[-0.02em]">{scenario.title}</h3>
                {scenario.safe ? (
                  <Chip tone="green" label="Safe" icon={<ShieldCheck size={12} strokeWidth={2} />} />
                ) : null}
              </div>
              <p className="mt-2 font-mono text-[13px] leading-snug text-ink-2">
                {scenario.description}
              </p>
              <p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
                Expected: <span className="text-ink">{scenario.expected}</span>
              </p>
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  variant={scenario.safe ? "secondary" : "primary"}
                  pending={isLaunching}
                  onClick={() => void launch(scenario.profile)}
                >
                  <Zap size={14} strokeWidth={2} />
                  Launch
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Danger zone */}
      <section className="mt-8 border-2 border-ink bg-bg p-5 shadow-md">
        <div className="flex items-center gap-2 border-b-2 border-ink pb-4">
          <Siren size={16} strokeWidth={2} />
          <span className="font-mono text-xs font-bold uppercase tracking-[0.08em]">Danger zone</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="danger" pending={pending.tamper} onClick={() => void tamperWrapper()}>
            <Siren size={15} strokeWidth={2} />
            Simulate wrapper breach
          </Button>
          <Button variant="secondary" pending={pending.reset} onClick={() => void reset()}>
            <RotateCcw size={15} strokeWidth={2} />
            Reset sandbox
          </Button>
        </div>
      </section>
    </div>
  );
}
