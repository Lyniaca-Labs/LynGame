import assert from "node:assert/strict";
import { Entity, resolveEntityQuery } from "../types/Entity.js";

// Minimal Transform-alike so getComponent("Transform") style lookups work
// without importing the real Transform component (which has its own
// unrelated schema machinery we don't need here).
class FakeTransform {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

function makeEntity(id) {
  const e = new Entity(id);
  e.components.set("Transform", new FakeTransform());
  // getComponent(string) matches by ComponentClass.name; our fake isn't a
  // class instance keyed that way, so patch getComponent directly for this
  // test file's purposes.
  e.getComponent = (ref) => (ref === "Transform" ? e.components.get("Transform") : undefined);
  return e;
}

// --- exact id match wins over dot-splitting ---
{
  const dotted = makeEntity("enemy1.dot");
  const entities = [dotted];
  assert.equal(resolveEntityQuery(entities, "enemy1.dot"), dotted);
}

// --- root entity by plain id ---
{
  const player = makeEntity("player");
  const entities = [player];
  assert.equal(resolveEntityQuery(entities, "player"), player);
}

// --- nested child path (prefab-authored, has childName) ---
{
  const root = makeEntity("card1");
  const icon = makeEntity("card1_icon");
  root.addChild(icon, "icon");
  const badge = makeEntity("card1_icon_badge");
  icon.addChild(badge, "badge");
  const entities = [root, icon, badge];

  assert.equal(resolveEntityQuery(entities, "card1.icon"), icon);
  assert.equal(resolveEntityQuery(entities, "card1.icon.badge"), badge);
}

// --- parentId-linked child with no childName falls back to its own id ---
{
  const gui = makeEntity("gui");
  const entity7 = makeEntity("entity7");
  gui.addChild(entity7); // no name passed, mirrors compiled parentId output
  const entities = [gui, entity7];

  assert.equal(resolveEntityQuery(entities, "gui.entity7"), entity7);
}

// --- :Component and :Component.property suffixes ---
{
  const player = makeEntity("player");
  const entities = [player];

  assert.equal(resolveEntityQuery(entities, "player:Transform"), player.getComponent("Transform"));
  assert.equal(resolveEntityQuery(entities, "player:Transform.x"), 0);
}

// --- missing path segments resolve to undefined, not a throw ---
{
  const player = makeEntity("player");
  const entities = [player];
  assert.equal(resolveEntityQuery(entities, "nonexistent"), undefined);
  assert.equal(resolveEntityQuery(entities, "player.nonexistent"), undefined);
}

console.log("query.test.mjs: all assertions passed");
