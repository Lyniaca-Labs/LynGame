# Layout Component — Design

Roadmap item: "layout component for entities -> like flexbox / grid, will auto
format children" (`docs/ROADMAP.md`, Graphics Framework).

## Summary

A new engine component, `Layout`, attached to an entity to automatically
position that entity's direct children — either as a wrapping flexbox-style
flow, or as a fixed-dimension grid with content-sized tracks. It recomputes
every tick, writing into each child's own `Transform.x`/`Transform.y`.

## Precedent it follows

- **`Anchor.js`** (`source/engine/components/Anchor.js`) — the closest
  existing pattern for "every tick, write a Transform based on external
  size info." Anchor writes into its *own* Transform based on viewport size;
  Layout writes into its *children's* Transforms based on the container's
  own box. No existing component currently reaches into other entities'
  Transforms from `onTick` — Layout is the first.
- **`Follow.js`** — precedent for a `mode` select field with per-mode
  behavior branching (`exponential`/`spring`/`maxSpeed`), and for keeping
  private non-schema working state as plain instance fields.
- **`source/engine/modules/GUI.js`** (`layoutRow`, `layoutStack`,
  `layoutHand`) — one-shot, script-invoked layout functions that already
  write `x`/`y`/`rotation` into a list of entities. Layout is conceptually
  "run an algorithm like these automatically, every tick, driven by
  `entity.children` instead of a script-supplied array."

## Component location & registration

- `source/engine/components/Layout.js` — new component class.
- `source/engine/types/DefaultComponents.js` — add the import + map entry
  so the editor's live engine can construct it by name. (The editor's
  component-scan/schema/build tooling in
  `source/server/manager/ProjectHandler.ts` picks up new components
  automatically by scanning the directory + reading `static schema`; no
  other registry file needs touching.)

## Schema

Field types are drawn from the existing `SchemaField` union (`number`,
`boolean`, `select`) — no new inspector field type is needed.

| field | type | default | notes |
|---|---|---|---|
| `mode` | select | `"flow"` | `"flow"` or `"grid"` |
| `direction` | select | `"row"` | main axis for flow; row-major vs column-major fill order for grid |
| `wrap` | boolean | `true` | flow mode only — wrap onto a new line vs. one endless line |
| `width` | number | `0` | container box width; `0` = unbounded. Flow+row: wrap trigger when exceeded |
| `height` | number | `0` | container box height; `0` = unbounded. Flow+column: wrap trigger when exceeded |
| `gapX` | number | `0` | horizontal spacing between items |
| `gapY` | number | `0` | vertical spacing between items (between wrapped lines in flow; row gap in grid) |
| `maxCols` | number | `0` | flow: caps items per row before wrapping (row direction). grid: fixed column count |
| `maxRows` | number | `0` | flow: caps items per column before wrapping (column direction). grid: fixed row count |
| `justify` | select | `"start"` | main-axis distribution in flow: `start/center/end/space-between/space-around`. Horizontal in-cell alignment in grid (`space-*` behave as `start` there) |
| `align` | select | `"start"` | cross-axis alignment within a line (flow) or vertical in-cell alignment (grid): `start/center/end` |
| `paddingX` | number | `0` | inset from the Layout entity's own Transform position, horizontal |
| `paddingY` | number | `0` | inset from the Layout entity's own Transform position, vertical |

Grid-mode fallback: if both `maxCols` and `maxRows` are `0`, Layout treats
the grid as a single row (`maxCols` = child count) so the component is never
a silent no-op with default settings. If only one of the two is set, the
other grows to fit all children (e.g. `maxCols: 3`, `maxRows: 0` → as many
rows as needed for 3 columns).

Children with no `Transform` component are skipped (can't be positioned —
not counted in the layout at all). Children's size is read via
`entity.getDimensions()` (existing utility, already used by `Collision` and
`Interactable`); entities with no renderer report `{width: 0, height: 0}`
and still occupy a slot (contributing only gap spacing).

## Algorithm

Runs in `onTick(entity, engine, dt)`, recomputed fully every frame (matches
`Anchor`/`Follow` — simplest, always correct if children are added, removed,
resized, or reordered; no dirty-flag/invalidation tracking needed).

Two passes:

1. **Grouping / measuring.**
   - *Flow:* walk `entity.children` in order along `direction`, packing them
     into lines. Break to a new line when adding the next child would
     exceed `width` (row direction) or `height` (column direction) — if
     `wrap` is true — or when the current line already holds `maxCols`
     (row) / `maxRows` (column) items. Track each line's cross-axis size
     (max item height, for row direction; max item width, for column).
   - *Grid:* assign children to cells in row-major or column-major order
     (per `direction`) up to `maxCols` × `maxRows` capacity. Compute each
     column's width as the widest child assigned to it, and each row's
     height as the tallest child assigned to it (CSS-grid-style auto
     tracks — not fixed cell sizes, since children keep natural sizes).
2. **Placement.** Child `Transform.x`/`y` are already parent-relative (per
   `Transform`'s own field descriptions), so placement happens in the
   Layout entity's own local space, starting at `(paddingX, paddingY)` —
   the Layout entity's own Transform position is *not* added on top; that
   composition already happens separately via `getWorldTransform`. Walk
   lines/cells and assign each child's `Transform.x`/`Transform.y`:
   `justify` distributes items along the main axis within a line (flow) or
   horizontally within a cell (grid); `align` positions items along the
   cross axis within a line's thickness (flow) or vertically within a cell
   (grid). Since renderers draw centered on their Transform position
   (`ctx.translate` then draw from `-width/2, -height/2`), each child's
   final `x`/`y` is its box's top-left (within the line/cell) plus half its
   own width/height.

## Non-goals (v1)

- No nested-Layout-specific handling beyond what falls out naturally
  (a Layout entity that is itself a child of another Layout is measured via
  its own `getDimensions()`, which does not currently account for its
  computed children bounds — acceptable known limitation, not addressed
  here).
- No z-index/stacking changes — existing `Transform.zIndex` is untouched.
- No reverse-order or gap-distribution variants beyond `justify`/`align`
  above.

## Testing

Plain Node `.mjs` script, following `source/engine/test/collision.test.mjs`
/ `follow.test.mjs` (no test framework in this repo): `layout.test.mjs`,
using minimal fake `Entity`/`Transform` objects and a stubbed
`getDimensions()`. Cases:

- Flow: wrap triggered by `width`.
- Flow: wrap triggered by `maxCols`.
- Flow: `justify` = `space-between` and `space-around` distribution.
- Flow: `align` cross-axis positioning with mixed-height children.
- Grid: auto-sized column/row tracks from mixed-size children.
- Grid: fallback when `maxCols`/`maxRows` both `0`.
- `paddingX`/`paddingY` and `gapX`/`gapY` offsets.
- Children without a `Transform` are skipped without throwing.

## Documentation

A changelog entry in `docs/changelogs/` following the `changelog4.md`
template (summary paragraph, **File(s):** line, schema table, algorithm
prose, Testing section) once implemented.
