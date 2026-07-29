import test from "node:test";
import assert from "node:assert/strict";
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, colorDistance, parseColor } from "../frontend/js/colorMath.mjs";

test("hexToRgb parses a hex string", () => {
  assert.deepEqual(hexToRgb("#ff8000"), { r: 255, g: 128, b: 0 });
});

test("rgbToHex formats and clamps", () => {
  assert.equal(rgbToHex(255, 128, 0), "#ff8000");
  assert.equal(rgbToHex(-10, 300, 128.6), "#00ff81");
});

test("rgbToHsl and hslToRgb round-trip for primary colors", () => {
  for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 128, 128], [255, 255, 255], [0, 0, 0]]) {
    const { h, s, l } = rgbToHsl(r, g, b);
    const back = hslToRgb(h, s, l);
    assert.ok(Math.abs(back.r - r) <= 1, `r: ${back.r} vs ${r}`);
    assert.ok(Math.abs(back.g - g) <= 1, `g: ${back.g} vs ${g}`);
    assert.ok(Math.abs(back.b - b) <= 1, `b: ${back.b} vs ${b}`);
  }
});

test("rgbToHsl detects pure red as hue 0", () => {
  const { h, s, l } = rgbToHsl(255, 0, 0);
  assert.equal(h, 0);
  assert.equal(s, 1);
  assert.equal(l, 0.5);
});

test("colorDistance is 0 for identical colors and positive otherwise", () => {
  assert.equal(colorDistance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }), 0);
  assert.ok(colorDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) > 0);
});

test("parseColor handles hex, rgba, rgb without alpha, and null", () => {
  assert.deepEqual(parseColor("#ff0000"), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("rgba(10,20,30,0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseColor("rgb(10,20,30)"), { r: 10, g: 20, b: 30, a: 1 });
  assert.equal(parseColor(null), null);
});
