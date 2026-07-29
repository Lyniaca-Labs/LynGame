# Changelog 4

2026-07-29. Feature: a standard entity/component query system
(`engine.query()`), a `Collision` component (AABB detection + optional
mass-based resolution), and a `Follow` component (three smoothing modes),
plus the Inspector support to author them.

## `engine.query()` — the standard entity/component lookup

**Design goal, from the request:** every cross-entity lookup in the engine
was bespoke (`Camera.target` did its own `getEntity` call) with no shared
addressing scheme. The goal was one standard way to look up an entity, a
component on it, or a property of that component — `engine.query()` — used
consistently everywhere a component needs to reference something else.

### Query resolution
**Files:** `source/engine/types/Entity.js`, `source/engine/index.js`

`Entity.query(path)` already existed, scoped to one entity's own
descendants (`"icon"`, `"icon:SpriteRenderer"`, `"icon:SpriteRenderer.x"`,
`":Transform.x"`). This adds the engine-level counterpart:

```js
export function resolveEntityQuery(entities, path) {
  // "name", "name.child.subchild", ":Component", ":Component.prop",
  // "name.child:Component.prop"
}
```

exposed as `GameEngine.prototype.query(path)`. Entity ids may legitimately
contain literal dots (e.g. `"enemy1.dot"`, generated for prefab children by
the compiler), so an exact id match on the full entity-path segment always
wins before any dot-splitting is attempted — a query like `"enemy1.dot"`
resolves the entity literally named that, not a child named `"dot"` under
an entity named `"enemy1"`, unless no such entity exists.

`resolveEntityQuery` is a pure function of `(entities, path)` — it doesn't
touch the DOM or any `GameEngine` internals — which is what makes it
possible to unit-test with plain `Entity` instances (see Testing below).

### `getChild()` fix: parentId children are now path-addressable
**File:** `source/engine/types/Entity.js`

Previously, `getChild()` only matched a child's `childName`, which is only
ever set for prefab-authored children. Ad-hoc scene-level `parentId`
children (e.g. `entity7` parented under `gui`) had no `childName` and were
invisible to `getChild`/`query` — only reachable via a flat
`engine.getEntity(id)`. Fixed by falling back to the child's own `id` when
`childName` is unset:

```js
current = current.children.find((c) => (c.childName ?? c.id) === segment);
```

So `"gui.entity7"` now resolves, the same addressing scheme prefab children
already used.

### `Camera.target` migrated
**File:** `source/engine/components/Camera.js`

`Camera`'s own lazy `engine.getEntity(this.target)` resolve is now
`engine.query(this.target)` — same behavior, on the shared path, and it
picks up nested-child targeting for free. Schema field type changed from
`"string"` to the new `"entity"` type (see below).

## `Collision` component
**File:** `source/engine/components/Collision.js` (new)

AABB collision, detection always on, resolution opt-in per component:

| field | meaning |
|---|---|
| `group` | what this entity IS |
| `collidesWith` | comma-separated groups this entity interacts with |
| `resolve` | if true, overlaps get physically resolved (pushed apart); if false, detection-only (trigger) |
| `isStatic` | infinite mass — never moved by resolution |
| `mass` | push-apart ratio between two dynamic bodies |
| `width`/`height`/`offsetX`/`offsetY` | explicit hitbox; `0` width/height derives from `getDimensions()`, mirroring `Interactable` |
| `onCollide` | code string, compiled the same way `Interactable.onClick` is, called as `(entity, other, engine)` |

Detection and resolution both live in `Collision.checkPair(entityA,
entityB, engine)`, a static method the engine loop calls once per unique
pair of collidable entities per frame (not per-entity `onTick`, since
pairwise checks need every *other* entity, not just self). Resolution
pushes apart along the axis of minimum overlap, split by inverse-mass ratio
(`isStatic` = zero share of the push), and applies restitution through
`Movement`'s existing `bounce` field — reflecting velocity only if it was
still heading into the other entity.

## `Follow` component
**File:** `source/engine/components/Follow.js` (new)

Smooth-follows another entity, resolved via `engine.query(this.targetId)`.
Three selectable `mode`s:

- **exponential** (default): `pos += (target - pos) * (1 - roundness^dt)`.
  `roundness` is 0 = instant snap, near 1 = very lazy/floaty — dt-independent,
  same shape regardless of frame rate.
- **spring**: semi-implicit Euler spring-damper driven directly by
  `stiffness`/`damping` fields (mass = 1). `roundness` is unused in this
  mode — the two dedicated fields give more direct control than deriving a
  damping ratio from a single knob would.
- **maxSpeed**: moves toward the target at a capped speed (`maxSpeed`),
  decelerating on approach to `deadzone` with `roundness` shaping the
  ease curve's exponent.

All three modes respect `offsetX`/`offsetY` (fixed offset from target),
`axisLock` (`"both"`/`"x"`/`"y"`), and `deadzone` (skip movement within a
radius of the goal).

## Game loop ordering
**File:** `source/engine/index.js`

Both new components need this frame's *final* positions before they act —
same reasoning that already pulled `Camera` and `Interactable` into their
own explicit passes instead of the generic per-component `onTick` loop.
`Collision` and `Follow` are now excluded from that generic pass too, and
`_update()`'s pass order is:

1. Scripts + every component except Camera/Interactable/Collision/Follow
   (this is where `Movement` resolves velocity/position)
2. **Collision** — detect + resolve overlaps against this frame's final
   Movement-resolved positions
3. **Follow** — reads this frame's post-collision positions
4. Camera — follows this frame's final transform (post-Movement/Collision/Follow)
5. Pointer events (Interactable)
6. Interactable's own `onTick` (hover/hold)

## Inspector: `"entity"` schema field type
**Files:** `source/client/src/api.ts`, `source/client/src/layout/sections/Inspector.tsx`

Added `"entity"` to `ComponentFieldDefinition`'s type union. No server
change was needed — `ProjectHandler.componentSchemas()` already passes
`type: def.type` straight through with no allowlist. `SchemaField` gained a
matching case: a text input with a native `<datalist>` autocomplete sourced
from the current scene's entities (`useSceneEditor().scene.entities`) —
gives autocomplete for root-level entities while still accepting free-typed
paths that reach into children/components. `Camera.target` and
`Follow.targetId` both use it. `onCollide` was also registered in the code
editor's `SCOPE_BY_FIELD` map (`["entity", "other", "engine"]`).

## Testing

No test framework exists anywhere in this repo. `Entity`, `Collision`, and
`Follow` have no DOM dependencies (`GameEngine` does, via `document`/
`window`, so it isn't directly testable), so the new logic is covered by
plain `.mjs` files run directly via `node`, using Node's built-in `assert`:

- `source/engine/test/query.test.mjs` — exact dotted-id match priority,
  nested child resolution, parentId-linked child addressability (the
  `getChild()` fix), `:Component`/`:Component.property` suffixes, missing
  paths resolve to `undefined` rather than throwing.
- `source/engine/test/collision.test.mjs` — group/mask filtering,
  `onCollide` firing on overlap, static-vs-dynamic and equal-mass
  resolution splits, bounce reflection via `Movement.bounce`.
- `source/engine/test/follow.test.mjs` — all three modes, deadzone,
  axisLock, maxSpeed cap.

Added `source/engine/package.json` (`{"type":"module"}`) so these `.js`/
`.mjs` files can be run directly by `node` — previously nothing under
`source/engine` had a governing `package.json`, so Node would have parsed
the engine's ESM `export`/`import` syntax as CommonJS and failed. `test/`
and this new `package.json` are excluded from the engine copy in
`source/server/compiler/build.ts` (same pattern already used to exclude
`.extensions/` from the project copy) so they never ship in a built game.
