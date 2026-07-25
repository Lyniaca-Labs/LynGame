import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config/config.js";
import { buildProject } from "./compiler/build.js";
import ProjectHandler from "./manager/ProjectHandler.js";
import { spawn } from "child_process";
import { compileGraphToProject, scriptNodeMetadata } from "./compiler/graphScripts.js";
import { compileTextureToProject } from "./compiler/textureCompiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Source runs from server/, while compiled output runs from server/dist/.
// Keep all game assets rooted at source/ in both modes.
const sourceRoot = path.resolve(__dirname, __dirname.endsWith(`${path.sep}dist`) ? "../../" : "../");
const projectsDir = path.join(sourceRoot, "projects");

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/engine", express.static(path.join(sourceRoot, "engine")));
app.use("/output", express.static(path.join(sourceRoot, "output")));
app.use(express.static(path.join(sourceRoot, "client/dist")));
app.use(express.static(path.join(sourceRoot, "client")));

// Visual-script node definitions are served from the backend's compiler
// registry so the editor and build process cannot drift apart.
app.get("/api/scripts/nodes", (_req, res) => {
  res.json({ success: true, nodes: scriptNodeMetadata() });
});

app.post("/api/projects/:project/scripts/:filename/compile", (req, res) => {
  try {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_.-]+(?:\.lgscript)?$/.test(filename)) {
      return res.status(400).json({ success: false, error: "Invalid graph script name" });
    }

    const result = compileGraphToProject(req.params.project, filename);
    if (result.errors.length > 0) {
      return res.status(422).json({ success: false, code: "", errors: result.errors });
    }
    res.json({ success: true, code: result.code });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/projects/:project/assets/:filename/compile", (req, res) => {
  try {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_.-]+(?:\.texture)?(?:\.json)?$/.test(filename)) {
      return res.status(400).json({ success: false, error: "Invalid texture name" });
    }
    const result = compileTextureToProject(req.params.project, filename, req.body?.graph);
    if (result.errors.length > 0) return res.status(422).json({ success: false, code: "", errors: result.errors });
    res.json({ success: true, code: result.code });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// --- Project list ---
app.get("/api/projects", (_req, res) => {
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });
  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  res.json({ success: true, projects });
});

app.get("/api/projects/:project/editor", async (req, res) => {
  try {
    const snapshot = await ProjectHandler.editorSnapshot(req.params.project);

    res.json({
      success: true,
      ...snapshot,
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get("/api/projects/:project/scenes/:scene", (req, res) => {
  try { res.json({ success: true, scene: ProjectHandler.getScene(req.params.project, req.params.scene) }); }
  catch (err) { res.status(404).json({ success: false, error: err.message }); }
});

app.put("/api/projects/:project/scenes/:scene", (req, res) => {
  try {
    const { dir, filePath } = safeProjectFilePath(req.params.project, "scenes", `${req.params.scene}.json`);
    if (!req.body.scene || typeof req.body.scene !== "object") return res.status(400).json({ success: false, error: "Missing scene object" });
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(req.body.scene, null, 2));
    res.json({ success: true });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// TODO: implement
app.post("/api/projects/:project/open-script", (req, res) => {
  try {
    const { filePath } = safeProjectFilePath(req.params.project, "scripts", req.body.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: "Script not found" });
    const child = spawn("code", ["--reuse-window", filePath], { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", () => { if (!res.headersSent) res.status(503).json({ success: false, error: "Visual Studio Code is not available. Install VS Code and enable the `code` command." }); });
    child.once("spawn", () => { if (!res.headersSent) res.json({ success: true, openedWith: "code" }); });
    child.unref();
  } catch (err) {
    res.status(500).json({ success: false, error: "Visual Studio Code could not be opened. Is the `code` command installed?" });
  }
});

// --- Create project ---
app.post("/api/projects/:project", (req, res) => {
  const dir = path.join(projectsDir, req.params.project);
  if (fs.existsSync(dir)) {
    return res.status(400).json({ success: false, error: "Project already exists" });
  }

  for (const folder of ["assets", "components", "scripts", "scenes", "prefabs"]) {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
  }

  fs.writeFileSync(
    path.join(dir, "project.lg"),
    ProjectHandler.newConfig(req.params.project)
  );

  fs.writeFileSync(
    path.join(dir, "scenes", "main.json"),
    JSON.stringify({
      name: "main",
      entities: [
        {
          id: "rectangle1",
          components: {
            Transform: { x: 50, y: 50, rotation: 0 },
            ShapeRenderer: { width: 100, height: 100, color: "#00ff00" }
          }
        }
      ]
    }, null, 2)
  );

  res.json({ success: true });
});

// --- Delete project ---
app.delete("/api/projects/:project", (req, res) => {
  const dir = path.join(projectsDir, req.params.project);
  if (!fs.existsSync(dir)) {
    return res.status(404).json({ success: false, error: "Project not found" });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ success: true });
});

// --- Build + run ---
app.post("/api/build/:project", (req, res) => {
  try {
    buildProject(req.params.project);
    res.json({ success: true, url: `/output/${req.params.project}/index.html` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/output/*splat", (_req, res) => {
  res.status(404).send("Build not found — run the build first.");
});

// --- Generic project file editing (scenes / components / scripts) ---

const EDITABLE_FOLDERS = ["scenes", "components", "scripts", "prefabs", "assets"];

function safeProjectFilePath(project, folder, filename) {
  if (!EDITABLE_FOLDERS.includes(folder)) {
    throw new Error(`Invalid folder "${folder}"`);
  }
  // block path traversal in project, folder, and filename
  for (const part of [project, filename]) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(part)) {
      throw new Error(`Invalid name "${part}"`);
    }
  }
  const dir = path.join(projectsDir, project, folder);
  const filePath = path.join(dir, filename);
  // ensure resolved path is still inside the intended folder
  if (!filePath.startsWith(dir)) {
    throw new Error("Invalid path");
  }
  return { dir, filePath };
}

// List files in a folder (scenes/components/scripts)
app.get("/api/projects/:project/:folder", (req, res) => {
  try {
    const { dir } = safeProjectFilePath(req.params.project, req.params.folder, "placeholder.tmp");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
    res.json({ success: true, files });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Read a single file's contents
app.get("/api/projects/:project/:folder/:filename", (req, res) => {
  try {
    const { filePath } = safeProjectFilePath(req.params.project, req.params.folder, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    const content = fs.readFileSync(filePath, "utf-8");
    res.json({ success: true, content });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Create or overwrite a file
app.put("/api/projects/:project/:folder/:filename", (req, res) => {
  try {
    const { dir, filePath } = safeProjectFilePath(req.params.project, req.params.folder, req.params.filename);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { content } = req.body;
    if (typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Missing 'content' string in body" });
    }
    fs.writeFileSync(filePath, content, "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Binary-safe asset import. The client reads dropped/pasted files as a data URL
// and sends only the payload; this avoids corrupting PNG/JPEG bytes through
// the text-file endpoint.
app.post("/api/projects/:project/assets/import", (req, res) => {
  try {
    const filename = String(req.body?.filename ?? "");
    const data = String(req.body?.data ?? "");
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || !data.startsWith("data:")) {
      return res.status(400).json({ success: false, error: "Invalid asset import" });
    }
    const comma = data.indexOf(",");
    if (comma < 0) return res.status(400).json({ success: false, error: "Invalid data URL" });
    const encoded = data.slice(comma + 1);
    const { dir, filePath } = safeProjectFilePath(req.params.project, "assets", filename);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(encoded, "base64"));
    res.json({ success: true });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

app.get("/api/projects/:project/assets/raw/:filename", (req, res) => {
  try {
    const filePath = safeProjectFilePath(req.params.project, "assets", req.params.filename).filePath;
    if (!fs.existsSync(filePath)) return res.status(404).send("Asset not found");
    res.sendFile(filePath);
  } catch (err) { res.status(400).send(err instanceof Error ? err.message : String(err)); }
});

app.post("/api/projects/:project/assets/rename", (req, res) => {
  try {
    const from = String(req.body?.from ?? "");
    const to = String(req.body?.to ?? "");
    if (!/^[a-zA-Z0-9_.-]+$/.test(from) || !/^[a-zA-Z0-9_.-]+$/.test(to)) {
      return res.status(400).json({ success: false, error: "Invalid asset name" });
    }
    const source = safeProjectFilePath(req.params.project, "assets", from).filePath;
    const target = safeProjectFilePath(req.params.project, "assets", to).filePath;
    if (!fs.existsSync(source)) return res.status(404).json({ success: false, error: "Asset not found" });
    if (fs.existsSync(target)) return res.status(409).json({ success: false, error: "An asset with that name already exists" });
    fs.renameSync(source, target);
    res.json({ success: true });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// Delete a file
app.delete("/api/projects/:project/:folder/:filename", (req, res) => {
  try {
    const { filePath } = safeProjectFilePath(req.params.project, req.params.folder, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    fs.rmSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/", (_req, res) => {
  const built = path.join(sourceRoot, "client/dist/index.html");
  res.sendFile(fs.existsSync(built) ? built : path.join(sourceRoot, "client/index.html"));
});

app.listen(config.port, () => {
  console.log(`Server running at http://${config.host}:${config.port}`);
});
