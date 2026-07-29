# Engine Roadmap

This replaces `docs/TODO.md` (now deprecated/archived — see the note at the
top of that file). Completed work with implementation detail lives in
`docs/changelogs/`; this file only tracks what's left.

## Next Session: Feature Expansion

Two feature areas were scoped out for a dedicated design pass next session
(brainstorm → spec → plan, not just a quick pass):

- **Pixel art editor features** — pick from the candidate list under
  [Pixel Art Editor](#pixel-art-editor) below (zoom/pan, color scheme
  tools, opacity, brush size, etc.) and design the ones worth building.
- **TODO/Trello board extension** — a new drag-and-drop board extension
  alongside the existing `source/extensions/*` ones (pixel-art,
  sfx-generator), for organizing ideas visually instead of as a flat
  markdown list. Needs a real design pass (data model, drag/drop
  interactions, relationship to this roadmap file).

---

## Near-Term

- [ ] Export project to zip (with live server to run it)

## Pixel Art Editor

- [ ] allow zooming out and panning
- [ ] automatic color scheme detection
- [ ] tool that changes your entire sprite to fit a new color scheme
- [ ] color scheme generator (like coolors.co)
- [ ] ability to actually change colors
- [ ] ability to change opacity
- [ ] change brush size
- [ ] just overall good pixel art tools

## Spritesheets

- [ ] SpriteSheets — faster card art iteration than one texture per card
- [ ] spritesheet partitioner
  - [ ] load asset -> select which frames are keyed at indexes -> save as a new asset
  - [ ] needs spritesheet support -> should kinda work like animation clips

## Open Bugs

- [ ] switching projects does not fully refresh everything
- [ ] node editor wires / edges are laggy (defer)
- [ ] need checkbox component for editor
- [ ] standardize the code editor modal
- [ ] graph editor laggy when panning around
  - [ ] also have connector dots come slightly out and bigger
  - [ ] replace moving lines with arrows
  - [ ] texture editor lines do not evenly connect with nodes
  - [ ] upload image (dataurl) to texture graph (hardcoded const image node)

## Graphics Framework

- [ ] ability to query in engine with name.child.subchild and name.child.subchild:component or :component.property
- [ ] layout component for entities -> like flexbox / grid, will auto format children
- [ ] debug mode that shows bounding box
- [ ] icons for premade components
- [ ] shadow component > renders a pixelated or high def shadow underneath (cached)
- [ ] ability to turn off antialiasing in config / set frame rate and tick speed
- [ ] screen effects (blur, bloom, vignette, etc)
- [ ] prefabs should be able to have children (root-level ghost overrides shipped; revisit if gaps remain)
- [ ] cache randomness / seeds per entity that uses them to avoid regenerating -> destroy on entity delete
- [ ] icons in graph editor per node
- [ ] more icons overall
- [ ] Collision/simple hit-detection
- [ ] text, shapes, and sprites should have properties on where to draw them (center, top-left, etc.)
  - [ ] shape renderer
  - [ ] text renderer (may already be done)
  - [ ] sprite renderer

## Game Framework

- [ ] init function loading animation (as LynGame)

## Editor / Engine GUI

- [ ] hitbox entity eventually
- [ ] export project to zip (with a node live server — node, python, or ps1)
- [ ] renaming scripts and components and updating all references to them
- [ ] get open in vscode working
- [ ] undo / redo
- [ ] component visual editor
- [ ] icons for components (color coded as well)
- [ ] ESLint in code editor
- [ ] autosave option in settings
- [ ] preview render for prefabs
- [ ] full feature documentation (components, scripts, functionality, scenes, entities, everything, etc.)
- [ ] events system in visual scripter

## Editor (general)

- [ ] VSCode integration
- [ ] Pause when editor window is blurred
- [ ] Loading screen with default engine loader/logo
- [ ] Debug mode
- [ ] Error handling
- [ ] custom styling / border radius changes (separate from theme) -> "Softness"

## Core Features

- [ ] Tilemaps
  - [ ] sprite map rules for autofilling > wave function collapse
  - [ ] optimized for large maps (conditional sprites / function that returns a sprite)
- [ ] Repeating textures
- [ ] Particles (emitter component) component.emit (or constant emitter)
- [ ] Pathfinding
- [ ] Inverse kinematics
- [ ] Following/math utilities
- [ ] have ai go through and make full documentation of app, components, handlers, etc. (info buttons)

## Prefabs & Components

- [ ] Common gameplay components
- [ ] Reusable asset library
- [ ] Built-in icon pack
- [ ] text to speech support
- [ ] container system

## Compilation

- [ ] Everything evaluated inside engine
- [ ] TypeScript parser
- [ ] Visual scripting system
- [ ] Code blocks → generated source
- [ ] Compile to optimized import map
- [ ] Strip comments during build

## Performance

- [ ] offscreen culling
  - [ ] component to keep alive
- [ ] sprite batching
- [ ] texture batching
- [ ] lazy loading

## Networking & Backend

- [ ] Node.js backend
- [ ] Local live server
- [ ] Save to local server endpoint
- [ ] Save to custom URL endpoint
- [ ] Run script (.bat)
- [ ] project templates (card game, 2d isometric game, etc.)

## Editor Extensions

Backend-hosted extensions system: `source/extensions/*`, loaded by
`source/server/manager/ExtensionHandler.ts`, launched from the editor's
toolbar via `ExtensionsModal.tsx`. Each item below can be built as its own
extension instead of needing engine/editor changes.

- [ ] Sprite creator
- [ ] Texture creator
- [ ] Tilemap creator
- [ ] voice to synth
- [ ] visual Animation editor
- [ ] TODO/Trello board (see [Next Session](#next-session-feature-expansion) above)
- [ ] google magenta tensorflow running in browser for music generation
- [ ] drums too

## Other Engine Items

- [ ] Custom save format
- [ ] Documentation
- [ ] Ability to keep alive scenes after switching / auto scene cache
- [ ] spriterenderer filter component

---

## Explicitly Deferred

Not needed for the current jam/milestone: Physics, Pathfinding (duplicate —
tracked above), Undo/redo (tracked above), comfyui/magenta stuff (partially
tracked above under Editor Extensions).

## Later / Harder Future

- [ ] visual node editor / extension basework (used for textures too)
- AI-assisted workflows: build scene tree, write scripts, run tests, debug editor
- comfyui pixel art builder
