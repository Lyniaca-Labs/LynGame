
const LGTexture = {
  canvas(size) { const c = document.createElement("canvas"); c.width = size; c.height = size; return c; },
  empty(size) { return this.canvas(size); },
  color(size, value) { const c = this.canvas(size), x = c.getContext("2d"); x.fillStyle = value; x.fillRect(0, 0, size, size); return c; },
  gradient(size, direction, from, to) { const c = this.canvas(size), x = c.getContext("2d"); const g = direction === "vertical" ? x.createLinearGradient(0, 0, 0, size) : direction === "diagonal" ? x.createLinearGradient(0, 0, size, size) : x.createLinearGradient(0, 0, size, 0); g.addColorStop(0, from); g.addColorStop(1, to); x.fillStyle = g; x.fillRect(0, 0, size, size); return c; },
  channels(value) { const hex = String(value ?? "#000000").replace("#", ""); const n = Number.parseInt(hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  pixels(size, fn) { const c = this.canvas(size), x = c.getContext("2d"), image = x.createImageData(size, size); for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) { const [r, g, b] = fn(xx, y); image.data.set([r, g, b, 255], (y * size + xx) * 4); } x.putImageData(image, 0, 0); return c; },
  checker(size, tile, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); return this.pixels(size, (x, y) => (Math.floor(x / Math.max(2, tile)) + Math.floor(y / Math.max(2, tile))) % 2 ? b : a); },
  noise(size, seed, scale, aValue, bValue) { const a = this.channels(aValue), b = this.channels(bValue); return this.pixels(size, (x, y) => { const wave = Math.sin((x / Math.max(1, scale) + seed) * 12.9898 + (y / Math.max(1, scale) + seed) * 78.233) * 43758.5453; const amount = wave - Math.floor(wave); return a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount)); }); },
  asset(assets, key, size) { const source = assets?.[key]; if (!source) return this.empty(size); const c = this.canvas(size); c.getContext("2d").drawImage(source, 0, 0, size, size); return c; },
  blend(a, b, amount, size) { const c = this.canvas(size), x = c.getContext("2d"); x.drawImage(a, 0, 0); x.globalAlpha = amount; x.drawImage(b, 0, 0); x.globalAlpha = 1; return c; },
  filter(input, mode, amount, size) { const c = this.canvas(size), x = c.getContext("2d"); x.drawImage(input, 0, 0); const pixels = x.getImageData(0, 0, size, size); for (let i = 0; i < pixels.data.length; i += 4) for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = mode === "invert" ? 255 - pixels.data[i + channel] : Math.min(255, pixels.data[i + channel] * amount); x.putImageData(pixels, 0, 0); return c; }
};

export function buildTexture(data = {}) {
  const n1_textureNoise = LGTexture.noise(data.size, 1, 8, "#111827", "#f8fafc");
  const n2_scriptOutput = n1_textureNoise;
  return n2_scriptOutput;
}
