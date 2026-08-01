// BuyOffer
// Click handler wired onto each shop offer card's Interactable.onClick.
// Invoked via engine.callScript('BuyOffer', entity, engine) — callScript
// forwards args as-is (unlike component code-hooks), so engine must be
// passed explicitly.

import { buyOffer } from "./ShopController.js";

export function BuyOffer(entity, engine) {
  buyOffer(entity, engine);
}
