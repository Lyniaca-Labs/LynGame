# Engine Roadmap

## ULTRA PRIORITY (3-Day Jam: Card Game / Time-Strategy / Deck Builder)

- [x] show preview on edit before you have to click on it — the new Scene Canvas (see "Editor/Game viewport split" below) renders every entity's thumbnail up front, not just the selected one
- [x] have camera panning — drag empty space in the Scene Canvas to pan around; "Center view" button resets it (`source/client/src/layout/sections/SceneCanvas.tsx`)
- [x] show icons next to entities on hover that represent special components (camera, animation, collision (not implemented yet but just an example)) — `source/client/src/lib/entityIcons.tsx`, used by both the Explorer tree and the Scene Canvas's entity boxes. Camera's icon is persistent (always visible); Interactable/Animator/Anchor show on hover. Collision has no component yet, so no icon for it.
- [x] when you run it it should take you out of edit mode automatically — pressing Run now switches the Viewport to the "Game" tab (`EditorLayout.tsx`'s `runGame`)

### Must-have to build the game at all
- [x] Text components / font loading — card names, costs, stats, descriptions
- [x] Event component (click, hold, drag/release) — picking up & playing cards
- [x] Entity children — compose a card from bg + art + text + icons as one unit
  - `Entity.addChild()`/`removeChild()` + `Entity.getWorldTransform(engine)` (source/engine/types/Entity.js) compose a child's local Transform with every ancestor's (position + rotation), all the way up through grandparents/great-grandparents. Renderers/Interactable/Camera already read whatever transform object they're given, so nothing else needed to change — attach art/text/icon entities to a card "root" entity and they move/rotate with it. Two escape hatches: an ancestor with no Transform component at all is transparently skipped rather than breaking the chain, and marking a child's own Transform `fixed: true` opts it out of inheriting from its parent entirely (same field already used for camera-independence — a `fixed` transform is absolute either way).
  - Full editor support: entities render as a real collapsible hierarchy tree in the Explorer (nested under their parent, matching `Entity.parentId` — new field on the JSON entity shape, wired into `engine.createEntity()`/`addChild()` calls by the scene compiler in `source/server/manager/ProjectHandler.ts`). Drag-and-drop reparenting within a scene, plus context-menu actions: Add Child Entity, Duplicate (clones the whole subtree with fresh ids), Copy/Paste (cross-scene clipboard), and cascading Delete (removing a parent removes its children too, matching the engine's own `Entity.destroy()`).
- [x] Z-index layers / multiple canvases — card stacking, hand fanning, dragged-card-on-top
  - Added `Transform.zIndex` (source/engine/components/Transform.js, tooltip on the field). `_render()` does a stable sort by zIndex before drawing (source/engine/index.js). Bump a dragged card's zIndex in `onDragStart` / reset it in `onDragEnd` to bring it to the top.
- [x] GUI helper/system — hand layout, deck/discard pile counters, buttons, turn/timer UI
  - New `Anchor` component (source/engine/components/Anchor.js) pins an entity to a viewport corner/edge (`top-left`...`bottom-right`) with a pixel offset — the basis for HUD elements that must ignore camera panning. New `engine.gui` module (source/engine/modules/GUI.js — `layoutHand`, `layoutRow`, `layoutStack`) arranges arrays of card entities (fanned hand, button bar, deck/discard pile) by setting their Transform x/y/rotation/zIndex; call it from a script whenever the hand/pile changes. Buttons/counters = `Anchor` + `Interactable` + `TextRenderer`/`ShapeRenderer`, same as any other entity.
- [x] Global scripts not attached to an entity — game manager (turn order, timers, win condition)
  - [x] attach scripts to game/engine -> callable from anywhere
- [x] a way to easily animate conditionally (holding cards animation / more)
  - New `Animator` component (source/engine/components/Animator.js): `entity.getComponent("Animator").animate(target, prop, to, { duration, easing, onComplete })` tweens any numeric property (e.g. a Transform's `y`) over time, self-driven via the component's own `onTick` — no engine changes needed to use it. Designed to be called conditionally from Interactable event code (`onHoverEnter`/`onHoverExit`/`onHold`/etc.), re-triggering cancels the previous tween cleanly.

### Must-fix bugs (actively block building the game)
- [x] Scene switching laggy / spawned entities end up in wrong scene
  - Root cause: `GameEngine._update()` iterated `this.entities` directly; a script calling `loadScene()` mid-frame (e.g. a door/portal script) reassigns `this.entities` to the new scene's array, but the in-progress `for-of` kept iterating the *old* reference for the rest of that frame — so an old scene's spawner script (still "alive" for that frame) spawned its entity into the array that now belonged to the new scene. `loadScene()` also tore down entities one at a time via `removeEntity()`, which re-filters the whole array per entity (O(n²) — the longer a scene had been spawning things, the laggier the switch).
  - Fix (source/engine/index.js, source/engine/types/Entity.js): `_update()` now snapshots `this.entities` once per frame and skips anything flagged `_destroyed`; `loadScene()` bulk-flags+tears-down the old entities in two O(n) passes instead of n filtered removals; `Entity.destroy()` sets `_destroyed = true` immediately and cascades to children.

### Needed to actually ship/submit
- [ ] Export project to zip (with live server to run it)

### High-value if time allows
- [x] Move entities around/between scenes, duplicate, copy/paste — massive speed-up for laying out cards & board
  - Duplicate/Copy/Paste live in the Explorer's entity context menu (see Entity children note above). "Move to Scene" persists the entity (+ its full child subtree) into another scene file immediately via the API and removes it from the current one — a real cross-file move, not just local draft state, since losing that mid-edit would be worse than an ordinary undo-able mistake. Implemented in `source/client/src/context/SceneEditorContext.tsx` (`setEntityParent`, `duplicateEntity`, `copyEntity`/`pasteEntity`, `moveEntityToScene`) and `source/client/src/layout/sections/Explorer.tsx`.
  - Drag-and-drop in the hierarchy tree supports all three: drop in the top/bottom ~30% of a row to land as a **sibling** at that position (same parent, reordered into the array next to the target); drop in the middle ~40% to land **inside** it as a child; drop onto a different scene's row/entity to actually **move it across scene files** (goes through `moveEntityToScene`, not just local reparenting). `FolderTree.tsx` computes the before/inside/after position from cursor Y within the row and shows a line/ring indicator accordingly. Fixed a flicker bug where the drop highlight toggled rapidly — caused by `dragenter`/`dragleave` firing on the row's own child elements (chevron/label/badges); fixed via an `e.relatedTarget` containment check plus only calling `setState` when the computed drop position actually changes (dragover fires continuously).
- [ ] Audio system — basic SFX for playing cards / timers
- [ ] SpriteSheets — faster card art iteration than one texture per card
- [ ] Collision/simple hit-detection — drop zones for cards (could piggyback on event component instead if time-crunched)

### Explicitly defer (not needed for this jam)
Tilemaps, Physics, Pathfinding, Inverse Kinematics, Particles, Screen effects, Keyframe animation, Undo/redo, ESLint, Visual scripting, TypeScript parser, Node backend/save endpoints, Editor extensions (sprite/texture/tilemap/audio creators), Icon pack, comfyui/magenta stuff.

LATER

- visual node editor / extension basework ( used for textures to)

## Reported Bugs
- [x] When switching scene laggy with spawning script, newly spawned entities will be in wrong scene — fixed in source/engine/index.js `_update`/`loadScene` (see ULTRA PRIORITY bug entry above for root cause)
- [x] cannot scroll in code editor
- [ ] switching projects does not fully refresh everything
- [ ] node editor wires / edges are laggy
- [ ] need checkbox component
- [ ] standardize the code editor modal
- [ ] graph editor laggy when panning around
  - [ ] also have connector dots come slightly out and bigger
  - [ ] replace moving lines with arrows
  - [ ] texture editor lines do not evenly connect with nodes
  - [ ] upload image (dataurl) to texture graph (hardcoded const image node)

## Highest Priority 

- [ ] Graphics framework first (foundation)
  - [x] text components / font loading (font assets)
  - [ ] should be able to make global scripts not attached to an entity
    - [x] attach scripts to game / engine -> callable from anywhere
  - [x] entity children
  - [ ] icons for premade components
  - [x] add static component description alongside schema
  - [ ] shadow component > renders a pixelated or high def shadow underneath
  - [x] event component (calls script on certain event to entity (hold, click, etc))
  - [x] dropdown type for component schema -> dropdown options (`type: "select"` + `options: [{value,label}]`, used by Interactable.cursor and Anchor.anchor)
  - [ ] ability to turn off antialiasing in config / set frame rate and tick speed
  - [x] tooltips, descriptions, and usage everywhere, proper documentation (every built-in component field now has a `description`, rendered as a native tooltip in the Inspector)
  - [x] custom cursor support (`Interactable.cursor` — select field, CSS cursor applied on hover)
  - [x] editor dragging and dropping — Scene Canvas: drag an entity's box to move it (drags Transform.x/y), arrow keys nudge it 1px (10px w/ Shift), corner-panel one-click pins it via the Anchor component (`source/client/src/layout/sections/SceneCanvas.tsx`)
  - [x] keyframes for animation
  - [x] camera component -> attaches to entity, can set isactive on camera component and it will turn off all others in scene and attach to scene
  - [x] stop reshipping LGEngine with every single texture
  - [ ] screen effects (blur, bloom, vignette, etc)
  - [ ] ability to load an asset into texture creator to create a new version of that asset
    - [x] requires assets to also be allowed to be json / js files -> built into canvases
    - [x] should view output of texture at output node
    - [x] some textures can be seeded and regenerated
    - [ ] cache randomness / seeds per entity that uses them to avoid regenerating -> destroy on entity delete.
- [ ] Game framework built on graphics framework
  - [ ] init funciton loading animation (as LynGame)
- [ ] Engine GUI/editor on top of game framework
  - [x] ability to add components and scripts to entities
  - [x] keyboard shortcuts
  - [x] ability to load a preview of an entity from editor (same with scene)
  - [x] ability to pause the game
  - [x] code editor
  - [x] ability to move entities around, around scenes, duplicate, copy, paste
  - [ ] little icons for tabs on explorer
    - [x] camera icon for cameras (+ Interactable/Animator/Anchor icons — `source/client/src/lib/entityIcons.tsx`)
    - [ ] entity icon for entities (generic default icon; only "special" components have one so far)
    - [ ] hitbox entity evnetually
  - [x] can edit prefabs
  - [ ] export project to zip (with a node live server. Can use node or python, or powershell (ps1) to run)
  - [x] deleting, creating scripts and components
  - [ ] renaming scripts and components and updating all references to them
  - [x] get codemirror code editor to fit screen better
  - [x] codemirror code editor should be based on selected theme
  - [ ] get open in vscode working
  - [x] should be able to put components on a prefab instance, seperate from overrides
  - [ ] ability to collapse components
  - [ ] undo / redo
  - [ ] visual editor and context menu in scene
    - [x] script visual editor
    - [ ] component visual editor
    - [x] texture visual editor
  - [ ] ESLINT in code editor
  - [ ] autosave option in settings
  - [ ] preview render for prefabs
  - [ ] can drag assets in and upload from editor

- [ ] Good overall architecture/design pattern
  - [ ] turn server into typescript, keep all project files and engine files javascript
- [x] Scene hierarchy (`Scene[] -> Entity[] -> Children[]`)
- [x] Components system
- [x] Events system
  - [ ] include in visual scripter
- [ ] Physics
- [ ] Collision system
- [x] Global tick/frame system (`dt`)
- [x] Sprite renderer
- [x] Asset manager
- [x] Z-index layers / multiple canvases (per-entity `Transform.zIndex`, stable-sorted at render time — see ULTRA PRIORITY entry above; true multi-canvas layering deferred, single sorted layer covers the jam's stacking needs)
- [x] Camera
  - [x] part of scene, interacts with all transforms
- [ ] Custom save format
- [ ] Documentation
- [ ] Ability to keep alive scenes after switching / auto scene cache
- [ ] spriterenderer filter component

---

## Editor

- [x] Better GUI (possibly React)
- [x] Styling/theme config
- [ ] VSCode integration
- [ ] Pause when editor window is blurred
- [x] auto focus viewport on run
- [ ] Loading screen with default engine loader/logo
- [ ] Debug mode
- [ ] Error handling
- [x] Performance monitor
- [x] Live preview — Scene Canvas tab shows a live, editable layout of every entity in the open scene without building/running (`source/client/src/layout/sections/SceneCanvas.tsx`)
- [ ] custom styling / border radius changes (separate from theme) -> "Softness"

---

## Core Features

- [ ] SpriteSheets
- [ ] Tilemaps
  - [ ] sprite map rules for autofilling > wave function collapse
- [x] Texture system (runtime clipped sprites)
- [ ] Repeating textures
- [ ] Particles
- [ ] Pathfinding
- [ ] Inverse kinematics
- [ ] Following/math utilities
- [ ] Audio system
- [x] GUI helper/system (`Anchor` component + `engine.gui` module — see ULTRA PRIORITY entry above)
- [x] Y-offset Z-level sorting
- [x] Global scene switching
- [x] Global script calls
- [ ] have ai go through and make full documentation of app, components, handlers, etc... (info buttons)

---

## Prefabs & Components

- [x] Prefab system
- [x] Entity inheritance
- [ ] Common gameplay components
- [ ] Reusable asset library
- [ ] Built-in icon pack

---

## Compilation

- [ ] Everything evaluated inside engine
- [ ] TypeScript parser
- [ ] Visual scripting system
- [ ] Code blocks → generated source
- [x] Texture blocks → generated textures
- [ ] Compile to optimized import map
- [ ] Strip comments during build

---

## Performance

- [ ] offscreen culling
  - [ ] component to keep alive
- [ ] sprite batching
- [ ] texture batching
- [ ] lazy loading
- [ ] editor performance mode (lowers animations and roundness)

## Networking & Backend

- [ ] Node.js backend
- [ ] Local live server
- [ ] Save to local server endpoint
- [ ] Save to custom URL endpoint
- [ ] Run script (.bat)
- [ ] project templates (card game, 2d isometric game, etc...)
---

## Editor Extensions

- [ ] Sprite creator
- [ ] Texture creator
- [ ] Tilemap creator
- [ ] Audio creator 
- [ ] Pixel art editor
- [ ] visual Animation editor
- [ ] google magenta tensorflow running in browser for music generation
- [ ] drums too

AI (harder future)

build scene tree
writes scripts
runs test
debugs editor

comfyui pixel art builder

