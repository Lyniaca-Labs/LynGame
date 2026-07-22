import React, { useId } from "react";
import { cn } from "./cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const trackSize = {
  sm: "h-4 w-7",
  md: "h-5 w-9",
};

const thumbSize = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
};

const thumbTravel = {
  sm: "translate-x-3",
  md: "translate-x-4",
};

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
}: ToggleProps) {
  const id = useId();

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          trackSize[size],
          checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-strong)]"
        )}
      >
        <span
          className={cn(
            "inline-block rounded-full bg-[var(--color-bg)] shadow transition-transform duration-150 ease-out",
            thumbSize[size],
            "translate-x-0.5",
            checked && thumbTravel[size]
          )}
        />
      </button>

      {(label || description) && (
        <label htmlFor={id} className="cursor-pointer select-none">
          {label && (
            <div className="text-sm text-[var(--color-text)]">{label}</div>
          )}
          {description && (
            <div className="text-xs text-[var(--color-text-muted)]">
              {description}
            </div>
          )}
        </label>
      )}
    </div>
  );
}