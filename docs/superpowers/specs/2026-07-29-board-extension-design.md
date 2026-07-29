# TODO/Trello Board Extension — Design

## Summary

New editor extension, `source/extensions/board/`, following the existing
`source/extensions/pixel-art/` and `source/extensions/sfx-generator/`
pattern exactly: a `manifest.json`, a static `frontend/index.html` (+
`frontend/js/*.mjs` modules) served at `/extensions/board/`, and a
`backend/index.js` exporting `register(router, ctx)` mounted at
`/api/extensions/board/`.

Scope: a **per-project** kanban-style board — multiple named boards per
project, each with user-defined, reorderable columns, holding cards with a
title and optional description. Cards and columns are reordered via native
HTML5 drag-and-drop. Not tied to this repo's own `docs/ROADMAP.md` — that
stays a plain markdown file; this extension is a planning tool for the
*game projects* built with the editor, same as pixel-art/sfx-generator
operate on a project's assets rather than on the engine's own docs.

Requires an open project, same as every other toolbar extension (the
Extensions picker already disables entries when no project is open).

## Data model

One JSON file per board, plus a lightweight index file, stored outside the
project's visible `assets/` folder (board data isn't a game asset — it
shouldn't show up in the Explorer's Assets tab):

```
source/projects/<project>/.extensions/board/
  index.json           # { "boards": [{ "id": "b_7f3a", "name": "Features" }, ...] }
  b_7f3a.json          # one board's full contents
```

Board file shape:

```json
{
  "id": "b_7f3a",
  "name": "Features",
  "createdAt": "2026-07-29T12:00:00.000Z",
  "columns": [
    {
      "id": "c_1a2b",
      "name": "To Do",
      "cards": [
        { "id": "k_9c1d", "title": "Add screen shake", "description": "" }
      ]
    },
    { "id": "c_3d4e", "name": "In Progress", "cards": [] },
    { "id": "c_5f6a", "name": "Done", "cards": [] }
  ]
}
```

- IDs: short random strings generated client-side (`crypto.randomUUID().slice(0, 8)`,
  prefixed by type: `b_`/`c_`/`k_`), not validated for global uniqueness
  beyond within-project collision odds being negligible.
- Cards nest directly inside their column's `cards` array — no separate
  lookup table, since a card belongs to exactly one column and v1 has no
  cross-board card references.
- Creating a project's first board auto-seeds the 3 starter columns shown
  above. They are not special-cased afterward — ordinary editable/deletable
  columns like any other.

## Backend

**New `ExtensionContext` method**, added in
`source/server/manager/ExtensionHandler.ts` alongside the existing
`resolveProjectAssetPath`:

```ts
resolveProjectDataPath(project: string, extensionName: string, filename: string): string
```

Same validation rules as `resolveProjectAssetPath` (project/extensionName/filename
each must match `/^[a-zA-Z0-9_.-]+$/`, resolved path must stay inside the
target directory), but resolves into
`source/projects/<project>/.extensions/<extensionName>/` instead of
`assets/`, creating the directory if missing. Generic by construction —
any future extension needing non-asset persisted project data can reuse
it; Board is just the first consumer.

**Routes**, in `source/extensions/board/backend/index.js` (mirrors
sfx-generator's `/save` route style — validate inputs, use `ctx`, return
`{ success, ... }` or `{ success: false, error }`):

- `GET /list?project=X` → reads `.extensions/board/index.json`; returns
  `{ success: true, boards: [] }` if the file doesn't exist yet (new
  project, no boards created).
- `GET /board?project=X&id=Y` → reads and returns `{ success: true, board }`;
  `404`-style `{ success: false, error }` if the id isn't in the index or
  the file is missing/corrupt (malformed JSON is treated as not-found
  rather than crashing the route).
- `POST /save` → body `{ project, board }`; writes `<id>.json` and
  upserts `{ id, name }` into `index.json` (so a rename updates the index
  too, matched by id).
- `POST /delete` → body `{ project, id }`; deletes `<id>.json` (ignore
  ENOENT — already gone is success) and removes the entry from
  `index.json`.

## Frontend

`frontend/js/reorder.mjs` — pure array-reorder helper,
`moveItem(array, fromIndex, toIndex)`, used identically for reordering
cards within/across columns and for reordering columns themselves. Unit
tested (`test/reorder.test.mjs`).

`frontend/js/store.mjs` — pure functions: `createBoard(name)`,
`createColumn(name)`, `createCard(title)` (id generation + shape
construction, no DOM/fetch), plus the fetch wrappers for the four backend
routes. Pure-function parts unit tested (`test/store.test.mjs`); fetch
wrappers are thin pass-throughs, not unit tested (consistent with
pixel-art/sfx-generator, which don't test their save/load fetch calls
either).

`frontend/js/board.mjs` — DOM rendering + HTML5 drag-and-drop wiring.
Untested by unit tests, same as pixel-art's canvas rendering/paint-loop
code — verified manually by running the extension.

`frontend/index.html` — shell + dark-theme styles matching
sfx-generator's CSS var palette (`--bg`, `--bg-elevated`, `--border`,
`--text`, `--accent`, etc.), `<script type="module">` importing the
`.mjs` files.

**Layout:**
- Header: board switcher (dropdown of this project's boards) + "New
  board" + rename/delete for the current board + a small "Saved" /
  "Saving…" autosave indicator.
- Body: horizontal row of columns. Each column: header (name, click to
  rename inline; drag handle to reorder columns; delete button), vertical
  card list, "+ Add card" input pinned at the column's bottom.
- Card: collapsed = title only, in a small rounded box. Click opens an
  inline detail panel (not a nested modal/iframe) with a title input and
  a description textarea; closing the panel commits changes to in-memory
  state.

**First run:** if a project has zero boards, auto-create one named "Main"
with the 3 starter columns so the extension never opens to a truly empty
screen.

**Drag and drop:** native HTML5 DnD (`draggable="true"`, `dragstart` /
`dragover` / `drop`). Cards: `dragover` on a column's card-list container
computes insertion index from the Y position of the pointer relative to
sibling cards, `moveItem` reorders (within the same column or across
columns — a card moved to another column is spliced out of its old
column's array and into the new one at the computed index). Columns:
dragging a column's header reorders the columns array the same way via
`moveItem`.

**Persistence:** every mutation (add/edit/delete card, add/rename/delete
column, reorder, rename board) updates in-memory state, re-renders
immediately, and schedules a debounced (~500ms) `POST /save` of the whole
board. No `EXTENSION_ASSET_SAVED` postMessage — that signal specifically
tells the Explorer to reload its Assets tab, which is irrelevant here.

## Error handling

- No project open: the Extensions picker already disables the Board tile
  entirely (existing behavior for every toolbar extension) — nothing
  extra needed inside the extension itself.
- Load/save network failures: a dismissible inline error banner at the
  top of the board; in-memory state is kept as-is (no data loss), and the
  next edit's debounced save retries automatically.
- Deleting a column that has cards: `confirm()` before deleting; empty
  columns delete without a prompt.
- Deleting a board: always `confirm()` first (destructive, no undo).
- Backend treats a missing/corrupt board file as a normal "not found"
  error response rather than throwing, matching the try/catch +
  `{ success: false, error }` shape already used by every extension
  route.

## Testing

- `reorder.test.mjs` — `moveItem` across same-array and cross-array moves,
  boundary indices (move to start/end, no-op move).
- `store.test.mjs` — `createBoard`/`createColumn`/`createCard` produce the
  expected shape and unique-enough ids.
- No backend route tests — neither pixel-art nor sfx-generator have them
  either; verified manually by running the extension end to end (create
  board, add/rename/delete columns and cards, drag to reorder, reload and
  confirm persistence).
- No DOM/rendering tests for `board.mjs`, consistent with pixel-art's
  canvas code — manual verification only.
