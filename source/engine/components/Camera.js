import { Component } from "../types/Component.js";
import { Transform } from "./Transform.js";

export class Camera extends Component {
  static schema = {
    zoom: { type: "number", default: 1 },
    offset: { type: "vector", default: { x: 0, y: 0 } },
    bounds: { type: "object", default: null },
    target: { type: "string", default: null }, // optional entity this camera follows, set via follow()
  };

  constructor(overrides = {}) {
    super(overrides); // assigns zoom, offset, bounds
    this.target = overrides.target || null; // optional entity this camera follows, set via follow()
    this.x = 0;
    this.y = 0;
  }

  follow(entity) {
    this.target = entity;
  }

  onTick(entity, engine, dt) {
    if (typeof this.target === "string") {
      this.target = engine.getEntity(this.target);
    }

    const { x, y } = this.calculatePosition(entity, engine, dt);
    this.x = x;
    this.y = y;
  }

  calculatePosition(entity, engine, dt) {
    const source = this.target ?? entity;

    const transform = source?.getComponent(Transform);
    const baseX = transform ? transform.x : 0;
    const baseY = transform ? transform.y : 0;

    // screen/viewport size, not the entity's size
    const { width: screenWidth, height: screenHeight } = engine.getViewportSize();

    return {
      x: baseX + this.offset.x - screenWidth / 2,
      y: baseY + this.offset.y - screenHeight / 2,
    };
  }

  followEntity(entity) {
    this.target = entity;
  }
  unfollow() {
    this.target = null;
  }
}