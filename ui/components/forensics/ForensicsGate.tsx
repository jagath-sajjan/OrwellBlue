"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ForensicModal } from "@/components/ForensicModal";

function ForensicsGateInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const agentId = searchParams.get("forensics");

  if (!agentId) return null;

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("forensics");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return <ForensicModal key={agentId} agentId={agentId} onClose={close} />;
}

export function ForensicsGate() {
  return (
    <Suspense fallback={null}>
      <ForensicsGateInner />
    </Suspense>
  );
}
