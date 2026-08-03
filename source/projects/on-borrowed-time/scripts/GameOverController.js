// GameOverController
// Fills in the run summary text once when the game-over scene loads.
// engine.state.run still holds the just-ended run's numbers here — it's
// only cleared when the player clicks Restart (see GameoverRetry.js).
// run.newBest was stamped by BattleController.js's endRound (via
// MetaState.js's recordRunEnd) at the moment the run actually ended, so the
// meta values read here are already-updated (this run's own result is
// folded into bestRound/totalRuns/lifetimeCurrency, not the prior run's).

import { ensureMeta } from "./MetaState.js";
import { setActiveMusic, approachVolume, GAMEOVER_MUSIC_VOLUME } from "./MusicController.js";

export function GameOverController(entity, engine, dt) {
  if (!entity.state.musicStarted) {
    entity.state.musicStarted = true;
    entity.state.volume = 0;
    entity.state.music = engine.audio.play("music/gameover", { loop: true, volume: 0 });
    if (entity.state.music) setActiveMusic(engine, entity.state.music, 0);

    // The battle scene already faded to black before cutting here
    // (BattleController.js's endRound -> fadeToBlack) — fade the matching
    // black "fadeOverlay" back out so the transition reads as one
    // continuous crossfade across the scene swap, same as pathchoice.json.
    const overlay = engine.getEntity("fadeOverlay");
    const overlayOp = overlay && overlay.getComponent("Opacity");
    const overlayAnim = overlay && overlay.getComponent("Animator");
    if (overlayOp && overlayAnim) overlayAnim.animate(overlayOp, "value", 0, { duration: 0.7, easing: "easeOut" });
  }
  if (entity.state.music) {
    approachVolume(entity.state.music, entity.state, GAMEOVER_MUSIC_VOLUME, dt, 0.5);
    setActiveMusic(engine, entity.state.music, entity.state.volume);
  }

  if (entity.state.initialized) return;
  entity.state.initialized = true;
  const run = engine.state.run;
  const meta = ensureMeta(engine);

  const stats = engine.getEntity("gameOverStats");
  const statsTr = stats && stats.getComponent("TextRenderer");
  if (statsTr && run) {
    statsTr.text = `You reached Round ${run.round}\nFinal Coins: ${run.currency}\nDeck Size: ${run.deck.length}`;
  }

  // Stacked lines (not one bullet-joined line) — top-left corner, own
  // narrow maxWidth (gameover.json), so a long lifetime-coins number can't
  // run past the edge of a narrow window.
  const metaLabel = engine.getEntity("gameOverMeta");
  const metaTr = metaLabel && metaLabel.getComponent("TextRenderer");
  if (metaTr) {
    metaTr.text = `Best Round: ${meta.bestRound}\nRuns Played: ${meta.totalRuns}\nLifetime Coins: ${meta.lifetimeCurrency}`;
  }

  if (run && run.newBest) {
    const banner = engine.getEntity("newBestBanner");
    const tr = banner && banner.getComponent("TextRenderer");
    const anim = banner && banner.getComponent("Animator");
    const op = banner && banner.getComponent("Opacity");
    if (tr && anim && op) {
      tr.fontSize = 44;
      op.value = 1;
      anim.animate(tr, "fontSize", 30, { duration: 0.35, easing: "easeOut" });
    }
  }
}
