// MusicController
// Shared music helpers — engine.audio (source/engine/modules/Audio.js) only
// knows how to start/stop/set-volume on a single instance; everything about
// *smoothly* doing that (fade in/out, a shuffled battle playlist, pace-driven
// volume) lives here instead of being duplicated per scene controller.

// Rushing, energetic pieces for the battle playlist — cycles through all
// four across a fight instead of looping one track on repeat.
export const BATTLE_PLAYLIST = [
  "music/battle_revolutionary",
  "music/battle_torrent",
  "music/battle_winterwind",
  "music/battle_bees",
];

export const BATTLE_MUSIC_MIN_VOLUME = 0.16; // "pretty low" while the fight is calm
export const BATTLE_MUSIC_MAX_VOLUME = 0.7; // ramps up to here as pace climbs
export const MENU_MUSIC_VOLUME = 0.24;
export const GAMEOVER_MUSIC_VOLUME = 0.22;

const FADE_STEP_MS = 30;

// engine.state.music tracks whichever track is currently "the" ambient
// track for the active scene, so a generic scene-transition helper
// (SoundEffects.js's clickThenLoadScene) can fade out whatever's playing
// without every caller needing to know or care what started it.
export function setActiveMusic(engine, instance, volume) {
  engine.state.music = { instance, volume };
}

export function clearActiveMusic(engine, instance) {
  if (engine.state.music && engine.state.music.instance === instance) engine.state.music = null;
}

// Fades whatever's currently registered as the active music out over
// `durationMs`, then clears the registry. Safe to call when nothing's
// playing (e.g. leaving a scene that never started music) — no-ops.
export function fadeOutActiveMusic(engine, durationMs = 260) {
  const m = engine.state.music;
  engine.state.music = null;
  if (!m || !m.instance || !m.instance.setVolume) return;
  const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
  const startVolume = m.volume;
  let i = 0;
  const id = setInterval(() => {
    i++;
    m.instance.setVolume(Math.max(0, startVolume * (1 - i / steps)));
    if (i >= steps) clearInterval(id);
  }, FADE_STEP_MS);
}

// Moves `state.volume` toward `target` at `speed` (fraction of the gap
// closed per second, framerate-independent) and applies it — call once per
// tick from a script's own per-frame function.
export function approachVolume(instance, state, target, dt, speed = 1.5) {
  state.volume += (target - state.volume) * Math.min(1, dt * speed);
  instance.setVolume(state.volume);
  return state.volume;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickNextTrack(state) {
  if (!state.order || state.order.length === 0) {
    // Reshuffle, but never repeat the track that was just playing back-to-back.
    const pool = BATTLE_PLAYLIST.filter((k) => k !== state.lastKey);
    state.order = shuffle(pool.length ? pool : [...BATTLE_PLAYLIST]);
  }
  const key = state.order.shift();
  state.lastKey = key;
  return key;
}

// Starts the next battle playlist track from silence (fades in via the
// caller's per-tick approachVolume call). `b` is the persistent battle state
// (engine.state.battle) — the instance/volume/playlist-order live there
// (not on entity.state) so restartBattleMusic can tell a genuinely fresh
// fight apart from an entity-teardown-and-rebuild (e.g. a trip to the card
// directory and back) mid-fight, without losing playlist progress.
function startBattleTrack(engine, b) {
  const key = pickNextTrack(b.music);
  const instance = engine.audio.play(key, {
    loop: false,
    volume: 0,
    onEnded: () => {
      // Guards against a stale onEnded firing after the battle's moved on
      // (new run, or the track was cut short by a scene-teardown stopAll()
      // rather than actually finishing).
      if (engine.state.battle === b && b.phase !== "roundOver") startBattleTrack(engine, b);
    },
  });
  b.music.instance = instance;
  b.music.volume = 0;
  if (instance) setActiveMusic(engine, instance, 0);
}

// Call whenever main.json's entities are (re)created — a brand new fight,
// or an existing one whose entities just got rebuilt by a scene reload
// (engine.loadScene() already killed the previous instance via stopAll(),
// so there's nothing to resume, only restart).
export function restartBattleMusic(engine, b) {
  if (!b.music) b.music = { instance: null, volume: 0, order: [], lastKey: null };
  startBattleTrack(engine, b);
}

// Matching no-op export — lets this file live in scripts/ and be imported
// by name like every other script/helper file (see SoundEffects.js).
export function MusicController() {}
