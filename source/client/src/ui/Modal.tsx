// ui/Modal.tsx
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

// ui/Modal.tsx — add a size prop
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** "md" (default, ~28rem) | "lg" (wide) | "full" (near-fullscreen, for editors/canvases) */
  size?: "md" | "lg" | "full";
}

const sizeClasses = {
  md: "max-w-md",
  lg: "max-w-4xl",
  full: "h-[90vh] w-[95vw] max-w-[1600px]",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  size = "md",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        className={cn(
          "flex max-h-[90vh] w-full flex-col rounded-[var(--radius-md)] border border-[var(--color-border)]",
          "bg-[var(--color-bg-elevated)] shadow-[var(--shadow-panel)]",
          sizeClasses[size],
          className
        )}
      >
        {(title || description) && (
          <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
            {title && (
              <h2
                id="modal-title"
                className="text-sm font-semibold text-[var(--color-text)]"
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                {description}
              </p>
            )}
          </div>
        )}

        <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName ?? "px-4 py-3")}>
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}