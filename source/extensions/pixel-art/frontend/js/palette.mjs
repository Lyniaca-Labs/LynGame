const STORAGE_KEY_PREFIX = "pixelart:palette:";
export const MAX_RECENT_COLORS = 24;
export const DEFAULT_COLORS = ["#000000", "#ffffff", null];

export function createPalette(colors = DEFAULT_COLORS) {
  return { recent: colors.slice() };
}

// Moves `color` to the front if already present instead of duplicating it,
// so picking a color you already used doesn't clutter the row with repeats.
export function addColor(palette, color) {
  const recent = palette.recent.filter((c) => c !== color);
  recent.unshift(color);
  if (recent.length > MAX_RECENT_COLORS) recent.length = MAX_RECENT_COLORS;
  return { recent };
}

// Distinct non-transparent colors actually used in a grid, in first-seen
// (row-major) order — used to seed the palette from an opened asset.
export function uniqueColors(cells) {
  const seen = new Set();
  const result = [];
  for (const c of cells) {
    if (c === null || seen.has(c)) continue;
    seen.add(c);
    result.push(c);
  }
  return result;
}

export function loadPalette(storage, project, fallback = DEFAULT_COLORS) {
  try {
    const raw = storage.getItem(STORAGE_KEY_PREFIX + project);
    if (!raw) return createPalette(fallback);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.recent)) return createPalette(fallback);
    return { recent: parsed.recent };
  } catch {
    return createPalette(fallback);
  }
}

export function savePalette(storage, project, palette) {
  storage.setItem(STORAGE_KEY_PREFIX + project, JSON.stringify({ recent: palette.recent }));
}
