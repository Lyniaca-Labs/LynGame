// DirectoryBack
// Click handler wired onto the card directory's "Back" button. Invoked via
// engine.callScript('DirectoryBack', entity, engine) — callScript forwards
// args as-is, so engine must be passed explicitly.

import { goBack } from "./CardDirectoryController.js";

export function DirectoryBack(entity, engine) {
  goBack(entity, engine);
}
