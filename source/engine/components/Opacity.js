import { Component } from "../types/Component.js";

// Renders nothing itself — the engine special-cases it in _render(), wrapping
// this entity's other component renders in ctx.globalAlpha. Works with any
// renderer (Sprite/Shape/Text) and is tweenable via Animator, e.g.
// entity.getComponent("Animator").animate(entity.getComponent("Opacity"), "value", 0).
export class Opacity extends Component {
  static schema = {
    value: {
      type: "number",
      default: 1,
      description: "Opacity multiplier applied to this entity's rendered components, from 0 (invisible) to 1 (fully opaque).",
    },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns value
  }
}
