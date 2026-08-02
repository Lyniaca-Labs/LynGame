// DirectoryNextPage
// Click handler wired onto the card directory's "Next >" button. Invoked
// via engine.callScript('DirectoryNextPage', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { nextPage } from "./CardDirectoryController.js";

export function DirectoryNextPage(entity, engine) {
  nextPage(entity, engine);
}
