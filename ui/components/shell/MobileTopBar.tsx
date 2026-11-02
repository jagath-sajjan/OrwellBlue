"use client";

import { Crosshair, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { cn } from "@/components/ui/cn";
import { Sheet } from "@/components/ui/Sheet";
import { NAV_ITEMS } from "./nav";
import { ConnectionPill, ContainmentChip, ModeSwitch } from "./ConnectionControls";

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { breach } = useDashboard();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-ink bg-bg px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center border-2 border-ink bg-soft-yellow shadow-sm">
            <Crosshair size={16} strokeWidth={2} />
          </span>
          <span className="font-display text-lg uppercase tracking-[-0.02em]">OrwellBlue</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex size-11 items-center justify-center rounded-none border-2 border-ink bg-bg shadow-sm"
        >
          <Menu size={18} strokeWidth={2} />
        </button>
      </header>

      <Sheet open={open} onOpenChange={setOpen} title="Navigation" side="right">
        <nav className="flex flex-col gap-2" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const locked = breach.active && item.href !== "/ledger";
            const Icon = item.icon;
            const className = cn(
              "flex h-11 items-center gap-3 rounded-none border-2 px-3 font-mono text-xs font-bold uppercase tracking-[0.08em]",
              active ? "border-ink bg-soft-yellow text-ink shadow-sm" : "border-ink bg-bg text-ink",
              locked && "cursor-not-allowed opacity-40",
            );

            if (locked) {
              return (
                <span key={item.href} className={className} aria-disabled="true">
                  <Icon size={18} strokeWidth={2} />
                  {item.label}
                </span>
              );
            }
            return (
              <Link key={item.href} href={item.href} className={className} onClick={() => setOpen(false)}>
                <Icon size={18} strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 flex flex-col gap-3 border-t-2 border-ink pt-4">
          <ConnectionPill />
          <ModeSwitch />
          <ContainmentChip />
        </div>
      </Sheet>
    </>
  );
}
