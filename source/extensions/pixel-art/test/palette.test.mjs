import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RECENT_COLORS, DEFAULT_COLORS,
  createPalette, addColor, uniqueColors, loadPalette, savePalette,
} from "../frontend/js/palette.mjs";

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

test("createPalette with no args starts from DEFAULT_COLORS", () => {
  assert.deepEqual(createPalette().recent, DEFAULT_COLORS);
});

test("addColor moves an already-present color to the front instead of duplicating", () => {
  let palette = createPalette(["#111111", "#222222", "#333333"]);
  palette = addColor(palette, "#222222");
  assert.deepEqual(palette.recent, ["#222222", "#111111", "#333333"]);
});

test("addColor caps the recent list at MAX_RECENT_COLORS", () => {
  let palette = createPalette([]);
  for (let i = 0; i < MAX_RECENT_COLORS + 5; i++) {
    palette = addColor(palette, `#${String(i).padStart(6, "0")}`);
  }
  assert.equal(palette.recent.length, MAX_RECENT_COLORS);
  assert.equal(palette.recent[0], `#${String(MAX_RECENT_COLORS + 4).padStart(6, "0")}`);
});

test("uniqueColors extracts distinct non-null colors in first-seen order", () => {
  const cells = ["#aaa", null, "#bbb", "#aaa", null, "#ccc"];
  assert.deepEqual(uniqueColors(cells), ["#aaa", "#bbb", "#ccc"]);
});

test("loadPalette returns the fallback when no data is stored", () => {
  const storage = createMockStorage();
  assert.deepEqual(loadPalette(storage, "proj1"), createPalette());
});

test("loadPalette returns the fallback when stored data is malformed", () => {
  const storage = createMockStorage();
  storage.setItem("pixelart:palette:proj1", "{not valid json");
  assert.deepEqual(loadPalette(storage, "proj1"), createPalette());
});

test("savePalette then loadPalette round-trips through storage", () => {
  const storage = createMockStorage();
  const palette = addColor(createPalette([]), "#123456");
  savePalette(storage, "proj1", palette);
  assert.deepEqual(loadPalette(storage, "proj1"), palette);
});

test("loadPalette is keyed per-project", () => {
  const storage = createMockStorage();
  savePalette(storage, "proj1", addColor(createPalette([]), "#111111"));
  savePalette(storage, "proj2", addColor(createPalette([]), "#222222"));
  assert.deepEqual(loadPalette(storage, "proj1").recent, ["#111111"]);
  assert.deepEqual(loadPalette(storage, "proj2").recent, ["#222222"]);
});
