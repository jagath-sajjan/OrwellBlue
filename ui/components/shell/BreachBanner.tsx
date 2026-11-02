"use client";

import { motion } from "framer-motion";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { useDashboard } from "@/components/providers/DashboardProvider";
import { Button } from "@/components/ui/Button";

export function BreachBanner() {
  const { breach, pending, reset } = useDashboard();
  if (!breach.active) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="border-2 border-ink bg-soft-red p-5 shadow-md"
      role="alert"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertOctagon size={22} strokeWidth={2} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-display text-lg uppercase leading-tight tracking-[-0.02em]">
              Wrapper breach · self-destruct executed
            </p>
            <p className="mt-1 font-mono text-[13px] leading-snug text-ink">
              {breach.reason || "Wrapper integrity failure detected."}
            </p>
            <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em]">
              All agent containers killed · spawning locked
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          pending={pending.reset}
          onClick={() => void reset()}
          className="self-start sm:self-center"
        >
          <RotateCcw size={15} strokeWidth={2} />
          Reset
        </Button>
      </div>
    </motion.div>
  );
}
