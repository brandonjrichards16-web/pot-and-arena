/**
 * Creating rooms is gated. Joining any size is always allowed.
 * Progression is intentionally slow: gems + matches (+ deep upgrades for mega).
 */
export const ROOM_SIZE_LADDER = [
  {
    maxN: 5,
    label: 'Sparring pit',
    free: true,
    gemCost: 0,
    matches: 0,
    upgradePoints: 0,
  },
  {
    maxN: 10,
    label: 'War band',
    free: false,
    gemCost: 40,
    matches: 5,
    upgradePoints: 0,
  },
  {
    maxN: 50,
    label: 'Battle host',
    free: false,
    gemCost: 150,
    matches: 20,
    upgradePoints: 4,
  },
  {
    maxN: 100,
    label: 'War host',
    free: false,
    gemCost: 400,
    matches: 50,
    upgradePoints: 8,
  },
  {
    maxN: 1000,
    label: 'Legion',
    free: false,
    gemCost: 1200,
    matches: 120,
    upgradePoints: 15,
  },
];

export const ABSOLUTE_MAX_N = 1000;

export function parseUnlockedMaxN(json) {
  try {
    const o = JSON.parse(json || '{}');
    const n = Number(o.maxCreateN);
    if (Number.isFinite(n) && n >= 5) return Math.min(ABSOLUTE_MAX_N, n);
  } catch {
    /* ignore */
  }
  return 5; // default unlock
}

export function nextUnlock(currentMax) {
  return ROOM_SIZE_LADDER.find((t) => t.maxN > currentMax) || null;
}

export function canMeetRequirements(tier, { matchesPlayed, upgradePoints }) {
  if (tier.free) return { ok: true };
  if ((matchesPlayed || 0) < tier.matches) {
    return {
      ok: false,
      reason: `Need ${tier.matches} matches played (you have ${matchesPlayed || 0})`,
    };
  }
  if ((upgradePoints || 0) < (tier.upgradePoints || 0)) {
    return {
      ok: false,
      reason: `Need ${tier.upgradePoints} total upgrade ranks (you have ${upgradePoints || 0})`,
    };
  }
  return { ok: true };
}
