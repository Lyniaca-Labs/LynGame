import fs from "fs";
import path from "path";

// Aliases and what engine subfolder they map to
const ALIASES = {
  "@types": "engine/types",
  "@components": "engine/components",
  "@engine": "engine",
};

// Recursively walk a directory and return every .js file
function walkJsFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkJsFiles(fullPath));
    } else if (entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

// Resolve aliases in every .js file under outDir/game, relative to outDir
export function resolveAliases(outDir) {
  const gameDir = path.join(outDir, "game");
  if (!fs.existsSync(gameDir)) return;

  const files = walkJsFiles(gameDir);

  for (const filePath of files) {
    let content = fs.readFileSync(filePath, "utf-8");
    const fileDir = path.dirname(filePath);

    let changed = false;

    for (const [alias, target] of Object.entries(ALIASES)) {
      const targetAbsPath = path.join(outDir, target);
      let relPath = path.relative(fileDir, targetAbsPath).replace(/\\/g, "/");
      if (!relPath.startsWith(".")) relPath = "./" + relPath;

      const aliasPattern = new RegExp(
        `(["'])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`,
        "g"
      );

      if (aliasPattern.test(content)) {
        content = content.replace(aliasPattern, `$1${relPath}/`);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }
}