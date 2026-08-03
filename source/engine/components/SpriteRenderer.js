import { Component } from "../types/Component.js";

export class SpriteRenderer extends Component {
  static schema = {
    sprite: { type: "string", default: "", description: "The key of the sprite image to render. Can also be a spritesheet asset — see `frame`." },
    frame: { type: "string", default: "", description: "Frame name to draw when `sprite` is a spritesheet asset. Ignored for plain image assets; empty selects the sheet's first frame." },
    width: { type: "number", default: 32, description: "Render width in pixels. The sprite is centered on the entity's Transform." },
    height: { type: "number", default: 32, description: "Render height in pixels. The sprite is centered on the entity's Transform." },
    repeat: { type: "boolean", default: false, description: "Tile the sprite across width/height (via a canvas pattern) instead of stretching one copy to fit — for small seamless textures used as a floor/background fill. Ignored for spritesheet assets." },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns sprite, frame, width, height, repeat
    this.color = "#fff";
    this._resolved = null; // cached engine.assets.get(sprite) lookup — an Image, or { image, meta } for a spritesheet
    this._pattern = null; // cached CanvasPattern for repeat mode, invalidated if _resolved changes
    this._patternSource = null;
  }

  render(ctx, transform, entity, engine) {
    if (this.sprite === "") return; // don't render if sprite key is empty
    const assetLoader = engine.assets;
    if (this.sprite && !this._resolved) {
      const asset = assetLoader.get(this.sprite);
      if (asset) this._resolved = asset;
    }

    const camera = engine.camera;
    const offsetX = !transform.fixed && camera ? camera.x : 0;
    const offsetY = !transform.fixed && camera ? camera.y : 0;

    ctx.save();
    ctx.translate(transform.x - offsetX, transform.y - offsetY);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    if (this._resolved && this._resolved.meta) {
      // Spritesheet asset: slice one cell out of the sheet image.
      const { image, meta } = this._resolved;
      const frameDef = meta.frames.find((f) => f.name === this.frame) ?? meta.frames[0];
      if (frameDef) {
        const col = frameDef.index % meta.columns;
        const row = Math.floor(frameDef.index / meta.columns);
        ctx.drawImage(
          image,
          col * meta.cellWidth, row * meta.cellHeight, meta.cellWidth, meta.cellHeight,
          -this.width / 2, -this.height / 2, this.width, this.height
        );
      }
    } else if (this._resolved && this.repeat) {
      if (this._patternSource !== this._resolved) {
        this._pattern = ctx.createPattern(this._resolved, "repeat");
        this._patternSource = this._resolved;
      }
      if (this._pattern) {
        ctx.fillStyle = this._pattern;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      }
    } else if (this._resolved) {
      ctx.drawImage(this._resolved, -this.width / 2, -this.height / 2, this.width, this.height);
    } else {
      // TODO: replace with a placeholder image or sprite if the sprite is not found
      ctx.fillStyle = "black";
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    }

    ctx.restore();
  }
}