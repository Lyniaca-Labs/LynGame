# Editor & build pipeline (overview)

This file is a map of the tooling **around** the engine — the editor UI,
the build/compile pipeline, and the extensions system. It's deliberately
high-level: none of this is API a game script calls at runtime (that's
everything else in this folder). Read this only if you're modifying the
editor/compiler itself, not while building a game against the engine.

## The three pieces

- **`source/engine/`** — the runtime engine (this documentation folder's
  main subject). Plain JS, no build step of its own, runs identically
  inside the editor's preview iframe and in a shipped standalone build.
- **`source/client/`** — the editor UI. React + Vite + TypeScript
  (`source/client/src`). Talks to the server over HTTP for project
  CRUD, and to a running game preview (rendered in an iframe) over
  `postMessage`.
- **`source/server/`** — Node/Express (`source/server/index.ts`). Serves
  the built client, serves `/engine` and `/output` statically, exposes
  project/scene/script/prefab/asset file CRUD endpoints, and hosts the
  compiler.

## Build pipeline (`source/server/compiler/`)

`buildProject(projectName)` (`build.ts`) does, in order:
1. Wipes and recreates `source/output/<name>/`.
2. Copies `source/engine/` → `output/<name>/engine/` (minus `test/`,
   `package.json`).
3. Copies the project folder → `output/<name>/game/` (minus `.extensions/`).
4. Compiles graph-authored scripts (`graphScripts.ts`) and texture graphs
   (`textureCompiler.ts`) into plain `.js` alongside the copied project
   files.
5. Generates `game/main.js` (`ProjectHandler.buildMain`) — the file that
   imports every component/script actually referenced anywhere in the
   project, registers every prefab/scene/script/animation, loads the asset
   manifest, and calls `engine.loadScene(startScene)` +
   `engine.start()`. This is also where build-time validation happens
   (missing scripts/animation clips/spritesheet frames throw here, failing
   the build with a clear message instead of a silent runtime no-op).
6. Resolves `@types/`/`@components/` aliases in project-local component
   files (`aliasResolver.ts`) to real relative import paths.
7. Writes `output/<name>/index.html` from a template.

Result: `source/output/<name>/` is a fully standalone, static, servable
game — `index.html` + `engine/` + `game/` — no server/build step needed to
run it (see `templates/index.html`: it just does
`new GameEngine(container)` then `import("./game/main.js")` then `init(engine)`).

## Editor ↔ game preview communication

The running game (in the editor's preview iframe) and the parent editor
talk over `window.postMessage`:
- Editor → game: `PAUSE`/`UNPAUSE`, `GET_ENTITY_PREVIEW` (renders one
  entity in isolation, returns a PNG data URL — see
  [ENGINE_API.md](ENGINE_API.md#entities)), `EDITOR_ENABLE_PICKING`
  (click-anywhere-to-select).
- Game → editor: `ENTITY_PICKED` (a click hit-test result while picking is
  enabled), `EDITOR_KEYDOWN` (forwards Ctrl/Cmd+key combos so editor
  shortcuts work while focus is inside the game iframe), and every
  `console.log`/`warn`/`error` inside the game (intercepted and forwarded
  so the editor can show an in-app console — see the inline script in
  `templates/index.html`).

None of this exists in a shipped standalone build's context (no parent
editor window listening) — it's inert overhead, not something a shipped
game needs to account for.

## Extensions (`source/extensions/`)

Standalone editor-side tools, each its own subfolder (`board`,
`pixel-art`, `sfx-generator`, `spritesheet`, `track-maker`), loaded by
`source/server/manager/ExtensionHandler.ts` and launched from the editor's
toolbar (`ExtensionsModal.tsx`). These produce **assets** (pixel art,
spritesheets, sound effects) or editor-only artifacts (a Trello-style
board) — they are not part of the runtime engine and a game script never
calls into them. If a feature could be built as "an editor tool that
outputs a file the engine already knows how to load" instead of "new
engine/component code," it belongs here instead.

## Running it locally

- `LynGame.bat` (repo root) — starts the server (`npm start` in
  `source/server`, which needs a prior `npm run build`) and opens the
  editor in a browser.
- Dev loop: `source/client` → `npm run dev` (Vite dev server); `source/server`
  → `npm run dev` (`tsx watch`, ignores `projects/`, `output/`,
  `.tmp-components/` so project file changes don't restart the server).
  Note: the server serves the **built** `client/dist` in all modes
  (`express.static("client/dist")`) — for live client changes to show up
  you need `npm run build` in `source/client`, or run Vite's own dev
  server separately and treat CORS/proxying yourself (not wired up by
  default).

## See also

- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — the file formats this pipeline compiles
- [LIMITATIONS.md](LIMITATIONS.md) — Windows/OneDrive build-lock note
