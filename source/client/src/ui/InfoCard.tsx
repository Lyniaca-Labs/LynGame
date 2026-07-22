// InfoCard.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * Small "?" affordance. Hover (or focus, for keyboard users) reveals a
 * floating card with the passed description. Meant to sit inline next to
 * a <Container>'s title when it has a description.
 *
 * The tooltip is rendered via a portal into document.body and positioned
 * with `fixed` coordinates computed from the trigger's bounding rect, so
 * it always floats above panel content (no clipping by overflow/scroll
 * containers) and never gets fought over by a parent's z-index. Its
 * horizontal position is clamped to the viewport so it can't run offscreen.
 */

export interface InfoCardProps {
  description: string;
  side?: "top" | "bottom";
  className?: string;
}

const TOOLTIP_WIDTH = 224; // matches w-56
const VIEWPORT_MARGIN = 8;
const GAP = 6;

export function InfoCard({ description, side = "bottom", className }: InfoCardProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, VIEWPORT_MARGIN),
      window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN
    );
    const top = side === "bottom" ? rect.bottom + GAP : rect.top - GAP;

    setCoords({ top, left });
  }, [side]);

  const show = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const hide = useCallback(() => setOpen(false), []);

  // Keep it glued to the trigger if the page scrolls or resizes while open.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={btnRef}
        type="button"
        tabIndex={0}
        aria-label="More info"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          "border border-[var(--color-border-strong)] text-[10px] leading-none text-[var(--color-text-faint)]",
          "hover:border-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] focus-visible:outline-none",
          "focus-visible:ring-1 focus-visible:ring-[var(--color-text-faint)]"
        )}
      >
        ?
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: TOOLTIP_WIDTH,
              transform: side === "top" ? "translateY(-100%)" : undefined,
            }}
            className={cn(
              "z-[9999] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2",
              "text-xs leading-relaxed text-[var(--color-text-muted)] shadow-[var(--shadow-panel)]"
            )}
          >
            {description}
          </div>,
          document.body
        )}
    </span>
  );
}