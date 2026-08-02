// CancelPicker
// Click handler wired onto the shop's deck-picker "Cancel" button (see
// ShopController.js's spawnPickerChrome). Invoked via
// engine.callScript('CancelPicker', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { cancelPicker } from "./ShopController.js";

export function CancelPicker(entity, engine) {
  cancelPicker(entity, engine);
}
