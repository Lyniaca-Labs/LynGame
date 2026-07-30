import { Component } from "../types/Component.js";

/**
 * Steps a sibling SpriteRenderer's `frame` field by playing a named clip
 * from that renderer's spritesheet asset (`SpriteRenderer.sprite` ->
 * `engine.assets.get(sprite).meta.clips[clipName]`). Same relationship
 * Animator has to a Transform/etc it reaches into via entity.getComponent() —
 * this component doesn't render anything itself.
 *
 * Scriptable like Animator's clip API:
 *   entity.getComponent("SpriteAnimation").play("walk");
 *   entity.getComponent("SpriteAnimation").play("hit", { loop: false, onComplete: () => ... });
 *   entity.getComponent("SpriteAnimation").stop();
 *
 * Setting `clip` directly (e.g. from the Inspector) also works and starts
 * playing immediately since `playing` defaults to true — no script required
 * for the common "just loop this clip" case.
 */
export class SpriteAnimation extends Component {
  static schema = {
    clip: { type: "string", default: "", description: "Name of a clip defined in the sibling SpriteRenderer's spritesheet." },
    playing: { type: "boolean", default: true, description: "Whether the clip is currently advancing." },
    speed: { type: "number", default: 1, description: "Playback speed multiplier." },
  };

  constructor(overrides = {}) {
    super(overrides); // assigns clip, playing, speed
    this._elapsed = 0;
    this._playingClip = null; // clip name `_elapsed` is counted against — resets on clip change
    this._loopOverride = undefined; // set by play({ loop }); undefined = use the clip's own `loop`
    this._onComplete = null;
  }

  /**
   * Plays `clipName` from the sibling SpriteRenderer's current spritesheet.
   * Re-calling with the same clip name that's already playing just updates
   * `loop`/`onComplete` in place (unless `restart` is set); switching to a
   * different clip name — including another clip in the same sheet —
   * always restarts from frame 0.
   */
  play(clipName, { loop, restart = false, onComplete = null } = {}) {
    if (this.clip === clipName && this.playing && !restart) {
      if (loop !== undefined) this._loopOverride = loop;
      if (onComplete) this._onComplete = onComplete;
      return this;
    }
    this.clip = clipName;
    this.playing = true;
    this._elapsed = 0;
    this._playingClip = null;
    this._loopOverride = loop;
    this._onComplete = onComplete;
    return this;
  }

  stop() {
    this.playing = false;
    return this;
  }

  isPlaying(clipName) {
    return this.playing && (!clipName || this.clip === clipName);
  }

  onTick(entity, engine, dt) {
    if (!this.playing || !this.clip) return;

    const renderer = entity.getComponent("SpriteRenderer");
    if (!renderer || !renderer.sprite) return;

    const asset = engine.assets.get(renderer.sprite);
    const clipData = asset?.meta?.clips?.[this.clip];
    if (!clipData || !clipData.frames?.length) return;

    // `clip` can change from outside play() (Inspector edit, direct field
    // assignment) — reset elapsed time whenever the playing clip's identity
    // doesn't match what we last ticked, same as play()'s explicit reset.
    if (this._playingClip !== this.clip) {
      this._elapsed = 0;
      this._playingClip = this.clip;
    }

    this._elapsed += dt * this.speed;
    const fps = Math.max(clipData.fps || 1, 0.0001);
    const frameDuration = 1 / fps;
    let frameIndex = Math.floor(this._elapsed / frameDuration);
    const loop = this._loopOverride !== undefined ? this._loopOverride : (clipData.loop ?? true);

    if (loop) {
      frameIndex = frameIndex % clipData.frames.length;
    } else if (frameIndex >= clipData.frames.length) {
      frameIndex = clipData.frames.length - 1;
      if (this.playing) {
        this.playing = false;
        this._onComplete?.(entity, engine);
      }
    }

    renderer.frame = clipData.frames[frameIndex];
  }
}
