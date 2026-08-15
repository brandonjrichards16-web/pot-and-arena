/**
 * Races + classes for Pot & Arena Road.
 * Goal: reason to unlock different heroes for different stretches
 * (not one maxed forever like Cup Hero).
 *
 * - Character create: ONE free race + ONE free class (whatever you pick)
 * - Everything else costs gems on Heroes (Human/Warrior included if not picked)
 * - One active race+class at a time
 * - Party slots: 1 → 2 after ch.3 clear → 3 after ch.6
 * - Theme affinity: race deals more on favored biomes
 */
import { prepare } from './db.js';
import { applyLedger, getBalances } from './ledger.js';

export const RACES = [
  {
    id: 'human',
    name: 'Human',
    emoji: '🧑',
    gemCost: 100,
    free: false,
    blurb: 'Balanced pot-city stock. Steady in dust, stone, and markets.',
    bonus: { ATK: 1, HP: 4, DEF: 1, SPD: 0 },
    strongThemes: ['dustlands', 'castle', 'ruins', 'nightmarket'],
    strongLabel: 'City & dust roads',
  },
  {
    id: 'elf',
    name: 'Elf',
    emoji: '🧝',
    gemCost: 100,
    free: false,
    blurb: 'Swift and sharp. Favored in wild green, ice, and high paths.',
    bonus: { ATK: 2, HP: 0, DEF: 0, SPD: 5 },
    strongThemes: ['forest', 'swamp', 'ice', 'skybridge'],
    strongLabel: 'Wild & high roads',
  },
  {
    id: 'ork',
    name: 'Ork',
    emoji: '👹',
    gemCost: 100,
    free: false,
    blurb: 'Thick-skinned brutes. Crush bone, iron, and fire stretches.',
    bonus: { ATK: 4, HP: 8, DEF: 3, SPD: -2 },
    strongThemes: ['boneyard', 'dungeon', 'volcano', 'sewer', 'crypt'],
    strongLabel: 'Bone, iron & fire',
  },
];

export const CLASSES = [
  {
    id: 'warrior',
    name: 'Warrior',
    emoji: '⚔️',
    gemCost: 45,
    free: false,
    blurb: 'Front-line steel. +ATK +DEF. Reliable clears.',
    bonus: { ATK: 3, HP: 3, DEF: 3, SPD: 0 },
    role: 'front',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    emoji: '🏹',
    gemCost: 45,
    free: false,
    blurb: 'First strike. +SPD +ATK. Shreds long roads.',
    bonus: { ATK: 2, HP: 1, DEF: 0, SPD: 5 },
    role: 'skirmish',
  },
  {
    id: 'mage',
    name: 'Mage',
    emoji: '✨',
    gemCost: 45,
    free: false,
    blurb: 'Glass cannon. Big ATK, thin DEF. Boss-burst.',
    bonus: { ATK: 6, HP: 0, DEF: -1, SPD: 1 },
    role: 'burst',
  },
];

const RACE_BY = Object.fromEntries(RACES.map((r) => [r.id, r]));
const CLASS_BY = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

export function ensureHeroesColumns() {
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
  add('race', "TEXT DEFAULT 'human'");
  add('class_id', "TEXT DEFAULT 'warrior'");
  add('heroes_json', "TEXT DEFAULT '{}'");
}

function emptyHeroesState() {
  return {
    unlockedRaces: [],
    /** per-race class ids — empty until create or gem unlock */
    classUnlocks: { human: [], elf: [], ork: [] },
    /** races in the traveling party (order = slot) */
    party: [],
    activeRace: 'human',
    activeClass: 'warrior',
  };
}

export function parseHeroes(user) {
  ensureHeroesColumns();
  let st = emptyHeroesState();
  try {
    const j = JSON.parse(user?.heroes_json || '{}');
    if (j && typeof j === 'object') st = { ...emptyHeroesState(), ...j };
  } catch {
    /* keep default */
  }
  // Sync from columns if present
  if (user?.race && RACE_BY[user.race]) st.activeRace = user.race;
  if (user?.class_id && CLASS_BY[user.class_id]) st.activeClass = user.class_id;

  if (!st.classUnlocks || typeof st.classUnlocks !== 'object') {
    st.classUnlocks = { human: [], elf: [], ork: [] };
  }
  for (const r of RACES) {
    if (!Array.isArray(st.classUnlocks[r.id])) st.classUnlocks[r.id] = [];
  }

  // No forced free Human/Warrior. Only bootstrap / gem unlocks grant slots.
  if (!Array.isArray(st.unlockedRaces)) st.unlockedRaces = [];
  // Broken / empty state: if they already created a character, seed unlocks from active only
  if (!st.unlockedRaces.length && user?.character_ready) {
    const rid = RACE_BY[st.activeRace] ? st.activeRace : 'human';
    const cid = CLASS_BY[st.activeClass] ? st.activeClass : 'warrior';
    st.unlockedRaces = [rid];
    st.classUnlocks[rid] = [cid];
    st.activeRace = rid;
    st.activeClass = cid;
  }

  if (st.unlockedRaces.length && !st.unlockedRaces.includes(st.activeRace)) {
    st.activeRace = st.unlockedRaces[0];
  }
  const unlockedClasses = st.classUnlocks[st.activeRace] || [];
  if (unlockedClasses.length && !unlockedClasses.includes(st.activeClass)) {
    st.activeClass = unlockedClasses[0];
  }
  if (!Array.isArray(st.party) || !st.party.length) {
    st.party = st.activeRace ? [st.activeRace] : [];
  }
  // party only unlocked races
  st.party = st.party.filter((id) => st.unlockedRaces.includes(id));
  if (!st.party.length && st.activeRace && st.unlockedRaces.includes(st.activeRace)) {
    st.party = [st.activeRace];
  }
  if (st.party.length && !st.party.includes(st.activeRace)) {
    st.party[0] = st.activeRace;
  }
  return st;
}

export function saveHeroes(userId, st) {
  ensureHeroesColumns();
  prepare(
    `UPDATE users SET heroes_json = ?, race = ?, class_id = ? WHERE id = ?`
  ).run(JSON.stringify(st), st.activeRace, st.activeClass, userId);
}

/** Party size from campaign progress (chapters cleared). */
export function partySlotsFor(chapterCleared = 0) {
  const n = Number(chapterCleared) || 0;
  if (n >= 6) return 3;
  if (n >= 3) return 2;
  return 1;
}

export function raceById(id) {
  return RACE_BY[id] || RACE_BY.human;
}
export function classById(id) {
  return CLASS_BY[id] || CLASS_BY.warrior;
}

/**
 * Rock-paper-scissors: Elf > Ork > Human > Elf.
 * scale 0.25 on the Road, ~0.05 in pits.
 * Advantage attack: ×(1+scale). Defender advantage: ×(1-scale) damage taken.
 */
export const RACE_BEATS = { elf: 'ork', ork: 'human', human: 'elf' };
export const RACE_IDS = ['human', 'elf', 'ork'];

export function normalizeRace(id) {
  return RACE_BY[id] ? id : 'human';
}

/**
 * @param {string} attackerRace
 * @param {string} defenderRace
 * @param {number} scale 0.25 road, 0.05 pit
 * @returns {{ mult: number, relation: 'strong'|'weak'|'neutral', label: string|null }}
 */
export function raceDamageMult(attackerRace, defenderRace, scale = 0.25) {
  const a = normalizeRace(attackerRace);
  const d = normalizeRace(defenderRace);
  if (a === d) {
    return { mult: 1, relation: 'neutral', label: null };
  }
  if (RACE_BEATS[a] === d) {
    return {
      mult: 1 + scale,
      relation: 'strong',
      label: `${raceById(a).emoji} strong vs ${raceById(d).emoji}`,
    };
  }
  if (RACE_BEATS[d] === a) {
    return {
      mult: Math.max(0.5, 1 - scale),
      relation: 'weak',
      label: `${raceById(d).emoji} resists ${raceById(a).emoji}`,
    };
  }
  return { mult: 1, relation: 'neutral', label: null };
}

export const TYPE_HINT =
  'Type chart: Elf beats Ork · Ork beats Human · Human beats Elf. Road ~25% · Pits ~5%.';

/**
 * Which races appear on the Road by chapter (and stage blend).
 * Early: humans → elves → mix → orks → full mix.
 */
export function raceWeightsForChapter(chapter = 1, stage = 1) {
  const ch = Math.max(1, Number(chapter) || 1);
  const s = Math.max(1, Number(stage) || 1);
  // Stage slowly introduces next race even within a chapter
  const late = s > 30 ? 1 : s > 15 ? 0.5 : 0;

  if (ch <= 1) {
    // Dust Gate — mostly human rivals
    return { human: 0.85 - late * 0.15, elf: 0.1 + late * 0.15, ork: 0.05 };
  }
  if (ch === 2) {
    // Iron March — humans + elves
    return { human: 0.55, elf: 0.4, ork: 0.05 };
  }
  if (ch === 3) {
    // Wild Tangle — elf heavy
    return { human: 0.2, elf: 0.7, ork: 0.1 };
  }
  if (ch === 4) {
    // human + elf mix, orks start
    return { human: 0.35, elf: 0.4, ork: 0.25 };
  }
  if (ch === 5) {
    // ork heavy
    return { human: 0.2, elf: 0.25, ork: 0.55 };
  }
  // ch 6+ full mix
  return { human: 0.34, elf: 0.33, ork: 0.33 };
}

export function pickRaceFromWeights(weights, rng = Math.random) {
  const r = typeof rng === 'function' ? rng() : Math.random();
  let acc = 0;
  const entries = Object.entries(weights || {});
  for (const [id, w] of entries) {
    acc += Number(w) || 0;
    if (r <= acc) return normalizeRace(id);
  }
  return 'human';
}

/** Map old enemy kind → class flavor */
export function classForEnemyKind(kindId, rng = Math.random) {
  const rand = typeof rng === 'function' ? rng : Math.random;
  if (kindId === 'archer' || kindId === 'rogue') return 'ranger';
  if (kindId === 'mystic' || kindId === 'cultist') return 'mage';
  if (kindId === 'boss') {
    const roll = rand();
    if (roll < 0.34) return 'warrior';
    if (roll < 0.67) return 'ranger';
    return 'mage';
  }
  // knight, brute, monster, rival — mostly warrior, some ranger
  return rand() < 0.75 ? 'warrior' : 'ranger';
}

/** Flat ATK/HP/DEF/SPD from active race + class + small party support. */
export function heroStatBonus(user, { chapterCleared, themeKey } = {}) {
  const st = parseHeroes(user);
  const race = raceById(st.activeRace);
  const cls = classById(st.activeClass);
  const b = { ATK: 0, HP: 0, DEF: 0, SPD: 0 };
  for (const k of ['ATK', 'HP', 'DEF', 'SPD']) {
    b[k] += race.bonus[k] || 0;
    b[k] += cls.bonus[k] || 0;
  }

  // Support party: extra unlocked races in party give small passive (not full multi-unit yet)
  const slots = partySlotsFor(chapterCleared ?? user?.campaign_chapter_cleared);
  const support = (st.party || [])
    .filter((id) => id !== st.activeRace)
    .slice(0, Math.max(0, slots - 1));
  for (const rid of support) {
    const r = raceById(rid);
    b.ATK += Math.max(0, Math.round((r.bonus.ATK || 0) * 0.25));
    b.HP += Math.max(0, Math.round((r.bonus.HP || 0) * 0.2));
    b.DEF += Math.max(0, Math.round((r.bonus.DEF || 0) * 0.2));
    b.SPD += Math.max(0, Math.round((r.bonus.SPD || 0) * 0.2));
  }

  // Theme affinity — the reason to switch heroes mid-road
  let affinity = 1;
  let affinityLabel = null;
  if (themeKey && race.strongThemes?.includes(themeKey)) {
    affinity = 1.12; // +12% effective combat presence
    affinityLabel = `${race.name} thrives here (+12%)`;
    b.ATK = Math.round(b.ATK * 1.12 + 1);
    b.SPD = Math.round(b.SPD * 1.08);
  }

  return {
    ...b,
    raceId: race.id,
    raceName: race.name,
    raceEmoji: race.emoji,
    classId: cls.id,
    className: cls.name,
    classEmoji: cls.emoji,
    affinity,
    affinityLabel,
    supportRaces: support,
    partySlots: slots,
  };
}

/** Apply hero bonuses onto a fighter { power, vitality, guard, speed }. */
export function applyHeroToFighter(fighter, user, opts = {}) {
  const h = heroStatBonus(user, opts);
  return {
    ...fighter,
    power: (fighter.power || 10) + h.ATK,
    vitality: (fighter.vitality || 30) + h.HP,
    guard: (fighter.guard || 5) + h.DEF,
    speed: (fighter.speed || 10) + h.SPD,
    race: h.raceId,
    classId: h.classId,
    raceName: h.raceName,
    className: h.className,
    affinityLabel: h.affinityLabel,
    heroLabel: `${h.raceEmoji} ${h.raceName} ${h.classEmoji} ${h.className}`,
  };
}

export function publicHeroes(user) {
  ensureHeroesColumns();
  const st = parseHeroes(user);
  const chapterCleared = user?.campaign_chapter_cleared || 0;
  const slots = partySlotsFor(chapterCleared);
  const gems = getBalances(user.id).GEM || 0;
  const bonus = heroStatBonus(user, { chapterCleared });

  return {
    races: RACES.map((r) => ({
      ...r,
      unlocked: st.unlockedRaces.includes(r.id),
      canBuy: !st.unlockedRaces.includes(r.id) && gems >= r.gemCost,
      classes: CLASSES.map((c) => {
        const unlocked = (st.classUnlocks[r.id] || []).includes(c.id);
        const cost = c.gemCost || 0;
        return {
          ...c,
          gemCost: cost,
          unlocked,
          canBuy:
            st.unlockedRaces.includes(r.id) && !unlocked && gems >= cost,
        };
      }),
    })),
    active: {
      race: st.activeRace,
      classId: st.activeClass,
      label: bonus.heroLabel || `${bonus.raceName} ${bonus.className}`,
      bonus: {
        ATK: bonus.ATK,
        HP: bonus.HP,
        DEF: bonus.DEF,
        SPD: bonus.SPD,
      },
    },
    party: st.party,
    partySlots: slots,
    partySlotsNext:
      slots < 2
        ? { needChapter: 3, slots: 2, hint: 'Clear chapter 3 (Wild Tangle) to field 2 heroes' }
        : slots < 3
          ? { needChapter: 6, slots: 3, hint: 'Clear chapter 6 to field all 3 races' }
          : null,
    chapterCleared,
    unlockedRaces: st.unlockedRaces,
    note:
      'Unlock races & classes with gems. Switch for biome affinity + type chart. Party grows as you clear chapters.',
    typeChart: {
      hint: TYPE_HINT,
      beats: RACE_BEATS,
      roadScale: 0.25,
      pitScale: 0.05,
      blurb:
        'Elf > Ork > Human > Elf. Strong attack / resist defense on the Road (~25%). Soft in pits (~5%).',
    },
  };
}

export function unlockRace(userId, raceId) {
  ensureHeroesColumns();
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const race = RACE_BY[raceId];
  if (!race) {
    const e = new Error('Unknown race');
    e.code = 'BAD_RACE';
    throw e;
  }
  const st = parseHeroes(user);
  if (st.unlockedRaces.includes(raceId)) {
    return { already: true, heroes: publicHeroes(user), balances: getBalances(userId) };
  }
  if (race.gemCost > 0) {
    applyLedger({
      userId,
      asset: 'GEM',
      delta: -race.gemCost,
      reason: `unlock_race_${raceId}`,
    });
  }
  st.unlockedRaces.push(raceId);
  if (!Array.isArray(st.classUnlocks[raceId])) st.classUnlocks[raceId] = [];
  // Race unlock alone does NOT grant a free class — buy warrior/ranger/mage next.
  // Auto-add to party if slots free
  const slots = partySlotsFor(user.campaign_chapter_cleared);
  if (st.party.length < slots && !st.party.includes(raceId)) {
    st.party.push(raceId);
  }
  saveHeroes(userId, st);
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    unlocked: raceId,
    heroes: publicHeroes(updated),
    balances: getBalances(userId),
    message: `${race.emoji} ${race.name} unlocked! Buy a class (Warrior / Ranger / Mage) for this race.`,
  };
}

export function unlockClass(userId, raceId, classId) {
  ensureHeroesColumns();
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const race = RACE_BY[raceId];
  const cls = CLASS_BY[classId];
  if (!race || !cls) {
    const e = new Error('Unknown race or class');
    e.code = 'BAD_PICK';
    throw e;
  }
  const st = parseHeroes(user);
  if (!st.unlockedRaces.includes(raceId)) {
    const e = new Error(`Unlock ${race.name} first`);
    e.code = 'NEED_RACE';
    throw e;
  }
  const list = st.classUnlocks[raceId] || [];
  if (list.includes(classId)) {
    const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    return { already: true, heroes: publicHeroes(updated), balances: getBalances(userId) };
  }
  applyLedger({
    userId,
    asset: 'GEM',
    delta: -cls.gemCost,
    reason: `unlock_class_${raceId}_${classId}`,
  });
  st.classUnlocks[raceId] = [...list, classId];
  saveHeroes(userId, st);
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    unlocked: { raceId, classId },
    heroes: publicHeroes(updated),
    balances: getBalances(userId),
    message: `${cls.emoji} ${cls.name} unlocked for ${race.name}.`,
  };
}

/** Equip active race + class (must be unlocked). */
export function equipHero(userId, { race, classId }) {
  ensureHeroesColumns();
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const st = parseHeroes(user);
  const rid = race || st.activeRace;
  const cid = classId || st.activeClass;
  if (!st.unlockedRaces.includes(rid)) {
    const e = new Error('Race locked');
    e.code = 'LOCKED';
    throw e;
  }
  const classes = st.classUnlocks[rid] || [];
  const cls = CLASS_BY[cid];
  if (!cls || !classes.includes(cid)) {
    const e = new Error('Class locked for this race');
    e.code = 'LOCKED';
    throw e;
  }
  st.activeRace = rid;
  st.activeClass = cid;
  if (!st.party.includes(rid)) {
    const slots = partySlotsFor(user.campaign_chapter_cleared);
    if (st.party.length < slots) st.party.push(rid);
    else st.party[0] = rid;
  }
  saveHeroes(userId, st);
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    heroes: publicHeroes(updated),
    user: updated,
    message: `Now fighting as ${raceById(rid).emoji} ${raceById(rid).name} ${cls.emoji} ${cls.name}`,
  };
}

export function setParty(userId, partyRaceIds) {
  ensureHeroesColumns();
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const st = parseHeroes(user);
  const slots = partySlotsFor(user.campaign_chapter_cleared);
  const next = [];
  for (const id of partyRaceIds || []) {
    if (!st.unlockedRaces.includes(id)) continue;
    if (next.includes(id)) continue;
    next.push(id);
    if (next.length >= slots) break;
  }
  if (!next.length) next.push(st.activeRace);
  st.party = next;
  if (!st.party.includes(st.activeRace)) {
    st.activeRace = st.party[0];
    const classes = st.classUnlocks[st.activeRace] || ['warrior'];
    if (!classes.includes(st.activeClass)) st.activeClass = classes[0] || 'warrior';
  }
  saveHeroes(userId, st);
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return { heroes: publicHeroes(updated), party: st.party, partySlots: slots };
}

/**
 * Bootstrap new character.
 * First-time create: ONLY the race + class you picked are unlocked.
 * Everything else stays locked until bought with gems on Heroes.
 */
export function bootstrapHeroes(userId, { race = 'human', classId = 'warrior' } = {}) {
  ensureHeroesColumns();
  const rid = RACE_BY[race] ? race : 'human';
  const cid = CLASS_BY[classId] ? classId : 'warrior';
  const st = emptyHeroesState();
  st.activeRace = rid;
  st.activeClass = cid;
  st.unlockedRaces = [rid];
  st.classUnlocks = { human: [], elf: [], ork: [] };
  st.classUnlocks[rid] = [cid];
  st.party = [rid];
  saveHeroes(userId, st);
}
