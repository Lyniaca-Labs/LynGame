# Design: Standard Entity Query, Collision System, Follow Component

2026-07-29. Three connected engine features, designed together because Follow
depends on the query system and both should establish patterns the rest of
the engine follows going forward.

## 1. `engine.query(path)` — the standard entity/component lookup

**Problem:** `Entity.query(path)` already exists (`source/engine/types/Entity.js`)
and supports `child.path`, `:Component`, and `:Component.property` syntax —
but only scoped to one entity's own descendants. There's no engine-level
equivalent, and every cross-entity lookup in the codebase today is bespoke
(`Camera.target`'s own lazy string→entity resolve). There's also a gap:
ad-hoc `parentId`-linked entities (as opposed to prefab-authored children)
aren't path-addressable at all today, because `childName` is only set for
prefab children.

**Design:**

- `GameEngine.query(path)` in `source/engine/index.js`:
  1. Split off an optional `:Component` / `:Component.property` suffix
     (reuse the existing colon-split logic).
  2. Resolve the entity-path portion: try `this.getEntity(entityPath)` as an
     **exact id match first** — entity ids may legitimately contain literal
     dots (e.g. `"enemy1.dot"`), so an exact match always wins over path
     parsing.
  3. If no exact match, split `entityPath` on `.`; the first segment must
     match a root-level entity's id; delegate the remaining segments to that
     entity's existing `getChild()` walk.
  4. If a component suffix was present, delegate to that resolved entity's
     existing `query()` for the component/property part (no need to
     duplicate that logic — `Entity.query()` already does it correctly).
- **Fix `Entity.getChild(path)`** so a child with no `childName` set falls
  back to matching on `entity.id`. This makes `parentId`-linked entities
  (e.g. `entity7` under `gui`) path-addressable the same way prefab children
  are — closing the gap and giving one consistent addressing scheme.
- **Migrate `Camera.target`** to resolve via `engine.query(this.target)`
  instead of its own `getEntity` call. Same behavior, now on the shared
  path, and it gains nested-child targeting for free.
- `engine.query()` is a pure lookup — no caching. Callers decide their own
  caching strategy (Follow will cache the resolved entity, re-resolving only
  if the target string changes).

## 2. Component schema: `"entity"` field type

**Problem:** No schema field type exists for "this field holds a reference
to another entity." `Camera.target` and the new `Follow.targetId` are just
plain strings today, rendered as raw text boxes in the Inspector.

**Design:**

- Add `"entity"` as a recognized schema field `type` (alongside existing
  `"number"`, `"color"`, `"boolean"`, `"string"`, `"vector"`, `"select"`,
  `"code"`, `"animationRefs"`, `"object"` in `source/engine/types/Component.js`
  schemas and the switch in `source/client/src/layout/sections/Inspector.tsx`).
- Stores a query-path string (same syntax `engine.query()` accepts).
- Inspector renders it as a picker/dropdown sourced from the current scene's
  entity tree (reuse the tree-building logic already in `Explorer.tsx`),
  instead of a raw text input. Falls back to free text entry for paths that
  reach into children/components (the dropdown lists root-addressable
  entities; typing extends the path manually).
- `Camera.target` and `Follow.targetId` both adopt `type: "entity"`.

## 3. Collision component

**Problem:** No collision/hit-detection system exists. Precedent to build on:
`Interactable._getBoxWorld`/`_isInside` (world-space AABB from Transform +
`getDimensions()`), `Movement.bounce` (explicitly reserved for this), and
`GameEngine.pickEntityAt` (same box math, editor picking use case).

**Schema** (`source/engine/components/Collision.js`, new file):

| field | type | default | meaning |
|---|---|---|---|
| `group` | string | `"default"` | what this entity IS |
| `collidesWith` | string[] | `[]` | groups this entity interacts with |
| `resolve` | boolean | `false` | if true, overlaps get physically resolved; if false, detection-only (trigger) |
| `isStatic` | boolean | `false` | infinite mass — never moved by resolution |
| `mass` | number | `1` | used for push-apart ratio between two dynamic bodies |
| `width`, `height`, `offsetX`, `offsetY` | number | `0` | explicit hitbox; `0` width/height means derive from `getDimensions()`, mirroring `Interactable` |
| `onCollide` | string (code) | `""` | raw JS source, compiled via `new Function` exactly like `Interactable.onClick`, called as `(self, other, engine) => {}` |

**Detection:** each frame, for every pair of entities that both carry a
`Collision` component where at least one side's `collidesWith` includes the
other's `group`, compute world-space AABBs (same box math as
`Interactable`) and test overlap. On overlap, invoke `onCollide` on both
sides (only on the frame(s) they overlap — no enter/exit event tracking in
this pass, YAGNI).

**Resolution** (when `resolve: true` on at least one side): compute overlap
depth on the axis of minimum penetration, split the push-apart by inverse
mass ratio (`isStatic` = infinite mass = 0 share of the push, other side
absorbs 100%; two dynamic bodies split proportionally to `1/mass`). If the
entity has a `Movement` component, apply restitution using its existing
`bounce` field (reflect velocity component along the resolved axis, scaled
by `bounce`).

**Loop integration** (`source/engine/index.js` `_update`): new explicit
sub-pass after the general Movement/component-tick pass, before the
`Camera.onTick` pass — so collision resolves final positions before
anything reads them this frame (matches the existing rationale for why
Camera already runs in its own later pass).

## 4. Follow component

**Schema** (`source/engine/components/Follow.js`, new file):

| field | type | default | meaning |
|---|---|---|---|
| `targetId` | entity | `""` | query path to the followed entity |
| `mode` | select: `exponential` \| `spring` \| `maxSpeed` | `"exponential"` | smoothing model |
| `roundness` | number | `0.85` | exponential: fraction of gap closed per second. spring: maps to damping ratio. maxSpeed: shapes deceleration near target |
| `stiffness`, `damping` | number | `120`, `14` | only used when `mode === "spring"` |
| `offsetX`, `offsetY` | number | `0` | fixed offset from target's position |
| `axisLock` | select: `"both"` \| `"x"` \| `"y"` | `"both"` | restrict following to one axis |
| `deadzone` | number | `0` | radius within which no movement happens |
| `maxSpeed` | number | `0` | hard cap on movement speed per second; `0` = uncapped |

**Math per mode:**
- `exponential`: `pos += (target - pos) * (1 - roundness^dt)` (dt-independent, matches the shape of the existing `Camera` lazy-follow feel).
- `spring`: standard critically-damped-able spring integrator using `stiffness`/`damping` against `roundness`-derived damping ratio.
- `maxSpeed`: move directly toward target, speed ramped down by `roundness` as distance approaches `deadzone`, capped at `maxSpeed`.

All modes respect `offsetX/offsetY` (added to target position before computing delta), `axisLock` (zero out the locked-out axis's delta), and `deadzone` (skip movement if within radius, all modes).

**Loop integration:** own explicit sub-pass, after Collision resolution,
before `Camera.onTick` — so a followed target's post-collision position is
what gets followed, and Camera can in turn read a Follow-adjusted position
if it's targeting a Follow-driven entity.

## Testing

- Engine-level tests for `engine.query()`: exact dotted-id match, nested
  child path resolution, `:Component` and `:Component.property` suffixes,
  `parentId`-linked (non-prefab) child addressability after the
  `getChild()` fix.
- Engine-level tests for Collision: AABB overlap detection (group/mask
  filtering), resolution push-apart math (static vs. dynamic, mass ratios).
- Manual in-editor scene for Follow feel-tuning across all three modes (no
  automated test for "feel").

## Out of scope (YAGNI)

- Non-AABB collision shapes (circles, polygons) — no precedent anywhere in
  the codebase, everything today is box-based.
- Collision enter/exit event distinction — flat per-frame `onCollide` only.
- Query-by-tag/component ("give me all entities with Collision") — a
  different capability from path-based single-entity lookup; Collision's own
  group/mask filtering covers what's needed for this work.
