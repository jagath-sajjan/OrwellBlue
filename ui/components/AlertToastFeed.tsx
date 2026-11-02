"use client";

import { AlertOctagon, FileSearch, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EventType, SandboxEvent } from "../lib/types";

interface AlertToastFeedProps {
  events: SandboxEvent[];
  onInspect: (agentId: string) => void;
}

const criticalTypes = new Set<EventType>([
  "ssrf_attempt",
  "tripwire",
  "privesc_attempt",
  "egress_attempt",
  "kill",
  "self_destruct",
]);

function toastKey(event: SandboxEvent) {
  return `${event.id}:${event.hash}`;
}

export default function AlertToastFeed({ events, onInspect }: AlertToastFeedProps) {
  const [toasts, setToasts] = useState<SandboxEvent[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const additions = events.filter((event) => event.severity === 3 && criticalTypes.has(event.type) && !seen.current.has(toastKey(event)));
    if (!additions.length) return;
    additions.forEach((event) => seen.current.add(toastKey(event)));

    const appendTimer = window.setTimeout(() => {
      setToasts((current) => [...additions, ...current].slice(0, 5));
      additions.forEach((event) => {
        const key = toastKey(event);
        const timer = window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toastKey(toast) !== key));
          timers.current.delete(key);
        }, 9000);
        timers.current.set(key, timer);
      });
    }, 0);
    return () => window.clearTimeout(appendTimer);
  }, [events]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  return (
    <aside className="alert-toast-feed" aria-label="Critical containment alerts" aria-live="assertive">
      {toasts.map((event) => {
        const key = toastKey(event);
        return <article className="alert-toast" key={key} role="status">
          <div className="alert-toast-icon"><AlertOctagon size={18} /></div>
          <div className="alert-toast-copy">
            <strong>[CRITICAL] Agent {event.agent_id} triggered {event.type} -&gt; Watchdog Action: FROZEN &amp; KILLED</strong>
            {event.type === "kill" && <button className="toast-forensic-link" type="button" onClick={() => onInspect(event.agent_id)}><FileSearch size={12} />Open Forensic Snapshot</button>}
          </div>
          <button className="toast-dismiss" type="button" aria-label="Dismiss critical alert" onClick={() => {
            setToasts((current) => current.filter((toast) => toastKey(toast) !== key));
            const timer = timers.current.get(key);
            if (timer !== undefined) window.clearTimeout(timer);
            timers.current.delete(key);
          }}><X size={14} /></button>
        </article>;
      })}
    </aside>
  );
}
