// ShopOfferHoverEnter
// Hover handler wired onto shop offer cards and deck-picker cards (see
// ShopController.js's spawnOffers/spawnDeckPicker). Invoked via
// engine.callScript('ShopOfferHoverEnter', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { offerHoverEnter } from "./ShopController.js";

export function ShopOfferHoverEnter(entity, engine) {
  offerHoverEnter(entity, engine);
}
