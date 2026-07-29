import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * Nestable dropdown menu system.
 *
 * <DropdownMenu trigger={<Button>Actions</Button>}>
 *   <DropdownItem onClick={...}>Rename</DropdownItem>
 *   <DropdownSubmenu label="Export as">
 *     <DropdownItem onClick={...}>PNG</DropdownItem>
 *     <DropdownItem onClick={...}>Spritesheet</DropdownItem>
 *   </DropdownSubmenu>
 *   <DropdownDivider />
 *   <DropdownItem danger onClick={...}>Delete</DropdownItem>
 * </DropdownMenu>
 *
 * Clicking any leaf DropdownItem closes the entire tree, including
 * any open submenus, since they all share the same closeAll() from
 * the root's context.
 */

interface DropdownContextValue {
  closeAll: () => void;
}

const DropdownContext = createContext<DropdownContextValue>({
  closeAll: () => { },
});

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  /** Controlled open state, if you need it driven externally */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

const MENU_MARGIN = 8;

export function DropdownMenu({
  trigger,
  children,
  align = "start",
  className,
  open: openProp,
  onOpenChange,
}: DropdownMenuProps) {
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  // Portaled to document.body and positioned with fixed coordinates measured
  // from the trigger — an in-flow `absolute` menu gets clipped by any
  // scrollable/overflow-hidden ancestor (e.g. the Explorer sidebar), which a
  // higher z-index can't fix since that's a clipping problem, not a
  // stacking-order one.
  const updatePosition = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = align === "end" ? rect.right - menuWidth : rect.left;
    left = Math.min(left, viewportWidth - menuWidth - MENU_MARGIN);
    left = Math.max(left, MENU_MARGIN);

    let top = rect.bottom + 4;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (top + menuHeight > viewportHeight - MENU_MARGIN) {
      top = Math.max(rect.top - menuHeight - 4, MENU_MARGIN);
    }

    setPosition({ top, left });
  }, [align]);

  // Measure before paint so the menu doesn't flash in the wrong spot, and
  // re-measure on resize/scroll (capture phase catches scrolling in
  // ancestor containers, not just the window) so it tracks the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  const closeAll = useCallback(() => setOpen(false), [setOpen]);

  return (
    <DropdownContext.Provider value={{ closeAll }}>
      <div ref={rootRef} className="relative inline-block">
        <div onClick={() => setOpen(!open)}>{trigger}</div>

        {open &&
          createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                visibility: position ? "visible" : "hidden",
              }}
              className={cn(
                "z-50 min-w-[11rem] overflow-visible rounded-[var(--radius-md)] select-none",
                "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
                "py-1 shadow-[var(--shadow-panel)]",
                className
              )}
            >
              {children}
            </div>,
            document.body
          )}
      </div>
    </DropdownContext.Provider>
  );
}

export interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
}

export function DropdownItem({
  children,
  onClick,
  icon,
  shortcut,
  disabled = false,
  danger = false,
}: DropdownItemProps) {
  const { closeAll } = useContext(DropdownContext);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        closeAll();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
        "hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:bg-[var(--color-border)]",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        danger ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-faint)]">
          {shortcut}
        </span>
      )}
    </button>
  );
}

export interface DropdownSubmenuProps {
  label: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function DropdownSubmenu({
  label,
  children,
  icon,
  disabled = false,
}: DropdownSubmenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openNow = useCallback(() => {
    clearTimeout(closeTimeout.current);
    setOpen(true);
  }, []);

  const closeSoon = useCallback(() => {
    closeTimeout.current = setTimeout(() => setOpen(false), 150);
  }, []);

  useEffect(() => () => clearTimeout(closeTimeout.current), []);

  return (
    <div className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)]",
          "hover:bg-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="flex-1">{label}</span>
        <span className="text-[var(--color-text-faint)]">›</span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute left-full top-0 z-50 ml-1 min-w-[11rem]",
            "rounded-[var(--radius-md)] border border-[var(--color-border)]",
            "bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-panel)]"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownDivider() {
  return <div role="separator" className="my-1 h-px bg-[var(--color-border)]" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
      {children}
    </div>
  );
}