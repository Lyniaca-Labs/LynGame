import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ProjectHandler from "../manager/ProjectHandler.js";
import { resolveAliases } from "./aliasResolver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function injectLGAlias(outDir) {
  const gameDir = path.join(outDir, "game");
  if (!fs.existsSync(gameDir)) return;

  function walk(dir) {
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

export function buildProject(projectName) {
  const engineSrc = path.join(__dirname, "../../engine");
  const projectSrc = path.join(__dirname, "../../projects", projectName);
  const outDir = path.join(__dirname, "../../output", projectName);
  const templatePath = path.join(__dirname, "./templates/index.html");

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  fs.cpSync(engineSrc, path.join(outDir, "engine"), { recursive: true });
  fs.cpSync(projectSrc, path.join(outDir, "game"), { recursive: true });

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