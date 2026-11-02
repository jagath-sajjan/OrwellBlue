import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Shadow = "none" | "sm" | "md" | "lg";

const shadows: Record<Shadow, string> = {
  none: "",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  shadow?: Shadow;
  padded?: boolean;
  inset?: boolean;
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function Panel({
  shadow = "sm",
  padded = true,
  inset = false,
  title,
  eyebrow,
  action,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-none border-2 border-ink bg-bg",
        inset && "bg-surface-2",
        padded && "p-5",
        shadows[shadow],
        className,
      )}
      {...props}
    >
      {(title || eyebrow || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {eyebrow ? (
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h2 className="font-display text-lg uppercase">{title}</h2> : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
