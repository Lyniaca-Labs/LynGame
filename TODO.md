# Engine Roadmap


LATER

- visual node editor / extension basework ( used for textures to)

## Reported Bugs
- [ ] When switching scene laggy with spawning script, newly spawned entities will be in wrong scene 

## Highest Priority 

- [ ] Graphics framework first (foundation)
  - [ ] entity children
  - [ ] event component (calls script on certain event to entity (hold, click, etc))
- [ ] Game framework built on graphics framework
  - [ ] init funciton loading animation (as LynGame)
- [ ] Engine GUI/editor on top of game framework
- [ ] Good overall architecture/design pattern
- [ ] Scene hierarchy (`Scene[] -> Entity[] -> Children[]`)
- [x] Components system
- [ ] Events system
- [ ] Physics
- [ ] Collision system
- [x] Global tick/frame system (`dt`)
- [x] Sprite renderer
- [x] Asset manager
- [ ] Z-index layers / multiple canvases
- [ ] Camera
  - [ ] part of scene, interacts with all transforms
- [ ] Custom save format
- [ ] Documentation
- [ ] Ability to keep alive scenes after switching / auto scene cache

---

## Editor

- [x] Better GUI (possibly React)
- [x] Styling/theme config
- [ ] VSCode integration
- [ ] Pause when editor window is blurred
- [ ] auto focus viewport on run
- [ ] Loading screen with default engine loader/logo
- [ ] Debug mode
- [ ] Error handling
- [x] Performance monitor
- [ ] Live preview

---

## Core Features

- [ ] SpriteSheets
- [ ] Tilemaps
- [ ] Texture system (runtime clipped sprites)
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
- [ ] Texture blocks → generated textures
- [ ] Compile to optimized import map
- [ ] Strip comments during build

---

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

---



