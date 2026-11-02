import type { ChipTone } from "@/components/ui/Chip";

export type StatusKind = "running" | "frozen" | "killed" | "self_destructed" | "queued";

export function statusMeta(status: StatusKind): { label: string; tone: ChipTone } {
  switch (status) {
    case "running":
      return { label: "Running", tone: "green" };
    case "frozen":
      return { label: "Frozen", tone: "yellow" };
    case "killed":
      return { label: "Killed", tone: "red" };
    case "self_destructed":
      return { label: "Self-destructed", tone: "red" };
    case "queued":
      return { label: "Queued", tone: "yellow" };
  }
}

export function severityMeta(severity: number): { label: string; tone: ChipTone } {
  if (severity <= 0) return { label: "Info", tone: "white" };
  if (severity === 1) return { label: "Low", tone: "yellow" };
  if (severity === 2) return { label: "High", tone: "red" };
  return { label: "Critical", tone: "red" };
}

export function eventTypeLabel(type: string): string {
  return type.replaceAll("_", " ").toUpperCase();
}

export function formatClockTime(timestamp: number): string {
  if (!timestamp) return "--:--:--";
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });
}

export function formatFullTime(timestamp: number): string {
  if (!timestamp) return "--";
  return new Date(timestamp * 1000).toLocaleString("en-US", { hour12: false });
}

export function shortHash(hash: string, length = 8): string {
  return hash.slice(0, length);
}
