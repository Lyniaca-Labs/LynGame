# Entity API reference

`source/engine/types/Entity.js`, class `Entity`. Never construct one
directly — always via `engine.createEntity(id?)` or
`engine.prefabs.instantiate(name)`, both of which set `entity.engine` for
you (required for components' lifecycle hooks and world-transform
resolution to work).

## Fields

| field | meaning |
|---|---|
| `id` | string, unique within the engine. |
| `components` | `Map<ComponentClass, instance>`. |
| `scripts` | `Function[]` — attached via `attachScript`, called every tick in attach order, signature `(entity, engine, dt)`. |
| `engine` | back-reference to the owning `GameEngine`. `null` until spawned. |
| `state` | `{}` — free-form per-entity bag, e.g. for scripts on the same entity to share data. |
| `prefabName` | set automatically when spawned via `engine.prefabs.instantiate()`; `null` otherwise. |
| `parent` / `children` | hierarchy — see below. |
| `childName` | this entity's addressable name under its parent (for `getChild`/`query` paths); falls back to `id` if never set. |
| `_destroyed` | set `true` the instant `destroy()` runs; used internally to skip a mid-frame-destroyed entity in the rest of that frame's passes. |

## Components

- **`addComponent(ComponentClass, data = {})`** → `this` (chainable).
  Constructs `new ComponentClass(data)`, stores it, and calls its
  `onSpawn(entity, engine)` immediately if the entity is already live
  (`entity.engine` set).
- **`removeComponent(componentRef)`** — fires `onDestroy(entity, engine)`
  first, then removes it. `componentRef` may be the class or its string
  name.
- **`getComponent(componentRef)`** → instance or `undefined`. Accepts
  either the imported class (`getComponent(Transform)`) or a string name
  (`getComponent("Transform")`) — both work identically; string form is
  what scene JSON's `code` hooks and `query()` paths use since they can't
  import classes.
- **`hasComponent(componentRef)`** → `boolean`.
- **`getComponentList()`** → `ComponentClass[]`.

## Hierarchy

- **`addChild(child, name = null)`** → `this`. Sets `child.parent = this`,
  pushes into `this.children`. If `name` given, sets `child.childName`.
  Automatically detaches `child` from any previous parent first. A child
  entity's own `Transform.x/y/rotation` become **relative to this parent's
  world transform** (see below) — it does not need to also be a member of
  some special "children list" elsewhere; being in `entity.children` (and
  having `parent` set) is the entire mechanism.
- **`removeChild(child)`** → `this`.
- **`getChild(path)`** → descendant `Entity` or `undefined`. `path` is
  dot-separated `childName` (or `id` if `childName` was never set)
  segments, e.g. `getChild("hand.card_3")` for a grandchild.
- **`destroy(engine)`** — sets `_destroyed = true`, recursively destroys
  every child via `engine.removeEntity()`, detaches from its own parent,
  fires `onDestroy` on every one of its own components. You normally call
  `engine.removeEntity(id)` instead of this directly (which calls this for
  you and also filters the entity out of `engine.entities`).

## World transform

- **`getWorldTransform(engine)`** → `{x, y, rotation, fixed}` (plain
  object, not the live `Transform` instance) or `null` if this entity has
  no `Transform`. Composes this entity's local `Transform` with every
  ancestor's, walking up the parent chain (skipping any ancestor that
  itself has no `Transform`, rather than breaking the chain). If **this**
  entity's own `Transform.fixed` is `true`, it opts out of inheriting from
  its parent entirely and its local transform is used as-is. Renderers,
  hit-testing, `Camera`, and `Follow` all read this instead of the raw
  `Transform` — always prefer this over reading `getComponent(Transform)`
  directly when you need an entity's true on-screen position.

## Sizing

- **`getDimensions()`** → `{width, height}`. Derived from whichever of
  `SpriteRenderer`/`ShapeRenderer`/`TextRenderer` is present (maxed between
  Sprite/Shape; **overridden**, not maxed, by TextRenderer if present —
  see [TextRenderer gotchas](components/TextRenderer.md)). `{0,0}` if none
  present. Backs `Layout`, `Interactable.autoDimensions`,
  `engine.pickEntityAt`, and `Collision`'s `width:0`/`height:0` auto-derive.

## Query syntax

`entity.query(path)` and the engine-level `engine.query(path)` /
`resolveEntityQuery(entities, path)` share one syntax:

```
"childName"                      -> a descendant Entity
"childName.grandchild"           -> dot-separated path, arbitrary depth
"childName:ComponentName"        -> a component instance on that descendant
"childName:ComponentName.prop"   -> a property value on that component
":ComponentName"                 -> a component on THIS entity (entity.query only)
":ComponentName.prop"            -> a property on THIS entity's component
```

- `entity.query(path)` resolves relative to that entity's own descendants.
- `engine.query(path)` resolves from the root of the whole entity list —
  the first path segment (before any `.` or `:`) is matched against
  **entity ids first** (exact match wins, even if the id itself contains a
  literal `.`), and only falls back to treating it as a child-path segment
  under a root entity if no entity has that exact id.
- Used pervasively for schema fields of type `"entity"` (e.g.
  `Follow.targetId`, `Camera.target`) — you can hand-write these query
  paths directly in scene JSON, or resolve them yourself in scripts with
  `engine.query(...)`.

```js
engine.query("player")                    // the "player" entity
engine.query("player:Movement")           // its Movement component
engine.query("player:Movement.maxSpeed")  // that field's current value
engine.query("hand.card_3:Interactable")  // a grandchild's component
```

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — how/when components' lifecycle hooks get called
- [components/README.md](components/README.md)
