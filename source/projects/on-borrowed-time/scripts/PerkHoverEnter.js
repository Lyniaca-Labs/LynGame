// PerkHoverEnter
// Hover handler wired onto each pathchoice scene option tile (see
// PathChoiceController.js's spawnOptions). Invoked via
// engine.callScript('PerkHoverEnter', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { perkHoverEnter } from "./PathChoiceController.js";

export function PerkHoverEnter(entity, engine) {
  perkHoverEnter(entity, engine);
}
