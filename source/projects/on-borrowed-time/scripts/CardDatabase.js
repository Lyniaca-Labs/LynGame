// CardDatabase
// Static data only (no per-frame logic) — the required matching export
// below is a no-op so this file can still live in scripts/ and be imported
// by name (see PROJECT_STRUCTURE.md#scripts-folder) while its real payload
// (CARD_DEFS etc) is consumed via plain named imports from other scripts.
//
// Most "damage" cards hit the opponent's CURRENT time directly (simple,
// doesn't compound). The exception is Time Steal — a rare, pricier card
// that instead shaves a small amount off their MAX time. resolveEffects()
// (CardEffects.js) clamps current time down to the new max if it was above
// it, and every future regen/heal tick is now capped lower too — a much
// stronger effect per second than direct damage, which is exactly why it's
// gated to one rare card with a small amount instead of being the norm.

export const CARD_DEFS = {
  strike: {
    id: "strike", name: "Strike", tier: 1, price: 10,
    color: "#7f1d1d", icon: "#ef4444",
    descTemplate: "Deal {amt} damage.",
    effects: [{ type: "currentTime", target: "opponent", amount: -2 }],
  },
  heavyStrike: {
    id: "heavyStrike", name: "Heavy Strike", tier: 2, price: 20,
    color: "#7f1d1d", icon: "#b91c1c",
    descTemplate: "Deal {amt} damage.",
    effects: [{ type: "currentTime", target: "opponent", amount: -4 }],
  },
  guard: {
    id: "guard", name: "Guard", tier: 1, price: 11,
    color: "#1e3a5f", icon: "#3b82f6",
    descTemplate: "Gain {amt}s shield.",
    effects: [{ type: "shield", target: "self", amount: 3 }],
  },
  reinforce: {
    id: "reinforce", name: "Reinforce", tier: 3, price: 24,
    color: "#1e3a5f", icon: "#2563eb",
    descTemplate: "Gain {amt}s shield.",
    effects: [{ type: "shield", target: "self", amount: 6 }],
  },
  fortify: {
    id: "fortify", name: "Fortify", tier: 2, price: 18,
    color: "#1e3a5f", icon: "#60a5fa",
    descTemplate: "Increase your max time by {amt}s.",
    effects: [{ type: "maxTime", target: "self", amount: 2 }],
  },
  mend: {
    id: "mend", name: "Mend", tier: 1, price: 11,
    color: "#14532d", icon: "#22c55e",
    descTemplate: "Restore {amt}s.",
    effects: [{ type: "currentTime", target: "self", amount: 3 }],
  },
  secondWind: {
    id: "secondWind", name: "Second Wind", tier: 2, price: 19,
    color: "#14532d", icon: "#4ade80",
    descTemplate: "Increase your regen by {amt}s.",
    effects: [{ type: "regen", target: "self", amount: 2 }],
  },
  exhaust: {
    id: "exhaust", name: "Exhaust", tier: 2, price: 18,
    color: "#374151", icon: "#9ca3af",
    descTemplate: "Reduce opponent's regen by {amt}s.",
    effects: [{ type: "regen", target: "opponent", amount: -0.5 }],
  },
  focus: {
    id: "focus", name: "Focus", tier: 2, price: 16,
    color: "#3b2f5e", icon: "#a78bfa",
    descTemplate: "Slow your own clock for the rest of the fight.",
    effects: [{ type: "drainRate", target: "self", amount: -0.25 }],
  },
  haste: {
    id: "haste", name: "Haste", tier: 2, price: 19,
    color: "#5b3a29", icon: "#f59e0b",
    descTemplate: "Draw {amt} extra card(s) next hand.",
    effects: [{ type: "handSize", target: "self", amount: 1 }],
  },
  drainStrike: {
    id: "drainStrike", name: "Drain Strike", tier: 2, price: 20,
    color: "#4a1942", icon: "#e879f9",
    descTemplate: "Deal {amt} damage and heal {amt2}.",
    effects: [
      { type: "currentTime", target: "opponent", amount: -1 },
      { type: "currentTime", target: "self", amount: 1 },
    ],
  },
  // The one rare max-time card — see the header comment for why it's kept
  // small (0.5-1.5s base) instead of scaled up like the direct-damage cards.
  timeSteal: {
    id: "timeSteal", name: "Time Steal", tier: 3, price: 22,
    color: "#4a1942", icon: "#d946ef",
    descTemplate: "Reduce opponent's max time by {amt}s.",
    effects: [{ type: "maxTime", target: "opponent", amount: -1 }],
  },
};

export const STARTER_DECK = [
  "strike", "strike",
  "mend",
  "haste",
  "guard",
];

export const SHOP_POOL = Object.keys(CARD_DEFS);

export const AI_POOL = ["strike", "guard", "mend", "heavyStrike", "drainStrike", "timeSteal", "exhaust", "reinforce"];

export function formatDescription(def, level) {
  const scale = 1 + 0.5 * (level - 1);
  const nums = def.effects.map((e) => Math.round(Math.abs(e.amount) * scale * 10) / 10);
  return def.descTemplate.replace("{amt}", nums[0]).replace("{amt2}", nums[1]);
}

export function CardDatabase() {}
