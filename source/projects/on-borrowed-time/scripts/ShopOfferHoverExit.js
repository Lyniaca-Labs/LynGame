// ShopOfferHoverExit
// Hover handler wired onto shop offer cards and deck-picker cards (see
// ShopController.js's spawnOffers/spawnDeckPicker). Invoked via
// engine.callScript('ShopOfferHoverExit', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { offerHoverExit } from "./ShopController.js";

export function ShopOfferHoverExit(entity, engine) {
  offerHoverExit(entity, engine);
}
