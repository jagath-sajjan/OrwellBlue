"use client";

import { AlertOctagon, FlaskConical, RotateCcw, ShieldCheck, Siren } from "lucide-react";
import { useState } from "react";
import type { AgentProfile } from "../lib/types";

interface AttackLabBarProps {
  locked: boolean;
  mockMode: boolean;
  onLaunch: (agentId: string, profile: AgentProfile) => Promise<void>;
  onTamper: () => Promise<void>;
  onReset: () => Promise<void>;
  onError: (message: string) => void;
}

const attackPresets: Array<{ label: string; profile: Exclude<AgentProfile, "benign"> }> = [
  { label: "SSRF Metadata Probe", profile: "ssrf" },
  { label: "Honeytoken Tripwire Read", profile: "tripwire" },
  { label: "Root Privesc Attempt", profile: "privesc" },
  { label: "Unauthorized Egress", profile: "egress" },
  { label: "Heartbeat Drop / Silent", profile: "silent" },
];

export default function AttackLabBar({ locked, mockMode, onLaunch, onTamper, onReset, onError }: AttackLabBarProps) {
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    onError("");
    try {
      await action();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "The demo action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="attack-lab" aria-label="Containment demo controls">
      <div className="attack-lab-heading">
        <div><FlaskConical size={15} /><span>ATTACK LAB / 1-CLICK DEMOS</span></div>
        <small>{mockMode ? "SIMULATED ENVIRONMENT" : "LIVE CONTAINER ENVIRONMENT"}</small>
      </div>
      <div className="attack-lab-controls">
        <button className="lab-safe-button" type="button" disabled={locked || busy} onClick={() => void run(() => onLaunch("benign-01", "benign"))}>
          <ShieldCheck size={14} />LAUNCH SAFE AGENT <small>(BENIGN)</small>
        </button>
        <span className="lab-divider" aria-hidden="true" />
        <div className="attack-presets" aria-label="Rogue attack presets">
          {attackPresets.map(({ label, profile }) => <button key={profile} className="lab-attack-button" type="button" disabled={locked || busy} onClick={() => void run(() => onLaunch(`${profile}-${Date.now().toString(36)}`, profile))}>{label}</button>)}
        </div>
        <button className="lab-breach-button" type="button" disabled={busy} onClick={() => void run(onTamper)}><Siren size={14} />SIMULATE WRAPPER BREACH (SELF-DESTRUCT)</button>
        <button className="lab-reset-button" type="button" disabled={busy} onClick={() => void run(onReset)}><RotateCcw size={14} />RESET SANDBOX ENVIRONMENT</button>
        {locked && <span className="lab-locked"><AlertOctagon size={12} />SPAWN CONTROLS LOCKED</span>}
      </div>
    </section>
  );
}
