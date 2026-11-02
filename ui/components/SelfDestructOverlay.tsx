"use client";

import { AlertOctagon, RotateCcw } from "lucide-react";

interface SelfDestructOverlayProps {
  active: boolean;
  reason: string;
  mockMode: boolean;
  onReset: () => void;
}

export default function SelfDestructOverlay({ active, reason, mockMode, onReset }: SelfDestructOverlayProps) {
  if (!active) return null;

  return (
    <div className="lockdown-overlay" role="alertdialog" aria-modal="true" aria-labelledby="lockdown-title">
      <div className="lockdown-noise" />
      <div className="lockdown-content">
        <div className="lockdown-symbol"><AlertOctagon size={42} /></div>
        <span className="lockdown-kicker">WATCHDOG / CONTAINMENT FAILURE</span>
        <h2 id="lockdown-title">WRAPPER CONTAINMENT<br />BREACH DETECTED —<br />HARDCODED SELF-DESTRUCT EXECUTED</h2>
        <p className="lockdown-reason"><strong>BREACH REASON</strong><span>{reason || "Wrapper integrity failure detected."}</span></p>
        <p className="kill-confirmation">ALL MANAGED AGENT CONTAINERS CONFIRMED SIGKILLed. NORMAL SPAWN OPERATIONS LOCKED.</p>
        <button type="button" onClick={onReset}><RotateCcw size={15} />{mockMode ? "RESET MOCK SIMULATION" : "RESET SANDBOX ENVIRONMENT"}</button>
      </div>
    </div>
  );
}
