import type { ReactNode } from "react";
import { cn } from "./cn";

export type ChipTone = "green" | "yellow" | "red" | "white" | "neutral";

const tones: Record<ChipTone, string> = {
  green: "bg-soft-green text-ink",
  yellow: "bg-soft-yellow text-ink",
  red: "bg-soft-red text-ink",
  white: "bg-bg text-ink",
  neutral: "bg-surface-2 text-ink",
};

export interface ChipProps {
  tone?: ChipTone;
  label: string;
  icon?: ReactNode;
  className?: string;
  dot?: boolean;
}

export function Chip({ tone = "neutral", label, icon, className, dot = false }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-none border-2 border-ink px-2.5",
        "font-mono text-[11px] font-bold uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 bg-ink" /> : null}
      {icon}
      {label}
    </span>
  );
}
