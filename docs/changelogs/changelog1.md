# Changelog

Autonomous session — 2026-07-28. Everything below was implemented and
verified (`tsc --noEmit`, `node --check`) without stopping for input, per
request. Review before merging.

## Scene Canvas: entity preview, drag/select/pin, and camera panning

**Files:** `source/client/src/layout/sections/SceneCanvas.tsx` (new),
`source/client/src/context/SceneEditorContext.tsx`

- New tab in the Viewport ("Editor") renders every entity in the open scene
  as a positioned, thumbnailed box, purely from scene JSON + component
  schemas — no build or running game required.
- Click a box to select it (syncs with Explorer/Inspector). Drag it to move
  (updates `Transform.x/y`, one undo step per drag). Arrow keys nudge the
  selected entity 1px (10px with Shift).
- A 3×3 corner panel next to the selected entity pins it via the engine's
  existing `Anchor` component (adds the component if missing, sets the
  corner); "Unpin" removes it.
- Drag empty canvas background to pan around; a "Center view" button resets
  it to origin.
- Added `setComponentFields(entityId, component, fields)` to
  `SceneEditorContext` — merges several fields (e.g. both `x` and `y` of a
  drag, or adding `Anchor` + setting its corner) into one undo step instead
  of two.

## Editor/Game viewport separation

**Files:** `source/client/src/layout/EditorLayout.tsx`,
`source/client/src/layout/sections/GameView.tsx`, `source/engine/index.js`

- The Viewport panel is now two explicit tabs — **Editor** (the Scene
  Canvas above) and **Game** (the actual running build/iframe) — instead of
  the Scene Canvas overlaying on top of the live game view. This was the
  "better separation between editor and actual view" ask: what you edit and
  what you play are never the same pixels, and neither view depends on the
  other being active. Both stay mounted (just CSS-hidden when inactive) so
  switching tabs never tears down the running iframe or loses in-progress
  canvas drag state.
- Pressing **Run** now automatically switches the Viewport to the Game tab
  (previously listed as a TODO under ULTRA PRIORITY: "when you run it it
  should take you out of edit mode automatically").
- **Click-to-select in the live Game view:** the engine gained
  `GameEngine.pickEntityAt(screenX, screenY)` — hit-tests every entity's
  bounding box (same source `Interactable` already uses: Transform +
  SpriteRenderer/ShapeRenderer/TextRenderer dimensions), topmost
  (highest `zIndex`) first. When the editor is open, a `pointerdown`
  listener reports the picked entity back via
  `postMessage({ type: "ENTITY_PICKED", id })`; `GameView` forwards it
  through a new `onEntityPicked` prop, and `EditorLayout` selects that
  entity in the Explorer/Inspector — but only if it's actually part of the
  scene currently open for editing (a running game may have navigated to a
  different scene at runtime via `loadScene()`, in which case the click is
  silently ignored rather than opening a stale/wrong scene).
  This is fully additive: it doesn't call `preventDefault`/
  `stopPropagation`, so normal gameplay click handling (`Interactable`
  callbacks, drag, etc.) is unaffected. A standalone build never sends the
  enabling message, so the listener is inert outside the editor.

## Entity "special component" icons

**Files:** `source/client/src/lib/entityIcons.tsx` (new),
`source/client/src/layout/sections/Explorer.tsx`,
`source/client/src/layout/sections/SceneCanvas.tsx`

- New shared helper (`ENTITY_COMPONENT_ICONS` / `presentComponentIcons`)
  maps a few "special" components to an icon + tooltip: Camera (always
  visible), Interactable, Animator, Anchor (all three hover-only). Used by
  both the Explorer tree (as row badges, same mechanism as the existing
  "start scene" star) and the Scene Canvas's entity boxes (small
  top-right badge cluster). No icon for a hitbox/collision component yet —
  it doesn't exist in the engine yet either.

## docs/TODO.md

Marked items actually completed this session as done, each pointing at the
file that implements it: the ULTRA PRIORITY canvas-preview/panning/
run-exits-edit-mode line, custom cursor support (already existed —
`Interactable.cursor` — just wasn't checked off), the Explorer camera icon
sub-item, "editor dragging and dropping", and "Live preview".

## Deliberately not touched

The TODO file has a lot of much larger, architecturally-risky items that
weren't attempted unsupervised: TypeScript backend rewrite, physics/
collision system, tilemaps, audio system, ESLint-in-editor, export-to-zip
w/ live server, undo/redo (already exists, unlike the checkbox — worth a
follow-up doc pass), and the various Editor Extensions (sprite/texture/
tilemap/audio creators). These all involve either irreversible structural
changes or enough ambiguity in scope that they need a real conversation
first, not a solo pass.

## Verification

- `npx tsc --noEmit -p source/client` — clean except one pre-existing,
  unrelated error in `lib/texturePreview.ts` (confirmed present on `main`
  before this session via `git stash`; not touched here).
- `node --check source/engine/index.js` — passes.
- Not manually exercised in a browser this session (autonomous, no
  interactive verification available) — worth a quick smoke test of the
  Editor/Game tab switch, entity drag/pin, and in-game click-to-select
  before relying on this.
