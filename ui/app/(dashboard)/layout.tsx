"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CriticalAlerts } from "@/components/alerts/CriticalAlerts";
import { ForensicsGate } from "@/components/forensics/ForensicsGate";
import { BreachBanner } from "@/components/shell/BreachBanner";
import { ErrorBanner } from "@/components/shell/ErrorBanner";
import { MobileTopBar } from "@/components/shell/MobileTopBar";
import { Sidebar } from "@/components/shell/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <MobileTopBar />
      <CriticalAlerts />
      <ForensicsGate />
      <div className="md:pl-[72px] lg:pl-[248px]">
        <main className="mx-auto max-w-[1280px] p-4 sm:p-6">
          <BreachBanner />
          <ErrorBanner />
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="mt-8"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
