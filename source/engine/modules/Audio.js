// Low-latency playback layer on top of AssetLoader's cached <audio> elements
// (AssetLoader._loadAudio caches one HTMLAudioElement per asset key).
//
// play() used to clone that cached element per call (cloneNode + .play())
// to support overlap — a second .play() on the same element restarts it
// from 0 instead of layering a second voice. That worked, but every clone
// has to re-initialize its own decode/buffering pipeline, which reliably
// added an audible startup delay per play() — bad for anything meant to
// feel immediate (UI clicks, a card landing). Instead, the first play() for
// a given key decodes it once into an AudioBuffer via the Web Audio API
// (fetching the already-downloaded element's `src`, so this normally hits
// cache and takes a few ms); every play() after that — including the very
// next one — schedules a fresh AudioBufferSourceNode from that decoded
// buffer, which starts with effectively zero latency and layers freely.
export class AudioModule {
  constructor(engine) {
    this.engine = engine;
    this.masterVolume = 1;
    this._playing = new Set();
    this._ctx = null;
    this._buffers = new Map(); // key -> decoded AudioBuffer
    this._decoding = new Map(); // key -> in-flight decode Promise (shared across concurrent plays of the same key)
  }

  _context() {
    if (!this._ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this._ctx = new Ctx();
    }
    // Browsers start contexts suspended until a user gesture — play() is
    // normally reached from a click handler or shortly after one, so this
    // resolves almost immediately in practice. resume() is async though, and
    // used to be fire-and-forget here: _playBuffer would call source.start()
    // right away regardless of whether the context had actually finished
    // resuming, which is a real source of silently-dropped audio in some
    // browsers (a source scheduled against a context that isn't running yet
    // never catches up once it does). Stashing the in-flight promise lets
    // _playBuffer wait for it instead of racing it — see there.
    if (this._ctx.state === "suspended" && !this._resuming) {
      this._resuming = this._ctx.resume()
        .catch(() => {})
        .finally(() => { this._resuming = null; });
    }
    return this._ctx;
  }

  // Called once by engine.loadScene() (right after assets finish loading,
  // well before the player's first click) so decoding starts as early as
  // possible instead of lazily on the very first play() call for a key —
  // that first call would otherwise go through the slower clone-and-play
  // fallback below, which (same as loadScene()'s audio.stopAll()) could
  // still get cut short before it's ever audible on a scene-transitioning
  // click. Safe to call repeatedly — already-decoded/in-flight keys no-op.
  preloadAll() {
    for (const [key, value] of Object.entries(this.engine.assets.cache)) {
      if (value instanceof HTMLAudioElement) this._decode(key);
    }
  }

  _decode(key) {
    if (this._buffers.has(key)) return Promise.resolve(this._buffers.get(key));
    if (this._decoding.has(key)) return this._decoding.get(key);

    const element = this.engine.assets.get(key);
    const promise = !element || !element.src
      ? Promise.resolve(null)
      : fetch(element.src)
          .then((res) => res.arrayBuffer())
          .then((data) => this._context().decodeAudioData(data))
          .then((buffer) => {
            this._buffers.set(key, buffer);
            return buffer;
          })
          .catch(() => null)
          .finally(() => this._decoding.delete(key));

    this._decoding.set(key, promise);
    return promise;
  }

  /**
   * @param {string} key - asset key, as loaded by the manifest (engine.assets)
   * @param {object} [options]
   * @param {number} [options.volume=1] - 0..1, multiplied by masterVolume
   * @param {boolean} [options.loop=false]
   * @param {number} [options.playbackRate=1]
   * @param {Function} [options.onEnded] - fires when playback finishes on its
   *   own (not called on manual `.pause()`/`stopAll()`) — e.g. to advance a
   *   music playlist to the next track.
   * @returns {{pause: Function, setVolume: Function, getVolume: Function}|HTMLAudioElement|null}
   *   the playing instance — hang onto it to stop a looping sound early
   *   (`instance.pause()`) or to fade/ramp it (`instance.setVolume(0..1)`,
   *   multiplied by masterVolume same as the initial `volume` option);
   *   one-shot SFX can discard the return value.
   */
  play(key, options = {}) {
    const buffer = this._buffers.get(key);
    if (buffer) return this._playBuffer(buffer, options);

    // Not decoded yet — kick off decoding (cached for every future call to
    // this key) and fall back to the old clone-and-play path just this once
    // so the very first call to a given key still makes a sound.
    this._decode(key);
    return this._playElementFallback(key, options);
  }

  _playBuffer(buffer, { volume = 1, loop = false, playbackRate = 1, onEnded } = {}) {
    const ctx = this._context();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = playbackRate;

    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume)) * this.masterVolume;
    source.connect(gain).connect(ctx.destination);

    const instance = {
      pause: () => {
        try { source.stop(); } catch { /* already stopped/ended */ }
      },
      setVolume: (v) => { gain.gain.value = Math.min(1, Math.max(0, v)) * this.masterVolume; },
      getVolume: () => gain.gain.value,
    };
    source.onended = () => {
      this._playing.delete(instance);
      if (onEnded) onEnded();
    };
    this._playing.add(instance);
    // See _context() — if a resume() is still in flight, wait for it before
    // actually starting playback instead of racing ahead; once the session's
    // first resume has gone through (the overwhelming majority of calls),
    // this._resuming is null and start() fires immediately, same as before.
    if (this._resuming) {
      this._resuming.then(() => { try { source.start(); } catch { /* stopped/paused before it got the chance */ } });
    } else {
      source.start();
    }
    return instance;
  }

  _playElementFallback(key, { volume = 1, loop = false, playbackRate = 1, onEnded } = {}) {
    const base = this.engine.assets.get(key);
    if (!base) return null;

    const instance = base.cloneNode(true);
    instance.volume = Math.min(1, Math.max(0, volume)) * this.masterVolume;
    instance.loop = loop;
    instance.playbackRate = playbackRate;
    instance.setVolume = (v) => { instance.volume = Math.min(1, Math.max(0, v)) * this.masterVolume; };
    instance.getVolume = () => instance.volume;
    instance.addEventListener("ended", () => {
      this._playing.delete(instance);
      if (onEnded) onEnded();
    });

    this._playing.add(instance);
    instance.play().catch(() => {});
    return instance;
  }

  /** Stops every currently-playing instance — e.g. on scene switch, so SFX/music from the old scene don't bleed into the new one. */
  stopAll() {
    for (const instance of this._playing) {
      instance.pause();
      if ("currentTime" in instance) instance.currentTime = 0;
    }
    this._playing.clear();
  }

  setMasterVolume(volume) {
    this.masterVolume = Math.min(1, Math.max(0, volume));
  }
}
