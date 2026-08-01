// GameOverController
// Fills in the run summary text once when the game-over scene loads.
// engine.state.run still holds the just-ended run's numbers here — it's
// only cleared when the player clicks Restart (see scenes/gameover.json's
// restartBtn inline onClick).

export function GameOverController(entity, engine, dt) {
  if (entity.state.initialized) return;
  entity.state.initialized = true;
  const run = engine.state.run;
  const stats = engine.getEntity("gameOverStats");
  const tr = stats && stats.getComponent("TextRenderer");
  if (tr && run) {
    tr.text = `You reached Round ${run.round}\nFinal Coins: ${run.currency}\nDeck Size: ${run.deck.length}`;
  }
}
