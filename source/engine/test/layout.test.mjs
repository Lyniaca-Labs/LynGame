import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Layout } from "../components/Layout.js";
import { Transform } from "../components/Transform.js";
import { ShapeRenderer } from "../components/ShapeRenderer.js";

function makeChild(id, width, height) {
  const e = new Entity(id);
  e.addComponent(Transform, { x: 0, y: 0 });
  e.addComponent(ShapeRenderer, { shape: "rect", width, height });
  return e;
}

function makeParent(id, layoutOverrides) {
  const e = new Entity(id);
  e.addComponent(Transform, { x: 0, y: 0 });
  e.addComponent(Layout, layoutOverrides);
  return e;
}

function attach(parent, children) {
  for (const child of children) parent.addChild(child);
  return children;
}

// --- flow: wraps onto a new line once contentBound (width - 2*paddingX) is exceeded ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", wrap: true, width: 100, gapX: 10, gapY: 5 });
  const [c1, c2, c3] = attach(parent, [makeChild("c1", 40, 20), makeChild("c2", 40, 20), makeChild("c3", 40, 20)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 20);
  assert.equal(c1.getComponent(Transform).y, 10);
  assert.equal(c2.getComponent(Transform).x, 70);
  assert.equal(c2.getComponent(Transform).y, 10);
  assert.equal(c3.getComponent(Transform).x, 20, "c3 wraps to a new line, resetting x");
  assert.equal(c3.getComponent(Transform).y, 35, "c3 sits on the second line");
}

// --- flow: maxCols caps items per line even with width unbounded ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", maxCols: 2, gapX: 5, gapY: 5 });
  const children = attach(parent, [1, 2, 3, 4, 5].map((n) => makeChild(`c${n}`, 10, 10)));

  parent.getComponent(Layout).onTick(parent);

  const [c1, c2, c3, , c5] = children.map((c) => c.getComponent(Transform));
  assert.equal(c1.x, 5);
  assert.equal(c2.x, 20);
  assert.equal(c3.x, 5, "c3 starts a new line at maxCols=2");
  assert.equal(c3.y, 20, "c3's line is below c1/c2's line");
  assert.equal(c5.y, 35, "c5 is alone on a third line");
}

// --- flow: justify=space-between distributes leftover space between items ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", width: 100, gapX: 0, justify: "space-between" });
  const [c1, c2, c3] = attach(parent, [makeChild("c1", 10, 10), makeChild("c2", 10, 10), makeChild("c3", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 5);
  assert.equal(c2.getComponent(Transform).x, 50);
  assert.equal(c3.getComponent(Transform).x, 95);
}

// --- flow: justify=space-around distributes leftover space around items ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", width: 100, gapX: 0, justify: "space-around" });
  const [c1, c2] = attach(parent, [makeChild("c1", 10, 10), makeChild("c2", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 25);
  assert.equal(c2.getComponent(Transform).x, 75);
}

// --- flow: align centers items within the line's cross-axis thickness ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", align: "center" });
  const [a, b] = attach(parent, [makeChild("a", 10, 20), makeChild("b", 10, 40)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(a.getComponent(Transform).y, 20, "shorter item centered within the 40px line height");
  assert.equal(b.getComponent(Transform).y, 20, "taller item defines the line height");
}

// --- flow: align=end bottom-aligns items within the line ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", align: "end" });
  const [a, b] = attach(parent, [makeChild("a", 10, 20), makeChild("b", 10, 40)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(a.getComponent(Transform).y, 30);
  assert.equal(b.getComponent(Transform).y, 20);
}

// --- padding/gap offsets on a single item ---
{
  const parent = makeParent("p", { mode: "flow", direction: "row", paddingX: 10, paddingY: 20 });
  const [a] = attach(parent, [makeChild("a", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(a.getComponent(Transform).x, 15);
  assert.equal(a.getComponent(Transform).y, 25);
}

// --- grid: auto-sizes column widths / row heights to the largest child in each track ---
{
  const parent = makeParent("p", { mode: "grid", direction: "row", maxCols: 2, maxRows: 2, gapX: 5, gapY: 5 });
  const [i1, i2, i3, i4] = attach(parent, [
    makeChild("i1", 20, 10),
    makeChild("i2", 30, 15),
    makeChild("i3", 15, 25),
    makeChild("i4", 25, 20),
  ]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(i1.getComponent(Transform).x, 10);
  assert.equal(i1.getComponent(Transform).y, 5);
  assert.equal(i2.getComponent(Transform).x, 40);
  assert.equal(i2.getComponent(Transform).y, 7.5);
  assert.equal(i3.getComponent(Transform).x, 7.5);
  assert.equal(i3.getComponent(Transform).y, 32.5);
  assert.equal(i4.getComponent(Transform).x, 37.5);
  assert.equal(i4.getComponent(Transform).y, 30);
}

// --- grid: falls back to a single row when maxCols and maxRows are both 0 ---
{
  const parent = makeParent("p", { mode: "grid", gapX: 5 });
  const [c1, c2, c3] = attach(parent, [makeChild("c1", 10, 10), makeChild("c2", 10, 10), makeChild("c3", 10, 10)]);

  parent.getComponent(Layout).onTick(parent);

  assert.equal(c1.getComponent(Transform).x, 5);
  assert.equal(c2.getComponent(Transform).x, 20);
  assert.equal(c3.getComponent(Transform).x, 35);
  assert.equal(c1.getComponent(Transform).y, c3.getComponent(Transform).y, "single row: all items share the same row");
}

// --- children without a Transform are skipped, not thrown on ---
{
  const parent = makeParent("p", { mode: "flow" });
  const withTransform = makeChild("withT", 10, 10);
  const withoutTransform = new Entity("withoutT"); // no Transform component
  parent.addChild(withTransform);
  parent.addChild(withoutTransform);

  assert.doesNotThrow(() => parent.getComponent(Layout).onTick(parent));
  assert.equal(withTransform.getComponent(Transform).x, 5, "the valid child is still positioned");
}

console.log("layout.test.mjs: all assertions passed");
