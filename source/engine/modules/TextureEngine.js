function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp255(v) { return Math.max(0, Math.min(255, v)); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2; const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3) * 255, hueToRgb(p, q, h) * 255, hueToRgb(p, q, h - 1 / 3) * 255];
}

export const LGTexture = {
  canvas(size) { const c = document.createElement("canvas"); c.width = size; c.height = size; const ctx = c.getContext("2d"); if (ctx) ctx.imageSmoothingEnabled = false; return c; },
  empty(size) { return this.canvas(size); },
  color(size, value) { const c = this.canvas(size), x = c.getContext("2d"); x.fillStyle = value; x.fillRect(0, 0, size, size); return c; },
  gradient(size, direction, from, to) { const c = this.canvas(size), x = c.getContext("2d"); const g = direction === "vertical" ? x.createLinearGradient(0, 0, 0, size) : direction === "diagonal" ? x.createLinearGradient(0, 0, size, size) : x.createLinearGradient(0, 0, size, 0); g.addColorStop(0, from); g.addColorStop(1, to); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; },
  radialGradient(size, from, to) { const c = this.canvas(size), x = c.getContext("2d"); const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, from); g.addColorStop(1, to); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; },
  channels(value) { const hex = String(value ?? "#000000").replace("#", ""); const n = Number.parseInt(hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  pixels(size, fn) { const c = this.canvas(size), x = c.getContext("2d"), image = x.createImageData(size, size); for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) { const [r, g, b] = fn(xx, y); image.data.set([r, g, b, 255], (y * size + xx) * 4); } x.putImageData(image, 0, 0); return c; },
  checker(size, tile, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); return this.pixels(size, (x, y) => (Math.floor(x / Math.max(2, tile)) + Math.floor(y / Math.max(2, tile))) % 2 ? b : a); },
  noise(size, seed, scale, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); return this.pixels(size, (x, y) => { const wave = Math.sin((x / Math.max(1, scale) + seed) * 12.9898 + (y / Math.max(1, scale) + seed) * 78.233) * 43758.5453; const amount = wave - Math.floor(wave); return a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount)); }); },
  random(size, seed, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); const rand = mulberry32(seed); return this.pixels(size, () => { const amount = rand(); return a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount)); }); },
  stripes(size, width, direction, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); const w = Math.max(1, width); return this.pixels(size, (x, y) => { const coord = direction === "vertical" ? y : direction === "diagonal" ? x + y : x; return Math.floor(coord / w) % 2 ? b : a; }); },
  asset(assets, key, size) { const source = assets?.[key]; if (!source) return this.empty(size); const c = this.canvas(size); c.getContext("2d").drawImage(source, 0, 0, size, size); return c; },
  adjust(input, size, mode, amount) {
    const c = this.canvas(size), x = c.getContext("2d");
    x.drawImage(input, 0, 0);
    const img = x.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      switch (mode) {
        case "invert": r = 255 - r; g = 255 - g; b = 255 - b; break;
        case "brightness": r *= amount; g *= amount; b *= amount; break;
        case "contrast": { const f = (259 * (amount * 255 + 255)) / (255 * (259 - amount * 255)); r = f * (r - 128) + 128; g = f * (g - 128) + 128; b = f * (b - 128) + 128; break; }
        case "saturation": { const gray = 0.299 * r + 0.587 * g + 0.114 * b; r = gray + (r - gray) * amount; g = gray + (g - gray) * amount; b = gray + (b - gray) * amount; break; }
        case "grayscale": { const gray = 0.299 * r + 0.587 * g + 0.114 * b; r = g = b = gray; break; }
        case "posterize": { const levels = Math.max(2, Math.round(amount)); const step = 255 / (levels - 1); r = Math.round(Math.round(r / step) * step); g = Math.round(Math.round(g / step) * step); b = Math.round(Math.round(b / step) * step); break; }
        case "threshold": { const gray = 0.299 * r + 0.587 * g + 0.114 * b; const v = gray / 255 >= amount ? 255 : 0; r = g = b = v; break; }
        case "opacity": a *= amount; break;
      }
      d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b); d[i + 3] = clamp255(a);
    }
    x.putImageData(img, 0, 0); return c;
  },
  hueRotate(input, size, degrees) {
    const c = this.canvas(size), x = c.getContext("2d");
    x.drawImage(input, 0, 0);
    const img = x.getImageData(0, 0, size, size), d = img.data;
    const shift = (((degrees % 360) + 360) % 360) / 360;
    for (let i = 0; i < d.length; i += 4) {
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const [r, g, b] = hslToRgb((h + shift) % 1, s, l);
      d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b);
    }
    x.putImageData(img, 0, 0); return c;
  },
  tint(input, size, color, amount) { return this.blend(input, this.color(size, color), amount, size, "normal"); },
  pixelate(input, size, blockSize) {
    const block = Math.max(1, Math.round(blockSize));
    const smallSize = Math.max(1, Math.round(size / block));
    const small = document.createElement("canvas"); small.width = smallSize; small.height = smallSize;
    const sx = small.getContext("2d"); sx.imageSmoothingEnabled = false; sx.drawImage(input, 0, 0, smallSize, smallSize);
    const c = this.canvas(size), x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.drawImage(small, 0, 0, size, size); return c;
  },
  blur(input, size, radius) {
    const c = this.canvas(size), x = c.getContext("2d");
    x.filter = `blur(${Math.max(0, radius)}px)`; x.drawImage(input, 0, 0); x.filter = "none"; return c;
  },
  antialias(input, size, strength) { const factor = Math.max(1, Number(strength) || 2); const smallSize = Math.max(1, Math.round(size / factor)); const small = document.createElement("canvas"); small.width = smallSize; small.height = smallSize; const sx = small.getContext("2d"); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = "high"; sx.drawImage(input, 0, 0, smallSize, smallSize); const c = document.createElement("canvas"); c.width = size; c.height = size; const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(small, 0, 0, size, size); return c; },
  rotate(input, size, degrees) {
    const c = this.canvas(size), x = c.getContext("2d");
    x.translate(size / 2, size / 2); x.rotate((degrees * Math.PI) / 180); x.drawImage(input, -size / 2, -size / 2); x.setTransform(1, 0, 0, 1, 0, 0); return c;
  },
  flip(input, size, axis) {
    const c = this.canvas(size), x = c.getContext("2d");
    x.translate(axis === "horizontal" ? size : 0, axis === "vertical" ? size : 0);
    x.scale(axis === "horizontal" ? -1 : 1, axis === "vertical" ? -1 : 1);
    x.drawImage(input, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0); return c;
  },
  offset(input, size, dx, dy) {
    const c = this.canvas(size), x = c.getContext("2d");
    const ox = ((dx % size) + size) % size, oy = ((dy % size) + size) % size;
    x.drawImage(input, ox, oy); x.drawImage(input, ox - size, oy); x.drawImage(input, ox, oy - size); x.drawImage(input, ox - size, oy - size);
    return c;
  },
  tile(input, size, repeat) {
    const n = Math.max(1, Math.round(repeat));
    const c = this.canvas(size), x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    const step = size / n;
    for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) x.drawImage(input, xx * step, yy * step, step, step);
    return c;
  },
  blend(a, b, amount, size, mode) {
    mode = mode || "normal";
    const c = this.canvas(size), x = c.getContext("2d");
    x.drawImage(a, 0, 0);
    x.globalCompositeOperation = mode === "multiply" ? "multiply" : mode === "screen" ? "screen" : mode === "overlay" ? "overlay" : mode === "add" ? "lighter" : "source-over";
    x.globalAlpha = amount; x.drawImage(b, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    return c;
  },
  mask(input, maskTex, size) {
    const c = this.canvas(size), x = c.getContext("2d");
    x.drawImage(input, 0, 0);
    const img = x.getImageData(0, 0, size, size);
    const mc = this.canvas(size), mx = mc.getContext("2d"); mx.drawImage(maskTex, 0, 0, size, size);
    const mimg = mx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const gray = 0.299 * mimg.data[i] + 0.587 * mimg.data[i + 1] + 0.114 * mimg.data[i + 2];
      img.data[i + 3] = gray;
    }
    x.putImageData(img, 0, 0); return c;
  }
};