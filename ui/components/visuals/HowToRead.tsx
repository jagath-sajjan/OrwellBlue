import { Panel } from "@/components/ui/Panel";

const SWATCHES: Array<{ label: string; swatch: React.ReactNode }> = [
  { label: "Core (watchdog)", swatch: <Swatch className="bg-[#0052FF]" /> },
  { label: "Tether", swatch: <Swatch className="bg-ink h-1 w-4" /> },
  { label: "Black dot — heartbeat in", swatch: <Dot className="bg-ink" /> },
  { label: "Yellow packet — kill signal", swatch: <Swatch className="bg-soft-yellow rotate-45" /> },
  { label: "Green cube — running", swatch: <Swatch className="bg-soft-green" /> },
  { label: "Yellow cube — frozen", swatch: <Swatch className="bg-soft-yellow" /> },
  { label: "Red — violation", swatch: <Swatch className="bg-soft-red" /> },
  { label: "Slab — tombstone", swatch: <Swatch className="bg-ink h-3 w-2" /> },
  { label: "Boundary", swatch: <Swatch className="border-ink bg-bg rounded-full" /> },
];

export function HowToRead() {
  return (
    <Panel title="How to read this" eyebrow="Legend">
      <ul className="flex flex-col gap-2">
        {SWATCHES.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {item.swatch}
            </span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.04em]">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Swatch({ className }: { className?: string }) {
  return <span className={`block h-3.5 w-3.5 border-2 border-ink ${className ?? ""}`} />;
}

function Dot({ className }: { className?: string }) {
  return <span className={`block h-3 w-3 border-2 border-ink ${className ?? ""}`} />;
}
