// components/CodeStringEditor.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";
import { syntaxHighlighting } from "@codemirror/language";
import { Save, WrapText, ZoomIn, ZoomOut, Wand2, X } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import {
  buildEditorTheme,
  codeMirrorBasicSetup,
  CodeLanguage,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  formatSource,
  languageExtension,
  syntaxTheme,
  useIsDarkTheme,
} from "./codeEditor/shared";

export type CodeStringLanguage = CodeLanguage;

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
          <div className="border-b border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-danger)]">{error}</div>
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
          basicSetup={codeMirrorBasicSetup}
        />
      </div>
    </div>
  );
}