"use client";

import type { MutableRefObject } from "react";

export type HudTone = "white" | "green" | "yellow" | "red" | "grey";

export interface HudItem {
  key: string;
  text: string;
  sub?: string;
  tone: HudTone;
  strong?: boolean;
}

const TONE: Record<HudTone, string> = {
  white: "bg-bg",
  green: "bg-soft-green",
  yellow: "bg-soft-yellow",
  red: "bg-soft-red",
  grey: "bg-surface-2",
};

const CHIP =
  "whitespace-nowrap border-2 border-ink px-1.5 py-1 font-mono text-[11px] font-bold uppercase leading-none tracking-[0.04em]";

interface HudLayerProps {
  items: HudItem[];
  register: MutableRefObject<Map<string, HTMLDivElement>>;
}

/**
 * Screen-space HUD. Labels are plain DOM chips positioned by LabelProjector,
 * so text is never drawn on a tilted 3D plane and no React root is unmounted
 * mid-render when agents come and go.
 */
export function HudLayer({ items, register }: HudLayerProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((item) => (
        <div
          key={item.key}
          ref={(element) => {
            if (element) register.current.set(item.key, element);
            else register.current.delete(item.key);
          }}
          className="absolute left-0 top-0 flex flex-col items-center gap-1 opacity-0 [will-change:transform,opacity]"
        >
          <div className={`${CHIP} ${TONE[item.tone]} ${item.strong ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}>
            {item.text}
          </div>
          {item.sub ? <div className={`${CHIP} ${TONE.red}`}>{item.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}
