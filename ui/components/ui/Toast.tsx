"use client";

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export type ToastTone = "green" | "yellow" | "red";

export interface ToastOptions {
  key?: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem {
  id: string;
  key: string;
  title: string;
  tone: ToastTone;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;

const toneStyles: Record<ToastTone, string> = {
  green: "bg-soft-green",
  yellow: "bg-soft-yellow",
  red: "bg-soft-red",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const resume = useCallback(
    (id: string) => {
      const item = toasts.find((t) => t.id === id);
      if (!item) return;
      clearTimer(id);
      const timer = window.setTimeout(() => dismiss(id), item.durationMs);
      timers.current.set(id, timer);
    },
    [clearTimer, dismiss, toasts],
  );

  const pause = useCallback(
    (id: string) => {
      clearTimer(id);
    },
    [clearTimer],
  );

  const toast = useCallback(
    (options: ToastOptions) => {
      const key = options.key ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const id = `${key}-${Date.now()}`;
      const item: ToastItem = {
        id,
        key,
        title: options.title,
        tone: options.tone ?? "red",
        description: options.description,
        actionLabel: options.actionLabel,
        onAction: options.onAction,
        durationMs: options.durationMs ?? 8000,
      };

      setToasts((current) => {
        // Dedupe by key: clear any previous toast for this agent and its timer.
        const previous = current.find((t) => t.key === key);
        if (previous) clearTimer(previous.id);
        const next = [...current.filter((t) => t.key !== key), item];
        return next;
      });

      const timer = window.setTimeout(() => dismiss(id), item.durationMs);
      timers.current.set(id, timer);
    },
    [clearTimer, dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss, pause, resume }), [toast, dismiss, pause, resume]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  if (!toasts.length) return null;

  const visible = toasts.slice(-MAX_VISIBLE);
  const hidden = toasts.length - visible.length;

  return (
    <div
      className="fixed right-4 top-4 z-[60] flex w-[min(440px,calc(100vw-2rem))] flex-col gap-2 sm:top-auto sm:bottom-4"
      aria-live="assertive"
      aria-atomic="false"
    >
      {visible.map((item) => (
        <article
          key={item.id}
          className={cn("rounded-none border-2 border-ink p-3 shadow-md", toneStyles[item.tone])}
          onMouseEnter={() => onPause(item.id)}
          onMouseLeave={() => onResume(item.id)}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <strong className="block font-mono text-xs font-bold uppercase tracking-[0.08em]">
                {item.title}
              </strong>
              {item.description ? (
                <p className="mt-1 font-mono text-[13px] leading-snug">{item.description}</p>
              ) : null}
              {item.actionLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    onDismiss(item.id);
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-none border-2 border-ink bg-bg px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] shadow-sm"
                >
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss alert"
              onClick={() => onDismiss(item.id)}
              className="flex size-8 shrink-0 items-center justify-center rounded-none border-2 border-ink bg-bg"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </article>
      ))}
      {hidden > 0 ? (
        <div className="self-end border-2 border-ink bg-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bg shadow-md">
          +{hidden} more
        </div>
      ) : null}
    </div>
  );
}
