/**
 * Pit fight gem prizes by placement.
 * Place 1 = champion (last standing). Place N = first eliminated.
 *
 * Small field (~5): #1 20 · #2 10 · #3 5 · mid 2 · bottom half 1
 *
 * Large fields pay the TOP much more — winning a 100-pit must feel
 * clearly better than winning a 10-pit (not a tiny bump).
 * Bottom half stays ~1 gem so the house economy doesn't explode.
 */

/**
 * @param {number} place 1-based rank (1 = best)
 * @param {number} fieldSize number of fighters in this pit fight
 * @returns {number} gems for that place (0 if invalid)
 */
export function arenaGemsForPlace(place, fieldSize) {
  const n = Math.max(1, Math.floor(fieldSize));
  const p = Math.floor(place);
  if (p < 1 || p > n) return 0;

  // Relative to a 5-person pit. Champion uses near-linear growth so
  // N=100 is a real jackpot vs N=10 (old 0.55 power was too flat).
  const t = n / 5; // 1 @5, 2 @10, 20 @100, 200 @1000

  if (p === 1) {
    // #1: ~20 @5 → ~48 @10 → ~140 @25 → ~260 @50 → ~480 @100 → ~2200 @1000
    const gems = 12 + 8 * Math.pow(t, 1.05) + 2.2 * t;
    return Math.max(20, Math.round(gems));
  }
  if (p === 2) {
    // Roughly half of #1, floor at 10
    const gems = 6 + 4.2 * Math.pow(t, 1.0) + 1.0 * t;
    return Math.max(10, Math.round(gems));
  }
  if (p === 3) {
    const gems = 3 + 2.2 * Math.pow(t, 0.95) + 0.45 * t;
    return Math.max(5, Math.round(gems));
  }

  // Places 4+ in top ~15%: solid mid prizes that still grow with N
  const topBand = Math.max(4, Math.ceil(n * 0.15));
  if (p <= topBand) {
    const depth = (p - 3) / Math.max(1, topBand - 3); // 0 at #4 → 1 at edge of band
    const base = 2.5 + 1.4 * Math.pow(t, 0.75);
    return Math.max(2, Math.round(base * (1 - 0.35 * depth)));
  }

  // Upper half (not bottom)
  if (p <= Math.ceil(n / 2)) {
    return Math.max(2, Math.round(1.5 + 0.9 * Math.pow(t, 0.55)));
  }

  // Bottom half — participation crumbs only
  return 1;
}

/**
 * Full prize table for a field size (for client display).
 * @returns {{ place: number, gems: number }[]}
 */
export function arenaPrizeTable(fieldSize) {
  const n = Math.max(1, Math.floor(fieldSize));
  const rows = [];
  for (let p = 1; p <= n; p++) {
    rows.push({ place: p, gems: arenaGemsForPlace(p, n) });
  }
  return rows;
}

/** Total gems paid if every place is a human (upper bound). */
export function arenaPrizePoolTotal(fieldSize) {
  return arenaPrizeTable(fieldSize).reduce((s, r) => s + r.gems, 0);
}
