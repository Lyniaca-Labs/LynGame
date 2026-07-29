// Algorithmic palette generation — coolors.co-style "generate a scheme"
// button. Each scheme picks a random base hue (via the injected `rng`, so
// callers can pass Math.random for real use or a fixed generator for
// deterministic tests) and derives `count` hex colors from it in HSL space.

import { hslToRgb, rgbToHex } from "./colorMath.mjs";

export const SCHEME_TYPES = ["monochromatic", "complementary", "analogous", "triadic", "random"];

function toHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function monochromatic(count, rng) {
  const hue = rng() * 360;
  const sat = 0.55 + rng() * 0.35;
  const colors = [];
  for (let i = 0; i < count; i++) {
    const l = count === 1 ? 0.5 : 0.15 + (0.7 * i) / (count - 1);
    colors.push(toHex(hue, sat, l));
  }
  return colors;
}

function complementary(count, rng) {
  const hue = rng() * 360;
  const sat = 0.5 + rng() * 0.4;
  const pairSteps = Math.max(1, Math.ceil(count / 2) - 1);
  const colors = [];
  for (let i = 0; i < count; i++) {
    const h = i % 2 === 0 ? hue : hue + 180;
    const l = 0.3 + (0.5 * Math.floor(i / 2)) / pairSteps;
    colors.push(toHex(h, sat, Math.min(l, 0.85)));
  }
  return colors;
}

function analogous(count, rng) {
  const baseHue = rng() * 360;
  const sat = 0.5 + rng() * 0.35;
  const spread = 60; // total degrees spanned across the palette
  const colors = [];
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
    const l = 0.35 + rng() * 0.35;
    colors.push(toHex(baseHue + offset, sat, l));
  }
  return colors;
}

function triadic(count, rng) {
  const baseHue = rng() * 360;
  const sat = 0.5 + rng() * 0.4;
  const groupSteps = Math.max(1, Math.ceil(count / 3) - 1);
  const colors = [];
  for (let i = 0; i < count; i++) {
    const h = baseHue + (i % 3) * 120;
    const l = 0.35 + (0.4 * Math.floor(i / 3)) / groupSteps;
    colors.push(toHex(h, sat, Math.min(l, 0.8)));
  }
  return colors;
}

function randomScheme(count, rng) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(toHex(rng() * 360, 0.45 + rng() * 0.45, 0.3 + rng() * 0.45));
  }
  return colors;
}

const GENERATORS = {
  monochromatic,
  complementary,
  analogous,
  triadic,
  random: randomScheme,
};

export function generateScheme(type, count, rng = Math.random) {
  const generator = GENERATORS[type];
  if (!generator) throw new Error(`Unknown scheme type "${type}"`);
  return generator(count, rng);
}
