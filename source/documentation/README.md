# LynGame engine/framework documentation — index

This folder documents `source/engine/` (the runtime game engine/framework)
and the project conventions for building a game against it. It does
**not** document the editor UI's React internals or general web-dev
concepts — only this engine's own API surface and file formats.

## Read only what the current task needs

This folder is split into many small, focused files on purpose. **Do not
read every file before acting.** Pick the 1-3 files that actually cover
what you're doing, using the table below, and go straight there. A typical
task needs one component doc, maybe one module doc, and nothing else —
not the whole folder.

Rule of thumb:
- Touching/asking about **one specific component** (e.g. "how does
  Collision work") → open only that file in `components/`.
- Touching/asking about **one engine service** (e.g. "how do I play a
  sound") → open only that file in `modules/`.
- Writing a **scene/prefab/animation JSON file by hand** → `PROJECT_STRUCTURE.md`.
- Writing a **script or a `code` field** → `SCRIPTING.md`.
- **"How do I build X gameplay feature"** → check `USE_CASES.md` first —
  it's an index of ready-made recipes with pointers into the specific
  component docs, cheaper than reading multiple component files cold.
- Something seems broken, or a field does nothing → check
  `LIMITATIONS.md` before assuming it's a bug — several fields are
  intentionally unimplemented and documented as such.
- Need the big picture (tick order, entity/component relationship) →
  `ARCHITECTURE.md`, once, when you actually need it — not as a default
  first read for a narrow task.

## File index

| File | Read this for |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | ECS overview, exact per-frame tick/render order, id/casing rules. |
| [ENGINE_API.md](ENGINE_API.md) | The `GameEngine` class: entities, scenes, layers, camera, lifecycle, `engine.state`/`engine.time`. |
| [ENTITY_API.md](ENTITY_API.md) | The `Entity` class: components, hierarchy, `getWorldTransform`, `getDimensions`, the query-path syntax used everywhere. |
| [components/README.md](components/README.md) | Index of all 15 built-in components + a "which component for which job" cheat sheet. Each component also has its own file in `components/`. |
| [modules/README.md](modules/README.md) | Index of the 7 engine-level services (`engine.assets`/`audio`/`gui`/`input`/`prefabs`/`perf`, `LGTexture`). Each has its own file in `modules/`. |
| [SCRIPTING.md](SCRIPTING.md) | Attached `.js` scripts vs `code`-type schema fields, exact parameter lists per hook, casing rules. |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Full project folder layout + every JSON file format (project.lg, scene, prefab, animation clip, spritesheet, texture module, asset manifest) + the schema field type reference. |
| [USE_CASES.md](USE_CASES.md) | Recipes: card-game-specific (hand fanning, drag-to-play, piles, particle bursts) and general per-component use cases. |
| [LIMITATIONS.md](LIMITATIONS.md) | Consolidated list of unimplemented fields, non-obvious behavior, and gotchas — check here before debugging something that might just be a documented gap. |
| [EDITOR_AND_BUILD.md](EDITOR_AND_BUILD.md) | High-level map of the editor/build pipeline/extensions system. Only relevant if modifying the editor or compiler itself — not needed to build a game. |

### `components/` (one file each)

Transform, Movement, Follow, Collision, Interactable, ShapeRenderer,
SpriteRenderer, SpriteAnimation, Animator, TextRenderer, Camera, Anchor,
Layout, Opacity, Emitter. See [components/README.md](components/README.md)
for descriptions of each.

### `modules/` (one file each)

assets (`engine.assets`), audio (`engine.audio`), gui (`engine.gui`),
input (`engine.input`), prefabs (`engine.prefabs`), textures (`LGTexture`),
performance (`engine.perf`). See [modules/README.md](modules/README.md)
for descriptions of each.

## Accuracy note

This documentation was written by reading the actual source
(`source/engine/*`, `source/server/manager/ProjectHandler.ts`,
`source/server/compiler/*`) as of the point it was written, not from specs
or comments alone. If the code has changed since and something here looks
wrong, trust the code — grep for the field/method name to confirm before
relying on a claim here, especially for anything you're about to act on
rather than just reading about (same standard as any other memory/doc:
verify before you build on it).
