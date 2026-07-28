import { Component } from "../types/Component.js";

// Screen-space corner/edge positions this component understands. Kept as a
// flat lookup instead of a switch so adding a new anchor point is a one-line
// change.
const ANCHOR_FACTORS = {
  "top-left": { x: 0, y: 0 },
  "top-center": { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  "center-left": { x: 0, y: 0.5 },
  "center": { x: 0.5, y: 0.5 },
  "center-right": { x: 1, y: 0.5 },
  "bottom-left": { x: 0, y: 1 },
  "bottom-center": { x: 0.5, y: 1 },
  "bottom-right": { x: 1, y: 1 },
};

/**
 * Pins an entity to a corner/edge of the viewport (with a pixel offset from
 * that point), independent of camera panning and resolution — the basis for
 * HUD-style GUI: pile counters, turn/timer text, buttons that must stay put
 * regardless of where the camera is looking or how big the game window is.
 *
 * Every frame it writes directly into this entity's own Transform (x/y) and
 * forces `fixed = true` there, since screen-anchored UI should never be
 * shifted by camera movement. Add both Anchor and Transform to the same
 * entity; Anchor drives Transform, other components (TextRenderer,
 * ShapeRenderer, Interactable, ...) just read the Transform as usual.
 */
export class Anchor extends Component {
  static schema = {
    anchor: {
      type: "select",
      default: "top-left",
      description: "Which corner/edge of the viewport this entity sticks to.",
      options: Object.keys(ANCHOR_FACTORS).map((value) => ({ value, label: value })),
    },
    offsetX: { type: "number", default: 0, description: "Pixels to the right of the anchor point." },
    offsetY: { type: "number", default: 0, description: "Pixels below the anchor point." },
  };

  onTick(entity, engine) {
    const transform = entity.getComponent("Transform");
    if (!transform) return;

    const factor = ANCHOR_FACTORS[this.anchor] ?? ANCHOR_FACTORS["top-left"];
    const { width, height } = engine.getViewportSize();

    transform.x = width * factor.x + this.offsetX;
    transform.y = height * factor.y + this.offsetY;
    transform.fixed = true;
  }
}
