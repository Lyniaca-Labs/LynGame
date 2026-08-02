// MetaState
// Cross-run persistent stats, saved to localStorage — unlike RunState.js's
// engine.state.run (wiped fresh on every initRun), this survives Retry AND
// full page reloads. Read once per session (lazily, via ensureMeta) and
// written back to localStorage on every change so nothing is lost even if
// the tab just gets closed mid-run.

const STORAGE_KEY = "onBorrowedTime.meta.v1";

function defaultMeta() {
  return { bestRound: 0, totalRuns: 0, lifetimeCurrency: 0 };
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMeta();
    // Spread over defaultMeta() so a save from an older build missing a
    // field (or a corrupted subset) still comes back with every key present.
    return { ...defaultMeta(), ...JSON.parse(raw) };
  } catch {
    return defaultMeta();
  }
}

function saveMeta(meta) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Storage unavailable (private browsing, quota, disabled) — meta just
    // won't persist this session. Nothing else depends on the write succeeding.
  }
}

export function ensureMeta(engine) {
  if (!engine.state.meta) engine.state.meta = loadMeta();
  return engine.state.meta;
}

export function addLifetimeCurrency(engine, amount) {
  if (!amount) return;
  const meta = ensureMeta(engine);
  meta.lifetimeCurrency += amount;
  saveMeta(meta);
}

// Called once per new run (see RunState.js's initRun) — covers both the
// very first Play and every Retry.
export function recordRunStart(engine) {
  const meta = ensureMeta(engine);
  meta.totalRuns += 1;
  saveMeta(meta);
}

// Called once a run ends (BattleController.js's endRound, on loss). Returns
// true when `roundReached` beats the previous best, so callers (the
// gameover scene) know whether to show a "New Best!" moment.
export function recordRunEnd(engine, roundReached) {
  const meta = ensureMeta(engine);
  const isNewBest = roundReached > meta.bestRound;
  if (isNewBest) meta.bestRound = roundReached;
  saveMeta(meta);
  return isNewBest;
}

export function MetaState() {}
