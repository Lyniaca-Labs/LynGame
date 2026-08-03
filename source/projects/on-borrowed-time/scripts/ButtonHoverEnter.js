// ButtonHoverEnter
// Hover handler wired onto plain menu/nav buttons' Interactable (menu,
// tutorial, card directory, gameover scenes). Invoked via
// engine.callScript('ButtonHoverEnter', entity, engine) — callScript
// forwards args as-is, so engine must be passed explicitly.

import { animateButtonHover, HOVER_SCALE } from "./ButtonHover.js";

export function ButtonHoverEnter(entity, engine) {
  animateButtonHover(entity, HOVER_SCALE);
}
