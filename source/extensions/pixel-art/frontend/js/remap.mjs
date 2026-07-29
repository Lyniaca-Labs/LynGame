// "Fit sprite to new palette" — remaps every painted pixel to its nearest
// color in a target palette, preserving each pixel's original alpha.

import { parseColor, hexToRgb, rgbToHex, colorDistance } from "./colorMath.mjs";

// Index of the palette entry nearest `rgb` (Euclidean RGB distance).
// Assumes `paletteRgb` is non-empty.
export function nearestColorIndex(rgb, paletteRgb) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < paletteRgb.length; i++) {
    const d = colorDistance(rgb, paletteRgb[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Returns a new cells array with every non-transparent cell remapped to its
// nearest color in `palette` (array of hex strings). Transparent cells stay
// null; each remapped cell keeps its original alpha. Does not mutate `cells`.
export function remapToPalette(cells, palette) {
  if (palette.length === 0) return cells.slice();
  const paletteRgb = palette.map(hexToRgb);
  return cells.map((cell) => {
    const parsed = parseColor(cell);
    if (!parsed) return null;
    const idx = nearestColorIndex(parsed, paletteRgb);
    const { r, g, b } = paletteRgb[idx];
    return parsed.a >= 1 ? rgbToHex(r, g, b) : `rgba(${r},${g},${b},${parsed.a.toFixed(3)})`;
  });
}
