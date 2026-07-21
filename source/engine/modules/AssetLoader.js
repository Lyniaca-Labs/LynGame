export default class AssetLoader {
  constructor() {
    this.cache = {}; // key -> loaded asset (Image, Audio, Response, ...)
  }

  async load(manifest, baseUrl = "./assets") {
    await Promise.all(
      Object.entries(manifest).map(([key, { relativePath, type }]) =>
        this._loadOne(key, `${baseUrl}/${relativePath}`, type)
      )
    );
  }

  async _loadOne(key, url, type) {
    if (type === "image") this.cache[key] = await this._loadImage(url);
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

  get(key) {
    const asset = this.cache[key];
    if (!asset) console.error(`Asset "${key}" not found or not loaded`);
    return asset ?? null;
  }

  has(key) {
    return key in this.cache;
  }
}