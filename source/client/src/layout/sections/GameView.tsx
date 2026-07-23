import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { BASE_URL } from "../../api";
import { useGameConsole } from "../../context/GameConsoleContext";

interface GameViewProps {
  project: string | null;
  gameUrl: string | null;
  isBuilding: boolean;
  error: string | null;
}

export interface EntityPreviewOptions {
  width?: number;
  height?: number;
  background?: string | null;
}

export interface GameViewHandle {
  pause: () => void;
  unpause: () => void;
  getEntityPreview: (id: string, options?: EntityPreviewOptions) => Promise<string | null>;
}

const PREVIEW_TIMEOUT_MS = 5000;

export const GameView = forwardRef<GameViewHandle, GameViewProps>(function GameView(
  { project, gameUrl, isBuilding, error },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setIframeWindow, clear } = useGameConsole();

  // Pending preview requests, keyed by request id, so responses (which
  // arrive async over postMessage) get routed back to the right caller
  // even if multiple previews are in flight at once.
  const pendingPreviews = useRef(
    new Map<string, { resolve: (v: string | null) => void; timer: ReturnType<typeof setTimeout> }>()
  );

  useEffect(() => {
    if (gameUrl) {
      iframeRef.current?.focus();
      clear();
    } else {
      setIframeWindow(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameUrl]);

  // Listen for preview results from the engine. Lives for the component's
  // whole lifetime (not per-gameUrl) since it's cheap and just routes by
  // request id; stale requests from a previous build simply won't have a
  // matching pending entry and are ignored.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "ENTITY_PREVIEW_RESULT") return;
      const pending = pendingPreviews.current.get(e.data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.resolve(e.data.dataUrl ?? null);
      pendingPreviews.current.delete(e.data.requestId);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      pause: () => {
        iframeRef.current?.contentWindow?.postMessage({ type: "PAUSE" }, "*");
      },
      unpause: () => {
        iframeRef.current?.contentWindow?.postMessage({ type: "UNPAUSE" }, "*");
      },
      getEntityPreview: (id, options) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return Promise.resolve(null);

        const requestId = crypto.randomUUID();

        return new Promise<string | null>((resolve) => {
          // Don't hang forever if the engine never responds (e.g. the
          // entity id doesn't exist and the game somehow never posts
          // back, or the iframe reloads mid-request).
          const timer = setTimeout(() => {
            pendingPreviews.current.delete(requestId);
            resolve(null);
          }, PREVIEW_TIMEOUT_MS);

          pendingPreviews.current.set(requestId, { resolve, timer });
          win.postMessage({ type: "GET_ENTITY_PREVIEW", requestId, id, options }, "*");
        });
      },
    }),
    []
  );

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
});

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