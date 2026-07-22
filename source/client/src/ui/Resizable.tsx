import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "./cn";

/**
 * Wraps a panel and gives it a real drag handle on one edge, instead of
 * relying on the browser's native bottom-right-only `resize` corner.
 *
 * <Resizable axis="x" handle="end" defaultSize={224} min={160} max={480}>
 *   <Container title="Explorer">...</Container>
 * </Resizable>
 *
 * `handle` is which edge of the panel the drag grip sits on:
 * - axis="x": "end" = handle on the right edge (panel anchored left, e.g.
 *   an explorer sidebar). "start" = handle on the left edge (panel
 *   anchored right, e.g. an inspector sidebar).
 * - axis="y": "end" = handle on the bottom edge. "start" = handle on the
 *   top edge (e.g. a console panel docked to the bottom of the screen).
 */

export interface ResizableProps {
  axis: "x" | "y";
  handle: "start" | "end";
  defaultSize: number;
  min?: number;
  max?: number;
  className?: string;
  children: React.ReactNode;
}

export function Resizable({
  axis,
  handle,
  defaultSize,
  min = 120,
  max = Infinity,
  className,
  children,
}: ResizableProps) {
  const [size, setSize] = useState(defaultSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startPos: number; startSize: number; lastSize: number } | null>(
    null
  );
  const rafId = useRef<number | null>(null);
  const pendingSize = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = useCallback((value: number) => Math.min(Math.max(value, min), max), [
    min,
    max,
  ]);

  const applyPendingSize = useCallback(() => {
    rafId.current = null;
    if (!containerRef.current || pendingSize.current == null) return;
    if (axis === "x") {
      containerRef.current.style.width = `${pendingSize.current}px`;
    } else {
      containerRef.current.style.height = `${pendingSize.current}px`;
    }
  }, [axis]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = pos - dragState.current.startPos;
      // If the handle is on the "start" edge, dragging toward the start
      // shrinks the panel and dragging away grows it — i.e. the sign
      // flips relative to a handle on the "end" edge.
      const signedDelta = handle === "start" ? -delta : delta;
      const next = clamp(dragState.current.startSize + signedDelta);

      dragState.current.lastSize = next;
      pendingSize.current = next;

      // Batch DOM writes to at most one per animation frame instead of
      // once per pointermove event (which can fire much faster than the
      // display can paint), and mutate the DOM directly rather than going
      // through React state so we don't re-render `children` on every tick.
      if (rafId.current == null) {
        rafId.current = requestAnimationFrame(applyPendingSize);
      }
    },
    [axis, handle, clamp, applyPendingSize]
  );

  const stopDragging = useCallback(
    (e: React.PointerEvent) => {
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      if (dragState.current) {
        setSize(dragState.current.lastSize);
      }
      dragState.current = null;
      pendingSize.current = null;
      setDragging(false);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  function startDragging(e: React.PointerEvent) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startPos: axis === "x" ? e.clientX : e.clientY,
      startSize: size,
      lastSize: size,
    };
    setDragging(true);
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  const sizeStyle = axis === "x" ? { width: size } : { height: size };

  return (
    <div
      ref={containerRef}
      className={cn("relative flex shrink-0", axis === "x" ? "flex-row" : "flex-col", className)}
      style={sizeStyle}
    >
      {handle === "start" && (
        <ResizeHandle
          axis={axis}
          dragging={dragging}
          onPointerDown={startDragging}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
        />
      )}

      <div className="min-h-0 min-w-0 flex-1">{children}</div>

      {handle === "end" && (
        <ResizeHandle
          axis={axis}
          dragging={dragging}
          onPointerDown={startDragging}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
        />
      )}
    </div>
  );
}

function ResizeHandle({
  axis,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  axis: "x" | "y";
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        "group shrink-0 touch-none",
        axis === "x" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
      )}
    >
      <div
        className={cn(
          "bg-transparent transition-colors group-hover:bg-slate-600",
          dragging && "bg-slate-400",
          axis === "x" ? "mx-auto h-full w-px" : "my-auto h-px w-full"
        )}
      />
    </div>
  );
}