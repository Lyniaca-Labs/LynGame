# Board Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-project TODO/Trello board editor extension (`source/extensions/board/`) with user-defined columns, cards (title + description), drag-and-drop reordering, and autosave.

**Architecture:** New extension following the exact `pixel-art`/`sfx-generator` pattern (`manifest.json` + static `frontend/` + `backend/index.js` exporting `register(router, ctx)`), plus one small addition to the shared `ExtensionContext` in `source/server/manager/ExtensionHandler.ts` so extension data can be stored outside a project's `assets/` folder. Frontend is vanilla JS/CSS (no framework, no bundler — served as static files, matching every other extension), using native HTML5 drag-and-drop and custom in-page dialogs (see Global Constraints — native `confirm()`/`prompt()` don't work in this app's sandboxed iframe).

**Tech Stack:** TypeScript (server), vanilla JS ES modules + HTML/CSS (extension frontend), Express (backend routes), Node's built-in `node:test` + `node:assert/strict` for unit tests.

## Global Constraints

- No new npm dependencies. Extensions are static files with no bundler — everything is plain ES modules (`<script type="module">`, `import`/`export` in `.mjs` files), matching `source/extensions/pixel-art/` and `source/extensions/sfx-generator/`.
- Board data is **not** a game asset — store it under `source/projects/<project>/.extensions/<extensionName>/`, never in `assets/` (that folder is shown in the editor's Explorer "Assets" tab).
- IDs are short client-generated strings: `` `${prefix}_${crypto.randomUUID().slice(0, 8)}` ``, prefixes `b_` (board), `c_` (column), `k_` (card).
- **The extension's frontend runs inside a sandboxed iframe** (`sandbox="allow-scripts allow-same-origin allow-forms"` — see `source/client/src/components/ExtensionsModal.tsx:90`). There is **no `allow-modals` token**, so `window.confirm()`, `window.prompt()`, and `window.alert()` silently no-op (per the HTML sandboxing spec, they act as if immediately cancelled — no dialog appears). Do not use them. All confirmations and text-entry prompts in this extension must be custom in-page overlay UI (see Task 6).
- Unit tests: plain `node:test` + `node:assert/strict` in `.mjs` files under each extension's `test/` folder, run via `node --test <path>` — no test framework/runner config exists in this repo, this is the established convention (see `source/extensions/pixel-art/test/`).
- Server dev command: `cd source/server && npm run dev` (serves on `http://localhost:5664`, per `source/server/config/server.json`). Client dev command: `cd source/client && npm run dev` (Vite).
- Any `.extensions/` folders created under `source/projects/*/` during manual verification are local dev artifacts — don't `git add` them (Task 1 adds a `.gitignore` rule so this is automatic).

---

### Task 1: Backend infra — `resolveProjectDataPath`

**Files:**
- Modify: `source/server/manager/ExtensionHandler.ts:52-72`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `ExtensionContext.resolveProjectDataPath(project: string, extensionName: string, filename: string): string` — resolves (and creates if missing) a path under `source/projects/<project>/.extensions/<extensionName>/<filename>`, with the same validation as the existing `resolveProjectAssetPath`. Every later task's backend code uses this.

- [ ] **Step 1: Add the new method to the `ExtensionContext` interface**

In `source/server/manager/ExtensionHandler.ts`, find:

```ts
export interface ExtensionContext {
  projectsDir: string;
  resolveProjectAssetPath(project: string, filename: string): string;
}
```

Replace with:

```ts
export interface ExtensionContext {
  projectsDir: string;
  resolveProjectAssetPath(project: string, filename: string): string;
  resolveProjectDataPath(project: string, extensionName: string, filename: string): string;
}
```

- [ ] **Step 2: Implement the function and wire it into the shared `context` object**

Find:

```ts
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

const context: ExtensionContext = { projectsDir, resolveProjectAssetPath };
```

Replace with:

```ts
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
```

- [ ] **Step 3: Verify it compiles**

Run: `cd source/server && npm run typecheck`
Expected: exits with no errors.

- [ ] **Step 4: Add a `.gitignore` rule for extension-generated project data**

In `.gitignore`, add a new section at the end of the file:

```
# Per-project data generated by editor extensions (e.g. the board
# extension) — not game assets, not meant to be committed with sample
# projects.
source/projects/*/.extensions/
```

- [ ] **Step 5: Commit**

```bash
git add source/server/manager/ExtensionHandler.ts .gitignore
git commit -m "feat(extensions): add resolveProjectDataPath for non-asset project data"
```

---

### Task 2: Extension scaffold

**Files:**
- Create: `source/extensions/board/manifest.json`
- Create: `source/extensions/board/frontend/index.html`

**Interfaces:**
- Produces: the extension shows up in the toolbar picker as `"board"` / `"Board"`; its frontend is reachable at `/extensions/board/index.html?project=<name>`. Task 6 replaces this file's contents wholesale.

- [ ] **Step 1: Create the manifest**

`source/extensions/board/manifest.json`:

```json
{
  "name": "board",
  "displayName": "Board",
  "description": "Organize ideas and tasks on a drag-and-drop board, per project.",
  "icon": "📋",
  "activation": ["toolbar"],
  "view": {
    "type": "modal",
    "size": "full",
    "entry": "index.html"
  }
}
```

- [ ] **Step 2: Create a minimal scaffold frontend**

`source/extensions/board/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Board</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    font: 13px/1.4 -apple-system, "Segoe UI", sans-serif;
    background: #17181c;
    color: #e8e8ec;
    padding: 16px;
  }
</style>
</head>
<body>
  <div id="status">Loading…</div>
  <script type="module">
    const params = new URLSearchParams(location.search);
    const project = params.get("project") || "";
    document.getElementById("status").textContent = project
      ? `Board extension scaffold loaded for project "${project}".`
      : "No project — open this from the editor.";
  </script>
</body>
</html>
```

- [ ] **Step 3: Verify manually**

Run (two terminals): `cd source/server && npm run dev` and `cd source/client && npm run dev`. Open the client's local URL in a browser, open the existing `test` project, click the toolbar's Extensions button, confirm a "📋 Board" tile appears, click it, and confirm the iframe shows: `Board extension scaffold loaded for project "test".`

- [ ] **Step 4: Commit**

```bash
git add source/extensions/board/manifest.json source/extensions/board/frontend/index.html
git commit -m "feat(board): scaffold extension manifest and frontend shell"
```

---

### Task 3: `reorder.mjs` — pure reorder logic (TDD)

**Files:**
- Create: `source/extensions/board/frontend/js/reorder.mjs`
- Test: `source/extensions/board/test/reorder.test.mjs`

**Interfaces:**
- Produces: `moveItem(array: T[], fromIndex: number, toIndex: number): T[]` — returns a **new** array with the item at `fromIndex` relocated to `toIndex` (does not mutate its input). Used by Task 7 for both card and column drag reordering.

- [ ] **Step 1: Write the failing tests**

`source/extensions/board/test/reorder.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { moveItem } from "../frontend/js/reorder.mjs";

test("moveItem moves an item forward in the array", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
});

test("moveItem moves an item backward in the array", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
});

test("moveItem to the same index is a no-op", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("moveItem to index 0 moves the item to the start", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
});

test("moveItem to the last index moves the item to the end", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
});

test("moveItem does not mutate the input array", () => {
  const input = ["a", "b", "c"];
  moveItem(input, 0, 2);
  assert.deepEqual(input, ["a", "b", "c"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test source/extensions/board/test/reorder.test.mjs`
Expected: FAIL — `Cannot find module '../frontend/js/reorder.mjs'`

- [ ] **Step 3: Implement**

`source/extensions/board/frontend/js/reorder.mjs`:

```js
export function moveItem(array, fromIndex, toIndex) {
  const copy = array.slice();
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test source/extensions/board/test/reorder.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add source/extensions/board/frontend/js/reorder.mjs source/extensions/board/test/reorder.test.mjs
git commit -m "feat(board): add pure array reorder helper"
```

---

### Task 4: `store.mjs` — model constructors (TDD)

**Files:**
- Create: `source/extensions/board/frontend/js/store.mjs`
- Test: `source/extensions/board/test/store.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createId(prefix: string): string`
  - `createCard(title: string): { id, title, description: "" }`
  - `createColumn(name: string): { id, name, cards: [] }`
  - `createBoard(name: string): { id, name, createdAt, columns: [3 starter columns] }`

  Task 6 adds fetch wrappers (`listBoards`, `loadBoard`, `saveBoard`, `deleteBoard`) to this same file.

- [ ] **Step 1: Write the failing tests**

`source/extensions/board/test/store.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createId, createCard, createColumn, createBoard } from "../frontend/js/store.mjs";

test("createId prefixes the id and includes a random suffix", () => {
  const id = createId("x");
  assert.match(id, /^x_[a-z0-9]{8}$/);
});

test("createId produces different ids on each call", () => {
  assert.notEqual(createId("x"), createId("x"));
});

test("createCard has a k_ id, the given title, and an empty description", () => {
  const card = createCard("Add screen shake");
  assert.match(card.id, /^k_/);
  assert.equal(card.title, "Add screen shake");
  assert.equal(card.description, "");
});

test("createColumn has a c_ id, the given name, and no cards", () => {
  const column = createColumn("To Do");
  assert.match(column.id, /^c_/);
  assert.equal(column.name, "To Do");
  assert.deepEqual(column.cards, []);
});

test("createBoard has a b_ id, the given name, a createdAt timestamp, and 3 starter columns", () => {
  const board = createBoard("Features");
  assert.match(board.id, /^b_/);
  assert.equal(board.name, "Features");
  assert.equal(typeof board.createdAt, "string");
  assert.deepEqual(board.columns.map((c) => c.name), ["To Do", "In Progress", "Done"]);
  for (const column of board.columns) assert.deepEqual(column.cards, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test source/extensions/board/test/store.test.mjs`
Expected: FAIL — `Cannot find module '../frontend/js/store.mjs'`

- [ ] **Step 3: Implement**

`source/extensions/board/frontend/js/store.mjs`:

```js
export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createCard(title) {
  return { id: createId("k"), title, description: "" };
}

export function createColumn(name) {
  return { id: createId("c"), name, cards: [] };
}

export function createBoard(name) {
  return {
    id: createId("b"),
    name,
    createdAt: new Date().toISOString(),
    columns: [createColumn("To Do"), createColumn("In Progress"), createColumn("Done")],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test source/extensions/board/test/store.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add source/extensions/board/frontend/js/store.mjs source/extensions/board/test/store.test.mjs
git commit -m "feat(board): add board/column/card model constructors"
```

---

### Task 5: Backend routes

**Files:**
- Create: `source/extensions/board/backend/index.js`

**Interfaces:**
- Consumes: `ExtensionContext.resolveProjectDataPath` (Task 1).
- Produces: mounted at `/api/extensions/board/` (by `ExtensionHandler.ts`, unchanged — it auto-discovers `backend/index.js`):
  - `GET /list?project=X` → `{ success: true, boards: [{id, name}] }`
  - `GET /board?project=X&id=Y` → `{ success: true, board }` or `404` `{ success: false, error }`
  - `POST /save` body `{ project, board }` → `{ success: true }`
  - `POST /delete` body `{ project, id }` → `{ success: true }`

  Task 6's `store.mjs` fetch wrappers call these exact routes.

- [ ] **Step 1: Implement the routes**

`source/extensions/board/backend/index.js`:

```js
import fs from "fs";

// Registered by ExtensionHandler.ts and mounted at /api/extensions/board.
// Board data isn't a game asset, so it's stored via
// ctx.resolveProjectDataPath (under the project's .extensions/board/
// folder) instead of ctx.resolveProjectAssetPath (which writes into
// assets/, shown in the Explorer's Assets tab).
export function register(router, ctx) {
  function indexPath(project) {
    return ctx.resolveProjectDataPath(project, "board", "index.json");
  }

  function boardPath(project, id) {
    return ctx.resolveProjectDataPath(project, "board", `${id}.json`);
  }

  function readIndex(project) {
    const file = indexPath(project);
    if (!fs.existsSync(file)) return { boards: [] };
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      return { boards: [] };
    }
  }

  function writeIndex(project, index) {
    fs.writeFileSync(indexPath(project), JSON.stringify(index, null, 2));
  }

  router.get("/list", (req, res) => {
    try {
      const project = String(req.query?.project ?? "");
      if (!project) return res.status(400).json({ success: false, error: "Missing project" });
      res.json({ success: true, boards: readIndex(project).boards });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/board", (req, res) => {
    try {
      const project = String(req.query?.project ?? "");
      const id = String(req.query?.id ?? "");
      if (!project || !id) return res.status(400).json({ success: false, error: "Missing project or id" });

      const file = boardPath(project, id);
      if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: "Board not found" });

      let board;
      try {
        board = JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch {
        return res.status(404).json({ success: false, error: "Board data is corrupt" });
      }
      res.json({ success: true, board });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/save", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      const board = req.body?.board;
      if (!project || !board?.id || !board?.name) {
        return res.status(400).json({ success: false, error: "Missing project or board" });
      }

      fs.writeFileSync(boardPath(project, board.id), JSON.stringify(board, null, 2));

      const index = readIndex(project);
      const entry = { id: board.id, name: board.name };
      const existingIndex = index.boards.findIndex((b) => b.id === board.id);
      if (existingIndex >= 0) index.boards[existingIndex] = entry;
      else index.boards.push(entry);
      writeIndex(project, index);

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/delete", (req, res) => {
    try {
      const project = String(req.body?.project ?? "");
      const id = String(req.body?.id ?? "");
      if (!project || !id) return res.status(400).json({ success: false, error: "Missing project or id" });

      const file = boardPath(project, id);
      if (fs.existsSync(file)) fs.unlinkSync(file);

      const index = readIndex(project);
      index.boards = index.boards.filter((b) => b.id !== id);
      writeIndex(project, index);

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
```

- [ ] **Step 2: Restart the server dev process**

Backend route mounting happens once at boot (adding a new extension's backend needs a restart — see the comment in `ExtensionHandler.ts`). Stop and restart `cd source/server && npm run dev`.

- [ ] **Step 3: Verify manually with curl**

With the server running on port 5664:

```bash
curl -s "http://localhost:5664/api/extensions/board/list?project=test"
```
Expected: `{"success":true,"boards":[]}`

```bash
curl -s -X POST "http://localhost:5664/api/extensions/board/save" \
  -H "Content-Type: application/json" \
  -d '{"project":"test","board":{"id":"b_test1234","name":"Verify","columns":[]}}'
```
Expected: `{"success":true}`

```bash
curl -s "http://localhost:5664/api/extensions/board/list?project=test"
```
Expected: `{"success":true,"boards":[{"id":"b_test1234","name":"Verify"}]}`

```bash
curl -s "http://localhost:5664/api/extensions/board/board?project=test&id=b_test1234"
```
Expected: `{"success":true,"board":{"id":"b_test1234","name":"Verify","columns":[]}}`

```bash
curl -s -X POST "http://localhost:5664/api/extensions/board/delete" \
  -H "Content-Type: application/json" \
  -d '{"project":"test","id":"b_test1234"}'
```
Expected: `{"success":true}`

```bash
curl -s "http://localhost:5664/api/extensions/board/list?project=test"
```
Expected: `{"success":true,"boards":[]}`

- [ ] **Step 4: Clean up the verification artifact**

```bash
rm -rf source/projects/test/.extensions
```

- [ ] **Step 5: Commit**

```bash
git add source/extensions/board/backend/index.js
git commit -m "feat(board): add backend routes for listing/loading/saving/deleting boards"
```

---

### Task 6: Frontend — board UI (render, CRUD, autosave, custom dialogs)

**Files:**
- Modify: `source/extensions/board/frontend/js/store.mjs` (add fetch wrappers)
- Create: `source/extensions/board/frontend/js/board.mjs`
- Modify: `source/extensions/board/frontend/index.html` (replace scaffold with the real shell)

**Interfaces:**
- Consumes: `createBoard`/`createColumn`/`createCard` (Task 4), `/api/extensions/board/*` routes (Task 5).
- Produces:
  - `store.mjs` additions: `listBoards(project): Promise<{id,name}[]>`, `loadBoard(project, id): Promise<Board>`, `saveBoard(project, board): Promise<void>`, `deleteBoard(project, id): Promise<void>` — each throws on `{success: false}`.
  - `board.mjs`: `initBoardApp(els)` where `els = { project, header, main, overlayRoot, errorBanner, errorText, errorRetry, errorDismiss }` (all DOM elements). Task 7 adds drag-and-drop by extending `renderColumns()` in this file.

- [ ] **Step 1: Add fetch wrappers to `store.mjs`**

Append to `source/extensions/board/frontend/js/store.mjs`:

```js
export async function listBoards(project) {
  const res = await fetch(`/api/extensions/board/list?project=${encodeURIComponent(project)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to list boards");
  return data.boards;
}

export async function loadBoard(project, id) {
  const res = await fetch(
    `/api/extensions/board/board?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to load board");
  return data.board;
}

export async function saveBoard(project, board) {
  const res = await fetch("/api/extensions/board/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, board }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to save board");
}

export async function deleteBoard(project, id) {
  const res = await fetch("/api/extensions/board/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, id }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to delete board");
}
```

- [ ] **Step 2: Create `board.mjs`**

`source/extensions/board/frontend/js/board.mjs`:

```js
import { createCard, createColumn, createBoard, listBoards, loadBoard, saveBoard, deleteBoard } from "./store.mjs";

export function initBoardApp(els) {
  const state = {
    project: els.project,
    boards: [],
    board: null,
    saveTimer: null,
  };

  if (!state.project) {
    els.main.innerHTML = '<p style="padding:16px;color:var(--text-faint)">No project — open this from the editor.</p>';
    return;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showError(err, retry) {
    els.errorText.textContent = err instanceof Error ? err.message : String(err);
    els.errorBanner.style.display = "flex";
    els.errorRetry.onclick = () => { els.errorBanner.style.display = "none"; retry(); };
    els.errorDismiss.onclick = () => { els.errorBanner.style.display = "none"; };
  }

  // Native window.confirm()/prompt() silently no-op in this app's
  // sandboxed iframe (no allow-modals) — these render custom in-page
  // overlays instead.
  function showConfirm(message) {
    return new Promise((resolve) => {
      els.overlayRoot.innerHTML = `
        <div class="overlay">
          <div class="panel">
            <p>${escapeHtml(message)}</p>
            <div class="panel-actions">
              <div></div>
              <div>
                <button id="confirmNo">Cancel</button>
                <button id="confirmYes" class="danger">Delete</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const close = (result) => { els.overlayRoot.innerHTML = ""; resolve(result); };
      els.overlayRoot.querySelector("#confirmNo").addEventListener("click", () => close(false));
      els.overlayRoot.querySelector("#confirmYes").addEventListener("click", () => close(true));
    });
  }

  function showPrompt(message, defaultValue) {
    return new Promise((resolve) => {
      els.overlayRoot.innerHTML = `
        <div class="overlay">
          <div class="panel">
            <p>${escapeHtml(message)}</p>
            <input type="text" id="promptInput" value="${escapeHtml(defaultValue ?? "")}" />
            <div class="panel-actions">
              <div></div>
              <div>
                <button id="promptCancel">Cancel</button>
                <button id="promptOk" class="primary">OK</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const input = els.overlayRoot.querySelector("#promptInput");
      input.focus();
      input.select();
      const close = (result) => { els.overlayRoot.innerHTML = ""; resolve(result); };
      els.overlayRoot.querySelector("#promptCancel").addEventListener("click", () => close(null));
      els.overlayRoot.querySelector("#promptOk").addEventListener("click", () => close(input.value));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") close(input.value); });
    });
  }

  function setStatus(text) {
    const el = els.header.querySelector(".status");
    if (el) el.textContent = text;
  }

  function scheduleSave() {
    setStatus("Saving…");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveBoard(state.project, state.board)
        .then(() => setStatus("Saved"))
        .catch((err) => showError(err, scheduleSave));
    }, 500);
  }

  function findColumn(columnId) {
    return state.board.columns.find((c) => c.id === columnId);
  }

  function renderHeader() {
    els.header.innerHTML = `
      <select id="boardSelect">
        ${state.boards
          .map((b) => `<option value="${b.id}" ${b.id === state.board.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
          .join("")}
      </select>
      <button id="renameBoardBtn">Rename</button>
      <button id="newBoardBtn">+ New board</button>
      <button id="deleteBoardBtn" class="danger">Delete board</button>
      <span class="status">Saved</span>
    `;
    els.header.querySelector("#boardSelect").addEventListener("change", (e) => selectBoard(e.target.value));
    els.header.querySelector("#renameBoardBtn").addEventListener("click", renameCurrentBoard);
    els.header.querySelector("#newBoardBtn").addEventListener("click", createNewBoard);
    els.header.querySelector("#deleteBoardBtn").addEventListener("click", deleteCurrentBoard);
  }

  function renderColumns() {
    els.main.innerHTML =
      state.board.columns
        .map(
          (col) => `
        <div class="column" data-column-id="${col.id}">
          <div class="column-header">
            <span class="drag-handle" draggable="true" data-role="column-handle" data-column-id="${col.id}">⠿</span>
            <input type="text" value="${escapeHtml(col.name)}" data-role="column-name" data-column-id="${col.id}" />
            <button data-role="delete-column" data-column-id="${col.id}">✕</button>
          </div>
          <div class="column-body" data-role="column-body" data-column-id="${col.id}">
            ${col.cards
              .map(
                (card) => `
              <div class="card" draggable="true" data-role="card" data-column-id="${col.id}" data-card-id="${card.id}">
                ${escapeHtml(card.title)}
              </div>
            `
              )
              .join("")}
          </div>
          <div class="add-card-row">
            <input type="text" placeholder="+ Add card" data-role="add-card" data-column-id="${col.id}" />
          </div>
        </div>
      `
        )
        .join("") +
      `
        <div class="column add-column">
          <input type="text" placeholder="+ Add column" data-role="add-column" />
        </div>
      `;

    els.main.querySelectorAll('[data-role="card"]').forEach((el) => {
      el.addEventListener("click", () => openCardPanel(el.dataset.columnId, el.dataset.cardId));
    });

    els.main.querySelectorAll('[data-role="column-name"]').forEach((el) => {
      el.addEventListener("change", () => renameColumn(el.dataset.columnId, el.value));
    });

    els.main.querySelectorAll('[data-role="delete-column"]').forEach((el) => {
      el.addEventListener("click", () => deleteColumn(el.dataset.columnId));
    });

    els.main.querySelectorAll('[data-role="add-card"]').forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && el.value.trim()) {
          addCard(el.dataset.columnId, el.value.trim());
          el.value = "";
        }
      });
    });

    const addColumnInput = els.main.querySelector('[data-role="add-column"]');
    addColumnInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && addColumnInput.value.trim()) {
        addColumn(addColumnInput.value.trim());
        addColumnInput.value = "";
      }
    });
  }

  function addCard(columnId, title) {
    findColumn(columnId).cards.push(createCard(title));
    scheduleSave();
    renderColumns();
  }

  function renameColumn(columnId, name) {
    const trimmed = name.trim();
    if (trimmed) findColumn(columnId).name = trimmed;
    scheduleSave();
  }

  async function deleteColumn(columnId) {
    const col = findColumn(columnId);
    if (col.cards.length > 0 && !(await showConfirm(`Delete column "${col.name}" and its ${col.cards.length} card(s)?`))) {
      return;
    }
    state.board.columns = state.board.columns.filter((c) => c.id !== columnId);
    scheduleSave();
    renderColumns();
  }

  function addColumn(name) {
    state.board.columns.push(createColumn(name));
    scheduleSave();
    renderColumns();
  }

  function openCardPanel(columnId, cardId) {
    const card = findColumn(columnId).cards.find((c) => c.id === cardId);
    els.overlayRoot.innerHTML = `
      <div class="overlay">
        <div class="panel">
          <input type="text" id="cardTitle" value="${escapeHtml(card.title)}" />
          <textarea id="cardDescription" placeholder="Description">${escapeHtml(card.description)}</textarea>
          <div class="panel-actions">
            <button id="cardDelete" class="danger">Delete</button>
            <div>
              <button id="cardCancel">Cancel</button>
              <button id="cardSave" class="primary">Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const close = () => { els.overlayRoot.innerHTML = ""; };
    els.overlayRoot.querySelector("#cardCancel").addEventListener("click", close);
    els.overlayRoot.querySelector("#cardSave").addEventListener("click", () => {
      card.title = els.overlayRoot.querySelector("#cardTitle").value.trim() || card.title;
      card.description = els.overlayRoot.querySelector("#cardDescription").value;
      scheduleSave();
      close();
      renderColumns();
    });
    els.overlayRoot.querySelector("#cardDelete").addEventListener("click", () => {
      const column = findColumn(columnId);
      column.cards = column.cards.filter((c) => c.id !== cardId);
      scheduleSave();
      close();
      renderColumns();
    });
  }

  async function selectBoard(id) {
    if (id === state.board.id) return;
    try {
      state.board = await loadBoard(state.project, id);
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, () => selectBoard(id));
    }
  }

  async function createNewBoard() {
    const name = await showPrompt("New board name:", "New board");
    if (!name || !name.trim()) return;
    const board = createBoard(name.trim());
    try {
      await saveBoard(state.project, board);
      state.boards.push({ id: board.id, name: board.name });
      state.board = board;
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, createNewBoard);
    }
  }

  async function renameCurrentBoard() {
    const name = await showPrompt("Rename board:", state.board.name);
    if (!name || !name.trim()) return;
    state.board.name = name.trim();
    const entry = state.boards.find((b) => b.id === state.board.id);
    if (entry) entry.name = state.board.name;
    scheduleSave();
    renderHeader();
  }

  async function deleteCurrentBoard() {
    if (!(await showConfirm(`Delete board "${state.board.name}"? This cannot be undone.`))) return;
    try {
      await deleteBoard(state.project, state.board.id);
      state.boards = state.boards.filter((b) => b.id !== state.board.id);
      if (state.boards.length === 0) {
        const fresh = createBoard("Main");
        await saveBoard(state.project, fresh);
        state.boards = [{ id: fresh.id, name: fresh.name }];
        state.board = fresh;
      } else {
        state.board = await loadBoard(state.project, state.boards[0].id);
      }
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, deleteCurrentBoard);
    }
  }

  async function init() {
    try {
      state.boards = await listBoards(state.project);
      if (state.boards.length === 0) {
        const board = createBoard("Main");
        await saveBoard(state.project, board);
        state.boards = [{ id: board.id, name: board.name }];
        state.board = board;
      } else {
        state.board = await loadBoard(state.project, state.boards[0].id);
      }
      renderHeader();
      renderColumns();
    } catch (err) {
      showError(err, init);
    }
  }

  init();
}
```

- [ ] **Step 3: Replace `index.html` with the real shell**

Replace the entire contents of `source/extensions/board/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Board</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #17181c;
    --bg-elevated: #202127;
    --bg-inset: #1b1c21;
    --border: #33343b;
    --text: #e8e8ec;
    --text-faint: #8a8b93;
    --accent: #4f9eff;
    --danger: #ff5c5c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 12px/1.4 -apple-system, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-elevated);
    flex-wrap: wrap;
  }
  select, input[type="text"], textarea {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    font: inherit;
  }
  button {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font: inherit;
    cursor: pointer;
  }
  button:hover { border-color: var(--text-faint); }
  button.primary { background: var(--accent); color: #06121f; border-color: var(--accent); font-weight: 600; }
  button.danger { color: var(--danger); border-color: var(--danger); }
  .status { color: var(--text-faint); font-size: 11px; margin-left: auto; }
  .error-banner {
    background: #3a1d1d;
    color: #ffb3b3;
    border-bottom: 1px solid var(--danger);
    padding: 6px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  main {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 10px;
    padding: 10px;
    overflow-x: auto;
    align-items: flex-start;
  }
  .column {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 240px;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    max-height: 100%;
  }
  .column-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid var(--border);
  }
  .drag-handle {
    cursor: grab;
    padding: 0 2px;
    color: var(--text-faint);
    user-select: none;
  }
  .column-header input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    font-weight: 600;
    font-size: 12px;
    color: var(--text);
  }
  .column-header input:focus { outline: none; background: var(--bg); border-radius: 3px; }
  .column-body {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 20px;
  }
  .card {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    cursor: pointer;
  }
  .card:hover { border-color: var(--accent); }
  .card.dragging { opacity: 0.4; }
  .add-card-row { padding: 6px; }
  .add-card-row input { width: 100%; }
  .add-column { width: 180px; min-width: 180px; }
  .add-column input { width: 100%; margin-bottom: 6px; }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }
  .panel {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    width: 360px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel input, .panel textarea { width: 100%; }
  .panel textarea { min-height: 100px; resize: vertical; }
  .panel-actions { display: flex; justify-content: space-between; gap: 8px; }
</style>
</head>
<body>
  <header id="header"></header>
  <div id="errorBanner" class="error-banner" style="display:none">
    <span id="errorText"></span>
    <button id="errorRetry">Retry</button>
    <button id="errorDismiss">Dismiss</button>
  </div>
  <main id="main"></main>
  <div id="overlayRoot"></div>
  <script type="module">
    import { initBoardApp } from "./js/board.mjs";
    const params = new URLSearchParams(location.search);
    const project = params.get("project") || "";
    initBoardApp({
      project,
      header: document.getElementById("header"),
      main: document.getElementById("main"),
      overlayRoot: document.getElementById("overlayRoot"),
      errorBanner: document.getElementById("errorBanner"),
      errorText: document.getElementById("errorText"),
      errorRetry: document.getElementById("errorRetry"),
      errorDismiss: document.getElementById("errorDismiss"),
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Verify manually end-to-end**

With both dev servers running, open the Board extension for the `test` project (restart the server dev process first if it was already running from Task 5, so the new frontend files are picked up — static files are served fresh, but confirm by hard-refreshing the iframe/browser). Confirm:
1. A "Main" board is auto-created with columns "To Do" / "In Progress" / "Done".
2. Typing in a column's "+ Add card" input and pressing Enter adds a card.
3. Clicking a card opens the detail panel; editing title/description and clicking Save persists the change (reload the extension and confirm it's still there).
4. Clicking "Delete" in the card panel removes the card.
5. Renaming a column (edit its title input, click elsewhere) persists after reload.
6. Deleting an empty column works with no prompt; deleting a column with cards shows the custom confirm overlay, and Cancel vs. Delete both behave correctly.
7. "+ New board" shows the custom prompt overlay, creates a second board, and the board switcher `<select>` lists both.
8. "Rename" and "Delete board" work the same way (custom overlays, not native dialogs).
9. The header's status text flips "Saving…" → "Saved" after each edit.
10. Stop the server mid-edit (or block the network tab) and confirm the red error banner appears with a working Retry button.

- [ ] **Step 5: Clean up verification data and commit**

```bash
rm -rf source/projects/test/.extensions
git add source/extensions/board/frontend/js/store.mjs source/extensions/board/frontend/js/board.mjs source/extensions/board/frontend/index.html
git commit -m "feat(board): add board UI — columns, cards, board switcher, autosave"
```

---

### Task 7: Drag-and-drop reordering

**Files:**
- Modify: `source/extensions/board/frontend/js/board.mjs`

**Interfaces:**
- Consumes: `moveItem` (Task 3), `renderColumns()` (Task 6, defined in this same file).
- Produces: cards can be dragged within and across columns; columns can be reordered by dragging their handle. No new exports.

- [ ] **Step 1: Import `moveItem`**

At the top of `source/extensions/board/frontend/js/board.mjs`, change:

```js
import { createCard, createColumn, createBoard, listBoards, loadBoard, saveBoard, deleteBoard } from "./store.mjs";
```

to:

```js
import { createCard, createColumn, createBoard, listBoards, loadBoard, saveBoard, deleteBoard } from "./store.mjs";
import { moveItem } from "./reorder.mjs";
```

- [ ] **Step 2: Add drag-state variables and a card-move function**

**All of this code goes inside `initBoardApp(els) { ... }`** — these functions close over `els`, `state`, `scheduleSave`, and `renderColumns`, so they must NOT be declared at module (top) scope. Add the two `let` variables immediately after the existing `const state = { ... };` declaration at the top of `initBoardApp`:

```js
  let dragCard = null;
  let dragColumnId = null;
```

Then, still inside `initBoardApp`, add this function directly after `findColumn`:

```js
  function moveCard(fromColumnId, cardId, toColumnId, toIndex) {
    const fromColumn = findColumn(fromColumnId);
    const cardIndex = fromColumn.cards.findIndex((c) => c.id === cardId);
    if (cardIndex < 0) return;

    if (fromColumnId === toColumnId) {
      const adjustedIndex = toIndex > cardIndex ? toIndex - 1 : toIndex;
      fromColumn.cards = moveItem(fromColumn.cards, cardIndex, adjustedIndex);
    } else {
      const [card] = fromColumn.cards.splice(cardIndex, 1);
      findColumn(toColumnId).cards.splice(toIndex, 0, card);
    }
    scheduleSave();
    renderColumns();
  }
```

- [ ] **Step 3: Add the drag-handler attach functions**

Still **inside `initBoardApp`**, directly after `moveCard`, add:

```js
  function attachCardDragHandlers() {
    els.main.querySelectorAll('[data-role="card"]').forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        dragCard = { columnId: el.dataset.columnId, cardId: el.dataset.cardId };
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        dragCard = null;
      });
    });

    els.main.querySelectorAll('[data-role="column-body"]').forEach((body) => {
      body.addEventListener("dragover", (e) => {
        if (dragCard) e.preventDefault();
      });
      body.addEventListener("drop", (e) => {
        if (!dragCard) return;
        e.preventDefault();
        const targetColumnId = body.dataset.columnId;
        const cardEls = Array.from(body.querySelectorAll('[data-role="card"]'));
        let insertIndex = cardEls.length;
        for (let i = 0; i < cardEls.length; i++) {
          const rect = cardEls[i].getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            insertIndex = i;
            break;
          }
        }
        moveCard(dragCard.columnId, dragCard.cardId, targetColumnId, insertIndex);
      });
    });
  }

  function attachColumnDragHandlers() {
    els.main.querySelectorAll('[data-role="column-handle"]').forEach((handle) => {
      handle.addEventListener("dragstart", (e) => {
        dragColumnId = handle.dataset.columnId;
        e.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => { dragColumnId = null; });
    });

    els.main.querySelectorAll(".column").forEach((columnEl) => {
      columnEl.addEventListener("dragover", (e) => {
        if (dragColumnId && e.target.closest(".column-header")) e.preventDefault();
      });
      columnEl.addEventListener("drop", (e) => {
        if (!dragColumnId || !e.target.closest(".column-header")) return;
        e.preventDefault();
        const targetColumnId = columnEl.dataset.columnId;
        if (targetColumnId === dragColumnId) return;
        const fromIndex = state.board.columns.findIndex((c) => c.id === dragColumnId);
        const toIndex = state.board.columns.findIndex((c) => c.id === targetColumnId);
        state.board.columns = moveItem(state.board.columns, fromIndex, toIndex);
        dragColumnId = null;
        scheduleSave();
        renderColumns();
      });
    });
  }
```

- [ ] **Step 4: Wire the new handlers into `renderColumns()`**

At the very end of the `renderColumns()` function body (after the existing `addColumnInput.addEventListener(...)` block), add:

```js
    attachCardDragHandlers();
    attachColumnDragHandlers();
```

- [ ] **Step 5: Verify manually**

Reload the Board extension for the `test` project:
1. Drag a card within the same column to a different position — order persists after reload.
2. Drag a card into a different column — it moves columns, original column loses it, target column gains it at the dropped position, persists after reload.
3. Drag a column by its `⠿` handle to reorder columns — order persists after reload.
4. Confirm dragging text inside the column-name input (to select/edit it) does **not** trigger a column drag (only the `⠿` handle does).

- [ ] **Step 6: Clean up verification data and commit**

```bash
rm -rf source/projects/test/.extensions
git add source/extensions/board/frontend/js/board.mjs
git commit -m "feat(board): add drag-and-drop reordering for cards and columns"
```

---

## Post-implementation

Update `docs/ROADMAP.md`: move the "TODO/Trello board extension" line out of the "Next Session: Feature Expansion" section (design pass is done) and mark it complete under "Editor Extensions", the way the pixel-art candidate list was checked off after that design pass shipped.
