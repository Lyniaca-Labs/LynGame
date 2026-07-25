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

const runtime = `
const LGTexture = {
  canvas(size) { const c = document.createElement("canvas"); c.width = size; c.height = size; const ctx = c.getContext("2d"); if (ctx) ctx.imageSmoothingEnabled = false; return c; },
  empty(size) { return this.canvas(size); },
  color(size, value) { const c = this.canvas(size), x = c.getContext("2d"); x.fillStyle = value; x.fillRect(0, 0, size, size); return c; },
  gradient(size, direction, from, to) { const c = this.canvas(size), x = c.getContext("2d"); const g = direction === "vertical" ? x.createLinearGradient(0, 0, 0, size) : direction === "diagonal" ? x.createLinearGradient(0, 0, size, size) : x.createLinearGradient(0, 0, size, 0); g.addColorStop(0, from); g.addColorStop(1, to); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; },
  channels(value) { const hex = String(value ?? "#000000").replace("#", ""); const n = Number.parseInt(hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  pixels(size, fn) { const c = this.canvas(size), x = c.getContext("2d"), image = x.createImageData(size, size); for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) { const [r, g, b] = fn(xx, y); image.data.set([r, g, b, 255], (y * size + xx) * 4); } x.putImageData(image, 0, 0); return c; },
  checker(size, tile, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); return this.pixels(size, (x, y) => (Math.floor(x / Math.max(2, tile)) + Math.floor(y / Math.max(2, tile))) % 2 ? b : a); },
  noise(size, seed, scale, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); return this.pixels(size, (x, y) => { const wave = Math.sin((x / Math.max(1, scale) + seed) * 12.9898 + (y / Math.max(1, scale) + seed) * 78.233) * 43758.5453; const amount = wave - Math.floor(wave); return a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount)); }); },
  asset(assets, key, size) { const source = assets?.[key]; if (!source) return this.empty(size); const c = this.canvas(size); c.getContext("2d").drawImage(source, 0, 0, size, size); return c; },
  blend(a, b, amount, size) { const c = this.canvas(size), x = c.getContext("2d"); x.drawImage(a, 0, 0); x.globalAlpha = amount; x.drawImage(b, 0, 0); x.globalAlpha = 1; return c; },
  filter(input, mode, amount, size) { const c = this.canvas(size), x = c.getContext("2d"); x.drawImage(input, 0, 0); const pixels = x.getImageData(0, 0, size, size); for (let i = 0; i < pixels.data.length; i += 4) for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = mode === "invert" ? 255 - pixels.data[i + channel] : Math.min(255, pixels.data[i + channel] * amount); x.putImageData(pixels, 0, 0); return c; },
  antialias(input, size, strength) { const factor = Math.max(1, Number(strength) || 2); const smallSize = Math.max(1, Math.round(size / factor)); const small = document.createElement("canvas"); small.width = smallSize; small.height = smallSize; const sx = small.getContext("2d"); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = "high"; sx.drawImage(input, 0, 0, smallSize, smallSize); const c = document.createElement("canvas"); c.width = size; c.height = size; const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(small, 0, 0, size, size); return c; }
};
`;

export function compileTextureGraph(graph: GraphValue): CompileResult {
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
  return { ...result, code: `${runtime}\n${code}` };
}

export function compileTexture(project: string, filename: string, graph?: GraphValue): CompileResult {
  const sourcePath = path.join(assetsRoot(project), textureGraphFilename(filename));
  const source = graph ?? JSON.parse(fs.readFileSync(sourcePath, "utf8")).graph as GraphValue;
  return compileTextureGraph(source);
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