import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

export type LogLevel = "log" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  level: LogLevel;
  args: string[];
  timestamp: number;
}

interface GameConsoleContextValue {
  logs: LogEntry[];
  clear: () => void;
  // Called by GameView once the iframe has (re)loaded, so incoming
  // postMessage events can be checked against the current game window
  // rather than accepted from anywhere.
  setIframeWindow: (win: Window | null) => void;
}

const GameConsoleContext = createContext<GameConsoleContextValue | null>(null);

const MAX_LOGS = 500;
let idCounter = 0;

export function GameConsoleProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const iframeWindowRef = useRef<Window | null>(null);

  const setIframeWindow = useCallback((win: Window | null) => {
    iframeWindowRef.current = win;
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      // Since the built game can be served from any port, the bridge script
      // has to postMessage with targetOrigin "*" — so the real trust check
      // happens here: only accept messages whose source is the iframe we
      // currently have registered, carrying our own message shape.
      if (iframeWindowRef.current && e.source !== iframeWindowRef.current) return;
      if (!e.data || e.data.source !== "game-console") return;

      const entry: LogEntry = {
        id: `${Date.now()}-${idCounter++}`,
        level: e.data.level,
        args: e.data.args,
        timestamp: e.data.timestamp ?? Date.now(),
      };

      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
      });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <GameConsoleContext.Provider value={{ logs, clear, setIframeWindow }}>
      {children}
    </GameConsoleContext.Provider>
  );
}

export function useGameConsole() {
  const ctx = useContext(GameConsoleContext);
  if (!ctx) throw new Error("useGameConsole must be used within a GameConsoleProvider");
  return ctx;
}