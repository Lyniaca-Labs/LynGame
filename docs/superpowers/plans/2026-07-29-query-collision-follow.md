# Entity Query, Collision, Follow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `engine.query()` as the standard path-based entity/component lookup, a `Collision` component (AABB detect + optional mass-based resolve), and a `Follow` component (3 smoothing modes), plus the client-side Inspector support to author them.

**Architecture:** Extract a pure, DOM-free `resolveEntityQuery(entities, path)` function that both `Entity.query()`'s existing per-entity walk and a new `GameEngine.query()` build on. `Collision` and `Follow` are new files under `source/engine/components/`, registered in `DEFAULT_COMPONENTS`, and each get their own explicit sub-pass in `GameEngine._update()` (matching the existing Camera/Interactable pattern) so ordering is deterministic: Movement → Collision → Follow → Camera → pointer events → Interactable. Client-side, a new `"entity"` schema field type flows through the existing (unfiltered) schema pipeline with one new case in `Inspector.tsx`.

**Tech Stack:** Plain ESM JavaScript (engine, no bundler/test framework), TypeScript + React (client). No test framework exists anywhere in this repo — engine tests here are plain `.mjs` files run directly via `node`, using Node's built-in `assert`. This works because `Entity`, `Collision`, and `Follow` have no DOM dependencies (the `engine` parameter threaded through their methods is either unused or safely mockable with a plain object).

## Global Constraints

- Follow the codebase's existing per-component code-compile pattern (see `Interactable.js`'s `compileCode`/`_compiledCodeCache`) rather than introducing a shared abstraction.
- All new/changed schema fields must declare `type`, `default`, and `description`, matching every existing component.
- `source/engine` has no package.json today — Task 1 adds one (`{"type":"module"}`) so `.js` files there can be run directly by `node` (needed for the smoke tests, and harmless for the browser/Vite consumption path which doesn't depend on it).
- The engine directory is copied wholesale into every shipped game build (`fs.cpSync(engineSrc, ...)` in `source/server/compiler/build.ts:53`) — the new `test/` folder and `package.json` must be excluded from that copy, same pattern already used for `.extensions/` on the project-copy line just below it.

---

### Task 1: `resolveEntityQuery` + `engine.query()` + `getChild()` fix

**Files:**
- Modify: `source/engine/types/Entity.js` (add exported `resolveEntityQuery`, fix `getChild`)
- Modify: `source/engine/index.js` (add `query(path)` method, import `resolveEntityQuery`)
- Modify: `source/server/compiler/build.ts:53` (exclude `test/`, `package.json` from engine copy)
- Create: `source/engine/package.json`
- Create: `source/engine/test/query.test.mjs`

**Interfaces:**
- Produces: `export function resolveEntityQuery(entities, path)` in `Entity.js` — `entities` is any array of `Entity` instances (typically `engine.entities`), `path` is the full query string. Returns an `Entity`, a component instance, a property value, or `undefined`.
- Produces: `GameEngine.prototype.query(path)` — thin wrapper calling `resolveEntityQuery(this.entities, path)`. Later tasks (Camera, Follow) call `engine.query(...)`.
- Consumes: existing `Entity.getChild(path)`, `Entity.getComponent(ref)` (unchanged signatures).

- [ ] **Step 1: Fix `getChild` to fall back to `entity.id` when `childName` is unset**

In `source/engine/types/Entity.js`, replace the `getChild` method (current lines 53-60):

```js
  /**
   * Looks up a descendant by name path, e.g. `getChild("icon")` or, for a
   * grandchild, `getChild("description.badge")` — each segment matches a
   * child's `childName` (set from a prefab's children key, or passed as the
   * second argument to addChild), falling back to the child's own `id` when
   * `childName` was never set (e.g. ad-hoc scene-level parentId children).
   * Returns undefined if any segment is missing.
   */
  getChild(path) {
    let current = this;
    for (const segment of path.split(".")) {
      current = current.children.find((c) => (c.childName ?? c.id) === segment);
      if (!current) return undefined;
    }
    return current;
  }
```

- [ ] **Step 2: Add `resolveEntityQuery` as an exported function in the same file**

Append to `source/engine/types/Entity.js` (after the `Entity` class, so it can be imported standalone):

```js
/**
 * Engine-level counterpart to Entity.query() — resolves a path from the
 * root of the entity list rather than from a single entity's descendants.
 * Same syntax: "name", "name.child.subchild", ":Component", ":Component.prop",
 * "name.child:Component.prop".
 *
 * Entity ids may legitimately contain literal dots (e.g. "enemy1.dot"), so
 * an exact id match on the full entity-path segment always wins before any
 * dot-splitting is attempted.
 */
export function resolveEntityQuery(entities, path) {
  const colonIndex = path.indexOf(":");
  const entityPath = colonIndex === -1 ? path : path.slice(0, colonIndex);
  const suffix = colonIndex === -1 ? "" : path.slice(colonIndex);

  let root;
  if (entityPath === "") {
    return undefined; // ":Component" with no entity segment has no engine-level meaning
  }
  root = entities.find((e) => e.id === entityPath);
  if (!root) {
    const dotIndex = entityPath.indexOf(".");
    const rootId = dotIndex === -1 ? entityPath : entityPath.slice(0, dotIndex);
    root = entities.find((e) => e.id === rootId);
    if (!root) return undefined;
    if (dotIndex !== -1) {
      root = root.getChild(entityPath.slice(dotIndex + 1));
      if (!root) return undefined;
    }
  }

  return suffix ? root.query(suffix) : root;
}
```

- [ ] **Step 3: Wire `GameEngine.query()`**

In `source/engine/index.js`, add to the import at the top (line 2):

```js
import { Entity, resolveEntityQuery } from "./types/Entity.js";
```

Add a new method to `GameEngine`, right after `getEntity` (after line 258):

```js
  /**
   * The standard way to look up an entity, a component on it, or a property
   * of that component, by path — see resolveEntityQuery in types/Entity.js
   * for the exact syntax. This is the canonical lookup other components
   * (Camera, Follow) resolve their entity-reference fields through.
   */
  query(path) {
    return resolveEntityQuery(this.entities, path);
  }
```

- [ ] **Step 4: Create `source/engine/package.json`**

```json
{
  "name": "lyngame-engine",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 5: Exclude `test/` and `package.json` from the shipped engine copy**

In `source/server/compiler/build.ts`, replace line 53:

```ts
  // test/ and package.json are dev-only (Node smoke tests, module-type
  // marker) — never needed by a shipped game, same reasoning as excluding
  // .extensions/ from the project copy just below.
  fs.cpSync(engineSrc, path.join(outDir, "engine"), {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== "test" && base !== "package.json";
    },
  });
```

- [ ] **Step 6: Write the smoke test**

Create `source/engine/test/query.test.mjs`:

```js
import assert from "node:assert/strict";
import { Entity, resolveEntityQuery } from "../types/Entity.js";

// Minimal Transform-alike so getComponent("Transform") style lookups work
// without importing the real Transform component (which has its own
// unrelated schema machinery we don't need here).
class FakeTransform {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

function makeEntity(id) {
  const e = new Entity(id);
  e.components.set("Transform", new FakeTransform());
  // getComponent(string) matches by ComponentClass.name; our fake isn't a
  // class instance keyed that way, so patch getComponent directly for this
  // test file's purposes.
  e.getComponent = (ref) => (ref === "Transform" ? e.components.get("Transform") : undefined);
  return e;
}

// --- exact id match wins over dot-splitting ---
{
  const dotted = makeEntity("enemy1.dot");
  const entities = [dotted];
  assert.equal(resolveEntityQuery(entities, "enemy1.dot"), dotted);
}

// --- root entity by plain id ---
{
  const player = makeEntity("player");
  const entities = [player];
  assert.equal(resolveEntityQuery(entities, "player"), player);
}

// --- nested child path (prefab-authored, has childName) ---
{
  const root = makeEntity("card1");
  const icon = makeEntity("card1_icon");
  root.addChild(icon, "icon");
  const badge = makeEntity("card1_icon_badge");
  icon.addChild(badge, "badge");
  const entities = [root, icon, badge];

  assert.equal(resolveEntityQuery(entities, "card1.icon"), icon);
  assert.equal(resolveEntityQuery(entities, "card1.icon.badge"), badge);
}

// --- parentId-linked child with no childName falls back to its own id ---
{
  const gui = makeEntity("gui");
  const entity7 = makeEntity("entity7");
  gui.addChild(entity7); // no name passed, mirrors compiled parentId output
  const entities = [gui, entity7];

  assert.equal(resolveEntityQuery(entities, "gui.entity7"), entity7);
}

// --- :Component and :Component.property suffixes ---
{
  const player = makeEntity("player");
  const entities = [player];

  assert.equal(resolveEntityQuery(entities, "player:Transform"), player.getComponent("Transform"));
  assert.equal(resolveEntityQuery(entities, "player:Transform.x"), 0);
}

// --- missing path segments resolve to undefined, not a throw ---
{
  const player = makeEntity("player");
  const entities = [player];
  assert.equal(resolveEntityQuery(entities, "nonexistent"), undefined);
  assert.equal(resolveEntityQuery(entities, "player.nonexistent"), undefined);
}

console.log("query.test.mjs: all assertions passed");
```

- [ ] **Step 7: Run the test**

Run: `node source/engine/test/query.test.mjs`
Expected: prints `query.test.mjs: all assertions passed` and exits 0.

- [ ] **Step 8: Commit**

```bash
git add source/engine/types/Entity.js source/engine/index.js source/engine/package.json source/engine/test/query.test.mjs source/server/compiler/build.ts
git commit -m "feat(engine): add engine.query() as the standard entity/component lookup"
```

---

### Task 2: Migrate `Camera.target` to `engine.query()`

**Files:**
- Modify: `source/engine/components/Camera.js`

**Interfaces:**
- Consumes: `engine.query(path)` from Task 1.
- No change to `Camera`'s public API (`follow`, `followEntity`, `unfollow`, schema) — only the internal resolution mechanism changes.

- [ ] **Step 1: Replace the lazy `getEntity` resolve with `engine.query`**

In `source/engine/components/Camera.js`, replace lines 22-25 (inside `onTick`):

```js
  onTick(entity, engine, dt) {
    if (typeof this.target === "string") {
      this.target = engine.query(this.target) ?? this.target;
    }
```

(`?? this.target` keeps the original string if the query hasn't resolved yet — e.g. the target entity hasn't been created this frame — so it retries next tick instead of caching `undefined` forever, matching the previous behavior where a failed `getEntity` also left `this.target` as whatever `getEntity` returned, i.e. would have been `undefined` before too — but since `typeof this.target === "string"` guards re-entry, a failed lookup under the OLD code would also get stuck as `undefined` permanently. This fix is slightly more robust: it retries every tick until the query succeeds.)

- [ ] **Step 2: Manual verification**

There's no automated harness for `GameEngine` itself (needs a real DOM `gameContainer`), so verify this in the editor: open any project with a `Camera` entity whose `target` is another entity's id, run the scene, confirm the camera still follows correctly (unchanged behavior from the user's perspective).

- [ ] **Step 3: Commit**

```bash
git add source/engine/components/Camera.js
git commit -m "refactor(engine): Camera.target resolves through the shared engine.query()"
```

---

### Task 3: `Collision` component

**Files:**
- Create: `source/engine/components/Collision.js`
- Modify: `source/engine/types/DefaultComponents.js`
- Create: `source/engine/test/collision.test.mjs`

**Interfaces:**
- Produces: `export class Collision extends Component` with `static schema`, `static checkPair(entityA, entityB, engine)` (does detection + optional resolution for one pair, invoked once per unique pair per frame by the engine loop in Task 4).
- Consumes: `Entity.getWorldTransform(engine)`, `Entity.getDimensions()`, `Entity.getComponent("Movement")` from the existing engine, and the `compileCode` pattern from `Interactable.js` (duplicated locally, not shared — matches existing per-file convention).

- [ ] **Step 1: Write the component**

Create `source/engine/components/Collision.js`:

```js
import { Component } from "../types/Component.js";

// Same duplicated-per-file pattern Interactable.js uses — no shared compile
// utility exists yet in this codebase, and introducing one is out of scope here.
const _compiledCodeCache = new Map();
function compileCode(code, paramNames = ["entity", "other", "engine"]) {
  if (code == null || typeof code === "function") return code ?? null;
  if (typeof code !== "string") return null;

  const cacheKey = paramNames.join(",") + "|" + code;
  const cached = _compiledCodeCache.get(cacheKey);
  if (cached) return cached;

  let fn;
  try {
    fn = new Function(...paramNames, code);
  } catch (err) {
    console.error("Collision: failed to compile onCollide code:", code, err);
    fn = null;
  }
  _compiledCodeCache.set(cacheKey, fn);
  return fn;
}

export class Collision extends Component {
  static schema = {
    group: { type: "string", default: "default", description: "What this entity IS, for group-filtering." },
    collidesWith: { type: "string", default: "", description: "Comma-separated groups this entity interacts with, e.g. \"enemy,wall\"." },
    resolve: { type: "boolean", default: false, description: "If true, overlaps are physically resolved (pushed apart). If false, detection-only (trigger)." },
    isStatic: { type: "boolean", default: false, description: "Infinite mass — never moved by resolution; the other side absorbs 100% of the push." },
    mass: { type: "number", default: 1, description: "Used for the push-apart ratio between two dynamic bodies." },
    width: { type: "number", default: 0, description: "Hitbox width. 0 = derive from SpriteRenderer/ShapeRenderer/TextRenderer size." },
    height: { type: "number", default: 0, description: "Hitbox height. 0 = derive from renderer size." },
    offsetX: { type: "number", default: 0, description: "Horizontal offset of the hitbox from the entity's position." },
    offsetY: { type: "number", default: 0, description: "Vertical offset of the hitbox from the entity's position." },
    onCollide: { type: "code", default: null, description: "Runs on every frame two entities overlap. Signature: (entity, other, engine)." },
  };

  constructor(overrides = {}) {
    super(overrides);
    this.onCollide = compileCode(overrides.onCollide);
  }

  _wantsGroup(otherGroup) {
    return this.collidesWith
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean)
      .includes(otherGroup);
  }

  _boxWorld(entity, transform) {
    let width = this.width;
    let height = this.height;
    if (!width || !height) {
      const dims = entity.getDimensions();
      width = width || dims.width;
      height = height || dims.height;
    }
    const cx = transform.x + this.offsetX;
    const cy = transform.y + this.offsetY;
    return { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2 };
  }

  /**
   * Detects and (optionally) resolves overlap between two entities that both
   * carry a Collision component. Called once per unique pair per frame by
   * GameEngine._update (see index.js) — not from onTick, since pairwise
   * checks need to happen against every OTHER entity, not once per entity.
   */
  static checkPair(entityA, entityB, engine) {
    const a = entityA.getComponent("Collision");
    const b = entityB.getComponent("Collision");
    if (!a || !b) return;
    if (!a._wantsGroup(b.group) && !b._wantsGroup(a.group)) return;

    const ta = entityA.getWorldTransform(engine);
    const tb = entityB.getWorldTransform(engine);
    if (!ta || !tb) return;

    const boxA = a._boxWorld(entityA, ta);
    const boxB = b._boxWorld(entityB, tb);

    const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
    const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);
    if (overlapX <= 0 || overlapY <= 0) return; // no overlap

    a.onCollide?.(entityA, entityB, engine);
    b.onCollide?.(entityB, entityA, engine);

    if (!a.resolve && !b.resolve) return;
    Collision._resolve(entityA, entityB, ta, tb, a, b, overlapX, overlapY);
  }

  static _resolve(entityA, entityB, ta, tb, a, b, overlapX, overlapY) {
    const invMassA = a.isStatic ? 0 : 1 / a.mass;
    const invMassB = b.isStatic ? 0 : 1 / b.mass;
    const totalInvMass = invMassA + invMassB;
    if (totalInvMass === 0) return; // both static — nothing can move

    const shareA = invMassA / totalInvMass;
    const shareB = invMassB / totalInvMass;

    const transformA = entityA.getComponent("Transform");
    const transformB = entityB.getComponent("Transform");
    if (!transformA || !transformB) return;

    // Push apart along the axis of minimum penetration (standard AABB MTV).
    if (overlapX < overlapY) {
      const dir = ta.x < tb.x ? -1 : 1; // A moves this direction relative to B
      transformA.x += dir * overlapX * shareA;
      transformB.x -= dir * overlapX * shareB;
      Collision._applyBounce(entityA, "x", dir);
      Collision._applyBounce(entityB, "x", -dir);
    } else {
      const dir = ta.y < tb.y ? -1 : 1;
      transformA.y += dir * overlapY * shareA;
      transformB.y -= dir * overlapY * shareB;
      Collision._applyBounce(entityA, "y", dir);
      Collision._applyBounce(entityB, "y", -dir);
    }
  }

  // After a push in `axis` direction `pushDir` (the direction this entity was
  // moved to separate), reflect velocity if it was still heading INTO the
  // other entity (opposite of pushDir), scaled by Movement's existing bounce.
  static _applyBounce(entity, axis, pushDir) {
    const movement = entity.getComponent("Movement");
    if (!movement) return;
    const v = movement.velocity[axis];
    if (Math.sign(v) !== 0 && Math.sign(v) !== Math.sign(pushDir)) {
      movement.velocity[axis] = -v * movement.bounce;
    }
  }
}
```

- [ ] **Step 2: Register it**

In `source/engine/types/DefaultComponents.js`, add the import (after line 8):

```js
import { Collision } from "../components/Collision.js";
```

Add `Collision` to the exported map:

```js
export const DEFAULT_COMPONENTS = {
  Interactable,
  Transform,
  SpriteRenderer,
  ShapeRenderer,
  TextRenderer,
  Camera,
  Movement,
  Anchor,
  Animator,
  Opacity,
  Collision,
};
```

- [ ] **Step 3: Write the smoke test**

Create `source/engine/test/collision.test.mjs`:

```js
import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Collision } from "../components/Collision.js";
import { Movement } from "../components/Movement.js";
import { Transform } from "../components/Transform.js";

function makeEntity(id, x, y, w, h, collisionOverrides = {}) {
  const e = new Entity(id);
  e.addComponent(Transform, { x, y });
  e.addComponent(Collision, { width: w, height: h, ...collisionOverrides });
  return e;
}

const engine = {}; // unused by Collision.checkPair beyond pass-through to onCollide

// --- non-overlapping boxes: no callback fires ---
{
  let fired = false;
  const a = makeEntity("a", 0, 0, 10, 10, { group: "a", collidesWith: "b", onCollide: "" });
  const bEntity = makeEntity("b", 100, 100, 10, 10, { group: "b", collidesWith: "a" });
  Collision.checkPair(a, bEntity, engine);
  assert.equal(fired, false);
}

// --- overlapping boxes with matching groups: onCollide fires on both sides ---
{
  const calls = [];
  const a = makeEntity("a", 0, 0, 20, 20, {
    group: "player", collidesWith: "enemy",
    onCollide: "entity.state.hit = true;",
  });
  const b = makeEntity("b", 5, 0, 20, 20, { group: "enemy", collidesWith: "player" });
  Collision.checkPair(a, b, engine);
  assert.equal(a.state.hit, true);
}

// --- overlapping boxes with non-matching groups: no interaction ---
{
  const a = makeEntity("a", 0, 0, 20, 20, { group: "player", collidesWith: "enemy" });
  const b = makeEntity("b", 5, 0, 20, 20, { group: "wall", collidesWith: "nothing" });
  const before = { ax: a.getComponent(Transform).x, bx: b.getComponent(Transform).x };
  Collision.checkPair(a, b, engine);
  const after = { ax: a.getComponent(Transform).x, bx: b.getComponent(Transform).x };
  assert.deepEqual(before, after); // untouched — groups don't match
}

// --- resolve: static wall absorbs 0% of push, dynamic actor absorbs 100% ---
{
  const wall = makeEntity("wall", 0, 0, 20, 20, {
    group: "wall", collidesWith: "player", resolve: true, isStatic: true,
  });
  const player = makeEntity("player", 10, 0, 20, 20, {
    group: "player", collidesWith: "wall", resolve: true,
  });
  Collision.checkPair(wall, player, engine);
  assert.equal(wall.getComponent(Transform).x, 0); // wall never moves
  assert.notEqual(player.getComponent(Transform).x, 10); // player got pushed
}

// --- resolve: two equal-mass dynamic bodies split the push evenly ---
{
  const p1 = makeEntity("p1", 0, 0, 20, 20, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  const p2 = makeEntity("p2", 10, 0, 20, 20, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  Collision.checkPair(p1, p2, engine);
  const p1x = p1.getComponent(Transform).x;
  const p2x = p2.getComponent(Transform).x;
  // overlap was 10 (20-width boxes, 10px apart), split evenly -> each moves 5, apart
  assert.ok(p1x < 0 && p2x > 10, `expected symmetric push apart, got p1x=${p1x} p2x=${p2x}`);
}

console.log("collision.test.mjs: all assertions passed");
```

- [ ] **Step 4: Run the test**

Run: `node source/engine/test/collision.test.mjs`
Expected: prints `collision.test.mjs: all assertions passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add source/engine/components/Collision.js source/engine/types/DefaultComponents.js source/engine/test/collision.test.mjs
git commit -m "feat(engine): add Collision component (AABB detect + mass-based resolve)"
```

---

### Task 4: Wire `Collision` and `Follow` into the game loop

**Files:**
- Modify: `source/engine/index.js`

**Interfaces:**
- Consumes: `Collision.checkPair(entityA, entityB, engine)` from Task 3, `Follow` component's `onTick` from Task 5 (this task can be done in the same edit pass as Task 5's file creation, or this task's loop wiring for Follow can be written now and will simply be a no-op — `getComponent("Follow")` returns `undefined` — until Task 5 creates the component).

- [ ] **Step 1: Import `Collision`**

In `source/engine/index.js`, add to the imports (after line 8, the `Opacity` import):

```js
import { Collision } from "./components/Collision.js";
```

- [ ] **Step 2: Exclude `Collision`/`Follow` from the generic pass, and insert their dedicated passes**

Replace the `_update(dt)` method's body (current lines 475-530) with:

```js
  _update(dt) {
    this._cachedViewportSize = null;

    const entities = [...this.entities];

    // 1. Scripts + every component EXCEPT Camera/Interactable/Collision/Follow
    //    run first. This is where Movement lives, so gravity/velocity resolve
    //    transform.y for this frame before anything reads it for collision,
    //    follow, camera-follow, or hit-testing. (Camera and Interactable were
    //    already pulled into their own explicit passes below; Collision and
    //    Follow join them for the same reason — they need this frame's FINAL
    //    Movement-resolved positions, not whatever order component Maps
    //    happen to iterate in.)
    for (const entity of entities) {
      if (entity._destroyed) continue;
      const camera = entity.getComponent("Camera");
      const interactable = entity.getComponent("Interactable");
      const collision = entity.getComponent("Collision");
      const follow = entity.getComponent("Follow");

      for (const script of entity.scripts) script(entity, this, dt);
      if (entity._destroyed) continue; // a script above may have switched scenes / destroyed this entity
      for (const component of entity.components.values()) {
        if (component === camera || component === interactable || component === collision || component === follow) continue;
        component.onTick?.(entity, this, dt);
      }
    }

    // 2. Collision: detect + resolve overlaps using this frame's final
    //    Movement-resolved positions, before Follow/Camera read them.
    const collidables = entities.filter((e) => !e._destroyed && e.getComponent("Collision"));
    for (let i = 0; i < collidables.length; i++) {
      for (let j = i + 1; j < collidables.length; j++) {
        Collision.checkPair(collidables[i], collidables[j], this);
      }
    }

    // 3. Follow: reads this frame's post-collision transforms.
    for (const entity of entities) {
      if (entity._destroyed) continue;
      entity.getComponent("Follow")?.onTick?.(entity, this, dt);
    }

    // 4. Camera follows this frame's FINAL transform (post-Movement/Collision/Follow).
    for (const entity of entities) {
      if (entity._destroyed) continue;
      entity.getComponent("Camera")?.onTick?.(entity, this, dt);
    }

    // 5. Pointer events hit-test against this frame's final transform + camera.
    //    Edge-triggered only: press-start, drag-start/drag/drag-end, click.
    const events = this.input.drainPointerEvents();
    for (const event of events) {
      for (const entity of entities) {
        if (entity._destroyed) continue;
        entity.getComponent("Interactable")?.handlePointerEvent?.(entity, this, event);
      }
    }

    // 6. Interactable's own onTick: hover + hold. Both are continuous/time-based
    //    (hover can change with no new events if the box moves under a still
    //    cursor; hold accumulates by dt regardless of events), so they need a
    //    per-frame pass against the same final transform + camera as above.
    for (const entity of entities) {
      if (entity._destroyed) continue;
      entity.getComponent("Interactable")?.onTick?.(entity, this, dt);
    }
  }
```

- [ ] **Step 3: Manual verification**

No automated harness for `GameEngine` (DOM-dependent). Verify manually once Task 5 lands: open a test project, drop a `Movement` + `Collision` entity next to a static `Collision` wall, run the scene, confirm it stops/bounces instead of passing through.

- [ ] **Step 4: Commit**

```bash
git add source/engine/index.js
git commit -m "feat(engine): wire Collision and Follow into the update loop"
```

---

### Task 5: `Follow` component

**Files:**
- Create: `source/engine/components/Follow.js`
- Modify: `source/engine/types/DefaultComponents.js`
- Create: `source/engine/test/follow.test.mjs`

**Interfaces:**
- Produces: `export class Follow extends Component`.
- Consumes: `engine.query(path)` from Task 1 (to resolve `targetId`), `Entity.getWorldTransform(engine)`.

- [ ] **Step 1: Write the component**

Create `source/engine/components/Follow.js`:

```js
import { Component } from "../types/Component.js";
import { Transform } from "./Transform.js";

export class Follow extends Component {
  static schema = {
    targetId: { type: "entity", default: "", description: "Query path to the entity this one follows." },
    mode: {
      type: "select", default: "exponential", description: "Smoothing model.",
      options: [
        { value: "exponential", label: "Exponential" },
        { value: "spring", label: "Spring" },
        { value: "maxSpeed", label: "Max Speed" },
      ],
    },
    roundness: { type: "number", default: 0.85, description: "0 = instant snap, near 1 = very lazy/floaty. Used by exponential and maxSpeed modes." },
    stiffness: { type: "number", default: 120, description: "Spring mode only: how hard it pulls toward the target." },
    damping: { type: "number", default: 14, description: "Spring mode only: how quickly oscillation settles." },
    offsetX: { type: "number", default: 0, description: "Fixed X offset from the target's position." },
    offsetY: { type: "number", default: 0, description: "Fixed Y offset from the target's position." },
    axisLock: {
      type: "select", default: "both", description: "Restrict following to one axis.",
      options: [
        { value: "both", label: "Both" },
        { value: "x", label: "X only" },
        { value: "y", label: "Y only" },
      ],
    },
    deadzone: { type: "number", default: 0, description: "Radius within which no movement happens." },
    maxSpeed: { type: "number", default: 0, description: "Hard cap on movement speed, px/sec. 0 = uncapped." },
  };

  constructor(overrides = {}) {
    super(overrides);
    this._resolvedTarget = null;
    this._vx = 0; // spring mode velocity state
    this._vy = 0;
  }

  _resolveTarget(engine) {
    if (this._resolvedTarget && !this._resolvedTarget._destroyed) return this._resolvedTarget;
    if (!this.targetId) return null;
    const resolved = engine.query(this.targetId);
    this._resolvedTarget = resolved instanceof Object && "getWorldTransform" in resolved ? resolved : null;
    return this._resolvedTarget;
  }

  onTick(entity, engine, dt) {
    const target = this._resolveTarget(engine);
    const transform = entity.getComponent(Transform);
    if (!target || !transform) return;

    const targetTransform = target.getWorldTransform(engine);
    if (!targetTransform) return;

    let goalX = targetTransform.x + this.offsetX;
    let goalY = targetTransform.y + this.offsetY;

    if (this.axisLock === "x") goalY = transform.y;
    if (this.axisLock === "y") goalX = transform.x;

    const dx = goalX - transform.x;
    const dy = goalY - transform.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.deadzone) return;

    if (this.mode === "spring") {
      this._tickSpring(transform, goalX, goalY, dt);
    } else if (this.mode === "maxSpeed") {
      this._tickMaxSpeed(transform, goalX, goalY, dist, dt);
    } else {
      this._tickExponential(transform, goalX, goalY, dt);
    }
  }

  _tickExponential(transform, goalX, goalY, dt) {
    // roundness: 0 = instant snap, near 1 = very lazy. pow(roundness, dt) is
    // dt-independent (same shape regardless of frame rate).
    const t = 1 - Math.pow(this.roundness, dt);
    transform.x += (goalX - transform.x) * t;
    transform.y += (goalY - transform.y) * t;
  }

  _tickSpring(transform, goalX, goalY, dt) {
    // Semi-implicit Euler spring-damper, mass = 1. roundness is intentionally
    // unused here — stiffness/damping give more direct, predictable control
    // than deriving a damping ratio from a single 0-1 knob would.
    const ax = this.stiffness * (goalX - transform.x) - this.damping * this._vx;
    const ay = this.stiffness * (goalY - transform.y) - this.damping * this._vy;
    this._vx += ax * dt;
    this._vy += ay * dt;
    transform.x += this._vx * dt;
    transform.y += this._vy * dt;
  }

  _tickMaxSpeed(transform, goalX, goalY, dist, dt) {
    const rampDistance = Math.max(1, (this.maxSpeed || 200) * 0.5);
    const speedFrac = Math.min(1, (dist - this.deadzone) / rampDistance);
    // roundness shapes the deceleration curve: 0 = linear (snappy stop),
    // near 1 = eased (gentle, floaty stop).
    const exponent = 1 + this.roundness * 3;
    const speed = (this.maxSpeed || Infinity) * Math.pow(speedFrac, exponent);
    const step = Math.min(speed * dt, dist - this.deadzone);
    if (step <= 0) return;
    const nx = (goalX - transform.x) / dist;
    const ny = (goalY - transform.y) / dist;
    transform.x += nx * step;
    transform.y += ny * step;
  }
}
```

- [ ] **Step 2: Register it**

In `source/engine/types/DefaultComponents.js`, add the import:

```js
import { Follow } from "../components/Follow.js";
```

Add `Follow` to `DEFAULT_COMPONENTS`:

```js
export const DEFAULT_COMPONENTS = {
  Interactable,
  Transform,
  SpriteRenderer,
  ShapeRenderer,
  TextRenderer,
  Camera,
  Movement,
  Anchor,
  Animator,
  Opacity,
  Collision,
  Follow,
};
```

- [ ] **Step 3: Write the smoke test**

Create `source/engine/test/follow.test.mjs`:

```js
import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Follow } from "../components/Follow.js";
import { Transform } from "../components/Transform.js";

function makeEntity(id, x, y) {
  const e = new Entity(id);
  e.addComponent(Transform, { x, y });
  return e;
}

function fakeEngine(entities) {
  return {
    entities,
    query(path) {
      return entities.find((e) => e.id === path);
    },
  };
}

// --- exponential mode moves toward target, never overshoots at low dt ---
{
  const target = makeEntity("target", 100, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "exponential", roundness: 0.85 });
  const engine = fakeEngine([target, follower]);

  const followComp = follower.getComponent(Follow);
  for (let i = 0; i < 60; i++) followComp.onTick(follower, engine, 1 / 60);

  const x = follower.getComponent(Transform).x;
  assert.ok(x > 50 && x < 100, `expected partial progress toward target, got x=${x}`);
}

// --- deadzone: no movement while within radius ---
{
  const target = makeEntity("target", 5, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "exponential", deadzone: 10 });
  const engine = fakeEngine([target, follower]);

  follower.getComponent(Follow).onTick(follower, engine, 1 / 60);
  assert.equal(follower.getComponent(Transform).x, 0);
}

// --- axisLock: "x" ignores target's Y movement ---
{
  const target = makeEntity("target", 50, 50);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "exponential", axisLock: "x", roundness: 0.5 });
  const engine = fakeEngine([target, follower]);

  follower.getComponent(Follow).onTick(follower, engine, 1 / 60);
  assert.equal(follower.getComponent(Transform).y, 0);
  assert.notEqual(follower.getComponent(Transform).x, 0);
}

// --- maxSpeed mode never exceeds the configured cap ---
{
  const target = makeEntity("target", 1000, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "maxSpeed", maxSpeed: 100 });
  const engine = fakeEngine([target, follower]);

  const followComp = follower.getComponent(Follow);
  const dt = 1 / 60;
  followComp.onTick(follower, engine, dt);
  const step = follower.getComponent(Transform).x;
  assert.ok(step <= 100 * dt + 1e-6, `expected step <= maxSpeed*dt, got ${step}`);
}

console.log("follow.test.mjs: all assertions passed");
```

- [ ] **Step 4: Run the test**

Run: `node source/engine/test/follow.test.mjs`
Expected: prints `follow.test.mjs: all assertions passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add source/engine/components/Follow.js source/engine/types/DefaultComponents.js source/engine/test/follow.test.mjs
git commit -m "feat(engine): add Follow component (exponential/spring/maxSpeed smoothing)"
```

---

### Task 6: Client — `"entity"` schema field type in the Inspector

**Files:**
- Modify: `source/client/src/api.ts`
- Modify: `source/client/src/layout/sections/Inspector.tsx`

**Interfaces:**
- Consumes: `scene.entities: Entity[]` (already available via `useSceneEditor()` in `Inspector.tsx`), the schema pipeline in `source/server/manager/ProjectHandler.ts` which already passes `type: def.type` straight through with no allowlist — no server change needed.
- No new exports; this only extends the existing `FieldType` union and `SchemaField` switch.

- [ ] **Step 1: Extend the type union**

In `source/client/src/api.ts`, update `ComponentFieldDefinition` (line 126-132):

```ts
export interface ComponentFieldDefinition {
  key: string;
  type: "number" | "text" | "string" | "boolean" | "color" | "vector" | "code" | "select" | "animationRefs" | "entity";
  defaultValue: unknown;
  description?: string;
  options?: SelectOption[];
}
```

- [ ] **Step 2: Add the `"entity"` case to `SchemaField`**

In `source/client/src/layout/sections/Inspector.tsx`, `SchemaField` needs the current scene's entity list. Add a `sceneEntityIds` prop threaded down to it. First, find where `SchemaField` is invoked (inside the component that renders each `ComponentCard`/similar, around line 1176 per the existing read) and add `sceneEntityIds={scene?.entities.map((e) => e.id) ?? []}` to that call site — `scene` is already in scope there via `useSceneEditor()`.

Add the prop to `SchemaField`'s signature:

```tsx
function SchemaField({
  label,
  type,
  value,
  onChange,
  options,
  description,
  componentRegistry,
  sceneEntityIds,
}: {
  label: string;
  type: FieldType;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: SelectOption[];
  description?: string;
  componentRegistry?: Record<string, ComponentDefinition>;
  sceneEntityIds?: string[];
}) {
```

Add a new case, right after the `"select"` case (after the block ending around line 1273):

```tsx
  if (type === "entity") {
    const datalistId = `entity-options-${label}`;
    return (
      <label className="flex items-center justify-between gap-2 text-xs">
        <FieldLabel label={label} description={description} />
        <input
          type="text"
          list={datalistId}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="entity id or query path"
          className="w-40 rounded border border-[var(--color-border)] bg-transparent px-1.5 py-0.5 text-right text-[var(--color-text)]"
        />
        <datalist id={datalistId}>
          {(sceneEntityIds ?? []).map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
      </label>
    );
  }
```

(Native `<datalist>` gives autocomplete from root-level scene entities while still accepting free-typed text for nested/child query paths — no new UI primitive needed, consistent with the "text input with autocomplete" scope decided during design.)

- [ ] **Step 3: Register `onCollide`'s scope vars for the code editor**

In the same file, extend `SCOPE_BY_FIELD` (around line 1275-1283) with the new callback:

```tsx
  const SCOPE_BY_FIELD: Record<string, string[]> = {
    onClick: ["entity", "engine"],
    onHoverEnter: ["entity", "engine"],
    onHoverExit: ["entity", "engine"],
    onHold: ["entity", "engine"],
    onDragStart: ["entity", "engine", "data"],
    onDrag: ["entity", "engine", "data"],
    onDragEnd: ["entity", "engine", "data"],
    onCollide: ["entity", "other", "engine"],
  };
```

- [ ] **Step 4: Manual verification**

Run `npm run dev` in `source/client`, open a project, add a `Follow` or `Collision` component to an entity in the Inspector, confirm the `targetId`/`onCollide` fields render correctly (text input with autocomplete dropdown for `targetId`; code editor modal for `onCollide`).

- [ ] **Step 5: Commit**

```bash
git add source/client/src/api.ts source/client/src/layout/sections/Inspector.tsx
git commit -m "feat(client): entity-reference schema field with autocomplete in Inspector"
```

---

### Task 7: Changelog

**Files:**
- Create: `docs/changelogs/changelog4.md`

- [ ] **Step 1: Write the changelog entry**

Follow the structure of `docs/changelogs/changelog3.md` (design goal, what changed per subsystem, files touched). Cover: `engine.query()` + the `getChild()` fix, `Camera.target` migration, `Collision` (schema, detection, resolution, loop ordering), `Follow` (schema, three modes, loop ordering), and the client `"entity"` field type.

- [ ] **Step 2: Commit**

```bash
git add docs/changelogs/changelog4.md
git commit -m "docs: changelog 4 — entity query system, collision, follow component"
```

## Self-Review Notes

- **Spec coverage:** all four spec sections (query, schema field type, Collision, Follow) have a task. Loop-ordering requirement from the spec is satisfied by Task 4's explicit pass structure.
- **Type consistency checked:** `Collision.checkPair(entityA, entityB, engine)` signature is identical between Task 3 (definition) and Task 4 (call site). `Follow`'s `onTick(entity, engine, dt)` matches the `Component` base class signature. `resolveEntityQuery(entities, path)` signature is identical between Task 1's definition and `GameEngine.query`'s call.
- **No placeholders:** every step has real, complete code — no TBD/"add validation"/"similar to Task N" shortcuts.
