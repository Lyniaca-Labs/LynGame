// Thin playback layer on top of AssetLoader's cached <audio> elements
// (AssetLoader._loadAudio caches one HTMLAudioElement per asset key).
// Playing that cached element directly doesn't support overlap — a second
// .play() call on the same element restarts it from 0 instead of layering a
// second voice, which breaks anything that fires the same SFX rapidly (e.g.
// playing several cards in quick succession). play() here clones the cached
// element per call instead, so overlapping calls layer independently.
export class AudioModule {
  constructor(engine) {
    this.engine = engine;
    this.masterVolume = 1;
    this._playing = new Set();
  }

  /**
   * @param {string} key - asset key, as loaded by the manifest (engine.assets)
   * @param {object} [options]
   * @param {number} [options.volume=1] - 0..1, multiplied by masterVolume
   * @param {boolean} [options.loop=false]
   * @param {number} [options.playbackRate=1]
   * @returns {HTMLAudioElement|null} the playing instance — hang onto it to
   *   stop a looping sound early (`instance.pause()`); one-shot SFX can
   *   discard the return value.
   */
  play(key, { volume = 1, loop = false, playbackRate = 1 } = {}) {
    const base = this.engine.assets.get(key);
    if (!base) return null;

    const instance = base.cloneNode(true);
    instance.volume = Math.min(1, Math.max(0, volume * this.masterVolume));
    instance.loop = loop;
    instance.playbackRate = playbackRate;
    instance.addEventListener("ended", () => this._playing.delete(instance));

    this._playing.add(instance);
    // Autoplay-policy rejections (e.g. no user gesture yet) shouldn't throw
    // into caller code — the sound just silently doesn't play.
    instance.play().catch(() => {});
    return instance;
  }

  /** Stops every currently-playing instance — e.g. on scene switch, so SFX/music from the old scene don't bleed into the new one. */
  stopAll() {
    for (const instance of this._playing) {
      instance.pause();
      instance.currentTime = 0;
    }
    this._playing.clear();
  }

  setMasterVolume(volume) {
    this.masterVolume = Math.min(1, Math.max(0, volume));
  }
}
