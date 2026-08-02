// HandCardHoverEnter
// Hover handler wired onto each hand card's Interactable (see
// BattleController.js's spawnHandEntities). Invoked via
// engine.callScript('HandCardHoverEnter', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { handCardHoverEnter } from "./BattleController.js";

export function HandCardHoverEnter(entity, engine) {
  handCardHoverEnter(entity, engine);
}
