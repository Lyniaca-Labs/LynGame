import { Component } from "../types/Component.js";

export class Transform extends Component {
  static schema = {
    x: { type: "number", default: 0 },
    y: { type: "number", default: 0 },
    rotation: { type: "number", default: 0 },
  };
  constructor({ x = 0, y = 0, rotation = 0 } = {}) {
    super();
    this.x = x;
    this.y = y;
    this.rotation = rotation;
  }
}