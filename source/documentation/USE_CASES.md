# Use cases

Concrete "I want to do X" recipes — which components/modules to combine and
roughly how. Component field names are given so you can go straight to
scene JSON or `addComponent()` calls; full schemas are in
[components/](components/README.md) if you need a field not mentioned here.

## Card-game recipes

### Hand of cards

```js
const hand = handEntityIds.map(id => engine.getEntity(id));
engine.gui.layoutHand(hand, { centerX: 400, centerY: 550, spacing: 65, maxAngle: 18, arcHeight: 20 });
```
Call this again every time a card is drawn/played/discarded — it's a
one-shot arrangement, not a live component. Each card entity needs a
`Transform` (that's all `layoutHand` touches) plus whatever renders it
(`SpriteRenderer`/`ShapeRenderer` + child `TextRenderer` for cost/text) and
an `Interactable` for picking it up. See [modules/gui.md](modules/gui.md).

### Drag a card to play it, snap back if dropped in an invalid zone

`Interactable` with `onDragStart`/`onDrag`/`onDragEnd`:
```json
"Interactable": {
  "dragThreshold": 15,
  "onDragStart": "entity.state.startX = entity.getComponent('Transform').x; entity.state.startY = entity.getComponent('Transform').y;",
  "onDrag": "const t = entity.getComponent('Transform'); t.x += data.dx; t.y += data.dy;",
  "onDragEnd": "const t = entity.getComponent('Transform'); const valid = data.y < 400; if (!valid) { entity.getComponent('Animator').animate(t, 'x', entity.state.startX, {duration:0.2}); entity.getComponent('Animator').animate(t, 'y', entity.state.startY, {duration:0.2}); }"
}
```
Needs a sibling `Animator` for the snap-back tween. `entity.state` is a
free-form per-entity bag — perfect for stashing the pre-drag position.
See [Interactable.md](components/Interactable.md), [Animator.md](components/Animator.md).

### Card hover: lift + highlight

```json
"Interactable": {
  "onHoverEnter": "const a = entity.getComponent('Animator'); const t = entity.getComponent('Transform'); a.animate(t, 'y', t.y - 15, {duration:0.12, easing:'easeOut'});",
  "onHoverExit": "const a = entity.getComponent('Animator'); const t = entity.getComponent('Transform'); a.animate(t, 'y', t.y + 15, {duration:0.12, easing:'easeOut'});"
}
```
Careful with symmetric `+15`/`-15` if other code also moves `y` (e.g.
`layoutHand`) between hover events — for anything more than a quick demo,
stash the pre-hover `y` in `entity.state` instead of assuming symmetry.

### Deck and discard piles

```js
engine.gui.layoutStack(deckEntities, { x: 100, y: 500 });
engine.gui.layoutStack(discardEntities, { x: 700, y: 500 });
```
Re-call whenever a card moves between piles. See [modules/gui.md](modules/gui.md#layoutstackentities-options--).

### Card flip (face-down to face-up)

Two-step scale-x tween via `Animator.animate` (fake a flip without a 3D
engine): shrink `width`-equivalent to 0, swap the sprite/frame, grow back.
```js
const anim = entity.getComponent("Animator");
const sr = entity.getComponent("SpriteRenderer");
anim.animate(sr, "width", 0, { duration: 0.1, onComplete: () => {
  sr.frame = "face_up";
  anim.animate(sr, "width", 64, { duration: 0.1 });
}});
```

### HUD: score, turn indicator, deck count

```json
{ "id": "scoreLabel", "components": {
  "Transform": { "x": 0, "y": 0 },
  "Anchor": { "anchor": "top-right", "offsetX": -12, "offsetY": 12 },
  "TextRenderer": { "text": "Score: 0", "fontSize": 18, "align": "right" }
}}
```
Update `.text` from a script each time score changes. See
[Anchor.md](components/Anchor.md), [TextRenderer.md](components/TextRenderer.md).

### Particle effect on card play

```js
// onClick or a "play card" script
engine.query("cardPlayEmitter:Emitter")?.trigger();
```
Position a reusable `Emitter` entity (mode `burst`, `burstInterval: 0`) at
the play zone, or spawn/move one per card. See
[Emitter.md](components/Emitter.md) and `source/projects/test/scenes/particles.json`
for a full working example (confetti-burst-on-click pattern).

### Card collides with / drops onto a play-zone

Two entities with `Collision` (`resolve: false` — detection only, not
physical pushing):
```json
"Collision": { "group": "card", "collidesWith": "playzone", "shape": "auto" }
```
```json
"Collision": { "group": "playzone", "onCollide": "if (!entity.state.occupied) { entity.state.occupied = true; /* accept the card */ }" }
```
Remember `onCollide` fires **every frame** of overlap, not just on first
touch — track your own "already handled" flag in `entity.state` if you
need edge-triggering. See [Collision.md](components/Collision.md).

## General component use cases

### Transform
- Anything with a position needs one. Read `getWorldTransform()` for a
  parented entity's true screen position, not the raw component.

### Movement
- Falling/thrown objects (`gravity`), knockback (`applyForce` once),
  player-controlled movement (`accelerateInDirection` from
  `engine.input` each tick), sliding-to-a-stop UI elements (`friction`,
  no gravity).

### Follow
- A label/health-bar that tracks a moving unit, a camera **rig** entity
  (separate from the `Camera` itself) for smoothed camera movement, a
  cursor-trailing effect (`targetId` pointing at a script-updated dummy
  entity positioned at `engine.input.pointer`).

### Collision
- Hit detection (projectile vs enemy), trigger zones (drop targets, level
  exits), physical bumping (`resolve: true` for two dynamic bodies, or one
  `isStatic` wall).

### Interactable
- Any clickable/draggable/hoverable UI or game object. `holdThreshold` for
  a press-and-hold action (charge attack, tooltip-after-delay).

### ShapeRenderer / SpriteRenderer
- ShapeRenderer for placeholders, debug boxes, flat-color panels,
  particles. SpriteRenderer for real art; add `SpriteAnimation` for
  animated art (idle loops, attack frames) from a spritesheet.

### TextRenderer
- Card text, damage numbers (spawn a short-lived entity with `TextRenderer`
  + `Movement` drifting upward + `Opacity` fading out — same pattern as a
  manual one-off particle), tooltips, dialogue.

### Animator
- Any "animate this number from A to B" need: position bumps, fade
  in/out (tween `Opacity.value`), scale pulses, health bar draining
  (`animate(healthBarShapeRenderer, "width", newWidth)`). Use keyframe
  `play()` clips instead of `animate()` when the same multi-property
  sequence needs to run identically many times (e.g. every card's play
  animation) — author once in `animations/`, play by name everywhere.

### Camera
- One per scene (or one that gets `setCamera()`'d to different entities as
  the "focus" changes — e.g. following whichever card is currently
  animating). No smoothing built in — pair with `Follow` on a rig entity if
  you want eased motion (see [Camera gotchas](components/Camera.md#gotchas)).

### Anchor
- Any screen-space HUD element (score, buttons, pause menu, turn banner)
  that must ignore camera panning.

### Layout
- Auto-arranging an inventory grid, a settings menu's button list, a
  row of turn-order portraits — anything axis-aligned that should
  re-flow live as children are added/removed. For a fanned hand of cards
  specifically, prefer `engine.gui.layoutHand` (see above) — `Layout`
  can't produce the curved/rotated look.

### Opacity
- Fade-in on spawn, fade-out on death/discard, dimming an unusable card.
  Remember it doesn't cascade to children (see
  [Opacity gotchas](components/Opacity.md#gotchas)) — fade each visible
  child separately if an entity has them.

### Emitter
- Confetti/sparkle on a good play, smoke/dust on a discard, an ambient
  background effect, a screen-wide one-shot "level complete" burst. See
  [Emitter.md](components/Emitter.md) for the full particle-type schema.

## See also

- [components/README.md](components/README.md) — cheat sheet + full schemas
- `source/projects/test/scenes/particles.json` — a real, runnable multi-emitter example
