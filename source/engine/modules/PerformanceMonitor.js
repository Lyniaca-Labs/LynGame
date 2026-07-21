/**
 * PerformanceMonitor
 * -------------------
 * Tracks frame/update/render timings and entity counts, and displays
 * them in a small overlay GUI appended to the engine's game container.
 * Toggle with a keypress (default: backtick).
 *
 * Usage inside the engine's loop:
 *   this.perf.beginFrame(dt);
 *   this._update(dt);
 *   this.perf.markUpdate();
 *   this._render();
 *   this.perf.markRender();
 *   this.perf.endFrame(this.entities.length);
 */
export class PerformanceMonitor {
  constructor(engine, options = {}) {
    this.engine = engine;

    this.toggleKey = options.toggleKey ?? "`";
    this.sampleSize = options.sampleSize ?? 60; // frames to average over
    this.uiRefreshMs = options.uiRefreshMs ?? 250; // don't repaint DOM every frame

    this.visible = options.startVisible ?? false;

    // rolling buffers
    this._frameTimes = [];
    this._updateTimes = [];
    this._renderTimes = [];

    // in-flight values for the current frame
    this._frameStart = 0;
    this._frameMsRaw = 0;
    this._updateMsRaw = 0;
    this._renderMsRaw = 0;

    this.stats = {
      fps: 0,
      frameMs: 0,
      updateMs: 0,
      renderMs: 0,
      minFrameMs: 0,
      maxFrameMs: 0,
      entityCount: 0,
    };

    this._lastUiUpdate = 0;
    this._el = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    window.addEventListener("keydown", this._onKeyDown);

    this._buildUI();
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    this._el?.remove();
  }

  // --- frame instrumentation ---

  /**
   * Call at the top of the loop, once per frame.
   * @param {number} dt - real elapsed time since last frame, in seconds
   */
  beginFrame(dt) {
    this._frameMsRaw = dt * 1000;
    this._frameStart = performance.now();
  }

  /** Call immediately after _update() returns. */
  markUpdate() {
    this._updateMsRaw = performance.now() - this._frameStart;
  }

  /** Call immediately after _render() returns. */
  markRender() {
    const renderPhaseStart = this._frameStart + this._updateMsRaw;
    this._renderMsRaw = performance.now() - renderPhaseStart;
  }

  /** Call at the end of the loop, once per frame. */
  endFrame(entityCount = 0) {
    this._pushSample(this._frameTimes, this._frameMsRaw);
    this._pushSample(this._updateTimes, this._updateMsRaw);
    this._pushSample(this._renderTimes, this._renderMsRaw);

    const avgFrame = this._average(this._frameTimes);
    this.stats.frameMs = avgFrame;
    this.stats.fps = avgFrame > 0 ? 1000 / avgFrame : 0;
    this.stats.updateMs = this._average(this._updateTimes);
    this.stats.renderMs = this._average(this._renderTimes);
    this.stats.minFrameMs = Math.min(...this._frameTimes);
    this.stats.maxFrameMs = Math.max(...this._frameTimes);
    this.stats.entityCount = entityCount;

    const now = performance.now();
    if (this.visible && now - this._lastUiUpdate >= this.uiRefreshMs) {
      this._lastUiUpdate = now;
      this._paint();
    }
  }

  _pushSample(arr, value) {
    arr.push(value);
    if (arr.length > this.sampleSize) arr.shift();
  }

  _average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // --- GUI ---

  _onKeyDown(e) {
    if (e.key === this.toggleKey) {
      this.toggle();
    }
  }

  toggle() {
    this.visible = !this.visible;
    this._el.style.display = this.visible ? "block" : "none";
    if (this.visible) this._paint(); // paint immediately on open
  }

  _buildUI() {
    const el = document.createElement("div");
    el.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.75);
      color: #0f0;
      font-family: "Courier New", monospace;
      font-size: 12px;
      line-height: 1.4;
      padding: 8px 10px;
      border-radius: 4px;
      pointer-events: none;
      white-space: pre;
      display: none;
    `;
    if (!this.engine.gameContainer.style.position) {
      this.engine.gameContainer.style.position = "relative";
    }
    this.engine.gameContainer.appendChild(el);
    this._el = el;
  }

  _paint() {
    const s = this.stats;
    const mem = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB`
      : "n/a";

    this._el.textContent =
      `FPS:      ${s.fps.toFixed(1)}\n` +
      `Frame:    ${s.frameMs.toFixed(2)} ms (min ${s.minFrameMs.toFixed(1)} / max ${s.maxFrameMs.toFixed(1)})\n` +
      `Update:   ${s.updateMs.toFixed(2)} ms\n` +
      `Render:   ${s.renderMs.toFixed(2)} ms\n` +
      `Entities: ${s.entityCount}\n` +
      `Memory:   ${mem}\n` +
      `[${this.toggleKey}] toggle`;
  }
}