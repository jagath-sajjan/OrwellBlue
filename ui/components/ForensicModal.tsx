"use client";

import { Clipboard, ClipboardCheck, FileSearch, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchForensics } from "../lib/api";
import type { ForensicSnapshot } from "../lib/types";

type ForensicTab = "processes" | "fs_diff" | "logs";

interface ForensicModalProps {
  agentId: string;
  onClose: () => void;
}

const tabs: Array<{ id: ForensicTab; label: string }> = [
  { id: "processes", label: "Process Tree" },
  { id: "fs_diff", label: "Filesystem Diff" },
  { id: "logs", label: "Container Logs" },
];

function timeLabel(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString("en-US", { hour12: false });
}

export default function ForensicModal({ agentId, onClose }: ForensicModalProps) {
  const [snapshot, setSnapshot] = useState<ForensicSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ForensicTab>("processes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetchForensics(agentId).then((value) => {
      if (active) setSnapshot(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Forensic snapshot unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [agentId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyLogs() {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.logs);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (reason) {
      setError(reason instanceof Error ? `Unable to copy logs: ${reason.message}` : "Unable to copy logs.");
    }
  }

  const logLines = snapshot?.logs.split("\n") ?? [];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="forensic-modal" role="dialog" aria-modal="true" aria-labelledby="forensic-title">
        <div className="modal-header">
          <div><span className="section-index">SEALED EVIDENCE{snapshot ? ` / ${timeLabel(snapshot.killed_at)}` : ""}</span><h2 id="forensic-title"><FileSearch size={19} /> Forensic Snapshot</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close forensics"><X size={18} /></button>
        </div>
        <div className="forensic-summary"><span>AGENT</span><strong>{agentId}</strong>{snapshot && <><span>TERMINATION REASON</span><strong className="text-red">{snapshot.reason}</strong></>}</div>
        <div className="forensic-tabs" role="tablist" aria-label="Forensic evidence">
          {tabs.map((tab) => <button key={tab.id} id={`forensic-tab-${tab.id}`} className={activeTab === tab.id ? "is-active" : ""} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`forensic-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
        </div>
        <div className="forensic-panel" id={`forensic-panel-${activeTab}`} role="tabpanel" aria-labelledby={`forensic-tab-${activeTab}`}>
          {loading && <div className="component-state"><LoaderCircle className="spin" size={18} />RETRIEVING FROZEN CONTAINER SNAPSHOT</div>}
          {error && <div className="component-error" role="alert">{error}</div>}
          {!loading && snapshot && activeTab === "processes" && <>
            <div className="forensic-section"><h3>PROCESS TREE / SIGSTOP CAPTURE <small>{snapshot.processes.length} RECORDS</small></h3>
              <div className="forensic-table"><div className="forensic-table-head"><span>PID</span><span>USER</span><span>EXACT COMMAND AT FREEZE</span></div>
                {snapshot.processes.map((process) => <div className="forensic-table-row" key={`${process.pid}-${process.cmd}`}><span>{process.pid}</span><span>{process.user}</span><code title={process.cmd}>{process.cmd}</code></div>)}
              </div>
            </div>
          </>}
          {!loading && snapshot && activeTab === "fs_diff" && <div className="forensic-section">
            <h3>FILESYSTEM DIFF <small>{snapshot.fs_diff.length} CHANGES</small></h3>
            {snapshot.fs_diff.map((change) => <div className="fs-row" key={change.path}><span className={`diff-kind kind-${change.kind}`} aria-label={change.kind === "C" ? "Modified" : change.kind === "A" ? "Added" : "Deleted"}>{change.kind}</span><code>{change.path}</code><span className={`diff-label kind-label-${change.kind}`}>{change.kind === "C" ? "MODIFIED" : change.kind === "A" ? "ADDED" : "DELETED"}</span></div>)}
            {!snapshot.fs_diff.length && <div className="empty-evidence">NO FILESYSTEM CHANGES RECORDED</div>}
          </div>}
          {!loading && snapshot && activeTab === "logs" && <div className="forensic-section">
            <h3>CONTAINER STDOUT / STDERR TAIL <small>{logLines.length} LINES</small></h3>
            <div className="log-terminal">
              <button className="copy-logs-button" type="button" onClick={() => void copyLogs()} aria-label="Copy container logs">{copied ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}{copied ? "COPIED" : "COPY LOGS"}</button>
              <pre>{logLines.map((line, index) => <span className={/\b(violation|trigger|breach)\b/i.test(line) ? "log-violation" : ""} key={`${index}-${line}`}>{line || " "}{index < logLines.length - 1 ? "\n" : ""}</span>)}</pre>
            </div>
          </div>}
        </div>
      </section>
    </div>
  );
}
