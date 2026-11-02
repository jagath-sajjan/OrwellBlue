import type { ReactNode } from "react";
import { cn } from "./cn";

export interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "green" | "yellow" | "red";
  className?: string;
}

const tones = {
  default: "bg-bg",
  green: "bg-soft-green",
  yellow: "bg-soft-yellow",
  red: "bg-soft-red",
};

export function Stat({ label, value, hint, icon, tone = "default", className }: StatProps) {
  return (
    <div
      className={cn(
        "rounded-none border-2 border-ink p-4 shadow-sm",
        tones[tone],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
          {label}
        </span>
        {icon ? <span className="text-ink">{icon}</span> : null}
      </div>
      <div className="mt-2 font-display text-3xl font-bold uppercase leading-none text-ink tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
