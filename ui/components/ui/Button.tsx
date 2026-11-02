"use client";

import { LoaderCircle } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ForwardedRef,
  forwardRef,
} from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pending?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg",
  secondary: "bg-bg text-ink",
  danger: "bg-soft-red text-ink",
  ghost: "bg-transparent text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-sm",
  icon: "h-11 w-11 p-0",
};

const press =
  "transition-[transform,box-shadow] duration-100 ease-out " +
  "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md " +
  "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none " +
  "disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-sm " +
  "disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-sm";

function ButtonBase(
  {
    variant = "primary",
    size = "md",
    pending = false,
    disabled,
    className,
    children,
    type = "button",
    ...props
  }: ButtonProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || pending}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap",
        "rounded-none border-2 border-ink font-mono font-bold uppercase tracking-[0.08em]",
        "shadow-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        press,
        className,
      )}
      {...props}
    >
      {pending ? <LoaderCircle className="animate-spin" size={16} strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

export const Button = forwardRef(ButtonBase);
Button.displayName = "Button";
