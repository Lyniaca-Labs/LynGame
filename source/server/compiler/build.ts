import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ProjectHandler from "../manager/ProjectHandler.js";
import { resolveAliases } from "./aliasResolver.js";
import { compileProjectGraphScripts } from "./graphScripts.js";
import { compileProjectTextures } from "./textureCompiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "../../..")
  : path.resolve(__dirname, "../..");

function injectLGAlias(outDir: string): void {
  const gameDir = path.join(outDir, "game");
  if (!fs.existsSync(gameDir)) return;

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;

      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.includes("const LG = window.LG;")) continue;

      const lines = content.split("\n");
      let lastImportIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\s/.test(lines[i])) lastImportIndex = i;
      }

      lines.splice(lastImportIndex + 1, 0, "const LG = window.LG;");
      fs.writeFileSync(fullPath, lines.join("\n"), "utf-8");
    }
  }

  walk(gameDir);
}

export function buildProject(projectName: string): string {
  const engineSrc = path.join(sourceRoot, "engine");
  const projectSrc = path.join(sourceRoot, "projects", projectName);
  const outDir = path.join(sourceRoot, "output", projectName);
  const templatePath = path.join(sourceRoot, "server/compiler/templates/index.html");

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  fs.cpSync(engineSrc, path.join(outDir, "engine"), { recursive: true });
  // .extensions/ holds editor-tool data (e.g. the board extension's
  // boards) — not game content, so it's excluded from the shipped build.
  fs.cpSync(projectSrc, path.join(outDir, "game"), {
    recursive: true,
    filter: (src) => path.basename(src) !== ".extensions",
  });
  // Graph JSON is editor source only. The final game receives the generated
  // JavaScript beside ordinary scripts, with the same import/attach path.
  compileProjectGraphScripts(projectName, path.join(outDir, "game"));
  compileProjectTextures(projectName, path.join(outDir, "game"));

  const html = fs
    .readFileSync(templatePath, "utf8")
    .replace(/{{\s*PROJECT_NAME\s*}}/g, projectName);

  fs.writeFileSync(path.join(outDir, "index.html"), html);

  const buildData = ProjectHandler.buildMain(projectName);
  fs.writeFileSync(path.join(outDir, "game", "main.js"), buildData);

  resolveAliases(outDir);
  injectLGAlias(outDir); // add after main.js exists so it gets the injection too

  return outDir;
}
