"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: "bottom" | "right";
  children: ReactNode;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "bottom",
  children,
}: SheetProps) {
  const isBottom = side === "bottom";

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/50" />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 rounded-none border-2 border-ink bg-bg shadow-lg",
            isBottom
              ? "inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto"
              : "inset-y-0 right-0 w-[min(590px,100vw)] overflow-y-auto",
          )}
        >
          <header className="sticky top-0 flex items-start justify-between gap-4 border-b-2 border-ink bg-bg p-5">
            <div>
              <RadixDialog.Title className="font-display text-xl uppercase">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 font-mono text-[13px] leading-snug text-ink-2">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="flex size-11 shrink-0 items-center justify-center rounded-none border-2 border-ink bg-bg shadow-sm transition-[transform,box-shadow] duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <X size={18} strokeWidth={2} />
            </RadixDialog.Close>
          </header>
          <div className="p-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
