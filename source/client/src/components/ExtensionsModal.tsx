// components/ExtensionsModal.tsx
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Modal } from "../ui/Modal";
import { extensionsApi, ExtensionManifest, BASE_URL } from "../api";
import { useProject } from "../context/ProjectContext";

export interface ExtensionsModalProps {
  open: boolean;
  onClose: () => void;
}

// Lists everything under source/extensions/ (backend-loaded — see
// ExtensionHandler.ts) and, when one is picked, hosts its frontend in an
// iframe — same sandboxed-iframe pattern already used for the game/preview
// views, so an extension's own JS never runs in the editor's own document.
// v1 only understands `activation: "toolbar"` (this picker) and
// `view.type: "modal"`; other manifests just won't show up here yet rather
// than breaking anything.
export function ExtensionsModal({ open, onClose }: ExtensionsModalProps) {
  const { currentProject, reloadProject } = useProject();
  const [extensions, setExtensions] = useState<ExtensionManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<ExtensionManifest | null>(null);

  useEffect(() => {
    if (!open) {
      setActive(null);
      return;
    }
    setLoading(true);
    extensionsApi
      .list()
      .then((res) => setExtensions(res.extensions ?? []))
      .finally(() => setLoading(false));
  }, [open]);

  // An extension's frontend can tell us it saved something into the current
  // project's assets (see pixel-art's frontend/index.html) so the Explorer's
  // Assets tab picks it up without the user having to manually reload.
  useEffect(() => {
    if (!active) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "EXTENSION_ASSET_SAVED") reloadProject();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [active, reloadProject]);

  const toolbarExtensions = extensions.filter(
    (e) => e.hasFrontend && (e.activation ?? []).includes("toolbar")
  );

  const entrySrc = active
    ? `${BASE_URL}/extensions/${active.name}/${active.view?.entry ?? "index.html"}?project=${encodeURIComponent(currentProject ?? "")}`
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={active ? undefined : "Extensions"}
      description={active ? undefined : "Extra tools that live outside the core editor."}
      size={active ? active.view?.size ?? "full" : "lg"}
      // `flex flex-col` goes directly on the Modal's own body element (which
      // is already `flex-1 min-h-0` inside the panel) so the iframe below is
      // a single `flex-1` step away from the panel's real height. An extra
      // nested `h-full` wrapper div here previously meant the iframe's size
      // depended on a percentage-height chain through TWO levels instead of
      // one flex-grow step — technically valid CSS, but exactly the kind of
      // nesting that collapses to content-size in some browsers.
      bodyClassName={active ? "flex flex-col p-0" : undefined}
    >
      {active ? (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <button
              type="button"
              onClick={() => setActive(null)}
              className="flex items-center gap-1 text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
              <ArrowLeft size={13} /> Extensions
            </button>
            <span className="text-xs font-medium">{active.icon} {active.displayName}</span>
          </div>
          <iframe
            title={active.displayName}
            src={entrySrc ?? undefined}
            className="w-full min-h-0 flex-1 border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </>
      ) : loading ? (
        <div className="p-6 text-center text-xs text-[var(--color-text-faint)]">Loading…</div>
      ) : toolbarExtensions.length === 0 ? (
        <div className="p-6 text-center text-xs text-[var(--color-text-faint)]">
          No extensions installed — drop one in source/extensions/.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3">
          {toolbarExtensions.map((ext) => (
            <button
              key={ext.name}
              type="button"
              disabled={!currentProject}
              onClick={() => setActive(ext)}
              className="flex flex-col items-start gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-left transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
              title={!currentProject ? "Open a project first" : undefined}
            >
              <span className="text-xl">{ext.icon ?? "🧩"}</span>
              <span className="text-xs font-medium">{ext.displayName}</span>
              {ext.description && (
                <span className="text-[10px] text-[var(--color-text-faint)]">{ext.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
