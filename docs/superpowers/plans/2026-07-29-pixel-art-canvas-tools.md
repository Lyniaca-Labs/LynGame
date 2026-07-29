# Pixel Art Canvas & Tool Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add zoom/pan, brush size, opacity, a dynamic (recent-colors) palette, and undo/redo to the existing `pixel-art` toolbar extension.

**Architecture:** The existing extension (`source/extensions/pixel-art/`) is a single inline-script `index.html`. This plan extracts the new pure logic (grid indexing, brush shape, viewport/zoom-pan math, undo stack, palette management) into small `.mjs` modules under `frontend/js/`, mirroring the pattern established in `source/extensions/track-maker/` — loaded natively via `<script type="module">`, unit-tested with Node's built-in test runner, no build step, no new dependencies. `index.html` keeps DOM wiring, canvas rendering, and the existing save/open/fetch flow, but imports the modules instead of doing this arithmetic inline. Zoom/pan is implemented as a CSS transform (`translate(...) scale(...)`) on the `<canvas>` element inside a fixed-size viewport container — `render()` keeps drawing at the same fixed on-screen cell size it always has; only the transform changes, so no rendering-resolution logic is touched.

**Tech Stack:** Vanilla JS (ES modules), Node's built-in `node:test` + `node:assert/strict` for unit tests (no new dependencies), `localStorage` for palette persistence (no backend changes).

## Global Constraints

- No new dependencies, no build step, no bundler — same "just static files" constraint as every extension (spec: Architecture).
- Zoom clamped to a sane range (spec: "Clamp zoom range so a single cell never becomes sub-pixel or absurdly huge").
- Brush is square-only, no circle/diamond shapes (spec: Brush size).
- Opacity painting **overwrites** the target cell — no alpha-compositing/blending against the previous pixel (spec: Opacity).
- Palette starts from a small default set (black, white, transparent) and grows via a "recent colors" row, capped at `MAX_RECENT_COLORS` (spec: Dynamic palette).
- Opening an existing asset **replaces** the recent-colors row with that asset's actual used colors (spec: "Auto-detect on open").
- Palette persists per-project via `localStorage`, no backend route (spec: Persistence).
- Undo/redo is **stroke-level only** — one snapshot per stroke (pushed at `pointerdown`), capped depth (~50). Resize, Clear, and opening an asset reset/clear the undo history rather than being undoable steps (spec: Undo/redo scope).
- `grid.mjs` covers only cell indexing/bounds/get/set/clone helpers — the existing PNG import/export logic in `openAsset()` / the save handler stays inline and untouched; none of this pass's features require changing it (scope note: the design doc's Architecture section mentions "serialize" for `grid.mjs`, but nothing in this plan's features needs it, and touching working save/open code for no functional benefit would be out of scope).

---

## File Structure

```
source/extensions/pixel-art/
  manifest.json          (unchanged)
  backend/index.js       (unchanged)
  frontend/
    index.html            (modified: imports the modules below, adds zoom/pan/brush/opacity/palette/undo UI + wiring)
    js/
      grid.mjs            # cell-array indexing/bounds/get/set/clone helpers
      paint.mjs           # square brush -> list of cells to paint, clipped to bounds
      viewport.mjs        # zoom/pan math: screen<->grid conversion, zoom-at-cursor, pan
      undo.mjs            # snapshot-based undo/redo stack
      palette.mjs         # dynamic palette: defaults, recent-colors, unique-color extraction, persistence
  test/
    grid.test.mjs
    paint.test.mjs
    viewport.test.mjs
    undo.test.mjs
    palette.test.mjs
```

All `frontend/js/*.mjs` files are pure logic (no DOM access), runnable directly under Node for testing and loaded natively in the browser via `<script type="module">` from `index.html`. `test/*.mjs` files use `node --test` and are dev-only — never referenced by `index.html`.

---

### Task 1: `grid.mjs` — cell-array helpers

**Files:**
- Create: `source/extensions/pixel-art/frontend/js/grid.mjs`
- Test: `source/extensions/pixel-art/test/grid.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createGrid(w: number, h: number): (string|null)[]` — length `w*h`, every entry `null`.
  - `indexOf(w: number, x: number, y: number): number` — row-major index (`y * w + x`).
  - `inBounds(w: number, h: number, x: number, y: number): boolean`.
  - `getCell(cells, w, x, y): string|null`.
  - `setCell(cells, w, x, y, color): (string|null)[]` — mutates `cells` in place, returns it.
  - `cloneGrid(cells): (string|null)[]` — shallow copy.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/pixel-art/test/grid.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createGrid, indexOf, inBounds, getCell, setCell, cloneGrid } from "../frontend/js/grid.mjs";

test("createGrid returns a w*h array filled with null", () => {
  const g = createGrid(3, 2);
  assert.equal(g.length, 6);
  assert.ok(g.every((c) => c === null));
});

test("indexOf computes row-major index", () => {
  assert.equal(indexOf(4, 0, 0), 0);
  assert.equal(indexOf(4, 1, 2), 9);
  assert.equal(indexOf(4, 3, 0), 3);
});

test("inBounds is true on all edges and false outside", () => {
  assert.ok(inBounds(4, 3, 0, 0));
  assert.ok(inBounds(4, 3, 3, 2));
  assert.ok(!inBounds(4, 3, -1, 0));
  assert.ok(!inBounds(4, 3, 0, -1));
  assert.ok(!inBounds(4, 3, 4, 0));
  assert.ok(!inBounds(4, 3, 0, 3));
});

test("setCell then getCell round-trips and leaves other cells untouched", () => {
  const g = createGrid(3, 3);
  setCell(g, 3, 1, 1, "#ff0000");
  assert.equal(getCell(g, 3, 1, 1), "#ff0000");
  assert.equal(getCell(g, 3, 0, 0), null);
  assert.equal(getCell(g, 3, 2, 2), null);
});

test("cloneGrid returns an equal but independent array", () => {
  const g = createGrid(2, 2);
  setCell(g, 2, 0, 0, "#000000");
  const clone = cloneGrid(g);
  assert.deepEqual(clone, g);
  setCell(clone, 2, 1, 1, "#ffffff");
  assert.equal(getCell(g, 2, 1, 1), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/pixel-art/test/grid.test.mjs`
Expected: FAIL — `grid.mjs` does not exist yet (module not found).

- [ ] **Step 3: Write `grid.mjs`**

```js
// source/extensions/pixel-art/frontend/js/grid.mjs

// Cell-array helpers shared by paint.mjs and undo.mjs. The pixel-art grid is
// a flat, row-major array of CSS color strings (or null for transparent) —
// this module is the single place that knows how (x, y) maps to an index,
// so painting/undo/bounds-clipping can't drift out of sync with each other.

export function createGrid(w, h) {
  return new Array(w * h).fill(null);
}

export function indexOf(w, x, y) {
  return y * w + x;
}

export function inBounds(w, h, x, y) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function getCell(cells, w, x, y) {
  return cells[indexOf(w, x, y)];
}

export function setCell(cells, w, x, y, color) {
  cells[indexOf(w, x, y)] = color;
  return cells;
}

export function cloneGrid(cells) {
  return cells.slice();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/pixel-art/test/grid.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/pixel-art/frontend/js/grid.mjs source/extensions/pixel-art/test/grid.test.mjs
git commit -m "feat(pixel-art): add grid cell-array helper module"
```

---

### Task 2: `paint.mjs` — square brush

**Files:**
- Create: `source/extensions/pixel-art/frontend/js/paint.mjs`
- Test: `source/extensions/pixel-art/test/paint.test.mjs`

**Interfaces:**
- Consumes: `inBounds` from `grid.mjs` (Task 1).
- Produces: `brushCells(w: number, h: number, cx: number, cy: number, size: number): {x: number, y: number}[]` — a `size x size` block anchored top-left at `(cx, cy)`, growing right/down, clipped to `[0, w) x [0, h)`.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/pixel-art/test/paint.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { brushCells } from "../frontend/js/paint.mjs";

test("size 1 returns exactly the cursor cell", () => {
  assert.deepEqual(brushCells(10, 10, 5, 5, 1), [{ x: 5, y: 5 }]);
});

test("size 3 fully inside the grid returns the full 3x3 block", () => {
  const cells = brushCells(10, 10, 2, 2, 3);
  const expected = [];
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) expected.push({ x: 2 + dx, y: 2 + dy });
  }
  assert.deepEqual(cells, expected);
});

test("brush clips at the bottom-right edge instead of wrapping or erroring", () => {
  const cells = brushCells(10, 10, 9, 9, 3);
  assert.deepEqual(cells, [{ x: 9, y: 9 }]);
});

test("brush clips partially at a right edge", () => {
  const cells = brushCells(10, 10, 8, 5, 3);
  assert.deepEqual(cells, [
    { x: 8, y: 5 }, { x: 9, y: 5 },
    { x: 8, y: 6 }, { x: 9, y: 6 },
    { x: 8, y: 7 }, { x: 9, y: 7 },
  ]);
});

test("brush larger than the grid returns only in-bounds cells, no duplicates", () => {
  const cells = brushCells(2, 2, 0, 0, 8);
  assert.equal(cells.length, 4);
  const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
  assert.equal(keys.size, 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/pixel-art/test/paint.test.mjs`
Expected: FAIL — `paint.mjs` does not exist yet.

- [ ] **Step 3: Write `paint.mjs`**

```js
// source/extensions/pixel-art/frontend/js/paint.mjs
import { inBounds } from "./grid.mjs";

// Square brush anchored top-left at the cursor cell, growing right/down.
// Anchoring at the cursor (rather than centering) keeps a size-1 brush's
// behavior unchanged as brushSize increases, and avoids centering math that
// doesn't matter at these pixel counts.
export function brushCells(w, h, cx, cy, size) {
  const cells = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (inBounds(w, h, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/pixel-art/test/paint.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/pixel-art/frontend/js/paint.mjs source/extensions/pixel-art/test/paint.test.mjs
git commit -m "feat(pixel-art): add square brush module"
```

---

### Task 3: `viewport.mjs` — zoom/pan math

**Files:**
- Create: `source/extensions/pixel-art/frontend/js/viewport.mjs`
- Test: `source/extensions/pixel-art/test/viewport.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MIN_ZOOM: number` (`0.25`), `MAX_ZOOM: number` (`8`).
  - `clampZoom(zoom: number): number`.
  - A "view" is `{ zoom: number, panX: number, panY: number }`, where `panX/panY` are the offset (in container-relative screen pixels) of the canvas's top-left corner.
  - `screenToGrid(view, cellSize: number, screenX: number, screenY: number): {x: number, y: number}` — fractional grid coordinates (caller floors to get a cell).
  - `gridToScreen(view, cellSize, gridX, gridY): {x: number, y: number}`.
  - `zoomAt(view, cellSize, screenX, screenY, newZoom): view` — returns a new view with `zoom` clamped and `panX/panY` adjusted so the grid point under `(screenX, screenY)` stays fixed on screen.
  - `panBy(view, dx, dy): view` — returns a new view with `panX/panY` shifted by `(dx, dy)`, zoom unchanged.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/pixel-art/test/viewport.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { MIN_ZOOM, MAX_ZOOM, clampZoom, screenToGrid, gridToScreen, zoomAt, panBy } from "../frontend/js/viewport.mjs";

const CELL = 20;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("clampZoom clamps to [MIN_ZOOM, MAX_ZOOM] and passes through in-range values", () => {
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(2), 2);
});

test("screenToGrid and gridToScreen are inverses", () => {
  const view = { zoom: 2, panX: 30, panY: -15 };
  const g = screenToGrid(view, CELL, 130, 45);
  const s = gridToScreen(view, CELL, g.x, g.y);
  assert.ok(close(s.x, 130) && close(s.y, 45));
});

test("zoomAt keeps the grid point under the cursor fixed on screen", () => {
  const view = { zoom: 1, panX: 0, panY: 0 };
  const screenX = 123;
  const screenY = 77;
  const before = screenToGrid(view, CELL, screenX, screenY);
  const next = zoomAt(view, CELL, screenX, screenY, 3);
  const after = screenToGrid(next, CELL, screenX, screenY);
  assert.ok(close(before.x, after.x) && close(before.y, after.y));
  assert.equal(next.zoom, 3);
});

test("zoomAt clamps the requested zoom", () => {
  const view = { zoom: 1, panX: 0, panY: 0 };
  const next = zoomAt(view, CELL, 0, 0, 999);
  assert.equal(next.zoom, MAX_ZOOM);
});

test("panBy shifts pan without changing zoom", () => {
  const view = { zoom: 2, panX: 10, panY: 10 };
  const next = panBy(view, 5, -3);
  assert.deepEqual(next, { zoom: 2, panX: 15, panY: 7 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/pixel-art/test/viewport.test.mjs`
Expected: FAIL — `viewport.mjs` does not exist yet.

- [ ] **Step 3: Write `viewport.mjs`**

```js
// source/extensions/pixel-art/frontend/js/viewport.mjs

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToGrid(view, cellSize, screenX, screenY) {
  return {
    x: (screenX - view.panX) / (cellSize * view.zoom),
    y: (screenY - view.panY) / (cellSize * view.zoom),
  };
}

export function gridToScreen(view, cellSize, gridX, gridY) {
  return {
    x: gridX * cellSize * view.zoom + view.panX,
    y: gridY * cellSize * view.zoom + view.panY,
  };
}

// Changes zoom while keeping the grid point under (screenX, screenY) fixed
// on screen — "zoom centered on cursor" instead of zooming from the
// viewport's corner.
export function zoomAt(view, cellSize, screenX, screenY, newZoom) {
  const zoom = clampZoom(newZoom);
  const before = screenToGrid(view, cellSize, screenX, screenY);
  return {
    zoom,
    panX: screenX - before.x * cellSize * zoom,
    panY: screenY - before.y * cellSize * zoom,
  };
}

export function panBy(view, dx, dy) {
  return { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/pixel-art/test/viewport.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/pixel-art/frontend/js/viewport.mjs source/extensions/pixel-art/test/viewport.test.mjs
git commit -m "feat(pixel-art): add viewport zoom/pan math module"
```

---

### Task 4: `undo.mjs` — snapshot-based undo/redo stack

**Files:**
- Create: `source/extensions/pixel-art/frontend/js/undo.mjs`
- Test: `source/extensions/pixel-art/test/undo.test.mjs`

**Interfaces:**
- Consumes: `cloneGrid` from `grid.mjs` (Task 1).
- Produces:
  - `createUndoStack(maxDepth = 50): {undoStack: [], redoStack: [], maxDepth}`.
  - `pushSnapshot(stack, cells)` — pushes a clone of `cells` onto `undoStack` (evicting the oldest if over `maxDepth`), clears `redoStack`.
  - `undo(stack, currentCells): (string|null)[] | null` — pops the most recent undo snapshot, pushes a clone of `currentCells` onto `redoStack`, returns the popped snapshot (or `null` if `undoStack` is empty).
  - `redo(stack, currentCells): (string|null)[] | null` — symmetric with `undo`.
  - `resetUndoStack(stack)` — empties both stacks.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/pixel-art/test/undo.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createUndoStack, pushSnapshot, undo, redo, resetUndoStack } from "../frontend/js/undo.mjs";

test("undo on an empty stack returns null", () => {
  const stack = createUndoStack();
  assert.equal(undo(stack, ["a"]), null);
});

test("pushSnapshot then undo returns an independent copy of the pushed state", () => {
  const stack = createUndoStack();
  const cells = ["a", "b"];
  pushSnapshot(stack, cells);
  cells[0] = "mutated";
  const restored = undo(stack, cells);
  assert.deepEqual(restored, ["a", "b"]);
  assert.notEqual(restored, cells);
});

test("redo restores the state that was current at undo time", () => {
  const stack = createUndoStack();
  pushSnapshot(stack, ["v1"]);
  const restored = undo(stack, ["v2"]);
  assert.deepEqual(restored, ["v1"]);
  const redone = redo(stack, restored);
  assert.deepEqual(redone, ["v2"]);
});

test("redo on an empty redo stack returns null", () => {
  const stack = createUndoStack();
  assert.equal(redo(stack, ["a"]), null);
});

test("pushSnapshot after an undo clears the redo stack", () => {
  const stack = createUndoStack();
  pushSnapshot(stack, ["v1"]);
  undo(stack, ["v2"]);
  pushSnapshot(stack, ["v3"]);
  assert.equal(redo(stack, ["v3"]), null);
});

test("undo stack evicts the oldest snapshot once maxDepth is exceeded", () => {
  const stack = createUndoStack(2);
  pushSnapshot(stack, ["v1"]);
  pushSnapshot(stack, ["v2"]);
  pushSnapshot(stack, ["v3"]);
  assert.deepEqual(undo(stack, ["v4"]), ["v3"]);
  assert.deepEqual(undo(stack, ["v3"]), ["v2"]);
  assert.equal(undo(stack, ["v2"]), null);
});

test("resetUndoStack empties both stacks", () => {
  const stack = createUndoStack();
  pushSnapshot(stack, ["v1"]);
  undo(stack, ["v2"]);
  resetUndoStack(stack);
  assert.equal(undo(stack, ["v3"]), null);
  assert.equal(redo(stack, ["v3"]), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/pixel-art/test/undo.test.mjs`
Expected: FAIL — `undo.mjs` does not exist yet.

- [ ] **Step 3: Write `undo.mjs`**

```js
// source/extensions/pixel-art/frontend/js/undo.mjs
import { cloneGrid } from "./grid.mjs";

export function createUndoStack(maxDepth = 50) {
  return { undoStack: [], redoStack: [], maxDepth };
}

export function pushSnapshot(stack, cells) {
  stack.undoStack.push(cloneGrid(cells));
  if (stack.undoStack.length > stack.maxDepth) stack.undoStack.shift();
  stack.redoStack.length = 0;
}

export function undo(stack, currentCells) {
  if (stack.undoStack.length === 0) return null;
  const prev = stack.undoStack.pop();
  stack.redoStack.push(cloneGrid(currentCells));
  return prev;
}

export function redo(stack, currentCells) {
  if (stack.redoStack.length === 0) return null;
  const next = stack.redoStack.pop();
  stack.undoStack.push(cloneGrid(currentCells));
  return next;
}

export function resetUndoStack(stack) {
  stack.undoStack.length = 0;
  stack.redoStack.length = 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/pixel-art/test/undo.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/pixel-art/frontend/js/undo.mjs source/extensions/pixel-art/test/undo.test.mjs
git commit -m "feat(pixel-art): add undo/redo snapshot stack module"
```

---

### Task 5: `palette.mjs` — dynamic palette

**Files:**
- Create: `source/extensions/pixel-art/frontend/js/palette.mjs`
- Test: `source/extensions/pixel-art/test/palette.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_RECENT_COLORS: number` (`24`).
  - `DEFAULT_COLORS: (string|null)[]` (`["#000000", "#ffffff", null]`, `null` = transparent).
  - `createPalette(colors = DEFAULT_COLORS): {recent: (string|null)[]}`.
  - `addColor(palette, color): {recent}` — returns a new palette with `color` moved to the front of `recent` (deduped, not appended twice), capped at `MAX_RECENT_COLORS`.
  - `uniqueColors(cells: (string|null)[]): string[]` — distinct non-null colors, in first-seen (row-major) order.
  - `loadPalette(storage, project: string, fallback = DEFAULT_COLORS): {recent}` — reads `pixelart:palette:<project>` from `storage` (an object with `getItem`/`setItem`, e.g. `localStorage`); returns `createPalette(fallback)` if missing or malformed.
  - `savePalette(storage, project, palette)`.

- [ ] **Step 1: Write the failing test**

```js
// source/extensions/pixel-art/test/palette.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RECENT_COLORS, DEFAULT_COLORS,
  createPalette, addColor, uniqueColors, loadPalette, savePalette,
} from "../frontend/js/palette.mjs";

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

test("createPalette with no args starts from DEFAULT_COLORS", () => {
  assert.deepEqual(createPalette().recent, DEFAULT_COLORS);
});

test("addColor moves an already-present color to the front instead of duplicating", () => {
  let palette = createPalette(["#111111", "#222222", "#333333"]);
  palette = addColor(palette, "#222222");
  assert.deepEqual(palette.recent, ["#222222", "#111111", "#333333"]);
});

test("addColor caps the recent list at MAX_RECENT_COLORS", () => {
  let palette = createPalette([]);
  for (let i = 0; i < MAX_RECENT_COLORS + 5; i++) {
    palette = addColor(palette, `#${String(i).padStart(6, "0")}`);
  }
  assert.equal(palette.recent.length, MAX_RECENT_COLORS);
  assert.equal(palette.recent[0], `#${String(MAX_RECENT_COLORS + 4).padStart(6, "0")}`);
});

test("uniqueColors extracts distinct non-null colors in first-seen order", () => {
  const cells = ["#aaa", null, "#bbb", "#aaa", null, "#ccc"];
  assert.deepEqual(uniqueColors(cells), ["#aaa", "#bbb", "#ccc"]);
});

test("loadPalette returns the fallback when no data is stored", () => {
  const storage = createMockStorage();
  assert.deepEqual(loadPalette(storage, "proj1"), createPalette());
});

test("loadPalette returns the fallback when stored data is malformed", () => {
  const storage = createMockStorage();
  storage.setItem("pixelart:palette:proj1", "{not valid json");
  assert.deepEqual(loadPalette(storage, "proj1"), createPalette());
});

test("savePalette then loadPalette round-trips through storage", () => {
  const storage = createMockStorage();
  const palette = addColor(createPalette([]), "#123456");
  savePalette(storage, "proj1", palette);
  assert.deepEqual(loadPalette(storage, "proj1"), palette);
});

test("loadPalette is keyed per-project", () => {
  const storage = createMockStorage();
  savePalette(storage, "proj1", addColor(createPalette([]), "#111111"));
  savePalette(storage, "proj2", addColor(createPalette([]), "#222222"));
  assert.deepEqual(loadPalette(storage, "proj1").recent, ["#111111"]);
  assert.deepEqual(loadPalette(storage, "proj2").recent, ["#222222"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test source/extensions/pixel-art/test/palette.test.mjs`
Expected: FAIL — `palette.mjs` does not exist yet.

- [ ] **Step 3: Write `palette.mjs`**

```js
// source/extensions/pixel-art/frontend/js/palette.mjs

const STORAGE_KEY_PREFIX = "pixelart:palette:";
export const MAX_RECENT_COLORS = 24;
export const DEFAULT_COLORS = ["#000000", "#ffffff", null];

export function createPalette(colors = DEFAULT_COLORS) {
  return { recent: colors.slice() };
}

// Moves `color` to the front if already present instead of duplicating it,
// so picking a color you already used doesn't clutter the row with repeats.
export function addColor(palette, color) {
  const recent = palette.recent.filter((c) => c !== color);
  recent.unshift(color);
  if (recent.length > MAX_RECENT_COLORS) recent.length = MAX_RECENT_COLORS;
  return { recent };
}

// Distinct non-transparent colors actually used in a grid, in first-seen
// (row-major) order — used to seed the palette from an opened asset.
export function uniqueColors(cells) {
  const seen = new Set();
  const result = [];
  for (const c of cells) {
    if (c === null || seen.has(c)) continue;
    seen.add(c);
    result.push(c);
  }
  return result;
}

export function loadPalette(storage, project, fallback = DEFAULT_COLORS) {
  try {
    const raw = storage.getItem(STORAGE_KEY_PREFIX + project);
    if (!raw) return createPalette(fallback);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.recent)) return createPalette(fallback);
    return { recent: parsed.recent };
  } catch {
    return createPalette(fallback);
  }
}

export function savePalette(storage, project, palette) {
  storage.setItem(STORAGE_KEY_PREFIX + project, JSON.stringify({ recent: palette.recent }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test source/extensions/pixel-art/test/palette.test.mjs`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add source/extensions/pixel-art/frontend/js/palette.mjs source/extensions/pixel-art/test/palette.test.mjs
git commit -m "feat(pixel-art): add dynamic palette module"
```

---

### Task 6: Wire zoom & pan into `index.html`

**Files:**
- Modify: `source/extensions/pixel-art/frontend/index.html`

**Interfaces:**
- Consumes: `MIN_ZOOM`, `MAX_ZOOM`, `screenToGrid`, `zoomAt`, `panBy` from `viewport.mjs` (Task 3).
- Produces: a `view` object (`{zoom, panX, panY}`) in module scope, an `applyTransform()` function that positions/scales the canvas via CSS, and updated `paintAt()` coordinate math. Later tasks (7, 9) read/write `view` and call `applyTransform()`.

- [ ] **Step 1: Update CSS so the canvas can be freely positioned/scaled inside its container**

In the `<style>` block, replace:

```css
  .canvas-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    background:
      linear-gradient(45deg, #23242a 25%, transparent 25%, transparent 75%, #23242a 75%),
      linear-gradient(45deg, #23242a 25%, transparent 25%, transparent 75%, #23242a 75%);
    background-size: 16px 16px;
    background-position: 0 0, 8px 8px;
  }
  canvas {
    image-rendering: pixelated;
    border: 1px solid var(--border);
    cursor: crosshair;
  }
```

with:

```css
  .canvas-area {
    flex: 1;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(45deg, #23242a 25%, transparent 25%, transparent 75%, #23242a 75%),
      linear-gradient(45deg, #23242a 25%, transparent 25%, transparent 75%, #23242a 75%);
    background-size: 16px 16px;
    background-position: 0 0, 8px 8px;
  }
  .canvas-area.panning { cursor: grabbing; }
  canvas {
    image-rendering: pixelated;
    border: 1px solid var(--border);
    cursor: crosshair;
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
```

- [ ] **Step 2: Add the module import and view state**

Near the top of the `<script>` block (change the tag to `<script type="module">`), directly after the existing `const swatchesEl = ...` line, add:

```js
  import { MIN_ZOOM, MAX_ZOOM, screenToGrid, zoomAt, panBy } from "./js/viewport.mjs";

  const canvasArea = document.querySelector(".canvas-area");
  let view = { zoom: 1, panX: 0, panY: 0 };

  function applyTransform() {
    canvas.style.transform = `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
  }

  // Centers the canvas in the viewport at 1x zoom — called whenever the grid
  // is (re)loaded so a fresh/opened sprite starts fully visible and centered,
  // matching the old flex-centered layout's default appearance.
  function centerView() {
    const rect = canvasArea.getBoundingClientRect();
    view = {
      zoom: 1,
      panX: Math.round((rect.width - canvas.width) / 2),
      panY: Math.round((rect.height - canvas.height) / 2),
    };
    applyTransform();
  }
```

Note: change `<script>` to `<script type="module">` at the start of the script block — this is required for the `import` statement to work, and matches how `track-maker`'s `index.html` loads its modules.

- [ ] **Step 3: Center the view whenever the grid loads**

In `loadGrid(w, h, data)`, after the existing `render();` line, add a call to `centerView();`:

```js
  function loadGrid(w, h, data) {
    gridW = w;
    gridH = h;
    cells = data;
    canvas.width = w * CELL_DISPLAY_SIZE;
    canvas.height = h * CELL_DISPLAY_SIZE;
    render();
    centerView();
  }
```

- [ ] **Step 4: Route `paintAt`'s hit-testing through `screenToGrid`**

Replace:

```js
  function paintAt(clientX, clientY, erase) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / CELL_DISPLAY_SIZE);
    const y = Math.floor((clientY - rect.top) / CELL_DISPLAY_SIZE);
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return;
    cells[y * gridW + x] = erase ? null : selectedColor;
    render();
  }
```

with:

```js
  function paintAt(clientX, clientY, erase) {
    const areaRect = canvasArea.getBoundingClientRect();
    const screenX = clientX - areaRect.left;
    const screenY = clientY - areaRect.top;
    const g = screenToGrid(view, CELL_DISPLAY_SIZE, screenX, screenY);
    const x = Math.floor(g.x);
    const y = Math.floor(g.y);
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return;
    cells[y * gridW + x] = erase ? null : selectedColor;
    render();
  }
```

(Task 7 will replace the single-cell body of this function with a brush loop; this step only changes the coordinate math so painting still hits the right cell once zoom/pan are in play.)

- [ ] **Step 5: Wheel-to-zoom**

After the existing pointer event listeners (`canvas.addEventListener("pointerleave", ...)`), add:

```js
  canvasArea.addEventListener("wheel", (e) => {
    e.preventDefault();
    const areaRect = canvasArea.getBoundingClientRect();
    const screenX = e.clientX - areaRect.left;
    const screenY = e.clientY - areaRect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    view = zoomAt(view, CELL_DISPLAY_SIZE, screenX, screenY, view.zoom * factor);
    applyTransform();
  }, { passive: false });
```

- [ ] **Step 6: Space-drag / middle-mouse pan**

Add, after the wheel listener:

```js
  let spaceHeld = false;
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
      spaceHeld = true;
      canvasArea.style.cursor = "grab";
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      canvasArea.style.cursor = "";
    }
  });

  let panning = false;
  let panOrigin = null;
  canvasArea.addEventListener("pointerdown", (e) => {
    if (!(spaceHeld || e.button === 1)) return;
    e.preventDefault();
    panning = true;
    panOrigin = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
    canvasArea.classList.add("panning");
    canvasArea.setPointerCapture(e.pointerId);
  });
  canvasArea.addEventListener("pointermove", (e) => {
    if (!panning) return;
    view = panBy(
      { zoom: view.zoom, panX: panOrigin.panX, panY: panOrigin.panY },
      e.clientX - panOrigin.x,
      e.clientY - panOrigin.y
    );
    applyTransform();
  });
  canvasArea.addEventListener("pointerup", () => {
    panning = false;
    canvasArea.classList.remove("panning");
  });
```

And guard the existing paint handler so a space-drag or middle-click doesn't also start a paint stroke — change the start of the existing `canvas.addEventListener("pointerdown", ...)` handler:

```js
  canvas.addEventListener("pointerdown", (e) => {
    painting = true;
```

to:

```js
  canvas.addEventListener("pointerdown", (e) => {
    if (spaceHeld || e.button === 1) return;
    painting = true;
```

- [ ] **Step 7: Manually verify**

Use the `run` skill to start the dev app. Open a project, open the Pixel Art Editor. Confirm: scrolling over the canvas zooms in/out centered on the cursor (the pixel under the cursor stays put); holding Space and dragging (or middle-mouse dragging) pans without painting; regular left-click/drag still paints at the correct cell at various zoom levels; opening an existing asset re-centers it at 1x zoom.

- [ ] **Step 8: Commit**

```bash
git add source/extensions/pixel-art/frontend/index.html
git commit -m "feat(pixel-art): add zoom (scroll) and pan (space/middle-drag) to the canvas"
```

---

### Task 7: Wire brush size & opacity into `index.html`

**Files:**
- Modify: `source/extensions/pixel-art/frontend/index.html`

**Interfaces:**
- Consumes: `setCell` from `grid.mjs` (Task 1), `brushCells` from `paint.mjs` (Task 2).
- Produces: `brushSize` and an alpha-aware `currentColor()` used by painting and (Task 8) by the palette's recent-colors tracking.

- [ ] **Step 1: Add brush size and opacity controls to the header**

Replace:

```html
    <input type="color" id="colorPicker" value="#4f9eff" title="Custom color" />
    <button id="eraserBtn" title="Eraser">Eraser</button>
```

with:

```html
    <input type="color" id="colorPicker" value="#4f9eff" title="Custom color" />
    <label>Opacity
      <input type="range" id="opacity" min="0" max="100" value="100" title="Paint opacity" />
    </label>
    <label>Brush
      <input type="number" id="brushSize" min="1" max="8" value="1" style="width:3em" title="Brush size" />
    </label>
    <button id="eraserBtn" title="Eraser">Eraser</button>
```

- [ ] **Step 2: Add the module import and brush/opacity state**

Change the `viewport.mjs` import line added in Task 6 to also pull in the new modules:

```js
  import { MIN_ZOOM, MAX_ZOOM, screenToGrid, zoomAt, panBy } from "./js/viewport.mjs";
  import { setCell } from "./js/grid.mjs";
  import { brushCells } from "./js/paint.mjs";

  const opacityInput = document.getElementById("opacity");
  const brushSizeInput = document.getElementById("brushSize");
```

- [ ] **Step 3: Compute the alpha-aware paint color**

After the existing `let paintingErase = false;` line, add:

```js
  function currentColor() {
    const alpha = Number(opacityInput.value) / 100;
    const hex = colorPicker.value;
    if (alpha >= 1) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }
```

- [ ] **Step 4: Use the brush and `currentColor()` in `paintAt`**

Replace the body of `paintAt` (as it stands after Task 6) so it paints the full brush block using the live color instead of a single cell with `selectedColor`:

```js
  function paintAt(clientX, clientY, erase) {
    const areaRect = canvasArea.getBoundingClientRect();
    const screenX = clientX - areaRect.left;
    const screenY = clientY - areaRect.top;
    const g = screenToGrid(view, CELL_DISPLAY_SIZE, screenX, screenY);
    const cx = Math.floor(g.x);
    const cy = Math.floor(g.y);
    if (cx < 0 || cy < 0 || cx >= gridW || cy >= gridH) return;
    const size = Number(brushSizeInput.value);
    const color = erase ? null : currentColor();
    for (const cell of brushCells(gridW, gridH, cx, cy, size)) {
      setCell(cells, gridW, cell.x, cell.y, color);
    }
    render();
  }
```

Note: `paintAt` now derives its paint color from `colorPicker.value` + `opacityInput` via `currentColor()`, not from the old `selectedColor` variable. `selectedColor` and the still-present `PALETTE.forEach` swatch click handler become dead code as of this task (the handler still runs, harmlessly, but nothing reads `selectedColor` anymore) — Task 8 replaces that whole block along with the palette itself, so it's cleaned up there rather than twice.

- [ ] **Step 5: Manually verify**

Use the `run` skill. Confirm: raising Brush to 3-4 paints a visibly larger square per stroke, clipped correctly at canvas edges; dragging the Opacity slider down and painting produces visibly semi-transparent strokes over the checkerboard background; Opacity at 100 behaves exactly as before (opaque); the eraser still fully clears cells regardless of the Opacity slider's position.

- [ ] **Step 6: Commit**

```bash
git add source/extensions/pixel-art/frontend/index.html
git commit -m "feat(pixel-art): add brush size and opacity controls"
```

---

### Task 8: Wire the dynamic palette into `index.html`

**Files:**
- Modify: `source/extensions/pixel-art/frontend/index.html`

**Interfaces:**
- Consumes: `createPalette`, `addColor`, `uniqueColors`, `loadPalette`, `savePalette` from `palette.mjs` (Task 5).
- Produces: a live `palette` object replacing the static `PALETTE` array; swatches now render from it and update as you paint or open an asset.

- [ ] **Step 1: Remove the static `PALETTE` array, its render loop, and the now-dead `selectedColor` state**

`selectedColor` was only ever read by `paintAt`'s old single-cell body; Task 7 switched `paintAt` to derive its paint color from `colorPicker.value` + `opacityInput` via `currentColor()` instead, so `selectedColor` is now written but never read. Remove it along with the static palette so there's no leftover dead state.

Delete the declaration (in the variable-declarations block near the top of the script, alongside `let eraserActive = false;`):

```js
  let selectedColor = colorPicker.value;
```

Delete:

```js
  const PALETTE = [
    "#000000", "#ffffff", "#e53935", "#fb8c00", "#fdd835", "#43a047",
    "#1e88e5", "#8e24aa", "#6d4c41", "#757575", "#4f9eff", "transparent",
  ];
```

and delete the existing swatch-building block:

```js
  PALETTE.forEach((color) => {
    const el = document.createElement("div");
    el.className = "swatch";
    el.style.background = color === "transparent"
      ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0 / 8px 8px"
      : color;
    el.title = color;
    el.addEventListener("click", () => {
      selectedColor = color;
      eraserActive = false;
      eraserBtn.classList.remove("active");
      document.querySelectorAll(".swatch.selected").forEach((s) => s.classList.remove("selected"));
      el.classList.add("selected");
    });
    swatchesEl.appendChild(el);
  });
```

Also simplify the `colorPicker` "input" listener, which no longer needs to touch `selectedColor` or manually strip `.selected` classes (rendering the `.selected` class is now `renderPalette()`'s job, driven off `colorPicker.value` — see Step 2). Replace:

```js
  colorPicker.addEventListener("input", () => {
    selectedColor = colorPicker.value;
    eraserActive = false;
    eraserBtn.classList.remove("active");
    document.querySelectorAll(".swatch.selected").forEach((el) => el.classList.remove("selected"));
  });
```

with:

```js
  colorPicker.addEventListener("input", () => {
    eraserActive = false;
    eraserBtn.classList.remove("active");
    renderPalette();
  });
```

(`renderPalette` is defined in Step 2 below, so this listener's body won't work until that step is applied — both are part of this same task.)

- [ ] **Step 2: Add the module import, palette state, and a `renderPalette()` function**

Extend the import line from Task 7:

```js
  import { MIN_ZOOM, MAX_ZOOM, screenToGrid, zoomAt, panBy } from "./js/viewport.mjs";
  import { setCell } from "./js/grid.mjs";
  import { brushCells } from "./js/paint.mjs";
  import { createPalette, addColor, uniqueColors, loadPalette, savePalette } from "./js/palette.mjs";

  let palette = loadPalette(localStorage, project);

  function renderPalette() {
    swatchesEl.innerHTML = "";
    for (const color of palette.recent) {
      const el = document.createElement("div");
      el.className = "swatch";
      el.style.background = color === null
        ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 0 0 / 8px 8px"
        : color;
      el.title = color === null ? "transparent" : color;
      // Selection reflects tool state: the transparent swatch shows selected
      // while the eraser is active; a color swatch shows selected only when
      // it matches the current paint color AND the eraser isn't active.
      const isSelected = color === null ? eraserActive : (!eraserActive && color === colorPicker.value);
      if (isSelected) el.classList.add("selected");
      el.addEventListener("click", () => {
        if (color === null) {
          eraserActive = true;
        } else {
          eraserActive = false;
          colorPicker.value = color;
          opacityInput.value = 100;
        }
        eraserBtn.classList.toggle("active", eraserActive);
        renderPalette();
      });
      swatchesEl.appendChild(el);
    }
  }

  renderPalette();
```

(`project` is already defined earlier in the file from `URLSearchParams`; if `project` is empty — extension opened outside a project — `loadPalette` is still safe since it's just used as a storage key.)

Also update the existing `eraserBtn` click handler so toggling the eraser button directly (not via the swatch) keeps the palette's selection highlight in sync. Replace:

```js
  eraserBtn.addEventListener("click", () => {
    eraserActive = !eraserActive;
    eraserBtn.classList.toggle("active", eraserActive);
  });
```

with:

```js
  eraserBtn.addEventListener("click", () => {
    eraserActive = !eraserActive;
    eraserBtn.classList.toggle("active", eraserActive);
    renderPalette();
  });
```

- [ ] **Step 3: Track colors used while painting**

In `canvas`'s `pointerdown` listener (after Task 6/7's guard clause), record the color used for this stroke before painting starts. Replace:

```js
  canvas.addEventListener("pointerdown", (e) => {
    if (spaceHeld || e.button === 1) return;
    painting = true;
    paintingErase = eraserActive || e.button === 2;
    canvas.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY, paintingErase);
  });
```

with:

```js
  canvas.addEventListener("pointerdown", (e) => {
    if (spaceHeld || e.button === 1) return;
    painting = true;
    paintingErase = eraserActive || e.button === 2;
    if (!paintingErase) {
      palette = addColor(palette, currentColor());
      savePalette(localStorage, project, palette);
      renderPalette();
    }
    canvas.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY, paintingErase);
  });
```

- [ ] **Step 4: Auto-detect palette on open**

In `openAsset()`, after the existing `loadGrid(w, h, data);` call, add:

```js
      palette = createPalette(uniqueColors(data));
      savePalette(localStorage, project, palette);
      renderPalette();
```

- [ ] **Step 5: Manually verify**

Use the `run` skill. Confirm: starting a new sprite shows the default black/white/transparent swatches; painting a few different colors adds them to the row, most-recent-first, without duplicating a color you reuse; refreshing/reopening the extension for the same project still shows your recent colors (persisted); opening an existing multi-color asset replaces the row with that asset's actual colors.

- [ ] **Step 6: Commit**

```bash
git add source/extensions/pixel-art/frontend/index.html
git commit -m "feat(pixel-art): replace fixed palette with a dynamic recent-colors palette"
```

---

### Task 9: Wire undo/redo into `index.html`

**Files:**
- Modify: `source/extensions/pixel-art/frontend/index.html`

**Interfaces:**
- Consumes: `createUndoStack`, `pushSnapshot`, `undo`, `redo`, `resetUndoStack` from `undo.mjs` (Task 4).
- Produces: Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) keyboard shortcuts; undo history resets on resize/open/clear.

- [ ] **Step 1: Add the module import and undo stack state**

Extend the import line from Task 8:

```js
  import { createPalette, addColor, uniqueColors, loadPalette, savePalette } from "./js/palette.mjs";
  import { createUndoStack, pushSnapshot, undo, redo, resetUndoStack } from "./js/undo.mjs";

  const undoStack = createUndoStack();
```

- [ ] **Step 2: Snapshot at the start of every stroke**

In the same `canvas` `pointerdown` listener touched in Task 8, add a snapshot push right before painting begins:

```js
  canvas.addEventListener("pointerdown", (e) => {
    if (spaceHeld || e.button === 1) return;
    painting = true;
    paintingErase = eraserActive || e.button === 2;
    pushSnapshot(undoStack, cells);
    if (!paintingErase) {
      palette = addColor(palette, currentColor());
      savePalette(localStorage, project, palette);
      renderPalette();
    }
    canvas.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY, paintingErase);
  });
```

- [ ] **Step 3: Reset undo history on resize / clear / open**

In `resetGrid`, `loadGrid`, and the `clearBtn` handler, call `resetUndoStack(undoStack)`. Update `loadGrid`:

```js
  function loadGrid(w, h, data) {
    gridW = w;
    gridH = h;
    cells = data;
    canvas.width = w * CELL_DISPLAY_SIZE;
    canvas.height = h * CELL_DISPLAY_SIZE;
    resetUndoStack(undoStack);
    render();
    centerView();
  }
```

(`resetGrid` and `openAsset` both funnel through `loadGrid`, so this one change covers resize, opening an asset, and the initial load. The `clearBtn` handler already calls `loadGrid(...)` too, so it's covered as well — no separate change needed there.)

- [ ] **Step 4: Keyboard shortcuts**

After the palette/undo state declarations, add:

```js
  window.addEventListener("keydown", (e) => {
    if (document.activeElement.tagName === "INPUT") return;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === "z" && !e.shiftKey) {
      e.preventDefault();
      const prev = undo(undoStack, cells);
      if (prev) {
        cells = prev;
        render();
      }
    } else if (e.ctrlKey && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      const next = redo(undoStack, cells);
      if (next) {
        cells = next;
        render();
      }
    }
  });
```

- [ ] **Step 5: Manually verify**

Use the `run` skill. Confirm: painting several strokes then pressing Ctrl+Z undoes one stroke at a time back to blank; Ctrl+Y (and Ctrl+Shift+Z) redoes; typing in the filename text input still allows normal text editing/selection (Ctrl+Z there doesn't get hijacked); resizing the grid or opening a different asset clears the undo history (Ctrl+Z afterward does nothing until a new stroke is painted).

- [ ] **Step 6: Commit**

```bash
git add source/extensions/pixel-art/frontend/index.html
git commit -m "feat(pixel-art): add stroke-level undo/redo"
```

---

### Task 10: Final end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `node --test source/extensions/pixel-art/test/`
Expected: all tests across `grid.test.mjs`, `paint.test.mjs`, `viewport.test.mjs`, `undo.test.mjs`, `palette.test.mjs` pass.

- [ ] **Step 2: Full manual regression pass**

Use the `run` skill to start the dev app. In the Pixel Art Editor, in one session:
1. Draw a small sprite using several colors, varying brush size and opacity.
2. Zoom in/out and pan around while continuing to paint — confirm painting always lands on the correct cell.
3. Undo/redo through several strokes.
4. Save it to the current project's assets and confirm it appears in the Explorer's Assets tab (existing `EXTENSION_ASSET_SAVED` postMessage flow, untouched by this plan).
5. Reload the extension, open the just-saved asset via "Load existing…", and confirm the palette repopulates from its actual colors and the sprite renders identically to what was saved.
6. Resize the grid (preset and custom) and confirm the canvas re-centers and undo history resets as expected.

- [ ] **Step 3: Commit (if step 2 surfaced any fixes)**

If manual verification required any fixes, commit them:

```bash
git add source/extensions/pixel-art/frontend/index.html
git commit -m "fix(pixel-art): address issues found in end-to-end verification"
```

If no fixes were needed, skip this step — nothing to commit.
