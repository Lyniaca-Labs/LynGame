import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  // Click outside closes.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeMenu();
      }
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

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 w-full overflow-hidden rounded-[var(--radius-md)]",
            "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
            "shadow-[var(--shadow-panel)]",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          <div ref={listRef} role="listbox" className="max-h-60 overflow-auto">
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
        </div>
      )}
    </div>
  );
}