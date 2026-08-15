/**
 * Gear look language — colors, glows, tier names.
 * Used so equipping Blade/Mail/Shield/Greaves is obvious even on race portraits.
 */

export const GEAR_VISUAL = {
  blade: {
    id: 'blade',
    name: 'Blade',
    short: 'ATK',
    emoji: '⚔️',
    // Warm steel / blood-red edge
    color: '#f87171',
    glow: 'rgba(248,113,113,0.55)',
    tint: 'rgba(220, 60, 60, 0.28)',
    edge: '#fecaca',
    blurb: 'Sharper swings · more Attack',
  },
  mail: {
    id: 'mail',
    name: 'Mail',
    short: 'HP',
    emoji: '🛡️',
    // Deep forest / vitality
    color: '#4ade80',
    glow: 'rgba(74,222,128,0.5)',
    tint: 'rgba(34, 140, 80, 0.26)',
    edge: '#bbf7d0',
    blurb: 'Thicker hide · more Hit Points',
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    short: 'DEF',
    emoji: '🧱',
    // Cool iron / sky
    color: '#38bdf8',
    glow: 'rgba(56,189,248,0.5)',
    tint: 'rgba(40, 120, 200, 0.24)',
    edge: '#bae6fd',
    blurb: 'Harder shell · more Defense',
  },
  greaves: {
    id: 'greaves',
    name: 'Greaves',
    short: 'SPD',
    emoji: '💨',
    // Lightning gold / speed
    color: '#fbbf24',
    glow: 'rgba(251,191,36,0.55)',
    tint: 'rgba(220, 170, 30, 0.22)',
    edge: '#fef08a',
    blurb: 'Quicker feet · more Speed (turns)',
  },
};

export const TIER_NAMES = {
  1: 'Rusty',
  2: 'Hardened',
  3: 'Veteran',
  4: 'Masterwork',
  5: 'Legendary',
};

export function gearVisual(kindId) {
  return GEAR_VISUAL[kindId] || GEAR_VISUAL.blade;
}

export function tierName(tier) {
  return TIER_NAMES[tier] || `T${tier}`;
}

/**
 * From publicGear().kinds → equipped list for overlays.
 * @returns {{ id, tier, color, glow, tint, emoji, name, short, bonusLabel }[]}
 */
export function equippedVisuals(kinds = []) {
  return (kinds || [])
    .filter((k) => k?.equipped?.tier)
    .map((k) => {
      const v = gearVisual(k.id);
      const t = k.equipped.tier;
      // Higher tier = stronger tint
      const strength = 0.55 + Math.min(5, t) * 0.09;
      return {
        id: k.id,
        tier: t,
        emoji: k.emoji || v.emoji,
        name: k.name || v.name,
        short: k.short || v.short,
        bonusLabel: k.equipped.bonusLabel || '',
        color: v.color,
        glow: v.glow,
        edge: v.edge,
        tint: v.tint,
        strength,
        tierLabel: tierName(t),
      };
    });
}

/** Single mixed aura color for ring glows (average of equipped). */
export function mixedAura(equippedList) {
  if (!equippedList?.length) return null;
  // Prefer strongest tier piece for outer ring
  const top = [...equippedList].sort((a, b) => b.tier - a.tier)[0];
  return top.glow;
}
