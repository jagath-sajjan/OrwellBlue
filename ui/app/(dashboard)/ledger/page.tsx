"use client";

import { Fingerprint, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { SeverityChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { eventTypeLabel, formatClockTime, shortHash } from "@/lib/format";
import type { ChainBreakDetail, EventType, SandboxEvent } from "@/lib/types";

const EVENT_TYPES: EventType[] = [
  "info",
  "heartbeat",
  "egress_attempt",
  "ssrf_attempt",
  "privesc_attempt",
  "shared_write",
  "comms_attempt",
  "tripwire",
  "heartbeat_lost",
  "kill",
  "self_destruct",
];

const PAGE_SIZE = 200;

function DetailWell({ event }: { event: SandboxEvent }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap border-2 border-ink bg-surface-2 p-4 font-mono text-[12px] leading-relaxed">
      {JSON.stringify(event.detail, null, 2)}
    </pre>
  );
}

function BreakDetail({ detail }: { detail: ChainBreakDetail | null | undefined }) {
  if (!detail) return null;
  const hashMismatch = detail.reason === "hash_mismatch";
  return (
    <div className="border-2 border-ink bg-soft-red p-4 font-mono text-[12px]">
      <div className="font-bold uppercase tracking-[0.08em]">
        {hashMismatch ? "Content tampered" : "Link tampered"}
      </div>
      <div className="mt-1 text-ink-2">
        {hashMismatch
          ? "Stored hash does not match the recomputed SHA-256 of this block."
          : "The previous-hash field does not match the prior block's hash."}
      </div>
      <div className="mt-3 grid gap-2">
        {hashMismatch && detail.expected_hash ? (
          <>
            <div>
              EXPECTED <code className="break-all">{detail.expected_hash}</code>
            </div>
            <div>
              STORED <code className="break-all">{detail.stored_hash}</code>
            </div>
          </>
        ) : (
          <>
            <div>
              EXPECTED PREV <code className="break-all">{detail.expected_prev_hash}</code>
            </div>
            <div>
              STORED PREV <code className="break-all">{detail.stored_prev_hash}</code>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LedgerPage() {
  const { events, chain, pending, verifyChain } = useDashboard();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const hiddenHeartbeats = events.filter((event) => event.type === "heartbeat").length;

  const filtered = events.filter((event) => {
    if (!showHeartbeats && event.type === "heartbeat") return false;
    if (severityFilter !== "all" && event.severity !== Number(severityFilter)) return false;
    if (typeFilter !== "all" && event.type !== typeFilter) return false;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const chainValid = chain?.valid ?? null;

  function toggleExpanded(id: number) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div>
      <PageHeader
        eyebrow="04 / Ledger"
        title="Ledger"
        description="SHA-256 hash-chained audit of every sandbox event."
        action={
          <Button pending={pending.verify} onClick={() => void verifyChain()}>
            <RefreshCw size={15} strokeWidth={2} />
            Verify integrity
          </Button>
        }
      />

      {/* Chain status + verify result */}
      <div className="mt-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex h-8 items-center gap-2 rounded-none border-2 border-ink px-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${
              chainValid === false
                ? "bg-soft-red"
                : chainValid
                  ? "bg-soft-green"
                  : "bg-soft-yellow"
            }`}
          >
            <Fingerprint size={13} strokeWidth={2} />
            {chainValid === false ? "Chain broken" : chainValid ? "Chain valid" : "Chain pending"}
          </span>
          {chain ? (
            <span className="font-mono text-[12px] text-ink-2 tabular-nums">
              {chain.total_events} blocks
            </span>
          ) : null}
        </div>

        {chain && chainValid === false ? (
          <div className="flex flex-col gap-3" role="alert">
            <div className="border-2 border-ink bg-soft-red p-3 font-mono text-[13px] font-bold uppercase tracking-[0.08em]">
              Chain broken at block #{chain.broken_at_id ?? "unknown"}
            </div>
            <BreakDetail detail={chain.break} />
          </div>
        ) : null}
      </div>

      {/* Filters */}
      <Panel padded className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Severity"
            value={severityFilter}
            onValueChange={setSeverityFilter}
            options={[
              { value: "all", label: "All levels" },
              { value: "0", label: "Info" },
              { value: "1", label: "Low" },
              { value: "2", label: "High" },
              { value: "3", label: "Critical" },
            ]}
          />
          <Select
            label="Event type"
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={[
              { value: "all", label: "All events" },
              ...EVENT_TYPES.map((type) => ({ value: type, label: eventTypeLabel(type) })),
            ]}
          />
          <div className="flex items-end">
            <Switch
              id="show-heartbeats"
              checked={showHeartbeats}
              onCheckedChange={setShowHeartbeats}
              label={showHeartbeats ? "Show heartbeats" : "Hide heartbeats"}
            />
          </div>
        </div>
        {!showHeartbeats && hiddenHeartbeats > 0 ? (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
            {hiddenHeartbeats} heartbeats hidden
          </p>
        ) : null}
      </Panel>

      {/* Desktop table */}
      <div className="mt-8 hidden overflow-x-auto border-2 border-ink md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-2 text-left font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
              <th className="border-b-2 border-ink px-4 py-3">Time</th>
              <th className="border-b-2 border-ink px-4 py-3">Agent</th>
              <th className="border-b-2 border-ink px-4 py-3">Event</th>
              <th className="border-b-2 border-ink px-4 py-3">Severity</th>
              <th className="border-b-2 border-ink px-4 py-3">Block</th>
              <th className="border-b-2 border-ink px-4 py-3">Prev -&gt; hash</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((event) => (
              <RowContent
                key={`${event.id}-${event.hash}`}
                event={event}
                expanded={expandedId === event.id}
                broken={chain?.broken_at_id === event.id}
                breakDetail={chain?.broken_at_id === event.id ? chain.break : null}
                onToggle={() => toggleExpanded(event.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="mt-8 flex flex-col gap-3 md:hidden">
        {visible.map((event) => {
          const broken = chain?.broken_at_id === event.id;
          return (
            <article
              key={`${event.id}-${event.hash}`}
              className={`border-2 border-ink shadow-sm ${broken ? "bg-soft-red" : "bg-bg"}`}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(event.id)}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-ink-2 tabular-nums">{formatClockTime(event.ts)}</div>
                  <div className="truncate font-mono text-[13px] font-bold uppercase tracking-[0.04em]">{event.agent_id}</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.08em]">{eventTypeLabel(event.type)}</div>
                </div>
                <SeverityChip severity={event.severity} />
              </button>
              {expandedId === event.id ? (
                <div className="flex flex-col gap-3 border-t-2 border-ink p-4">
                  {broken ? <BreakDetail detail={chain?.break} /> : null}
                  <DetailWell event={event} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 border-2 border-dashed border-ink p-10 text-center font-mono text-[13px] text-ink-2">
          No events match the current filters.
        </p>
      ) : null}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Load older
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RowContent({
  event,
  expanded,
  broken,
  breakDetail,
  onToggle,
}: {
  event: SandboxEvent;
  expanded: boolean;
  broken: boolean;
  breakDetail: ChainBreakDetail | null | undefined;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer border-b-2 border-ink transition-colors ${
          broken ? "bg-soft-red" : "hover:bg-surface-2"
        } ${
          event.severity === 1 ? "row-flash-warn" : event.severity >= 2 ? "row-flash-critical" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-mono text-[11px] text-ink-2 tabular-nums">
          {formatClockTime(event.ts)}
        </td>
        <td className="px-4 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.04em]">
          {event.agent_id}
        </td>
        <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em]">
          {eventTypeLabel(event.type)}
        </td>
        <td className="px-4 py-3">
          <SeverityChip severity={event.severity} />
        </td>
        <td className="px-4 py-3 font-mono text-[11px] text-ink-2 tabular-nums">#{event.id}</td>
        <td className="px-4 py-3 font-mono text-[11px] tabular-nums">
          {shortHash(event.prev_hash)} <span className="text-ink-2">-&gt;</span> {shortHash(event.hash)}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="border-b-2 border-ink bg-bg p-4">
            <div className="flex flex-col gap-3">
              {broken ? <BreakDetail detail={breakDetail} /> : null}
              <DetailWell event={event} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
