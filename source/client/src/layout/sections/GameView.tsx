import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { BASE_URL } from "../../api";
import { useGameConsole } from "../../context/GameConsoleContext";

interface GameViewProps {
  project: string | null;
  gameUrl: string | null;
  buildUrl: string | null;
  buildVersion: number;
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
  getEntityPreview: (
    id: string,
    options?: EntityPreviewOptions
  ) => Promise<string | null>;
}

const PREVIEW_TIMEOUT_MS = 5000;
const PREVIEW_RETRY_INTERVAL_MS = 400;

export const GameView = forwardRef<GameViewHandle, GameViewProps>(
  function GameView(
    { project, gameUrl, buildUrl, buildVersion, isBuilding, error },
    ref
  ) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const previewIframeRef = useRef<HTMLIFrameElement>(null);
    const previewReady = useRef(false);
    // Resolves once the preview iframe finishes (re)loading for the
    // current buildUrl. Reassigned each time buildUrl changes, so
    // getEntityPreview can wait out a reload instead of failing on it.
    const previewReadyPromise = useRef<Promise<void>>(Promise.resolve());

    const { setIframeWindow, clear } = useGameConsole();

    const pendingPreviews = useRef(
      new Map<
        string,
        {
          resolve: (value: string | null) => void;
          cleanup: () => void;
        }
      >()
    );

    useEffect(() => {
      if (!buildUrl) {
        previewReady.current = false;
        return;
      }

      const iframe = previewIframeRef.current;

      if (!iframe) return;

      previewReady.current = false;

      let resolveReady!: () => void;
      previewReadyPromise.current = new Promise((resolve) => {
        resolveReady = resolve;
      });

      const src = `${BASE_URL}${buildUrl}?preview=${Date.now()}`;
      // console.log("[preview-debug] reloading preview iframe:", src);
      iframe.src = src;

      const onLoad = () => {
        // console.log("[preview-debug] preview iframe fired 'load'");
        previewReady.current = true;
        resolveReady();
      };

      iframe.addEventListener("load", onLoad);

      return () => {
        iframe.removeEventListener("load", onLoad);
      };
    }, [buildUrl, buildVersion]);

    useEffect(() => {
      if (gameUrl) {
        iframeRef.current?.focus();
        clear();
      } else {
        setIframeWindow(null);
      }
    }, [gameUrl, clear, setIframeWindow]);

    useEffect(() => {
      const onMessage = (e: MessageEvent) => {
        // TEMP: log every message this window receives, matched or not,
        // so we can see whether the engine is responding at all.
        if (e.data?.type) {
          // console.log("[preview-debug] window received message:", e.data);
        }

        if (e.data?.type !== "ENTITY_PREVIEW_RESULT") {
          return;
        }

        const pending = pendingPreviews.current.get(
          e.data.requestId
        );

        if (!pending) {
          // console.log(
          //   "[preview-debug] got ENTITY_PREVIEW_RESULT for unknown/expired requestId:",
          //   e.data.requestId
          // );
          return;
        }

        if (e.data.dataUrl == null) {
          // The engine responded, but with no image — most likely because
          // it's still finishing scene load right after a rebuild reload
          // and this entity doesn't exist yet from its point of view.
          // Don't treat this as final; keep retrying until either a real
          // preview shows up or the overall timeout gives up.
          // console.log(
          //   "[preview-debug] got null dataUrl, still waiting for requestId:",
          //   e.data.requestId
          // );
          return;
        }

        pending.cleanup();
        pendingPreviews.current.delete(e.data.requestId);
        pending.resolve(e.data.dataUrl);
      };

      window.addEventListener("message", onMessage);

      return () => {
        window.removeEventListener("message", onMessage);
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        pause: () => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "PAUSE" },
            "*"
          );
        },

        unpause: () => {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "UNPAUSE" },
            "*"
          );
        },

        getEntityPreview: async (id, options) => {
          // console.log("[preview-debug] getEntityPreview called for id:", id, "ready:", previewReady.current);

          // A rebuild reloads the preview iframe, which briefly makes it
          // "not ready" again right when we most want a preview. Wait for
          // the reload to finish (bounded by the usual preview timeout)
          // instead of failing on the transient state.
          if (!previewReady.current) {
            await Promise.race([
              previewReadyPromise.current,
              new Promise<void>((resolve) => setTimeout(resolve, PREVIEW_TIMEOUT_MS)),
            ]);
            // console.log("[preview-debug] done waiting for ready, ready:", previewReady.current);
          }

          const win =
            previewIframeRef.current?.contentWindow;

          if (!win || !previewReady.current) {
            console.error(
              "Cannot preview: preview iframe not ready", { hasWin: !!win, ready: previewReady.current }
            );

            return null;
          }

          const requestId = crypto.randomUUID();

          return new Promise<string | null>((resolve) => {
            // The iframe firing `load` doesn't mean the engine inside has
            // finished re-initializing and attached its message listener
            // yet — especially right after a rebuild reload. A single
            // GET_ENTITY_PREVIEW sent too early gets silently dropped, so
            // keep resending until something answers instead of trusting
            // the first send.
            let attempt = 0;
            const send = () => {
              attempt += 1;
              // console.log(`[preview-debug] sending GET_ENTITY_PREVIEW (attempt ${attempt}) requestId=${requestId} id=${id}`);
              win.postMessage(
                {
                  type: "GET_ENTITY_PREVIEW",
                  requestId,
                  id,
                  options,
                },
                "*"
              );
            };

            send();
            const retryTimer = setInterval(send, PREVIEW_RETRY_INTERVAL_MS);

            const overallTimer = setTimeout(() => {
              // console.log(`[preview-debug] TIMED OUT waiting for requestId=${requestId} id=${id}`);
              pendingPreviews.current.delete(requestId);
              clearInterval(retryTimer);
              resolve(null);
            }, PREVIEW_TIMEOUT_MS);

            pendingPreviews.current.set(requestId, {
              resolve,
              cleanup: () => {
                clearInterval(retryTimer);
                clearTimeout(overallTimer);
              },
            });
          });
        },
      }),
      []
    );

    const handleLoad = () => {
      setIframeWindow(
        iframeRef.current?.contentWindow ?? null
      );
    };

    // The preview iframe is rendered unconditionally, below, so that
    // isBuilding/error/project transitions never unmount it. It used to
    // live only in the final branch's JSX, which meant every build (isBuilding
    // true -> false) destroyed and recreated the iframe DOM node — wiping out
    // its loaded engine and src — while `previewReady`/`previewReadyPromise`
    // (plain refs) kept pointing at a live-looking but now-dead iframe.
    // That's what produced the "waits, then No preview" failures: every
    // retry was correctly firing into an iframe that no longer existed.
    let content: React.ReactNode;

    if (!project) {
      content = (
        <Message>
          Select or create a project to get started.
        </Message>
      );
    } else if (isBuilding) {
      content = (
        <Message>
          Building "{project}"…
        </Message>
      );
    } else if (error) {
      content = (
        <Message tone="error">
          Build failed: {error}
        </Message>
      );
    } else if (!gameUrl) {
      content = (
        <Message>
          Press Run to build and play "{project}".
        </Message>
      );
    } else {
      content = (
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

    return (
      <>
        <iframe
          ref={previewIframeRef}
          title="preview-engine"
          className="hidden"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        />
        {content}
      </>
    );
  }
);

function Message({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div
      className={`flex h-full items-center justify-center p-3 text-center text-xs ${tone === "error"
          ? "text-red-500"
          : "text-[var(--color-text-faint)]"
        }`}
    >
      {children}
    </div>
  );
}