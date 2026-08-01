// CardEffects
// Pure stat-resolution logic shared by the player's real card plays and the
// AI's decision heuristic (BattleController.js) — kept side-effect free
// (aside from mutating the plain stat objects passed in) so it's easy to
// reason about/reuse from both places.

// stats shape: { maxTime, currentTime, regen, shield, drainMult, nextHandBonus, shieldRetain }
export function resolveEffects(effects, level, casterStats, opponentStats) {
  const scale = 1 + 0.5 * (level - 1);
  const results = [];
  for (const eff of effects) {
    const amount = eff.amount * scale;
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
        target.maxTime = Math.max(1, target.maxTime + amount);
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
        target.poison = (target.poison || 0) + amount;
        results.push({ type: "poison", target: eff.target, amount });
        break;
      // One-shot flag: this side's drain ignores pace/intensity entirely
      // for the rest of the fight (see the phase-drain code in
      // BattleController.js's tick). Not stackable — just a switch.
      case "timeless":
        target.timeless = true;
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
