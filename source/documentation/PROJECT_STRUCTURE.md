# Project structure & file formats

A project lives at `source/projects/<name>/`. Everything under it is
scanned and compiled by the server (`source/server/manager/ProjectHandler.ts`,
`source/server/compiler/build.ts`) into `source/output/<name>/` — see
[EDITOR_AND_BUILD.md](EDITOR_AND_BUILD.md) for the build pipeline itself;
this file documents the **source-side JSON/JS formats you author by hand**
(or the editor authors on your behalf).

```
source/projects/<name>/
  project.lg          # project config — name, start scene, (legacy) asset list
  scenes/*.json        # one file per scene
  prefabs/*.json        # one file per reusable entity template
  animations/*.json     # one file per Animator keyframe clip
  scripts/*.js           # plain scripts; *.lgscript.json + *.lgscript.js pairs = graph-authored scripts
  components/*.js         # project-local custom Component classes (optional)
  assets/                  # images, audio, spritesheets (+ sidecar .spritesheet.json), texture graphs
  .extensions/               # editor-tool data (e.g. the board extension) — excluded from shipped builds
```

## `project.lg`

```json
{ "name": "test", "startScene": "spritesheet_demo", "assets": [] }
```
- `name` — must match the folder name.
- `startScene` — scene name loaded on game start. The editor updates this
  automatically to whatever scene you last had open, so "what scene plays
  first" tracks your own editor navigation unless you set it back
  explicitly.
- `assets` — vestigial/unused by the current asset pipeline (real asset
  discovery is `ProjectHandler.scanAssets()` walking the `assets/` folder
  at build time — you don't hand-list assets here).

## Scene JSON (`scenes/<name>.json`)

```json
{
  "name": "main",
  "entities": [
    {
      "id": "enemy1",
      "prefab": "Enemy",
      "overrides": { "Transform": { "x": 97, "y": 154 }, "children": { "dot": { "ShapeRenderer": { "color": "#dd5fa9" } } } }
    },
    {
      "id": "cam",
      "components": {
        "Transform": { "x": 0, "y": 0, "rotation": 0, "fixed": false },
        "Camera": { "zoom": 1, "offset": { "x": 0, "y": 0 }, "bounds": null, "target": null }
      },
      "scripts": ["visual"]
    },
    { "id": "entity7", "components": { "Transform": {...}, "ShapeRenderer": {...} }, "parentId": "gui" }
  ]
}
```

Each entity object:

| key | meaning |
|---|---|
| `id` | required, unique. |
| `prefab` | optional — if set, the entity is built by instantiating this registered prefab instead of from scratch. |
| `overrides` | only meaningful with `prefab` — same shape as a prefab's own top-level `components`/`children` (see [Prefab JSON](#prefab-json)), merged over the prefab's defaults per-field (shallow per-component merge, not deep). |
| `components` | `{ [ComponentName]: {...schema field values} }` — used standalone (no `prefab`) or **in addition to** a prefab (extra components layered on top of the prefab's own). Field keys must exactly match that component's schema field names. |
| `scripts` | array of script names (see [SCRIPTING.md](SCRIPTING.md)). |
| `parentId` | optional entity id — wires this entity as a child (`addChild`) of that entity. Forward references (a `parentId` naming an entity defined later in the array) are resolved correctly; order in the file doesn't matter. |

Component field values are **plain JSON**, not stringified — a `vector`
field is a real `{x,y}` object, and (as of the `Emitter` component's
`particleTypes` field) a `"json"`-type field is a real array/object, not a
JSON-encoded string.

## Prefab JSON (`prefabs/<Name>.json`)

```json
{
  "components": { "Transform": { "x": 0, "y": 0 }, "ShapeRenderer": { "shape": "rect", "width": 33, "height": 32, "color": "#8e7b7b" } },
  "scripts": [],
  "children": {
    "dot": {
      "components": { "Transform": {...}, "ShapeRenderer": { "shape": "circle", "color": "#685fdd" } },
      "scripts": [],
      "children": {
        "ggg": { "components": { "ShapeRenderer": { "shape": "rect", "color": "#4ca61c" }, "Transform": {...} }, "scripts": [] }
      }
    }
  }
}
```

- File basename (no extension) is the prefab's name, as registered via
  `engine.prefabs.register(name, ...)` and referenced by scene JSON's
  `"prefab"` field or `engine.prefabs.instantiate(name)`.
- `children` nests arbitrarily deep; each child's `Transform.x/y` are
  relative to its **immediate parent** (composed at runtime via
  `getWorldTransform` — see [ENTITY_API.md](ENTITY_API.md#world-transform)).
- Every child is addressable by dotted path from the root
  (`entity.getChild("dot.ggg")`, `engine.query("enemy1.dot.ggg")`).

### Ghost overrides (ad hoc per-instance child tweaks)

A scene entity spawned from a prefab can override specific fields on
specific **nested children** without redefining the whole prefab, via
`overrides.children`, keyed by dotted child path:

```json
"overrides": {
  "Transform": { "x": 97, "y": 154 },
  "children": {
    "dot": { "ShapeRenderer": { "color": "#dd5fa9" } },
    "dot.ggg": { "ShapeRenderer": { "color": "#2e3008" } }
  }
}
```
Each entry is `{ [ComponentName]: {...partial field overrides} }` — merged
shallowly over that child's own component data from the prefab at
instantiate time. You can also attach extra scripts to a specific nested
child this way (`childOverride.scripts`).

## Animation clip JSON (`animations/<clipName>.json`)

Read by [Animator](components/Animator.md). File basename = clip name in
`engine.animations`.

```json
{
  "duration": 2,
  "loop": true,
  "tracks": {
    "anyKey": {
      "target": "Transform",
      "property": "x",
      "keyframes": [{ "time": 0.5, "value": 100, "easing": "linear" }],
      "easing": "linear",
      "mode": "additive"
    }
  }
}
```
- `duration`: seconds, total clip length.
- `loop`: this clip's default (overridable per-call by `Animator.play()`'s `{loop}` option).
- `tracks`: object keyed by an arbitrary id (not read anywhere, just a dict key) — each track animates one property of one component type.
  - `target`: component class name, resolved via `entity.getComponent(target)` at play-time.
  - `property`: the property name on that component instance.
  - `keyframes[].time`: **0–1 fraction of `duration`**, not raw seconds. Don't need to be sorted or start at `time: 0`.
  - `mode: "additive"` (optional): sampled value is added to the property's pre-play value each frame, instead of replacing it. Omit for absolute mode.
- Referenced clip names in a scene/prefab's `Animator.clips` array are
  validated at **build time** — a typo'd/missing clip file throws a build
  error, not a silent runtime no-op.

## Spritesheet JSON (`assets/<name>.spritesheet.json`)

Sidecar file next to an image asset of the same base name
(`blob.png` → `blob.spritesheet.json`), read by
[SpriteRenderer](components/SpriteRenderer.md) and
[SpriteAnimation](components/SpriteAnimation.md).

```json
{
  "cellWidth": 32, "cellHeight": 32, "columns": 4,
  "frames": [{ "index": 0, "name": "idle_0" }, { "index": 1, "name": "idle_1" }],
  "clips": {
    "idle": { "frames": ["idle_0", "idle_1", "idle_2", "idle_3"], "fps": 6, "loop": true }
  }
}
```
- `frames`: every cell in the sheet, `index` = row-major position (using
  `columns` to derive row/col), `name` = arbitrary label referenced by
  `SpriteRenderer.frame` and by `clips[x].frames`.
- `clips`: named frame-sequences for `SpriteAnimation` to play. Referenced
  clip/frame names are validated at build time when both `sprite` and
  `frame`/`clip` are set together on the same component-data object (a
  prefab-instance override that sets only `frame` without also setting
  `sprite` in the same override isn't cross-checked).

## Texture module (`assets/<name>.texture.json` + `.texture.js`)

Procedural textures, built via [`LGTexture`](modules/textures.md). Authored
through the editor's texture node-graph tool as `<name>.texture.json`
(graph source), compiled to `<name>.texture.js` — a real JS module:

```js
import { LGTexture } from "../../engine/index.js";
export function buildTexture(data = {}) {
  const n1 = LGTexture.color(data.size, "#7c3aed");
  const n2 = LGTexture.adjust(n1, data.size, "opacity", 0.3);
  return n2;
}
```
`buildTexture({size, assets})` is called by `AssetLoader` at asset-load
time (`size` hardcoded to `256`, `assets` is the loader's own cache so a
texture can reference other already-loaded assets by key via
`LGTexture.asset(assets, key, size)`). The compiled asset manifest entry
points at the `.js` file, not the `.json` source.

## Asset manifest (generated — not hand-authored)

At build time, `ProjectHandler.scanAssets()` walks `assets/` recursively
and produces `{ [key]: { relativePath, type, size } }`, embedded into the
compiled `main.js` as the argument to `engine.assets.load(...)`. You never
write this by hand:

- **Key** = relative path from `assets/`, extension stripped, `/`-joined
  for subfolders (so nested folders like `assets/icons/card.png` become
  key `"icons/card"`). Duplicate keys (e.g. `card.png` and `card.jpg` in
  the same folder) fail the build.
- **Type** inferred from extension: `.png/.jpg/.jpeg/.gif/.webp` → `"image"`
  (or `"spritesheet"` if a sidecar `.spritesheet.json` exists);
  `.mp3/.wav/.ogg/.m4a` → `"audio"`; `.texture.json` → `"texture"` (manifest
  entry is then rewritten to point at the compiled `.texture.js`); anything
  else → `"other"`. Bare `.texture.js`/`.spritesheet.json` sidecar files
  never get their own separate manifest entry.

## Project-local custom components

Drop a `Component` subclass into `components/<Name>.js`:
```js
import { Component } from "@types/Component.js";
import { Transform } from "@components/Transform.js";

export class Gravity extends Component {
  static schema = { strength: { type: "number", default: 400 } };
  onTick(entity, engine, dt) {
    const t = entity.getComponent(Transform);
    if (t) t.y += this.strength * dt;
    if (engine.time > 5000) engine.removeEntity(entity.id);
  }
}
```
- `@types/` and `@components/` are aliases resolved at build/load time to
  `source/engine/types/` and `source/engine/components/` respectively — use
  them to reach into engine internals (base `Component` class, other
  built-in components) from a project-local file.
- Discovered the same way built-in components are (directory scan +
  dynamic import for schema extraction) — **a project component with the
  same filename as an engine component overrides it** for that project.
- Registered into `engine.components` and usable in scene/prefab JSON
  exactly like a built-in — no separate registration step needed.

## Scripts folder

See [SCRIPTING.md](SCRIPTING.md#casing) for the full naming/casing rules.
Quick summary: `scripts/Foo.js` exporting `function Foo(...)`, or a
`Foo.lgscript.json` + generated `Foo.lgscript.js` pair (graph-authored) —
both referenced identically as `"Foo"` in scene/prefab JSON and both callable
via `engine.callScript("Foo", ...)`.

## Schema field types

Every component's `static schema` field uses one of these `type` values.
This determines both runtime behavior (how the value round-trips through
JSON) and whether/how the editor's Inspector renders an input control for
it:

| `type` | JS value shape | Inspector control |
|---|---|---|
| `number` | number | numeric input |
| `string` / `text` | string | text input (drag-and-drop of an asset key supported) |
| `boolean` | boolean | checkbox |
| `color` | hex string (`"#fff"`) | native color picker |
| `vector` | `{x, y}` | two numeric inputs |
| `select` | string, must match one of `options[].value` | dropdown |
| `entity` | string (query path, see [ENTITY_API.md#query-syntax](ENTITY_API.md#query-syntax)) | text input + datalist of known entity ids |
| `code` | string (raw JS), compiled via `new Function` — see [SCRIPTING.md](SCRIPTING.md#code-schema-fields) | "Add/Edit code" button → modal JS editor |
| `json` | any JSON-serializable value (typically an array of objects) — introduced for [Emitter.particleTypes](components/Emitter.md) | "Edit JSON" button → modal JSON editor |
| `animationRefs` | `string[]` — clip names | chip-list add/remove UI (`Animator.clips` only) |
| `object` | anything | **no Inspector control exists for this type** — declared/settable only by hand-editing the JSON file directly. Currently only used by `Camera.bounds`, which the engine also doesn't read yet (see [LIMITATIONS.md](LIMITATIONS.md)). Don't introduce a new `"object"`-type field expecting it to be editable in the GUI — use `"json"` instead. |

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md), [ENGINE_API.md](ENGINE_API.md)
- [EDITOR_AND_BUILD.md](EDITOR_AND_BUILD.md) — how this all compiles to `source/output/<name>/`
