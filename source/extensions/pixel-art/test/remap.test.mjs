import test from "node:test";
import assert from "node:assert/strict";
import { nearestHueIndex, remapToPalette } from "../frontend/js/remap.mjs";
import { rgbToHex, hexToRgb, rgbToHsl, hslToRgb } from "../frontend/js/colorMath.mjs";

function hsl(h, s, l) {
  return { h, s, l };
}

function hexFromHsl(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

function hslFromHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

test("nearestHueIndex picks the palette entry with the closest hue", () => {
  const palette = [hsl(0, 0.6, 0.5), hsl(120, 0.6, 0.5), hsl(240, 0.6, 0.5)];
  assert.equal(nearestHueIndex(hsl(10, 0.6, 0.3), palette), 0);
  assert.equal(nearestHueIndex(hsl(130, 0.6, 0.7), palette), 1);
  assert.equal(nearestHueIndex(hsl(250, 0.6, 0.4), palette), 2);
});

test("remapToPalette preserves relative shading: three lightness shades of one hue keep their lightness order after being recolored", () => {
  // A highlight/base/shadow ramp of the same blue hue.
  const lightBlue = hexFromHsl(210, 0.6, 0.75);
  const midBlue = hexFromHsl(210, 0.6, 0.5);
  const darkBlue = hexFromHsl(210, 0.6, 0.25);

  const orangePalette = [hexFromHsl(30, 0.7, 0.5)];
  const result = remapToPalette([lightBlue, midBlue, darkBlue], orangePalette);
  const outHsl = result.map(hslFromHex);

  // All three shades adopt the new palette's hue/saturation...
  for (const h of outHsl) {
    assert.ok(Math.abs(h.h - 30) < 3, `expected hue ~30, got ${h.h}`);
    assert.ok(Math.abs(h.s - 0.7) < 0.05, `expected saturation ~0.7, got ${h.s}`);
  }
  // ...but keep their own original lightness, so the shading ramp survives.
  assert.ok(outHsl[0].l > outHsl[1].l, "light shade should stay lighter than mid shade");
  assert.ok(outHsl[1].l > outHsl[2].l, "mid shade should stay lighter than dark shade");
  assert.ok(Math.abs(outHsl[0].l - 0.75) < 0.02);
  assert.ok(Math.abs(outHsl[1].l - 0.5) < 0.02);
  assert.ok(Math.abs(outHsl[2].l - 0.25) < 0.02);
});

test("remapToPalette groups distinct hue families onto their own nearest palette color", () => {
  const blueShade1 = hexFromHsl(210, 0.6, 0.4);
  const blueShade2 = hexFromHsl(210, 0.6, 0.6);
  const redShade1 = hexFromHsl(5, 0.6, 0.4);
  const redShade2 = hexFromHsl(5, 0.6, 0.6);

  const palette = [hexFromHsl(100, 0.6, 0.5), hexFromHsl(30, 0.6, 0.5)]; // green, orange

  const result = remapToPalette([blueShade1, blueShade2, redShade1, redShade2], palette);
  const outHues = result.map((hex) => hslFromHex(hex).h);

  // Both blue shades land on the same target hue as each other, both red
  // shades land on the same (different) target hue as each other.
  assert.ok(Math.abs(outHues[0] - outHues[1]) < 3);
  assert.ok(Math.abs(outHues[2] - outHues[3]) < 3);
  assert.ok(Math.abs(outHues[0] - outHues[2]) > 30, "blue and red families should map to different target hues");
});

test("remapToPalette leaves near-grayscale cells (black/white/gray) unchanged", () => {
  const cells = ["#000000", "#ffffff", "#808080", null];
  const result = remapToPalette(cells, ["#ff0000", "#00ff00"]);
  assert.deepEqual(result, cells);
});

test("remapToPalette preserves each cell's original alpha", () => {
  const blueish = "rgba(60,90,200,0.4)"; // saturated blue, alpha 0.4
  const result = remapToPalette([blueish], ["#ff8000"]);
  assert.match(result[0], /^rgba\(\d+,\d+,\d+,0\.400\)$/);
});

test("remapToPalette with an empty palette returns an unchanged copy", () => {
  const cells = ["#3060c8", null];
  const result = remapToPalette(cells, []);
  assert.deepEqual(result, cells);
  assert.notEqual(result, cells);
});

test("remapToPalette does not mutate the input array", () => {
  const cells = ["#3060c8"];
  const original = cells.slice();
  remapToPalette(cells, ["#ff8000"]);
  assert.deepEqual(cells, original);
});
