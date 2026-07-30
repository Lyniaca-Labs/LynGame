# Spritesheets — Design

Roadmap item: "Spritesheets" (`docs/ROADMAP.md`) — spritesheet support for
faster card-art iteration than one texture per card, plus a spritesheet
partitioner extension that can combine/split/reorder frames and works
"kinda like animation clips."

## Summary

A new **spritesheet** asset type: a single composited PNG sliced into a
uniform grid of equal-size cells, plus a JSON sidecar naming each cell
("frame") and grouping frames into named, fps-timed playback sequences
("clips"). `SpriteRenderer` learns to draw one named frame out of a
spritesheet instead of always drawing a whole image. A new `SpriteAnimation`
component steps a sibling `SpriteRenderer`'s frame over time by playing a
clip. A new toolbar extension, `spritesheet`, is where sheets are actually
authored: drag loose image assets into grid cells, drag cells to reorder,
name frames, build clips, and save — or split cells back out as individual
image assets.

## Precedent it follows

- **`.texture.json` asset type** (`ProjectHandler.scanAssets`,
  `source/server/manager/ProjectHandler.ts:93-135`) — the existing precedent
  for a non-`image`/`audio` asset type detected by filename convention and
  given special handling in the manifest. Spritesheets follow the same
  "special extension → special type" idea, but inverted: texture's
  `.texture.json` *is* the asset (compiled to `.texture.js`, no companion
  raster file); a spritesheet's `.png` *is* the asset, and
  `.spritesheet.json` is a sidecar that reclassifies it.
- **`engine.animations` / `Animator.clips`** (`source/engine/components/
  Animator.js`, `ProjectHandler.ts:332-356,648-654`) — the existing "named,
  reusable, fps/keyframe-timed sequence resolved at play-time" pattern.
  Spritesheet clips are the frame-based sibling of this, but scoped to live
  inside the spritesheet's own sidecar file rather than a separate global
  registry (see Data Model below for why).
- **`Layout` writing into children's `Transform`** and **`Animator.play()`
  calling `entity.getComponent(track.target)`** — both are precedent for one
  component reaching into another component's fields on tick.
  `SpriteAnimation` does the same thing to a sibling `SpriteRenderer`.
- **Pixel Art Editor extension** (`source/extensions/pixel-art/`) — the
  precedent for an asset-*producing* extension: reads/writes raw PNG bytes
  via `ctx.resolveProjectAssetPath`, saves via its own backend route (not
  the generic asset-import endpoint), and signals completion via
  `postMessage({type: "EXTENSION_ASSET_SAVED"})`, which `ExtensionsModal.tsx`
  already listens for generically.

## Data model

New asset type `"spritesheet"` = two files sharing a basename:

- `<name>.png` — the composited sheet image. Grid layout: `columns` fixed,
  `rows = ceil(frameCount / columns)`, every cell exactly `cellWidth` ×
  `cellHeight`, frame `index` = row-major grid position
  (`row = floor(index / columns)`, `col = index % columns`).
- `<name>.spritesheet.json` — sidecar metadata:

```json
{
  "cellWidth": 32,
  "cellHeight": 32,
  "columns": 4,
  "frames": [
    { "index": 0, "name": "idle_0" },
    { "index": 1, "name": "idle_1" }
  ],
  "clips": {
    "idle": { "frames": ["idle_0", "idle_1"], "fps": 8, "loop": true },
    "walk": { "frames": ["walk_0", "walk_1", "walk_2", "walk_3"], "fps": 10, "loop": true }
  }
}
```

Clips reference frames **by name, not index** — this is what makes dragging
cells around in the partitioner to reorder them safe: reordering changes
`frames[].index` (and thus grid position / compositing order) but never
invalidates a clip, since clips never store an index.

Clips live inside the sheet's own sidecar (not a separate `animations/`
file + global `engine.animations` registry like `Animator`) because a
clip's frame names are only meaningful relative to their own sheet — there's
no cross-sheet reuse case the way one `Animator` clip's property tracks can
apply to different entities. Keeping frames and clips in one file also
means the partitioner is the single tool that authors both, per the earlier
scope decision.

## Asset system integration

**`ProjectHandler.scanAssets`** (`ProjectHandler.ts:93-135`): within each
directory's `walk()` call, first collect the set of `*.spritesheet.json`
basenames present in that directory. Then, per file:
- Skip `*.spritesheet.json` entries entirely (sidecar, not its own asset —
  same treatment `.texture.js` already gets).
- When classifying an image file, if its `nameNoExt` is in that directory's
  spritesheet-sidecar set, type is `"spritesheet"` instead of `"image"`.

`Asset["type"]` union grows to `"image" | "audio" | "texture" | "spritesheet"
| "other"`; same change propagates to `AssetEntry` in
`source/client/src/api.ts:172-177`.

**`AssetLoader`** (`source/engine/modules/AssetLoader.js`): add a
`"spritesheet"` branch to `_loadOne` — loads the PNG via the existing
`_loadImage`, derives the sidecar URL by swapping the image extension for
`.spritesheet.json`, `fetch()`s and parses it, and caches
`{ image, meta }` (as opposed to a bare `Image` for `"image"` assets).
No change to the two-phase `load()` split (texture assets defer until
non-texture assets are cached; spritesheets have no such dependency and
load in the normal first batch).

**Build manifest** (`ProjectHandler.buildMain`, `ProjectHandler.ts:628-631`):
no change needed to the emitted manifest shape — `relativePath` stays the
literal `.png` path (unlike `texture`, which gets rewritten to its compiled
`.js` output); the sidecar path is derived at runtime by `AssetLoader` the
same way it's derived by the build-time validator below.

**Build-time validation**: move the existing
`const assetManifest = ProjectHandler.scanAssets(projectName);` call
(currently `ProjectHandler.ts:628`) earlier in `buildMain`, before entity/
prefab rendering starts, so it's available to a new validation function
during that pass. Add:

```ts
const spritesheetMetaCache = new Map<string, any | null>(); // assetKey -> parsed sidecar, or null
function loadSpritesheetMeta(assetKey: string) { /* reads+parses+caches the sidecar for a "spritesheet"-type asset; null for anything else */ }

function checkSpriteFrameRefs(components: any, location: string) {
  const renderer = components.SpriteRenderer;
  if (!renderer?.sprite) return;
  const meta = loadSpritesheetMeta(renderer.sprite);
  if (!meta) return; // plain image asset — nothing to validate
  if (renderer.frame && !meta.frames.some((f) => f.name === renderer.frame)) {
    throw new Error(`Missing frame "${renderer.frame}" on spritesheet "${renderer.sprite}" (referenced by ${location}).`);
  }
  const clip = components.SpriteAnimation?.clip;
  if (clip && !meta.clips?.[clip]) {
    throw new Error(`Missing clip "${clip}" on spritesheet "${renderer.sprite}" (referenced by ${location}).`);
  }
}
```

Unlike `checkAnimatorClipRefs` (called per-component, inside the
`Object.entries(node.components)` loop, since it only ever needs one
component's own data), `checkSpriteFrameRefs` needs the *whole* entity's
`components` map in one call — `SpriteRenderer.frame` and
`SpriteAnimation.clip` are only meaningful together with the sibling
`SpriteRenderer.sprite`. Call it once per entity/child, right after that
loop, in both `renderEntity` and `renderPrefabChildren`
(`ProjectHandler.ts:421-434` and `444-470`).

## Runtime: `SpriteRenderer`

`source/engine/components/SpriteRenderer.js` gains a `frame` field:

```js
static schema = {
  sprite: { type: "string", default: "", ... }, // unchanged
  frame: { type: "string", default: "", description: "Frame name to draw when `sprite` is a spritesheet. Ignored for plain image assets; empty selects frame index 0." },
  width: { ... }, height: { ... },
};
```

`render()` resolves `engine.assets.get(this.sprite)` once and caches it on
`this._resolved` exactly like today's `this._image` caching. At draw time,
branch on whether the resolved asset has a `.meta` (spritesheet) or is a
bare `Image` (plain asset, unchanged path):

```js
if (asset.meta) {
  const frameDef = asset.meta.frames.find((f) => f.name === this.frame) ?? asset.meta.frames[0];
  const col = frameDef.index % asset.meta.columns;
  const row = Math.floor(frameDef.index / asset.meta.columns);
  ctx.drawImage(
    asset.image,
    col * asset.meta.cellWidth, row * asset.meta.cellHeight, asset.meta.cellWidth, asset.meta.cellHeight,
    -this.width / 2, -this.height / 2, this.width, this.height
  );
} else {
  ctx.drawImage(asset, -this.width / 2, -this.height / 2, this.width, this.height); // unchanged
}
```

The frame lookup re-runs every `render()` call (not cached), matching this
codebase's general "recompute plainly every frame" style (`Layout`,
`Anchor`) rather than adding invalidation tracking — frame counts are small
enough (dozens) that an array `.find()` per draw is not a concern.

## Runtime: `SpriteAnimation` (new component)

`source/engine/components/SpriteAnimation.js` — sibling-driving component,
same shape as `Animator` reaching into a named component via
`entity.getComponent()`:

```js
static schema = {
  clip: { type: "string", default: "", description: "Name of a clip defined in the sibling SpriteRenderer's spritesheet." },
  playing: { type: "boolean", default: true },
  speed: { type: "number", default: 1 },
};
```

`onTick(entity, engine, dt)`: no-ops if `!playing`, if there's no sibling
`SpriteRenderer`, if `SpriteRenderer.sprite` doesn't resolve to a
spritesheet asset, or if `clip` doesn't exist on it. Otherwise accumulates
`elapsed += dt * speed`, derives a frame index from `elapsed` and the
clip's `fps` (`Math.floor(elapsed / (1 / fps))`), wraps modulo
`clip.frames.length` if `loop`, else clamps at the last frame; writes
`renderer.frame = clip.frames[frameIndex]` (a frame **name**, matching
`SpriteRenderer.frame`'s type). Register in
`source/engine/types/DefaultComponents.js` (import + `DEFAULT_COMPONENTS`
map entry), following `Layout`'s addition there.

## Partitioner extension

New toolbar extension at `source/extensions/spritesheet/`, structurally
identical to `pixel-art`/`board`:

- `manifest.json`: `{ name: "spritesheet", displayName: "Spritesheet Editor", activation: ["toolbar"], view: { type: "modal", size: "full", entry: "index.html" } }`.
- `frontend/index.html` + `frontend/js/{grid,frames,clips,composite,store}.mjs`
  (split by concern, mirroring pixel-art's module layout).
- `backend/index.js` — two routes, both using `ctx.resolveProjectAssetPath`
  exactly like pixel-art's `save` route (strip `data:...;base64,`, write raw
  bytes):
  - `POST /save` — body `{ project, filename, dataUrl, meta }`. Writes
    `<filename>.png` (from `dataUrl`) and `<filename>.spritesheet.json`
    (`JSON.stringify(meta)`).
  - `POST /export-frame` — body `{ project, filename, dataUrl }`, one call
    per exported frame. Writes a plain `.png`, indistinguishable from any
    manually-imported image asset.

**Workflow**:

1. On open (`?project=` query param, same as pixel-art), fetch the asset
   list to populate an image picker (source images to drag in) and an
   existing-spritesheet picker (to re-open and edit a previously saved
   sheet — refetches its `.spritesheet.json` via the already-generic
   `GET /api/projects/:project/assets/raw/:filename` route; no new read
   route needed).
2. Header: `cellWidth`, `cellHeight`, `columns` number inputs. Editing an
   existing sheet prefills these and reconstructs the in-memory frame list
   from its sidecar.
3. Grid area: cells laid out in a CSS grid, `columns` wide,
   `ceil(frameCount / columns)` rows tall plus one trailing empty row to
   drop new frames into.
   - Dropping an image asset onto a cell loads its raw bytes, draws it
     cropped/centered into an offscreen `cellWidth`×`cellHeight` canvas, and
     stores `{ name, canvas }` in the in-memory `frames` array at that
     position (auto-named `frame_<n>`, renamable, must stay unique —
     validated client-side before save).
   - Cells are natively draggable among themselves to reorder — this only
     reorders the in-memory `frames` array (= grid position = compositing
     order); safe with respect to clips since those reference frames by
     name (see Data Model).
4. Clips panel: add/remove named clips; each clip has its own drop zone
   where frame thumbnails from the grid are dragged in to append to its
   sequence (order matters, repeats allowed); per-clip `fps` number input
   and `loop` checkbox; sequence entries reorderable/removable.
5. **Save**: composite one canvas sized `columns * cellWidth` ×
   `rows * cellHeight`, `drawImage` every frame's stored canvas at its grid
   position, `toDataURL("image/png")`, POST to `/save` with the sidecar
   `meta` built from `{cellWidth, cellHeight, columns, frames, clips}`.
6. **Split**: multi-select cells, "Export as image asset(s)" posts each
   selected frame's stored canvas to `/export-frame`.

**Non-goals (v1)**: no bin-packing (strictly the uniform grid the user
configures — mixed-size frames aren't supported, per the earlier "grid,
not free-form rects" decision); no in-place pixel editing (Pixel Art
Editor's job, not this extension's); no clip preview/scrubber playback in
the editor itself (plausible small fast-follow, not committed here).

## Inspector

v1 keeps `SpriteRenderer.frame` and `SpriteAnimation.clip` as plain
`"string"`-type schema fields — typed by hand or (for `frame`) same
`text/lyngame-asset`-style drag target plain string fields already get
(`Inspector.tsx:1373-1409`). This matches how `SpriteRenderer.sprite` itself
already works: no dedicated asset-picker field type exists in this codebase
today, so introducing one is out of scope here.

**Explicitly deferred, not committed**: a richer field type (e.g.
`"spriteFrame"`/`"spriteClip"`) that reads the sibling `SpriteRenderer`'s
resolved sheet and offers a real dropdown, analogous to how
`"animationRefs"` reads `projectData.animations` (`Inspector.tsx:1278-1285,
1417-1470`). Would need a small new endpoint or client-side fetch of the
sidecar JSON keyed off the sibling field's current value. Worth doing once
the format has settled from real use.

## Testing

Plain Node `.mjs` scripts, following `source/engine/test/follow.test.mjs` /
`layout.test.mjs` (no test framework in this repo):

- `spriteRenderer.test.mjs` — frame→rect math (index→row/col, missing frame
  name falls back to index 0, plain-image path unaffected) against a fake
  `ctx.drawImage` spy.
- `spriteAnimation.test.mjs` — frame advances at the right wall-clock rate
  for a given `fps`/`speed`; loops vs. clamps at the last frame per `loop`;
  no-ops cleanly when `clip`/sibling `SpriteRenderer`/sheet is missing.

## Documentation

A changelog entry in `docs/changelogs/` following the `changelog4.md`
template (summary, **File(s):** list, schema tables, data-format prose,
Testing section) once implemented.
