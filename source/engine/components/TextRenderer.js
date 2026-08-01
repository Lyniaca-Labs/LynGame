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
    text: { type: "string", default: "", description: "Text to render. Use \\n for line breaks." },

    // Font
    fontFamily: { type: "string", default: "sans-serif", description: "Font family name. Set googleFont to auto-load it from Google Fonts." },
    googleFont: { type: "boolean", default: false, description: "If true, fetches fontFamily from Google Fonts automatically." },
    fontSize: { type: "number", default: 16, description: "Font size in pixels." },
    fontWeight: { type: "string", default: "400", description: "\"400\", \"700\", \"bold\", etc." },
    fontStyle: { type: "string", default: "normal", description: "\"normal\" | \"italic\" | \"oblique\"." },

    // Color / stroke / shadow
    color: { type: "color", default: "#fff", description: "Fill color of the text." },
    strokeColor: { type: "color", default: "", description: "Outline color. Empty = no stroke." },
    strokeWidth: { type: "number", default: 0, description: "Outline width in pixels." },

    // Layout / box model
    align: { type: "string", default: "left", description: "\"left\" | \"center\" | \"right\"." },
    verticalAlign: { type: "string", default: "top", description: "\"top\" | \"middle\" | \"bottom\"." },
    lineHeight: { type: "number", default: 1.2, description: "Line height as a multiplier of fontSize." },
    letterSpacing: { type: "number", default: 0, description: "Extra spacing between letters, in pixels." },

    // Wrapping / overflow
    maxWidth: { type: "number", default: 0, description: "Max width in pixels before wrapping/ellipsis. 0 = no limit." },
    maxHeight: { type: "number", default: 0, description: "Max height in pixels before lines are dropped/ellipsized. 0 = unlimited." },
    wrap: { type: "boolean", default: true, description: "Wrap text onto multiple lines within maxWidth." },
    ellipsis: { type: "boolean", default: false, description: "Truncate with \"…\" if the text overflows maxWidth/maxHeight." },
    autoShrink: { type: "boolean", default: false, description: "If true and maxHeight is set, progressively shrinks fontSize (down to minFontSize) until the wrapped text fits within maxWidth/maxHeight, instead of dropping/ellipsizing lines." },
    minFontSize: { type: "number", default: 8, description: "Floor fontSize autoShrink won't go below." },

    // Text transform (CSS-style)
    textTransform: { type: "string", default: "none", description: "\"none\" | \"uppercase\" | \"lowercase\" | \"capitalize\"." },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns all schema fields
    this._fontLoaded = !this.googleFont; // non-google fonts are "ready" immediately
    this._lines = null; // cached wrapped lines
    this._cacheKey = null; // invalidation key for re-wrapping
    this._effectiveFontSize = this.fontSize; // set by autoShrink; falls back to fontSize

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
    const size = this._effectiveFontSize ?? this.fontSize;
    return `${this.fontStyle} ${this.fontWeight} ${size}px "${this.fontFamily}"`;
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

  // Word-wraps `paragraphs` at a specific font size (independent of
  // `this._effectiveFontSize`) — the building block autoShrink's search loop
  // below re-runs at each candidate size to see if it fits.
  _wrapAtSize(ctx, size, paragraphs) {
    if (!this.maxWidth || !this.wrap) return paragraphs;
    ctx.font = `${this.fontStyle} ${this.fontWeight} ${size}px "${this.fontFamily}"`;
    const measure = (str) => {
      const width = ctx.measureText(str).width;
      const extra = this.letterSpacing * Math.max(str.length - 1, 0);
      return width + extra;
    };
    const lines = [];
    for (const para of paragraphs) {
      const words = para.split(" ");
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (measure(test) <= this.maxWidth || !current) {
          current = test;
        } else {
          lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
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
      this.autoShrink,
      this.minFontSize,
    ]);
    if (this._lines && this._cacheKey === cacheKey) return this._lines;

    const transformed = this._applyTransform(this.text);
    const paragraphs = transformed.split("\n");

    let effectiveSize = this.fontSize;
    let lines = this._wrapAtSize(ctx, effectiveSize, paragraphs);

    // Shrink fontSize a pixel at a time until the wrapped block fits inside
    // maxHeight (or we hit the floor) — re-wrapping at each size since a
    // smaller font also fits more words per line.
    if (this.autoShrink && this.maxHeight) {
      const min = Math.max(1, Math.min(this.minFontSize || 8, this.fontSize));
      while (effectiveSize > min && lines.length * (effectiveSize * this.lineHeight) > this.maxHeight) {
        effectiveSize -= 1;
        lines = this._wrapAtSize(ctx, effectiveSize, paragraphs);
      }
    }
    this._effectiveFontSize = effectiveSize;

    // Height clamp: drop/ellipsis lines that exceed maxHeight
    if (this.maxHeight) {
      const lineHeightPx = effectiveSize * this.lineHeight;
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
    return (this._effectiveFontSize ?? this.fontSize) * this.lineHeight;
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
    ctx.font = this._font(); // _wrapLines may have shrunk _effectiveFontSize (autoShrink)
    const lineHeightPx = this.getLineHeight();
    const totalHeight = lines.length * lineHeightPx;
    const effectiveFontSize = this._effectiveFontSize ?? this.fontSize;

    // vertical alignment: block starts at (0,0) by convention, like the
    // shape/sprite renderers center on the transform origin via width/height,
    // so we offset the whole block based on verticalAlign.
    let startY;
    if (this.verticalAlign === "middle") startY = -totalHeight / 2 + effectiveFontSize;
    else if (this.verticalAlign === "bottom") startY = -totalHeight + effectiveFontSize;
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