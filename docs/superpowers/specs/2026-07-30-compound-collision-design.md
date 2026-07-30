# Design: Compound Colliders (`includeChildren`)

2026-07-30. Small addition to `Collision` — lets a parent entity's direct
children each carry their own hitbox (shape/group/onCollide) while acting as
one rigid body for resolution purposes (e.g. a car body + wheel hitboxes).

**Problem:** Today, resolving a collision always moves the exact entity that
carries the `Collision` component — its own local Transform. There's no way
for multiple sibling hitboxes to move together as one rigid group; each
resolves independently against its own Transform.

**Design:**

- Schema additions on `Collision` (`source/engine/components/Collision.js`):
  - `includeChildren: { type: "boolean", default: false }` — "treat my
    direct children's `Collision` components as part of my rigid body."
  - New `shape` option `"none"` — parent has no hitbox of its own, but still
    contributes its `mass`/`resolve`/`isStatic` to the compound.
- Resolution redirect: when resolving a collision involving an entity whose
  **direct parent** has `includeChildren: true`, the physics identity used
  is the parent's, not the child's:
  - `resolve` and `isStatic` come from the parent.
  - `mass` is the parent's own `mass` (always counted, even with
    `shape: "none"`) plus every direct child's `mass` that itself carries a
    `Collision` component.
  - The position delta is applied to the **parent's** Transform (children
    already ride along via existing parent/child transform composition).
  - Bounce/velocity reflection applies to the **parent's** `Movement`
    component, if any.
- Detection is unchanged: `onCollide`, shape, and group/`collidesWith` still
  evaluate per-child, at the child's own world position. Only "whose
  mass/resolve/isStatic governs this push, and whose Transform moves" is
  redirected.
- Scope: one level only (an entity's direct parent), no recursive/grandchild
  absorption. Two compound members overlapping the same third entity in one
  frame stacks sequential corrections onto the parent's Transform — same
  existing behavior as any ordinary entity touching multiple things at once,
  not a new problem introduced here.
- The compound root's own hitbox (if it has one) must also use the full
  compound mass when hit directly, not just its own `mass` — otherwise the
  rigid body's effective weight would depend on which part got hit.
