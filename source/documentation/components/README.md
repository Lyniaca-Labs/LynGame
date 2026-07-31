# Components index

Every built-in engine component lives in `source/engine/components/*.js` and
is registered in `source/engine/types/DefaultComponents.js`. Add any of
them to an entity via `entity.addComponent(ClassName, {...overrides})` at
runtime, or by name in scene/prefab JSON's `"components"` object. See
[../ENTITY_API.md](../ENTITY_API.md) for the add/get/remove API and
[../SCRIPTING.md](../SCRIPTING.md) for lifecycle hook signatures shared by
all components (`onSpawn`, `onTick`, `onDestroy`, `render`).

**Only open the file(s) for the component(s) you're actually working with.**

| Component | One-line purpose |
|---|---|
| [Transform](Transform.md) | Position, rotation, draw order — the spatial backbone almost everything else reads/writes. |
| [Movement](Movement.md) | Velocity/force physics: gravity, drag, friction, max-speed clamp. |
| [Follow](Follow.md) | Smoothly moves toward another entity's position (exponential/spring/max-speed). |
| [Collision](Collision.md) | AABB/circle overlap detection + optional push-apart resolution, group filtering, `onCollide` hook. |
| [Interactable](Interactable.md) | Click, hover, hold, drag — pointer input with `code` hooks. |
| [ShapeRenderer](ShapeRenderer.md) | Draws a filled rect or circle. |
| [SpriteRenderer](SpriteRenderer.md) | Draws an image or one frame of a spritesheet. |
| [SpriteAnimation](SpriteAnimation.md) | Plays a spritesheet frame-sequence clip on a sibling `SpriteRenderer`. |
| [Animator](Animator.md) | Imperative property tweens + project-level keyframe clip playback. |
| [TextRenderer](TextRenderer.md) | Canvas text: wrapping, ellipsis, stroke, alignment, Google Fonts. |
| [Camera](Camera.md) | Centers the viewport on a target entity. One active camera engine-wide. |
| [Anchor](Anchor.md) | Pins an entity to a viewport corner/edge (screen-space HUD). |
| [Layout](Layout.md) | Auto-arranges an entity's children (flexbox-like `flow`, or `grid`). |
| [Opacity](Opacity.md) | Single transparency multiplier applied to everything an entity renders. |
| [Emitter](Emitter.md) | Particle system — weighted multi-type spawning, physics, lifecycle. |

## Cheat sheet: which component for which job

- **Move something with physics** → Movement (+ Collision if it needs to hit things)
- **Detect/react to overlap** → Collision
- **Click/drag/hover a card or button** → Interactable
- **Draw card art** → SpriteRenderer (+ SpriteAnimation for animated art)
- **Draw text** → TextRenderer
- **Draw a flat-color placeholder/panel/particle** → ShapeRenderer
- **Animate a property over time (flip, slide, drain)** → Animator
- **Track another entity smoothly** → Follow
- **Screen-space HUD element** → Anchor (+ Transform.fixed implied)
- **Arrange a row/grid of children automatically** → Layout (or `engine.gui.layoutHand/Row/Stack` for a one-shot, non-live arrangement — see [modules/gui.md](../modules/gui.md))
- **Fade something in/out** → Opacity (+ Animator to tween `Opacity.value`)
- **Sparkle/confetti/smoke/burst effect** → Emitter
- **Follow the player/scene focal point** → Camera
