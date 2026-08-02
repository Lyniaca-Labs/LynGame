// DirectoryPrevPage
// Click handler wired onto the card directory's "< Prev" button. Invoked
// via engine.callScript('DirectoryPrevPage', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { prevPage } from "./CardDirectoryController.js";

export function DirectoryPrevPage(entity, engine) {
  prevPage(entity, engine);
}
