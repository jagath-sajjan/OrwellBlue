import { Chip, type ChipTone } from "@/components/ui/Chip";
import { statusMeta, type StatusKind } from "@/lib/format";

export function StatusChip({ status, className }: { status: StatusKind; className?: string }) {
  const meta = statusMeta(status);
  return <Chip tone={meta.tone} label={meta.label} dot className={className} />;
}

export function SeverityChip({ severity, className }: { severity: number; className?: string }) {
  const tone: ChipTone =
    severity <= 0 ? "white" : severity === 1 ? "yellow" : "red";
  const label =
    severity <= 0 ? "Info" : severity === 1 ? "Low" : severity === 2 ? "High" : "Critical";
  return <Chip tone={tone} label={label} className={className} />;
}
