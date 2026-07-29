import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { syntaxHighlighting } from "@codemirror/language";
import {
  ExternalLink, Save, Loader2, WrapText, ZoomIn, ZoomOut, Wand2, X
} from "lucide-react";
import { Button } from "../ui/Button";
import { projectsApi, EditableFolder } from "../api";
import { cn } from "../ui/cn";
import {
  buildEditorTheme,
  codeMirrorBasicSetup,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  formatSource,
  languageExtension,
  languageFromFilename,
  syntaxTheme,
  useIsDarkTheme,
} from "./codeEditor/shared";

type CodeFolder = Extract<EditableFolder, "components" | "scripts">;

export interface CodeFileEditorProps {
  project: string;
  folder: CodeFolder;
  filename: string;
  onSave?: (newText: string) => void;
  onSaveError?: (message: string) => void;
  onExit?: () => void;
  onChange?: (newText: string) => void;
  showOpenInVSCode?: boolean;
  className?: string;
}

export function CodeFileEditor({
  project,
  folder,
  filename,
  onSave,
  onChange,
  onSaveError,
  onExit,
  showOpenInVSCode = true,
  className,
}: CodeFileEditorProps) {
  const [value, setValue] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [fontSize, setFontSize] = useState(12);

  const dark = useIsDarkTheme();
  const themeCompartment = useRef(new Compartment()).current;
  const editorTheme = useMemo(() => buildEditorTheme(dark, fontSize), [dark, fontSize]);

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

  // Warn on tab close / navigation with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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

  const handleFormat = useCallback(async () => {
    setFormatting(true);
    setError(null);
    try {
      const formatted = await formatSource(languageFromFilename(filename), value);
      setValue(formatted);
    } catch (err) {
      setError(`Format failed: ${(err as Error).message}`);
    } finally {
      setFormatting(false);
    }
  }, [filename, value]);

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
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      handleFormat();
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
          <Button onClick={() => setFontSize((s) => Math.max(FONT_SIZE_MIN, s - 1))} title="Decrease font size">
            <ZoomOut size={12} />
          </Button>
          <Button onClick={() => setFontSize((s) => Math.min(FONT_SIZE_MAX, s + 1))} title="Increase font size">
            <ZoomIn size={12} />
          </Button>
          <Button
            onClick={() => setWordWrap((w) => !w)}
            title="Toggle word wrap"
            className={wordWrap ? "text-[var(--color-accent)]" : undefined}
          >
            <WrapText size={12} />
          </Button>
          <Button onClick={handleFormat} disabled={formatting} title="Format (Ctrl/Cmd+Shift+F)">
            <Wand2 size={12} />
            {formatting ? "Formatting…" : "Format"}
          </Button>
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
          {/* Exit */}
          <Button onClick={onExit} title="Exit">
            <X size={12} />
          </Button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-faint)]">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-[var(--color-danger)]">
            {error}
          </div>
        ) : (
          <CodeMirror
            value={value}
            height="100%"
            theme={editorTheme}
            extensions={[
              languageExtension(languageFromFilename(filename)),
              themeCompartment.of(syntaxHighlighting(syntaxTheme)),
              ...(wordWrap ? [EditorView.lineWrapping] : []),
            ]}
            onChange={(v) => {
              setValue(v);
              onChange?.(v);
            }}
            basicSetup={codeMirrorBasicSetup}
          />
        )}
      </div>
    </div>
  );
}