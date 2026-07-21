import { Component } from "../types/Component.js";

export class ShapeRenderer extends Component {
  constructor({ shape = "rect", width = 32, height = 32, color = "#fff" } = {}) {
    super();
    this.shape = shape;
    this.width = width;
    this.height = height;
    this.color = color;
  }

  render(ctx, transform) {
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.fillStyle = this.color;

    if (this.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }
}