import React, { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const boxSize = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

const iconSize = {
  sm: 10,
  md: 12,
};

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
}: CheckboxProps) {
  const id = useId();

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm border transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          boxSize[size],
          checked
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]"
            : "border-[var(--color-border-strong)] bg-transparent"
        )}
      >
        {checked && <Check size={iconSize[size]} className="text-[var(--color-accent-contrast)]" strokeWidth={3} />}
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
