import { Component } from "../types/Component.js";

export class SpriteRenderer extends Component {
  constructor({ sprite, width = 32, height = 32, color = "#fff" } = {}) {
    super();
    this.spriteKey = sprite ?? null;
    this.width = width;
    this.height = height;
    this.color = color;
    this._image = null; // cached lookup, resolved lazily on first render
  }

  render(ctx, transform, entity) {
    if (this.spriteKey && !this._image) {
      const img = entity.engine.assets.get(this.spriteKey);
      if (img) this._image = img;
    }

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    if (this._image) {
      ctx.drawImage(this._image, 0, 0, this.width, this.height);
    } else {
      // no sprite key given, or asset not loaded yet — fall back to a solid rect
      ctx.fillStyle = this.color;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }
}