// src/components/GameView.tsx
import { useEffect, useRef } from "react";
import { BASE_URL } from "../api";

interface GameViewProps {
  project: string | null;
  gameUrl: string | null;
  isBuilding: boolean;
  error: string | null;
}

export function GameView({ project, gameUrl, isBuilding, error }: GameViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // focus the iframe every time a fresh build lands, so keyboard input
  // (WASD, space, etc.) goes straight to the game without an extra click
  useEffect(() => {
    if (gameUrl) {
      iframeRef.current?.focus();
    }
  }, [gameUrl]);

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