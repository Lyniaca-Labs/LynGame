export default class AssetLoader {
  constructor() {
    this.cache = {}; // key -> loaded asset (Image, Audio, Response, ...)
  }

  async load(manifest, baseUrl = "./assets") {
    const entries = Object.entries(manifest);
    await Promise.all(entries.filter(([, asset]) => asset.type !== "texture").map(([key, { relativePath, type }]) =>
      this._loadOne(key, `${baseUrl}/${relativePath}`, type)
    ));
    for (const [key, { relativePath }] of entries.filter(([, asset]) => asset.type === "texture")) {
      await this._loadOne(key, `${baseUrl}/${relativePath}`, "texture");
    }
  }

  async _loadOne(key, url, type) {
    if (type === "image") this.cache[key] = await this._loadImage(url);
    else if (type === "texture") this.cache[key] = await this._loadTexture(url);
    else if (type === "spritesheet") this.cache[key] = await this._loadSpritesheet(url);
    else if (type === "audio") this.cache[key] = await this._loadAudio(url);
    else this.cache[key] = await this._loadRaw(url);
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image "${url}"`));
      img.src = url;
    });
  }

  _loadAudio(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => resolve(audio);
      audio.onerror = () => reject(new Error(`Failed to load audio "${url}"`));
      audio.src = url;
      audio.load();
    });
  }

  async _loadRaw(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load asset "${url}"`);
    return res;
  }

  // A spritesheet asset is a plain image plus a sidecar `<name>.spritesheet.json`
  // (same basename, `.png`/etc swapped for the sidecar extension) describing
  // its grid + named frames/clips. Cached as { image, meta } so SpriteRenderer
  // can tell a spritesheet apart from a plain Image at render time.
  async _loadSpritesheet(url) {
    const image = await this._loadImage(url);
    const metaUrl = url.replace(/\.[^./]+$/, ".spritesheet.json");
    const res = await fetch(metaUrl);
    if (!res.ok) throw new Error(`Failed to load spritesheet metadata "${metaUrl}"`);
    const meta = await res.json();
    return { image, meta };
  }

  async _loadTexture(url) {
    const module = await import(/* @vite-ignore */ new URL(url, window.location.href).href);
    if (typeof module.buildTexture !== "function") {
      throw new Error(`Texture module "${url}" does not export buildTexture`);
    }
    return module.buildTexture({ size: 256, assets: this.cache });
  }

  get(key) {
    const asset = this.cache[key];
    if (!asset) console.error(`Asset "${key}" not found or not loaded`);
    return asset ?? null;
  }

  has(key) {
    return key in this.cache;
  }
}
