"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { useToast } from "@/components/ui/Toast";
import type { EventType } from "@/lib/types";

const CRITICAL_TYPES = new Set<EventType>([
  "ssrf_attempt",
  "tripwire",
  "privesc_attempt",
  "egress_attempt",
  "shared_write",
  "comms_attempt",
  "kill",
  "self_destruct",
]);

export function CriticalAlerts() {
  const { events } = useDashboard();
  const { toast } = useToast();
  const router = useRouter();
  const seen = useRef(new Set<string>());

  useEffect(() => {
    for (const event of events) {
      if (event.severity !== 3 || !CRITICAL_TYPES.has(event.type)) continue;
      const dedupeKey = `${event.id}:${event.hash}`;
      if (seen.current.has(dedupeKey)) continue;
      seen.current.add(dedupeKey);

      const isKill = event.type === "kill";
      toast({
        key: `agent-${event.agent_id}`,
        tone: "red",
        title: `Critical — ${event.agent_id}`,
        description: `${event.type.replaceAll("_", " ")} · ${String(event.detail.reason ?? "")}`.trim(),
        actionLabel: isKill ? "Open Forensics" : undefined,
        onAction: isKill
          ? () => router.push(`/fleet?forensics=${encodeURIComponent(event.agent_id)}`)
          : undefined,
      });
    }
  }, [events, toast, router]);

  return null;
}
