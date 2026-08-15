/**
 * Campaign — "Pit Road" story path (not a shared pot).
 * Map-first: pick a stage on the road. Hero stands on the next stage.
 * Replays of cleared stages cost an ad and grant smaller permanent stats.
 * All boosts labeled ATK / HP / DEF / SPD — never vague.
 */
import { nanoid } from 'nanoid';
import { prepare, transaction } from './db.js';
import { applyLedger, getBalances, ensureBalances } from './ledger.js';
import { maybeClanChestContrib } from './clans.js';
import { resolveArena } from './combat.js';
import {
  CHAPTERS,
  chapterById,
  totalChapters,
  roadRewardForStage,
  buildChapterPath,
  parseRoadBonus,
  applyRoadReward,
  emptyRoadBonus,
  formatRoadBonus,
  STAT_DISPLAY,
  isBossStage,
  isChapterEnd,
  bossNameFor,
  themeForStage,
  bossPickOptions,
  battleStoryBeat,
  CAMPAIGN_PREMISE,
  BOSS_EVERY,
  STAGES_PER_CHAPTER,
  WORLD_THEMES,
} from './campaignStory.js';
import {
  buildTacticalBattle,
  beginTactical,
  tacticalAct,
  publicBattle,
} from './campaignCombat.js';
import {
  applyHeroToFighter,
  raceWeightsForChapter,
  pickRaceFromWeights,
  classForEnemyKind,
  raceById,
  TYPE_HINT,
} from './heroes.js';
import {
  applyKitBonus,
  visualTier,
  parseUpgrades,
} from './upgrades.js';
import {
  parseGear,
  applyGearBonus,
  rollGearDrop,
  grantGearToUser,
} from './gear.js';
import { roadBoostActive } from './store.js';

export const STANCES = {
  rush: {
    id: 'rush',
    label: 'Rush',
    emoji: '⚔️',
    blurb: '+ATK +SPD · −DEF',
    mult: { power: 1.22, speed: 1.15, vitality: 1, luck: 1, guard: 0.82 },
  },
  hold: {
    id: 'hold',
    label: 'Hold',
    emoji: '🛡️',
    blurb: '+DEF +HP · −SPD',
    mult: { power: 1, speed: 0.88, vitality: 1.18, luck: 1, guard: 1.28 },
  },
  feint: {
    id: 'feint',
    label: 'Feint',
    emoji: '🎭',
    blurb: '+Luck · −ATK',
    mult: { power: 0.88, speed: 1.08, vitality: 1, luck: 1.35, guard: 1 },
  },
};

export const FLOOR_TAGS = {
  swarm: {
    id: 'swarm',
    label: 'SWARM',
    blurb: 'They pile on — Hold helps',
    favor: 'hold',
    color: '#fb7185',
  },
  duelist: {
    id: 'duelist',
    label: 'DUELIST',
    blurb: 'Hard hitters — Rush helps',
    favor: 'rush',
    color: '#fbbf24',
  },
  chaos: {
    id: 'chaos',
    label: 'CHAOS',
    blurb: 'Wild crits — Feint helps',
    favor: 'feint',
    color: '#a78bfa',
  },
  sudden: {
    id: 'sudden',
    label: 'SUDDEN',
    blurb: 'Speed decides it',
    favor: 'rush',
    color: '#22d3ee',
  },
};

/** Sigils = equippable run gear. Blurbs always use ATK / HP / DEF / SPD. */
export const SIGILS = [
  {
    id: 'bloodlust',
    label: 'Bloodlust',
    emoji: '🩸',
    slot: 'power',
    blurb: '+18% ATK · −8% HP',
    apply: (u) => {
      u.power = Math.round(u.power * 1.18);
      u.vitality = Math.max(12, Math.round(u.vitality * 0.92));
    },
  },
  {
    id: 'edge',
    label: 'Sharp Edge',
    emoji: '🗡️',
    slot: 'power',
    blurb: '+14% ATK · +10% SPD',
    apply: (u) => {
      u.power = Math.round(u.power * 1.14);
      u.speed = Math.round(u.speed * 1.1);
    },
  },
  {
    id: 'glass',
    label: 'Glass Cannon',
    emoji: '💎',
    slot: 'power',
    blurb: '+28% ATK · −15% HP',
    apply: (u) => {
      u.power = Math.round(u.power * 1.28);
      u.vitality = Math.max(12, Math.round(u.vitality * 0.85));
    },
  },
  {
    id: 'turtle',
    label: 'Turtle',
    emoji: '🐢',
    slot: 'guard',
    blurb: '+22% DEF · +10% HP',
    apply: (u) => {
      u.guard = Math.round(u.guard * 1.22);
      u.vitality = Math.round(u.vitality * 1.1);
    },
  },
  {
    id: 'iron',
    label: 'Iron Core',
    emoji: '⚙️',
    slot: 'guard',
    blurb: '+16% HP · +8% DEF',
    apply: (u) => {
      u.vitality = Math.round(u.vitality * 1.16);
      u.guard = Math.round(u.guard * 1.08);
    },
  },
  {
    id: 'bulwark',
    label: 'Bulwark',
    emoji: '🧱',
    slot: 'guard',
    blurb: '+25% DEF',
    apply: (u) => {
      u.guard = Math.round(u.guard * 1.25);
    },
  },
  {
    id: 'fate',
    label: 'Twisted Fate',
    emoji: '🍀',
    slot: 'wild',
    blurb: '+30% Luck (crit-ish swings)',
    apply: (u) => {
      u.luck = Math.round(u.luck * 1.3);
    },
  },
  {
    id: 'fleet',
    label: 'Fleet Feet',
    emoji: '💨',
    slot: 'wild',
    blurb: '+20% SPD (more turns)',
    apply: (u) => {
      u.speed = Math.round(u.speed * 1.2);
    },
  },
  {
    id: 'scavenger',
    label: 'Scavenger',
    emoji: '🪙',
    slot: 'wild',
    blurb: '+30% coins this run (not ATK/HP)',
    apply: (u) => {
      u._coinMult = (u._coinMult || 1) * 1.3;
    },
  },
  {
    id: 'balanced',
    label: 'Balance',
    emoji: '⚖️',
    slot: 'wild',
    blurb: '+8% ATK · +8% HP · +8% DEF · +8% SPD',
    apply: (u) => {
      u.power = Math.round(u.power * 1.08);
      u.vitality = Math.round(u.vitality * 1.08);
      u.speed = Math.round(u.speed * 1.08);
      u.luck = Math.round(u.luck * 1.08);
      u.guard = Math.round(u.guard * 1.08);
    },
  },
];

const TAG_CYCLE = ['swarm', 'duelist', 'chaos', 'sudden'];

export function ensureCampaignTables() {
  prepare(`
    CREATE TABLE IF NOT EXISTS campaign_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      mode TEXT NOT NULL DEFAULT 'story',
      chapter INTEGER NOT NULL DEFAULT 1,
      stage INTEGER NOT NULL DEFAULT 1,
      floor INTEGER NOT NULL DEFAULT 1,
      checkpoint INTEGER NOT NULL DEFAULT 0,
      high_water INTEGER NOT NULL DEFAULT 0,
      bank_coins REAL NOT NULL DEFAULT 0,
      bank_gems REAL NOT NULL DEFAULT 0,
      blessings_json TEXT NOT NULL DEFAULT '[]',
      loadout_json TEXT NOT NULL DEFAULT '{}',
      path_choice TEXT,
      pending_offer_json TEXT,
      pending_sigil TEXT,
      story_flag TEXT,
      last_result_json TEXT,
      seed TEXT NOT NULL,
      revived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  prepare(
    `CREATE INDEX IF NOT EXISTS idx_campaign_user ON campaign_runs(user_id, status)`
  ).run();

  const cols = prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  const add = (n, d) => {
    if (!cols.includes(n)) {
      try {
        prepare(`ALTER TABLE users ADD COLUMN ${n} ${d}`).run();
      } catch {
        /* ignore */
      }
    }
  };
  add('campaign_high_water', 'INTEGER NOT NULL DEFAULT 0');
  add('campaign_tickets_today', 'INTEGER NOT NULL DEFAULT 0');
  add('campaign_tickets_day', 'TEXT');
  add('campaign_chapter_cleared', 'INTEGER NOT NULL DEFAULT 0');
  add('campaign_endless_unlocked', 'INTEGER NOT NULL DEFAULT 0');
  // Permanent combat bonuses for gem/skill fights only — never pot lottery
  add('campaign_road_json', "TEXT DEFAULT '{}'");
  add('fighter_kit', "TEXT DEFAULT 'rookie'");

  // Soft-add columns on existing campaign_runs
  const rcols = prepare(`PRAGMA table_info(campaign_runs)`).all().map((c) => c.name);
  const addR = (n, d) => {
    if (!rcols.includes(n)) {
      try {
        prepare(`ALTER TABLE campaign_runs ADD COLUMN ${n} ${d}`).run();
      } catch {
        /* ignore */
      }
    }
  };
  addR('mode', "TEXT DEFAULT 'story'");
  addR('chapter', 'INTEGER DEFAULT 1');
  addR('stage', 'INTEGER DEFAULT 1');
  addR('loadout_json', "TEXT DEFAULT '{}'");
  addR('path_choice', 'TEXT');
  addR('pending_sigil', 'TEXT');
  addR('story_flag', 'TEXT');
  addR('battle_json', 'TEXT');
  addR('boss_picks_left', 'INTEGER DEFAULT 0');
  addR('boss_picks_total', 'INTEGER DEFAULT 0');
  // Map-select: which stage fight is for; replay = already-cleared stage
  addR('playing_stage', 'INTEGER');
  addR('is_replay', 'INTEGER DEFAULT 0');
}

function parseJson(s, fb) {
  try {
    return JSON.parse(s || '') ?? fb;
  } catch {
    return fb;
  }
}

function floorTag(seedKey) {
  let h = 0;
  for (let i = 0; i < seedKey.length; i++) h = (h * 31 + seedKey.charCodeAt(i)) | 0;
  return FLOOR_TAGS[TAG_CYCLE[Math.abs(h) % TAG_CYCLE.length]];
}

/**
 * How many combatants total (hero + foes).
 * Varies by stage + seed so consecutive levels don't clone pack size.
 */
function fieldSize(stage, path, boss, rng = Math.random) {
  const r = typeof rng === 'function' ? rng : Math.random;
  let foes;
  if (boss) {
    // Boss + 0–2 adds (early bosses rarely triple-pack)
    if (stage <= 10) foes = r() < 0.55 ? 1 : 2; // solo boss or +1
    else if (stage <= 30) foes = r() < 0.4 ? 2 : 3;
    else foes = r() < 0.25 ? 2 : 3;
  } else if (stage <= 5) {
    foes = 1; // learn 1v1
  } else if (stage <= 9) {
    // still mostly 1–2 before first boss
    foes = r() < 0.55 ? 1 : 2;
  } else if (stage <= 20) {
    // after boss: packs get common — this is the pit-boost pressure
    const roll = r();
    if (roll < 0.15) foes = 1;
    else if (roll < 0.7) foes = 2;
    else foes = 3;
  } else {
    const roll = r();
    if (roll < 0.08) foes = 1;
    else if (roll < 0.5) foes = 2;
    else foes = 3;
  }
  foes = Math.max(1, Math.min(3, foes));
  return foes + 1; // + hero
}

/** Deterministic 0–1 from string (encounter variety without Math.random drift) */
function encRand(seedStr) {
  let h = 2166136261;
  const s = String(seedStr || 'x');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function enemyScale(chapter, stage, path, boss) {
  /**
   * Scale with "expected hero" growth, then bias packs so *numbers* push you
   * toward pits after the first boss:
   * - 1–5: solo, slightly under a starter+1-rank hero (teach the road)
   * - 6–9: near parity 1–2 foes
   * - 10 boss: first wall (pit gems / gear help a lot)
   * - 11+: foes scale like you would if you only farmed the road a little,
   *   but packs of 2–3 mean you need real pit investment
   */
  const ch = Math.max(1, chapter);
  const s = Math.max(1, stage);
  // Rough power if player buys cheap ranks + road crumbs only
  const expectedAtk = 10 + s * 0.55 + (ch - 1) * 2.2;
  const expectedHp = 30 + s * 1.1 + (ch - 1) * 4;
  const expectedDef = 5 + s * 0.22 + (ch - 1) * 0.8;
  const expectedSpd = 10 + s * 0.28 + (ch - 1) * 0.9;

  // Solo foe strength vs that curve
  let threat = 0.72 + s * 0.028 + (ch - 1) * 0.08;
  if (s <= 5) threat = 0.68 + s * 0.02;
  else if (s <= 9) threat = 0.82 + (s - 5) * 0.03;
  else if (s === 10) threat = 1.05; // boss gate
  else threat = 0.95 + (s - 10) * 0.025 + (ch - 1) * 0.06;

  if (boss) threat *= s <= 10 ? 1.12 : s <= 30 ? 1.2 : 1.28;

  return {
    power: Math.max(5, Math.round(expectedAtk * threat)),
    // Foe HP lower than hero so 1v1 is about trades; packs add the real pressure
    vitality: Math.max(10, Math.round(expectedHp * threat * 0.52)),
    speed: Math.max(5, Math.round(expectedSpd * (threat * 0.9))),
    luck: Math.max(3, Math.round(3 + s * 0.15)),
    guard: Math.max(2, Math.round(expectedDef * threat * 0.85)),
    level: Math.min(80, ch * 3 + s),
  };
}

function clearTop(n, boss, path) {
  // Story is readable skill, not brick walls — top ~half (blood slightly stricter)
  if (boss) return Math.min(3, Math.max(2, Math.ceil(n * 0.45)));
  if (path === 'blood') return Math.max(2, Math.ceil(n * 0.5));
  return Math.max(3, Math.ceil(n * 0.7));
}

function coinReward(chapter, stage, place, field, path, coinMult, boss) {
  // Slightly juicier so clears feel rewarding (less grind-for-crumbs)
  const base = 10 + chapter * 4 + stage * 2;
  const placeB = Math.max(0, field - place + 1) * 1.1;
  const pathB = 1;
  const bossB = boss ? 18 + chapter * 3 : 0;
  return Math.round((base + placeB + bossB) * pathB * (coinMult || 1));
}

function pickSigil(have, path, seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const prefer =
    path === 'blood'
      ? SIGILS.filter((s) => s.slot === 'power' || s.slot === 'wild')
      : SIGILS.filter((s) => s.slot === 'guard' || s.slot === 'wild');
  const pool = prefer.length ? prefer : SIGILS;
  // Prefer new, else any
  const fresh = pool.filter((s) => !have.includes(s.id));
  const src = fresh.length ? fresh : pool;
  return src[Math.abs(h) % src.length];
}

/** Apply permanent road bonuses (gem-battle path power). */
export function getRoadBonus(user) {
  return parseRoadBonus(user?.campaign_road_json);
}

export function applyRoadBonusToFighter(fighter, user) {
  const b = getRoadBonus(user);
  return {
    ...fighter,
    power: (fighter.power || 10) + (b.power || 0),
    vitality: (fighter.vitality || 30) + (b.vitality || 0),
    speed: (fighter.speed || 10) + (b.speed || 0),
    guard: (fighter.guard || 5) + (b.guard || 0),
    // luck intentionally not boosted from road — pot fantasy stays pure luck
  };
}

function loadUserFighter(user, { themeKey = null } = {}) {
  // Base stats come from gem upgrades (tech tree) on the user row
  // Always re-read race/class from heroes state so equip + create carry into fights
  let base = {
    userId: user.id,
    displayName: user.display_name || 'You',
    isBot: false,
    isHero: true,
    level: user.level || 1,
    power: user.power || 10,
    vitality: user.vitality || 30,
    speed: user.speed || 10,
    luck: user.luck || 5,
    guard: user.guard || 5,
    gender: user.gender === 'girl' ? 'girl' : 'boy',
    visualTier: 0,
    _coinMult: 1,
  };
  // Gear (4 kinds, auto best) + optional legacy kit — skill combat only
  const ups = parseUpgrades(user.upgrades_json);
  base.visualTier = visualTier(ups);
  base = applyGearBonus(base, parseGear(user.gear_json));
  base = applyKitBonus(base, user.fighter_kit || 'rookie');
  // Race + class + party support + biome affinity
  base = applyHeroToFighter(base, user, {
    chapterCleared: user.campaign_chapter_cleared || 0,
    themeKey,
  });
  // Permanent road bonuses from clearing campaign stages
  return applyRoadBonusToFighter(base, user);
}

function applyLoadout(fighter, loadout) {
  let u = { ...fighter, _coinMult: 1 };
  for (const slot of ['power', 'guard', 'wild']) {
    const id = loadout?.[slot];
    if (!id) continue;
    const s = SIGILS.find((x) => x.id === id);
    if (s) s.apply(u);
  }
  return u;
}

function applyStance(fighter, stanceId, tag) {
  const st = STANCES[stanceId] || STANCES.hold;
  const m = st.mult;
  const u = {
    ...fighter,
    power: Math.round(fighter.power * m.power),
    vitality: Math.round(fighter.vitality * m.vitality),
    speed: Math.round(fighter.speed * m.speed),
    luck: Math.round(fighter.luck * m.luck),
    guard: Math.round(fighter.guard * m.guard),
  };
  if (tag?.favor && st.id === tag.favor) {
    u.power = Math.round(u.power * 1.08);
    u.guard = Math.round(u.guard * 1.06);
    u.luck = Math.round(u.luck * 1.06);
  }
  return u;
}

/**
 * Mixed cast so the road isn't "same guy twice":
 * rivals (look like players), knights, archers, monsters, brutes, cultists.
 */
const ENEMY_KINDS = [
  {
    id: 'rival',
    label: 'Rival',
    emoji: '⚔️',
    names: [
      'Dust Runner', 'Ticket Ghost', 'Pit Rookie', 'Sand Claim',
      'Pot Scav', 'Lane Shark', 'Draw Thief', 'Stand Rat',
    ],
    mult: { power: 1, vitality: 1, speed: 1, guard: 1 },
  },
  {
    id: 'knight',
    label: 'Knight',
    emoji: '🛡️',
    names: [
      'Iron Vow', 'Gate Guard', 'Soot Knight', 'Plate Oath',
      'Chain Ward', 'Keep Dog', 'Bolt Helm', 'Rust Oath',
    ],
    mult: { power: 0.95, vitality: 1.15, speed: 0.8, guard: 1.35 },
  },
  {
    id: 'archer',
    label: 'Archer',
    emoji: '🏹',
    names: [
      'Roof Quill', 'Longshot', 'Dust Bow', 'String Viper',
      'Reed Sting', 'Night Quill', 'Wind Pin', 'Ash Arrow',
    ],
    mult: { power: 1.05, vitality: 0.8, speed: 1.3, guard: 0.75 },
  },
  {
    id: 'monster',
    label: 'Beast',
    emoji: '🐺',
    names: [
      'Pit Hound', 'Bone Maw', 'Ash Wolf', 'Dirt Fang',
      'Rib Dog', 'Cinder Pup', 'Grave Snarl', 'Dust Howl',
    ],
    mult: { power: 1.2, vitality: 1.05, speed: 1.05, guard: 0.85 },
  },
  {
    id: 'brute',
    label: 'Brute',
    emoji: '💀',
    names: [
      'Chain Fist', 'Mud Crusher', 'Bone Slab', 'Wreck',
      'Slab Jaw', 'Anvil Hand', 'Gravel Gut', 'Break Post',
    ],
    mult: { power: 1.15, vitality: 1.35, speed: 0.7, guard: 1.1 },
  },
  {
    id: 'cultist',
    label: 'Cultist',
    emoji: '🕯️',
    names: [
      'Coin Priest', 'Luck Eater', 'Pot Whisper', 'Ash Chanter',
      'Odd Monk', 'Fate Beggar', 'Number Moth', 'Tithe Crow',
    ],
    mult: { power: 1.1, vitality: 0.9, speed: 1.1, guard: 0.9 },
  },
  {
    id: 'rogue',
    label: 'Rogue',
    emoji: '🗡️',
    names: [
      'Sleeve Knife', 'Alley Cut', 'Purse Ghost', 'Quiet Edge',
      'Coin Flick', 'Shade Step', 'Razor Beg', 'Night Lift',
    ],
    mult: { power: 1.12, vitality: 0.85, speed: 1.25, guard: 0.8 },
  },
  {
    id: 'mystic',
    label: 'Mystic',
    emoji: '✨',
    names: [
      'Draw Seer', 'Salt Witch', 'Orb Beggar', 'Hex Tally',
      'Smoke Sister', 'Rune Drifter', 'Veil Monk', 'Star Debt',
    ],
    mult: { power: 1.08, vitality: 0.95, speed: 1.05, guard: 0.95 },
  },
];

/** Shuffle copy of array with rng() */
function shuffleWith(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build foe roster — kinds, names, genders, lanes vary per stage seed.
 * @param {number} n foe count (not including hero)
 */
function makeBots(sc, n, bossName, boss, chapter = 1, stage = 1, rng = Math.random) {
  const r = typeof rng === 'function' ? rng : Math.random;
  const bots = [];
  const kindPool = shuffleWith(r, ENEMY_KINDS);
  // Prefer unique kinds in a pack; wrap if pack is large
  const usedNames = new Set();

  // Formation lanes so packs don't always stack dead-center
  const laneSets = {
    1: [0],
    2: r() < 0.5 ? [-1, 1] : [-0.7, 0.9],
    3: r() < 0.5 ? [-1.1, 0, 1.1] : [-1.2, 0.2, 1.0],
  };
  const lanes = laneSets[Math.min(3, Math.max(1, n))] || [0];

  for (let i = 0; i < n; i++) {
    const isBoss = boss && i === 0;
    let kind;
    if (isBoss) {
      // Bosses lean tanky / beastly, still varied by seed
      const bossPrefs = ENEMY_KINDS.filter((k) =>
        ['brute', 'monster', 'knight', 'mystic', 'cultist'].includes(k.id)
      );
      kind = bossPrefs[Math.floor(r() * bossPrefs.length)] || ENEMY_KINDS[0];
    } else {
      kind = kindPool[i % kindPool.length];
    }
    const j = 0.88 + r() * 0.22;
    const m = kind.mult;
    let name = isBoss ? bossName : kind.names[Math.floor(r() * kind.names.length)];
    // Avoid duplicate display names in the same fight
    if (!isBoss) {
      let tries = 0;
      while (usedNames.has(name) && tries < 8) {
        name = kind.names[Math.floor(r() * kind.names.length)];
        tries++;
      }
      usedNames.add(name);
    }
    const bossAtk = isBoss ? (stage <= 10 ? 1.08 : stage <= 30 ? 1.12 : 1.18) : 1;
    const bossHp = isBoss ? (stage <= 10 ? 1.15 : stage <= 30 ? 1.22 : 1.3) : 1;
    const bossDef = isBoss ? (stage <= 10 ? 1.05 : 1.1) : 1;
    const gender = r() < 0.5 ? 'girl' : 'boy';
    const visualTier = isBoss
      ? 2
      : r() < 0.35
        ? 0
        : r() < 0.75
          ? 1
          : 2;
    // Race mix by chapter · class from kind (rock-paper-scissors cast)
    const race = pickRaceFromWeights(raceWeightsForChapter(chapter, stage), r);
    const classId = classForEnemyKind(isBoss ? 'boss' : kind.id, r);
    const raceMeta = raceById(race);
    bots.push({
      userId: `camp_b_${stage}_${i}_${Math.floor(r() * 1e6)}`,
      displayName: name,
      isBot: true,
      isHero: false,
      isBoss,
      level: sc.level + (isBoss ? 2 : 0),
      power: Math.round(sc.power * j * m.power * bossAtk),
      vitality: Math.round(sc.vitality * j * m.vitality * bossHp),
      speed: Math.round(sc.speed * j * m.speed * (isBoss ? 0.95 : 1)),
      luck: Math.round(sc.luck * j),
      guard: Math.round(sc.guard * j * m.guard * bossDef),
      gender,
      visualTier,
      race,
      classId,
      kind: isBoss ? 'boss' : kind.id,
      kindLabel: isBoss
        ? `${raceMeta.emoji} Boss`
        : `${raceMeta.emoji} ${kind.label}`,
      kindEmoji: isBoss ? '👑' : kind.emoji,
      usePortrait: true,
      // Map formation: -1 left … +1 right, depth 0 front / 1 back
      lane: lanes[i] ?? (i - (n - 1) / 2),
      depth: isBoss ? 0 : r() < 0.35 ? 1 : 0,
    });
  }
  return bots;
}

function publicSigil(id) {
  const s = SIGILS.find((x) => x.id === id);
  if (!s) return null;
  return {
    id: s.id,
    label: s.label,
    emoji: s.emoji,
    slot: s.slot,
    blurb: s.blurb,
  };
}

function publicRun(row, user) {
  if (!row) return null;
  const mode = row.mode || 'story';
  const chapter = Number(row.chapter) || 1;
  const stage = Number(row.stage) || 1;
  const ch = chapterById(chapter);
  const loadout = parseJson(row.loadout_json, {});
  const bag = parseJson(row.blessings_json, []); // bag of owned sigil ids
  const path = row.path_choice || 'safe';
  const frontier = stage;
  const playingStage = Number(row.playing_stage) || null;
  const isReplay = !!row.is_replay;
  const fightStage = playingStage || frontier;
  const boss =
    mode === 'story' ? isBossStage(ch, fightStage) : (row.floor || 1) % 10 === 0;
  const tag = floorTag(`${row.seed}:${chapter}:${fightStage}:${row.floor}`);
  const n = fieldSize(fightStage, path || 'safe', boss);
  const storyFlag = row.story_flag || null;

  let storyCard = null;
  if (storyFlag === 'open')
    storyCard = {
      kind: 'open',
      text: ch.open,
      title: ch.title,
      hook: CAMPAIGN_PREMISE.hook,
      goal: ch.subtitle,
    };
  else if (storyFlag === 'mid')
    storyCard = { kind: 'mid', text: ch.mid, title: `${ch.title} — Mid road` };
  else if (storyFlag === 'boss')
    storyCard = { kind: 'boss', text: ch.boss, title: ch.bossName || ch.title };
  else if (storyFlag === 'clear')
    storyCard = {
      kind: 'clear',
      text: ch.clear,
      title: `${ch.title} clear!`,
      goal: CAMPAIGN_PREMISE.goal,
    };

  const pendingSigil = row.pending_sigil ? publicSigil(row.pending_sigil) : null;
  const roadBonus = getRoadBonus(user);
  const pathNodes =
    mode === 'story' ? buildChapterPath(chapter, frontier) : null;
  const battleRaw = parseJson(row.battle_json, null);
  const hasActiveBattle = !!(battleRaw && battleRaw.status === 'active');

  return {
    id: row.id,
    status: row.status,
    mode,
    chapter,
    /** Frontier = next first-clear stage; hero stands here on the map */
    stage: frontier,
    playingStage,
    isReplay,
    floor: row.floor || frontier,
    highWater: Math.max(row.high_water || 0, user?.campaign_high_water || 0),
    accountHighWater: user?.campaign_high_water || 0,
    chapterCleared: user?.campaign_chapter_cleared || 0,
    endlessUnlocked: !!(user?.campaign_endless_unlocked),
    bankCoins: Math.round(row.bank_coins || 0),
    bankGems: Math.round(row.bank_gems || 0),
    roadBonus,
    roadBonusLabel: formatRoadBonus(roadBonus),
    /** Stage map — pick a level; not shown during fight */
    pathNodes,
    pathChoice: path,
    bag: bag.map(publicSigil).filter(Boolean),
    loadout: {
      power: loadout.power ? publicSigil(loadout.power) : null,
      guard: loadout.guard ? publicSigil(loadout.guard) : null,
      wild: loadout.wild ? publicSigil(loadout.wild) : null,
    },
    pendingSigil,
    storyCard,
    battleStoryBeat: battleStoryBeat(chapter, fightStage),
    lastResult: parseJson(row.last_result_json, null),
    battle: publicBattle(battleRaw),
    hasActiveBattle,
    bossPicksLeft: 0,
    bossPicksTotal: 0,
    bossPickOptions: [],
    worldTheme: themeForStage(chapter, fightStage),
    bossEvery: BOSS_EVERY,
    stagesTotal: mode === 'story' ? ch.stages || STAGES_PER_CHAPTER : 0,
    revived: !!row.revived,
    chapterInfo: mode === 'story'
      ? {
          id: ch.id,
          title: ch.title,
          subtitle: ch.subtitle,
          emoji: ch.emoji,
          tint: ch.tint,
          stages: ch.stages,
          bossName: ch.bossName,
          progress: `${frontier}/${ch.stages}`,
        }
      : {
          id: 'endless',
          title: 'Endless Road',
          subtitle: 'No end — only higher',
          emoji: '♾️',
          tint: '#fbbf24',
          stages: 0,
          bossName: 'Wave Boss',
          progress: `F${row.floor || 1}`,
        },
    floorPreview: {
      tag: {
        id: tag.id,
        label: tag.label,
        blurb: tag.blurb,
        color: tag.color,
        favor: tag.favor,
      },
      fieldSize: n,
      clearTop: clearTop(n, boss, path || 'safe'),
      isBoss: boss,
      path: path || 'safe',
      needsPath: false,
      fightStage,
      isReplay,
    },
    paths: [],
    stances: Object.values(STANCES).map((s) => ({
      id: s.id,
      label: s.label,
      emoji: s.emoji,
      blurb: s.blurb,
    })),
    chaptersMeta: CHAPTERS.map((c) => ({
      id: c.id,
      title: c.title,
      emoji: c.emoji,
      tint: c.tint,
      stages: c.stages,
      cleared: (user?.campaign_chapter_cleared || 0) >= c.id,
      locked: c.id > (user?.campaign_chapter_cleared || 0) + 1,
      current: mode === 'story' && chapter === c.id && row.status !== 'cashed',
    })),
  };
}

export function getCampaignStatus(userId) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  let run = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status IN ('active','choosing','story','equip','boss_pick')
     ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  // Auto-clear legacy boss_pick (ATK/DEF/SPD choice scrapped)
  if (run && run.status === 'boss_pick') {
    const flag = run.story_flag === 'clear' ? 'clear' : null;
    const nextStatus = flag === 'clear' ? 'story' : 'active';
    prepare(
      `UPDATE campaign_runs SET status = ?, story_flag = ?, boss_picks_left = 0,
       boss_picks_total = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(nextStatus, flag, run.id);
    run = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(run.id);
  }

  // Auto-clear legacy equip state (sigil slots removed)
  if (run && run.status === 'equip') {
    campaignEquip(userId, { skip: true });
    run = prepare(
      `SELECT * FROM campaign_runs WHERE user_id = ? AND status IN ('active','choosing','story','boss_pick')
       ORDER BY created_at DESC LIMIT 1`
    ).get(userId);
  }
  const roadBonus = getRoadBonus(user);
  return {
    run: publicRun(run, user),
    premise: CAMPAIGN_PREMISE,
    typeChart: {
      hint: TYPE_HINT,
      beats: { elf: 'ork', ork: 'human', human: 'elf' },
      roadScale: 0.25,
      pitScale: 0.05,
      blurb:
        'Elf hits Orks harder · Orks crush Humans · Humans edge Elves. ~25% on the Road, ~5% in pits.',
    },
    accountHighWater: user?.campaign_high_water || 0,
    chapterCleared: user?.campaign_chapter_cleared || 0,
    endlessUnlocked: !!(user?.campaign_endless_unlocked),
    roadBonus,
    chapters: CHAPTERS.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      emoji: c.emoji,
      tint: c.tint,
      stages: c.stages || STAGES_PER_CHAPTER,
      bossName: c.bossName,
      bossEvery: BOSS_EVERY,
      openTeaser: (c.open || '').slice(0, 120) + (c.open?.length > 120 ? '…' : ''),
      themeTrail: c.themeTrail || [],
      themeLabels: (c.themeTrail || []).map((id) => {
        const t = WORLD_THEMES[id];
        return t ? `${t.emoji} ${t.name}` : id;
      }),
      cleared: (user?.campaign_chapter_cleared || 0) >= c.id,
      locked: c.id > (user?.campaign_chapter_cleared || 0) + 1,
    })),
    roadBonusLabel: formatRoadBonus(roadBonus),
    stances: Object.values(STANCES).map((s) => ({
      id: s.id,
      label: s.label,
      emoji: s.emoji,
      blurb: s.blurb,
    })),
  };
}

/** Start story chapter or endless */
export function startCampaign(userId, { mode = 'story', chapter } = {}) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) throw new Error('User not found');

  prepare(
    `UPDATE campaign_runs SET status = 'abandoned', updated_at = datetime('now')
     WHERE user_id = ? AND status IN ('active','choosing','story','equip')`
  ).run(userId);

  let chId = Number(chapter) || (user.campaign_chapter_cleared || 0) + 1;
  let runMode = mode;
  if (runMode === 'endless') {
    if (!user.campaign_endless_unlocked) {
      const e = new Error('Clear the story first to unlock Endless');
      e.code = 'LOCKED';
      throw e;
    }
    chId = 0;
  } else {
    const maxOpen = (user.campaign_chapter_cleared || 0) + 1;
    if (chId > maxOpen) chId = maxOpen;
    if (chId > totalChapters()) {
      runMode = 'endless';
      chId = 0;
      if (!user.campaign_endless_unlocked) {
        const e = new Error('Story complete — Endless unlocking…');
        // auto unlock
        prepare(
          `UPDATE users SET campaign_endless_unlocked = 1 WHERE id = ?`
        ).run(userId);
      }
    }
    chId = Math.max(1, Math.min(totalChapters(), chId));
  }

  const id = nanoid(12);
  const seed = `${id}:${Date.now()}`;
  const storyFlag = runMode === 'story' ? 'open' : null;
  const status = storyFlag ? 'story' : 'active';

  prepare(
    `INSERT INTO campaign_runs (
      id, user_id, status, mode, chapter, stage, floor, checkpoint, high_water,
      bank_coins, bank_gems, blessings_json, loadout_json, seed, story_flag
    ) VALUES (?, ?, ?, ?, ?, 1, 1, 0, 0, 0, 0, '[]', '{}', ?, ?)`
  ).run(id, userId, status, runMode, chId || 1, seed, storyFlag);

  const row = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(id);
  const u2 = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return publicRun(row, u2);
}

export function campaignAckStory(userId) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'story' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) {
    const active = prepare(
      `SELECT * FROM campaign_runs WHERE user_id = ? AND status IN ('active','equip','choosing') ORDER BY created_at DESC LIMIT 1`
    ).get(userId);
    return { run: publicRun(active, user) };
  }
  const flag = row.story_flag;
  // Chapter complete card → bank loot and return to map
  if (flag === 'clear') {
    const cashed = cashOutRun(userId, row);
    return {
      run: null,
      chapterComplete: true,
      ...cashed,
    };
  }
  prepare(
    `UPDATE campaign_runs SET status = 'active', story_flag = NULL, path_choice = 'safe',
     updated_at = datetime('now') WHERE id = ?`
  ).run(row.id);
  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return { run: publicRun(updated, user) };
}

/** Legacy no-op path picker — always single road. Kept so old clients don't 404. */
export function campaignChoosePath(userId, { path = 'safe' } = {}) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No active run'), { code: 'NO_RUN' });
  // Always safe — dual roads removed (too much at once)
  prepare(
    `UPDATE campaign_runs SET path_choice = 'safe', battle_json = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(row.id);
  const started = campaignStartBattle(userId);
  return started;
}

function buildEncounterRoster(user, row) {
  const mode = row.mode || 'story';
  const chapter = Number(row.chapter) || 1;
  const frontier = Number(row.stage) || 1;
  // Fight the selected stage (map pick), else frontier
  const stage = Number(row.playing_stage) || frontier;
  const floor = Number(row.floor) || stage;
  const ch = chapterById(chapter);
  const path = row.path_choice || 'safe';
  const boss =
    mode === 'story' ? isBossStage(ch, stage) : floor > 0 && floor % 10 === 0;
  // Per-stage seed so consecutive levels reshuffle cast & pack size
  const rng = encRand(
    `${row.seed || 's'}:c${chapter}:s${stage}:f${floor}:r${row.is_replay ? 1 : 0}`
  );
  const n = fieldSize(stage, path, boss, rng);
  const sc = enemyScale(
    mode === 'endless' ? 6 + Math.floor(floor / 5) : chapter,
    mode === 'endless' ? (floor % 10) || 10 : stage,
    path,
    boss
  );
  const bossName =
    mode === 'story' ? bossNameFor(ch, stage) : `Wave ${floor} Tyrant`;
  const bots = makeBots(sc, n - 1, bossName, boss, chapter, stage, rng);
  const loadout = parseJson(row.loadout_json, {});
  // Road scene key for client art (theme + variant index)
  const theme = themeForStage(chapter, stage);
  const sceneVariant = Math.floor(rng() * 2); // 0–1 per theme pool
  const sceneKey = `${theme.id}_${sceneVariant}`;
  let hero = loadUserFighter(user, { themeKey: theme?.id });
  hero = applyLoadout(hero, loadout);
  return {
    hero,
    bots,
    boss,
    bossName,
    n,
    chapter,
    stage,
    frontier,
    floor,
    ch,
    path,
    mode,
    isReplay: !!row.is_replay,
    worldTheme: theme,
    sceneKey,
    sceneVariant,
  };
}

/** Leave an unfinished fight → map (no progress loss). */
export function campaignLeaveBattle(userId) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) return { run: null };
  prepare(
    `UPDATE campaign_runs SET
      battle_json = NULL,
      playing_stage = NULL,
      is_replay = 0,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(row.id);
  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return { run: publicRun(updated, user) };
}

/**
 * Map pick: enter a stage fight.
 * - Frontier (next stage): free
 * - Older cleared stage: requires mockAd (ad) for smaller rewards
 */
export function campaignEnterStage(userId, { stage, mockAd = false } = {}) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No active climb'), { code: 'NO_RUN' });

  const mode = row.mode || 'story';
  const frontier = Number(row.stage) || 1;
  const ch = chapterById(Number(row.chapter) || 1);
  const target = Math.floor(Number(stage) || frontier);

  if (mode === 'story') {
    if (target < 1 || target > ch.stages) {
      throw Object.assign(new Error('Invalid stage'), { code: 'BAD_STAGE' });
    }
    if (target > frontier) {
      throw Object.assign(new Error('Clear earlier stages first'), {
        code: 'LOCKED',
      });
    }
  }

  const isReplay = mode === 'story' ? target < frontier : false;
  const bossGate =
    mode === 'story'
      ? isBossStage(ch, target)
      : target > 0 && target % BOSS_EVERY === 0;

  // Replays / bosses can request an ad. Client may send mockAd during free playtest.
  // Never hard-block free frontier stages (Lv 1–9 first clear).
  const freeFrontier = !isReplay && !bossGate;
  if ((isReplay || bossGate) && !mockAd && !freeFrontier) {
    throw Object.assign(
      new Error(
        bossGate && !isReplay
          ? 'Boss gate — watch an ad to enter'
          : 'Replay costs an ad — watch one to re-fight this stage'
      ),
      {
        code: 'NEED_AD',
        stage: target,
        reason: bossGate && !isReplay ? 'boss' : 'replay',
      }
    );
  }

  if (!row.path_choice) {
    prepare(
      `UPDATE campaign_runs SET path_choice = 'safe' WHERE id = ?`
    ).run(row.id);
  }

  prepare(
    `UPDATE campaign_runs SET
      playing_stage = ?,
      is_replay = ?,
      battle_json = NULL,
      last_result_json = NULL,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(target, isReplay ? 1 : 0, row.id);

  return campaignStartBattle(userId);
}

/** Start or resume tactical battle for selected / frontier stage */
export function campaignStartBattle(userId) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No active climb'), { code: 'NO_RUN' });
  if (!row.path_choice) {
    prepare(
      `UPDATE campaign_runs SET path_choice = 'safe', updated_at = datetime('now') WHERE id = ?`
    ).run(row.id);
    row.path_choice = 'safe';
  }
  // Default to frontier if map never picked
  if (!row.playing_stage) {
    prepare(
      `UPDATE campaign_runs SET playing_stage = ?, is_replay = 0 WHERE id = ?`
    ).run(Number(row.stage) || 1, row.id);
    row.playing_stage = Number(row.stage) || 1;
    row.is_replay = 0;
  }

  let battle = parseJson(row.battle_json, null);
  // Rebuild if missing, done, or hero identity doesn't match current equip
  // (ranger/mage must not keep a stale warrior unit from an earlier loadout)
  const heroUnit = battle?.units?.find((u) => u.isHero);
  const liveIdentity = loadUserFighter(user, {
    themeKey: themeForStage(
      Number(row.chapter) || 1,
      Number(row.playing_stage || row.stage) || 1
    )?.id,
  });
  const needRebuild =
    !battle ||
    battle.status !== 'active' ||
    !heroUnit?.race ||
    !heroUnit?.classId ||
    !heroUnit?.gender ||
    String(heroUnit.classId).toLowerCase() !==
      String(liveIdentity.classId || 'warrior').toLowerCase() ||
    String(heroUnit.race).toLowerCase() !==
      String(liveIdentity.race || 'human').toLowerCase() ||
    String(heroUnit.gender || '') !== String(liveIdentity.gender || 'boy');
  if (needRebuild) {
    const roster = buildEncounterRoster(user, {
      ...row,
      playing_stage: row.playing_stage,
    });
    const { hero, bots, bossName, floor, chapter, stage, sceneKey } = roster;
    const seed = `${row.seed}:tb:${chapter}:${stage}:${floor}:${row.is_replay ? 'r' : 'f'}:${hero.race || 'h'}:${hero.classId || 'w'}`;
    battle = buildTacticalBattle({
      hero,
      foes: bots.map((b) => ({
        userId: b.userId,
        displayName: b.displayName,
        gender: b.gender,
        visualTier: b.visualTier,
        race: b.race,
        classId: b.classId,
        vitality: b.vitality,
        power: b.power,
        guard: b.guard,
        speed: b.speed,
        isBoss: !!b.isBoss || b.displayName === bossName,
        kind: b.kind,
        kindLabel: b.kindLabel,
        kindEmoji: b.kindEmoji,
        usePortrait: b.usePortrait,
        lane: b.lane,
        depth: b.depth,
        maxHp: Math.max(14, Math.round((b.vitality || 16) * 1.05)),
      })),
      seed,
      sceneKey,
      worldTheme: roster.worldTheme?.id || null,
    });
    beginTactical(battle);
    prepare(
      `UPDATE campaign_runs SET battle_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(battle), row.id);
  }

  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return {
    run: publicRun(updated, user),
    battle: publicBattle(battle),
  };
}

export function campaignEncounter(userId) {
  // Back-compat: start/resume battle and return foes
  const res = campaignStartBattle(userId);
  return {
    run: res.run,
    battle: res.battle,
    encounter: {
      foes: (res.battle?.foes || []).map((f) => ({
        userId: f.id,
        displayName: f.name,
        gender: f.gender,
        visualTier: f.visualTier,
        maxHp: f.maxHp,
        power: f.atk,
        atk: f.atk,
        def: f.def,
        spd: f.spd,
        hp: f.hp,
        isBoss: f.isBoss,
      })),
      hero: res.battle?.hero,
      fieldSize: (res.battle?.foes?.length || 0) + 1,
    },
  };
}

/**
 * Player turn: attack a target OR spend turn on atk/def/spd buff.
 * body: { action: 'attack', targetId } | { action: 'buff', buff: 'atk'|'def'|'spd' }
 */
export function campaignBattleAct(userId, body = {}) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No active climb'), { code: 'NO_RUN' });
  let battle = parseJson(row.battle_json, null);
  if (!battle || battle.status !== 'active') {
    const started = campaignStartBattle(userId);
    battle = parseJson(
      prepare(`SELECT battle_json FROM campaign_runs WHERE id = ?`).get(row.id)
        ?.battle_json,
      null
    );
    if (!battle) return started;
  }

  const action =
    body.action === 'buff'
      ? { type: 'buff', buff: body.buff || body.stat || 'atk' }
      : { type: 'attack', targetId: body.targetId || body.targetUserId };

  const { battle: next, error } = tacticalAct(battle, action);
  if (error) {
    throw Object.assign(new Error(error), { code: 'BAD_ACT' });
  }

  prepare(
    `UPDATE campaign_runs SET battle_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(next), row.id);

  // Battle finished → apply campaign progress
  if (next.status === 'won' || next.status === 'lost') {
    return finishTacticalBattle(userId, row, next, user);
  }

  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return {
    run: publicRun(updated, user),
    battle: publicBattle(next),
    result: null,
  };
}

function finishTacticalBattle(userId, row, battle, user) {
  const mode = row.mode || 'story';
  const chapter = Number(row.chapter) || 1;
  const frontier = Number(row.stage) || 1;
  const playStage = Number(row.playing_stage) || frontier;
  const isReplay = !!row.is_replay || (mode === 'story' && playStage < frontier);
  const floor = Number(row.floor) || playStage;
  const ch = chapterById(chapter);
  const path = row.path_choice || 'safe';
  const boss =
    mode === 'story'
      ? isBossStage(ch, playStage)
      : floor > 0 && floor % 10 === 0;
  const cleared = battle.status === 'won';
  const n = battle.units.length;
  const place = cleared ? 1 : n;
  let coins = cleared
    ? coinReward(chapter, playStage, 1, n, path, 1, boss)
    : Math.round(coinReward(chapter, playStage, n, n, path, 1, boss) * 0.25);
  // Replay = less loot
  if (cleared && isReplay) coins = Math.max(2, Math.round(coins * 0.4));
  // Modest gem drip — store remains the main gem source
  const gems = boss && cleared && !isReplay ? (isChapterEnd(ch, playStage) ? 8 : 3) : 0;

  const result = {
    chapter,
    stage: playStage,
    floor,
    place,
    fieldSize: n,
    clearTop: 1,
    cleared,
    isBoss: boss,
    isReplay,
    path,
    coinsEarned: coins,
    gemsEarned: gems,
    tactical: true,
    log: (battle.log || []).slice(-20),
  };

  if (cleared) {
    // Passive clan chest drip on campaign battle win
    try {
      maybeClanChestContrib(userId, { source: 'campaign' });
    } catch {
      /* optional */
    }
    const newBankC = (row.bank_coins || 0) + coins;
    const newBankG = (row.bank_gems || 0) + gems;
    const newHigh = Math.max(row.high_water || 0, playStage, floor);
    const bag = parseJson(row.blessings_json, []);

    // Permanent road stats — first clear stronger, replay weaker (clear ATK/HP/DEF/SPD)
    let roadReward = null;
    if (mode === 'story') {
      roadReward = roadRewardForStage(chapter, playStage, ch.stages, {
        replay: isReplay,
      });
    } else if (floor % 10 === 0) {
      roadReward = isReplay
        ? { power: 1, label: '+1 ATK', kind: 'boss_replay', icon: '👑' }
        : {
            power: 2,
            guard: 1,
            label: '+2 ATK · +1 DEF',
            kind: 'boss',
            icon: '👑',
          };
    }
    if (roadReward) {
      const nextRoad = applyRoadReward(getRoadBonus(user), roadReward);
      prepare(`UPDATE users SET campaign_road_json = ? WHERE id = ?`).run(
        JSON.stringify(nextRoad),
        userId
      );
      result.roadReward = roadReward;
      result.roadBonusAfter = nextRoad;
      result.roadBonusLabel = formatRoadBonus(nextRoad);
    }

    // Gear loot — 4 kinds, merge later on Hero screen
    try {
      const pieces = [];
      if (isReplay) {
        // Replay: 45% chance of one weaker piece
        if (Math.random() < 0.45) {
          pieces.push(
            rollGearDrop({
              source: 'campaign',
              stage: Math.max(1, playStage - 5),
            })
          );
        }
      } else {
        const src = boss ? 'campaign_boss' : 'campaign';
        pieces.push(rollGearDrop({ source: src, stage: playStage }));
        if (boss) {
          pieces.push(rollGearDrop({ source: 'campaign_boss', stage: playStage }));
        }
      }
      if (pieces.length) {
        const granted = grantGearToUser(userId, pieces, { prepare });
        result.gearDrops = granted.drops;
        result.gearDropLabel = granted.drops.map((d) => d.label).join(' · ');
      }
    } catch {
      /* gear optional — never block campaign progress */
    }

    // ——— REPLAY WIN: bank coins + small stats, stay on map, no stage advance ———
    if (isReplay) {
      prepare(
        `UPDATE campaign_runs SET
          status = 'active',
          high_water = ?,
          bank_coins = ?,
          bank_gems = ?,
          battle_json = NULL,
          playing_stage = NULL,
          is_replay = 0,
          last_result_json = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(newHigh, newBankC, newBankG, JSON.stringify(result), row.id);
      prepare(
        `UPDATE users SET campaign_high_water = MAX(COALESCE(campaign_high_water,0), ?) WHERE id = ?`
      ).run(newHigh, userId);
    } else if (mode === 'story' && boss) {
      // Zone boss (10/20/…) or chapter boss (50) → flat ATK/HP/DEF/SPD pick only
      // (no sigil / ATK-DEF-Wild slots)
      const chapterDone = isChapterEnd(ch, playStage);
      const nextStage = chapterDone
        ? playStage
        : Math.min(ch.stages, playStage + 1);
      const storyAfterPick = chapterDone ? 'clear' : null;

      if (chapterDone) {
        const clearedCh = Math.max(user.campaign_chapter_cleared || 0, chapter);
        const endless =
          clearedCh >= totalChapters() ? 1 : user.campaign_endless_unlocked || 0;
        prepare(
          `UPDATE users SET campaign_chapter_cleared = ?, campaign_endless_unlocked = ?,
           campaign_high_water = MAX(COALESCE(campaign_high_water,0), ?) WHERE id = ?`
        ).run(clearedCh, endless, newHigh, userId);
      } else {
        prepare(
          `UPDATE users SET campaign_high_water = MAX(COALESCE(campaign_high_water,0), ?) WHERE id = ?`
        ).run(newHigh, userId);
      }

      // Boss cleared — no ATK/DEF/SPD pick screen (scrapped).
      // Auto road rewards already applied; go to story beat or map.
      const nextStatus = storyAfterPick ? 'story' : 'active';
      prepare(
        `UPDATE campaign_runs SET
          status = ?,
          stage = ?,
          floor = ?,
          story_flag = ?,
          high_water = ?,
          bank_coins = ?,
          bank_gems = ?,
          pending_sigil = NULL,
          battle_json = NULL,
          playing_stage = NULL,
          is_replay = 0,
          boss_picks_left = 0,
          boss_picks_total = 0,
          last_result_json = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        nextStatus,
        nextStage,
        floor + 1,
        storyAfterPick,
        newHigh,
        newBankC,
        newBankG,
        JSON.stringify(result),
        row.id
      );
    } else {
      // First-clear normal stage → advance frontier, straight to map (no sigil slots)
      const nextStage =
        mode === 'story' ? Math.min(ch.stages, playStage + 1) : frontier;
      const nextFloor = floor + 1;
      const midBeat =
        mode === 'story' && playStage === Math.floor(ch.stages / 2)
          ? 'mid'
          : null;
      const nextBoss =
        mode === 'story' && isBossStage(ch, nextStage) && playStage < nextStage
          ? 'boss'
          : null;
      const storyNext = midBeat || nextBoss;
      const nextStatus = storyNext ? 'story' : 'active';

      prepare(
        `UPDATE campaign_runs SET
          status = ?,
          stage = ?,
          floor = ?,
          high_water = ?,
          bank_coins = ?,
          bank_gems = ?,
          pending_sigil = NULL,
          battle_json = NULL,
          playing_stage = NULL,
          is_replay = 0,
          story_flag = ?,
          last_result_json = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        nextStatus,
        mode === 'story' ? nextStage : 1,
        nextFloor,
        newHigh,
        newBankC,
        newBankG,
        storyNext,
        JSON.stringify(result),
        row.id
      );
      prepare(
        `UPDATE users SET campaign_high_water = MAX(COALESCE(campaign_high_water,0), ?) WHERE id = ?`
      ).run(newHigh, userId);
    }
  } else {
    // Lost — back to map, no progress
    prepare(
      `UPDATE campaign_runs SET
        battle_json = NULL,
        playing_stage = NULL,
        is_replay = 0,
        last_result_json = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(JSON.stringify(result), row.id);
  }

  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  const u2 = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    run: publicRun(updated, u2),
    // Keep last public battle snapshot so client can finish hit/projectile theater
    battle: publicBattle(battle),
    result,
    balances: getBalances(userId),
  };
}

/** Boss win: pick a permanent +1% combat stat. Ad can grant extra picks. */
export function campaignBossPick(userId, { stat, watchAd } = {}) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'boss_pick' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No boss reward waiting'), { code: 'NO_PICK' });

  let picksLeft = Number(row.boss_picks_left) || 0;
  let picksTotal = Number(row.boss_picks_total) || 1;

  // Watch ad → +1 pick (max 2 total free+ad)
  if (watchAd && picksTotal < 2) {
    picksLeft += 1;
    picksTotal += 1;
    prepare(
      `UPDATE campaign_runs SET boss_picks_left = ?, boss_picks_total = ? WHERE id = ?`
    ).run(picksLeft, picksTotal, row.id);
    return {
      run: publicRun(
        prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id),
        user
      ),
      picksLeft,
      picksTotal,
      adGranted: true,
    };
  }

  if (picksLeft <= 0) {
    throw Object.assign(new Error('No picks left'), { code: 'NO_PICKS' });
  }

  const allowed = ['power', 'vitality', 'guard', 'speed'];
  if (!allowed.includes(stat)) {
    throw Object.assign(new Error('Pick ATK, HP, DEF, or SPD'), {
      code: 'BAD_STAT',
    });
  }

  // Flat permanent numbers — never vague %
  const FLAT = { power: 2, vitality: 4, guard: 2, speed: 2 };
  const gain = FLAT[stat] || 2;
  prepare(`UPDATE users SET ${stat} = ${stat} + ? WHERE id = ?`).run(gain, userId);

  picksLeft -= 1;
  prepare(
    `UPDATE campaign_runs SET boss_picks_left = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(picksLeft, row.id);

  const u2 = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);

  if (picksLeft <= 0) {
    // Straight to map or chapter-clear story — no sigil equip screen
    const flag = row.story_flag === 'clear' ? 'clear' : null;
    const nextStatus = flag === 'clear' ? 'story' : 'active';
    prepare(
      `UPDATE campaign_runs SET
        status = ?,
        story_flag = ?,
        pending_sigil = NULL,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(nextStatus, flag, row.id);
  }

  const d = STAT_DISPLAY[stat] || { short: stat, full: stat };
  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return {
    run: publicRun(updated, u2),
    picked: {
      stat,
      gain,
      label: `Permanent +${gain} ${d.short} (${d.full})`,
      short: d.short,
    },
    picksLeft,
    balances: getBalances(userId),
    stats: {
      ATK: u2.power,
      HP: u2.vitality,
      SPD: u2.speed,
      DEF: u2.guard,
      power: u2.power,
      vitality: u2.vitality,
      speed: u2.speed,
      guard: u2.guard,
    },
  };
}

/** Legacy one-shot fight — starts battle if needed then not used for multi-turn */
export function campaignFight(userId, { stance = 'hold', targetUserId = null } = {}) {
  // If no active battle, start one; if target provided, attack once (compat)
  campaignStartBattle(userId);
  if (targetUserId) {
    return campaignBattleAct(userId, {
      action: 'attack',
      targetId: targetUserId,
    });
  }
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  return {
    run: publicRun(row, user),
    battle: publicBattle(parseJson(row?.battle_json, null)),
    result: null,
  };
}

/**
 * Legacy equip endpoint — sigil slots removed.
 * Auto-skips any stuck "equip" runs so clients never see ATK/DEF/Wild slots.
 */
export function campaignEquip(userId, { slot, skip } = {}) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'equip' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) {
    const r = prepare(
      `SELECT * FROM campaign_runs WHERE user_id = ? AND status IN ('active','story') ORDER BY created_at DESC LIMIT 1`
    ).get(userId);
    return { run: publicRun(r, user) };
  }

  const storyNext = row.story_flag; // mid, boss, or clear
  const nextStatus = storyNext ? 'story' : 'active';

  prepare(
    `UPDATE campaign_runs SET
      status = ?,
      pending_sigil = NULL,
      path_choice = COALESCE(path_choice, 'safe'),
      playing_stage = NULL,
      is_replay = 0,
      battle_json = NULL,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, row.id);

  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return { run: publicRun(updated, user), balances: getBalances(userId) };
}

export function campaignCashOut(userId) {
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status IN ('active','equip','story','choosing')
     ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No active climb'), { code: 'NO_RUN' });
  return cashOutRun(userId, row);
}

function cashOutRun(userId, row) {
  ensureBalances(userId);
  let coins = Math.round(row.bank_coins || 0);
  let gems = Math.round(row.bank_gems || 0);
  const high = row.high_water || 0;
  // Coins/gems only for shop & gem fights — never pot tickets / ad-skips
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const roadBonus = getRoadBonus(user);
  // Paid Road Boost: +25% bank on cashout (time convenience IAP)
  if (roadBoostActive(user)) {
    coins = Math.round(coins * 1.25);
    gems = Math.round(gems * 1.25);
  }

  const tx = transaction(() => {
    if (coins > 0) {
      applyLedger({
        userId,
        asset: 'COIN',
        delta: coins,
        reason: 'campaign_cashout',
        refType: 'campaign',
        refId: row.id,
      });
    }
    if (gems > 0) {
      applyLedger({
        userId,
        asset: 'GEM',
        delta: gems,
        reason: 'campaign_cashout',
        refType: 'campaign',
        refId: row.id,
      });
    }
    prepare(
      `UPDATE campaign_runs SET status = 'cashed', pending_sigil = NULL, story_flag = NULL,
       updated_at = datetime('now') WHERE id = ?`
    ).run(row.id);
    prepare(
      `UPDATE users SET campaign_high_water = MAX(COALESCE(campaign_high_water,0), ?) WHERE id = ?`
    ).run(high, userId);
  });
  tx();
  return {
    cashed: true,
    coins,
    gems,
    highWater: high,
    ticketGranted: false, // campaign never feeds pot/lottery entry
    roadBonus,
    balances: getBalances(userId),
    run: null,
  };
}

export function campaignRevive(userId) {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) throw Object.assign(new Error('No active climb'), { code: 'NO_RUN' });
  if (row.revived) {
    throw Object.assign(new Error('Revive already used'), { code: 'NO_REVIVE' });
  }
  prepare(
    `UPDATE campaign_runs SET revived = 1, updated_at = datetime('now') WHERE id = ?`
  ).run(row.id);
  const updated = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return { run: publicRun(updated, user), revived: true };
}

export function campaignAbandon(userId) {
  const row = prepare(
    `SELECT * FROM campaign_runs WHERE user_id = ? AND status IN ('active','equip','story','choosing')
     ORDER BY created_at DESC LIMIT 1`
  ).get(userId);
  if (!row) {
    return { abandoned: true, coins: 0, gems: 0, balances: getBalances(userId) };
  }
  prepare(
    `UPDATE campaign_runs SET bank_coins = ?, bank_gems = ? WHERE id = ?`
  ).run(Math.round((row.bank_coins || 0) * 0.5), Math.round((row.bank_gems || 0) * 0.5), row.id);
  const row2 = prepare(`SELECT * FROM campaign_runs WHERE id = ?`).get(row.id);
  return { ...cashOutRun(userId, row2), abandoned: true };
}

// legacy alias for choose blessing → equip skip
export function campaignChoose(userId, body = {}) {
  if (body.cashOut) return campaignCashOut(userId);
  if (body.path) return campaignChoosePath(userId, { path: body.path });
  return campaignEquip(userId, {
    slot: body.slot || body.blessingId,
    skip: !!body.skip,
  });
}
