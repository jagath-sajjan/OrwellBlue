"use client";

import type { ActiveCinematic, Phase } from "./Choreography";

const STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: "detect", label: "DETECT" },
  { phase: "signal", label: "SIGNAL" },
  { phase: "freeze", label: "FREEZE" },
  { phase: "kill", label: "KILL" },
  { phase: "tombstone", label: "TOMBSTONE" },
];

export function Caption({
  cinematic,
  idle,
}: {
  cinematic: ActiveCinematic | null;
  idle: string;
}) {
  const current = cinematic?.phase ?? null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t-2 border-ink bg-bg/95">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-ink px-3 py-2">
        {STEPS.map((step, index) => {
          const active = current === step.phase;
          return (
            <span
              key={step.phase}
              className={`font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${
                active ? "bg-soft-yellow px-1 text-ink" : "text-ink-2 opacity-45"
              }`}
            >
              {String(index + 1).padStart(2, "0")} {step.label}
            </span>
          );
        })}
        <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
          {cinematic ? (cinematic.preview ? "Preview" : "Live kill") : "Idle"}
        </span>
      </div>

      <div
        aria-live="polite"
        className="px-3 py-2 font-mono text-[12px] leading-snug text-ink"
      >
        {cinematic ? cinematic.narration : idle}
      </div>
    </div>
  );
}
