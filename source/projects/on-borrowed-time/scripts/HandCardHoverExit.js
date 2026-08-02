// HandCardHoverExit
// Hover handler wired onto each hand card's Interactable (see
// BattleController.js's spawnHandEntities). Invoked via
// engine.callScript('HandCardHoverExit', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { handCardHoverExit } from "./BattleController.js";

export function HandCardHoverExit(entity, engine) {
  handCardHoverExit(entity, engine);
}
