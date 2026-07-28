import { Component } from "../types/Component.js";

export class Transform extends Component {
  static schema = {
    x: { type: "number", default: 0, description: "X position. Relative to the parent entity, if this entity has one." },
    y: { type: "number", default: 0, description: "Y position. Relative to the parent entity, if this entity has one." },
    rotation: { type: "number", default: 0, description: "Rotation in degrees. Relative to the parent entity, if this entity has one." },
    fixed: { type: "boolean", default: false, description: "If true, this entity ignores camera panning (screen-space UI)." },
    zIndex: { type: "number", default: 0, description: "Draw order within the layer. Higher values draw on top of lower ones (ties keep spawn order)." },
  };
  constructor({ x = 0, y = 0, rotation = 0, fixed = false, zIndex = 0 } = {}) {
    super();
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.fixed = fixed;
    this.zIndex = zIndex;
  }

  // TODO: move camera calculations to here instead of renderers
  getRawPosition() {
    return { x: this.x, y: this.y };
  }

  getPosition(engine) {
    const camera = engine.camera;
    const offsetX = !this.fixed && camera ? camera.x : 0;
    const offsetY = !this.fixed && camera ? camera.y : 0;
    return { x: this.x + offsetX, y: this.y + offsetY };
  }
}