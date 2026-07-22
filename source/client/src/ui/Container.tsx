import React from "react";
import { cn } from "./cn";
import { InfoCard } from "./InfoCard";

/**
 * Base panel primitive. Behaves like a div, but:
 * - can carry a title and an optional description
 * - shows a "?" InfoCard next to the title when a description is set
 *
 * Sizing/resizing is intentionally not this component's job — wrap it in
 * <Resizable> to make an edge draggable. Container itself just fills
 * whatever box it's given (h-full/w-full of its parent).
 *
 * <Container title="Inspector" description="Edit properties of the selected node.">
 *   ...
 * </Container>
 */

export interface ContainerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: string | null;
  headerActions?: React.ReactNode;
  bodyClassName?: string;
}

export function Container({
  title,
  description,
  headerActions,
  bodyClassName,
  className,
  children,
  ...rest
}: ContainerProps) {
  const hasHeader = title !== undefined || headerActions !== undefined;

  return (
    <div
      {...rest}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
        className
      )}
    >
      {hasHeader && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {title !== undefined && (
              <span className="truncate text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                {title}
              </span>
            )}
            {description != null && <InfoCard description={description} />}
          </div>
          {headerActions && (
            <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
          )}
        </div>
      )}

      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}