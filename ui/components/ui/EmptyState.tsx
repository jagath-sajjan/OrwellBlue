import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon, title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-none border-2 border-dashed border-ink bg-bg p-6 text-center",
        className,
      )}
    >
      {icon ? <span className="text-ink">{icon}</span> : null}
      <span className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
        {title}
      </span>
      {description ? (
        <span className="max-w-xs font-mono text-[13px] leading-snug text-ink-2">{description}</span>
      ) : null}
    </div>
  );
}
