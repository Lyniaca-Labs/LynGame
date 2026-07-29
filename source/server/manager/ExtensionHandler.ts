import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "../../..")
  : path.resolve(__dirname, "../..");

const extensionsDir = path.join(sourceRoot, "extensions");
const projectsDir = path.join(sourceRoot, "projects");

// What an extension can declare about itself. Kept intentionally small and
// stringly-typed for now (`activation`/`view.type` are just labels the
// frontend picker interprets) so new activation points and view kinds can
// be added later without changing this shape — an extension author with an
// entry the current picker doesn't understand yet just doesn't show up
// anywhere, rather than crashing anything.
export interface ExtensionManifest {
  name: string;
  displayName: string;
  description?: string;
  icon?: string; // a single emoji, shown in the picker
  // Where this extension can be launched from. "toolbar" (the editor's top
  // toolbar) is the only one the frontend currently implements; more
  // (e.g. "explorer-assets-menu", "inspector-field") can be added by an
  // extension without needing a frontend change first — it just won't be
  // reachable yet.
  activation?: string[];
  view?: {
    type?: "modal" | "panel"; // only "modal" is implemented so far
    size?: "md" | "lg" | "full";
    entry?: string; // relative path within this extension's frontend/ dir
  };
}

interface LoadedExtension {
  name: string;
  dir: string;
  manifest: ExtensionManifest;
  hasFrontend: boolean;
}

// Passed into every extension's backend register(router, ctx) so it can
// safely read/write into a project's asset folder without having to
// reimplement path-traversal checks itself. Mirrors safeProjectFilePath in
// index.ts (kept as a separate copy here rather than importing from a
// script that isn't set up to export helpers, but the validation rules —
// alphanumeric/._- only, resolved path must stay inside the project's
// assets dir — are the same).
export interface ExtensionContext {
  projectsDir: string;
  resolveProjectAssetPath(project: string, filename: string): string;
  resolveProjectDataPath(project: string, extensionName: string, filename: string): string;
}

function resolveProjectAssetPath(project: string, filename: string): string {
  for (const part of [project, filename]) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(part)) {
      throw new Error(`Invalid name "${part}"`);
    }
  }
  const dir = path.join(projectsDir, project, "assets");
  const filePath = path.join(dir, filename);
  if (!filePath.startsWith(dir)) {
    throw new Error("Invalid path");
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return filePath;
}

// Non-asset per-project storage for extensions (board data, etc.) — kept
// out of assets/ so it never shows up in the Explorer's Assets tab.
function resolveProjectDataPath(project: string, extensionName: string, filename: string): string {
  for (const part of [project, extensionName, filename]) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(part)) {
      throw new Error(`Invalid name "${part}"`);
    }
  }
  const dir = path.join(projectsDir, project, ".extensions", extensionName);
  const filePath = path.join(dir, filename);
  if (!filePath.startsWith(dir)) {
    throw new Error("Invalid path");
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return filePath;
}

const context: ExtensionContext = { projectsDir, resolveProjectAssetPath, resolveProjectDataPath };

function loadManifests(): LoadedExtension[] {
  if (!fs.existsSync(extensionsDir)) return [];

  const loaded: LoadedExtension[] = [];
  for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(extensionsDir, entry.name);
    const manifestPath = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ExtensionManifest;
      if (!manifest.name) manifest.name = entry.name;
      loaded.push({
        name: entry.name,
        dir,
        manifest,
        hasFrontend: fs.existsSync(path.join(dir, "frontend")),
      });
    } catch (err) {
      console.error(`Extension "${entry.name}": invalid manifest.json —`, err);
    }
  }
  return loaded;
}

// Scans source/extensions/*, mounts each one's frontend as static files at
// /extensions/<name>/ and (if it has one) its backend router at
// /api/extensions/<name>/, and registers GET /api/extensions so the client
// can list what's available. Call once at server startup, after
// app.use(express.json()) so an extension's own routes get JSON body
// parsing for free.
export async function registerExtensions(app: express.Express): Promise<void> {
  const extensions = loadManifests();

  // Re-reads each manifest.json fresh on every request instead of reusing
  // the startup-time snapshot above — manifest fields (size, description,
  // icon, activation, ...) are just data with no server restart required to
  // pick up an edit. Route/static mounting below still only happens once at
  // boot (Express can't cheaply un-mount a router), so adding/removing an
  // extension folder, or changing its backend code, still needs a restart —
  // just not tweaking what's already in manifest.json.
  app.get("/api/extensions", (_req, res) => {
    res.json({
      success: true,
      extensions: extensions.map((e) => {
        let manifest = e.manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(path.join(e.dir, "manifest.json"), "utf-8"));
        } catch {
          // Deleted/invalid since boot — fall back to the last known-good
          // manifest rather than dropping the extension from the list.
        }
        return { ...manifest, hasFrontend: e.hasFrontend };
      }),
    });
  });

  for (const ext of extensions) {
    if (ext.hasFrontend) {
      app.use(`/extensions/${ext.name}`, express.static(path.join(ext.dir, "frontend")));
    }

    const backendEntry = ["index.js", "index.mjs"]
      .map((f) => path.join(ext.dir, "backend", f))
      .find((f) => fs.existsSync(f));

    if (!backendEntry) continue;

    try {
      const mod = await import(pathToFileURL(backendEntry).href);
      const register = mod.register ?? mod.default;
      if (typeof register !== "function") {
        console.error(`Extension "${ext.name}": backend/index.js must export a "register(router, ctx)" function`);
        continue;
      }
      const router = express.Router();
      register(router, context);
      app.use(`/api/extensions/${ext.name}`, router);
      console.log(`Extension "${ext.name}" loaded (backend + ${ext.hasFrontend ? "frontend" : "no frontend"})`);
    } catch (err) {
      console.error(`Extension "${ext.name}": failed to load backend —`, err);
    }
  }
}
