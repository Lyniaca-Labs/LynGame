# Tilemap System — Design

Roadmap item: "Tilemaps" (`docs/ROADMAP.md`) — sprite map rules for
autofilling, optimized for large maps (conditional sprites / function that
returns a sprite), plus the unbuilt "Tilemap creator" extension listed
alongside the Spritesheet/Texture creator extensions.

Scoped for a same-night jam-prep build: top-down explorer needs tile-based
levels; a card game does not. This is the "explorer-enabling" option chosen
over the "juice/polish" alternative (particles/screen effects) discussed
earlier in this session.

## Summary

A new **tileset** asset type (an existing image + a `.tileset.json` sidecar
defining the grid, per-tile solidity, bitmask-based autotile rules, and
optional per-slot cell variations — weighted-random static variants or
looping animated frames, both drawn from the tileset's own grid) and
a new **tilemap** asset type (`.tilemap.json`, a sparse multi-layer grid of
painted cells referencing a tileset). A new `Tilemap` engine component reads
a tilemap asset, flattens each layer into a typed array at spawn time (no
per-tile entities), and owns its own render pass (culled to the visible
camera range) and collision pass (checked against nearby entities, hooked
into `_update()` the same way `Collision.checkPair` already is). A new
toolbar extension, `tilemap`, is where tilesets and maps are actually
authored — define a tileset from an image, mark solid tiles, paint a 16-cell
autotile blob per terrain once, then paint the map itself across multiple
layers.

## Precedent it follows

- **`.spritesheet.json` sidecar convention**
  (`source/server/manager/ProjectHandler.ts:106-138`, classifies a PNG as
  `type: "spritesheet"` purely by a sibling sidecar file's presence) — the
  tileset/tilemap asset types follow the identical "special file next to an
  image reclassifies it" idea. `AssetLoader._loadSpritesheet`
  (`source/engine/modules/AssetLoader.js:53-60`, caches `{ image, meta }`
  instead of a bare `Image`) is the direct precedent for a new
  `_loadTileset`/`_loadTilemap` loader branch.
- **`Collision.checkPair(entityA, entityB, engine)`**
  (`source/engine/components/Collision.js:25-51`, called explicitly from
  `GameEngine._update()` at `source/engine/index.js:524-529` rather than via
  the generic per-entity `onTick` loop) — the existing precedent for a
  component that needs cross-entity/global information, not just its own
  entity. `Tilemap`'s collision pass and render pass both follow this same
  "dedicated pass in `_update`/`_render`" shape rather than being folded
  into the generic per-component loop.
- **`AnimationRefsField` → `openClipEditor()` →
  `AnimationClipEditorModal.tsx`** (`source/client/src/layout/sections/
  Inspector.tsx:1278-1285, 1417-1496`) — the existing precedent for an
  inspector field that stores a small reference (not the actual authored
  content) and opens a dedicated editor UI on click. The new `tilemapRef`
  field type follows this shape, opening the `tilemap` extension instead of
  an in-app modal.
- **`spritesheet` extension** (`source/extensions/spritesheet/`) — the
  direct structural template for the new `tilemap` extension: self-contained
  frontend reading `?project=`, talking to the main app's generic asset
  REST API to browse existing images, its own small backend `save` route via
  `ctx.resolveProjectAssetPath`, and `postMessage({type:
  "EXTENSION_ASSET_SAVED"})` on completion (already listened for generically
  by `ExtensionsModal.tsx:41-48`).
- **`engine.camera.x/y` + `engine.getViewportSize()`**
  (`source/engine/components/Camera.js`; viewport cached per-frame at
  `source/engine/index.js:271-279`, invalidated at the top of `_update` at
  `index.js:487`) — already the values `SpriteRenderer` uses to offset
  drawing; `Tilemap.render()` reuses the same values to compute which cell
  range is on-screen. Offscreen culling falls directly out of this range
  computation rather than needing a separate culling system.

## Data model

**`<name>.tileset.json`** (sidecar next to an existing image asset):

```json
{
  "image": "dungeonTiles.png",
  "columns": 8,
  "cellWidth": 16,
  "cellHeight": 16,
  "tiles": [
    { "index": 0, "solid": false, "terrainId": "grass" },
    { "index": 1, "solid": true, "terrainId": "wall" }
  ],
  "variantGroups": {
    "grassVariants": { "tiles": [0, 8, 9], "weights": [3, 1, 1] }
  },
  "animations": {
    "waterAnim": { "frames": [12, 13, 14, 15], "fps": 4, "loop": true }
  },
  "autotile": {
    "type": "bitmask4",
    "rules": {
      "grass": { "0": { "variant": "grassVariants" }, "1": 4, "2": 5, "3": 6,
                 "4": 7, "5": 8, "6": 9, "7": 10, "8": 11, "9": 12, "10": 13,
                 "11": 14, "12": 15, "13": 2, "14": 3, "15": 1 },
      "wall": { "0": 16, "1": 20 },
      "water": { "0": { "anim": "waterAnim" } }
    }
  }
}
```

`autotile.type` is forward-compatible: only `"bitmask4"` is implemented now,
but `"wfc"` (matching the roadmap's literal "wave function collapse"
wording) can be added later as a sibling value without touching how
`Tilemap` consumes an already-resolved tile index — the runtime never sees
bitmasks, only final `tileIndex` values (see Runtime below).

### Cell variations & animated tiles

Anywhere a rule table or a cell resolves "what tile goes here," the value is
one of three shapes (a **TileResolver**): a plain `tileIndex` number
(unchanged, existing behavior), `{ "variant": groupId }` (pick one of
`variantGroups[groupId].tiles`, weighted by `weights`, **stably per-cell** —
not re-rolled on every load), or `{ "anim": animId }` (cycles through
`animations[animId].frames` over time). This is the same shape whether it
appears inside `autotile.rules[terrain][bitmask]` (as above) or directly on
an explicit tilemap cell in place of `tileIndex` (e.g. a decoration cell
painted as `{ "variant": "grassVariants" }` with no `terrainId` at all).

Both are resolved from cells in the **tile's own tileset image only** —
per the earlier scope decision, a variant/animation frame is always another
`tileIndex` in the same grid, never a reference to a different asset. This
keeps the single-image-per-tileset invariant intact and means variant/anim
resolution reuses the exact same sheet-slicing math as a plain tile.

Static variant picking is resolved **once, at load time**, via a
deterministic hash of the cell's position (e.g. a small integer hash of
`(layerIndex, x, y)`, weighted by `variantGroups[id].weights`) and baked
straight into the flattened `Int16Array` alongside plain tiles — no extra
render-time cost, and the same cell always resolves to the same variant
across reloads without needing to store which variant was picked. Animated
tiles can't be baked to a single static value; see Runtime below.

**`<name>.tilemap.json`**:

```json
{
  "tileset": "dungeonTiles",
  "width": 60,
  "height": 40,
  "cellWidth": 16,
  "cellHeight": 16,
  "layers": [
    {
      "name": "ground",
      "collision": true,
      "cells": { "3,4": { "terrainId": "wall" }, "3,5": { "terrainId": "grass" } }
    },
    {
      "name": "decoration",
      "collision": false,
      "cells": { "3,4": { "tileIndex": 42 } }
    }
  ]
}
```

Cells are stored **sparse** (dict keyed by `"x,y"`; empty cells are simply
absent) rather than a dense 2D array. This matters for a reason specific to
this codebase, not just memory: the compiler inlines whatever a component's
schema field holds directly into the generated scene script via
`JSON.stringify` (`source/server/manager/ProjectHandler.ts:485-489, 517-523,
552-557`). A dense grid living on the `Tilemap` component itself would bloat
every build; keeping the grid in its own referenced asset (component only
stores a `mapAsset` string key) avoids that entirely, the same reason
`SpriteRenderer` references a spritesheet by key instead of embedding pixel
data.

A cell may specify either `terrainId` (autotile-resolved — the loader
computes its bitmask from same-terrain neighbors at load time and looks up
`tileIndex` from `autotile.rules`) or an explicit `tileIndex` (bypasses
autotiling entirely — used for one-off decoration tiles that aren't part of
a terrain, like the `decoration` layer above).

Per-layer `collision: boolean` is an on/off switch layered on top of each
tile's own `solid` flag from the tileset — e.g. `decoration` never collides
even though tile 42 might be marked solid in some other context. This
satisfies "multiple layers" without needing a second, separate
collision-painting pass (per the earlier decision: collision is a flag on
tile type, not an independently painted layer).

## Asset system integration

**`ProjectHandler.scanAssets`** (`source/server/manager/
ProjectHandler.ts:106-138`): extend the existing sidecar-detection loop
(currently checks for `.spritesheet.json`) to also collect `.tileset.json`
basenames per directory (reclassifies the matching image as type
`"tileset"`), and to recognize standalone `.tilemap.json` files as their own
asset with type `"tilemap"` (no companion image — it references a tileset
by key, same relationship a `.texture.json` has to nothing, versus a
spritesheet's PNG-is-the-asset shape). `Asset["type"]` union grows to
`"image" | "audio" | "texture" | "spritesheet" | "tileset" | "tilemap" |
"other"`; same addition to `AssetEntry` in `source/client/src/api.ts:172-177`.

**`AssetLoader`** (`source/engine/modules/AssetLoader.js`): add a
`"tilemap"` branch to the loader (mirroring `_loadSpritesheet`'s shape) that:
1. Fetches and parses the `.tilemap.json`.
2. Fetches and parses its referenced `.tileset.json`, and loads the
   tileset's image via the existing `_loadImage`.
3. For each layer, walks the sparse `cells` dict once, resolving every
   `terrainId` cell to a TileResolver (computing its 4-bit bitmask from
   same-terrain neighbor lookups in the same dict, then looking it up in
   `autotile.rules`) or taking an explicit cell's TileResolver directly.
   Plain `tileIndex` and `{variant}` values resolve to a concrete index
   immediately (variant picked via the deterministic weighted hash) and are
   written into an `Int16Array(width * height)` initialized to `-1`
   (empty). `{anim}` values write their clip's frame-0 index into the same
   array (a safe fallback) and additionally record `{cellIndex, animId}`
   into a small sparse `animatedCells: Map` for that layer. This is the
   "optimized, not a giant array of entities" requirement — O(1) indexed
   lookup at render/collision time, no per-tile objects or entities, and all
   resolution cost (bitmask, variant hash) is paid once at load, not per
   frame.
4. Also builds a packed collision bitset (one bit per cell, OR'd across only
   the layers with `collision: true`) for O(1) collision queries.
5. Caches `{ layers: [{ name, tiles: Int16Array, animatedCells: Map,
   collision }], collisionBits, tileset: { image, columns, cellWidth,
   cellHeight }, animations }` under the tilemap's asset key.

## Runtime: `Tilemap` component

New file `source/engine/components/Tilemap.js`, registered in
`source/engine/types/DefaultComponents.js` (import + map entry, following
`Layout`'s addition there) and `source/engine/index.js:55-57`'s
registration loop.

```js
static schema = {
  mapAsset: { type: "tilemapRef", default: "", description: "Key of a .tilemap.json asset." },
};
```

- `onSpawn(entity, engine)`: resolves `engine.assets.get(this.mapAsset)`
  (already loaded/flattened by `AssetLoader`, per above) and caches the
  reference on `this._resolved`.
- `onTick(entity, engine, dt)`: only if the resolved map has any
  `animatedCells` at all, accumulates `this._elapsed += dt` — cost is
  skipped entirely for maps with no animated tiles.
- `render(ctx, transform, entity, engine)`: computes the visible cell range
  from `engine.camera.x/y` + `engine.getViewportSize()` and this entity's
  world transform (map origin), clamped to `[0, width) x [0, height)`, then
  for each layer loops **only that sub-range**, drawing each non-`-1` cell
  by slicing the tileset image (`col = index % columns`, `row =
  Math.floor(index / columns)`) — the same sheet-slicing math
  `SpriteRenderer` already uses for spritesheets. For each layer, animated
  cells are looked up via `animatedCells.get(cellIndex)` only for cells
  already in the visible sub-range (still bounded by screen size, not map
  size); the frame index per distinct `animId` seen this render call is
  computed once (`Math.floor(this._elapsed / (1/fps)) % frames.length`, or
  clamped to the last frame if `!loop`, matching `SpriteAnimation`'s
  existing math) and reused for every cell sharing that animation, so cost
  stays proportional to visible cells, not to distinct animations. Cost is
  bounded by screen size in cells, not map size — this is the offscreen
  culling requirement, achieved as a natural consequence of the range
  computation rather than a separate system.
- Collision: new `static checkEntity(tilemapEntity, otherEntity, engine)`,
  called from `_update()` alongside the existing `Collision.checkPair` loop
  (`index.js:524-529`) for every entity carrying a `Collision` component.
  Converts the other entity's world AABB to a cell range (bounded by that
  entity's size, typically a handful of cells — not a map scan), checks the
  packed collision bitset for solid cells in range, and on overlap resolves
  using the same static/resolve rules the existing Collision fix already
  enforces (a resolve-disabled or static-blocked entity does not move at
  all, matching the behavior fixed in `ee31c11`).

## Extension — `source/extensions/tilemap/`

Structurally identical to `spritesheet`:

- `manifest.json`: `{ name: "tilemap", displayName: "Tilemap Editor",
  activation: ["toolbar"], view: { type: "modal", size: "full", entry:
  "index.html" } }`.
- `frontend/index.html` + `frontend/js/{tileset,autotile,paint,layers,
  store}.mjs`, reading `?project=` and an optional `&asset=<tilemapKey>` (to
  jump straight into editing an existing map when launched from the
  inspector's "Edit" button). Reuses the pixel-art/spritesheet extensions'
  existing grid + viewport pan/zoom code as a base for the paint canvas
  rather than rebuilding it.
- `backend/index.js` — `register(router, ctx)` with a `save` route writing
  both `.tileset.json` and `.tilemap.json` via `ctx.resolveProjectAssetPath`
  (same dual-artifact-in-one-call shape `spritesheet`'s backend already
  uses for its PNG + sidecar).

**Workflow**:

1. **Tileset setup**: pick an existing image asset (via the main app's
   generic asset-list API, same as `spritesheet` does today), set
   `columns`/`cellWidth`/`cellHeight`, click tiles to toggle `solid`, group
   tiles into named terrains.
2. **Autotile rule authoring**: per terrain, paint a fixed 16-cell "blob
   sheet" layout once (standard 4-bit corner/edge arrangement) — the
   extension derives the full bitmask→tileIndex table from that single pass
   rather than hand-authoring 16 mappings per terrain. Any one of those 16
   slots (or a plain explicit tile, outside autotiling) can instead be
   assigned a **variant group** (multi-select several tiles, optional
   per-tile weight — reusing the spritesheet clip-panel's "select cells,
   build a named list" interaction) or an **animation** (ordered tile
   sequence + fps + loop, same list-building interaction, one frame's worth
   of preview playback in the editor).
3. **Map painting**: multi-layer canvas — add/remove/reorder/toggle-visible
   layers, brush with a terrain (bitmask auto-computed live from
   already-painted same-terrain neighbors), a variant group, an animation,
   or an explicit tile index; erase; resize map bounds.
4. **Save**: POSTs `{ project, tilesetFilename, tilesetMeta,
   tilemapFilename, tilemapMeta }` to `/api/extensions/tilemap/save`, then
   `window.parent.postMessage({ type: "EXTENSION_ASSET_SAVED" })` (existing
   generic listener in `ExtensionsModal.tsx:41-48` reloads the project so
   the new assets show up immediately).

**Non-goals (v1, explicitly deferred)**:
- Live tile painting directly in the main scene editor canvas — extension
  only, per the earlier scope decision. A stretch item if time allows, not
  committed here.
- Wave Function Collapse autofill — `autotile.type: "wfc"` is a documented
  future slot in the data format, not implemented now.
- Per-cell collision overrides independent of tile type — collision is a
  flag on the tile definition (plus the per-layer on/off switch), not a
  separately painted layer.
- Variant/animation frames pulled from a different asset than the cell's
  own tileset — variants and animations only ever reference other
  `tileIndex` values within the same tileset image (see Cell variations
  above).

## Inspector

New `tilemapRef` field type added to `SchemaField`'s type switch
(`source/client/src/layout/sections/Inspector.tsx:1237-1411`, same tier as
the existing `entity`/`animationRefs`/`code` branches): renders a dropdown
over the project's `"tilemap"`-typed assets, plus an "Edit" button that
opens the `tilemap` extension pre-loaded with `&asset=<currentValue>` —
mirroring `AnimationRefsField`'s "field references an asset, button opens
the dedicated editor" pattern (`Inspector.tsx:1417-1496`) rather than
inlining a painting UI into the inspector itself.

A `Tilemap` entity is otherwise a normal entity: `Transform` (positions the
map's origin) + `Tilemap` component, addable via the existing "Add
Component" flow, draggable/parentable like anything else in the Explorer
tree.

## Testing

Plain Node `.mjs` scripts, following `source/engine/test/follow.test.mjs` /
`layout.test.mjs` (no test framework in this repo):

- `tilemapLoad.test.mjs` — sparse-cells-to-`Int16Array` flattening is
  correct; `terrainId` cells resolve to the right `tileIndex` given a fake
  neighbor layout and rule table; explicit `tileIndex` cells bypass
  autotiling; empty cells stay `-1`; `{variant}` cells resolve to a member
  of the group's `tiles` and the same `(layer, x, y)` always picks the same
  member across repeated loads (determinism), with a distribution check
  over many synthetic cells roughly matching configured `weights`;
  `{anim}` cells bake frame 0 into the array and register in
  `animatedCells`.
- `tilemapRender.test.mjs` — visible cell range computation against a fake
  camera/viewport (off-map camera positions clamp correctly; range size
  matches viewport size, independent of total map size); animated cells
  step frames at the right wall-clock rate for a given `fps`/`speed` and
  loop-vs-clamp per `loop` (mirroring `spriteAnimation.test.mjs`'s existing
  coverage of the same math); cells sharing one `animId` compute the frame
  index once per render call, not once per cell.
- `tilemapCollision.test.mjs` — entity AABB → cell range conversion; solid
  vs. non-solid tiles; per-layer `collision: false` is excluded from the
  bitset; static/resolve-disabled entities do not move on overlap (matching
  existing `Collision` test coverage for the same rule).

## Implementation order

Each step independently testable/demoable, so a partial result the night
this is built is still useful:

1. Data formats + `AssetLoader` loading/flattening + `Tilemap.render()` with
   a hand-written test `.tilemap.json` — a tilemap visibly renders and
   culls in a scene with zero editor UI.
2. `Tilemap.checkEntity` collision pass.
3. Extension: tileset definition + autotile blob authoring.
4. Extension: map painting UI + save.
5. Inspector `tilemapRef` field + "Edit" button wiring.

## Documentation

A changelog entry in `docs/changelogs/` following the `changelog4.md`
template (summary, **File(s):** list, schema tables, data-format prose,
Testing section) once implemented.
