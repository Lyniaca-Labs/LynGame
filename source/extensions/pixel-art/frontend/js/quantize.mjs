// Reduces a sprite's actual painted colors down to a small dominant palette
// via k-means clustering — the "automatic color scheme detection" tool.

import { colorDistance, parseColor, rgbToHex } from "./colorMath.mjs";

// Non-transparent {r, g, b} colors from a cells[] array (alpha is ignored —
// quantization targets hue/tone, not transparency).
export function extractColors(cells) {
  const result = [];
  for (const cell of cells) {
    const parsed = parseColor(cell);
    if (parsed) result.push({ r: parsed.r, g: parsed.g, b: parsed.b });
  }
  return result;
}

// Reduces `colors` to at most `k` dominant hex colors via k-means. If there
// are already <= k unique colors, returns those directly. `rng` is
// injectable for deterministic tests (defaults to Math.random); it only
// affects the initial centroid shuffle, not the clustering result's quality.
export function quantizeColors(colors, k, rng = Math.random) {
  if (colors.length === 0) return [];

  const uniqueMap = new Map();
  for (const c of colors) {
    const key = `${c.r},${c.g},${c.b}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, c);
  }
  const unique = [...uniqueMap.values()];
  if (unique.length <= k) return unique.map((c) => rgbToHex(c.r, c.g, c.b));

  // k-means++ seeding: each new centroid is picked with probability
  // proportional to its squared distance from the nearest existing centroid.
  // Plain random/evenly-spaced seeding can put two initial centroids in the
  // same visual cluster, which then collapses into one blended-average color
  // instead of separating distinct colors (e.g. red and blue merging into
  // purple) — this fixes that failure mode.
  let centroids = [{ ...colors[Math.floor(rng() * colors.length)] }];
  while (centroids.length < k) {
    const distances = colors.map((c) => Math.min(...centroids.map((cen) => colorDistance(c, cen))) ** 2);
    const total = distances.reduce((a, b) => a + b, 0);
    if (total === 0) {
      centroids.push({ ...colors[Math.floor(rng() * colors.length)] });
      continue;
    }
    let target = rng() * total;
    let idx = distances.length - 1;
    for (let i = 0; i < distances.length; i++) {
      target -= distances[i];
      if (target <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push({ ...colors[idx] });
  }

  const ITERATIONS = 10;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const color of colors) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const d = colorDistance(color, centroids[i]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      sums[best].r += color.r;
      sums[best].g += color.g;
      sums[best].b += color.b;
      sums[best].count++;
    }
    centroids = centroids.map((old, i) => {
      const s = sums[i];
      return s.count === 0 ? old : { r: s.r / s.count, g: s.g / s.count, b: s.b / s.count };
    });
  }

  return centroids.map((c) => rgbToHex(c.r, c.g, c.b));
}
