# Pixel Art Editor — Canvas & Tool Mechanics — Design

## Summary

First of two design passes scoped out on the roadmap for the pixel art
editor (`source/extensions/pixel-art/`). Covers the canvas/tool-mechanics
half of the candidate list: zoom/pan, brush size, opacity, a dynamic
palette (replacing the fixed 12-swatch array), and undo/redo. The other
half — automatic color-scheme detection, a coolors-style palette
generator, and "fit sprite to new palette" — is a separate design pass
(different implementation surface: color algorithms vs. canvas/input
handling).

Core logic (grid model, painting, undo stack, palette management) is
extracted from the current single inline `<script>` in `index.html` into
plain `.mjs` modules with unit tests, following the pattern already
established in `source/extensions/track-maker/` (`frontend/js/*.mjs` +
`test/*.test.mjs`). `index.html` keeps DOM wiring and canvas rendering,
importing the modules.

## Current state (baseline)

- `cells[]`: flat array of CSS color strings/`null` (transparent), one
  entry per grid cell, row-major.
- Fixed `CELL_DISPLAY_SIZE = 20` — no zoom, no pan.
- `paintAt()` sets exactly one cell per pointer move.
- Fixed 12-color `PALETTE` array + a native `<input type="color">` for
  arbitrary colors.
- No opacity/alpha control on painted color.
- No undo.

## Architecture

New modules under `source/extensions/pixel-art/frontend/js/`:

- `grid.mjs` — grid model: create/resize, get/set cell, serialize to/from
  the `ImageData`-derived format already used by `openAsset()`.
- `paint.mjs` — brush logic: given a center cell + brush size, returns the
  list of `{x, y}` cells to paint, clipped to grid bounds.
- `viewport.mjs` — zoom/pan math: screen↔grid coordinate conversion, zoom
  clamping, "zoom centered on cursor" pan adjustment.
- `undo.mjs` — snapshot stack: `push(cells)`, `undo()`, `redo()`, capped
  depth, clears on reset.
- `palette.mjs` — dynamic palette: default seed colors, add-color
  (dedup + most-recent-first + cap), extract unique colors from a
  loaded grid (for auto-detect-on-open), localStorage load/save keyed by
  project.

`index.html` imports these as ES modules (`<script type="module">`,
matching track-maker), keeping DOM event wiring, canvas 2D rendering, and
the existing save/open/fetch flow inline.

## Zoom & Pan

- New view-transform state: `zoom` (float, clamped e.g. 0.25×–8×),
  `panX`/`panY` (screen-space pixel offsets). Independent of the logical
  `gridW × gridH` — the `cells[]` model is untouched.
- Render uses `effectiveCellSize = CELL_DISPLAY_SIZE * zoom`; the canvas
  element's on-screen size/position reflects zoom + pan (canvas backing
  size stays screen-resolution appropriate; drawing scales via `ctx.scale`
  or by drawing at `effectiveCellSize` directly, whichever keeps the grid
  lines crisp — implementation detail for the plan).
- **Zoom:** wheel event. Zoom is centered on the cursor: convert cursor
  screen position to grid-space before the zoom change, adjust `panX/panY`
  after changing `zoom` so that same grid point stays under the cursor.
- **Pan:** holding <kbd>Space</kbd> + drag, or middle-mouse drag, updates
  `panX/panY`. Cursor switches to a grab/grabbing style while active.
  Regular click-drag with no modifier remains painting, unaffected.
- Coordinate conversion (`viewport.mjs`) is the single source of truth
  used both by painting (`paintAt`) and by rendering, so zoom/pan never
  desyncs painting from what's drawn.

## Brush size

- New `brushSize` state (integer 1–8), a stepper control in the header
  next to the color picker.
- `paint.mjs` computes an `NxN` square block of cells anchored so the
  cursor cell is inside the block (e.g. top-left anchored, matching how
  most pixel editors anchor square brushes), clipped to `[0, gridW)` /
  `[0, gridH)`.
- Square-only brush (no circle/diamond shapes) — matches pixel-art tool
  conventions (Aseprite default) and avoids rasterization edge cases that
  don't matter at these pixel counts.

## Opacity

- New alpha slider (0–100%) next to the color picker, applying to the
  currently selected color.
- Selected "color" becomes an `rgba(r,g,b,a)` string when alpha < 100%
  (reusing the rgba parsing/formatting already present for loading PNGs
  with partial transparency — no new color-format handling needed).
- Painting **overwrites** the target cell(s) with that rgba string —
  no alpha-compositing/blending against whatever was there before. Matches
  the existing one-color-per-cell model exactly; blending was considered
  and rejected as unnecessary complexity for this pass.

## Dynamic palette

Replaces the fixed `PALETTE` array in `index.html`.

- **Defaults:** a small starter set (black, white, transparent) for a
  brand-new sprite.
- **Recent colors:** every distinct color used while painting is added to
  a "recent" swatch row — dedup by exact value, most-recent-first, capped
  (e.g. 24 entries) so the row doesn't grow unbounded.
- **Auto-detect on open:** opening an existing PNG asset scans its unique
  colors (already extracted as part of the existing `openAsset()` pixel
  read) and **replaces** the recent-colors row with that asset's actual
  palette — editing an existing sprite immediately shows the colors it's
  already using, instead of an unrelated recent-colors history.
- **Persistence:** stored in `localStorage`, keyed per-project (e.g.
  `pixelart:palette:<project>`) — no backend route needed, this is UI
  convenience state, not a saved asset. Loaded on extension open; updated
  as colors are picked or an asset is opened.
- The custom `<input type="color">` picker remains for choosing arbitrary
  colors (already covers "pick any color" — no separate change needed
  there); it's now the primary way new colors enter the recent row.

## Undo / redo

- `undo.mjs` maintains a stack of full `cells[]` snapshots (grid sizes here
  are small — max a few thousand cells — so snapshotting the whole array
  per stroke is cheap; no need for diff-based storage).
- A snapshot is pushed **once per stroke**, at `pointerdown`, before that
  stroke's paint calls mutate `cells[]`. Stack depth capped (e.g. 50);
  oldest snapshots drop off.
- <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes, <kbd>Ctrl</kbd>+<kbd>Y</kbd> (or
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) redoes. Redo stack clears
  on any new stroke.
- **Scope: stroke-level only.** Resizing the grid, opening an asset, or
  Clear all reset/clear the undo history rather than being undoable steps
  themselves — keeps the stack a simple fixed-shape array of one grid size,
  with no cross-resize restoration logic.

## Error handling

No new error surfaces beyond what exists (`.status` / `.status.error` /
`.status.ok` pattern for save/open). Zoom/pan/brush/undo are pure
client-side UI state — nothing to fail there beyond clamping inputs
(zoom range, brush size range, undo stack depth) to sane bounds.

## Testing

- Unit tests (mirroring `track-maker/test/*.test.mjs`) for the new
  modules:
  - `grid.mjs` — resize preserves in-bounds cells, serialize round-trips.
  - `paint.mjs` — brush block generation at various sizes/positions,
    including clipping at grid edges/corners.
  - `viewport.mjs` — screen↔grid conversion round-trips at various
    zoom/pan values; "zoom centered on cursor" keeps the grid-space point
    under the cursor fixed before/after.
  - `undo.mjs` — push/undo/redo sequences, cap eviction, redo-clears-on-new-stroke.
  - `palette.mjs` — add-color dedup + ordering + cap, unique-color
    extraction from a grid, persistence round-trip (mockable storage).
- Manual verification in-browser (per the `run` skill) for the parts unit
  tests can't cover: wheel zoom/pan feel, brush painting visually, opacity
  slider producing visibly transparent strokes, undo/redo keyboard
  shortcuts, palette swatches updating live while painting and on asset
  open.
