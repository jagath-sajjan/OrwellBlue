"use client";

import { AlertOctagon, X } from "lucide-react";
import { useDashboard } from "@/components/providers/DashboardProvider";

export function ErrorBanner() {
  const { error, clearError } = useDashboard();
  if (!error) return null;

  return (
    <div
      role="alert"
      className="mt-4 flex items-center gap-2 border-2 border-ink bg-soft-red p-3"
    >
      <AlertOctagon size={16} strokeWidth={2} className="shrink-0" />
      <span className="min-w-0 flex-1 font-mono text-[13px] leading-snug">{error}</span>
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={clearError}
        className="flex size-8 shrink-0 items-center justify-center rounded-none border-2 border-ink bg-bg"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
