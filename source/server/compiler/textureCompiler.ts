import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { compileScriptGraph, type CompileResult, type GraphValue } from "./compileScriptGraph.js";
import { textureScriptNodeTypes } from "./textureNodeRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "../../..")
  : path.resolve(__dirname, "../..");
const assetsRoot = (project: string) => path.join(sourceRoot, "projects", project, "assets");

export function textureBaseName(filename: string): string {
  return filename.replace(/\.texture(?:\.(?:json|js))?$/i, "").replace(/\.json$/i, "");
}

export function textureGraphFilename(filename: string): string {
  return `${textureBaseName(filename)}.texture.json`;
}

export function compiledTextureFilename(filename: string): string {
  return `${textureBaseName(filename)}.texture.js`;
}


let runtime: string | undefined;
let runtimeMtimeMs: number | undefined;

function getRuntime(): string {
  const runtimePath = path.join(sourceRoot, "engine", "modules", "TextureEngine.js");
  if (!fs.existsSync(runtimePath)) {
    throw new Error(`TextureEngine.js not found at ${runtimePath}`);
  }

  const { mtimeMs } = fs.statSync(runtimePath);
  if (runtime && runtimeMtimeMs === mtimeMs) {
    return runtime; // unchanged since last read, reuse cache
  }

  const runtimeCode = fs.readFileSync(runtimePath, "utf8");
  const runtimeCodeWithoutExport = runtimeCode.replace(
    /export\s+const\s+LGTexture\s*=\s*{/,
    "const LGTexture = {",
  );
  if (runtimeCodeWithoutExport === runtimeCode) {
    throw new Error("Failed to strip export statement from TextureEngine.js — check its format");
  }

  runtime = runtimeCodeWithoutExport;
  runtimeMtimeMs = mtimeMs;
  return runtime;
}

export function compileTextureGraph(graph: GraphValue, isBuild = false): CompileResult {
  const normalized: GraphValue = {
    ...graph,
    nodes: graph.nodes.map((node) => node.type === "texture.output" ? { ...node, type: "script.output" } : node),
  };
  const result = compileScriptGraph(normalized, textureScriptNodeTypes, { functionName: "buildTexture" });
  if (result.errors.length > 0) return result;
  // Texture builders are called with one options object by both the editor
  // preview and AssetLoader. The generic script compiler uses the script
  // calling convention, so normalize the generated entry point here.
  const code = result.code.replace(
    "export function buildTexture(entity, engine, dt, data = {}) {",
    "export function buildTexture(data = {}) {",
  );
  // isBuild is true when compiling for the final game build, in which case we want to import LGTexture from the engine module. Otherwise, use the runtime implementation for the editor preview.
  const libImport = isBuild ? `import { LGTexture } from "../../engine/index.js";` : getRuntime();
  return { ...result, code: `${libImport}\n${code}` };
}

export function compileTexture(project: string, filename: string, graph?: GraphValue): CompileResult {
  const sourcePath = path.join(assetsRoot(project), textureGraphFilename(filename));
  const source = graph ?? JSON.parse(fs.readFileSync(sourcePath, "utf8")).graph as GraphValue;
  return compileTextureGraph(source, true);
}

export function compileTextureToProject(project: string, filename: string, graph?: GraphValue): CompileResult {
  const result = compileTexture(project, filename, graph);
  if (result.errors.length > 0) return result;
  fs.writeFileSync(path.join(assetsRoot(project), compiledTextureFilename(filename)), `${result.code}\n`, "utf8");
  return result;
}

export function compileProjectTextures(project: string, outputGameDir: string): void {
  const sourceDir = assetsRoot(project);
  if (!fs.existsSync(sourceDir)) return;
  const outputDir = path.join(outputGameDir, "assets");
  for (const filename of fs.readdirSync(sourceDir)) {
    if (!filename.endsWith(".texture.json")) continue;
    const result = compileTextureToProject(project, filename);
    if (result.errors.length > 0) throw new Error(`Could not compile ${filename}: ${result.errors.join(" ")}`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, compiledTextureFilename(filename)), `${result.code}\n`, "utf8");
    fs.rmSync(path.join(outputDir, filename), { force: true });
  }
}

export { getTextureNodeMetadata } from "./textureNodeRegistry.js";