import { Component } from "../types/Component.js";

export class Transform extends Component {
  static schema = {
    x: { type: "number", default: 0 },
    y: { type: "number", default: 0 },
    rotation: { type: "number", default: 0 },
    fixed: { type: "boolean", default: false }, // if true, this transform won't be affected by camera
  };
  constructor({ x = 0, y = 0, rotation = 0, fixed = false } = {}) {
    super();
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.fixed = fixed;
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