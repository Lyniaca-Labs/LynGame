import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config/config.js";
import { buildProject } from "./compiler/build.js";
import ProjectHandler from "./manager/ProjectHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const projectsDir = path.join(__dirname, "../projects");

app.use(cors());
app.use(express.json());

app.use("/engine", express.static(path.join(__dirname, "../engine")));
app.use("/output", express.static(path.join(__dirname, "../output")));
app.use(express.static(path.join(__dirname, "../client"))); // serves main.js, styles.css

// --- Project list ---
app.get("/api/projects", (_req, res) => {
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });
  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  res.json({ success: true, projects });
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
            SpriteRenderer: { width: 100, height: 100, color: "#00ff00" }
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

const EDITABLE_FOLDERS = ["scenes", "components", "scripts"];

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
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(config.port, () => {
  console.log(`Server running at http://${config.host}:${config.port}`);
});