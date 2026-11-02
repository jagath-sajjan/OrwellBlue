"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  id?: string;
}

export function Switch({ checked, onCheckedChange, label, id }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-8 w-14 shrink-0 rounded-none border-2 border-ink bg-bg shadow-sm transition-[transform,box-shadow] duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md data-[state=checked]:bg-soft-green"
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-none border-2 border-ink bg-ink transition-transform duration-100 data-[state=checked]:translate-x-6" />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  return (
    <label className="flex items-center gap-2" htmlFor={id}>
      {control}
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
        {label}
      </span>
    </label>
  );
}
