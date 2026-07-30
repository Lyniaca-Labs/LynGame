# Layout Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Layout` engine component that automatically positions an entity's direct children, flexbox-style ("flow": wraps along one main axis) or grid-style ("grid": fixed row/column count, tracks auto-sized to content) — then demonstrate it with a scene in the `test` project.

**Architecture:** A new `Component` subclass (`source/engine/components/Layout.js`) that recomputes on every `onTick`, reading each child's size via the existing `entity.getDimensions()` and writing positions directly into each child's own `Transform.x`/`Transform.y`. No new inspector field types, no new registries beyond the one-line addition to `DefaultComponents.js` — the editor's schema/build tooling picks up new components automatically by scanning `source/engine/components/*.js`.

**Tech Stack:** Plain ES modules (no framework). Tests are plain `.mjs` files run directly via `node`, using Node's built-in `assert` (no test framework exists in this repo).

## Global Constraints

- Child `Transform.x`/`Transform.y` are already parent-relative (per `Transform.js`'s own field descriptions) — Layout must position children in its own local space starting at `(paddingX, paddingY)`, and must **not** add the Layout entity's own Transform position on top.
- Children keep their natural size, read via the existing `entity.getDimensions()` utility (already used by `Collision`/`Interactable`) — Layout's `width`/`height` fields describe the *container* bound for flow-mode wrapping, not a per-child cell size.
- Grid-mode tracks auto-size to content (CSS-grid-style: each column's width = widest child in it, each row's height = tallest child in it) — `width`/`height` schema fields are flow-mode-only and grid mode ignores them entirely.
- Padding is paired `paddingX`/`paddingY` (matching the existing `Anchor.offsetX`/`offsetY`, `Collision.offsetX`/`offsetY` convention in this codebase), not CSS 4-side shorthand.
- Recomputes every tick (matches `Anchor`/`Follow`) — no dirty-flag/invalidation tracking.
- Children with no `Transform` component are skipped, not thrown on.
- No new `SchemaField` inspector type is needed — `select`, `number`, and `boolean` (already supported) cover every field.

---

### Task 1: `Layout` component — flow mode

**Files:**
- Create: `source/engine/components/Layout.js`
- Test: `source/engine/test/layout.test.mjs`

**Interfaces:**
- Consumes: `Component` base class (`source/engine/types/Component.js`) — `static schema`, constructor auto-assigns fields from `overrides`/defaults, `onTick(entity, engine, dt)` lifecycle hook. `Entity.getDimensions()` (`source/engine/types/Entity.js:204`) returns `{width, height}`. `Entity.getComponent("Transform")` / `Entity.children` (array, in scene-load/`addChild` order).
- Produces: `export class Layout extends Component` with the full schema below (grid-mode fields `maxCols`/`maxRows`/`mode` are declared now but grid behavior is added in Task 2 — until then `mode: "grid"` silently falls through to the `else` branch and behaves like flow. That's fine; Task 2 lands before anything ships).

- [ ] **Step 1: Write the failing tests**

Create `source/engine/test/layout.test.mjs`:

```js
import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Layout } from "../components/Layout.js";
import { Transform } from "../components/Transform.js";
import { ShapeRenderer } from "../components/ShapeRenderer.js";

function makeChild(id, width, height) {
  const e = new Entity(id);
  e.addComponent(Transform, { x: 0, y: 0 });
  e.addComponent(ShapeRenderer, { shape: "rect", width, height });
  return e;
}

function makeParent(id, layoutOverrides) {
  const e = new Entity(id);
  e.addComponent(Transform, { x: 0, y: 0 });
  e.addComponent(Layout, layoutOverrides);
  return e;
}

function attach(parent, children) {
  for (const child of children) parent.addChild(child);
  return children;
}

// --- flow: wraps onto a new line once contentBound (width - 2*paddingX) is exceeded ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", wrap: true, width: 100, gapX: 10, gapY: 5 });
  const [c1, c2, c3] = attach(parent, [makeChild("c1", 40, 20), makeChild("c2", 40, 20), makeChild("c3", 40, 20)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 20);
  assert.equal(c1.getComponent(Transform).y, 10);
  assert.equal(c2.getComponent(Transform).x, 70);
  assert.equal(c2.getComponent(Transform).y, 10);
  assert.equal(c3.getComponent(Transform).x, 20, "c3 wraps to a new line, resetting x");
  assert.equal(c3.getComponent(Transform).y, 35, "c3 sits on the second line");
}

// --- flow: maxCols caps items per line even with width unbounded ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", maxCols: 2, gapX: 5, gapY: 5 });
  const children = attach(parent, [1, 2, 3, 4, 5].map((n) => makeChild(`c${n}`, 10, 10)));

  parent.getComponent(Layout).onTick(parent);

  const [c1, c2, c3, , c5] = children.map((c) => c.getComponent(Transform));
  assert.equal(c1.x, 5);
  assert.equal(c2.x, 20);
  assert.equal(c3.x, 5, "c3 starts a new line at maxCols=2");
  assert.equal(c3.y, 20, "c3's line is below c1/c2's line");
  assert.equal(c5.y, 35, "c5 is alone on a third line");
}

// --- flow: justify=space-between distributes leftover space between items ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", width: 100, gapX: 0, justify: "space-between" });
  const [c1, c2, c3] = attach(parent, [makeChild("c1", 10, 10), makeChild("c2", 10, 10), makeChild("c3", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 5);
  assert.equal(c2.getComponent(Transform).x, 50);
  assert.equal(c3.getComponent(Transform).x, 95);
}

// --- flow: justify=space-around distributes leftover space around items ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", width: 100, gapX: 0, justify: "space-around" });
  const [c1, c2] = attach(parent, [makeChild("c1", 10, 10), makeChild("c2", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 25);
  assert.equal(c2.getComponent(Transform).x, 75);
}

// --- flow: align centers items within the line's cross-axis thickness ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", align: "center" });
  const [a, b] = attach(parent, [makeChild("a", 10, 20), makeChild("b", 10, 40)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(a.getComponent(Transform).y, 20, "shorter item centered within the 40px line height");
  assert.equal(b.getComponent(Transform).y, 20, "taller item defines the line height");
}

// --- flow: align=end bottom-aligns items within the line ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", align: "end" });
  const [a, b] = attach(parent, [makeChild("a", 10, 20), makeChild("b", 10, 40)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(a.getComponent(Transform).y, 30);
  assert.equal(b.getComponent(Transform).y, 20);
}

// --- padding/gap offsets on a single item ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", paddingX: 10, paddingY: 20 });
  const [a] = attach(parent, [makeChild("a", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(a.getComponent(Transform).x, 15);
  assert.equal(a.getComponent(Transform).y, 25);
}

console.log("layout.test.mjs: all assertions passed");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node source/engine/test/layout.test.mjs`
Expected: FAIL — `Cannot find module '../components/Layout.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `source/engine/components/Layout.js`:

```js
import { Component } from "../types/Component.js";

const MODE_OPTIONS = [
  { value: "flow", label: "Flow" },
  { value: "grid", label: "Grid" },
];

const DIRECTION_OPTIONS = [
  { value: "row", label: "Row" },
  { value: "column", label: "Column" },
];

const JUSTIFY_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Space Between" },
  { value: "space-around", label: "Space Around" },
];

const ALIGN_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
];

/**
 * Automatically positions an entity's direct children, flexbox-style
 * ("flow": wraps along one main axis) or grid-style ("grid": fixed
 * row/column count, tracks auto-sized to content). Runs every tick,
 * writing into each child's own Transform.x/y.
 *
 * Child Transform.x/y are already parent-relative (see Transform.js), so
 * this positions children in the Layout entity's own local space starting
 * at (paddingX, paddingY) — it does NOT add the Layout entity's own
 * Transform position, which getWorldTransform composes in separately.
 */
export class Layout extends Component {
  static schema = {
    mode: { type: "select", default: "flow", description: "\"flow\" wraps children flexbox-style; \"grid\" places them into a fixed row/column grid with content-sized tracks.", options: MODE_OPTIONS },
    direction: { type: "select", default: "row", description: "Main axis for flow mode; row-major vs column-major fill order for grid mode.", options: DIRECTION_OPTIONS },
    wrap: { type: "boolean", default: true, description: "Flow mode only: wrap onto a new line, instead of flowing on a single endless line." },
    width: { type: "number", default: 0, description: "Container box width. 0 = unbounded. Flow+row mode: triggers a wrap when exceeded." },
    height: { type: "number", default: 0, description: "Container box height. 0 = unbounded. Flow+column mode: triggers a wrap when exceeded." },
    gapX: { type: "number", default: 0, description: "Horizontal spacing between items." },
    gapY: { type: "number", default: 0, description: "Vertical spacing between items (between wrapped lines in flow; row gap in grid)." },
    maxCols: { type: "number", default: 0, description: "Flow: caps items per row before wrapping (row direction). Grid: fixed column count. 0 = unbounded/auto." },
    maxRows: { type: "number", default: 0, description: "Flow: caps items per column before wrapping (column direction). Grid: fixed row count. 0 = unbounded/auto." },
    justify: { type: "select", default: "start", description: "Main-axis distribution in flow mode. Horizontal in-cell alignment in grid mode (space-between/space-around behave as start there).", options: JUSTIFY_OPTIONS },
    align: { type: "select", default: "start", description: "Cross-axis alignment within a line (flow) or vertical in-cell alignment (grid).", options: ALIGN_OPTIONS },
    paddingX: { type: "number", default: 0, description: "Inset from the Layout entity's own position, horizontal." },
    paddingY: { type: "number", default: 0, description: "Inset from the Layout entity's own position, vertical." },
  };

  onTick(entity) {
    const children = entity.children.filter((c) => c.getComponent("Transform"));
    if (children.length === 0) return;

    this._layoutFlow(children);
  }

  // ---- flow mode ----

  _layoutFlow(children) {
    const horizontal = this.direction === "row";
    const rawBound = horizontal ? this.width : this.height;
    const paddingMain = horizontal ? this.paddingX : this.paddingY;
    const contentBound = rawBound > 0 ? Math.max(0, rawBound - 2 * paddingMain) : 0;

    const lines = this._packLines(children, horizontal, contentBound);
    this._placeLines(lines, horizontal, contentBound);
  }

  // Packs children into lines along the main axis, breaking to a new line
  // when the next item would exceed contentBound (if wrap) or the
  // configured max-items-per-line count.
  _packLines(children, horizontal, contentBound) {
    const lines = [];
    let line = [];
    let mainSize = 0;
    const maxCount = horizontal ? this.maxCols : this.maxRows;
    const gapMain = horizontal ? this.gapX : this.gapY;

    for (const child of children) {
      const dims = child.getDimensions();
      const size = horizontal ? dims.width : dims.height;
      const nextMainSize = line.length === 0 ? size : mainSize + gapMain + size;

      const overByBound = this.wrap && contentBound > 0 && line.length > 0 && nextMainSize > contentBound;
      const overByCount = maxCount > 0 && line.length >= maxCount;

      if (line.length > 0 && (overByBound || overByCount)) {
        lines.push({ items: line, mainSize });
        line = [{ entity: child, dims }];
        mainSize = size;
      } else {
        line.push({ entity: child, dims });
        mainSize = nextMainSize;
      }
    }
    if (line.length > 0) lines.push({ items: line, mainSize });
    return lines;
  }

  _placeLines(lines, horizontal, contentBound) {
    const gapMain = horizontal ? this.gapX : this.gapY;
    const gapCross = horizontal ? this.gapY : this.gapX;
    const paddingMain = horizontal ? this.paddingX : this.paddingY;
    const paddingCross = horizontal ? this.paddingY : this.paddingX;
    let crossCursor = paddingCross;

    for (const line of lines) {
      const crossSize = Math.max(0, ...line.items.map(({ dims }) => (horizontal ? dims.height : dims.width)));
      const offsets = this._distributeMain(line, gapMain, paddingMain, contentBound, horizontal);

      for (let i = 0; i < line.items.length; i++) {
        const { entity: child, dims } = line.items[i];
        const mainOffset = offsets[i];
        const crossItemSize = horizontal ? dims.height : dims.width;
        const crossOffset = this._alignOffset(crossItemSize, crossSize, this.align);

        const transform = child.getComponent("Transform");
        if (horizontal) {
          transform.x = mainOffset + dims.width / 2;
          transform.y = crossCursor + crossOffset + dims.height / 2;
        } else {
          transform.y = mainOffset + dims.height / 2;
          transform.x = crossCursor + crossOffset + dims.width / 2;
        }
      }

      crossCursor += crossSize + gapCross;
    }
  }

  // Returns each item's main-axis top-left offset within its line, applying `justify`.
  _distributeMain(line, gapMain, paddingMain, contentBound, horizontal) {
    const n = line.items.length;
    const offsets = new Array(n);
    const slack = contentBound > 0 ? Math.max(0, contentBound - line.mainSize) : 0;

    let cursor = paddingMain;
    let extraGap = 0;
    if (slack > 0) {
      if (this.justify === "center") cursor = paddingMain + slack / 2;
      else if (this.justify === "end") cursor = paddingMain + slack;
      else if (this.justify === "space-between" && n > 1) extraGap = slack / (n - 1);
      else if (this.justify === "space-around" && n > 0) {
        extraGap = slack / n;
        cursor = paddingMain + extraGap / 2;
      }
    }

    for (let i = 0; i < n; i++) {
      offsets[i] = cursor;
      const size = horizontal ? line.items[i].dims.width : line.items[i].dims.height;
      cursor += size + gapMain + extraGap;
    }
    return offsets;
  }

  _alignOffset(itemSize, trackSize, mode) {
    if (mode === "center") return (trackSize - itemSize) / 2;
    if (mode === "end") return trackSize - itemSize;
    return 0; // "start", and any space-* value (not meaningful for single-item cells)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node source/engine/test/layout.test.mjs`
Expected: PASS — `layout.test.mjs: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add source/engine/components/Layout.js source/engine/test/layout.test.mjs
git commit -m "feat(engine): add Layout component, flow mode"
```

---

### Task 2: `Layout` component — grid mode, Transform-skip guard, registration

**Files:**
- Modify: `source/engine/components/Layout.js` (add `_layoutGrid`, dispatch in `onTick`)
- Modify: `source/engine/types/DefaultComponents.js`
- Test: `source/engine/test/layout.test.mjs` (append grid + skip-guard cases)

**Interfaces:**
- Consumes: `Layout` class from Task 1 (`_alignOffset`, schema fields `maxCols`/`maxRows`/`mode`/`direction`/`gapX`/`gapY`/`paddingX`/`paddingY`/`justify`/`align` — all already declared in Task 1's schema).
- Produces: `Layout.onTick` now branches on `this.mode`; `DEFAULT_COMPONENTS` map includes `Layout` so the editor's live engine can construct it by name.

- [ ] **Step 1: Write the failing tests**

Append to `source/engine/test/layout.test.mjs` (before the final `console.log` line):

```js
// --- grid: auto-sizes column widths / row heights to the largest child in each track ---
{
  const parent = makeParent("p", { mode: "grid", direction: "row", maxCols: 2, maxRows: 2, gapX: 5, gapY: 5 });
  const [i1, i2, i3, i4] = attach(parent, [
    makeChild("i1", 20, 10),
    makeChild("i2", 30, 15),
    makeChild("i3", 15, 25),
    makeChild("i4", 25, 20),
  ]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(i1.getComponent(Transform).x, 10);
  assert.equal(i1.getComponent(Transform).y, 5);
  assert.equal(i2.getComponent(Transform).x, 40);
  assert.equal(i2.getComponent(Transform).y, 7.5);
  assert.equal(i3.getComponent(Transform).x, 7.5);
  assert.equal(i3.getComponent(Transform).y, 32.5);
  assert.equal(i4.getComponent(Transform).x, 37.5);
  assert.equal(i4.getComponent(Transform).y, 30);
}

// --- grid: falls back to a single row when maxCols and maxRows are both 0 ---
{
  const parent = makeParent("p", { mode: "grid", gapX: 5 });
  const [c1, c2, c3] = attach(parent, [makeChild("c1", 10, 10), makeChild("c2", 10, 10), makeChild("c3", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 5);
  assert.equal(c2.getComponent(Transform).x, 20);
  assert.equal(c3.getComponent(Transform).x, 35);
  assert.equal(c1.getComponent(Transform).y, c3.getComponent(Transform).y, "single row: all items share the same row");
}

// --- children without a Transform are skipped, not thrown on ---
{
  const parent = makeParent("p", { mode: "flow" });
  const withTransform = makeChild("withT", 10, 10);
  const withoutTransform = new Entity("withoutT"); // no Transform component
  parent.addChild(withTransform);
  parent.addChild(withoutTransform);

  assert.doesNotThrow(() => parent.getComponent(Layout).onTick(parent));
  assert.equal(withTransform.getComponent(Transform).x, 5, "the valid child is still positioned");
}
```

- [ ] **Step 2: Run tests to verify the new cases fail**

Run: `node source/engine/test/layout.test.mjs`
Expected: FAIL on the grid assertions — `mode: "grid"` currently falls through `_layoutFlow`, so `i1`/`i2`/`i3`/`i4` land on flow-packed positions instead of grid cells (the skip-guard case already passes, since Task 1's `onTick` already filters on `getComponent("Transform")`).

- [ ] **Step 3: Write the implementation**

In `source/engine/components/Layout.js`, replace the `onTick` method:

```js
  onTick(entity) {
    const children = entity.children.filter((c) => c.getComponent("Transform"));
    if (children.length === 0) return;

    if (this.mode === "grid") this._layoutGrid(children);
    else this._layoutFlow(children);
  }
```

Then append a new `// ---- grid mode ----` section at the end of the class, after `_alignOffset`:

```js
  // ---- grid mode ----

  _layoutGrid(children) {
    let cols = this.maxCols;
    let rows = this.maxRows;
    if (cols <= 0 && rows <= 0) {
      cols = children.length;
      rows = 1;
    } else if (cols <= 0) {
      cols = Math.ceil(children.length / rows);
    } else if (rows <= 0) {
      rows = Math.ceil(children.length / cols);
    }

    const rowMajor = this.direction === "row";
    const primary = rowMajor ? cols : rows;

    const cells = [];
    for (let r = 0; r < rows; r++) cells.push(new Array(cols).fill(undefined));

    children.forEach((child, index) => {
      if (index >= rows * cols) return; // beyond grid capacity: not placed
      const dims = child.getDimensions();
      let r, c;
      if (rowMajor) {
        r = Math.floor(index / primary);
        c = index % primary;
      } else {
        c = Math.floor(index / primary);
        r = index % primary;
      }
      cells[r][c] = { entity: child, dims };
    });

    const colWidths = new Array(cols).fill(0);
    const rowHeights = new Array(rows).fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (!cell) continue;
        colWidths[c] = Math.max(colWidths[c], cell.dims.width);
        rowHeights[r] = Math.max(rowHeights[r], cell.dims.height);
      }
    }

    const colX = new Array(cols).fill(0);
    let cursorX = this.paddingX;
    for (let c = 0; c < cols; c++) {
      colX[c] = cursorX;
      cursorX += colWidths[c] + this.gapX;
    }
    const rowY = new Array(rows).fill(0);
    let cursorY = this.paddingY;
    for (let r = 0; r < rows; r++) {
      rowY[r] = cursorY;
      cursorY += rowHeights[r] + this.gapY;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (!cell) continue;
        const transform = cell.entity.getComponent("Transform");
        const cellX = colX[c] + this._alignOffset(cell.dims.width, colWidths[c], this.justify);
        const cellY = rowY[r] + this._alignOffset(cell.dims.height, rowHeights[r], this.align);
        transform.x = cellX + cell.dims.width / 2;
        transform.y = cellY + cell.dims.height / 2;
      }
    }
  }
```

In `source/engine/types/DefaultComponents.js`, add the import after the `Follow` import (line 12):

```js
import { Follow } from "../components/Follow.js";
import { Layout } from "../components/Layout.js";
```

And add `Layout,` to the map after `Follow,`:

```js
export const DEFAULT_COMPONENTS = {
  Interactable,
  Transform,
  SpriteRenderer,
  ShapeRenderer,
  TextRenderer,
  Camera,
  Movement,
  Anchor,
  Animator,
  Opacity,
  Collision,
  Follow,
  Layout,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node source/engine/test/layout.test.mjs`
Expected: PASS — `layout.test.mjs: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add source/engine/components/Layout.js source/engine/test/layout.test.mjs source/engine/types/DefaultComponents.js
git commit -m "feat(engine): add Layout grid mode, register component"
```

---

### Task 3: Changelog entry

**Files:**
- Create: `docs/changelogs/changelog5.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by later tasks — informational.

- [ ] **Step 1: Write the changelog**

Create `docs/changelogs/changelog5.md`:

```markdown
# Changelog 5

2026-07-29. Feature: a `Layout` component — automatic flexbox-style ("flow")
or grid-style ("grid") positioning of an entity's direct children.

## `Layout` component

**Files:** `source/engine/components/Layout.js`,
`source/engine/types/DefaultComponents.js`

**Design goal, from the roadmap:** "layout component for entities -> like
flexbox / grid, will auto format children." Every frame, `Layout` reads its
entity's direct children (skipping any with no `Transform`), measures each
one via the existing `entity.getDimensions()`, and writes positions into
each child's own `Transform.x`/`Transform.y`. Child `Transform.x`/`y` are
already parent-relative, so Layout positions children in its own local
space starting at `(paddingX, paddingY)` — it does not add the Layout
entity's own Transform position on top.

| field | type | default | notes |
|---|---|---|---|
| `mode` | select | `"flow"` | `"flow"` or `"grid"` |
| `direction` | select | `"row"` | main axis for flow; row-major vs column-major fill order for grid |
| `wrap` | boolean | `true` | flow mode only — wrap onto a new line vs. one endless line |
| `width` | number | `0` | container box width; `0` = unbounded. Flow+row: wrap trigger |
| `height` | number | `0` | container box height; `0` = unbounded. Flow+column: wrap trigger |
| `gapX` / `gapY` | number | `0` | spacing between items |
| `maxCols` / `maxRows` | number | `0` | flow: caps items per line before wrapping. grid: fixed column/row count (`0`/`0` falls back to a single row; one set with the other `0` grows the unset dimension to fit) |
| `justify` | select | `"start"` | main-axis distribution in flow (`start/center/end/space-between/space-around`); horizontal in-cell alignment in grid (`space-*` behave as `start` there) |
| `align` | select | `"start"` | cross-axis alignment within a line (flow) or vertical in-cell alignment (grid): `start/center/end` |
| `paddingX` / `paddingY` | number | `0` | inset from the Layout entity's own position |

**Flow mode** packs children into lines along `direction`, breaking to a
new line when the next item would exceed `width`/`height` (if `wrap`) or
`maxCols`/`maxRows`. `justify` distributes leftover space along the main
axis per line (space-between/space-around included); `align` positions
each item within its line's cross-axis thickness.

**Grid mode** assigns children into cells (row-major or column-major, per
`direction`) up to `maxCols` × `maxRows` capacity, then auto-sizes each
column's width to its widest child and each row's height to its tallest
child — CSS-grid-style auto tracks, not fixed cell sizes, since children
keep their natural size. Children beyond grid capacity are not placed (a
known v1 limitation).

Registered in `DefaultComponents.js` like every other built-in component —
no other registry needed; the editor's schema/build tooling scans
`source/engine/components/*.js` directly.

## Demo scene

**File:** `source/projects/test/scenes/layoutdemo.json`

A `flowContainer` (flow mode, `width: 200`, `justify: "space-between"`,
`align: "center"`) with six mixed rect/circle children that wrap across two
lines, and a `gridContainer` (grid mode, `maxCols: 3`, `maxRows: 2`) with
six mixed-size children demonstrating auto-sized tracks.

## Testing

No test framework exists in this repo. `Layout` has no DOM dependencies, so
it's covered by a plain `.mjs` file run directly via `node`:

- `source/engine/test/layout.test.mjs` — flow wrap by `width`, flow wrap by
  `maxCols`, `justify` (`space-between`/`space-around`), `align` cross-axis
  positioning, `paddingX`/`paddingY` offsets, grid auto-sized tracks, grid
  fallback when `maxCols`/`maxRows` are both `0`, and children with no
  `Transform` being skipped without throwing.
```

- [ ] **Step 2: Commit**

```bash
git add docs/changelogs/changelog5.md
git commit -m "docs: add changelog for Layout component"
```

---

### Task 4: Demo scene in the `test` project

**Files:**
- Create: `source/projects/test/scenes/layoutdemo.json`

**Interfaces:**
- Consumes: `Layout` (Task 2, registered in `DefaultComponents.js`), the scene JSON shape used by `source/projects/test/scenes/collisionsim.json` (top-level `{name, entities: [{id, components, parentId?}]}`, where `parentId` links a child to a parent entity by id).
- Produces: nothing consumed by later tasks — this is the final, user-facing deliverable.

- [ ] **Step 1: Create the scene file**

Create `source/projects/test/scenes/layoutdemo.json`:

```json
{
  "name": "layoutdemo",
  "entities": [
    {
      "id": "cam",
      "components": {
        "Transform": { "x": 200, "y": 250, "rotation": 0, "fixed": false },
        "Camera": { "zoom": 1, "offset": { "x": 0, "y": 0 }, "bounds": null, "target": null }
      }
    },
    {
      "id": "flowLabel",
      "components": {
        "Transform": { "x": 20, "y": 15, "rotation": 0, "zIndex": 2 },
        "TextRenderer": {
          "text": "Flow: width=200, wrap, justify=space-between, align=center",
          "fontSize": 14,
          "color": "#ffffff"
        }
      }
    },
    {
      "id": "flowContainer",
      "components": {
        "Transform": { "x": 20, "y": 50, "rotation": 0, "zIndex": 0 },
        "Layout": {
          "mode": "flow",
          "direction": "row",
          "wrap": true,
          "width": 200,
          "height": 0,
          "gapX": 10,
          "gapY": 10,
          "maxCols": 0,
          "maxRows": 0,
          "justify": "space-between",
          "align": "center",
          "paddingX": 10,
          "paddingY": 10
        }
      }
    },
    {
      "id": "flowItem1",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 40, "height": 40, "color": "#e0475b" }
      },
      "parentId": "flowContainer"
    },
    {
      "id": "flowItem2",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "circle", "width": 30, "height": 30, "color": "#4b8bf5" }
      },
      "parentId": "flowContainer"
    },
    {
      "id": "flowItem3",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 60, "height": 30, "color": "#f5c542" }
      },
      "parentId": "flowContainer"
    },
    {
      "id": "flowItem4",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "circle", "width": 45, "height": 45, "color": "#a557e0" }
      },
      "parentId": "flowContainer"
    },
    {
      "id": "flowItem5",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 35, "height": 50, "color": "#68d38b" }
      },
      "parentId": "flowContainer"
    },
    {
      "id": "flowItem6",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 50, "height": 50, "color": "#42d4c5" }
      },
      "parentId": "flowContainer"
    },
    {
      "id": "gridLabel",
      "components": {
        "Transform": { "x": 20, "y": 210, "rotation": 0, "zIndex": 2 },
        "TextRenderer": {
          "text": "Grid: 3 cols x 2 rows, auto-sized tracks, justify=center, align=center",
          "fontSize": 14,
          "color": "#ffffff"
        }
      }
    },
    {
      "id": "gridContainer",
      "components": {
        "Transform": { "x": 20, "y": 230, "rotation": 0, "zIndex": 0 },
        "Layout": {
          "mode": "grid",
          "direction": "row",
          "wrap": true,
          "width": 0,
          "height": 0,
          "gapX": 12,
          "gapY": 12,
          "maxCols": 3,
          "maxRows": 2,
          "justify": "center",
          "align": "center",
          "paddingX": 10,
          "paddingY": 10
        }
      }
    },
    {
      "id": "gridItem1",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 30, "height": 30, "color": "#ff8c42" }
      },
      "parentId": "gridContainer"
    },
    {
      "id": "gridItem2",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "circle", "width": 40, "height": 40, "color": "#e0475b" }
      },
      "parentId": "gridContainer"
    },
    {
      "id": "gridItem3",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 25, "height": 45, "color": "#4b8bf5" }
      },
      "parentId": "gridContainer"
    },
    {
      "id": "gridItem4",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "circle", "width": 35, "height": 35, "color": "#f5c542" }
      },
      "parentId": "gridContainer"
    },
    {
      "id": "gridItem5",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 50, "height": 25, "color": "#a557e0" }
      },
      "parentId": "gridContainer"
    },
    {
      "id": "gridItem6",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "zIndex": 1 },
        "ShapeRenderer": { "shape": "rect", "width": 30, "height": 30, "color": "#68d38b" }
      },
      "parentId": "gridContainer"
    }
  ]
}
```

Note: children's `Transform.x`/`y` are seeded at `0, 0` — this is
intentional, not a placeholder; `Layout.onTick` overwrites them on the
first frame the scene runs.

- [ ] **Step 2: Smoke-check the scene loads and Layout computes finite positions**

This mimics scene-loading well enough to catch typos/wiring mistakes
without needing the full DOM-dependent `GameEngine`. It is a one-off check,
not a permanent test — delete the script after running it.

Create a temporary file `source/engine/test/_smoke_layoutdemo.mjs`:

```js
import fs from "node:fs";
import { Entity } from "../types/Entity.js";
import { Transform } from "../components/Transform.js";
import { Camera } from "../components/Camera.js";
import { ShapeRenderer } from "../components/ShapeRenderer.js";
import { TextRenderer } from "../components/TextRenderer.js";
import { Layout } from "../components/Layout.js";

const COMPONENT_CLASSES = { Transform, Camera, ShapeRenderer, TextRenderer, Layout };

const scene = JSON.parse(fs.readFileSync("source/projects/test/scenes/layoutdemo.json", "utf-8"));

const entities = new Map();
for (const def of scene.entities) {
  const entity = new Entity(def.id);
  for (const [compName, data] of Object.entries(def.components)) {
    const ComponentClass = COMPONENT_CLASSES[compName];
    if (!ComponentClass) throw new Error(`Unknown component in smoke test: ${compName}`);
    entity.addComponent(ComponentClass, data);
  }
  entities.set(def.id, entity);
}
for (const def of scene.entities) {
  if (def.parentId) entities.get(def.parentId).addChild(entities.get(def.id));
}

for (const entity of entities.values()) {
  const layout = entity.getComponent(Layout);
  if (layout) layout.onTick(entity);
}

for (const entity of entities.values()) {
  const t = entity.getComponent(Transform);
  if (!t) continue;
  if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) {
    throw new Error(`Non-finite position for ${entity.id}: (${t.x}, ${t.y})`);
  }
  console.log(entity.id, t.x, t.y);
}
console.log("smoke check: all Layout-driven positions are finite");
```

Run: `node source/engine/test/_smoke_layoutdemo.mjs`
Expected: prints a finite `x, y` for every entity with a `Transform`,
ending with `smoke check: all Layout-driven positions are finite`. If any
`ShapeRenderer`/component name is misspelled in the JSON, this throws
immediately with a clear error instead of failing silently in the editor.

Then delete the temporary script (it is not part of the permanent test
suite and must not be committed):

Run: `rm source/engine/test/_smoke_layoutdemo.mjs`

- [ ] **Step 3: Commit**

```bash
git add source/projects/test/scenes/layoutdemo.json
git commit -m "test: add layoutdemo scene demonstrating flow and grid Layout modes"
```

- [ ] **Step 4: Visual confirmation (manual, not automated)**

Open the `test` project in the editor, switch to the `layoutdemo` scene
(it won't be the `startScene` — `source/projects/test/project.lg` still
points at `collisionsim` unless the user changes it via the editor's
"set as start scene" action), and confirm: six shapes wrap across two rows
under "Flow", evenly spaced with `space-between`; six shapes sit in a 3×2
grid under "Grid", each row/column sized to its largest occupant.
