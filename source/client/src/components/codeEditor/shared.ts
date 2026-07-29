// Shared theme/language/formatting setup for the two CodeMirror-based code
// editors (CodeFileEditor, for on-disk files; CodeStringEditor, for inline
// code fields) so they render and format identically instead of drifting.
import { useEffect, useState } from "react";
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import * as prettier from "prettier/standalone";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as tsPlugin from "prettier/plugins/typescript";

export type CodeLanguage = "js" | "jsx" | "ts" | "tsx" | "json";

export function languageFromFilename(filename: string): CodeLanguage {
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".tsx")) return "tsx";
  if (filename.endsWith(".ts")) return "ts";
  if (filename.endsWith(".jsx")) return "jsx";
  return "js";
}

export function languageExtension(lang: CodeLanguage) {
  if (lang === "json") return json();
  return javascript({ typescript: lang === "ts" || lang === "tsx", jsx: lang === "jsx" || lang === "tsx" });
}

export async function formatSource(lang: CodeLanguage, source: string): Promise<string> {
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

export function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(isDarkTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function buildEditorTheme(dark: boolean, fontSize: number) {
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

export const syntaxTheme = HighlightStyle.define([
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

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 22;

export const codeMirrorBasicSetup = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  autocompletion: true,
  bracketMatching: true,
  closeBrackets: true,
  highlightSelectionMatches: true,
  searchKeymap: true,
};
