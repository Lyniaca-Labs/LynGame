const projectList = document.getElementById("project-list");
const newProjectForm = document.getElementById("new-project-form");
const newProjectName = document.getElementById("new-project-name");
const status = document.getElementById("status");
const frame = document.getElementById("game-frame");

const editorPanel = document.getElementById("editor-panel");
const editorProjectName = document.getElementById("editor-project-name");
const folderTabs = document.getElementById("folder-tabs");
const fileList = document.getElementById("file-list");
const newFileForm = document.getElementById("new-file-form");
const newFileName = document.getElementById("new-file-name");

const editorToolbar = document.getElementById("editor-toolbar");
const editingFilename = document.getElementById("editing-filename");
const codeEditor = document.getElementById("code-editor");
const saveFileBtn = document.getElementById("save-file-btn");
const runBtn = document.getElementById("run-btn");

let currentProject = null;
let currentFolder = "scenes";
let currentFile = null;

function setStatus(text) {
  status.textContent = text;
}

// --- Projects ---

async function fetchProjects() {
  const res = await fetch("/api/projects");
  const data = await res.json();
  return data.projects || [];
}

async function renderProjects() {
  const projects = await fetchProjects();
  projectList.innerHTML = "";

  if (projects.length === 0) {
    projectList.innerHTML = "<div style='color:#666'>no projects yet</div>";
    return;
  }

  for (const name of projects) {
    const row = document.createElement("div");
    row.className = "project-row";

    const label = document.createElement("span");
    label.textContent = name;
    label.onclick = () => openProject(name);

    const del = document.createElement("button");
    del.textContent = "x";
    del.onclick = (e) => {
      e.stopPropagation();
      deleteProject(name);
    };

    row.appendChild(label);
    row.appendChild(del);
    projectList.appendChild(row);
  }
}

async function createProject(name) {
  setStatus(`creating ${name}...`);
  const res = await fetch(`/api/projects/${name}`, { method: "POST" });
  const data = await res.json();

  if (!data.success) {
    setStatus(`create failed: ${data.error}`);
    return;
  }

  setStatus(`created ${name}`);
  await renderProjects();
}

async function deleteProject(name) {
  if (!confirm(`Delete "${name}"?`)) return;

  setStatus(`deleting ${name}...`);
  const res = await fetch(`/api/projects/${name}`, { method: "DELETE" });
  const data = await res.json();

  if (!data.success) {
    setStatus(`delete failed: ${data.error}`);
    return;
  }

  setStatus(`deleted ${name}`);
  if (currentProject === name) closeEditor();
  await renderProjects();
}

// --- Editor: open a project ---

function openProject(name) {
  currentProject = name;
  currentFile = null;
  editorProjectName.textContent = name;
  editorPanel.classList.remove("hidden");
  editorToolbar.classList.remove("hidden");
  setActiveFolder("scenes");
}

function closeEditor() {
  currentProject = null;
  currentFile = null;
  editorPanel.classList.add("hidden");
  editorToolbar.classList.add("hidden");
  codeEditor.classList.add("hidden");
  frame.src = "";
}

// --- Folder tabs ---

folderTabs.addEventListener("click", (e) => {
  const folder = e.target.dataset.folder;
  if (!folder) return;
  setActiveFolder(folder);
});

async function setActiveFolder(folder) {
  currentFolder = folder;
  for (const btn of folderTabs.querySelectorAll(".tab")) {
    btn.classList.toggle("active", btn.dataset.folder === folder);
  }
  await renderFileList();
}

// --- File list ---

async function fetchFiles() {
  const res = await fetch(`/api/projects/${currentProject}/${currentFolder}`);
  const data = await res.json();
  return data.files || [];
}

async function renderFileList() {
  const files = await fetchFiles();
  fileList.innerHTML = "";

  if (files.length === 0) {
    fileList.innerHTML = "<div style='color:#666'>no files</div>";
    return;
  }

  for (const filename of files) {
    const row = document.createElement("div");
    row.className = "file-row";
    if (filename === currentFile) row.classList.add("active");

    const label = document.createElement("span");
    label.textContent = filename;
    label.onclick = () => openFile(filename);

    const del = document.createElement("button");
    del.textContent = "x";
    del.onclick = (e) => {
      e.stopPropagation();
      deleteFile(filename);
    };

    row.appendChild(label);
    row.appendChild(del);
    fileList.appendChild(row);
  }
}

// --- File editing ---

async function openFile(filename) {
  setStatus(`opening ${filename}...`);
  const res = await fetch(`/api/projects/${currentProject}/${currentFolder}/${filename}`);
  const data = await res.json();

  if (!data.success) {
    setStatus(`open failed: ${data.error}`);
    return;
  }

  currentFile = filename;
  editingFilename.textContent = `${currentFolder}/${filename}`;
  codeEditor.value = data.content;
  codeEditor.classList.remove("hidden");
  setStatus(`editing ${filename}`);
  await renderFileList();
}

async function saveFile() {
  if (!currentFile) return;
  setStatus(`saving ${currentFile}...`);
  const res = await fetch(`/api/projects/${currentProject}/${currentFolder}/${currentFile}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: codeEditor.value }),
  });
  const data = await res.json();
  setStatus(data.success ? `saved ${currentFile}` : `save failed: ${data.error}`);
}

async function deleteFile(filename) {
  if (!confirm(`Delete "${filename}"?`)) return;
  const res = await fetch(`/api/projects/${currentProject}/${currentFolder}/${filename}`, {
    method: "DELETE",
  });
  const data = await res.json();

  if (!data.success) {
    setStatus(`delete failed: ${data.error}`);
    return;
  }

  if (currentFile === filename) {
    currentFile = null;
    codeEditor.classList.add("hidden");
    codeEditor.value = "";
  }
  setStatus(`deleted ${filename}`);
  await renderFileList();
}

newFileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newFileName.value.trim();
  if (!name || !currentProject) return;

  const defaultContent =
    currentFolder === "scenes"
      ? JSON.stringify({ name: name.replace(".json", ""), entities: [] }, null, 2)
      : "// new file\n";

  const res = await fetch(`/api/projects/${currentProject}/${currentFolder}/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: defaultContent }),
  });
  const data = await res.json();

  newFileName.value = "";
  if (!data.success) {
    setStatus(`create failed: ${data.error}`);
    return;
  }

  await renderFileList();
  openFile(name);
});

saveFileBtn.addEventListener("click", saveFile);

// --- Run ---

runBtn.addEventListener("click", async () => {
  if (!currentProject) return;
  setStatus(`building ${currentProject}...`);
  const res = await fetch(`/api/build/${currentProject}`, { method: "POST" });
  const data = await res.json();

  if (!data.success) {
    setStatus(`build failed: ${data.error}`);
    return;
  }

  setStatus(`running ${currentProject}`);
  frame.src = data.url;
});

newProjectForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = newProjectName.value.trim();
  if (!name) return;
  newProjectName.value = "";
  createProject(name);
});

renderProjects();