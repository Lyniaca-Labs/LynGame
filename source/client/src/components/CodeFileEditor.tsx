import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import {
  ExternalLink, Save, Loader2, WrapText, ZoomIn, ZoomOut, Wand2, X
} from "lucide-react";
import * as prettier from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as tsPlugin from "prettier/plugins/typescript";
import { Button } from "../ui/Button";
import { projectsApi, EditableFolder } from "../api";
import { cn } from "../ui/cn";

type CodeFolder = Extract<EditableFolder, "components" | "scripts">;

export interface CodeFileEditorProps {
  project: string;
  folder: CodeFolder;
  filename: string;
  onSave?: (newText: string) => void;
  onSaveError?: (message: string) => void;
  onExit?: () => void;
  showOpenInVSCode?: boolean;
  className?: string;
}

function languageExtension(filename: string) {
  if (filename.endsWith(".json")) return json();
  const typescript = filename.endsWith(".ts") || filename.endsWith(".tsx");
  const jsx = filename.endsWith(".tsx") || filename.endsWith(".jsx");
  return javascript({ typescript, jsx });
}

async function formatSource(filename: string, source: string): Promise<string> {
  if (filename.endsWith(".json")) {
    return JSON.stringify(JSON.parse(source), null, 2);
  }
  const isTs = filename.endsWith(".ts") || filename.endsWith(".tsx");
  return prettier.format(source, {
    parser: isTs ? "typescript" : "babel",
    plugins: [babelPlugin, estreePlugin, tsPlugin],
    semi: true,
    singleQuote: false,
  });
}

function isDarkTheme(): boolean {
  return (document.documentElement.dataset.theme ?? "").includes("dark");
}

function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(isDarkTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function buildEditorTheme(dark: boolean, fontSize: number) {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--color-bg-elevated)",
        color: "var(--color-text)",
        height: "100%",
        fontSize: `${fontSize}px`,
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
        opacity: 0.35,
      },
    },
    { dark }
  );
}

const syntaxTheme = HighlightStyle.define([
  { tag: t.keyword, color: "var(--color-accent)" },
  { tag: t.string, color: "var(--color-success)" },
  { tag: t.number, color: "var(--color-warning)" },
  { tag: t.comment, color: "var(--color-text-faint)", fontStyle: "italic" },
  { tag: t.function(t.variableName), color: "var(--color-accent-strong)" },
  { tag: t.variableName, color: "var(--color-text)" },
  { tag: t.propertyName, color: "var(--color-accent-secondary)" },
  { tag: t.typeName, color: "var(--color-accent-strong)" },
  { tag: t.operator, color: "var(--color-text-muted)" },
  { tag: t.bracket, color: "var(--color-text-muted)" },
  { tag: t.invalid, color: "var(--color-danger)" },
]);

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 22;

export function CodeFileEditor({
  project,
  folder,
  filename,
  onSave,
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
      const formatted = await formatSource(filename, value);
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
            extensions={[
              languageExtension(filename),
              themeCompartment.of(syntaxHighlighting(syntaxTheme)),
              ...(wordWrap ? [EditorView.lineWrapping] : []),
            ]}
            onChange={(v) => setValue(v)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              autocompletion: true,
              bracketMatching: true,
              closeBrackets: true,
              highlightSelectionMatches: true,
              searchKeymap: true,
            }}
          />
        )}
      </div>
    </div>
  );
}