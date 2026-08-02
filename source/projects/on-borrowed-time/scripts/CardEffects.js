// CardEffects
// Pure stat-resolution logic shared by the player's real card plays and the
// AI's decision heuristic (BattleController.js) — kept side-effect free
// (aside from mutating the plain stat objects passed in) so it's easy to
// reason about/reuse from both places.

import { levelScale } from "./CardDatabase.js";

// Reflect (Borrowed Time's namesake mechanic) — fraction of realized damage
// bounced back per stack held by whoever got hit. Capped so heavy stacking
// can't approach reflecting the entire hit back.
const REFLECT_PERCENT_PER_STACK = 0.05;
const REFLECT_MAX_FRACTION = 0.6;

// Poison (Borrowed Time) — capped so replaying it doesn't let per-turn
// damage climb without bound; it stays a small, purely per-turn drain
// rather than a stackable burst source.
const POISON_MAX_PER_TURN = 2;

// Time Steal is the one card that shaves max time instead of dealing direct
// damage — repeated casts (especially at higher card levels, where the
// per-cast amount scales up with levelScale) could otherwise crush a
// side's maxTime toward the old flat 1s floor, and currentTime clamps down
// with it, making it a near-instant kill once stacked. Floored at a
// fraction of the side's STARTING max time (baseMaxTime) instead, so it
// stays real, escalating pressure without being able to one-shot a fight.
// Exported so BattleController.js's AI scoring can value a Time Steal play
// by the same real floor instead of assuming the old flat-1 one.
export const MAX_TIME_REDUCTION_FLOOR_FRACTION = 0.4;

// stats shape: { maxTime, currentTime, regen, shield, drainMult, nextHandBonus, shieldRetain, reflect }
export function resolveEffects(effects, level, casterStats, opponentStats) {
  const scale = levelScale(level);
  const results = [];
  for (const eff of effects) {
    // Opt-out for effects with no natural magnitude to scale (Purge's
    // hand-size cost, CardDatabase.js) — upgrading a card should never make
    // its downside worse when there's no corresponding upside growing to
    // offset it.
    const amount = eff.amount * (eff.noLevelScale ? 1 : scale);
    const target = eff.target === "opponent" ? opponentStats : casterStats;
    switch (eff.type) {
      case "currentTime": {
        let amt = amount;
        let absorbed = 0;
        if (amt < 0 && target.shield > 0) {
          absorbed = Math.min(target.shield, -amt);
          target.shield -= absorbed;
          amt += absorbed;
        }
        target.currentTime = Math.max(0, Math.min(target.maxTime, target.currentTime + amt));
        // absorbed > 0 is BattleController.js's cue to fire the shield-hit
        // marker (a distinct particle burst + floating text) alongside/
        // instead of the normal damage feedback.
        results.push({ type: "currentTime", target: eff.target, amount: amt, absorbed });

        // Reflect only triggers on a real attack (eff.target === "opponent",
        // i.e. the caster hitting their opponent) — not on self-damage cards
        // like Blood Pact, where "target" would be the caster's own stats
        // and bouncing it back onto themselves makes no sense.
        if (eff.target === "opponent" && amt < 0 && target.reflect > 0) {
          const dealt = -amt;
          const frac = Math.min(REFLECT_MAX_FRACTION, target.reflect * REFLECT_PERCENT_PER_STACK);
          const reflected = dealt * frac;
          if (reflected > 0) {
            casterStats.currentTime = Math.max(0, Math.min(casterStats.maxTime, casterStats.currentTime - reflected));
            results.push({ type: "reflectDamage", target: "self", amount: -reflected });
          }
        }
        break;
      }
      // Like currentTime, but skips the shield-absorption branch entirely —
      // for the rare "ignores shield" card. Always deals its full amount.
      case "trueDamage": {
        target.currentTime = Math.max(0, Math.min(target.maxTime, target.currentTime + amount));
        results.push({ type: "trueDamage", target: eff.target, amount });
        break;
      }
      case "maxTime": {
        const floor = amount < 0 && target.baseMaxTime != null
          ? Math.max(1, target.baseMaxTime * MAX_TIME_REDUCTION_FLOOR_FRACTION)
          : 1;
        target.maxTime = Math.max(floor, target.maxTime + amount);
        if (amount > 0) target.currentTime = Math.min(target.maxTime, target.currentTime + amount);
        else target.currentTime = Math.min(target.currentTime, target.maxTime);
        results.push({ type: "maxTime", target: eff.target, amount });
        break;
      }
      case "regen":
        target.regen = Math.max(0, target.regen + amount);
        results.push({ type: "regen", target: eff.target, amount });
        break;
      case "shield":
        target.shield = (target.shield || 0) + amount;
        results.push({ type: "shield", target: eff.target, amount });
        break;
      case "drainRate":
        target.drainMult = Math.max(0.1, (target.drainMult ?? 1) + amount);
        results.push({ type: "drainRate", target: eff.target, amount });
        break;
      case "handSize":
        target.nextHandBonus = (target.nextHandBonus || 0) + amount;
        results.push({ type: "handSize", target: eff.target, amount });
        break;
      // Fraction of shield kept after each turn-end decay tick (see
      // BattleController.js's resolveTurnEnd) — higher retains more. Card
      // amounts are percentage-points (20 = 20%), hence the /100 here.
      case "shieldRetain":
        target.shieldRetain = Math.max(0, Math.min(1, (target.shieldRetain ?? 0.5) + amount / 100));
        results.push({ type: "shieldRetain", target: eff.target, amount });
        break;
      // Ticks for `amount` seconds off currentTime at every turn-end
      // (both sides, see resolveTurnEnd) regardless of whose turn it was —
      // stacks if applied more than once. Amount is positive; it's damage.
      case "poison":
        target.poison = Math.min(POISON_MAX_PER_TURN, (target.poison || 0) + amount);
        results.push({ type: "poison", target: eff.target, amount });
        break;
      // Grants decaying Reflect stacks — read by the "currentTime" case
      // above (bounces a slice of incoming damage back at the attacker) and
      // decayed once per turn-end in BattleController.js's resolveTurnEnd,
      // same cadence as shield/poison.
      case "reflect":
        target.reflect = (target.reflect || 0) + amount;
        results.push({ type: "reflect", target: eff.target, amount });
        break;
      // Purge — fully clears poison stacks regardless of card level (see
      // the noLevelScale note above; there's no magnitude here to scale).
      case "cleanse":
        target.poison = 0;
        results.push({ type: "cleanse", target: eff.target, amount });
        break;
      // Dampens (doesn't fully negate) how much of pace's speed-up applies
      // to this side's drain, for the rest of the fight (see the phase-drain
      // code in BattleController.js's tick). Amount is percentage-points
      // (50 = 50%) — stacks additively, capped at 100% (full immunity).
      case "timeless":
        target.timelessReduction = Math.max(0, Math.min(1, (target.timelessReduction || 0) + amount / 100));
        results.push({ type: "timeless", target: eff.target, amount });
        break;
      // Battle-level (not per-side) — handled specially in playCard
      // (BattleController.js), which reads def.effects directly for this
      // type instead of going through resolveEffects. No-op here so an
      // unrecognized type on a mixed effects array doesn't throw.
      case "pace":
        break;
    }
  }
  return results;
}

export function CardEffects() {}
