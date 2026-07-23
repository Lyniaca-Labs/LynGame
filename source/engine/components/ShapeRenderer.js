import { Component } from "../types/Component.js";

export class ShapeRenderer extends Component {
  static schema = {
    shape: { type: "string", default: "rect" }, // "rect" or "circle"
    width: { type: "number", default: 32 },
    height: { type: "number", default: 32 },
    color: { type: "string", default: "#fff" },
  };

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
      ctx.fillRect(
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height
      );
    }

    ctx.restore();
  }
}