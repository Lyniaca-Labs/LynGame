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

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  fs.cpSync(engineSrc, path.join(outDir, "engine"), { recursive: true });
  fs.cpSync(projectSrc, path.join(outDir, "game"), { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${projectName}</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  #game-container { width: 100%; height: 100%; }
</style>
</head>
<body>
  <div id="game-container"></div>
  <script>
    (function () {
      function send(level, args) {
        try {
          window.parent.postMessage(
            {
              source: "game-console",
              level: level,
              args: args.map(function (a) {
                if (a instanceof Error) return a.stack || a.message;
                if (typeof a === "object") {
                  try { return JSON.stringify(a); } catch (e) { return String(a); }
                }
                return String(a);
              }),
              timestamp: Date.now(),
            },
            "*"
          );
        } catch (e) {
          // no parent, or parent gone — nothing to do
        }
      }
    
      ["log", "info", "warn", "error"].forEach(function (level) {
        var original = console[level] ? console[level].bind(console) : function () {};
        console[level] = function () {
          send(level, Array.prototype.slice.call(arguments));
          original.apply(console, arguments);
        };
      });
    
      window.addEventListener("error", function (e) {
        send("error", [e.message + " (" + e.filename + ":" + e.lineno + ")"]);
      });
    
      window.addEventListener("unhandledrejection", function (e) {
        send("error", [
          "Unhandled promise rejection: " +
            (e.reason && e.reason.message ? e.reason.message : e.reason),
        ]);
      });
    })();
  </script>
  <script type="module">
    import { GameEngine } from "./engine/index.js";

    const engine = new GameEngine(document.getElementById("game-container"));
    window.engine = engine;
    window.LG = engine;

    const { init } = await import("./game/main.js");
    init(engine);
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, "index.html"), html);

  const buildData = ProjectHandler.buildMain(projectName);
  fs.writeFileSync(path.join(outDir, "game", "main.js"), buildData);

  resolveAliases(outDir);
  injectLGAlias(outDir); // add after main.js exists so it gets the injection too

  return outDir;
}