# Engine Roadmap

## Next
"Implement a react frontend and update my express backend to work within the react frontend,
add flexible GUI that is component based. Look at the structure of scenes, components, and scripts
and make the GUI automatically comform to the structure. Make it look very nice, use tailwind, have a
very adjustable tailwind config. Implement an extension system to add new functionality to the engine.
Possibly use 'https://codemirror.net' for the editor with an option to open in vscode.
As the test extension (but also a real extension thats built in). Use https://reactflow.dev for a texture building system that should load into an asset on runtime / procedural texture generation through asset manager like. project/test/textures/texture.json
then compile that into a function and add it to the asset manager.
After all of that, go into TODO.md and check off the items you completed"

- ability to create scripts and entities
- should be able to duplicate and move
- should be able to start typing in script and component lookup
- should be able to edit prefabs

## Reported Bugs
- [ ] When switching scene laggy with spawning script, newly spawned entities will be in wrong scene 

## Highest Priority

- [ ] Graphics framework first (foundation)
  - [ ] entity children
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

- [ ] Better GUI (possibly React)
- [ ] Styling/theme config
- [ ] VSCode integration
- [ ] Pause when editor window is blurred
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



