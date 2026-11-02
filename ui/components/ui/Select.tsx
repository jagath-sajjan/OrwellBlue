"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
}

export function Select({
  label,
  placeholder = "Select",
  value,
  onValueChange,
  options,
  disabled = false,
  className,
}: SelectProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
          {label}
        </span>
      ) : null}
      <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <RadixSelect.Trigger
          className={cn(
            "flex h-11 items-center justify-between gap-2 rounded-none border-2 border-ink bg-bg px-3",
            "font-mono text-sm uppercase tracking-[0.06em] text-ink",
            "shadow-sm transition-[transform,box-shadow] duration-100",
            "data-[state=open]:-translate-x-0.5 data-[state=open]:-translate-y-0.5 data-[state=open]:shadow-md",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          aria-label={label}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDown size={16} strokeWidth={2} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-none border-2 border-ink bg-bg shadow-md"
          >
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "flex h-10 cursor-pointer items-center justify-between gap-2 px-3",
                    "font-mono text-sm uppercase tracking-[0.06em] text-ink",
                    "data-[highlighted]:bg-soft-yellow data-[state=checked]:bg-soft-green",
                  )}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Check size={14} strokeWidth={2} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}
