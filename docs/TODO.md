# Engine Roadmap

## ULTRA PRIORITY (3-Day Jam: Card Game / Time-Strategy / Deck Builder)

### Must-have to build the game at all
- [x] Text components / font loading — card names, costs, stats, descriptions
- [x] Event component (click, hold, drag/release) — picking up & playing cards
- [ ] Entity children — compose a card from bg + art + text + icons as one unit
- [ ] Z-index layers / multiple canvases — card stacking, hand fanning, dragged-card-on-top
- [ ] GUI helper/system — hand layout, deck/discard pile counters, buttons, turn/timer UI
- [ ] Global scripts not attached to an entity — game manager (turn order, timers, win condition)
  - [ ] attach scripts to scenes -> callable in scene
  - [ ] attach scripts to game/engine -> callable from anywhere

### Must-fix bugs (actively block building the game)
- [ ] Cannot scroll in code editor
- [ ] Scene switching laggy / spawned entities end up in wrong scene

### Needed to actually ship/submit
- [ ] Export project to zip (with live server to run it)

### High-value if time allows
- [ ] Move entities around/between scenes, duplicate, copy/paste — massive speed-up for laying out cards & board
- [ ] Audio system — basic SFX for playing cards / timers
- [ ] SpriteSheets — faster card art iteration than one texture per card
- [ ] Collision/simple hit-detection — drop zones for cards (could piggyback on event component instead if time-crunched)

### Explicitly defer (not needed for this jam)
Tilemaps, Physics, Pathfinding, Inverse Kinematics, Particles, Screen effects, Keyframe animation, Undo/redo, ESLint, Visual scripting, TypeScript parser, Node backend/save endpoints, Editor extensions (sprite/texture/tilemap/audio creators), Icon pack, comfyui/magenta stuff.

LATER

- visual node editor / extension basework ( used for textures to)

## Reported Bugs
- [ ] When switching scene laggy with spawning script, newly spawned entities will be in wrong scene 
- [ ] cannot scroll in code editor
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
    - [ ] attach scripts to scenes -> callable in scene
    - [ ] attach scripts to game / engine -> callable from anywhere
  - [ ] entity children
  - [ ] icons for premade components
  - [ ] add static component description alongside schema
  - [ ] shadow component > renders a pixelated or high def shadow underneath
  - [x] event component (calls script on certain event to entity (hold, click, etc))
  - [ ] dropdown type for component schema -> dropdown options
  - [ ] ability to turn off antialiasing in config / set frame rate and tick speed
  - [ ] keyframes for animation
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
  - [ ] ability to move entities around, around scenes, duplicate, copy, paste
  - [ ] little icons for tabs on explorer
    - [ ] camera icon for cameras
    - [ ] entity icon for entities
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
- [ ] Scene hierarchy (`Scene[] -> Entity[] -> Children[]`)
- [x] Components system
- [x] Events system
  - [ ] include in visual scripter
- [ ] Physics
- [ ] Collision system
- [x] Global tick/frame system (`dt`)
- [x] Sprite renderer
- [x] Asset manager
- [ ] Z-index layers / multiple canvases
- [x] Camera
  - [x] part of scene, interacts with all transforms
- [ ] Custom save format
- [ ] Documentation
- [ ] Ability to keep alive scenes after switching / auto scene cache

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
- [ ] Live preview
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
- [ ] GUI helper/system
- [ ] Y-offset Z-level sorting
- [x] Global scene switching
- [x] Global script calls
- [ ] have ai go through and make full documentation of app, components, handlers, etc... (info buttons)

---

## Prefabs & Components

- [x] Prefab system
- [ ] Entity inheritance
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

---

## Editor Extensions

- [ ] Sprite creator
- [ ] Texture creator
- [ ] Tilemap creator
- [ ] Audio creator 
- [ ] Pixel art editor
- [ ] Animation editor
- [ ] google magenta tensorflow running in browser for music generation
- [ ] drums too

AI (harder future)

build scene tree
writes scripts
runs test
debugs editor

comfyui pixel art builder

