// components/CodeStringEditor.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { Save, WrapText, ZoomIn, ZoomOut, Wand2, X } from "lucide-react";
import * as prettier from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as tsPlugin from "prettier/plugins/typescript";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";

export type CodeStringLanguage = "js" | "jsx" | "ts" | "tsx" | "json";

export interface CodeStringEditorProps {
  value: string;
  language?: CodeStringLanguage;
  title?: string;
  onSave: (newText: string) => void;
  onClose: () => void;
  className?: string;
}

function languageExtension(lang: CodeStringLanguage) {
  if (lang === "json") return json();
  return javascript({ typescript: lang === "ts" || lang === "tsx", jsx: lang === "jsx" || lang === "tsx" });
}

async function formatSource(lang: CodeStringLanguage, source: string): Promise<string> {
  if (lang === "json") return JSON.stringify(JSON.parse(source), null, 2);
  return prettier.format(source, {
    parser: lang === "ts" || lang === "tsx" ? "typescript" : "babel",
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
      ".cm-content": { fontFamily: "var(--font-mono, monospace)", caretColor: "var(--color-text)" },
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

// components/CodeStringEditor.tsx  (only the changed bits)
export interface CodeStringEditorProps {
  value: string;
  language?: CodeStringLanguage;
  title?: string;
  onSave: (newText: string) => void;
  onClose: () => void;
  /** Fires whenever the dirty (unsaved-changes) state changes, so a parent modal can gate closing. */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
  scopeVars?: string[]; // array of variable names
}

export function CodeStringEditor({
  value: initialValue,
  language = "js",
  title,
  onSave,
  onClose,
  onDirtyChange,
  className,
  scopeVars,
}: CodeStringEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [formatting, setFormatting] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [fontSize, setFontSize] = useState(12);
  const [error, setError] = useState<string | null>(null);

  const dark = useIsDarkTheme();
  const themeCompartment = useRef(new Compartment()).current;
  const editorTheme = useMemo(() => buildEditorTheme(dark, fontSize), [dark, fontSize]);
  const dirty = value !== initialValue;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = () => {
    onSave(value);
    onClose();
  };

  const handleFormat = async () => {
    setFormatting(true);
    setError(null);
    try {
      setValue(await formatSource(language, value));
    } catch (err) {
      setError(`Format failed: ${(err as Error).message}`);
    } finally {
      setFormatting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      handleFormat();
    }
    // Escape is now handled by Modal itself (with confirmClose), so no local handling needed.
  };

  return (
    <div className={cn("flex h-full flex-col", className)} onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-2 py-1">
        <span className="truncate text-xs text-[var(--color-text-faint)]">
          {title ?? "Edit code"}
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
          <Button onClick={handleSave} disabled={!dirty} title="Save (Ctrl/Cmd+S)">
            <Save size={12} />
            Save
          </Button>
        </div>
      </div>

      {scopeVars && scopeVars.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-faint)]">
          <span>In scope:</span>
          {scopeVars.map((v) => (
            <code
              key={v}
              className="rounded bg-[var(--color-bg-elevated)] px-1 py-0.5 font-mono text-[var(--color-accent-secondary)]"
            >
              {v}
            </code>
          ))}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {error && (
          <div className="border-b border-[var(--color-border)] px-3 py-1 text-xs text-red-500">{error}</div>
        )}
        <CodeMirror
          value={value}
          height="100%"
          theme={editorTheme}
          autoFocus
          extensions={[
            languageExtension(language),
            themeCompartment.of(syntaxHighlighting(syntaxTheme)),
            ...(wordWrap ? [EditorView.lineWrapping] : []),
          ]}
          onChange={setValue}
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
      </div>
    </div>
  );
}