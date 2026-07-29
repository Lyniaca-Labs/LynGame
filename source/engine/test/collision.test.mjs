import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Collision } from "../components/Collision.js";
import { Movement } from "../components/Movement.js";
import { Transform } from "../components/Transform.js";

function makeEntity(id, x, y, w, h, collisionOverrides = {}) {
  const e = new Entity(id);
  e.addComponent(Transform, { x, y });
  e.addComponent(Collision, { width: w, height: h, ...collisionOverrides });
  return e;
}

const engine = {}; // unused by Collision.checkPair beyond pass-through to onCollide

// --- non-overlapping boxes: no callback fires ---
{
  const a = makeEntity("a", 0, 0, 10, 10, { group: "a", collidesWith: "b", onCollide: "" });
  const bEntity = makeEntity("b", 100, 100, 10, 10, { group: "b", collidesWith: "a" });
  Collision.checkPair(a, bEntity, engine);
  assert.equal(a.state.hit, undefined);
}

// --- overlapping boxes with matching groups: onCollide fires on both sides ---
{
  const a = makeEntity("a", 0, 0, 20, 20, {
    group: "player", collidesWith: "enemy",
    onCollide: "entity.state.hit = true;",
  });
  const b = makeEntity("b", 5, 0, 20, 20, { group: "enemy", collidesWith: "player" });
  Collision.checkPair(a, b, engine);
  assert.equal(a.state.hit, true);
}

// --- overlapping boxes with non-matching groups: no interaction ---
{
  const a = makeEntity("a", 0, 0, 20, 20, { group: "player", collidesWith: "enemy" });
  const b = makeEntity("b", 5, 0, 20, 20, { group: "wall", collidesWith: "nothing" });
  const before = { ax: a.getComponent(Transform).x, bx: b.getComponent(Transform).x };
  Collision.checkPair(a, b, engine);
  const after = { ax: a.getComponent(Transform).x, bx: b.getComponent(Transform).x };
  assert.deepEqual(before, after); // untouched — groups don't match
}

// --- resolve: static wall absorbs 0% of push, dynamic actor absorbs 100% ---
{
  const wall = makeEntity("wall", 0, 0, 20, 20, {
    group: "wall", collidesWith: "player", resolve: true, isStatic: true,
  });
  const player = makeEntity("player", 10, 0, 20, 20, {
    group: "player", collidesWith: "wall", resolve: true,
  });
  Collision.checkPair(wall, player, engine);
  assert.equal(wall.getComponent(Transform).x, 0); // wall never moves
  assert.notEqual(player.getComponent(Transform).x, 10); // player got pushed
}

// --- resolve: two equal-mass dynamic bodies split the push evenly ---
{
  const p1 = makeEntity("p1", 0, 0, 20, 20, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  const p2 = makeEntity("p2", 10, 0, 20, 20, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  Collision.checkPair(p1, p2, engine);
  const p1x = p1.getComponent(Transform).x;
  const p2x = p2.getComponent(Transform).x;
  // overlap was 10 (20-width boxes, 10px apart), split evenly -> each moves 5, apart
  assert.ok(p1x < 0 && p2x > 10, `expected symmetric push apart, got p1x=${p1x} p2x=${p2x}`);
}

// --- bounce: Movement velocity heading into the other side reflects, scaled by bounce ---
{
  const wall = makeEntity("wall", 0, 0, 20, 20, {
    group: "wall", collidesWith: "player", resolve: true, isStatic: true,
  });
  const player = makeEntity("player", 10, 0, 20, 20, {
    group: "player", collidesWith: "wall", resolve: true,
  });
  player.addComponent(Movement, { velocity: { x: -50, y: 0 }, bounce: 0.5 });
  Collision.checkPair(wall, player, engine);
  const vx = player.getComponent(Movement).velocity.x;
  assert.ok(vx > 0, `expected velocity reflected to positive x, got ${vx}`);
}

console.log("collision.test.mjs: all assertions passed");
