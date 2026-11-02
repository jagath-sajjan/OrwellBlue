"use client";

import { AlertTriangle, Check, ChevronRight, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getUseMockMode, simulateMockTamper, verifyHashChain } from "../lib/api";
import type { ChainVerification, SandboxEvent } from "../lib/types";

interface ChainLedgerDrawerProps {
  events: SandboxEvent[];
  initialVerification: ChainVerification | null;
  mockMode: boolean;
  onClose: () => void;
  onTamper: (event: SandboxEvent) => void;
  onError: (message: string) => void;
  onVerification: (verification: ChainVerification) => void;
}

function timeLabel(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString("en-US", { hour12: false });
}

export default function ChainLedgerDrawer({ events, initialVerification, mockMode, onClose, onTamper, onError, onVerification }: ChainLedgerDrawerProps) {
  const blocks = useMemo(() => events.slice(0, 15).reverse(), [events]);
  const [verification, setVerification] = useState(initialVerification);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function verify() {
    setVerifying(true);
    setVerification(null);
    setVerifiedCount(0);
    try {
      const result = await verifyHashChain();
      for (let index = 0; index < blocks.length; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 75));
        setVerifiedCount(index + 1);
      }
      setVerification(result);
      onVerification(result);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Unable to verify hash chain.");
    } finally {
      setVerifying(false);
    }
  }

  async function simulateTamper() {
    try {
      if (!getUseMockMode()) throw new Error("Log tampering simulation is only available in Mock Mode.");
      const event = await simulateMockTamper();
      const result = { valid: false, total_events: event.id, broken_at_id: 4 };
      setVerification(result);
      onVerification(result);
      onTamper(event);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Unable to simulate log tampering.");
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="chain-drawer" role="dialog" aria-modal="true" aria-labelledby="chain-drawer-title">
        <header className="chain-drawer-header">
          <div><span className="section-index">IMMUTABLE EVENT AUDIT</span><h2 id="chain-drawer-title"><ShieldCheck size={19} /> SHA-256 Chain Ledger</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close chain ledger"><X size={18} /></button>
        </header>
        <div className={`chain-verdict ${verification?.valid === false ? "verdict-broken" : verification?.valid ? "verdict-valid" : ""}`}>
          {verification?.valid === false ? <AlertTriangle size={17} /> : verification?.valid ? <Check size={17} /> : <ShieldCheck size={17} />}
          <span>{verification ? verification.valid ? "INTEGRITY VERIFIED" : `CHAIN FAILURE / BLOCK #${verification.broken_at_id ?? "UNKNOWN"}` : "VERIFICATION REQUIRED"}</span>
          <small>{verification ? `${verification.total_events} EVENTS` : `${blocks.length} BLOCKS LOADED`}</small>
        </div>
        <div className="chain-actions">
          <button className="verify-button" type="button" onClick={() => void verify()} disabled={verifying}><RefreshCw className={verifying ? "spin" : ""} size={14} />{verifying ? "VERIFYING BLOCKS..." : "VERIFY INTEGRITY NOW"}</button>
          {mockMode && <button className="tamper-button" type="button" onClick={() => void simulateTamper()}><AlertTriangle size={14} />SIMULATE SQLITE LOG TAMPER</button>}
        </div>
        <div className="chain-block-list">
          {!blocks.length && <div className="empty-evidence">NO SANDBOX EVENTS RECORDED</div>}
          {blocks.map((event, index) => {
            const isBroken = verification?.valid === false && event.id === verification.broken_at_id;
            const isVerified = verifying ? index < verifiedCount : verification?.valid === true;
            return <article className={`chain-block ${isBroken ? "block-broken" : ""} ${isVerified ? "block-verified" : ""}`} key={`${event.id}-${event.hash}`}>
              <div className="chain-link-mark">{index === 0 ? <span>GENESIS</span> : <ChevronRight size={14} />}</div>
              <div className="chain-block-body">
                <div className="chain-block-title"><strong>BLOCK #{event.id}</strong><span className={isBroken ? "text-red" : `severity-label severity-${event.severity}`}>{event.type.toUpperCase()}</span>{isVerified && <Check size={13} className="block-check" />}{isBroken && <AlertTriangle size={13} />}</div>
                <code className="chain-hashes"><span>{event.prev_hash.slice(0, 10)}</span><i>→</i><span>{event.hash.slice(0, 10)}</span></code>
                <time>{timeLabel(event.ts)}</time>
              </div>
            </article>;
          })}
        </div>
        <footer className="chain-drawer-footer">HASHES SHOWN AS FIRST 10 HEX CHARACTERS · BLOCKS IN CHRONOLOGICAL ORDER</footer>
      </aside>
    </div>
  );
}
