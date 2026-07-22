import { useCallback, useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { ExternalLink, Save, Loader2 } from "lucide-react";
import { Button } from "../ui/Button";
import { projectsApi, EditableFolder } from "../api";
import { cn } from "../ui/cn";

// Only these two folders hold source files worth editing in CodeMirror —
// prefabs/scenes are JSON data edited through the Inspector, not raw text.
type CodeFolder = Extract<EditableFolder, "components" | "scripts">;

export interface CodeFileEditorProps {
  project: string;
  folder: CodeFolder;
  filename: string;
  /** Called after a successful save, with the text that was saved. */
  onSave?: (newText: string) => void;
  /** Called if the save request fails. */
  onSaveError?: (message: string) => void;
  /** Show the "Open in VS Code" button. Defaults to true. */
  showOpenInVSCode?: boolean;
  className?: string;
}

function languageExtension(filename: string) {
  if (filename.endsWith(".json")) return json();
  const typescript = filename.endsWith(".ts") || filename.endsWith(".tsx");
  const jsx = filename.endsWith(".tsx") || filename.endsWith(".jsx");
  return javascript({ typescript, jsx });
}

// Maps the app's existing CSS custom properties onto CodeMirror's theme
// so the editor matches the rest of the UI instead of shipping its own
// light/dark palette.
const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-bg-elevated)",
    color: "var(--color-text)",
    height: "100%",
    fontSize: "12px",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono, monospace)",
    caretColor: "var(--color-text)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg-elevated)",
    color: "var(--color-text-faint)",
    borderRight: "1px solid var(--color-border)",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-border)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-border)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--color-accent-secondary)",
    opacity: 0.25,
  },
});

export function CodeFileEditor({
  project,
  folder,
  filename,
  onSave,
  onSaveError,
  showOpenInVSCode = true,
  className,
}: CodeFileEditorProps) {
  const [value, setValue] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);

  const dirty = value !== original;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    projectsApi
      .readFile(project, folder, filename)
      .then((res) => {
        if (cancelled) return;
        setValue(res.content);
        setOriginal(res.content);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project, folder, filename]);

  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await projectsApi.writeFile(project, folder, filename, value);
      setOriginal(value);
      onSave?.(value);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      onSaveError?.(message);
    } finally {
      setSaving(false);
    }
  }, [project, folder, filename, value, dirty, saving, onSave, onSaveError]);

  const handleOpenInVSCode = useCallback(async () => {
    setOpening(true);
    try {
      await projectsApi.openScript(project, filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOpening(false);
    }
  }, [project, filename]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className={cn("flex h-full flex-col", className)} onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-2 py-1">
        <span className="truncate text-xs text-[var(--color-text-faint)]">
          {filename}
          {dirty && <span className="ml-1 text-[var(--color-accent-secondary)]">●</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {showOpenInVSCode && (
            <Button onClick={handleOpenInVSCode} disabled={opening}>
              <ExternalLink size={12} />
              {opening ? "Opening…" : "Open in VS Code"}
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving}>
            <Save size={12} />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-faint)]">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-red-500">
            {error}
          </div>
        ) : (
          <CodeMirror
            value={value}
            height="100%"
            theme={editorTheme}
            extensions={[languageExtension(filename)]}
            onChange={(v) => setValue(v)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
            }}
          />
        )}
      </div>
    </div>
  );
}