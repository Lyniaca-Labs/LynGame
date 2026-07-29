# Changelog 3

2026-07-29. Feature: prefabs can now have children, and instances can
override those children per-instance ("ghost overrides") instead of only
overriding the root entity's own components. Includes a same-day fix for a
bug found while dogfooding the feature (see "Bug fix" below).

## Prefabs with children + ghost overrides

**Design goal, from the request:** a prefab like `Card` should be able to
define `icon` / `name` / `description` as children, and instantiating a
Card should let you pass in per-instance values for those children — in the
Explorer tree, in the Inspector, and from scripts — without having to
rebuild the whole card as loose entities every time.

### Data model
**Files:** `source/client/src/api.ts`, prefab JSON files under
`prefabs/*.json`

A prefab's JSON gains an optional `children`, keyed by name (same
convention `components` already uses), recursive to any depth:

```json
{
  "components": { "Transform": { "x": 0, "y": 0 } },
  "scripts": [],
  "children": {
    "icon":        { "components": { "SpriteRenderer": { "texture": "sword.png" } }, "scripts": [] },
    "name":        { "components": { "TextRenderer": { "text": "Card Name" } } },
    "description": {
      "components": { "TextRenderer": { "text": "..." } },
      "children": { "badge": { "components": { "SpriteRenderer": { "texture": "common.png" } } } }
    }
  }
}
```

An instance's `overrides` gains a reserved `children` key, addressed by
**dot-path** from the prefab root (so a grandchild like `description`'s
`badge` is `"description.badge"` — the same addressing scheme used
everywhere else in this feature, including from scripts):

```json
{
  "prefab": "Card",
  "overrides": {
    "Transform": { "x": 100, "y": 200 },
    "children": {
      "icon":              { "SpriteRenderer": { "texture": "flame-sword.png" } },
      "name":              { "TextRenderer": { "text": "Flaming Sword" } },
      "description":       { "TextRenderer": { "text": "A sharp blade, wreathed in fire." }, "scripts": ["glow"] },
      "description.badge": { "SpriteRenderer": { "texture": "rare.png" } }
    }
  }
}
```

Per child: any component's fields already in the prefab child can be
overridden by field. A child's `scripts` array under its override is
**additive-only** — extra scripts stacked on top of whatever the prefab
child already runs, never a replacement — since scripts have to be resolved
at build time (same reason top-level `entity.scripts` already worked this
way for prefab instances).

By design, a ghost child can only diverge in field *values* and extra
scripts per instance — never structurally (no per-instance added/removed
components, no per-instance deletion of a ghost child). If you need that,
add a plain entity as a real child alongside the ghost ones instead (see
"Mixing ghost and real children" below).

### Engine / build
**Files:** `source/engine/types/Entity.js`,
`source/server/manager/ProjectHandler.ts`

- `Entity` gained `childName` (set when spawned as a prefab child, or when
  passed as the second argument to `addChild(child, name)`), plus two
  lookup methods:
  - `entity.getChild(path)` — walks descendants by dot-path, e.g.
    `entity.getChild("description.badge")`.
  - `entity.query(path)` — one call for entity, component, or a component's
    property, using a `child:Component.prop` mini-syntax:
    - `entity.query("icon")` → the `icon` child Entity
    - `entity.query("icon:SpriteRenderer")` → icon's SpriteRenderer instance
    - `entity.query("icon:SpriteRenderer.texture")` → that field's value
    - `entity.query(":Transform.x")` → this entity's own Transform.x (empty
      child path before the `:` means "self")
- The prefab compiler (`ProjectHandler.buildMain`) recursively renders a
  prefab's `children` into real nested entities at build time — each gets
  `` `${rootEntity.id}.<path>` `` as its id (readable and collision-free
  across instances) and `childName` set to its own key, then
  `addChild`-ed onto its parent. Field overrides merge in via the same
  `{...defaults, ...(overrides.X || {})}` pattern the root already used, just
  keyed by dot-path under `overrides.children` instead of directly under
  `overrides`. Extra per-child scripts (additive, see above) are wired at
  the scene level via `entityVar.getChild("path").attachScript(...)`,
  reusing the new `getChild`.

### Editor: Explorer
**File:** `source/client/src/layout/sections/Explorer.tsx`

- **Prefab nodes are now expandable.** The Prefabs section shows each
  prefab's own `children` tree; right-click a prefab (or one of its
  children) for **Add Child** / **Rename** / **Delete**, same as an
  entity's children.
- **Instances show "ghost" children automatically.** Any scene entity with
  an attached prefab now lists that prefab's children under it in the tree,
  dimmed/italic to read as "inherited, not a real entity yet." A small dot
  badge shows whether that ghost child currently has instance overrides
  (filled) or not (outline). Clicking a ghost child opens it in the
  Inspector for override editing — no context menu, since ghost children
  can't be restructured, only overridden (see Data model above).
- **You can still add real children.** Manually-added child entities (via
  the existing "Add Child Entity" action) render right alongside the ghost
  ones, undimmed, with the full normal entity context menu. Nothing about
  ghost children stops you from mixing in extra hand-built entities under
  the same instance.

### Editor: Inspector
**File:** `source/client/src/layout/sections/Inspector.tsx`

- Selecting a prefab's own child (from the Explorer's Prefab-authoring
  tree) opens a structural editor — same shape as the existing prefab
  Inspector (components/scripts, add/remove), plus a "Children" section to
  add/rename/remove this child's own nested children, and a rename field
  for the child's own name.
- Selecting a ghost child (from an instance) opens an **override-only**
  view: each of the child's components rendered with the existing
  "override a field, see a dot when it diverges, Reset to prefab default"
  pattern already used for root-entity overrides — reused directly, not
  reimplemented. Below that, the child's inherited scripts are listed
  read-only, with a separate "Extra Scripts (this instance only)" list for
  the additive overrides.

### Usage from scripts
```js
// Reading/writing a named child's component directly:
const icon = entity.getChild("icon");
icon.getComponent("SpriteRenderer").texture = "new-icon.png";

// One-liner via query():
const currentText = entity.query("description:TextRenderer.text");
entity.query("icon:SpriteRenderer").texture = "sword.png";

// Instantiating a Card with per-instance child values:
engine.prefabs.instantiate("Card", {
  Transform: { x: 100, y: 200 },
  children: {
    icon:        { SpriteRenderer: { texture: "sword.png" } },
    name:        { TextRenderer: { text: "Flaming Sword" } },
    description: { TextRenderer: { text: "A sharp blade." } },
  },
}, "card1");
```

### Bug fix: saved grandchildren disappearing from the Explorer tree
**Files:** `source/client/src/context/SceneEditorContext.tsx`,
`source/client/src/layout/sections/Explorer.tsx`

Reported while dogfooding: add a grandchild to a prefab (e.g. `dot` →
`dot.badge`), save it, then inspect an entity that uses that prefab — the
grandchild vanished from the Explorer tree both under that entity's ghost
children *and* under the prefab's own authoring row.

Root cause: `Explorer.tsx` kept its own `prefabDefs` cache (fetched once per
prefab, straight from disk) to know each prefab's `children` for the tree —
entirely disconnected from the context's `prefabCache`, which is what
`save()` actually keeps up to date. The moment you saved a prefab edit while
looking at anything *other* than that prefab, `save()` updated `prefabCache`
but Explorer kept rendering from its own stale `prefabDefs`, which had
cached the pre-edit shape and never had a reason to refetch.

Fix: deleted Explorer's redundant cache entirely. `SceneEditorContext` now
eagerly pre-fetches every project prefab into `prefabCache` (previously it
only lazily cached prefabs some already-inspected entity referenced), and
Explorer reads `prefabCache` directly — the same cache `save()` already
updates, so there's only one source of truth for "what does this prefab
currently look like" instead of two that can drift apart.

### Verification
- `npx tsc --noEmit` clean in both `source/client` and `source/server`
  (client's one pre-existing, unrelated error in `lib/texturePreview.ts`
  noted again, still untouched).
- End-to-end build check: temporarily added a two-level-deep `children`
  tree (`label` → `label.badge`) to the sample project's `Enemy` prefab and
  a matching `overrides.children` (including an additive extra script) to
  its scene instance, ran `ProjectHandler.buildMain` directly, and inspected
  the generated `main.js` — nested child entities, correct
  `childName`/parent wiring, correct per-path override merging, and the
  extra script attached via `entity.getChild("label").attachScript(...)`
  all came out as designed. Reverted both test files immediately after.
- **Not click-tested in the running editor.** The Explorer/Inspector UI
  changes (expandable prefab nodes, ghost child rows, the two new Inspector
  views) compile clean but haven't been driven through an actual browser
  session — worth a manual pass (add a prefab child, instantiate it,
  override a ghost child's field, confirm the Explorer badge and Inspector
  "Reset to prefab default" both behave) before relying on them.
