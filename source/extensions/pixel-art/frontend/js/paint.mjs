import { inBounds } from "./grid.mjs";

// Square brush anchored top-left at the cursor cell, growing right/down.
// Anchoring at the cursor (rather than centering) keeps a size-1 brush's
// behavior unchanged as brushSize increases, and avoids centering math that
// doesn't matter at these pixel counts.
export function brushCells(w, h, cx, cy, size) {
  const cells = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (inBounds(w, h, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}
