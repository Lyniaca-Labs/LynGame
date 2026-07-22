import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * Single-select combobox.
 *
 * <Select
 *   options={[
 *     { value: "png", label: "PNG" },
 *     { value: "svg", label: "SVG", icon: <SvgIcon /> },
 *     { value: "spritesheet", label: "Spritesheet", disabled: true },
 *   ]}
 *   value={format}
 *   onChange={setFormat}
 *   placeholder="Select a format…"
 * />
 *
 * Closed, the field just previews the selected option's label. The moment
 * you click into it, it turns into a search box: typing filters the option
 * list in place, and blurring/closing snaps the preview back.
 *
 * The option menu is rendered in a portal to document.body and positioned
 * with fixed coordinates measured from the trigger, flipping above the
 * trigger and clamping to the viewport edges when there isn't room — so it
 * never gets clipped by a scrollable/overflow-hidden ancestor (e.g. the
 * Explorer sidebar) or run off the edge of the screen.
 */

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "end";
}

const MENU_MARGIN = 8; // gap kept between the menu and the viewport edge
const MENU_MAX_HEIGHT = 240; // matches max-h-60

interface MenuRect {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyMessage = "No matches",
  disabled = false,
  className,
  align = "start",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!open || query.trim() === "") return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, open]);

  // Measure the trigger and work out where the menu should render: flip
  // above the trigger if there isn't MENU_MAX_HEIGHT of room below, and
  // clamp left/width so it never crosses the viewport's left or right edge.
  const updateMenuRect = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < MENU_MAX_HEIGHT + MENU_MARGIN && spaceAbove > spaceBelow;

    // Prefer matching the trigger's width, but never let the menu exceed
    // the viewport (minus margins) — a narrow sidebar shouldn't force the
    // menu wider than the screen itself.
    const width = Math.min(rect.width, viewportWidth - MENU_MARGIN * 2);

    // Anchor left/right the same edge the trigger occupies, then clamp so
    // the menu box stays fully on-screen.
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.min(left, viewportWidth - width - MENU_MARGIN);
    left = Math.max(left, MENU_MARGIN);

    const top = openUpward
      ? rect.top - MENU_MARGIN
      : rect.bottom + MENU_MARGIN;

    setMenuRect({ top, left, width, openUpward });
  }, [align]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(
      Math.max(
        0,
        filtered.findIndex((o) => o.value === value)
      )
    );
    setOpen(true);
  }, [disabled, filtered, value]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMenuRect(null);
  }, []);

  const commit = useCallback(
    (option: SelectOption) => {
      if (option.disabled) return;
      onChange?.(option.value);
      closeMenu();
      inputRef.current?.blur();
    },
    [onChange, closeMenu]
  );

  // Measure before paint so the menu doesn't flash in the wrong spot, and
  // re-measure on any resize/scroll (capture phase catches scrolling in
  // ancestor containers, not just the window) so it tracks the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    updateMenuRect();

    function handleReposition() {
      updateMenuRect();
    }
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateMenuRect]);

  // Click outside closes. Checks both the trigger and the portaled menu,
  // since the menu no longer lives inside rootRef in the DOM tree.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      closeMenu();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, closeMenu]);

  // Keep the active option in view as it changes.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        e.preventDefault();
        const option = filtered[activeIndex];
        if (option) commit(option);
        break;
      }
      case "Escape":
        e.preventDefault();
        closeMenu();
        inputRef.current?.blur();
        break;
      case "Tab":
        closeMenu();
        break;
    }
  }

  // What the input actually displays: the live query while open, the
  // selected label (or nothing) while closed.
  const displayValue = open ? query : selected?.label ?? "";

  return (
    <div ref={rootRef} className={cn("relative inline-block w-64", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--color-bg-elevated)] px-3 py-1.5",
          "border-[var(--color-border)] transition-colors",
          open && "border-[var(--color-text-faint)]",
          disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          placeholder={open ? selected?.label ?? placeholder : placeholder}
          value={displayValue}
          onFocus={openMenu}
          onClick={openMenu}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full flex-1 truncate bg-transparent text-sm text-[var(--color-text)]",
            "placeholder:text-[var(--color-text-faint)] focus:outline-none"
          )}
        />
        <span
          className={cn(
            "shrink-0 text-[var(--color-text-faint)] transition-transform",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </div>

      {open &&
        menuRect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              transform: menuRect.openUpward ? "translateY(-100%)" : undefined,
            }}
            className={cn(
              "z-50 overflow-hidden rounded-[var(--radius-md)]",
              "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
              "shadow-[var(--shadow-panel)]"
            )}
          >
            <div
              ref={listRef}
              role="listbox"
              className="overflow-auto"
              style={{ maxHeight: MENU_MAX_HEIGHT }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-[var(--color-text-faint)]">
                  {emptyMessage}
                </div>
              ) : (
                filtered.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-index={index}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(option)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)]",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                        isActive && "bg-[var(--color-border)]"
                      )}
                    >
                      {option.icon && <span className="shrink-0">{option.icon}</span>}
                      <span className="flex-1 truncate">{option.label}</span>
                      {isSelected && (
                        <span className="shrink-0 text-[var(--color-text-faint)]">✓</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}