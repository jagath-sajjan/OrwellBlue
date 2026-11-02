"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { motion } from "framer-motion";
import { Crosshair } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { cn } from "@/components/ui/cn";
import { NAV_ITEMS } from "./nav";
import { ConnectionPill, ContainmentChip, ModeSwitch } from "./ConnectionControls";

export function Sidebar() {
  const pathname = usePathname();
  const { breach } = useDashboard();

  return (
    <Tooltip.Provider delayDuration={200}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r-2 border-ink bg-bg md:flex lg:w-[248px]">
        {/* Wordmark */}
        <div className="flex h-16 items-center gap-3 border-b-2 border-ink px-4">
          <span className="flex size-10 shrink-0 items-center justify-center border-2 border-ink bg-soft-yellow shadow-sm">
            <Crosshair size={18} strokeWidth={2} />
          </span>
          <div className="hidden lg:block">
            <p className="font-display text-lg uppercase leading-none tracking-[-0.02em]">OrwellBlue</p>
            <p className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-2">
              Mission Control
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-2 p-3" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const locked = breach.active && item.href !== "/ledger";
            const Icon = item.icon;

            const inner = (
              <>
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-none border-2 border-ink bg-soft-yellow shadow-sm"
                    transition={{ type: "spring", stiffness: 600, damping: 40 }}
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-3">
                  <Icon size={18} strokeWidth={2} className="shrink-0" />
                  <span className="hidden font-mono text-xs font-bold uppercase tracking-[0.08em] lg:block">
                    {item.label}
                  </span>
                </span>
              </>
            );

            const className = cn(
              "relative flex h-11 items-center rounded-none border-2 px-3",
              active ? "border-ink text-ink" : "border-transparent text-ink hover:bg-surface-2",
              locked && "cursor-not-allowed opacity-40",
            );

            if (locked) {
              return (
                <span key={item.href} className={className} aria-disabled="true">
                  {inner}
                </span>
              );
            }

            return (
              <Tooltip.Root key={item.href}>
                <Tooltip.Trigger asChild>
                  <Link href={item.href} className={className}>
                    {inner}
                  </Link>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={8}
                    className="hidden rounded-none border-2 border-ink bg-ink px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-bg shadow-sm md:block lg:hidden"
                  >
                    {item.label}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="mt-auto flex flex-col gap-3 border-t-2 border-ink p-4">
          <div className="hidden lg:block">
            <ConnectionPill />
          </div>
          <div className="hidden lg:block">
            <ModeSwitch />
          </div>
          <div className="flex justify-center lg:justify-start">
            <ContainmentChip />
          </div>
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
