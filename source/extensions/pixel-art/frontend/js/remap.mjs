// "Fit sprite to new palette" — remaps every painted pixel onto a target
// palette while preserving shading: pixels that are different lightness
// shades of the same original color (e.g. a highlight/base/shadow ramp) all
// get matched to the *same* new palette color's hue, and each keeps its own
// original lightness rather than collapsing to one flat swatch.

import { parseColor, hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hueDistance } from "./colorMath.mjs";

// Near-grayscale threshold: below this saturation a color has no meaningful
// hue family to match against (a hue value for pure black/white/gray is
// arbitrary), so these are left unchanged rather than picking up a stray
// tint from whichever palette entry happens to score lowest.
const GRAYSCALE_SATURATION_THRESHOLD = 0.08;

// Index of the palette HSL entry whose hue (and, as a tie-breaker,
// saturation) best matches `sourceHsl`. Assumes `paletteHsl` is non-empty.
export function nearestHueIndex(sourceHsl, paletteHsl) {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < paletteHsl.length; i++) {
    const hueScore = hueDistance(sourceHsl.h, paletteHsl[i].h) / 180; // normalized 0..1
    const satScore = Math.abs(sourceHsl.s - paletteHsl[i].s);
    const score = hueScore + satScore * 0.3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// Returns a new cells array with every non-transparent, non-grayscale cell
// remapped onto `palette` (array of hex strings): hue and saturation come
// from the matched palette entry, lightness is kept from the original
// pixel. Near-grayscale and transparent cells pass through unchanged. Each
// remapped cell keeps its original alpha. Does not mutate `cells`.
export function remapToPalette(cells, palette) {
  if (palette.length === 0) return cells.slice();
  const paletteHsl = palette.map((hex) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHsl(r, g, b);
  });

  return cells.map((cell) => {
    const parsed = parseColor(cell);
    if (!parsed) return null;

    const sourceHsl = rgbToHsl(parsed.r, parsed.g, parsed.b);
    if (sourceHsl.s < GRAYSCALE_SATURATION_THRESHOLD) return cell;

    const target = paletteHsl[nearestHueIndex(sourceHsl, paletteHsl)];
    const { r, g, b } = hslToRgb(target.h, target.s, sourceHsl.l);
    return parsed.a >= 1 ? rgbToHex(r, g, b) : `rgba(${r},${g},${b},${parsed.a.toFixed(3)})`;
  });
}
