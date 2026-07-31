# Architecture

## The shape of it

An **Entity** (`source/engine/types/Entity.js`) is an id + a `Map` of
**Component** instances + optional parent/children. A **Component**
(`source/engine/types/Component.js`) is a small class with a `static
schema` (for data + editor UI) and optional lifecycle methods
(`onSpawn`/`onTick`/`onDestroy`/`render`). The **GameEngine**
(`source/engine/index.js`) owns the flat list of every live entity, runs
the tick/render loop, and hosts the engine-level modules
(`assets`/`audio`/`gui`/`input`/`perf`/`prefabs`). There is no separate
"system" concept — each component's own `onTick`/`render` methods **are**
the systems; the engine just calls them in a fixed order every frame.

Full API details: [ENGINE_API.md](ENGINE_API.md), [ENTITY_API.md](ENTITY_API.md), [components/README.md](components/README.md).

## Component base class

```js
export class Component {
  static schema = {};                          // field defs — see PROJECT_STRUCTURE.md#schema-field-types
  constructor(overrides = {}) { /* copies schema-declared keys from overrides, structuredClone'd defaults otherwise */ }
  onSpawn(entity, engine) {}                    // once, when added to a LIVE entity
  onTick(entity, engine, dt) {}                 // every frame, dt in SECONDS
  onDestroy(entity, engine) {}                  // once, on removeComponent()/entity destroy
  // render(ctx, transform, entity, engine) {}  // NOT on the base class — ad hoc, only if you define it
}
```

Most components just call `super(overrides)` and let the base constructor
copy schema fields. A few (`Movement`, `Transform`) destructure explicit
params instead and call `super()` with none — both patterns work
identically at runtime; the schema declaration is what the editor Inspector
and the `"json"`/`code` field machinery actually depend on, not the
constructor style.

`render` is not part of the `Component` base class — it's duck-typed: the
engine's render loop calls `component.render?.(...)` on **every** component
on every entity, so any component that defines one participates in
drawing (see [Render loop](#render-loop) below).

## Tick order

Every frame, `GameEngine._update(dt)` (`source/engine/index.js`) runs, in
this exact order, against a **snapshot** of `entities` taken at the start
of the frame (so a script that calls `loadScene()`/`removeEntity()`
mid-frame doesn't corrupt the rest of that frame's passes — destroyed
entities are skipped via `_destroyed`, newly-spawned-this-frame entities
simply aren't in the snapshot and start ticking next frame):

1. **Scripts, then every component's `onTick` except `Camera`/
   `Interactable`/`Collision`/`Follow`** — per entity, in that order.
   This is where `Movement`, `Animator`, `SpriteAnimation`, `Emitter`,
   `Anchor`, `Layout`, and any custom/project-local component live. The
   four exceptions are pulled into their own later passes specifically so
   they see this frame's **final** post-Movement positions.
2. **Collision**: `Collision.checkPair()` for every unique pair of
   entities that have a `Collision` component and mutually "want" each
   other (group filtering).
3. **Follow**: reads this frame's post-collision transforms.
4. **Camera**: follows this frame's final transform (post-Movement/
   Collision/Follow).
5. **Pointer events**: drains the frame's input event queue, hit-tests
   against every `Interactable` — edge-triggered (press-start, drag-start/
   drag/drag-end, click).
6. **Interactable's own `onTick`**: hover enter/exit + hold, both
   continuous/time-based, checked against this frame's final transform.

**Implication for writing your own component:** if you need this frame's
fully-resolved position (post-physics, post-collision), read it in
`onTick` as normal — pass 1 already sees whatever Movement did to
`Transform` this same call (each entity's own component `onTick`s run in
Map-insertion order, so a `Movement` added before your component on the
*same* entity resolves first; across *different* entities, all of pass 1
interleaves entity-by-entity, not component-by-component, so don't assume
another entity's Movement has already run this frame — that's exactly why
Collision/Follow/Camera are deferred to their own later passes instead of
just being pass-1 components).

## Render loop

`GameEngine._render()`:

1. Stable-sorts **all** entities (flat, ignoring hierarchy) by
   `Transform.zIndex` ascending — ties keep original array order.
2. For each, resolves `entity.getWorldTransform(engine)` (composed through
   parents) — skips the entity if it has no `Transform`.
3. If it has an `Opacity` component with `value !== 1`, wraps the whole
   step in `ctx.save()`/`globalAlpha`/`ctx.restore()`.
4. Calls `component.render?.(ctx, worldTransform, entity, engine)` on
   **every** component the entity has, in Map order.
5. Only the `"main"` layer is ever drawn to — see
   [ENGINE_API.md#layers](ENGINE_API.md#layers) for the multi-layer caveat.

Renderers (`SpriteRenderer`, `ShapeRenderer`, `TextRenderer`) each
independently subtract the camera's `x`/`y` offset from the transform
**unless** `transform.fixed` is true — this is the mechanism behind
screen-space/HUD entities (see [Anchor](components/Anchor.md)).

## Scene lifecycle

`engine.loadScene(name)`: every current entity is flagged `_destroyed` and
has `onDestroy` fired on all its components (bulk, not per-entity
`removeEntity` calls, for O(n) teardown), `engine.audio.stopAll()` runs
first, then the new scene's `load(engine)` function runs (spawns its own
entities from scratch). See [ENGINE_API.md#scenes](ENGINE_API.md#scenes)
for the camera re-resolution priority that follows.

## Ids and casing

- Entity ids are unique strings, either explicit (scene JSON's `"id"`) or
  auto-generated `` `${prefix}_${n}` `` via `engine._generateId(prefix)`.
- Component names used in scene/prefab JSON (`"components": {"Transform":
  {...}}`) and in string-based lookups (`getComponent("Transform")`) must
  match the exported class name **exactly**, case-sensitive.
- Script filenames are the canonical casing — see
  [SCRIPTING.md](SCRIPTING.md#casing) for the build-time enforcement.

## See also

- [ENGINE_API.md](ENGINE_API.md), [ENTITY_API.md](ENTITY_API.md)
- [SCRIPTING.md](SCRIPTING.md) — how scripts/`code` fields hook into this
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — how JSON on disk becomes this at runtime
