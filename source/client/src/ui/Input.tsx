import React, { InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "./cn";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  error?: string;
  hint?: string;
  /** e.g. a unit label like "px" or "%" */
  suffix?: string;
  /** e.g. an icon or "#" for color fields */
  prefix?: React.ReactNode;
  monospace?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, hint, suffix, prefix, monospace, className, id, ...rest },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-text-muted)]"
          >
            {label}
          </label>
        )}

        <div
          className={cn(
            "flex items-center rounded-[var(--radius-sm)] border bg-[var(--color-bg-inset)]",
            "focus-within:ring-2 focus-within:ring-[var(--color-accent)]",
            error ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
          )}
        >
          {prefix && (
            <span className="pl-2.5 text-[var(--color-text-faint)] text-sm">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full bg-transparent px-2.5 py-1.5 text-sm text-[var(--color-text)]",
              "placeholder:text-[var(--color-text-faint)]",
              "focus:outline-none",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              monospace && "font-[var(--font-mono)]",
              !!prefix && "pl-1.5",
              !!suffix && "pr-1.5",
              className
            )}
            {...rest}
          />
          {suffix && (
            <span className="pr-2.5 text-[var(--color-text-faint)] text-sm">
              {suffix}
            </span>
          )}
        </div>

        {error ? (
          <span className="text-xs text-[var(--color-danger)]">{error}</span>
        ) : hint ? (
          <span className="text-xs text-[var(--color-text-faint)]">{hint}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";