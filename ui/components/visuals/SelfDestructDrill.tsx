"use client";

import { ShieldAlert, Skull, Siren, Square, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Panel } from "@/components/ui/Panel";
import type { AgentProfile } from "@/lib/types";

const STEP_TIMEOUT_MS = 45_000;
const BLAST_MS = 1_250;

type StepPhase =
  | "queued"
  | "spawning"
  | "hunting"
  | "blasting"
  | "contained"
  | "timeout"
  | "failed"
  | "aborted";

interface DrillStep {
  profile: AgentProfile;
  label: string;
}

const DRILL_STEPS: DrillStep[] = [
  { profile: "ssrf", label: "SSRF metadata probe" },
  { profile: "tripwire", label: "Honeytoken tripwire" },
  { profile: "privesc", label: "Root privesc" },
  { profile: "egress", label: "Unauthorized egress" },
  { profile: "shared_write", label: "Shared write" },
];

const PHASE_META: Record<StepPhase, { label: string; tone: ChipTone; surface: string }> = {
  queued: { label: "Queued", tone: "neutral", surface: "bg-bg" },
  spawning: { label: "Spawning", tone: "yellow", surface: "bg-soft-yellow" },
  hunting: { label: "Hunting", tone: "yellow", surface: "bg-soft-yellow" },
  blasting: { label: "Core blast", tone: "red", surface: "bg-soft-red" },
  contained: { label: "Tombstoned", tone: "red", surface: "bg-soft-green" },
  timeout: { label: "Timeout", tone: "red", surface: "bg-soft-red" },
  failed: { label: "Spawn failed", tone: "red", surface: "bg-soft-red" },
  aborted: { label: "Aborted", tone: "neutral", surface: "bg-surface-2" },
};

const TERMINAL_STATUSES = new Set(["killed", "self_destructed"]);
const TERMINAL_EVENTS = new Set(["kill", "self_destruct"]);

function suffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

interface SelfDestructDrillProps {
  onBlast: () => void;
}

/**
 * Sequential containment drill. Spawns one zero-tolerance agent at a time,
 * waits for the watchdog to tombstone it, then fires a cosmetic core
 * detonation before the next agent enters. Wrapper state is never touched.
 */
export function SelfDestructDrill({ onBlast }: SelfDestructDrillProps) {
  const { agents, events, mockMode, spawnAgent } = useDashboard();

  const [phases, setPhases] = useState<StepPhase[]>(() =>
    DRILL_STEPS.map(() => "queued"),
  );
  const [agentIds, setAgentIds] = useState<(string | null)[]>(() =>
    DRILL_STEPS.map(() => null),
  );
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState(
    "Idle. The drill spawns one hard agent at a time and detonates the core between each containment.",
  );

  const agentsRef = useRef(agents);
  const eventsRef = useRef(events);
  const runRef = useRef(0);
  const runningRef = useRef(false);
  const activeIndexRef = useRef(-1);
  const waitTimer = useRef<number | undefined>(undefined);
  const cancelWait = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runRef.current += 1;
      if (waitTimer.current !== undefined) window.clearTimeout(waitTimer.current);
      cancelWait.current?.();
      cancelWait.current = null;
    };
  }, []);

  const setPhase = useCallback((index: number, phase: StepPhase) => {
    setPhases((current) => {
      if (index < 0 || index >= current.length) return current;
      const next = [...current];
      next[index] = phase;
      return next;
    });
  }, []);

  const wait = useCallback((ms: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        waitTimer.current = undefined;
        cancelWait.current = null;
        resolve(true);
      }, ms);
      waitTimer.current = timer;
      cancelWait.current = () => {
        window.clearTimeout(timer);
        waitTimer.current = undefined;
        cancelWait.current = null;
        resolve(false);
      };
    });
  }, []);

  const waitForTerminal = useCallback(
    (agentId: string, timeoutMs: number): Promise<"killed" | "timeout" | "aborted"> => {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        let timer: number | undefined;

        const finish = (result: "killed" | "timeout" | "aborted") => {
          if (timer !== undefined) window.clearTimeout(timer);
          waitTimer.current = undefined;
          cancelWait.current = null;
          resolve(result);
        };

        const poll = () => {
          const agent = agentsRef.current.find((item) => item.agent_id === agentId);
          const terminatedByEvent = eventsRef.current.some(
            (event) => event.agent_id === agentId && TERMINAL_EVENTS.has(event.type),
          );
          if ((agent && TERMINAL_STATUSES.has(agent.status)) || terminatedByEvent) {
            finish("killed");
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            finish("timeout");
            return;
          }
          timer = window.setTimeout(poll, 350);
          waitTimer.current = timer;
        };

        cancelWait.current = () => finish("aborted");
        poll();
      });
    },
    [],
  );

  const stop = useCallback(() => {
    const index = activeIndexRef.current;
    runningRef.current = false;
    runRef.current += 1;
    activeIndexRef.current = -1;
    cancelWait.current?.();
    cancelWait.current = null;
    if (waitTimer.current !== undefined) {
      window.clearTimeout(waitTimer.current);
      waitTimer.current = undefined;
    }
    setRunning(false);
    setPhases((current) => {
      if (index < 0 || index >= current.length) return current;
      const phase = current[index];
      if (phase !== "spawning" && phase !== "hunting" && phase !== "blasting") return current;
      const next = [...current];
      next[index] = "aborted";
      return next;
    });
    setOutcome("Drill stopped by operator.");
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current || !mounted.current) return;

    runningRef.current = true;
    const runId = runRef.current + 1;
    runRef.current = runId;
    const token = suffix();
    const ids = DRILL_STEPS.map((step) => `drill-${step.profile}-${token}`);

    setRunning(true);
    setPhases(DRILL_STEPS.map(() => "queued"));
    setAgentIds(ids);
    setOutcome(`Drill armed. 0 / ${DRILL_STEPS.length} agents tombstoned.`);

    for (let index = 0; index < DRILL_STEPS.length; index += 1) {
      if (!mounted.current || runRef.current !== runId) return;

      const step = DRILL_STEPS[index];
      const agentId = ids[index];
      activeIndexRef.current = index;

      setPhase(index, "spawning");
      setOutcome(`Spawning ${step.label} (${index + 1} / ${DRILL_STEPS.length}).`);

      const spawned = await spawnAgent(agentId, step.profile);
      if (!mounted.current || runRef.current !== runId) return;

      if (!spawned) {
        setPhase(index, "failed");
        setOutcome(`${step.label} could not be spawned. Continuing to the next profile.`);
        activeIndexRef.current = -1;
        const continued = await wait(700);
        if (!continued || runRef.current !== runId) return;
        continue;
      }

      setPhase(index, "hunting");
      setOutcome(`${step.label} is inside the boundary. Waiting for watchdog termination.`);

      const result = await waitForTerminal(agentId, STEP_TIMEOUT_MS);
      if (!mounted.current || runRef.current !== runId || result === "aborted") return;

      // Blast first, then settle on the terminal phase. One state write per step
      // instead of a throwaway contained -> blasting transition.
      setPhase(index, "blasting");
      setOutcome(
        result === "timeout"
          ? `${step.label} did not terminate in time. Firing the core anyway.`
          : `${step.label} tombstoned. Core detonation in progress.`,
      );
      onBlast();

      const blasted = await wait(BLAST_MS);
      if (!blasted || !mounted.current || runRef.current !== runId) return;

      setPhase(index, result === "timeout" ? "timeout" : "contained");
      activeIndexRef.current = -1;
    }

    if (!mounted.current || runRef.current !== runId) return;
    runningRef.current = false;
    setRunning(false);
    setOutcome(
      `Drill complete. ${DRILL_STEPS.length} hard-agent profiles exercised, one at a time.`,
    );
  }, [onBlast, setPhase, spawnAgent, wait, waitForTerminal]);

  const tombstoned = phases.filter((phase) => phase === "contained").length;

  return (
    <Panel
      className="mt-8"
      shadow="md"
      title="Self-destruct drill"
      eyebrow="Sequential hard-agent run"
      action={
        running ? (
          <Button size="sm" variant="secondary" onClick={stop}>
            <Square size={14} strokeWidth={2} />
            Stop drill
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={() => void start()}>
            <Siren size={14} strokeWidth={2} />
            {tombstoned > 0 ? "Run drill again" : "Start drill"}
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="max-w-2xl font-mono text-[13px] leading-snug text-ink-2">
          Spawns one zero-tolerance agent, waits for the watchdog to tombstone it, then fires a
          cosmetic core detonation before the next agent enters. This is a simulation: wrapper
          state, the ledger, and the kill switch are never touched.
        </p>
        <Chip
          className="ml-auto"
          tone={running ? "yellow" : tombstoned > 0 ? "green" : "neutral"}
          label={`${tombstoned} / ${DRILL_STEPS.length} tombstoned`}
          dot
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {DRILL_STEPS.map((step, index) => {
          const phase = phases[index] ?? "queued";
          const meta = PHASE_META[phase];
          return (
            <div
              key={step.profile}
              className={`border-2 border-ink p-3 shadow-sm ${meta.surface}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {phase === "contained" ? (
                  <Skull size={14} strokeWidth={2} />
                ) : phase === "spawning" || phase === "hunting" || phase === "blasting" ? (
                  <ShieldAlert size={14} strokeWidth={2} />
                ) : (
                  <Zap size={14} strokeWidth={2} className="opacity-40" />
                )}
              </div>
              <div className="mt-2 font-display text-sm uppercase leading-tight">
                {step.label}
              </div>
              <div
                className="mt-1 truncate font-mono text-[10px] text-ink-2"
                title={agentIds[index] ?? undefined}
              >
                {agentIds[index] ?? "not spawned"}
              </div>
              <div className="mt-2">
                <Chip tone={meta.tone} label={meta.label} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-3">
        <span aria-live="polite" className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
          {outcome}
        </span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
          {mockMode ? "Mock simulation" : "Live containers"}
        </span>
      </div>
    </Panel>
  );
}
