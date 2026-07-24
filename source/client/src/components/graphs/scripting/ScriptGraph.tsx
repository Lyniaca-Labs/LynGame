// ScriptGraph.tsx
//
// A visual-scripting modal built on top of the generic GraphEditor.
// Node types come from scriptNodeTypes.ts (merge in your own domain nodes
// alongside defaultScriptNodeTypes). "Compile" turns the current graph
// into a single JS function via compileScriptGraph.ts. The graph itself
// is just the plain { nodes, edges } shape GraphEditor already produces,
// so saving/loading it as JSON (.lgscript or whatever extension you like)
// is a plain JSON.stringify/parse — no extra serialization step needed.

import { useCallback, useMemo, useRef, useState } from "react";
import { Save, FolderUp, Code2, Copy, X } from "lucide-react";
import { Modal } from "../../../ui/Modal";
import { Button } from "../../../ui/Button";
// NOTE: adjust this import if GraphEditor is a named export in your copy
// of the file rather than a default export.
import { type GraphValue, GraphEditor } from "../GraphEditor";
import { defaultScriptNodeTypes, type ScriptNodeTypes } from "./scriptNodeTypes";
import { compileScriptGraph, type CompileOptions } from "./compileScriptGraph";

export interface ScriptGraphProps {
  open: boolean;
  onClose: () => void;
  /** Starting graph. Defaults to an empty graph. */
  initialValue?: GraphValue;
  /** Extra node types merged over defaultScriptNodeTypes, e.g. domain-specific nodes. */
  extraNodeTypes?: ScriptNodeTypes;
  /** Options passed to the compiler (function name, param name). */
  compileOptions?: CompileOptions;
  /** Called with the graph JSON whenever the user clicks "Save". */
  onSave?: (graph: GraphValue) => void;
  /** Called with the compiled function source whenever compilation succeeds. */
  onCompile?: (code: string) => void;
  title?: string;
}

const emptyGraph: GraphValue = { nodes: [], edges: [] };

export default function ScriptGraph({
  open,
  onClose,
  initialValue,
  extraNodeTypes,
  compileOptions,
  onSave,
  onCompile,
  title = "Script Graph",
}: ScriptGraphProps) {
  const [graph, setGraph] = useState<GraphValue>(initialValue ?? emptyGraph);
  const [code, setCode] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [showCode, setShowCode] = useState(false);
  const [savedGraph, setSavedGraph] = useState<GraphValue>(initialValue ?? emptyGraph);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSaved = useMemo(() => {
    // Compare against the last-saved snapshot, not the original prop.
    return JSON.stringify(graph) === JSON.stringify(savedGraph);
  }, [graph, savedGraph]);

  const nodeTypes = useMemo(
    () => ({ ...defaultScriptNodeTypes, ...extraNodeTypes }),
    [extraNodeTypes]
  );

  const handleCompile = useCallback(() => {
    const result = compileScriptGraph(graph, nodeTypes, compileOptions);
    setErrors(result.errors);
    setCode(result.code);
    setShowCode(true);
    if (result.errors.length === 0) onCompile?.(result.code);
  }, [graph, nodeTypes, compileOptions, onCompile]);

  const handleSaveJson = useCallback(() => {
    onSave?.(graph);
    setSavedGraph(graph);
  }, [graph, onSave]);

  const handleLoadJson = useCallback((file: File) => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as GraphValue;
        setGraph(parsed);
        setCode("");
        setErrors([]);
        setShowCode(false);
      } catch {
        setErrors(["Selected file is not valid graph JSON."]);
      }
    });
  }, []);

  const handleCopyCode = useCallback(() => {
    if (code) navigator.clipboard.writeText(code);
  }, [code]);

  return (
    <Modal
      confirmClose={!hasSaved}
      open={open}
      onClose={onClose}
      title={title}
      size="full"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
      footer={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLoadJson(file);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileInputRef.current?.click()} title="Load graph JSON from disk">
            <FolderUp size={12} />
            Load JSON
          </Button>
          <Button onClick={handleSaveJson} title="Save graph JSON (Ctrl/Cmd+S)">
            <Save size={12} />
            Save
          </Button>
          <Button onClick={handleCompile} title="Compile graph to JS">
            <Code2 size={12} />
            Compile to JS
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <GraphEditor 
            nodeTypes={nodeTypes} 
            value={graph} 
            onChange={setGraph}
            onSave={handleSaveJson}
            />
        </div>

        {showCode && (
          <div className="flex w-[420px] shrink-0 flex-col border-l border-[var(--color-border)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
              <span className="text-xs font-semibold text-[var(--color-text)]">
                Compiled output
              </span>
              <div className="flex items-center gap-1.5">
                <Button onClick={handleCopyCode} disabled={!code} title="Copy compiled code">
                  <Copy size={12} />
                </Button>
                <Button onClick={() => setShowCode(false)} title="Hide compiled output">
                  <X size={12} />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {errors.length > 0 ? (
                <ul className="space-y-1 text-xs text-[var(--color-danger,#e5484d)]">
                  {errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-[var(--color-text)]">
                  {code}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NOTE FOR THE NEXT AI: how this app builds "editor-in-a-modal" popups
// ─────────────────────────────────────────────────────────────────────────
// Every full-screen editor popup in this codebase (CodeFileEditor,
// ScriptGraph, and anything else like them) follows the same shape:
//
// 1. Wrap the whole thing in <Modal size="full">. Don't build a custom
//    dialog — Modal already owns the overlay, sizing, and close behavior.
//    Put your toolbar in Modal's `footer` prop, not inside the body, so it
//    stays pinned regardless of body scroll/content size.
//
// 2. Toolbar buttons are always the shared <Button> component, never a
//    raw <button>. Button owns all the border/padding/hover/disabled
//    styling — that's what keeps every toolbar in the app visually
//    identical. The only thing you customize per-button is:
//      - a lucide-react icon at size={12}, placed before the label text
//      - a `title` attribute stating what it does (and its keyboard
//        shortcut, if any — e.g. "Save graph JSON (Ctrl/Cmd+S)")
//      - `disabled` wired to real state (e.g. disabled={!dirty}), never
//        left permanently enabled just because it's easier
//    If you need a visually distinct "primary" action, pass a className
//    override for color only (see CodeFileEditor's wordWrap toggle) —
//    don't hand-roll bg/border classes on a raw button; that's how these
//    two files drifted out of sync last time.
//
// 3. File-picker-style actions ("Load JSON", "Open file", etc.) use a
//    hidden <input type="file"> triggered via a ref + a normal Button
//    onClick — see fileInputRef above. Always reset `e.target.value = ""`
//    after reading the file so selecting the same file twice still fires
//    onChange.
//
// 4. Auxiliary/secondary panels (like the compiled-output side panel here)
//    get their own small header row with a border-b, a label on the left,
//    and small icon-only Buttons on the right (Copy, Hide/X, etc.) — same
//    Button component, just size-12 icons with no label text.
//
// 5. Everything is themed via the app's CSS custom properties
//    (--color-bg-elevated, --color-border, --color-text, --color-text-faint,
//    --color-accent, --color-danger, etc.), never hardcoded hex/Tailwind
//    color classes. This is what makes dark/light theme switching (see
//    useIsDarkTheme in CodeFileEditor) work for free across every popup.
//
// 6. This component only OWNS its own draft state and calls onSave/
//    onCompile as plain callbacks — it never talks to graphScriptsApi or
//    projectsApi directly. Persisting to disk is the parent's job (see
//    ExplorerFiles wiring onSave -> graphScriptsApi.save with
//    JSON.stringify). Keep that boundary: editors stay API-agnostic so
//    they're reusable outside this one project's storage layer.
// ─────────────────────────────────────────────────────────────────────────