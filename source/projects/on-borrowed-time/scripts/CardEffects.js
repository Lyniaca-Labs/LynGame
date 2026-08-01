// CardEffects
// Pure stat-resolution logic shared by the player's real card plays and the
// AI's decision heuristic (BattleController.js) — kept side-effect free
// (aside from mutating the plain stat objects passed in) so it's easy to
// reason about/reuse from both places.

// stats shape: { maxTime, currentTime, regen, shield, drainMult, nextHandBonus }
export function resolveEffects(effects, level, casterStats, opponentStats) {
  const scale = 1 + 0.5 * (level - 1);
  const results = [];
  for (const eff of effects) {
    const amount = eff.amount * scale;
    const target = eff.target === "opponent" ? opponentStats : casterStats;
    switch (eff.type) {
      case "currentTime": {
        let amt = amount;
        if (amt < 0 && target.shield > 0) {
          const absorbed = Math.min(target.shield, -amt);
          target.shield -= absorbed;
          amt += absorbed;
        }
        target.currentTime = Math.max(0, Math.min(target.maxTime, target.currentTime + amt));
        results.push({ type: "currentTime", target: eff.target, amount: amt });
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
    }
  }
  return results;
}

export function CardEffects() {}
