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
}