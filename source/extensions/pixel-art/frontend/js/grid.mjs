// Cell-array helpers shared by paint.mjs and undo.mjs. The pixel-art grid is
// a flat, row-major array of CSS color strings (or null for transparent) —
// this module is the single place that knows how (x, y) maps to an index,
// so painting/undo/bounds-clipping can't drift out of sync with each other.

export function createGrid(w, h) {
  return new Array(w * h).fill(null);
}

export function indexOf(w, x, y) {
  return y * w + x;
}

export function inBounds(w, h, x, y) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function getCell(cells, w, x, y) {
  return cells[indexOf(w, x, y)];
}

export function setCell(cells, w, x, y, color) {
  cells[indexOf(w, x, y)] = color;
  return cells;
}

export function cloneGrid(cells) {
  return cells.slice();
}
