"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  children,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/50" />
        <RadixDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[880px] -translate-x-1/2 -translate-y-1/2",
            "rounded-none border-2 border-ink bg-bg shadow-lg",
            "max-h-[88vh] overflow-y-auto",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b-2 border-ink p-5">
            <div>
              {eyebrow ? (
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
                  {eyebrow}
                </p>
              ) : null}
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
