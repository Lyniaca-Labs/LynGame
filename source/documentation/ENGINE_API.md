# GameEngine API reference

`source/engine/index.js`, class `GameEngine`. One instance per running
game — created for you by the compiled `main.js`'s `init(engine)` (see
[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md#compiled-output)), or directly
via `new GameEngine(gameContainer, options)` if embedding the engine
yourself.

For entity/component-level APIs see [ENTITY_API.md](ENTITY_API.md). For
`engine.assets`/`engine.audio`/`engine.gui`/`engine.input`/
`engine.prefabs`/`engine.perf` see [modules/README.md](modules/README.md).

## Construction

```js
const engine = new GameEngine(gameContainerElement, { devMode: true, perf: {...} });
```

- `gameContainer`: a DOM element the engine renders into (creates and
  appends its canvas layer(s) here).
- `options.devMode` (default `true`) — flag read by editor tooling; not
  currently branched on elsewhere in engine code.
- `options.perf` — passed through to `PerformanceMonitor`'s constructor.

On construction: registers all [default components](components/README.md),
creates the `"main"` render layer, sets up resize handling, and wires
editor-integration `postMessage` listeners (see
[EDITOR_AND_BUILD.md](EDITOR_AND_BUILD.md) — irrelevant to a standalone
shipped game, only matters while running inside the editor's iframe).

## Top-level fields

| field | meaning |
|---|---|
| `entities` | `Entity[]` — every live top-level **and** child entity (children are also full members of this flat array, not nested-only). |
| `components` | `{ [name]: ComponentClass }` — the registry `registerComponent` writes to. |
| `scenes` | `{ [name]: Scene }`. |
| `currentScene` | name of the active scene, or `null`. |
| `camera` | the active `Camera` **component instance** (not an entity), or `null`. |
| `running` / `paused` | booleans. |
| `state` | `{}` — free-form bag for your own game/script state (score, turn number, whatever). Nothing else in the engine reads or writes it. |
| `assets` / `audio` / `gui` / `input` / `perf` / `prefabs` | the [modules](modules/README.md). |
| `scripts` | `{ [name]: fn }` — see [SCRIPTING.md](SCRIPTING.md). |
| `animations` | `{ [clipName]: clipData }` — see [Animator](components/Animator.md). |
| `layers` | `Layer[]` — see [Layers](#layers) below. |
| `ctx` | a detached offscreen `CanvasRenderingContext2D`, used only for text measurement (`TextRenderer`). |

## Entities

- **`createEntity(id?)`** → `Entity` or `null`. `id` auto-generated
  (`entity_N`) if omitted. Returns `null` (+ `console.error`) if `id`
  already exists. The returned entity is immediately live (`engine` is
  set, pushed into `entities`) — add components to it right away.
- **`removeEntity(id)`** — calls `entity.destroy(engine)` (fires every
  component's `onDestroy`, recursively destroys children) then removes it
  from `entities`. No-op if `id` doesn't exist.
- **`getEntity(id)`** → `Entity` or `undefined`. Linear search.
- **`query(path)`** → see [query syntax](ENTITY_API.md#query-syntax) in
  ENTITY_API.md — same syntax as `Entity.query()`, rooted at the whole
  entity list instead of one entity's descendants.
- **`pickEntityAt(screenX, screenY)`** → topmost `Entity` at that
  screen-space point (by `zIndex`, matching draw order), or `null`.
  Accounts for camera offset and `fixed` transforms. Mainly used by editor
  click-to-select tooling, but usable from game code too (e.g. a custom
  hit-test outside `Interactable`'s per-entity hookup).
- **`getEntityPreview(id, {width=128, height=128, background=null})`** →
  PNG data URL of that one entity rendered in isolation to an offscreen
  canvas (only its `SpriteRenderer`/`ShapeRenderer`, scaled to fit). Safe
  to call anytime (mid-frame, while paused) — never touches the live
  canvas. Exposed as `window.getEntityPreview` for the editor.

## Scenes

- **`registerScene(name, load, cameraId = null)`** — `load: (engine) => void`
  populates the scene (spawn entities, etc). `cameraId`: optional entity id
  to auto-activate as camera after `load` runs, if nothing else already set
  one (see priority order below). Compiler-generated for every file in
  `scenes/`; rarely called by hand.
- **`loadScene(name)`** — tears down every current entity (`onDestroy`
  fires on all of them, `engine.audio.stopAll()` runs first), then calls
  the new scene's `load(engine)`. Camera resolution priority after `load`
  returns:
  1. If `load` itself called `setCamera(...)`, leave it.
  2. Else if the scene was registered with a `cameraId`, use it.
  3. Else auto-detect: first entity in spawn order with a `Camera` component.
- **`setCamera(entityId)`** — looks up the entity, requires it to have a
  `Camera` component, sets `engine.camera` to that component instance.
  Pass a falsy id to clear the camera.

## Layers

- **`newLayer(name, zIndex)`** → `Layer` — creates and appends an
  additional stacked `<canvas>` (absolutely positioned, CSS z-index
  `zIndex`, resized automatically on window resize). **Only the built-in
  `"main"` layer is actually drawn into by the entity/component render
  loop** — extra layers are structurally real but functionally inert
  unless you manually grab their `.ctx` and draw into them yourself (e.g.
  from a script's `onTick`). See [LIMITATIONS.md](LIMITATIONS.md).
- **`getLayer(name)`** → `Layer` or `undefined`.

## Lifecycle

- **`start()`** — begins the `requestAnimationFrame` loop. Idempotent.
- **`stop()`** — stops the loop (`running = false`).
- **`pause()`** / **`unpause()`** / **`togglePause()`** — freezes/resumes
  the update loop (rendering + input's one-frame-reset still run while
  paused; keyboard/mouse *tracking* itself is gated off while paused — see
  [modules/input.md](modules/input.md)). `engine.time` accounts for total
  paused duration (see below).
- **`get time`** → milliseconds elapsed since the engine started, **minus**
  any time spent paused. Not "time since scene load" or "time since some
  entity spawned" — components needing that track their own elapsed
  counters via `dt` (see [Emitter](components/Emitter.md),
  [Animator](components/Animator.md) for examples).

## Scripts & animations registries

- **`registerScript(name, fn)`** / **`callScript(name, ...args)`** — a
  global-by-name script registry, separate from `entity.scripts`
  (per-entity attached scripts). `callScript` looks up and invokes with
  whatever args you pass — used e.g. from an `Interactable.onClick` code
  hook: `engine.callScript("test", "hello")`. See
  [SCRIPTING.md](SCRIPTING.md).
- **`registerAnimation(name, clipData)`** — populates `engine.animations`,
  read by [Animator.play()](components/Animator.md).

## Misc

- **`getViewportSize()`** → `{width, height}` of the game container,
  cached per-frame (invalidated at the start of every `_update`).
- **`registerComponent(name, ComponentClass)`** — `engine.components[name] =
  ComponentClass`. All [default components](components/README.md) are
  registered this way at construction; project-local custom components
  (see [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md#project-local-components))
  get registered the same way by the compiled output.

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — the tick/render loop this all runs inside
- [ENTITY_API.md](ENTITY_API.md)
- [SCRIPTING.md](SCRIPTING.md)
