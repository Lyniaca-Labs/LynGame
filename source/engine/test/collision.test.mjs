import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Collision } from "../components/Collision.js";
import { Movement } from "../components/Movement.js";
import { Transform } from "../components/Transform.js";
import { ShapeRenderer } from "../components/ShapeRenderer.js";

function makeEntity(id, x, y, w, h, collisionOverrides = {}) {
  const e = new Entity(id);
  e.addComponent(Transform, { x, y });
  e.addComponent(Collision, { width: w, height: h, ...collisionOverrides });
  return e;
}

// width = diameter, matching ShapeRenderer's own circle convention (height ignored).
function makeCircleEntity(id, x, y, diameter, collisionOverrides = {}) {
  const e = new Entity(id);
  e.addComponent(Transform, { x, y });
  e.addComponent(ShapeRenderer, { shape: "circle", width: diameter, height: diameter });
  e.addComponent(Collision, { width: diameter, height: diameter, ...collisionOverrides });
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

// --- regression: two circles whose AABBs overlap diagonally, but the
// circles themselves don't actually touch, must NOT collide. Plain AABB
// math (the old bug) reports overlap here since the two 40x40 boxes DO
// intersect on both axes — only true circle-vs-circle distance math gets
// this right. Centers are (0,0) and (30,30): distance ~42.43, radius sum 40.
{
  const a = makeCircleEntity("a", 0, 0, 40, { group: "a", collidesWith: "a", onCollide: "entity.state.hit = true;" });
  const b = makeCircleEntity("b", 30, 30, 40, { group: "a", collidesWith: "a" });
  Collision.checkPair(a, b, engine);
  assert.equal(a.state.hit, undefined, "diagonally-adjacent circles whose AABBs overlap but circles don't must not collide");
}

// --- circle vs circle: overlapping circles separate along the line between
// their centers (not axis-locked), ending up exactly radius-sum apart ---
{
  const a = makeCircleEntity("a", 0, 0, 40, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  const b = makeCircleEntity("b", 25, 0, 40, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  Collision.checkPair(a, b, engine);
  const ax = a.getComponent(Transform).x;
  const bx = b.getComponent(Transform).x;
  assert.ok(Math.abs(bx - ax - 40) < 1e-9, `expected circles resting exactly radius-sum (40) apart, got dist=${bx - ax}`);
}

// --- circle vs circle: diagonal overlap separates along the actual center-to-center diagonal ---
{
  const a = makeCircleEntity("a", 0, 0, 40, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  const b = makeCircleEntity("b", 20, 20, 40, { group: "a", collidesWith: "a", resolve: true, mass: 1 });
  Collision.checkPair(a, b, engine);
  const at = a.getComponent(Transform);
  const bt = b.getComponent(Transform);
  const dist = Math.hypot(bt.x - at.x, bt.y - at.y);
  assert.ok(Math.abs(dist - 40) < 1e-9, `expected diagonal circles resting exactly radius-sum (40) apart, got dist=${dist}`);
  // pushed apart along the diagonal, not axis-locked: both x and y should have moved
  assert.notEqual(at.x, 0);
  assert.notEqual(at.y, 0);
}

// --- circle vs rect: overlap detected and resolved correctly (static rect,
// so only the circle moves — makes the expected resting position exact) ---
{
  const circle = makeCircleEntity("circle", 0, 0, 40, { group: "a", collidesWith: "b", resolve: true, mass: 1 });
  const rect = makeEntity("rect", 30, 0, 40, 40, { group: "b", collidesWith: "a", resolve: true, isStatic: true });
  Collision.checkPair(circle, rect, engine);
  const circleT = circle.getComponent(Transform);
  const rectT = rect.getComponent(Transform);
  assert.equal(rectT.x, 30); // static — never moves
  // circle's right edge (x + radius) should end up exactly at the rect's left edge (10)
  assert.ok(Math.abs(circleT.x + 20 - 10) < 1e-9, `expected circle pushed clear of rect, got x=${circleT.x}`);
}

console.log("collision.test.mjs: all assertions passed");
