import {
  type ForwardedRef,
  forwardRef,
  type InputHTMLAttributes,
} from "react";
import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

function InputBase(
  { label, className, id, ...props }: InputProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const input = (
    <input
      ref={ref}
      id={id}
      className={cn(
        "h-11 w-full rounded-none border-2 border-ink bg-bg px-3",
        "font-mono text-sm tracking-normal text-ink",
        "placeholder:text-ink-2",
        "transition-[box-shadow] duration-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
      {...props}
    />
  );

  if (!label) return input;

  return (
    <label className="flex flex-col gap-1.5" htmlFor={id}>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
        {label}
      </span>
      {input}
    </label>
  );
}

export const Input = forwardRef(InputBase);
Input.displayName = "Input";
