import { Component } from "../types/Component.js";

export class SpriteRenderer extends Component {
  constructor({ width = 32, height = 32, color = "#fff" } = {}) {
    super();
    this.width = width;
    this.height = height;
    this.color = color;
  }

  render(ctx, transform) {
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }
}