import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="sticky top-14 z-20 -mx-4 border-b-2 border-ink bg-bg px-4 pb-4 pt-1 sm:-mx-6 sm:px-6 md:top-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
            {eyebrow}
          </p>
          <h1 className="mt-1 font-display text-[clamp(28px,4vw,44px)] uppercase leading-none tracking-[-0.02em]">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl font-mono text-[13px] leading-snug text-ink-2">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
    </header>
  );
}
