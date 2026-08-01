import { Component } from "../types/Component.js";

export class ShapeRenderer extends Component {
  static schema = {
    // shape: { type: "string", default: "rect", description: "\"rect\" or \"circle\"." },
    shape: { 
      type: "select", default: "rect", description: "\"rect\" or \"circle\".", 
      options: [{ value: "rect", label: "Rectangle" }, { value: "circle", label: "Circle" }] 
    },
    width: { type: "number", default: 32, description: "Width in pixels (diameter, for circles)." },
    height: { type: "number", default: 32, description: "Height in pixels. Ignored for circles (width is used as the diameter)." },
    color: { type: "color", default: "#fff", description: "Fill color." },
    cornerRadius: { type: "number", default: 0, description: "Corner radius in pixels, for rects. Ignored for circles." },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns shape, width, height, color, cornerRadius
  }

  render(ctx, transform, entity, engine) {
    const camera = engine.camera;
    const offsetX = !transform.fixed && camera ? camera.x : 0;
    const offsetY = !transform.fixed && camera ? camera.y : 0;

    ctx.save();
    ctx.translate(transform.x - offsetX, transform.y - offsetY);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.fillStyle = this.color;

    if (this.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.cornerRadius > 0) {
      const r = Math.min(this.cornerRadius, this.width / 2, this.height / 2);
      ctx.beginPath();
      ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, r);
      ctx.fill();
    } else {
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    }

    ctx.restore();
  }
}