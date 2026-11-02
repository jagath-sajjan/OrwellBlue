"use client";

import * as Switch from "@radix-ui/react-switch";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useDashboard, type ConnectionState } from "@/components/providers/DashboardProvider";
import { cn } from "@/components/ui/cn";

const connectionLabels: Record<ConnectionState, string> = {
  mock: "Mock",
  connecting: "Connecting",
  live: "Live :8000",
  reconnecting: "Reconnecting",
  offline: "Offline",
};

export function ConnectionPill({ className }: { className?: string }) {
  const { connection, reconnectCountdown, retryConnection } = useDashboard();

  const tone =
    connection === "live"
      ? "bg-soft-green"
      : connection === "reconnecting" || connection === "connecting"
        ? "bg-soft-yellow"
        : connection === "offline"
          ? "bg-soft-red"
          : "bg-surface-2";

  const label =
    connection === "reconnecting" && reconnectCountdown > 0
      ? `Reconnecting ${reconnectCountdown}s`
      : connectionLabels[connection];

  const isOffline = connection === "offline";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-none border-2 border-ink px-2.5",
          "font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink",
          tone,
        )}
      >
        <span aria-hidden className="size-1.5 bg-ink" />
        {label}
      </span>
      {isOffline ? (
        <button
          type="button"
          onClick={retryConnection}
          className="inline-flex h-8 items-center rounded-none border-2 border-ink bg-bg px-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] shadow-sm"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function ModeSwitch() {
  const { mockMode, toggleMode } = useDashboard();

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
        {mockMode ? "Mock" : "Live"}
      </span>
      <Switch.Root
        checked={!mockMode}
        onCheckedChange={() => void toggleMode()}
        aria-label="Toggle live backend"
        className="relative h-8 w-14 shrink-0 rounded-none border-2 border-ink bg-bg shadow-sm transition-[transform,box-shadow] duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md data-[state=checked]:bg-soft-green"
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-none border-2 border-ink bg-ink transition-transform duration-100 data-[state=checked]:translate-x-6" />
      </Switch.Root>
    </div>
  );
}

export function ContainmentChip() {
  const { breach } = useDashboard();
  const breached = breach.active;
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-none border-2 border-ink px-2.5",
        "font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink",
        breached ? "bg-soft-red" : "bg-soft-green",
      )}
    >
      {breached ? <ShieldAlert size={13} strokeWidth={2} /> : <ShieldCheck size={13} strokeWidth={2} />}
      {breached ? "Breach" : "Intact"}
    </span>
  );
}
