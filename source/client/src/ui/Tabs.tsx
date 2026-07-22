// Tabs.tsx
import React, { useState } from "react";
import { cn } from "./cn";

/**
 * <Tabs
 *   tabs={[
 *     { id: "files", label: "Files", content: <FileTree /> },
 *     { id: "search", label: "Search", content: <SearchPanel /> },
 *   ]}
 * />
 *
 * Uncontrolled by default (tracks its own active tab); pass `active` +
 * `onActiveChange` to control it externally.
 */

export interface Tab {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  active?: string;
  onActiveChange?: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onActiveChange, className }: TabsProps) {
  const [activeState, setActiveState] = useState(tabs[0]?.id);
  const isControlled = active !== undefined;
  const activeId = isControlled ? active : activeState;

  function select(id: string) {
    if (!isControlled) setActiveState(id);
    onActiveChange?.(id);
  }

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div
        role="tablist"
        className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] px-2"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              className={cn(
                "border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-40",
                isActive
                  ? "border-[var(--color-text)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">{activeTab?.content}</div>
    </div>
  );
}