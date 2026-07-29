import test from "node:test";
import assert from "node:assert/strict";
import { SCHEME_TYPES, generateScheme } from "../frontend/js/schemes.mjs";
import { rgbToHsl, hexToRgb } from "../frontend/js/colorMath.mjs";

const HEX_RE = /^#[0-9a-f]{6}$/;

// Cycles through a fixed sequence of [0, 1) values so scheme output is fully
// deterministic and reproducible in tests, instead of depending on Math.random.
function fakeRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function hueOf(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b).h;
}

test("generateScheme rejects an unknown scheme type", () => {
  assert.throws(() => generateScheme("nonsense", 5));
});

for (const type of SCHEME_TYPES) {
  test(`${type} scheme returns the requested count of valid hex colors`, () => {
    const colors = generateScheme(type, 5, fakeRng([0.3, 0.5, 0.7, 0.2, 0.9, 0.4, 0.6]));
    assert.equal(colors.length, 5);
    for (const c of colors) assert.match(c, HEX_RE);
  });

  test(`${type} scheme is deterministic for the same rng sequence`, () => {
    const seq = () => fakeRng([0.1, 0.4, 0.65, 0.9, 0.25]);
    assert.deepEqual(generateScheme(type, 4, seq()), generateScheme(type, 4, seq()));
  });
}

test("monochromatic keeps hue and saturation constant while varying lightness", () => {
  const colors = generateScheme("monochromatic", 4, fakeRng([0.5, 0.6]));
  const hues = colors.map(hueOf);
  for (const h of hues) assert.ok(Math.abs(h - hues[0]) < 2, `hue drifted: ${h} vs ${hues[0]}`);

  const lightnesses = colors.map((c) => {
    const { r, g, b } = hexToRgb(c);
    return rgbToHsl(r, g, b).l;
  });
  for (let i = 1; i < lightnesses.length; i++) {
    assert.ok(lightnesses[i] > lightnesses[i - 1], "lightness should increase monotonically");
  }
});

test("complementary alternates between two hues 180 degrees apart", () => {
  const colors = generateScheme("complementary", 4, fakeRng([0.5, 0.5]));
  const h0 = hueOf(colors[0]);
  const h1 = hueOf(colors[1]);
  const diff = Math.abs(h0 - h1);
  assert.ok(Math.abs(diff - 180) < 2, `expected ~180 degree split, got ${diff}`);
});

test("analogous keeps all hues within a 60-degree spread of the base", () => {
  // Base hue fixed away from the 0/360 wraparound so a plain min/max check is valid.
  const colors = generateScheme("analogous", 5, fakeRng([180 / 360, 0.5, 0.3, 0.4, 0.5, 0.6, 0.5]));
  const hues = colors.map(hueOf);
  const spread = Math.max(...hues) - Math.min(...hues);
  assert.ok(spread <= 61, `spread too wide: ${spread}`);
});

test("triadic cycles through three hues spaced 120 degrees apart", () => {
  const colors = generateScheme("triadic", 3, fakeRng([0.2, 0.5]));
  const hues = colors.map(hueOf);
  const diff01 = ((hues[1] - hues[0] + 540) % 360) - 180;
  const diff12 = ((hues[2] - hues[1] + 540) % 360) - 180;
  assert.ok(Math.abs(Math.abs(diff01) - 120) < 2, `hue0->hue1 gap: ${diff01}`);
  assert.ok(Math.abs(Math.abs(diff12) - 120) < 2, `hue1->hue2 gap: ${diff12}`);
});

test("generateScheme defaults to Math.random when no rng is supplied", () => {
  const colors = generateScheme("random", 3);
  assert.equal(colors.length, 3);
  for (const c of colors) assert.match(c, HEX_RE);
});
