// SoundEffects
// Shared sound-effect catalog + playback helpers — the real payload here is
// SOUND_SETS/playSound/etc (plain named exports), consumed the same way
// CardDatabase.js's CARD_DEFS is. The matching no-op export below just lets
// this file live in scripts/ and be imported by name (see
// PROJECT_STRUCTURE.md#scripts-folder).

const SOUND_SETS = {
  // Menu navigation, shop offer selection, perk selection.
  click: ["sfx/click1", "sfx/click2", "sfx/click3"],
  // A card landing in the play pile — player or AI, either side.
  place: ["sfx/place1", "sfx/place2", "sfx/place3", "sfx/place4", "sfx/place5"],
  // Deck shuffle, once at the start of each round/fight.
  shuffle: ["sfx/shuffle1", "sfx/shuffle2", "sfx/shuffle3"],
  // Coins earned from a round win — see playCoinBurst below.
  coin: ["sfx/coin1", "sfx/coin2", "sfx/coin3", "sfx/coin4"],
  // Clock tick, sped up with pace (BattleController.js's updateClockTick).
  tick: ["sfx/tick"],
  // Not wired up to anything yet — reserved for a future "card discarded/
  // falls away" use (see BattleController.js's animateCardDiscard). Don't
  // call playSound(engine, "fall", ...) until that's actually built.
  fall: ["sfx/fall1", "sfx/fall2", "sfx/fall3"],
};

export function playSound(engine, setName, options) {
  const variants = SOUND_SETS[setName];
  if (!variants || !variants.length) return null;
  const key = variants[Math.floor(Math.random() * variants.length)];
  return engine.audio.play(key, options);
}

// engine.loadScene() calls audio.stopAll() synchronously as its first step
// (source/engine/index.js) — which would silence a click sound started in
// the same tick as the scene swap before it's even audible. This plays the
// click immediately, then delays the actual scene swap just long enough for
// it to be heard.
export function clickThenLoadScene(engine, sceneName, delayMs = 150) {
  playSound(engine, "click");
  setTimeout(() => engine.loadScene(sceneName), delayMs);
}

// Coins earned from a round win — one random "coin" ding per coin, staggered
// slightly so a big reward reads as a cascade of individual dings rather
// than one indistinguishable burst of overlapping audio. Capped so a huge
// reward late in a run doesn't spawn dozens of simultaneous audio instances.
const COIN_BURST_CAP = 10;
const COIN_BURST_STAGGER_MS = 55;

export function playCoinBurst(engine, coinCount) {
  const n = Math.min(COIN_BURST_CAP, Math.max(0, Math.round(coinCount)));
  for (let i = 0; i < n; i++) {
    setTimeout(() => playSound(engine, "coin", { volume: 0.7 }), i * COIN_BURST_STAGGER_MS);
  }
}

export function SoundEffects() {}
