import assert from "node:assert/strict";
import { Entity } from "../types/Entity.js";
import { Follow } from "../components/Follow.js";
import { Transform } from "../components/Transform.js";

function makeEntity(id, x, y) {
  const e = new Entity(id);
  e.addComponent(Transform, { x, y });
  return e;
}

function fakeEngine(entities) {
  return {
    entities,
    query(path) {
      return entities.find((e) => e.id === path);
    },
  };
}

// --- exponential mode moves toward target, never overshoots at low dt ---
{
  const target = makeEntity("target", 100, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "exponential", roundness: 0.85 });
  const engine = fakeEngine([target, follower]);

  // roundness 0.85 means only 15% of the gap closes per second (near-1 =
  // lazy/slow), so simulate 5 seconds of ticks to see substantial progress.
  const followComp = follower.getComponent(Follow);
  for (let i = 0; i < 300; i++) followComp.onTick(follower, engine, 1 / 60);

  const x = follower.getComponent(Transform).x;
  assert.ok(x > 50 && x < 100, `expected partial progress toward target, got x=${x}`);
}

// --- deadzone: no movement while within radius ---
{
  const target = makeEntity("target", 5, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "exponential", deadzone: 10 });
  const engine = fakeEngine([target, follower]);

  follower.getComponent(Follow).onTick(follower, engine, 1 / 60);
  assert.equal(follower.getComponent(Transform).x, 0);
}

// --- axisLock: "x" ignores target's Y movement ---
{
  const target = makeEntity("target", 50, 50);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "exponential", axisLock: "x", roundness: 0.5 });
  const engine = fakeEngine([target, follower]);

  follower.getComponent(Follow).onTick(follower, engine, 1 / 60);
  assert.equal(follower.getComponent(Transform).y, 0);
  assert.notEqual(follower.getComponent(Transform).x, 0);
}

// --- maxSpeed mode never exceeds the configured cap ---
{
  const target = makeEntity("target", 1000, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "maxSpeed", maxSpeed: 100 });
  const engine = fakeEngine([target, follower]);

  const followComp = follower.getComponent(Follow);
  const dt = 1 / 60;
  followComp.onTick(follower, engine, dt);
  const step = follower.getComponent(Transform).x;
  assert.ok(step <= 100 * dt + 1e-6, `expected step <= maxSpeed*dt, got ${step}`);
}

// --- spring mode approaches the target without diverging ---
{
  const target = makeEntity("target", 100, 0);
  const follower = makeEntity("follower", 0, 0);
  follower.addComponent(Follow, { targetId: "target", mode: "spring", stiffness: 120, damping: 14 });
  const engine = fakeEngine([target, follower]);

  const followComp = follower.getComponent(Follow);
  for (let i = 0; i < 300; i++) followComp.onTick(follower, engine, 1 / 60);

  const x = follower.getComponent(Transform).x;
  assert.ok(Math.abs(x - 100) < 5, `expected spring to settle near target, got x=${x}`);
}

console.log("follow.test.mjs: all assertions passed");
