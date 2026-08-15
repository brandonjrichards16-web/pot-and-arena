/**
 * Themed gear sets — five origins, five body slots each.
 *
 * Equip pieces from any origin per slot. Wear all 5 slots from the SAME
 * origin → that origin’s full-set combat power + set flat stats.
 *
 * Progression: each (origin, slot) piece merges up to level 50.
 *   3× of level L → 1× of level L+1 (same origin + slot).
 *
 * Full-set boost uses the MIN level among the five equipped pieces of that
 * origin. Example: levels 7 / 20 / 15 / 10 / 7 → set power of level 7.
 * Raising the lowest piece raises the whole set’s bonus.
 *
 * Storage (users.gear_json v2):
 * {
 *   v: 2,
 *   bag: { elvan: { blade: { "1": 2, "7": 1 }, helm: {} , ... }, ... },
 *   loadout: { blade: "elvan", helm: "human", ... },
 *   autoEquipBest: true
 * }
 */

/** Merge cap per piece — long grind inside one origin */
export const MAX_GEAR_LEVEL = 50;
export const MERGE_NEED = 3;
/** @deprecated alias for older clients */
export const MAX_GEAR_TIER = MAX_GEAR_LEVEL;

// ——— Body slots (5 pieces per set) ———
export const GEAR_SLOTS = [
  {
    id: 'blade',
    name: 'Sword',
    stat: 'power',
    short: 'ATK',
    emoji: '⚔️',
    blurb: 'Main hand · Attack',
    color: '#f87171',
  },
  {
    id: 'helm',
    name: 'Helm',
    stat: 'guard',
    short: 'DEF',
    emoji: '🪖',
    blurb: 'Head · Defense',
    color: '#94a3b8',
  },
  {
    id: 'mail',
    name: 'Cuirass',
    stat: 'vitality',
    short: 'HP',
    emoji: '🦺',
    blurb: 'Chest · Hit Points',
    color: '#4ade80',
  },
  {
    id: 'shield',
    name: 'Shield',
    stat: 'guard',
    short: 'DEF',
    emoji: '🛡️',
    blurb: 'Off-hand · Defense',
    color: '#38bdf8',
  },
  {
    id: 'greaves',
    name: 'Greaves',
    stat: 'speed',
    short: 'SPD',
    emoji: '🥾',
    blurb: 'Legs · Speed',
    color: '#fbbf24',
  },
];

/** @deprecated old 4-kind name — same as slots for API compat */
export const GEAR_KINDS = GEAR_SLOTS;

const SLOT_IDS = GEAR_SLOTS.map((s) => s.id);

// ——— Origins / full sets (5 themes) ———
// Combat identities (full set of 5; set level = min equipped piece, 1–50):
//   Elvan        — hit ALL; pool ×L ÷ #foes (L1:×1 shared · L50:×50 → full each in a 50-man fight)
//   Human        — block first hits + counter-stun (1/2/3 blocks · up to 75% stun)
//   Ork          — multi-strike (2 → 3 → 4 swings)
//   Concord      — cleave 3 + light block/stun + late double-strike; pool ×L ÷ targets (capped)
//   Elderblight  — hit ALL; pool ×L ÷ #foes (whole numbers L1:×1 … L50:×50) + tank toys
export const GEAR_ORIGINS = [
  {
    id: 'elvan',
    name: 'Elvan-Made',
    emoji: '🌿',
    color: '#4ade80',
    race: 'elf',
    blurb: 'Hit every foe. Pool grows by whole levels — L1 shares ×1, L50 is ×50 ÷ foes.',
    setName: 'Starweave',
    damageMult: 1.2,
    cleaveAll: true,
    /** Integer pool = set level (1…50). Each foe takes pool ÷ #foes of a full hit. */
    cleavePoolPerLevel: true,
    setFlat: { power: 12, vitality: 22, guard: 8, speed: 16 },
  },
  {
    id: 'human',
    name: 'Human-Forged',
    emoji: '⚒️',
    color: '#38bdf8',
    race: 'human',
    blurb: 'Block opening hits and stun attackers. L25 blocks 2, L50 blocks 3 · stun up to 75%.',
    setName: 'Hearthsteel',
    damageMult: 1.25,
    firstHitBlock: true,
    counterStunMax: 0.75,
    blockChargesAt: { 1: 1, 25: 2, 50: 3 },
    setFlat: { power: 10, vitality: 40, guard: 16, speed: 8 },
  },
  {
    id: 'ork',
    name: 'Ork-Made',
    emoji: '💀',
    color: '#f87171',
    race: 'ork',
    blurb: 'Swing again and again on one target. L1: 2× · L25: 3× · L50: 4× per turn.',
    setName: 'Warscrap',
    damageMult: 1.2,
    strikeCountAt: { 1: 2, 25: 3, 50: 4 },
    setFlat: { power: 32, vitality: 28, guard: 10, speed: 4 },
  },
  {
    id: 'concord',
    name: 'Concord Alloy',
    emoji: '🕊️',
    color: '#fbbf24',
    race: null,
    blurb: 'Hybrid: cleave 3, block, late double-strike, stun on hit. Balanced of all three.',
    setName: 'Pactfire',
    damageMult: 1.35,
    firstHitBlock: true,
    blockChargesAt: { 1: 1, 50: 2 },
    counterStunMax: 0.4,
    stunOnHitMax: 0.35,
    cleaveCount: 3,
    /** Pool scales with level but softer than full AOE sets (still whole numbers). */
    cleavePoolPerLevel: true,
    cleavePoolScale: 0.6, // L50 → ×30 ÷ 3 targets ≈ 10 full hits each
    strikeCountAt: { 1: 1, 25: 2 },
    setFlat: { power: 18, vitality: 44, guard: 14, speed: 12 },
  },
  {
    id: 'elderblight',
    name: 'Elderblight',
    emoji: '☠️',
    color: '#a78bfa',
    race: null,
    blurb: 'Hit all foes. Damage pool is whole levels: ×1 at L1 up to ×50 at L50, then ÷ #foes.',
    setName: 'Gravewake',
    damageMult: 1.45,
    firstHitBlock: true,
    blockChargesAt: { 1: 1, 50: 2 },
    counterStunMax: 0.45,
    stunOnHitMax: 0.4,
    cleaveAll: true,
    cleavePoolPerLevel: true, // L1:×1 · L25:×25 · L50:×50
    setFlat: { power: 40, vitality: 80, guard: 22, speed: 10 },
  },
];

const ORIGIN_IDS = GEAR_ORIGINS.map((o) => o.id);

export function originById(id) {
  return GEAR_ORIGINS.find((o) => o.id === id) || null;
}

export function slotById(id) {
  return GEAR_SLOTS.find((s) => s.id === id) || null;
}

export function kindById(id) {
  return slotById(id);
}

/**
 * Flat bonus for one equipped piece at a level (1–50).
 * Smooth climb so every merge matters; L50 is a real wall.
 *   ATK/SPD ~ L1:3 · L10:18 · L25:55 · L50:145
 *   HP      ~ L1:7 · L10:45 · L25:140 · L50:380
 */
export function bonusForLevel(slotId, level) {
  const L = Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(level) || 1));
  const flat = Math.round(1.5 + L * 1.4 + L * L * 0.028);
  const hp = Math.round(4 + L * 3.4 + L * L * 0.08);
  const slot = slotById(slotId);
  if (!slot) return 0;
  if (slot.stat === 'vitality') return hp;
  // helm + shield both DEF — helm slightly lighter
  if (slot.id === 'helm') return Math.max(1, Math.round(flat * 0.7));
  return flat;
}

/**
 * How strong the full-set combat powers are at a given min level (1–50).
 * Returns 0..1 progress (L1 mild, L50 full unique power).
 */
export function setPowerProgress(minLevel) {
  const L = Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(minLevel) || 1));
  return (L - 1) / (MAX_GEAR_LEVEL - 1);
}

/** @deprecated */
export function bonusForTier(kindId, tier) {
  return bonusForLevel(kindId, tier);
}

export function emptyBag() {
  const bag = {};
  for (const o of ORIGIN_IDS) {
    bag[o] = {};
    for (const s of SLOT_IDS) bag[o][s] = {};
  }
  return bag;
}

export function emptyGear() {
  return {
    v: 2,
    bag: emptyBag(),
    loadout: {},
    autoEquipBest: true,
  };
}

/**
 * Migrate old { blade: { "3": 1 }, loadout: { blade: 3 } } into v2.
 * Old tiers → Human-Forged piece levels; tiers 4–5 also seed Ork / Elderblight.
 */
function migrateV1(raw) {
  const g = emptyGear();
  const oldSlots = ['blade', 'mail', 'shield', 'greaves'];
  for (const slot of oldSlots) {
    const bag = raw[slot];
    if (!bag || typeof bag !== 'object') continue;
    for (let t = 1; t <= 5; t++) {
      const n = Number(bag[t] ?? bag[String(t)] ?? 0);
      if (n <= 0) continue;
      // Map power tier into origins so nothing is lost
      let origin = 'human';
      if (t >= 5) origin = 'elderblight';
      else if (t === 4) origin = 'ork';
      else if (t === 3) origin = 'elvan';
      else if (t === 2) origin = 'concord';
      g.bag[origin][slot][String(Math.min(t, 3))] =
        (g.bag[origin][slot][String(Math.min(t, 3))] || 0) + n;
    }
  }
  // helm was missing in v1 — gift a matching human helm L1 if they had any gear
  const hadAny = oldSlots.some((s) => {
    const bag = raw[s];
    if (!bag) return false;
    return Object.values(bag).some((n) => Number(n) > 0);
  });
  if (hadAny) {
    g.bag.human.helm['1'] = (g.bag.human.helm['1'] || 0) + 1;
  }
  g.autoEquipBest = raw.autoEquipBest !== false;
  return g;
}

export function parseGear(json) {
  let raw = {};
  try {
    raw = typeof json === 'string' ? JSON.parse(json || '{}') : json || {};
  } catch {
    return emptyGear();
  }

  // v2
  if (raw.v === 2 && raw.bag) {
    const g = emptyGear();
    g.autoEquipBest = raw.autoEquipBest !== false;
    for (const o of ORIGIN_IDS) {
      for (const s of SLOT_IDS) {
        const bag = raw.bag?.[o]?.[s] || {};
        for (let lv = 1; lv <= MAX_GEAR_LEVEL; lv++) {
          const n = Number(bag[lv] ?? bag[String(lv)] ?? 0);
          if (n > 0) g.bag[o][s][String(lv)] = Math.floor(n);
        }
      }
    }
    const loadout = {};
    if (raw.loadout && typeof raw.loadout === 'object') {
      for (const s of SLOT_IDS) {
        const v = raw.loadout[s];
        if (typeof v === 'string' && ORIGIN_IDS.includes(v)) loadout[s] = v;
        else if (v && typeof v === 'object' && ORIGIN_IDS.includes(v.originId)) {
          loadout[s] = v.originId;
        }
      }
    }
    g.loadout = loadout;
    return g;
  }

  // v1 legacy
  if (raw.blade || raw.mail || raw.shield || raw.greaves) {
    return migrateV1(raw);
  }

  return emptyGear();
}

export function serializeGear(gear) {
  const g = gear?.v === 2 ? gear : parseGear(JSON.stringify(gear || {}));
  return JSON.stringify({
    v: 2,
    bag: g.bag || emptyBag(),
    loadout: g.loadout || {},
    autoEquipBest: g.autoEquipBest !== false,
  });
}

export function bestLevel(gear, originId, slotId) {
  const bag = gear?.bag?.[originId]?.[slotId] || {};
  for (let lv = MAX_GEAR_LEVEL; lv >= 1; lv--) {
    if ((bag[String(lv)] || 0) > 0) return lv;
  }
  return 0;
}

export function countPiece(gear, originId, slotId) {
  const bag = gear?.bag?.[originId]?.[slotId] || {};
  let n = 0;
  for (let lv = 1; lv <= MAX_GEAR_LEVEL; lv++) n += bag[String(lv)] || 0;
  return n;
}

/** Best level owned for a slot across any origin */
export function bestLevelAnyOrigin(gear, slotId) {
  let best = 0;
  let origin = null;
  for (const o of ORIGIN_IDS) {
    const lv = bestLevel(gear, o, slotId);
    if (lv > best) {
      best = lv;
      origin = o;
    }
  }
  return { level: best, originId: origin };
}

/**
 * What is equipped in a slot: { originId, level } or null
 */
export function equippedInSlot(gear, slotId) {
  const g = gear || emptyGear();
  if (g.autoEquipBest !== false) {
    const b = bestLevelAnyOrigin(g, slotId);
    if (!b.level) return null;
    return { originId: b.originId, level: b.level };
  }
  const originId = g.loadout?.[slotId];
  if (!originId) return null;
  const level = bestLevel(g, originId, slotId);
  if (!level) return null;
  return { originId, level };
}

export function setAutoEquipBest(gear, enabled) {
  const g = parseGear(serializeGear(gear));
  g.autoEquipBest = !!enabled;
  if (g.autoEquipBest) {
    // Snapshot current best into loadout for when they toggle off
    const lo = {};
    for (const s of SLOT_IDS) {
      const eq = equippedInSlot({ ...g, autoEquipBest: true }, s);
      if (eq) lo[s] = eq.originId;
    }
    g.loadout = lo;
  }
  return g;
}

/**
 * Manually equip an origin’s piece in a slot (uses best level of that piece).
 * Forces auto off. originId null / '' unequips.
 */
export function setEquippedOrigin(gear, slotId, originId) {
  const g = parseGear(serializeGear(gear));
  if (!slotById(slotId)) {
    return { ok: false, error: 'Unknown slot', gear: g };
  }
  g.autoEquipBest = false;
  if (!g.loadout) g.loadout = {};
  if (!originId) {
    delete g.loadout[slotId];
    return { ok: true, gear: g };
  }
  if (!originById(originId)) {
    return { ok: false, error: 'Unknown gear origin', gear: g };
  }
  if (bestLevel(g, originId, slotId) < 1) {
    return { ok: false, error: "You don't have that piece", gear: g };
  }
  g.loadout[slotId] = originId;
  return { ok: true, gear: g };
}

/** Compat: old setMemberRole style equip by tier number within "best" origin — maps to human */
export function setEquippedTier(gear, kindId, tier) {
  // Old API: equip a tier of a kind. Find any origin with that level on that slot.
  const g = parseGear(serializeGear(gear));
  if (!slotById(kindId)) {
    return { ok: false, error: 'Unknown gear', gear: g };
  }
  const t = Math.floor(Number(tier) || 0);
  if (t <= 0) return setEquippedOrigin(g, kindId, null);
  for (const o of ORIGIN_IDS) {
    const bag = g.bag[o][kindId] || {};
    if ((bag[String(t)] || 0) > 0) {
      // temporarily ensure best shows that level by only equipping origin
      // (level is always bestLevel of origin — if they have higher, they wear higher)
      return setEquippedOrigin(g, kindId, o);
    }
  }
  return { ok: false, error: "You don't have that piece", gear: g };
}

export function addPiece(gear, originId, slotId, level = 1, count = 1) {
  const g = parseGear(serializeGear(gear));
  const origin = originById(originId);
  const slot = slotById(slotId);
  if (!origin || !slot) return { gear: g, added: null };
  const lv = Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(level) || 1));
  const n = Math.max(1, Math.floor(count) || 1);
  const key = String(lv);
  g.bag[originId][slotId][key] = (g.bag[originId][slotId][key] || 0) + n;
  const bonus = bonusForLevel(slotId, lv);
  return {
    gear: g,
    added: {
      originId,
      originName: origin.name,
      slotId,
      slotName: slot.name,
      level: lv,
      emoji: `${origin.emoji}${slot.emoji}`,
      name: `${origin.name} ${slot.name}`,
      short: slot.short,
      color: origin.color,
      count: n,
      bonus,
      bonusLabel: `+${bonus} ${slot.short}`,
      label: `${origin.emoji} ${origin.name} ${slot.name} L${lv}`,
    },
  };
}

/**
 * Merge 3 of same origin+slot+level → 1 of next level.
 * body compat: mergeGear(gear, kindId, tier) treats kind as slot and finds best origin with that level
 */
export function mergeGear(gear, originOrSlot, levelOrTier, maybeLevel) {
  const g = parseGear(serializeGear(gear));

  // New signature: mergeGear(gear, originId, slotId, level)
  // Old signature: mergeGear(gear, kindId, tier)
  let originId;
  let slotId;
  let level;

  if (maybeLevel != null || (originById(originOrSlot) && slotById(levelOrTier))) {
    originId = originOrSlot;
    slotId = levelOrTier;
    level = maybeLevel != null ? maybeLevel : 1;
  } else {
    // old: (gear, slotId, level) — pick first origin that has 3+
    slotId = originOrSlot;
    level = levelOrTier;
    originId = null;
    for (const o of ORIGIN_IDS) {
      const have = g.bag[o]?.[slotId]?.[String(level)] || 0;
      if (have >= MERGE_NEED) {
        originId = o;
        break;
      }
    }
    if (!originId) {
      return {
        ok: false,
        error: `Need ${MERGE_NEED} pieces to merge`,
        gear: g,
      };
    }
  }

  const origin = originById(originId);
  const slot = slotById(slotId);
  if (!origin || !slot) {
    return { ok: false, error: 'Unknown gear', gear: g };
  }
  const t = Math.floor(level);
  if (t < 1 || t >= MAX_GEAR_LEVEL) {
    return { ok: false, error: 'Cannot merge this level', gear: g };
  }
  const key = String(t);
  const have = g.bag[originId][slotId][key] || 0;
  if (have < MERGE_NEED) {
    return {
      ok: false,
      error: `Need ${MERGE_NEED}× ${origin.name} ${slot.name} L${t} (have ${have})`,
      gear: g,
    };
  }
  g.bag[originId][slotId][key] = have - MERGE_NEED;
  if (g.bag[originId][slotId][key] <= 0) delete g.bag[originId][slotId][key];
  const next = String(t + 1);
  g.bag[originId][slotId][next] = (g.bag[originId][slotId][next] || 0) + 1;

  return {
    ok: true,
    gear: g,
    crafted: {
      originId,
      slotId,
      name: `${origin.name} ${slot.name}`,
      emoji: origin.emoji,
      tier: t + 1,
      level: t + 1,
      short: slot.short,
      color: origin.color,
      bonusIfBest: bonusForLevel(slotId, t + 1),
      tierName: `L${t + 1}`,
      label: `${origin.emoji} ${origin.name} ${slot.name} L${t + 1}`,
      from: { tier: t, level: t, spent: MERGE_NEED },
    },
  };
}

/**
 * Keep merging one origin+slot from the lowest level up until nothing
 * has 3+ left. Cascades (extra L1s → L2s that then merge further).
 */
export function mergeAllGear(gear, originId, slotId) {
  let g = parseGear(serializeGear(gear));
  const origin = originById(originId);
  const slot = slotById(slotId);
  if (!origin || !slot) {
    return { ok: false, error: 'Unknown gear', gear: g, merges: 0 };
  }

  let merges = 0;
  let highestCrafted = 0;
  // Cap: worst case many low-level merges; keep server safe
  const CAP = 2000;
  for (let guard = 0; guard < CAP; guard++) {
    let mergedThisPass = false;
    for (let lv = 1; lv < MAX_GEAR_LEVEL; lv++) {
      const have = g.bag[originId]?.[slotId]?.[String(lv)] || 0;
      if (have < MERGE_NEED) continue;
      const result = mergeGear(g, originId, slotId, lv);
      if (!result.ok) break;
      g = result.gear;
      merges += 1;
      highestCrafted = Math.max(highestCrafted, result.crafted?.level || 0);
      mergedThisPass = true;
      break; // restart from L1 so cascades resolve in order
    }
    if (!mergedThisPass) break;
  }

  if (merges <= 0) {
    return {
      ok: false,
      error: `Need ${MERGE_NEED} of the same level to merge`,
      gear: g,
      merges: 0,
    };
  }

  return {
    ok: true,
    gear: g,
    merges,
    highestCrafted,
    crafted: {
      originId,
      slotId,
      name: `${origin.name} ${slot.name}`,
      emoji: origin.emoji,
      level: highestCrafted,
      tier: highestCrafted,
      short: slot.short,
      color: origin.color,
      label: `${origin.emoji} ${origin.name} ${slot.name}`,
      merges,
    },
  };
}

/**
 * Pick a threshold table value: { 1: v1, 25: v2, 50: v3 } → highest key ≤ level.
 */
function thresholdAt(table, level, fallback = 0) {
  if (!table || typeof table !== 'object') return fallback;
  let best = fallback;
  let bestKey = -Infinity;
  for (const [k, v] of Object.entries(table)) {
    const key = Number(k);
    if (!Number.isFinite(key)) continue;
    if (key <= level && key >= bestKey) {
      bestKey = key;
      best = v;
    }
  }
  return best;
}

/**
 * Per-target damage scale for multi-target set hits.
 * Integer pool model: each foe takes (cleavePowerScale / nT) of a full hit.
 * L1 pool 1 → 1 hit shared · L50 pool 50 → full hit each in a 50-foe fight.
 */
export function cleaveDamageScale(set, targetCount) {
  const nT = Math.max(1, targetCount | 0);
  if (nT <= 1) return 1;
  const pool = Number(set?.cleavePowerScale);
  if (Number.isFinite(pool) && pool > 0) return pool / nT;
  return 1;
}

/**
 * Whole-number damage pool at a set level.
 * Default: pool === level (1…50). Optional scale factor (Concord uses 0.6 → L50:×30).
 */
function poolAtLevel(origin, minLv) {
  if (!origin?.cleavePoolPerLevel && origin?.cleavePoolMax == null) {
    if (origin?.cleavePowerScale != null) {
      // legacy constant max with linear climb — still snap to whole numbers
      const p = setPowerProgress(minLv);
      const maxCleave = Number(origin.cleavePowerScale) || 1;
      return Math.max(1, Math.round(maxCleave * (0.25 + 0.75 * p)));
    }
    return 0;
  }
  if (origin.cleavePoolPerLevel) {
    const scale = Number(origin.cleavePoolScale);
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) {
      return Math.max(1, Math.round(minLv * scale));
    }
    return minLv; // L1:×1 · L25:×25 · L50:×50
  }
  // cleavePoolMax with linear whole steps
  const max = Math.max(1, Math.round(Number(origin.cleavePoolMax) || 50));
  const p = setPowerProgress(minLv);
  return Math.max(1, Math.round(1 + (max - 1) * p));
}

/**
 * Combat + flat set bonuses at a given set level (min piece level 1–50).
 * Shared by resolveGearSet and the UI ladder readout.
 */
export function setBoostAtLevel(originId, minLevel) {
  const origin = originById(originId);
  if (!origin) return null;
  const minLv = Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(minLevel) || 1));
  const p = setPowerProgress(minLv);
  const baseFlat = origin.setFlat || {};
  const flatMul = minLv / 10;
  const setFlat = {
    power: Math.round((baseFlat.power || 0) * flatMul),
    vitality: Math.round((baseFlat.vitality || 0) * flatMul),
    guard: Math.round((baseFlat.guard || 0) * flatMul),
    speed: Math.round((baseFlat.speed || 0) * flatMul),
  };
  const maxDmg = origin.damageMult || 1;
  const damageMult = 1 + (maxDmg - 1) * (0.12 + 0.88 * p);
  const dmgPct = Math.round((damageMult - 1) * 100);

  // —— Stun on hit (offensive) —— whole % in UI
  const stunMax = origin.stunOnHitMax ?? origin.stunOnHitChance ?? 0;
  const stunOnHitChance = stunMax > 0 ? stunMax * (0.2 + 0.8 * p) : 0;

  // —— Block charges + counter-stun (defensive) ——
  let blockCharges = 0;
  if (origin.blockChargesAt) {
    blockCharges = Number(thresholdAt(origin.blockChargesAt, minLv, 0)) || 0;
  } else if (origin.firstHitBlock) {
    blockCharges = 1;
  }
  const firstHitBlock = blockCharges > 0;
  const counterMax = origin.counterStunMax ?? origin.counterStunChance ?? 0;
  let counterStunChance = 0;
  if (counterMax > 0) {
    if (origin.id === 'human') {
      // L1 15% → L50 75% (display rounds to whole %)
      counterStunChance = 0.15 + (counterMax - 0.15) * p;
    } else {
      counterStunChance = counterMax * (0.25 + 0.75 * p);
    }
  }

  // —— Multi-strike (Ork / Concord) ——
  let strikeCount = 1;
  if (origin.strikeCountAt) {
    strikeCount = Math.max(
      1,
      Number(thresholdAt(origin.strikeCountAt, minLv, 1)) || 1
    );
  }

  // —— Cleave: whole-number pool only (no tenths) ——
  const cleaveAll = !!origin.cleaveAll;
  const cleaveCount = cleaveAll
    ? 999
    : Math.max(0, Number(origin.cleaveCount) || 0);
  const doesCleave = cleaveAll || cleaveCount > 1;
  const cleavePowerScale = doesCleave ? poolAtLevel(origin, minLv) : 0;
  const cleaveFill = null; // retired — pool model only

  const lines = [];
  lines.push(`+${dmgPct}% dmg`);
  if (setFlat.power) lines.push(`+${setFlat.power} ATK`);
  if (setFlat.vitality) lines.push(`+${setFlat.vitality} HP`);
  if (setFlat.guard) lines.push(`+${setFlat.guard} DEF`);
  if (setFlat.speed) lines.push(`+${setFlat.speed} SPD`);

  if (strikeCount > 1) {
    lines.push(`${strikeCount}× attacks / turn`);
  }

  if (blockCharges > 0) {
    lines.push(
      blockCharges === 1
        ? 'Block first hit'
        : `Block first ${blockCharges} hits`
    );
  }
  if (counterStunChance > 0.01) {
    lines.push(
      `${Math.round(counterStunChance * 100)}% stun on block`
    );
  }

  if (doesCleave && cleavePowerScale > 0) {
    const poolTxt = `×${Math.round(cleavePowerScale)}`;
    if (cleaveAll) {
      lines.push(
        minLv >= MAX_GEAR_LEVEL
          ? `Hit all · pool ${poolTxt} ÷ foes (full hit each in a 50-man fight)`
          : `Hit all · pool ${poolTxt} ÷ #foes`
      );
    } else {
      lines.push(`Cleave ${cleaveCount} · pool ${poolTxt} ÷ targets`);
    }
  }

  if (stunOnHitChance > 0.01) {
    lines.push(`${Math.round(stunOnHitChance * 100)}% stun on hit`);
  }

  return {
    level: minLv,
    damageMult,
    damageBonusPct: dmgPct,
    setFlat,
    firstHitBlock,
    blockCharges,
    counterStunChance,
    cleaveAll,
    cleaveCount,
    cleaveFill,
    cleavePowerScale,
    strikeCount,
    stunOnHitChance,
    lines,
    summary: lines.join(' · '),
  };
}

/** Full L1–L50 ladder for set-info UI */
export function setBoostLadder(originId) {
  const origin = originById(originId);
  if (!origin) return [];
  const ladder = [];
  for (let lv = 1; lv <= MAX_GEAR_LEVEL; lv++) {
    ladder.push(setBoostAtLevel(originId, lv));
  }
  return ladder;
}

/**
 * Active full set if all 5 slots wear the same origin.
 * Set power = f(minLevel of those five pieces).
 */
export function resolveGearSet(gear) {
  const g = gear || emptyGear();
  const worn = SLOT_IDS.map((s) => equippedInSlot(g, s));
  if (worn.some((w) => !w)) return null;
  const originId = worn[0].originId;
  if (!worn.every((w) => w.originId === originId)) return null;
  const origin = originById(originId);
  if (!origin) return null;

  const minLv = Math.min(...worn.map((w) => w.level));
  const maxLv = Math.max(...worn.map((w) => w.level));
  const boost = setBoostAtLevel(originId, minLv);
  const p = setPowerProgress(minLv);

  return {
    originId: origin.id,
    id: origin.id,
    setId: origin.id,
    name: origin.setName || origin.name,
    originName: origin.name,
    emoji: origin.emoji,
    color: origin.color,
    blurb: origin.blurb,
    setLabel: origin.name,
    letter: origin.name[0],
    setTier: minLv,
    minLevel: minLv,
    maxLevel: maxLv,
    setPowerProgress: Math.round(p * 100),
    damageMult: boost.damageMult,
    firstHitBlock: boost.firstHitBlock,
    blockCharges: boost.blockCharges || 0,
    counterStunChance: boost.counterStunChance,
    cleaveAll: boost.cleaveAll,
    cleaveCount: boost.cleaveCount,
    cleaveFill: boost.cleaveFill,
    cleavePowerScale: boost.cleavePowerScale,
    strikeCount: boost.strikeCount || 1,
    stunOnHitChance: boost.stunOnHitChance,
    setFlat: boost.setFlat,
    boostLines: boost.lines,
  };
}

/** Milestone levels for set-info ladder (full 1–50 is huge over the wire). */
const LADDER_MILESTONES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function publicGearSetCatalog() {
  return GEAR_ORIGINS.map((o) => ({
    id: o.id,
    originId: o.id,
    name: o.name,
    setName: o.setName,
    emoji: o.emoji,
    color: o.color,
    blurb: o.blurb,
    setLabel: o.name,
    letter: o.name[0],
    damageMult: o.damageMult || 1,
    effects: {
      damageMult: o.damageMult || 1,
      firstHitBlock: !!o.firstHitBlock,
      blockChargesAt: o.blockChargesAt || null,
      cleaveAll: !!o.cleaveAll,
      cleaveCount: o.cleaveCount || 0,
      cleavePoolPerLevel: !!o.cleavePoolPerLevel,
      cleavePoolScale: o.cleavePoolScale ?? 1,
      strikeCountAt: o.strikeCountAt || null,
      stunOnHitMax: o.stunOnHitMax || o.stunOnHitChance || 0,
      counterStunMax: o.counterStunMax || o.counterStunChance || 0,
    },
    // Compact ladder — milestones only (client can still show L1–L50 copy)
    boostLadder: LADDER_MILESTONES.map((lv) => {
      const b = setBoostAtLevel(o.id, lv);
      return {
        level: b.level,
        summary: b.summary,
        damageBonusPct: b.damageBonusPct,
        lines: b.lines,
      };
    }),
  }));
}

export function gearBonus(gear) {
  const g = parseGear(serializeGear(gear));
  const out = {
    power: 0,
    vitality: 0,
    guard: 0,
    speed: 0,
    equipped: {},
    autoEquipBest: g.autoEquipBest !== false,
    setFlat: null,
  };

  for (const slot of GEAR_SLOTS) {
    const eq = equippedInSlot(g, slot.id);
    if (!eq) {
      out.equipped[slot.id] = null;
      continue;
    }
    const bonus = bonusForLevel(slot.id, eq.level);
    out[slot.stat] = (out[slot.stat] || 0) + bonus;
    const origin = originById(eq.originId);
    out.equipped[slot.id] = {
      kind: slot.id,
      slotId: slot.id,
      originId: eq.originId,
      name: `${origin?.name || ''} ${slot.name}`.trim(),
      emoji: slot.emoji,
      tier: eq.level,
      level: eq.level,
      short: slot.short,
      bonus,
      bonusLabel: `+${bonus} ${slot.short}`,
      setLetter: origin?.name?.[0],
      originName: origin?.name,
      color: origin?.color,
    };
  }

  const set = resolveGearSet(g);
  if (set?.setFlat) {
    out.power += set.setFlat.power || 0;
    out.vitality += set.setFlat.vitality || 0;
    out.guard += set.setFlat.guard || 0;
    out.speed += set.setFlat.speed || 0;
    out.setFlat = { ...set.setFlat, name: set.name, originId: set.originId };
  }

  out.ATK = out.power;
  out.HP = out.vitality;
  out.DEF = out.guard;
  out.SPD = out.speed;
  return out;
}

export function applyGearBonus(fighter, gear) {
  const b = gearBonus(gear);
  const set = resolveGearSet(gear);
  return {
    ...fighter,
    power: (fighter.power || 0) + b.power,
    vitality: (fighter.vitality || 0) + b.vitality,
    guard: (fighter.guard || 0) + b.guard,
    speed: (fighter.speed || 0) + b.speed,
    gearEquipped: b.equipped,
    gearSet: set,
    // Portrait / road / pit armor art key (null unless full same-origin set)
    gearOrigin: set?.originId || null,
  };
}

/**
 * @param {object} gear
 * @param {{ compact?: boolean }} [opts] compact=true omits per-level bags (for /me embed)
 */
export function publicGear(gear, opts = {}) {
  const compact = !!opts.compact;
  const g = parseGear(serializeGear(gear));
  const bonus = gearBonus(g);
  const set = resolveGearSet(g);
  const auto = g.autoEquipBest !== false;

  let bagPieceCount = 0;

  const origins = GEAR_ORIGINS.map((origin) => {
    const pieces = GEAR_SLOTS.map((slot) => {
      const bag = g.bag[origin.id][slot.id] || {};
      const levels = [];
      if (!compact) {
        for (let lv = 1; lv <= MAX_GEAR_LEVEL; lv++) {
          const count = bag[String(lv)] || 0;
          if (count <= 0) continue;
          levels.push({
            level: lv,
            tier: lv,
            count,
            bonus: bonusForLevel(slot.id, lv),
            bonusLabel: `+${bonusForLevel(slot.id, lv)} ${slot.short}`,
            canMerge: lv < MAX_GEAR_LEVEL && count >= MERGE_NEED,
            mergeNeed: MERGE_NEED,
            equipped:
              bonus.equipped[slot.id]?.originId === origin.id &&
              bonus.equipped[slot.id]?.level === lv,
            displayName: `${origin.name} ${slot.name} L${lv}`,
          });
        }
      }
      const best = bestLevel(g, origin.id, slot.id);
      const total = countPiece(g, origin.id, slot.id);
      bagPieceCount += total;
      const eq = bonus.equipped[slot.id];
      const canUpgrade = !compact
        ? levels.some((lv) => lv.canMerge)
        : // compact: estimate mergeability without listing every level
          Object.entries(bag).some(
            ([lv, n]) => Number(lv) < MAX_GEAR_LEVEL && Number(n) >= MERGE_NEED
          );
      return {
        slotId: slot.id,
        slotName: slot.name,
        short: slot.short,
        emoji: slot.emoji,
        total,
        bestLevel: best,
        showLevel: best || 0,
        equipped: eq?.originId === origin.id,
        canUpgrade,
        upgradeHint: canUpgrade ? 'upgrade' : null,
        levels,
        tiers: levels, // compat
      };
    });
    const worn = pieces.filter((p) => p.equipped).length;
    // Always ship a cheap L1 teaser so UI can advertise set bonus without full ladder
    const l1 = setBoostAtLevel(origin.id, 1);
    return {
      id: origin.id,
      name: origin.name,
      setName: origin.setName,
      emoji: origin.emoji,
      color: origin.color,
      blurb: origin.blurb,
      /** One-line “what you get for full set at L1” — always present */
      setBonusSummary: l1?.summary || origin.blurb,
      setBonusLines: l1?.lines || [],
      pieces,
      wornCount: worn,
      slotsTotal: SLOT_IDS.length,
      complete: set?.originId === origin.id,
      setBonusActive: set?.originId === origin.id,
      ownedCount: pieces.filter((p) => p.total > 0).length,
      // Ladder only once via setCatalog — not duplicated per origin
      boostLadder: compact
        ? []
        : LADDER_MILESTONES.map((lv) => {
            const b = setBoostAtLevel(origin.id, lv);
            return {
              level: b.level,
              summary: b.summary,
              damageBonusPct: b.damageBonusPct,
              lines: b.lines,
            };
          }),
    };
  });

  // Flatten "kinds" for older UI that maps kinds
  const kinds = GEAR_SLOTS.map((slot) => {
    const eq = bonus.equipped[slot.id];
    const tiers = [];
    let total = 0;
    for (const origin of GEAR_ORIGINS) {
      const bag = g.bag[origin.id][slot.id] || {};
      for (let lv = 1; lv <= MAX_GEAR_LEVEL; lv++) {
        const count = bag[String(lv)] || 0;
        if (count <= 0) continue;
        total += count;
        // compact: skip listing every origin×level row (was 60+ per slot)
        if (compact) continue;
        tiers.push({
          tier: lv,
          level: lv,
          count,
          originId: origin.id,
          originName: origin.name,
          bonus: bonusForLevel(slot.id, lv),
          bonusLabel: `+${bonusForLevel(slot.id, lv)} ${slot.short}`,
          canMerge: lv < MAX_GEAR_LEVEL && count >= MERGE_NEED,
          mergeNeed: MERGE_NEED,
          equipped: eq?.originId === origin.id && eq?.level === lv,
          isBest: eq?.originId === origin.id && eq?.level === lv,
          displayName: `${origin.emoji} ${origin.name} ${slot.name} L${lv}`,
          setLabel: origin.name,
          setLetter: origin.name[0],
          color: origin.color,
          tierName: `L${lv}`,
          // unique key for React lists (tier alone collides across origins)
          key: `${origin.id}_${lv}`,
        });
      }
    }
    return {
      id: slot.id,
      name: slot.name,
      emoji: slot.emoji,
      short: slot.short,
      blurb: slot.blurb,
      color: slot.color,
      total,
      bestTier: eq?.level || 0,
      equipped: eq
        ? {
            ...eq,
            color: originById(eq.originId)?.color,
            tierName: `L${eq.level}`,
            setLabel: originById(eq.originId)?.name,
            effectLine: `${eq.bonusLabel} · ${originById(eq.originId)?.name || ''}`,
            bonusLabel: `+${bonusForLevel(slot.id, eq.level)} ${slot.short}`,
            tier: eq.level,
          }
        : null,
      tiers,
    };
  });

  const wornOrigins = SLOT_IDS.map((s) => equippedInSlot(g, s)?.originId || '—');

  return {
    v: 2,
    slots: GEAR_SLOTS,
    origins,
    kinds,
    bagPieceCount,
    bonus: {
      ATK: bonus.ATK,
      HP: bonus.HP,
      DEF: bonus.DEF,
      SPD: bonus.SPD,
      setFlat: bonus.setFlat || null,
    },
    autoEquipBest: auto,
    mergeNeed: MERGE_NEED,
    maxTier: MAX_GEAR_LEVEL,
    maxLevel: MAX_GEAR_LEVEL,
    set,
    setActive: !!set,
    setProgress: {
      wornOrigins: Object.fromEntries(SLOT_IDS.map((s, i) => [s, wornOrigins[i]])),
      matching: !!set,
      setFlat: bonus.setFlat || null,
      hint: set
        ? `${set.emoji} ${set.originName} “${set.name}” ACTIVE · set level ${set.minLevel} (weakest piece)${
            set.maxLevel > set.minLevel
              ? ` · pieces up to L${set.maxLevel}`
              : ''
          } · set power ${set.setPowerProgress}% — ${set.blurb}`
        : `Wear all 5 slots from one origin for its set power. Set level = lowest piece. Now: ${wornOrigins.join(' / ')}`,
    },
    // Full catalog once (milestones). Skip on compact embeds.
    setCatalog: compact ? undefined : publicGearSetCatalog(),
    note:
      'Five origins × five pieces. Merge pieces up to L50. Full set bonus uses the MIN level of the five — raise your lowest piece to grow the set power.',
  };
}

// ——— Shop catalog ———
// Philosophy: shop only sells low-level pieces so merge remains the real grind.
//   Gems  → affordable L1 packs (random any / fixed origin)
//   USD   → pick a specific L1 · L2 packs · 10× super packs + free L3 pick
// No more 120k-gem whale singles.

const ORIGIN_GEM_L1 = {
  human: 220,
  elvan: 260,
  ork: 260,
  concord: 340,
  elderblight: 480,
};

function randomOriginId(rng) {
  // Slightly favor common origins in mystery packs
  const weights = [
    ['human', 36],
    ['elvan', 22],
    ['ork', 22],
    ['concord', 14],
    ['elderblight', 6],
  ];
  let r = rng() * weights.reduce((a, [, w]) => a + w, 0);
  for (const [id, w] of weights) {
    r -= w;
    if (r <= 0) return id;
  }
  return 'human';
}

function randomSlotId(rng) {
  return GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)].id;
}

/**
 * Build the gear store list.
 * mode:
 *   random_any     — N pieces, random origin + slot, fixed level
 *   random_origin  — N pieces, fixed origin, random slot, fixed level
 *   pick_piece     — 1 piece; buyer chooses origin + slot (L1 USD)
 *   super_random   — packs×count of L2 random + 1 chosen L3
 *   super_origin   — packs×count of L2 origin + 1 chosen L3
 */
export const GEAR_SHOP = [
  // —— Gem · L1 packs (merge fodder) ——
  {
    id: 'gem_pack_random_l1',
    section: 'gem_l1',
    currency: 'GEM',
    gemCost: 150,
    priceUsd: null,
    mode: 'random_any',
    level: 1,
    count: 5,
    label: 'Mystery Scrap · 5× L1',
    blurb: 'Five random L1 pieces (any origin + slot). Merge fuel — nothing high-level.',
    tag: 'GEM · BEST START',
  },
  ...GEAR_ORIGINS.map((o) => ({
    id: `gem_pack_origin_l1_${o.id}`,
    section: 'gem_l1',
    currency: 'GEM',
    gemCost: ORIGIN_GEM_L1[o.id] || 280,
    priceUsd: null,
    mode: 'random_origin',
    originId: o.id,
    level: 1,
    count: 5,
    label: `${o.emoji} ${o.name} Bundle · 5× L1`,
    blurb: `Five random ${o.name} pieces at L1 (slots random). Costs more than mystery — you lock the origin.`,
    tag: 'GEM · ORIGIN',
    color: o.color,
  })),

  // —— USD · pick one specific L1 ——
  {
    id: 'usd_piece_l1',
    section: 'usd_piece',
    currency: 'USD',
    gemCost: 0,
    priceUsd: 2.99,
    mode: 'pick_piece',
    level: 1,
    count: 1,
    label: 'Choose Any Piece · L1',
    blurb: 'Pick origin + slot. Always L1 — still merge to grow it. Gap-fill when drops refuse you.',
    tag: '$2.99',
  },

  // —— USD · L2 packs ——
  {
    id: 'usd_pack_random_l2',
    section: 'usd_l2',
    currency: 'USD',
    gemCost: 0,
    priceUsd: 5.99,
    mode: 'random_any',
    level: 2,
    count: 5,
    label: 'Adept Crate · 5× L2',
    blurb: 'Five random L2 pieces (any origin + slot). Still merge from here.',
    tag: '$5.99',
  },
  ...GEAR_ORIGINS.map((o) => ({
    id: `usd_pack_origin_l2_${o.id}`,
    section: 'usd_l2',
    currency: 'USD',
    gemCost: 0,
    priceUsd: 7.99,
    mode: 'random_origin',
    originId: o.id,
    level: 2,
    count: 5,
    label: `${o.emoji} ${o.name} Adept · 5× L2`,
    blurb: `Five random ${o.name} L2 pieces. Race-locked pack — better set progress, higher price.`,
    tag: '$7.99',
    color: o.color,
  })),

  // —— USD · 10× super (bulk bonus = free L3 of your choice) ——
  {
    id: 'usd_super_random_l2',
    section: 'usd_super',
    currency: 'USD',
    gemCost: 0,
    priceUsd: 59.99,
    mode: 'super_random',
    level: 2,
    count: 50, // 10 packs × 5
    packCount: 10,
    bonusLevel: 3,
    label: 'Adept Super · 10× Random L2',
    blurb:
      'Ten Adept Crates (50× L2 random) plus ONE L3 piece you choose. Bulk bonus vs buying 10× $5.99.',
    tag: 'SUPER · $59.99',
  },
  ...GEAR_ORIGINS.map((o) => ({
    id: `usd_super_origin_l2_${o.id}`,
    section: 'usd_super',
    currency: 'USD',
    gemCost: 0,
    priceUsd: 79.99,
    mode: 'super_origin',
    originId: o.id,
    level: 2,
    count: 50,
    packCount: 10,
    bonusLevel: 3,
    label: `${o.emoji} ${o.name} Super · 10× L2`,
    blurb: `Ten ${o.name} Adept packs (50× L2 of this origin) plus ONE L3 you choose. Bulk bonus vs 10× $7.99.`,
    tag: 'SUPER · $79.99',
    color: o.color,
  })),
];

export function gearShopOffer(id) {
  return GEAR_SHOP.find((o) => o.id === id) || null;
}

/**
 * @param {object} gear
 * @param {string} offerId
 * @param {{ originId?: string, slotId?: string, pickOriginId?: string, pickSlotId?: string, rng?: () => number }} [opts]
 */
export function applyGearShopPurchase(gear, offerId, opts = {}) {
  const offer = gearShopOffer(offerId);
  if (!offer) {
    return { ok: false, error: 'Unknown gear offer', code: 'BAD_OFFER' };
  }
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  let g = parseGear(serializeGear(gear));
  const granted = [];

  function grantOne(originId, slotId, level) {
    const { gear: next, added } = addPiece(g, originId, slotId, level, 1);
    g = next;
    if (added) granted.push(added);
  }

  if (offer.mode === 'random_any') {
    const n = Math.max(1, offer.count || 1);
    const lv = offer.level || 1;
    for (let i = 0; i < n; i++) {
      grantOne(randomOriginId(rng), randomSlotId(rng), lv);
    }
  } else if (offer.mode === 'random_origin') {
    const originId = offer.originId;
    if (!originById(originId)) {
      return { ok: false, error: 'Unknown origin', code: 'BAD_ORIGIN' };
    }
    const n = Math.max(1, offer.count || 1);
    const lv = offer.level || 1;
    for (let i = 0; i < n; i++) {
      grantOne(originId, randomSlotId(rng), lv);
    }
  } else if (offer.mode === 'pick_piece') {
    const originId = opts.originId || offer.originId;
    const slotId = opts.slotId || offer.slotId || offer.kind;
    if (!originById(originId) || !slotById(slotId)) {
      return {
        ok: false,
        error: 'Pick an origin and piece (slot) for this offer',
        code: 'NEED_PICK',
      };
    }
    grantOne(originId, slotId, offer.level || 1);
  } else if (offer.mode === 'super_random' || offer.mode === 'super_origin') {
    const n = Math.max(1, offer.count || 50);
    const lv = offer.level || 2;
    const fixedOrigin =
      offer.mode === 'super_origin' ? offer.originId : null;
    if (fixedOrigin && !originById(fixedOrigin)) {
      return { ok: false, error: 'Unknown origin', code: 'BAD_ORIGIN' };
    }
    for (let i = 0; i < n; i++) {
      const oId = fixedOrigin || randomOriginId(rng);
      grantOne(oId, randomSlotId(rng), lv);
    }
    // Bonus L3 of buyer's choice
    const pickO = opts.pickOriginId || opts.originId;
    const pickS = opts.pickSlotId || opts.slotId;
    if (!originById(pickO) || !slotById(pickS)) {
      return {
        ok: false,
        error: 'Super pack includes a free L3 — pick origin + piece',
        code: 'NEED_L3_PICK',
      };
    }
    grantOne(pickO, pickS, offer.bonusLevel || 3);
  } else {
    // Legacy single-piece fallback
    const originId = offer.originId || opts.originId;
    const slotId = offer.slotId || offer.kind || opts.slotId;
    if (!originById(originId) || !slotById(slotId)) {
      return { ok: false, error: 'Invalid piece offer', code: 'BAD_OFFER' };
    }
    grantOne(originId, slotId, offer.level || offer.tier || 1);
  }

  return {
    ok: true,
    gear: g,
    offer,
    granted,
    gemCost: offer.currency === 'GEM' ? offer.gemCost || 0 : 0,
    priceUsd: offer.currency === 'USD' ? offer.priceUsd || 0 : 0,
    currency: offer.currency || 'GEM',
  };
}

// Drops — roll random origin + slot + low level
export function rollGearDrop(opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  // Weight: human common, elvan/ork uncommon, concord rare, elderblight very rare
  const weights = [
    ['human', 40],
    ['elvan', 22],
    ['ork', 22],
    ['concord', 12],
    ['elderblight', 4],
  ];
  let r = rng() * weights.reduce((a, [, w]) => a + w, 0);
  let originId = 'human';
  for (const [id, w] of weights) {
    r -= w;
    if (r <= 0) {
      originId = id;
      break;
    }
  }
  const slot = GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)];
  let level = 1;
  const p = rng();
  if (opts.source === 'campaign_boss' && p < 0.15) level = 2;
  else if (p < 0.08) level = 2;
  else if (opts.source === 'campaign_boss' && p < 0.03) level = 3;

  const origin = originById(originId);
  return {
    originId,
    kind: slot.id,
    slotId: slot.id,
    tier: level,
    level,
    label: `${origin.emoji} ${origin.name} ${slot.name} L${level}`,
  };
}

export function pitShouldDrop(place, fieldSize, rng = Math.random) {
  if (place === 1) return true;
  if (place <= 3) return rng() < 0.55;
  if (place <= Math.max(5, Math.ceil(fieldSize * 0.15))) return rng() < 0.25;
  return rng() < 0.08;
}

export function grantGearToUser(userId, pieces, { prepare }) {
  const row = prepare(`SELECT gear_json FROM users WHERE id = ?`).get(userId);
  let gear = parseGear(row?.gear_json);
  const drops = [];
  for (const p of pieces || []) {
    const originId = p.originId || 'human';
    const slotId = p.slotId || p.kind || 'blade';
    const level = p.level || p.tier || 1;
    const { gear: next, added } = addPiece(gear, originId, slotId, level, p.count || 1);
    gear = next;
    if (added) drops.push(added);
  }
  prepare(`UPDATE users SET gear_json = ? WHERE id = ?`).run(
    serializeGear(gear),
    userId
  );
  return { gear, drops };
}

export function ensureGearColumn(addCol) {
  if (typeof addCol === 'function') {
    addCol('gear_json', "TEXT DEFAULT '{}'");
  }
}
