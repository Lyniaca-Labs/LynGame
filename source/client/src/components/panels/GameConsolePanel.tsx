import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useGameConsole, LogLevel } from "../../context/GameConsoleContext";
import { cn } from "../../ui/cn";

const LEVEL_STYLES: Record<LogLevel, string> = {
  log: "text-[var(--color-text)]",
  info: "text-[var(--color-accent)]",
  warn: "text-yellow-500",
  error: "text-red-500",
};

export function GameConsolePanel() {
  const { logs, clear } = useGameConsole();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-2 py-1">
        <span className="text-xs text-[var(--color-text-faint)]">
          {logs.length} {logs.length === 1 ? "entry" : "entries"}
        </span>
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-xs text-[var(--color-text-faint)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-auto px-2 py-1 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="p-2 italic text-[var(--color-text-faint)]">
            Nothing logged yet — run the game to see console output here.
          </div>
        ) : (
          logs.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "whitespace-pre-wrap border-b border-[var(--color-border)]/40 py-0.5",
                LEVEL_STYLES[entry.level]
              )}
            >
              <span className="mr-2 text-[var(--color-text-faint)]">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              {entry.args.join(" ")}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}