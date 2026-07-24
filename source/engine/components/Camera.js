import { Component } from "../types/Component.js";
import { Transform } from "./Transform.js";

export class Camera extends Component {
  static schema = {
    zoom: { type: "number", default: 1 },
    offset: { type: "vector", default: { x: 0, y: 0 } },
    bounds: { type: "object", default: null },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns zoom, offset, bounds
    this.target = null; // optional entity this camera follows, set via follow()
    this.x = 0;
    this.y = 0;
  }

  follow(entity) {
    this.target = entity;
  }

  onTick(entity, engine, dt) {
    const { x, y } = this.calculatePosition(entity, engine, dt);
    this.x = x;
    this.y = y;
  }

  calculatePosition(entity, engine, dt) {
    const source = this.target ?? entity;
    const transform = source?.getComponent(Transform);

    const baseX = transform ? transform.x : 0;
    const baseY = transform ? transform.y : 0;

    return {
      x: baseX + this.offset.x,
      y: baseY + this.offset.y,
    };
  }
}