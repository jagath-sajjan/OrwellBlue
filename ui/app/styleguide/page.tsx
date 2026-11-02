"use client";

import { AlertOctagon, Crosshair, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Select } from "@/components/ui/Select";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function DemoActions() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => toast({ title: "Critical: agent killed", description: "Forensic snapshot saved.", tone: "red", actionLabel: "Open Forensics" })}>
        Red toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: "Heartbeat recovered", tone: "green" })}>
        Green toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: "Agent queued", tone: "yellow" })}>
        Yellow toast
      </Button>
    </div>
  );
}

export default function StyleguidePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [profile, setProfile] = useState("benign");
  const [pending, setPending] = useState(false);

  return (
    <ToastProvider>
      <main className="mx-auto max-w-[1280px] p-6">
        <div className="mb-8">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
            Dev only
          </p>
          <h1 className="font-display text-[clamp(28px,4vw,44px)] uppercase leading-none">
            Styleguide
          </h1>
        </div>

        <div className="flex flex-col gap-8">
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { tone: "green" as const, label: "Running" },
              { tone: "yellow" as const, label: "Queued" },
              { tone: "red" as const, label: "Killed" },
              { tone: "white" as const, label: "Exited" },
              { tone: "neutral" as const, label: "Info" },
            ].map((chip) => (
              <Chip key={chip.label} tone={chip.tone} label={chip.label} dot />
            ))}
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl uppercase">Buttons</h2>
            <div className="flex flex-wrap gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="ghost">Ghost</Button>
              <Button pending={pending} onClick={() => setPending((v) => !v)}>
                {pending ? "Pending" : "Toggle pending"}
              </Button>
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl uppercase">Panels + stats</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Agents running" value="3 / 7" hint="Of total fleet" icon={<ShieldCheck size={16} />} tone="green" />
              <Stat label="Events recorded" value="128" hint="Loaded this session" />
              <Stat label="Chain blocks" value="128" hint="SHA-256" />
              <Stat label="Kills" value="4" tone="red" icon={<AlertOctagon size={16} />} />
            </div>
            <div className="mt-4">
              <Panel title="Containment status" eyebrow="Watchdog armed">
                <p className="font-mono text-sm text-ink-2">Panel with title and inset content below.</p>
              </Panel>
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl uppercase">Form controls</h2>
            <div className="grid max-w-md gap-4">
              <Input label="Agent ID" placeholder="agent-delta" />
              <Select
                label="Scenario profile"
                value={profile}
                onValueChange={setProfile}
                options={[
                  { value: "benign", label: "Benign" },
                  { value: "ssrf", label: "SSRF Metadata Probe" },
                  { value: "tripwire", label: "Honeytoken Tripwire Read" },
                ]}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl uppercase">Overlays</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                Open dialog
              </Button>
              <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                Open sheet
              </Button>
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl uppercase">Loading + empty</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
              <EmptyState
                icon={<Crosshair size={20} />}
                title="No agents deployed"
                description="Initialize a sandbox from the fleet page."
              />
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-display text-xl uppercase">Toasts</h2>
            <DemoActions />
          </section>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Forensic Snapshot"
          eyebrow="Sealed evidence"
          description="Focus is trapped and Escape closes."
        >
          <p className="font-mono text-sm text-ink-2">Dialog body content.</p>
        </Dialog>

        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Chain Ledger"
          description="Mobile sheet example."
        >
          <p className="font-mono text-sm text-ink-2">Sheet body content.</p>
        </Sheet>
      </main>
    </ToastProvider>
  );
}
