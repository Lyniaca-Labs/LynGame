import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

        {open && (
          <div
            role="menu"
            className={cn(
              "absolute z-50 mt-1 min-w-[11rem] overflow-visible rounded-[var(--radius-md)]",
              "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
              "py-1 shadow-[var(--shadow-panel)]",
              align === "end" ? "right-0" : "left-0",
              className
            )}
          >
            {children}
          </div>
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