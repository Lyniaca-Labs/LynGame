// PlayHandCard
// Click handler wired onto each dynamically-spawned hand card's
// Interactable.onClick (see BattleController.js's spawnHandEntities).
// Invoked via engine.callScript('PlayHandCard', entity, engine) —
// callScript forwards args as-is (unlike component code-hooks), so engine
// must be passed explicitly.

import { playCard } from "./BattleController.js";

export function PlayHandCard(entity, engine) {
  const b = engine.state.battle;
  if (!b || b.phase !== "playerTurn") return;
  const idx = b.hand.findIndex((c) => c.entityId === entity.id);
  if (idx === -1) return;
  playCard(engine, b, "player", idx);
}
