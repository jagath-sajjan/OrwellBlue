"use client";

import { Clipboard, ClipboardCheck, FileSearch, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchForensics } from "@/lib/api";
import { SeverityChip } from "@/components/StatusChip";
import { Dialog } from "@/components/ui/Dialog";
import { formatFullTime } from "@/lib/format";

type Tab = "processes" | "fs_diff" | "logs";

interface RawForensic {
  agent_id: string;
  killed_at: number;
  reason: string;
  processes: unknown;
  fs_diff: unknown;
  logs: string;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "processes", label: "Process Tree" },
  { id: "fs_diff", label: "Filesystem Diff" },
  { id: "logs", label: "Container Logs" },
];

function hasErrorEntry(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "object" && item !== null && "error" in item)
  );
}

function diffMeta(kind: unknown): { badge: string; label: string; tone: "yellow" | "green" | "red" } {
  if (kind === 0 || kind === "0" || kind === "M" || kind === "C") {
    return { badge: "M", label: "Modified", tone: "yellow" };
  }
  if (kind === 1 || kind === "1" || kind === "A") {
    return { badge: "A", label: "Added", tone: "green" };
  }
  return { badge: "D", label: "Deleted", tone: "red" };
}

function ProcessTree({ processes }: { processes: unknown }) {
  if (!Array.isArray(processes) || processes.length === 0) {
    return <p className="py-8 text-center font-mono text-[13px] text-ink-2">No process records.</p>;
  }
  if (hasErrorEntry(processes)) {
    return (
      <div className="border-2 border-ink bg-soft-red p-4 font-mono text-[13px]">
        Process capture unavailable: container was already stopped.
      </div>
    );
  }

  const rows = processes.map((entry, index) => {
    if (Array.isArray(entry)) {
      const user = String(entry[0] ?? "—");
      const pid = String(entry[1] ?? "—");
      const cmd = String(entry[entry.length - 1] ?? "—");
      return { key: `${pid}-${index}`, pid, user, cmd };
    }
    if (typeof entry === "object" && entry !== null) {
      const obj = entry as Record<string, unknown>;
      return {
        key: `${String(obj.pid ?? obj.PID ?? index)}-${index}`,
        pid: String(obj.pid ?? obj.PID ?? "—"),
        user: String(obj.user ?? obj.USER ?? "—"),
        cmd: String(obj.cmd ?? obj.CMD ?? "—"),
      };
    }
    return null;
  });

  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface-2 text-left font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
            <th className="border-b-2 border-ink px-3 py-2">PID</th>
            <th className="border-b-2 border-ink px-3 py-2">User</th>
            <th className="border-b-2 border-ink px-3 py-2">Command</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row ? (
              <tr key={row.key} className="border-b-2 border-ink last:border-b-0">
                <td className="px-3 py-2 font-mono text-[12px] tabular-nums">{row.pid}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{row.user}</td>
                <td className="px-3 py-2 font-mono text-[12px]">{row.cmd}</td>
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  );
}

function FsDiff({ fsDiff }: { fsDiff: unknown }) {
  if (!Array.isArray(fsDiff) || fsDiff.length === 0) {
    return <p className="py-8 text-center font-mono text-[13px] text-ink-2">No filesystem changes recorded.</p>;
  }
  if (hasErrorEntry(fsDiff)) {
    return (
      <div className="border-2 border-ink bg-soft-red p-4 font-mono text-[13px]">
        Filesystem diff capture unavailable.
      </div>
    );
  }

  const toneBg = { yellow: "bg-soft-yellow", green: "bg-soft-green", red: "bg-soft-red" } as const;

  return (
    <ul className="divide-y-2 divide-ink border-2 border-ink">
      {fsDiff.map((entry, index) => {
        if (typeof entry !== "object" || entry === null) return null;
        const obj = entry as Record<string, unknown>;
        const path = String(obj.Path ?? obj.path ?? "—");
        const meta = diffMeta(obj.Kind ?? obj.kind);
        return (
          <li key={`${path}-${index}`} className="flex items-center gap-3 px-3 py-2">
            <span
              className={`inline-flex size-6 shrink-0 items-center justify-center border-2 border-ink font-mono text-[11px] font-bold ${toneBg[meta.tone]}`}
            >
              {meta.badge}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{path}</code>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
              {meta.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LogView({ logs }: { logs: string }) {
  const lines = logs.split("\n");
  return (
    <div className="border-2 border-ink bg-surface-2">
      {lines.map((line, index) => {
        let parsed: Record<string, unknown> | null = null;
        try {
          const value = JSON.parse(line);
          if (value && typeof value === "object") parsed = value;
        } catch {
          parsed = null;
        }
        if (parsed && "type" in parsed) {
          const severity = typeof parsed.severity === "number" ? parsed.severity : 0;
          const type = String(parsed.type ?? "info");
          return (
            <div key={index} className="flex items-center gap-2 border-b border-ink px-3 py-1.5 font-mono text-[12px]">
              <SeverityChip severity={severity} />
              <span className="font-bold uppercase tracking-[0.04em]">{type}</span>
              <span className="truncate text-ink-2">{JSON.stringify(parsed.detail ?? {})}</span>
            </div>
          );
        }
        return (
          <div key={index} className="border-b border-ink px-3 py-1.5 font-mono text-[12px] last:border-b-0">
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

export function ForensicModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [data, setData] = useState<RawForensic | null>(null);
  const [tab, setTab] = useState<Tab>("processes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetchForensics(agentId)
      .then((value) => {
        if (active) setData(value as unknown as RawForensic);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Forensic snapshot unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  async function copyLogs() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.logs);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Unable to copy logs.");
    }
  }

  const reason = data?.reason ?? "—";

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Forensic Snapshot"
      eyebrow={`Sealed evidence / ${data ? formatFullTime(data.killed_at) : "—"}`}
      description={`Agent ${agentId}`}
      className="max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:w-full max-md:translate-x-0 max-md:translate-y-0"
    >
      <div className="mb-4 flex items-center gap-2">
        <FileSearch size={16} strokeWidth={2} />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
          Termination reason
        </span>
        <span className="inline-flex h-7 items-center rounded-none border-2 border-ink bg-soft-red px-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
          {reason}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 font-mono text-[13px] text-ink-2">
          <LoaderCircle className="animate-spin" size={18} strokeWidth={2} />
          Retrieving frozen container snapshot
        </div>
      ) : error ? (
        <div className="border-2 border-ink bg-soft-red p-4 font-mono text-[13px]" role="alert">
          {error}
        </div>
      ) : data ? (
        <>
          <div role="tablist" aria-label="Forensic evidence" className="flex gap-2 border-b-2 border-ink">
            {TABS.map((item) => (
              <button
                key={item.id}
                id={`forensic-tab-${item.id}`}
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`forensic-panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${
                  tab === item.id ? "border-2 border-ink border-b-0 bg-soft-yellow" : "text-ink-2"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div id={`forensic-panel-${tab}`} role="tabpanel" aria-labelledby={`forensic-tab-${tab}`} className="mt-4">
            {tab === "processes" ? <ProcessTree processes={data.processes} /> : null}
            {tab === "fs_diff" ? <FsDiff fsDiff={data.fs_diff} /> : null}
            {tab === "logs" ? (
              <div>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void copyLogs()}
                    className="inline-flex items-center gap-1 rounded-none border-2 border-ink bg-bg px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] shadow-sm"
                  >
                    {copied ? <ClipboardCheck size={14} strokeWidth={2} /> : <Clipboard size={14} strokeWidth={2} />}
                    {copied ? "Copied" : "Copy logs"}
                  </button>
                </div>
                <LogView logs={data.logs} />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
