// PickDeckCard
// Click handler wired onto each deck-picker card's Interactable.onClick
// (see ShopController.js's spawnDeckPicker, entered via an Upgrade/Remove
// offer). Invoked via engine.callScript('PickDeckCard', entity, engine) —
// callScript forwards args as-is, so engine must be passed explicitly.

import { pickDeckCard } from "./ShopController.js";

export function PickDeckCard(entity, engine) {
  pickDeckCard(entity, engine);
}
