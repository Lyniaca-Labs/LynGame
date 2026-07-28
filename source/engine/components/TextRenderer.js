import { Component } from "../types/Component.js";

// Tracks which Google Font families have already been requested/injected
// so multiple TextRenderer instances don't spam duplicate <link> tags.
const _loadedFontFamilies = new Set();
const _fontLoadPromises = new Map();

function loadGoogleFont(family, weight = "400") {
  if (!family) return Promise.resolve();

  const cacheKey = `${family}:${weight}`;
  if (_fontLoadPromises.has(cacheKey)) return _fontLoadPromises.get(cacheKey);

  const promise = new Promise((resolve) => {
    if (!_loadedFontFamilies.has(family)) {
      _loadedFontFamilies.add(family);
      const link = document.createElement("link");
      const familyParam = family.trim().replace(/\s+/g, "+");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
      document.head.appendChild(link);
    }

    // Ask the browser to actually fetch/parse the font file at this weight/size,
    // since the stylesheet alone only registers the @font-face rule.
    if (document.fonts && document.fonts.load) {
      document.fonts
        .load(`${weight} 16px "${family}"`)
        .then(() => resolve())
        .catch(() => resolve()); // don't block rendering forever if font fails
      // Safety timeout in case the font never resolves (offline, typo, etc.)
      setTimeout(resolve, 2000);
    } else {
      resolve();
    }
  });

  _fontLoadPromises.set(cacheKey, promise);
  return promise;
}

export class TextRenderer extends Component {
  static schema = {
    text: { type: "string", default: "" },

    // Font
    fontFamily: { type: "string", default: "sans-serif" }, // set to a Google Font name to auto-load it
    googleFont: { type: "boolean", default: false }, // true = fetch fontFamily from Google Fonts
    fontSize: { type: "number", default: 16 },
    fontWeight: { type: "string", default: "400" }, // "400", "700", "bold", etc.
    fontStyle: { type: "string", default: "normal" }, // "normal" | "italic" | "oblique"

    // Color / stroke / shadow
    color: { type: "color", default: "#fff" },
    strokeColor: { type: "color", default: "" }, // empty = no stroke
    strokeWidth: { type: "number", default: 0 },

    // Layout / box model
    align: { type: "string", default: "left" }, // "left" | "center" | "right"
    verticalAlign: { type: "string", default: "top" }, // "top" | "middle" | "bottom"
    lineHeight: { type: "number", default: 1.2 }, // multiplier of fontSize
    letterSpacing: { type: "number", default: 0 }, // px

    // Wrapping / overflow
    maxWidth: { type: "number", default: 0 }, // 0 = no wrap/no limit
    maxHeight: { type: "number", default: 0 }, // 0 = unlimited height
    wrap: { type: "boolean", default: true }, // wrap onto multiple lines within maxWidth
    ellipsis: { type: "boolean", default: false }, // truncate with "…" if it overflows maxWidth/maxHeight

    // Text transform (CSS-style)
    textTransform: { type: "string", default: "none" }, // "none" | "uppercase" | "lowercase" | "capitalize"
  };

  constructor(overrides = {}) {
    super(overrides); // assigns all schema fields
    this._fontLoaded = !this.googleFont; // non-google fonts are "ready" immediately
    this._lines = null; // cached wrapped lines
    this._cacheKey = null; // invalidation key for re-wrapping

    if (this.googleFont) {
      loadGoogleFont(this.fontFamily, this.fontWeight).then(() => {
        this._fontLoaded = true;
        this._lines = null; // force re-measure once font swaps in
      });
    }
  }

  // Call this if you change `sprite`-equivalent fields (text, fontFamily, etc.)
  // at runtime and want to force a re-wrap/measure on next render.
  invalidate() {
    this._lines = null;
  }

  _applyTransform(str) {
    switch (this.textTransform) {
      case "uppercase":
        return str.toUpperCase();
      case "lowercase":
        return str.toLowerCase();
      case "capitalize":
        return str.replace(/\b\w/g, (c) => c.toUpperCase());
      default:
        return str;
    }
  }

  _font() {
    return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px "${this.fontFamily}"`;
  }

  _measure(ctx, str) {
    ctx.font = this._font();
    const width = ctx.measureText(str).width;
    // approximate letter-spacing addition (canvas letterSpacing support varies)
    const extra = this.letterSpacing * Math.max(str.length - 1, 0);
    return width + extra;
  }

  _truncateWithEllipsis(ctx, str, maxWidth) {
    if (this._measure(ctx, str) <= maxWidth) return str;
    let lo = 0,
      hi = str.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = str.slice(0, mid) + "…";
      if (this._measure(ctx, candidate) <= maxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo <= 0 ? "…" : str.slice(0, lo) + "…";
  }

  _wrapLines(ctx) {
    const cacheKey = JSON.stringify([
      this.text,
      this.fontFamily,
      this.fontSize,
      this.fontWeight,
      this.fontStyle,
      this.maxWidth,
      this.maxHeight,
      this.wrap,
      this.ellipsis,
      this.lineHeight,
      this.letterSpacing,
      this.textTransform,
    ]);
    if (this._lines && this._cacheKey === cacheKey) return this._lines;

    const transformed = this._applyTransform(this.text);
    const paragraphs = transformed.split("\n");
    let lines = [];

    if (!this.maxWidth || !this.wrap) {
      lines = paragraphs;
    } else {
      for (const para of paragraphs) {
        const words = para.split(" ");
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (this._measure(ctx, test) <= this.maxWidth || !current) {
            current = test;
          } else {
            lines.push(current);
            current = word;
          }
        }
        lines.push(current);
      }
    }

    // Height clamp: drop/ellipsis lines that exceed maxHeight
    if (this.maxHeight) {
      const lineHeightPx = this.fontSize * this.lineHeight;
      const maxLines = Math.max(1, Math.floor(this.maxHeight / lineHeightPx));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        if (this.ellipsis) {
          const last = lines[lines.length - 1];
          lines[lines.length - 1] = this._truncateWithEllipsis(
            ctx,
            last,
            this.maxWidth || Infinity
          );
        }
      }
    }

    // Per-line width ellipsis (single-line overflow case, e.g. no wrap)
    if (this.ellipsis && this.maxWidth && !this.wrap) {
      lines = lines.map((l) => this._truncateWithEllipsis(ctx, l, this.maxWidth));
    }

    this._lines = lines;
    this._cacheKey = cacheKey;
    return lines;
  }

  // --- Public measurement API (CSS-box-model style getters) ---

  getWidth(ctx) {
    if (!ctx) return 0;
    const lines = this._wrapLines(ctx);
    return Math.max(0, ...lines.map((l) => this._measure(ctx, l)));
  }

  getLineHeight() {
    return this.fontSize * this.lineHeight;
  }

  getHeight(ctx) {
    if (!ctx) return 0;
    const lines = this._wrapLines(ctx);
    return lines.length * this.getLineHeight();
  }

  getBounds(ctx) {
    return { width: this.getWidth(ctx), height: this.getHeight(ctx) };
  }

  render(ctx, transform, entity, engine) {
    if (!this.text) return;

    const camera = engine.camera;
    const offsetX = !transform.fixed && camera ? camera.x : 0;
    const offsetY = !transform.fixed && camera ? camera.y : 0;

    ctx.save();
    ctx.translate(transform.x - offsetX, transform.y - offsetY);
    ctx.rotate((transform.rotation * Math.PI) / 180);

    ctx.font = this._font();
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${this.letterSpacing}px`;

    if (this.align === "center") ctx.textAlign = "center";
    else if (this.align === "right") ctx.textAlign = "right";
    else ctx.textAlign = "left";

    const lines = this._wrapLines(ctx);
    const lineHeightPx = this.getLineHeight();
    const totalHeight = lines.length * lineHeightPx;

    // vertical alignment: block starts at (0,0) by convention, like the
    // shape/sprite renderers center on the transform origin via width/height,
    // so we offset the whole block based on verticalAlign.
    let startY;
    if (this.verticalAlign === "middle") startY = -totalHeight / 2 + this.fontSize;
    else if (this.verticalAlign === "bottom") startY = -totalHeight + this.fontSize;
    else startY = 0; // "top"

    // horizontal anchor offset (align affects ctx.textAlign, but we still need
    // an x origin consistent with maxWidth boxing, similar to width/2 centering)
    let anchorX = 0;
    if (this.maxWidth) {
      if (this.align === "center") anchorX = this.maxWidth / 2 - this.maxWidth / 2; // 0, kept for clarity/override point
      if (this.align === "right") anchorX = 0;
    }

    ctx.fillStyle = this.color;
    lines.forEach((line, i) => {
      const y = startY + i * lineHeightPx;
      if (this.strokeColor && this.strokeWidth > 0) {
        ctx.strokeStyle = this.strokeColor;
        ctx.lineWidth = this.strokeWidth;
        ctx.strokeText(line, anchorX, y);
      }
      ctx.fillText(line, anchorX, y);
    });

    ctx.restore();
  }
}