import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { compileScriptGraph, type CompileResult, type GraphValue } from "./compileScriptGraph.js";
import { defaultScriptNodeTypes, type GraphNodeTypeDefinition } from "./scriptNodeTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "../../..")
  : path.resolve(__dirname, "../..");
const scriptsRoot = (projectName: string) => path.join(sourceRoot, "projects", projectName, "scripts");

export function graphBaseName(filename: string): string {
  return filename.replace(/\.lgscript(?:\.(json|js))?$/i, "");
}

export function graphFilename(filename: string): string {
  return `${graphBaseName(filename)}.lgscript.json`;
}

export function compiledGraphFilename(filename: string): string {
  return `${graphBaseName(filename)}.lgscript.js`;
}

export function scriptSymbol(name: string): string {
  const base = name
    .replace(/\.lgscript(?:\.(json|js))?$/i, "")
    .replace(/\.js$/i, "");
  const value = base.replace(/[^a-zA-Z0-9_$]/g, "_");
  return value || "script";
}
export function compileGraph(projectName: string, filename: string, graph?: GraphValue): CompileResult {
  const sourcePath = path.join(scriptsRoot(projectName), graphFilename(filename));
  const source = graph ?? JSON.parse(fs.readFileSync(sourcePath, "utf8")) as GraphValue;
  return compileScriptGraph(source, defaultScriptNodeTypes, { functionName: scriptSymbol(filename) });
}

export function compileGraphToProject(projectName: string, filename: string): CompileResult {
  const result = compileGraph(projectName, filename);
  if (result.errors.length > 0) return result;

  fs.writeFileSync(path.join(scriptsRoot(projectName), compiledGraphFilename(filename)), `${result.code}\n`, "utf8");
  return result;
}

export function compileProjectGraphScripts(projectName: string, outputGameDir: string): void {
  const sourceDir = scriptsRoot(projectName);
  if (!fs.existsSync(sourceDir)) return;

  for (const filename of fs.readdirSync(sourceDir)) {
    if (!filename.endsWith(".lgscript.json")) continue;
    const result = compileGraphToProject(projectName, filename);
    if (result.errors.length > 0) {
      throw new Error(`Could not compile ${filename}: ${result.errors.join(" ")}`);
    }

    const outputDir = path.join(outputGameDir, "scripts");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, compiledGraphFilename(filename)), `${result.code}\n`, "utf8");
    fs.rmSync(path.join(outputDir, filename), { force: true });
  }
}

export function scriptNodeMetadata(): Record<string, Omit<GraphNodeTypeDefinition, "compile">> {
  return Object.fromEntries(
    Object.entries(defaultScriptNodeTypes).map(([key, definition]) => {
      const { compile: _compile, ...metadata } = definition;
      return [key, metadata];
    })
  );
}
