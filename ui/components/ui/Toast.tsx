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
  title: string;
  description?: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, string> = {
  green: "bg-soft-green",
  yellow: "bg-soft-yellow",
  red: "bg-soft-red",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (item: ToastItem) => {
      const timer = window.setTimeout(() => dismiss(item.id), item.durationMs ?? 8000);
      timers.current.set(item.id, timer);
    },
    [dismiss],
  );

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = { id, tone: "red", ...options };
      setToasts((current) => [...current.slice(-2), item]);
      schedule(item);
    },
    [schedule],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={dismiss} onResume={schedule} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (item: ToastItem) => void;
}

function ToastViewport({ toasts, onDismiss, onPause, onResume }: ToastViewportProps) {
  if (!toasts.length) return null;
  return (
    <div
      className="fixed right-4 top-4 z-[60] flex w-[min(440px,calc(100vw-2rem))] flex-col gap-2 sm:top-auto sm:bottom-4"
      aria-live="assertive"
      aria-atomic="false"
    >
      {toasts.map((item) => (
        <article
          key={item.id}
          className={cn(
            "rounded-none border-2 border-ink p-3 shadow-md",
            toneStyles[item.tone ?? "red"],
          )}
          onMouseEnter={() => onPause(item.id)}
          onMouseLeave={() => onResume(item)}
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
    </div>
  );
}
