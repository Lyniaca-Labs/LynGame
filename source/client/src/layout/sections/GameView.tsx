import { useEffect, useRef } from "react";
import { BASE_URL } from "../../api";
import { useGameConsole } from "../../context/GameConsoleContext";

interface GameViewProps {
  project: string | null;
  gameUrl: string | null;
  isBuilding: boolean;
  error: string | null;
}

export function GameView({ project, gameUrl, isBuilding, error }: GameViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setIframeWindow, clear } = useGameConsole();

  // focus the iframe every time a fresh build lands, so keyboard input
  // (WASD, space, etc.) goes straight to the game without an extra click.
  // Also wipe the previous run's logs so Output starts clean, and drop the
  // iframe registration when there's no game loaded.
  useEffect(() => {
    if (gameUrl) {
      iframeRef.current?.focus();
      clear();
    } else {
      setIframeWindow(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameUrl]);

  // The iframe remounts on every new build (key={gameUrl}), so its
  // contentWindow is a new object each time — register the fresh one once
  // it's actually loaded rather than assuming it's stable.
  const handleLoad = () => {
    setIframeWindow(iframeRef.current?.contentWindow ?? null);
  };

  if (!project) {
    return <Message>Select or create a project to get started.</Message>;
  }
  if (isBuilding) {
    return <Message>Building "{project}"…</Message>;
  }
  if (error) {
    return <Message tone="error">Build failed: {error}</Message>;
  }
  if (!gameUrl) {
    return <Message>Press Run to build and play "{project}".</Message>;
  }

  return (
    <iframe
      ref={iframeRef}
      key={gameUrl}
      src={`${BASE_URL}${gameUrl}`}
      title={`${project} - game view`}
      className="h-full w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      onLoad={handleLoad}
    />
  );
}

function Message({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={`flex h-full items-center justify-center p-3 text-center text-xs ${tone === "error" ? "text-red-500" : "text-[var(--color-text-faint)]"
        }`}
    >
      {children}
    </div>
  );
}