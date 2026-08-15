/**
 * Clans / guilds — shared chest (passive contrib), war cadence,
 * defend / raid, roles, and ally flags for pit fights.
 *
 * Chest: fills when members play (pits / campaign) with ~25% chance
 * of +1 coin or +1 gem. Not funded from player wallets.
 *
 * War cycle (global): PREP → set defenses · ATTACK → raid window.
 * Defaults: 3 days prep + 1 day attack (override via CLAN_WAR_*_HOURS).
 * Defend holds → chest doubles. Full raid → attackers take 2/3 (split
 * to their clan), defenders keep 1/3 (split to theirs).
 */
import { nanoid } from 'nanoid';
import { prepare } from './db.js';
import { applyLedger, getBalances, ensureBalances } from './ledger.js';
import { parseHeroes } from './heroes.js';
import { parseGear, gearBonus } from './gear.js';
import { mulberry32, hashSeed } from './combat.js';

/** @deprecated defense duration follows war attack phase end */
export const DEFENSE_HOURS_DEFAULT = 24;
/** @deprecated use DEF_WAVE_SIZES — kept for older clients */
export const DEFENSE_STAGES = 9;
export const MIN_TAG_LEN = 2;
export const MAX_TAG_LEN = 5;
export const MAX_NAME_LEN = 28;
/** 25 members · defense waves use 3s and 2s that sum to 25 */
export const MAX_CLAN_MEMBERS = 25;
export const CREATE_COST_GEMS = 0; // free for testing
/**
 * Defense lineup (25 seats):
 * five×3 (15) + one×2 (17) + two×3 (23) + one×2 (25)
 */
export const DEF_WAVE_SIZES = [3, 3, 3, 3, 3, 2, 3, 3, 2];

/** Global war cadence — env overrides for playtest */
export const WAR_PREP_HOURS = Math.max(
  0.05,
  Number(process.env.CLAN_WAR_PREP_HOURS ?? 72)
);
export const WAR_ATTACK_HOURS = Math.max(
  0.05,
  Number(process.env.CLAN_WAR_ATTACK_HOURS ?? 24)
);
/** Fixed epoch so every client/server shares the same phase */
const WAR_EPOCH_MS = Date.UTC(2026, 0, 5, 0, 0, 0); // Mon 2026-01-05 UTC

/** Chance an eligible action adds to the clan chest */
export const CHEST_CONTRIB_CHANCE = 0.25;
/** After leave/kick — hours before joining another clan */
export const REJOIN_COOLDOWN_HOURS = Number(
  process.env.CLAN_REJOIN_COOLDOWN_HOURS ?? 12
);

/** Roles: leader (Chief) > coleader > warrior > member */
export const CLAN_ROLES = ['leader', 'coleader', 'warrior', 'member'];
export const ROLE_LABEL = {
  leader: 'Chief',
  coleader: 'Co-leader',
  warrior: 'Warrior',
  member: 'Member',
};
const ROLE_RANK = { leader: 4, coleader: 3, warrior: 2, member: 1 };

export function ensureClanTables() {
  prepare(`
    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tag TEXT NOT NULL UNIQUE,
      leader_id TEXT NOT NULL,
      coins REAL NOT NULL DEFAULT 0,
      gems REAL NOT NULL DEFAULT 0,
      chest_note TEXT,
      defense_json TEXT,
      defense_until TEXT,
      defense_started_at TEXT,
      total_raids_won INTEGER NOT NULL DEFAULT 0,
      total_defenses_held INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  prepare(`
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      contrib_coins INTEGER NOT NULL DEFAULT 0,
      contrib_gems INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id),
      FOREIGN KEY (clan_id) REFERENCES clans(id)
    )
  `).run();

  prepare(`
    CREATE TABLE IF NOT EXISTS clan_raids (
      id TEXT PRIMARY KEY,
      attacker_clan_id TEXT NOT NULL,
      defender_clan_id TEXT NOT NULL,
      attacker_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      stages_cleared INTEGER NOT NULL DEFAULT 0,
      stages_total INTEGER NOT NULL DEFAULT 0,
      loot_coins REAL NOT NULL DEFAULT 0,
      loot_gems REAL NOT NULL DEFAULT 0,
      result_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  prepare(`
    CREATE TABLE IF NOT EXISTS clan_chat (
      id TEXT PRIMARY KEY,
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  prepare(`
    CREATE TABLE IF NOT EXISTS clan_squads (
      id TEXT PRIMARY KEY,
      attacker_clan_id TEXT NOT NULL,
      defender_clan_id TEXT NOT NULL,
      max_size INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'filling',
      seats_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      result_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  prepare(`
    CREATE TABLE IF NOT EXISTS clan_join_requests (
      id TEXT PRIMARY KEY,
      clan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT,
      level INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(clan_id, user_id)
    )
  `).run();

  // Mirror on users for fast pit lookups
  const cols = prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!cols.includes('clan_id')) {
    try {
      prepare(`ALTER TABLE users ADD COLUMN clan_id TEXT`).run();
    } catch {
      /* ignore */
    }
  }
  if (!cols.includes('last_seen_at')) {
    try {
      // SQLite ALTER ADD COLUMN: keep default simple (expr defaults can fail)
      prepare(`ALTER TABLE users ADD COLUMN last_seen_at TEXT`).run();
    } catch {
      /* ignore */
    }
  }
  const clanCols = prepare(`PRAGMA table_info(clans)`).all().map((c) => c.name);
  if (!clanCols.includes('settings_json')) {
    try {
      prepare(
        `ALTER TABLE clans ADD COLUMN settings_json TEXT DEFAULT '{}'`
      ).run();
    } catch {
      /* ignore */
    }
  }
  if (!clanCols.includes('announcement')) {
    try {
      prepare(`ALTER TABLE clans ADD COLUMN announcement TEXT`).run();
    } catch {
      /* ignore */
    }
  }
  // clan_members contrib columns (older DBs)
  const memCols = prepare(`PRAGMA table_info(clan_members)`).all().map((c) => c.name);
  if (!memCols.includes('contrib_coins')) {
    try {
      prepare(
        `ALTER TABLE clan_members ADD COLUMN contrib_coins INTEGER NOT NULL DEFAULT 0`
      ).run();
    } catch {
      /* ignore */
    }
  }
  if (!memCols.includes('contrib_gems')) {
    try {
      prepare(
        `ALTER TABLE clan_members ADD COLUMN contrib_gems INTEGER NOT NULL DEFAULT 0`
      ).run();
    } catch {
      /* ignore */
    }
  }
  if (!cols.includes('clan_cooldown_until')) {
    try {
      prepare(`ALTER TABLE users ADD COLUMN clan_cooldown_until TEXT`).run();
    } catch {
      /* ignore */
    }
  }
}

function defaultSettings() {
  return {
    minLevel: 1,
    autoAccept: true,
  };
}

/**
 * Global war schedule shared by all clans.
 * @returns {{ phase: 'prep'|'attack', cycleIndex: number, prepEndsAt: string,
 *   attackEndsAt: string, phaseEndsAt: string, prepHours: number, attackHours: number,
 *   msLeft: number, label: string }}
 */
export function getWarSchedule(nowMs = Date.now()) {
  const prepMs = WAR_PREP_HOURS * 3600 * 1000;
  const attackMs = WAR_ATTACK_HOURS * 3600 * 1000;
  const cycleMs = prepMs + attackMs;
  const elapsed = Math.max(0, nowMs - WAR_EPOCH_MS);
  const cycleIndex = Math.floor(elapsed / cycleMs);
  const into = elapsed % cycleMs;
  const cycleStart = WAR_EPOCH_MS + cycleIndex * cycleMs;
  const prepEnds = cycleStart + prepMs;
  const attackEnds = cycleStart + cycleMs;
  const phase = into < prepMs ? 'prep' : 'attack';
  const phaseEndsAtMs = phase === 'prep' ? prepEnds : attackEnds;
  const msLeft = Math.max(0, phaseEndsAtMs - nowMs);
  const hrs = Math.ceil(msLeft / 3600000);
  const label =
    phase === 'prep'
      ? `Prep · ${formatDuration(msLeft)} left to set defense`
      : `Attack day · ${formatDuration(msLeft)} left to raid`;
  return {
    phase,
    cycleIndex,
    prepEndsAt: new Date(prepEnds).toISOString(),
    attackEndsAt: new Date(attackEnds).toISOString(),
    phaseEndsAt: new Date(phaseEndsAtMs).toISOString(),
    prepHours: WAR_PREP_HOURS,
    attackHours: WAR_ATTACK_HOURS,
    msLeft,
    label,
    canDefend: true, // seats anytime; open board preferred in prep
    canOpenDefense: phase === 'prep' || phase === 'attack',
    canRaid: phase === 'attack',
  };
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.max(1, Math.ceil(ms / 1000))}s`;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function setClanCooldown(userId) {
  if (!userId || REJOIN_COOLDOWN_HOURS <= 0) return;
  const until = new Date(
    Date.now() + REJOIN_COOLDOWN_HOURS * 3600 * 1000
  ).toISOString();
  try {
    prepare(`UPDATE users SET clan_cooldown_until = ? WHERE id = ?`).run(until, userId);
  } catch {
    /* ignore */
  }
}

function assertNoClanCooldown(userId) {
  const u = getUser(userId);
  if (!u?.clan_cooldown_until) return;
  const t = new Date(u.clan_cooldown_until).getTime();
  if (Number.isFinite(t) && t > Date.now()) {
    const left = formatDuration(t - Date.now());
    throw Object.assign(
      new Error(`Clan cooldown — wait ${left} before joining again`),
      { code: 'COOLDOWN' }
    );
  }
}

/** System line in clan chat (no user) */
export function postSystemChat(clanId, body) {
  if (!clanId || !body) return;
  try {
    ensureClanTables();
    const id = nanoid(12);
    prepare(
      `INSERT INTO clan_chat (id, clan_id, user_id, display_name, body) VALUES (?, ?, ?, ?, ?)`
    ).run(id, clanId, 'system', 'Campsite', String(body).slice(0, 280));
  } catch {
    /* ignore */
  }
}

/**
 * Passive chest fill: ~25% chance after eligible play actions.
 * Does NOT take from the player's wallet — spawns into the shared chest.
 * @returns {{ added: boolean, asset?: string, amount?: number, clanId?: string }|null}
 */
export function maybeClanChestContrib(userId, { source = 'play' } = {}) {
  if (!userId) return null;
  try {
    ensureClanTables();
    const clanId = getUserClanId(userId);
    if (!clanId) return null;
    if (Math.random() >= CHEST_CONTRIB_CHANCE) {
      return { added: false, clanId };
    }
    // 50/50 coin vs gem
    const asset = Math.random() < 0.5 ? 'COIN' : 'GEM';
    const amount = 1;
    if (asset === 'COIN') {
      prepare(
        `UPDATE clans SET coins = coins + ?, updated_at = datetime('now') WHERE id = ?`
      ).run(amount, clanId);
      prepare(
        `UPDATE clan_members SET contrib_coins = contrib_coins + ? WHERE user_id = ? AND clan_id = ?`
      ).run(amount, userId, clanId);
    } else {
      prepare(
        `UPDATE clans SET gems = gems + ?, updated_at = datetime('now') WHERE id = ?`
      ).run(amount, clanId);
      prepare(
        `UPDATE clan_members SET contrib_gems = contrib_gems + ? WHERE user_id = ? AND clan_id = ?`
      ).run(amount, userId, clanId);
    }
    return { added: true, asset, amount, clanId, source };
  } catch {
    return null;
  }
}

/** Split coins/gems evenly to every current clan member via ledger */
function splitToClanMembers(clanId, coins, gems, reason, refId) {
  const members = prepare(
    `SELECT user_id FROM clan_members WHERE clan_id = ?`
  ).all(clanId);
  if (!members.length) return { paid: 0 };
  const n = members.length;
  const c = Math.max(0, Math.floor(coins || 0));
  const g = Math.max(0, Math.floor(gems || 0));
  if (c <= 0 && g <= 0) return { paid: 0 };
  const cEach = Math.floor(c / n);
  const gEach = Math.floor(g / n);
  let cRem = c - cEach * n;
  let gRem = g - gEach * n;
  for (let i = 0; i < n; i++) {
    const uid = members[i].user_id;
    const payC = cEach + (i === 0 ? cRem : 0);
    const payG = gEach + (i === 0 ? gRem : 0);
    if (payC > 0) {
      applyLedger({
        userId: uid,
        asset: 'COIN',
        delta: payC,
        reason,
        refType: 'clan',
        refId,
      });
    }
    if (payG > 0) {
      applyLedger({
        userId: uid,
        asset: 'GEM',
        delta: payG,
        reason,
        refType: 'clan',
        refId,
      });
    }
  }
  return { paid: n, coins: c, gems: g };
}

function parseSettings(clan) {
  try {
    return { ...defaultSettings(), ...(JSON.parse(clan?.settings_json || '{}') || {}) };
  } catch {
    return defaultSettings();
  }
}

export function touchLastSeen(userId) {
  if (!userId) return;
  try {
    ensureClanTables();
    prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(
      userId
    );
  } catch {
    /* ignore */
  }
}

function roleOf(userId, clanId) {
  const m = prepare(
    `SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?`
  ).get(userId, clanId);
  return m?.role || null;
}

function isLeader(userId, clan) {
  return clan?.leader_id === userId || roleOf(userId, clan.id) === 'leader';
}

function isColeader(userId, clanId) {
  return roleOf(userId, clanId) === 'coleader';
}

/** Kick, deposit management during defend open, raid open, claim seat helpers */
function canManageMembers(userId, clan) {
  return isLeader(userId, clan) || isColeader(userId, clan.id);
}

function canEditSettings(userId, clan) {
  return isLeader(userId, clan);
}

function canPromote(userId, clan) {
  return isLeader(userId, clan);
}

function formatLastSeen(iso) {
  if (!iso) return 'Unknown';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'Unknown';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 3) return 'Online';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function participationFor(clanId, userId) {
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  const def = parseDefense(clan);
  let defended = false;
  if (def?.waves) {
    for (const w of def.waves) {
      if ((w.seats || []).some((s) => s && s.userId === userId)) {
        defended = true;
        break;
      }
    }
  }
  // Attacked during current defense window of *any* target, or any open/fought squad recently
  const attacked = !!prepare(
    `SELECT id FROM clan_squads
     WHERE attacker_clan_id = ?
       AND seats_json LIKE ?
       AND created_at >= datetime('now', '-2 days')
     LIMIT 1`
  ).get(clanId, `%"userId":"${userId}"%`);
  return { defended, attacked };
}

function emptyDefenseWaves() {
  return DEF_WAVE_SIZES.map((size, i) => ({
    wave: i + 1,
    size,
    seats: Array.from({ length: size }, () => null),
    /** remaining HP when attackers fail mid-wave (damage carry) */
    hpLeft: null,
    maxHp: 0,
  }));
}

function heroSnapshot(userId) {
  const u = getUser(userId);
  if (!u) return null;
  const row = {
    user_id: u.id,
    display_name: u.display_name,
    level: u.level,
    gender: u.gender,
    race: u.race,
    class_id: u.class_id,
    power: u.power,
    vitality: u.vitality,
    speed: u.speed,
    guard: u.guard,
    upgrades_json: u.upgrades_json,
    gear_json: u.gear_json,
    heroes_json: u.heroes_json,
  };
  const pm = publicMember(row);
  return {
    userId: pm.userId,
    name: pm.displayName,
    power: pm.power,
    gender: pm.gender,
    race: pm.race,
    classId: pm.classId,
    level: pm.level,
  };
}

function wavePower(wave) {
  const filled = (wave.seats || []).filter(Boolean);
  if (!filled.length) return 8; // empty wave still has a little structure HP
  return filled.reduce((a, s) => a + (s.power || 10), 0);
}

function recomputeWaveHp(wave, scale = 1) {
  const maxHp = Math.round(wavePower(wave) * scale);
  return {
    ...wave,
    maxHp,
    hpLeft: wave.hpLeft == null ? maxHp : Math.min(wave.hpLeft, maxHp),
  };
}

function normTag(tag) {
  return String(tag || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_TAG_LEN);
}

function memberPower(user) {
  if (!user) return 10;
  const ups = (() => {
    try {
      return JSON.parse(user.upgrades_json || '{}');
    } catch {
      return {};
    }
  })();
  const gear = (() => {
    try {
      return JSON.parse(user.gear_json || '{}');
    } catch {
      return {};
    }
  })();
  let gearScore = 0;
  for (const k of Object.keys(gear)) {
    const arr = gear[k];
    if (Array.isArray(arr)) gearScore += arr.length * 2;
  }
  const points = Object.values(ups).reduce((a, v) => a + (Number(v) || 0), 0);
  return (
    (user.power || 10) +
    (user.vitality || 30) * 0.15 +
    (user.guard || 5) +
    (user.speed || 10) * 0.5 +
    (user.level || 1) * 3 +
    points * 1.5 +
    gearScore
  );
}

function getUser(userId) {
  return prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
}

export function getUserClanId(userId) {
  const u = getUser(userId);
  if (u?.clan_id) return u.clan_id;
  const m = prepare(`SELECT clan_id FROM clan_members WHERE user_id = ?`).get(userId);
  return m?.clan_id || null;
}

function setUserClan(userId, clanId) {
  prepare(`UPDATE users SET clan_id = ? WHERE id = ?`).run(clanId, userId);
}

function membersOf(clanId) {
  return prepare(
    `SELECT m.user_id, m.role, m.joined_at, m.contrib_coins, m.contrib_gems,
            u.display_name, u.level, u.gender,
            u.power, u.vitality, u.speed, u.guard, u.luck, u.race, u.class_id,
            u.heroes_json, u.upgrades_json, u.gear_json, u.last_seen_at
     FROM clan_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.clan_id = ?
     ORDER BY
       CASE m.role
         WHEN 'leader' THEN 0
         WHEN 'coleader' THEN 1
         WHEN 'warrior' THEN 2
         ELSE 3
       END,
       m.joined_at ASC`
  ).all(clanId);
}

function publicMember(row, { clanId = null, detailed = false } = {}) {
  let race = row.race || 'human';
  let classId = row.class_id || 'warrior';
  try {
    const h = parseHeroes(row);
    race = h.activeRace || race;
    classId = h.activeClass || classId;
  } catch {
    /* ignore */
  }
  const power = Math.round(memberPower(row));
  const role = row.role || 'member';
  const lastLabel = formatLastSeen(row.last_seen_at);
  const base = {
    userId: row.user_id,
    displayName: row.display_name,
    level: row.level || 1,
    role,
    roleLabel: ROLE_LABEL[role] || 'Member',
    gender: row.gender || 'boy',
    race,
    classId,
    power,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at || null,
    lastSeenLabel: lastLabel,
    online: lastLabel === 'Online',
    // Chest contributions — visible to whole clan
    contribCoins: row.contrib_coins || 0,
    contribGems: row.contrib_gems || 0,
  };
  if (clanId) {
    const part = participationFor(clanId, row.user_id);
    base.participatedDef = part.defended;
    base.participatedAtk = part.attacked;
  }
  if (detailed) {
    let gBonus = { ATK: 0, HP: 0, DEF: 0, SPD: 0 };
    try {
      gBonus = gearBonus(parseGear(row.gear_json));
    } catch {
      /* ignore */
    }
    base.stats = {
      ATK: (row.power || 10) + (gBonus.ATK || 0),
      HP: (row.vitality || 30) + (gBonus.HP || 0),
      DEF: (row.guard || 5) + (gBonus.DEF || 0),
      SPD: (row.speed || 10) + (gBonus.SPD || 0),
      LUK: row.luck || 5,
    };
  }
  return base;
}

function parseDefense(clan) {
  if (!clan?.defense_json) return null;
  try {
    return JSON.parse(clan.defense_json);
  } catch {
    return null;
  }
}

function defenseActive(clan) {
  if (!clan?.defense_until) return false;
  return new Date(clan.defense_until).getTime() > Date.now();
}

/**
 * Call often: finish expired defenses.
 * Held (not fully raided) → chest doubles and stays for next cycle.
 * Already raided shells just clear.
 */
export function tickClanDefenses() {
  ensureClanTables();
  const rows = prepare(
    `SELECT * FROM clans WHERE defense_until IS NOT NULL AND defense_until <= datetime('now')`
  ).all();
  let held = 0;
  for (const clan of rows) {
    const def = parseDefense(clan);
    if (!def || def.raided) {
      prepare(
        `UPDATE clans SET defense_json = NULL, defense_until = NULL, defense_started_at = NULL,
         updated_at = datetime('now') WHERE id = ?`
      ).run(clan.id);
      continue;
    }
    // Success: double remaining chest (stays in clan bank)
    const coins = Math.floor((clan.coins || 0) * 2);
    const gems = Math.floor((clan.gems || 0) * 2);
    prepare(
      `UPDATE clans SET
        coins = ?, gems = ?,
        defense_json = NULL, defense_until = NULL, defense_started_at = NULL,
        total_defenses_held = total_defenses_held + 1,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(coins, gems, clan.id);
    postSystemChat(
      clan.id,
      `Defense held! Chest doubled → 🪙${coins} · 💎${gems}`
    );
    held++;
  }
  return held;
}

/**
 * @param {{ includeMembers?: boolean, viewerUserId?: string|null, revealDefense?: boolean }} opts
 * Attackers never see defender hero makeup until a squad is mid-fight (revealDefense).
 */
export function publicClan(
  clan,
  { includeMembers = true, viewerUserId = null, revealDefense = false } = {}
) {
  if (!clan) return null;
  tickClanDefenses();
  const fresh = prepare(`SELECT * FROM clans WHERE id = ?`).get(clan.id) || clan;
  const settings = parseSettings(fresh);
  const def = parseDefense(fresh);
  const active = defenseActive(fresh);
  const viewerClan = viewerUserId ? getUserClanId(viewerUserId) : null;
  const isMember = !!(viewerClan && viewerClan === fresh.id);
  const viewerRole = isMember && viewerUserId ? roleOf(viewerUserId, fresh.id) : null;
  // Treat DB leader_id as Chief even if role row drifted
  const effectiveRole =
    isMember && viewerUserId && fresh.leader_id === viewerUserId
      ? 'leader'
      : viewerRole;
  const officer = isMember && canManageMembers(viewerUserId, fresh);
  // Officers get combat stats; all members see contrib + online + participation
  const detailed = officer;
  const war = getWarSchedule();

  const rawMembers = includeMembers ? membersOf(fresh.id) : [];
  const members = rawMembers.map((row) =>
    publicMember(row, { clanId: fresh.id, detailed: isMember && detailed })
  );

  let defensePublic = null;
  if (def) {
    const waves = def.waves || migrateLegacyStages(def);
    const wavesCleared = def.wavesCleared || 0;
    if (isMember || revealDefense) {
      defensePublic = {
        active,
        until: fresh.defense_until,
        startedAt: fresh.defense_started_at,
        waves,
        wavesCleared,
        waveCount: waves.length,
        powerTotal: def.powerTotal || waves.reduce((a, w) => a + wavePower(w), 0),
        raided: !!def.raided,
        seatsFilled: waves.reduce(
          (a, w) => a + (w.seats || []).filter(Boolean).length,
          0
        ),
        seatsTotal: waves.reduce((a, w) => a + (w.size || 0), 0),
      };
    } else {
      // Outsiders: progress only — no hero identities
      defensePublic = {
        active,
        until: fresh.defense_until,
        startedAt: fresh.defense_started_at,
        wavesCleared,
        waveCount: waves.length,
        waveSizes: waves.map((w) => w.size),
        powerTotal: null,
        raided: !!def.raided,
        seatsFilled: waves.reduce(
          (a, w) => a + (w.seats || []).filter(Boolean).length,
          0
        ),
        seatsTotal: waves.reduce((a, w) => a + (w.size || 0), 0),
      };
    }
  }

  let joinRequests = [];
  if (officer) {
    joinRequests = listPendingJoinRequests(fresh.id);
  }

  const publicMembers = isMember
    ? members
    : members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        role: m.role,
        roleLabel: m.roleLabel,
        level: m.level,
      }));

  // Even non-officers who are members see online/contrib/participation
  if (isMember && !detailed) {
    // members already have contrib + part from publicMember; ensure no stats leak
    for (const m of publicMembers) {
      delete m.stats;
    }
  }

  return {
    id: fresh.id,
    name: fresh.name,
    tag: fresh.tag,
    leaderId: fresh.leader_id,
    coins: Math.floor(fresh.coins || 0),
    gems: Math.floor(fresh.gems || 0),
    chestNote: fresh.chest_note || null,
    announcement: fresh.announcement || null,
    memberCount:
      members.length ||
      prepare(`SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ?`).get(fresh.id)
        .c,
    members: publicMembers,
    defense: defensePublic,
    war,
    stats: {
      raidsWon: fresh.total_raids_won || 0,
      defensesHeld: fresh.total_defenses_held || 0,
    },
    settings: isMember
      ? settings
      : { minLevel: settings.minLevel, autoAccept: settings.autoAccept },
    myRole: effectiveRole,
    myRoleLabel: effectiveRole ? ROLE_LABEL[effectiveRole] || 'Member' : null,
    permissions: isMember
      ? {
          kick: canManageMembers(viewerUserId, fresh),
          promote: canPromote(viewerUserId, fresh),
          editSettings: canEditSettings(viewerUserId, fresh),
          manageJoins: canManageMembers(viewerUserId, fresh),
          transfer: canPromote(viewerUserId, fresh),
          // Pin is Chief-only (not Co-leader)
          announce: canEditSettings(viewerUserId, fresh),
        }
      : null,
    joinRequests: officer ? joinRequests : undefined,
    maxMembers: MAX_CLAN_MEMBERS,
    waveSizes: DEF_WAVE_SIZES,
    roleLabels: ROLE_LABEL,
    chestHint:
      'Chest fills when members play (~25% chance +1 🪙 or 💎 per pit/campaign win). Defend to double. Raid takes 2/3.',
    createdAt: fresh.created_at,
  };
}

function listPendingJoinRequests(clanId) {
  return prepare(
    `SELECT id, user_id, display_name, level, created_at
     FROM clan_join_requests
     WHERE clan_id = ? AND status = 'pending'
     ORDER BY created_at ASC`
  )
    .all(clanId)
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name || 'Player',
      level: r.level || 1,
      at: r.created_at,
    }));
}

function migrateLegacyStages(def) {
  if (def.waves?.length) return def.waves;
  // Old single-defender stages → one hero per wave padded into new layout
  const stages = def.stages || [];
  const waves = emptyDefenseWaves();
  for (let i = 0; i < waves.length && i < stages.length; i++) {
    const s = stages[i];
    waves[i].seats[0] = {
      userId: s.defenderUserId,
      name: s.name,
      power: s.power,
      gender: s.gender || 'boy',
      race: s.race || 'human',
      classId: s.classId || 'warrior',
      level: s.level || 1,
    };
    waves[i] = recomputeWaveHp(waves[i], 1 + i * 0.08);
  }
  return waves;
}

export function listClans(limit = 40) {
  ensureClanTables();
  tickClanDefenses();
  const rows = prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM clan_members m WHERE m.clan_id = c.id) AS member_count
     FROM clans c
     ORDER BY c.updated_at DESC
     LIMIT ?`
  ).all(Math.min(80, limit));
  return rows.map((c) => {
    const settings = parseSettings(c);
    return {
      id: c.id,
      name: c.name,
      tag: c.tag,
      coins: Math.floor(c.coins || 0),
      gems: Math.floor(c.gems || 0),
      memberCount: c.member_count || 0,
      defenseActive: defenseActive(c),
      leaderId: c.leader_id,
      minLevel: settings.minLevel || 1,
      autoAccept: settings.autoAccept !== false,
    };
  });
}

export function createClan(userId, { name, tag } = {}) {
  ensureClanTables();
  assertNoClanCooldown(userId);
  const existing = getUserClanId(userId);
  if (existing) {
    throw Object.assign(new Error('Leave your current clan first'), { code: 'ALREADY_IN' });
  }
  const cleanName = String(name || '').trim().slice(0, MAX_NAME_LEN);
  const cleanTag = normTag(tag);
  if (cleanName.length < 2) {
    throw Object.assign(new Error('Clan name too short'), { code: 'BAD_NAME' });
  }
  if (cleanTag.length < MIN_TAG_LEN) {
    throw Object.assign(new Error(`Tag needs ${MIN_TAG_LEN}–${MAX_TAG_LEN} letters`), {
      code: 'BAD_TAG',
    });
  }
  const taken = prepare(`SELECT id FROM clans WHERE tag = ?`).get(cleanTag);
  if (taken) {
    throw Object.assign(new Error('Tag already taken'), { code: 'TAG_TAKEN' });
  }

  if (CREATE_COST_GEMS > 0) {
    applyLedger({
      userId,
      asset: 'GEM',
      delta: -CREATE_COST_GEMS,
      reason: 'clan_create',
    });
  }

  const id = nanoid(10);
  const settingsJson = JSON.stringify(defaultSettings());
  prepare(
    `INSERT INTO clans (id, name, tag, leader_id, settings_json) VALUES (?, ?, ?, ?, ?)`
  ).run(id, cleanName, cleanTag, userId, settingsJson);
  prepare(
    `INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, 'leader')`
  ).run(id, userId);
  setUserClan(userId, id);
  touchLastSeen(userId);
  postSystemChat(id, `Clan founded. ${ROLE_LABEL.leader} welcomes the crew.`);

  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(id);
  return {
    clan: publicClan(clan, { viewerUserId: userId }),
    balances: getBalances(userId),
    message: `Clan [${cleanTag}] ${cleanName} founded — you are Chief.`,
  };
}

function heroLevelOf(userId) {
  const u = getUser(userId);
  return Math.max(1, Number(u?.level) || 1);
}

function admitMember(clan, userId) {
  prepare(
    `INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, 'member')`
  ).run(clan.id, userId);
  setUserClan(userId, clan.id);
  prepare(`UPDATE clans SET updated_at = datetime('now') WHERE id = ?`).run(clan.id);
  // Clear any pending request
  try {
    prepare(
      `UPDATE clan_join_requests SET status = 'accepted' WHERE clan_id = ? AND user_id = ?`
    ).run(clan.id, userId);
  } catch {
    /* ignore */
  }
}

export function joinClan(userId, { clanId, tag } = {}) {
  ensureClanTables();
  assertNoClanCooldown(userId);
  if (getUserClanId(userId)) {
    throw Object.assign(new Error('Already in a clan — leave first'), { code: 'ALREADY_IN' });
  }
  let clan = null;
  if (clanId) clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!clan && tag) {
    clan = prepare(`SELECT * FROM clans WHERE tag = ?`).get(normTag(tag));
  }
  if (!clan) {
    throw Object.assign(new Error('Clan not found'), { code: 'NOT_FOUND' });
  }
  const count = prepare(`SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ?`).get(
    clan.id
  ).c;
  if (count >= MAX_CLAN_MEMBERS) {
    throw Object.assign(new Error('Clan is full'), { code: 'FULL' });
  }

  const settings = parseSettings(clan);
  const level = heroLevelOf(userId);
  if (level < (settings.minLevel || 1)) {
    throw Object.assign(
      new Error(`Need hero level ${settings.minLevel}+ to join this clan`),
      { code: 'LEVEL_GATE' }
    );
  }

  const u = getUser(userId);

  // Manual approval path
  if (settings.autoAccept === false) {
    const existing = prepare(
      `SELECT id, status FROM clan_join_requests WHERE clan_id = ? AND user_id = ?`
    ).get(clan.id, userId);
    if (existing?.status === 'pending') {
      return {
        clan: null,
        pending: true,
        message: `Join request to [${clan.tag}] already pending.`,
      };
    }
    const reqId = nanoid(12);
    if (existing) {
      prepare(
        `UPDATE clan_join_requests
         SET id = ?, display_name = ?, level = ?, status = 'pending', created_at = datetime('now')
         WHERE clan_id = ? AND user_id = ?`
      ).run(reqId, u?.display_name || 'Player', level, clan.id, userId);
    } else {
      prepare(
        `INSERT INTO clan_join_requests (id, clan_id, user_id, display_name, level, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      ).run(reqId, clan.id, userId, u?.display_name || 'Player', level);
    }
    return {
      clan: null,
      pending: true,
      message: `Request sent to [${clan.tag}] — Chief/Co-leader must approve.`,
    };
  }

  admitMember(clan, userId);
  touchLastSeen(userId);
  postSystemChat(clan.id, `${u?.display_name || 'Someone'} joined the clan.`);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clan.id), {
      viewerUserId: userId,
    }),
    message: `Joined [${clan.tag}] ${clan.name} as Member`,
  };
}

export function leaveClan(userId) {
  ensureClanTables();
  const clanId = getUserClanId(userId);
  if (!clanId) {
    throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  }
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  const mem = prepare(
    `SELECT * FROM clan_members WHERE user_id = ? AND clan_id = ?`
  ).get(userId, clanId);
  const count = prepare(
    `SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ?`
  ).get(clanId).c;
  // Chief must transfer leadership unless alone
  if (
    (mem?.role === 'leader' || clan?.leader_id === userId) &&
    count > 1
  ) {
    throw Object.assign(
      new Error('Transfer Chief to someone else before leaving'),
      { code: 'TRANSFER_REQUIRED' }
    );
  }
  const name = getUser(userId)?.display_name || 'Member';
  prepare(`DELETE FROM clan_members WHERE user_id = ?`).run(userId);
  setUserClan(userId, null);
  setClanCooldown(userId);

  const left = prepare(`SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ?`).get(
    clanId
  ).c;
  if (left === 0) {
    prepare(`DELETE FROM clans WHERE id = ?`).run(clanId);
    return { left: true, disbanded: true, message: 'Clan disbanded (last member left).' };
  }
  postSystemChat(clanId, `${name} left the clan.`);
  return { left: true, disbanded: false, message: 'Left clan.' };
}

/** Chief only: hand leadership to another member */
export function transferLeadership(actorId, { targetUserId } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!isLeader(actorId, clan)) {
    throw Object.assign(new Error('Only the Chief can transfer leadership'), {
      code: 'FORBIDDEN',
    });
  }
  if (!targetUserId || targetUserId === actorId) {
    throw Object.assign(new Error('Pick another member'), { code: 'BAD_TARGET' });
  }
  const target = prepare(
    `SELECT * FROM clan_members WHERE user_id = ? AND clan_id = ?`
  ).get(targetUserId, clanId);
  if (!target) {
    throw Object.assign(new Error('They are not in your clan'), { code: 'NOT_FOUND' });
  }
  prepare(
    `UPDATE clan_members SET role = 'coleader' WHERE user_id = ? AND clan_id = ?`
  ).run(actorId, clanId);
  prepare(
    `UPDATE clan_members SET role = 'leader' WHERE user_id = ? AND clan_id = ?`
  ).run(targetUserId, clanId);
  prepare(
    `UPDATE clans SET leader_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(targetUserId, clanId);
  const name =
    prepare(`SELECT display_name FROM users WHERE id = ?`).get(targetUserId)
      ?.display_name || 'Member';
  postSystemChat(clanId, `${name} is the new Chief.`);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    message: `Leadership transferred to ${name}. You are now Co-leader.`,
  };
}

/** Chief only: pinned announcement */
export function setClanAnnouncement(actorId, { text } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!canEditSettings(actorId, clan)) {
    throw Object.assign(new Error('Only the Chief can set the announcement'), {
      code: 'FORBIDDEN',
    });
  }
  const body = String(text || '').trim().slice(0, 400);
  prepare(
    `UPDATE clans SET announcement = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(body || null, clanId);
  if (body) postSystemChat(clanId, `Pinned: ${body}`);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    message: body ? 'Announcement pinned.' : 'Announcement cleared.',
  };
}

/**
 * Kick a member. Chief + Co-leader can kick.
 * Cannot kick the Chief. Co-leader cannot kick other co-leaders.
 */
export function kickMember(actorId, { targetUserId } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!canManageMembers(actorId, clan)) {
    throw Object.assign(new Error('Only Chief or Co-leader can kick'), {
      code: 'FORBIDDEN',
    });
  }
  if (!targetUserId || targetUserId === actorId) {
    throw Object.assign(new Error('Cannot kick yourself — use Leave'), {
      code: 'BAD_TARGET',
    });
  }
  if (clan.leader_id === targetUserId) {
    throw Object.assign(new Error('Cannot kick the Chief'), { code: 'FORBIDDEN' });
  }
  const target = prepare(
    `SELECT * FROM clan_members WHERE user_id = ? AND clan_id = ?`
  ).get(targetUserId, clanId);
  if (!target) {
    throw Object.assign(new Error('They are not in your clan'), { code: 'NOT_FOUND' });
  }
  // Co-leader cannot kick other co-leaders
  if (!isLeader(actorId, clan) && target.role === 'coleader') {
    throw Object.assign(new Error('Co-leaders cannot kick each other'), {
      code: 'FORBIDDEN',
    });
  }
  const name =
    prepare(`SELECT display_name FROM users WHERE id = ?`).get(targetUserId)
      ?.display_name || 'Member';
  prepare(`DELETE FROM clan_members WHERE user_id = ?`).run(targetUserId);
  setUserClan(targetUserId, null);
  setClanCooldown(targetUserId);
  prepare(`UPDATE clans SET updated_at = datetime('now') WHERE id = ?`).run(clanId);
  postSystemChat(clanId, `${name} was kicked.`);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    message: `Kicked ${name}.`,
  };
}

/**
 * Promote / demote. Chief only.
 * Roles: leader | coleader | warrior | member
 * Cannot change own role; only one Chief (transfer via leave/succession for now).
 */
export function setMemberRole(actorId, { targetUserId, role } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!canPromote(actorId, clan)) {
    throw Object.assign(new Error('Only the Chief can promote or demote'), {
      code: 'FORBIDDEN',
    });
  }
  const nextRole = String(role || '').toLowerCase();
  if (!['coleader', 'warrior', 'member'].includes(nextRole)) {
    throw Object.assign(
      new Error('Role must be coleader, warrior, or member'),
      { code: 'BAD_ROLE' }
    );
  }
  if (!targetUserId || targetUserId === actorId) {
    throw Object.assign(new Error('Cannot change your own rank here'), {
      code: 'BAD_TARGET',
    });
  }
  if (clan.leader_id === targetUserId) {
    throw Object.assign(new Error('Cannot demote the Chief'), { code: 'FORBIDDEN' });
  }
  const target = prepare(
    `SELECT * FROM clan_members WHERE user_id = ? AND clan_id = ?`
  ).get(targetUserId, clanId);
  if (!target) {
    throw Object.assign(new Error('They are not in your clan'), { code: 'NOT_FOUND' });
  }
  // Cap co-leaders at 2
  if (nextRole === 'coleader') {
    const n = prepare(
      `SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ? AND role = 'coleader'`
    ).get(clanId).c;
    if (target.role !== 'coleader' && n >= 2) {
      throw Object.assign(new Error('Max 2 Co-leaders'), { code: 'LIMIT' });
    }
  }
  prepare(`UPDATE clan_members SET role = ? WHERE user_id = ? AND clan_id = ?`).run(
    nextRole,
    targetUserId,
    clanId
  );
  prepare(`UPDATE clans SET updated_at = datetime('now') WHERE id = ?`).run(clanId);
  const name =
    prepare(`SELECT display_name FROM users WHERE id = ?`).get(targetUserId)
      ?.display_name || 'Member';
  postSystemChat(
    clanId,
    `${name} is now ${ROLE_LABEL[nextRole] || nextRole}.`
  );
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    message: `${name} is now ${ROLE_LABEL[nextRole] || nextRole}.`,
  };
}

/** Chief only: min level + auto-accept toggle */
export function updateClanSettings(actorId, { minLevel, autoAccept } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!canEditSettings(actorId, clan)) {
    throw Object.assign(new Error('Only the Chief can change clan settings'), {
      code: 'FORBIDDEN',
    });
  }
  const cur = parseSettings(clan);
  if (minLevel != null) {
    cur.minLevel = Math.min(100, Math.max(1, Math.floor(Number(minLevel) || 1)));
  }
  if (autoAccept != null) {
    cur.autoAccept = !!autoAccept;
  }
  prepare(
    `UPDATE clans SET settings_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(cur), clanId);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    settings: cur,
    message: `Settings saved · min lvl ${cur.minLevel} · ${
      cur.autoAccept ? 'auto-accept on' : 'approval required'
    }`,
  };
}

/** Chief / Co-leader: approve a pending join request */
export function approveJoinRequest(actorId, { requestId, userId } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!canManageMembers(actorId, clan)) {
    throw Object.assign(new Error('Only Chief or Co-leader can approve joins'), {
      code: 'FORBIDDEN',
    });
  }
  let req = null;
  if (requestId) {
    req = prepare(
      `SELECT * FROM clan_join_requests WHERE id = ? AND clan_id = ? AND status = 'pending'`
    ).get(requestId, clanId);
  } else if (userId) {
    req = prepare(
      `SELECT * FROM clan_join_requests WHERE user_id = ? AND clan_id = ? AND status = 'pending'`
    ).get(userId, clanId);
  }
  if (!req) {
    throw Object.assign(new Error('No pending request'), { code: 'NOT_FOUND' });
  }
  if (getUserClanId(req.user_id)) {
    prepare(
      `UPDATE clan_join_requests SET status = 'rejected' WHERE id = ?`
    ).run(req.id);
    throw Object.assign(new Error('They already joined another clan'), {
      code: 'ALREADY_IN',
    });
  }
  const count = prepare(`SELECT COUNT(*) AS c FROM clan_members WHERE clan_id = ?`).get(
    clanId
  ).c;
  if (count >= MAX_CLAN_MEMBERS) {
    throw Object.assign(new Error('Clan is full'), { code: 'FULL' });
  }
  const level = heroLevelOf(req.user_id);
  const settings = parseSettings(clan);
  if (level < (settings.minLevel || 1)) {
    throw Object.assign(
      new Error(`They are still below level ${settings.minLevel}`),
      { code: 'LEVEL_GATE' }
    );
  }
  admitMember(clan, req.user_id);
  const name = req.display_name || 'Member';
  postSystemChat(clanId, `${name} joined (approved).`);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    message: `Approved ${name}.`,
  };
}

/** Chief / Co-leader: reject a pending join request */
export function rejectJoinRequest(actorId, { requestId, userId } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(actorId);
  if (!clanId) throw Object.assign(new Error('Not in a clan'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!canManageMembers(actorId, clan)) {
    throw Object.assign(new Error('Only Chief or Co-leader can reject joins'), {
      code: 'FORBIDDEN',
    });
  }
  let req = null;
  if (requestId) {
    req = prepare(
      `SELECT * FROM clan_join_requests WHERE id = ? AND clan_id = ? AND status = 'pending'`
    ).get(requestId, clanId);
  } else if (userId) {
    req = prepare(
      `SELECT * FROM clan_join_requests WHERE user_id = ? AND clan_id = ? AND status = 'pending'`
    ).get(userId, clanId);
  }
  if (!req) {
    throw Object.assign(new Error('No pending request'), { code: 'NOT_FOUND' });
  }
  prepare(`UPDATE clan_join_requests SET status = 'rejected' WHERE id = ?`).run(req.id);
  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: actorId,
    }),
    message: `Rejected ${req.display_name || 'request'}.`,
  };
}

/**
 * @deprecated Manual deposit removed — chest fills from play contrib.
 * Kept so old clients get a clear message.
 */
export function depositToClan(_userId, _opts = {}) {
  throw Object.assign(
    new Error(
      'Chest fills when clan mates play (~25% chance). Manual deposits are off.'
    ),
    { code: 'NO_DEPOSIT' }
  );
}

/**
 * Open defense board for the current war cycle.
 * Seats claimable through the attack phase. Until = attack phase end.
 * Empty chest is allowed (still can defend / get doubles later as it fills).
 */
export function startDefense(userId, { hours } = {}) {
  ensureClanTables();
  tickClanDefenses();
  const war = getWarSchedule();
  if (!war.canOpenDefense) {
    throw Object.assign(new Error('Cannot open defense right now'), {
      code: 'WAR_PHASE',
    });
  }
  const clanId = getUserClanId(userId);
  if (!clanId) throw Object.assign(new Error('Join a clan first'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  const mem = prepare(
    `SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?`
  ).get(userId, clanId);
  if (!mem) throw Object.assign(new Error('Not a member'), { code: 'NO_CLAN' });
  if (defenseActive(clan)) {
    throw Object.assign(new Error('Defense already running this cycle'), {
      code: 'ALREADY',
    });
  }

  // Board stays up until end of attack day (ignore short client hours unless testing)
  let untilMs = new Date(war.attackEndsAt).getTime();
  if (hours != null && Number(hours) > 0 && Number(hours) < war.attackHours) {
    // allow short windows only when env uses short cycles / explicit override
    untilMs = Math.min(untilMs, Date.now() + Number(hours) * 3600 * 1000);
  }
  const until = new Date(untilMs).toISOString();
  let waves = emptyDefenseWaves().map((w, i) => recomputeWaveHp(w, 1 + i * 0.08));
  const hero = heroSnapshot(userId);
  if (hero) {
    waves[0].seats[0] = hero;
    waves[0] = recomputeWaveHp(waves[0], 1);
  }
  const defense = {
    waves,
    wavesCleared: 0,
    powerTotal: waves.reduce((a, w) => a + wavePower(w), 0),
    raided: false,
    startedBy: userId,
    warCycle: war.cycleIndex,
  };
  prepare(
    `UPDATE clans SET
      defense_json = ?,
      defense_until = ?,
      defense_started_at = datetime('now'),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(defense), until, clanId);

  postSystemChat(
    clanId,
    `Defense board open until attack day ends. Claim a seat!`
  );

  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: userId,
    }),
    message:
      war.phase === 'prep'
        ? `Defense board open — claim seats during prep. Raids open on attack day (${formatDuration(war.msLeft)} of prep left).`
        : `Defense board open — raids are live. Claim a seat!`,
    war,
  };
}

/** Claim one defense seat (one hero per member). Uses active equipped hero. */
export function claimDefendSeat(userId, { waveIndex = null } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(userId);
  if (!clanId) throw Object.assign(new Error('Join a clan first'), { code: 'NO_CLAN' });
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!defenseActive(clan)) {
    throw Object.assign(new Error('Start a defense first'), { code: 'NO_DEFENSE' });
  }
  const def = parseDefense(clan);
  let waves = def.waves || migrateLegacyStages(def);
  // Already seated?
  for (const w of waves) {
    if ((w.seats || []).some((s) => s && s.userId === userId)) {
      throw Object.assign(new Error('You already claimed a defense seat'), {
        code: 'ALREADY_SEATED',
      });
    }
  }
  const hero = heroSnapshot(userId);
  if (!hero) throw Object.assign(new Error('No hero'), { code: 'NO_HERO' });

  let placed = false;
  const tryWave = (wi) => {
    const w = waves[wi];
    if (!w) return false;
    const empty = (w.seats || []).findIndex((s) => !s);
    if (empty < 0) return false;
    w.seats[empty] = hero;
    waves[wi] = recomputeWaveHp(w, 1 + wi * 0.08);
    return true;
  };

  if (waveIndex != null && waveIndex >= 0) {
    placed = tryWave(Number(waveIndex));
  } else {
    for (let i = 0; i < waves.length && !placed; i++) placed = tryWave(i);
  }
  if (!placed) {
    throw Object.assign(new Error('No open defense seats'), { code: 'FULL' });
  }

  def.waves = waves;
  def.powerTotal = waves.reduce((a, w) => a + wavePower(w), 0);
  prepare(
    `UPDATE clans SET defense_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(def), clanId);

  return {
    clan: publicClan(prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId), {
      viewerUserId: userId,
    }),
    message: `Seated on defense as ${hero.race} ${hero.classId} (⚔${hero.power}).`,
  };
}

/**
 * Open a raid squad (1–3 seats). When full, auto-deploys against next defense wave.
 * Progressive: continues from wavesCleared. Partial damage carries (hpLeft).
 */
export function openRaidSquad(userId, { targetClanId, maxSize = 3 } = {}) {
  ensureClanTables();
  tickClanDefenses();
  const war = getWarSchedule();
  if (!war.canRaid) {
    throw Object.assign(
      new Error(
        `Raids only on attack day. ${war.label}`
      ),
      { code: 'PREP_PHASE' }
    );
  }
  const myClanId = getUserClanId(userId);
  if (!myClanId) throw Object.assign(new Error('Join a clan to raid'), { code: 'NO_CLAN' });
  if (!targetClanId || targetClanId === myClanId) {
    throw Object.assign(new Error('Pick another clan to raid'), { code: 'BAD_TARGET' });
  }
  const size = Math.min(3, Math.max(1, Number(maxSize) || 3));
  const target = prepare(`SELECT * FROM clans WHERE id = ?`).get(targetClanId);
  if (!target) throw Object.assign(new Error('Clan not found'), { code: 'NOT_FOUND' });
  if (!defenseActive(target)) {
    throw Object.assign(new Error('That clan is not defending right now'), {
      code: 'NO_DEFENSE',
    });
  }
  const tDef = parseDefense(target);
  if (tDef?.raided) {
    throw Object.assign(new Error('That chest was already raided this cycle'), {
      code: 'RAIDED',
    });
  }
  // One open seat per member across all filling squads
  const busy = prepare(
    `SELECT id, seats_json FROM clan_squads
     WHERE attacker_clan_id = ? AND status = 'filling'`
  ).all(myClanId);
  for (const s of busy) {
    const seats = JSON.parse(s.seats_json || '[]');
    if (seats.some((x) => x?.userId === userId)) {
      throw Object.assign(new Error('You are already in a filling squad'), {
        code: 'IN_SQUAD',
      });
    }
  }
  const hero = heroSnapshot(userId);
  if (!hero) throw Object.assign(new Error('No hero'), { code: 'NO_HERO' });
  const id = nanoid(12);
  const seats = [hero];
  prepare(
    `INSERT INTO clan_squads (
      id, attacker_clan_id, defender_clan_id, max_size, status, seats_json, created_by
    ) VALUES (?, ?, ?, ?, 'filling', ?, ?)`
  ).run(id, myClanId, targetClanId, size, JSON.stringify(seats), userId);

  let deployed = null;
  if (seats.length >= size) {
    deployed = deploySquad(id);
  }
  return {
    squad: publicSquad(id),
    deployed,
    message:
      seats.length >= size
        ? 'Squad full — deploying!'
        : `Squad open (${seats.length}/${size}). Clan mates can join.`,
  };
}

export function joinRaidSquad(userId, { squadId } = {}) {
  ensureClanTables();
  const myClanId = getUserClanId(userId);
  if (!myClanId) throw Object.assign(new Error('Join a clan first'), { code: 'NO_CLAN' });
  const row = prepare(`SELECT * FROM clan_squads WHERE id = ?`).get(squadId);
  if (!row || row.status !== 'filling') {
    throw Object.assign(new Error('Squad not open'), { code: 'CLOSED' });
  }
  if (row.attacker_clan_id !== myClanId) {
    throw Object.assign(new Error('Not your clan squad'), { code: 'WRONG_CLAN' });
  }
  const seats = JSON.parse(row.seats_json || '[]');
  if (seats.some((s) => s?.userId === userId)) {
    throw Object.assign(new Error('Already in this squad'), { code: 'ALREADY' });
  }
  // Only one attack seat per member total
  const other = prepare(
    `SELECT id, seats_json FROM clan_squads WHERE attacker_clan_id = ? AND status = 'filling' AND id != ?`
  ).all(myClanId, squadId);
  for (const s of other) {
    const ss = JSON.parse(s.seats_json || '[]');
    if (ss.some((x) => x?.userId === userId)) {
      throw Object.assign(new Error('Leave your other squad first'), { code: 'BUSY' });
    }
  }
  if (seats.length >= row.max_size) {
    throw Object.assign(new Error('Squad full'), { code: 'FULL' });
  }
  const hero = heroSnapshot(userId);
  if (!hero) throw Object.assign(new Error('No hero'), { code: 'NO_HERO' });
  seats.push(hero);
  prepare(
    `UPDATE clan_squads SET seats_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(seats), squadId);

  let deployed = null;
  if (seats.length >= row.max_size) {
    deployed = deploySquad(squadId);
  }
  return {
    squad: publicSquad(squadId),
    deployed,
    message:
      seats.length >= row.max_size
        ? 'Squad full — deploying!'
        : `Joined (${seats.length}/${row.max_size}).`,
  };
}

export function listOpenSquads(userId, { targetClanId } = {}) {
  ensureClanTables();
  const myClanId = getUserClanId(userId);
  if (!myClanId) return { squads: [] };
  let rows;
  if (targetClanId) {
    rows = prepare(
      `SELECT * FROM clan_squads
       WHERE attacker_clan_id = ? AND defender_clan_id = ? AND status = 'filling'
       ORDER BY created_at ASC`
    ).all(myClanId, targetClanId);
  } else {
    rows = prepare(
      `SELECT * FROM clan_squads
       WHERE attacker_clan_id = ? AND status = 'filling'
       ORDER BY created_at ASC`
    ).all(myClanId);
  }
  return { squads: rows.map((r) => publicSquad(r.id)) };
}

function publicSquad(squadId) {
  const row = prepare(`SELECT * FROM clan_squads WHERE id = ?`).get(squadId);
  if (!row) return null;
  const seats = JSON.parse(row.seats_json || '[]');
  return {
    id: row.id,
    attackerClanId: row.attacker_clan_id,
    defenderClanId: row.defender_clan_id,
    maxSize: row.max_size,
    status: row.status,
    seats,
    seatsFilled: seats.length,
    createdBy: row.created_by,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  };
}

/** Resolve a full (or force-launch) squad against the next defense wave(s). */
export function deploySquad(squadId) {
  ensureClanTables();
  tickClanDefenses();
  const row = prepare(`SELECT * FROM clan_squads WHERE id = ?`).get(squadId);
  if (!row) throw Object.assign(new Error('Squad missing'), { code: 'NOT_FOUND' });
  if (row.status !== 'filling' && row.status !== 'ready') {
    throw Object.assign(new Error('Squad already fought'), { code: 'DONE' });
  }
  const seats = JSON.parse(row.seats_json || '[]');
  if (!seats.length) {
    throw Object.assign(new Error('Empty squad'), { code: 'EMPTY' });
  }

  const target = prepare(`SELECT * FROM clans WHERE id = ?`).get(row.defender_clan_id);
  if (!target || !defenseActive(target)) {
    prepare(
      `UPDATE clan_squads SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`
    ).run(squadId);
    throw Object.assign(new Error('Defense ended'), { code: 'NO_DEFENSE' });
  }
  const def = parseDefense(target);
  let waves = def.waves || migrateLegacyStages(def);
  let cleared = def.wavesCleared || 0;
  const total = waves.length;
  const seed = hashSeed(`${squadId}:${cleared}:${Date.now()}`);
  const rand = mulberry32(seed);
  let party = seats.reduce((a, s) => a + (s.power || 10), 0);
  const log = [];
  let startWave = cleared;

  // Fight consecutive waves while party holds
  while (cleared < total && party > 0) {
    let wave = waves[cleared];
    const scale = 1 + cleared * 0.08;
    wave = recomputeWaveHp(wave, scale);
    const need = wave.hpLeft != null ? wave.hpLeft : wave.maxHp || wavePower(wave);
    const swing = 0.88 + rand() * 0.3;
    const atk = party * swing;
    const dmg = Math.round(atk * (0.55 + rand() * 0.35));
    const remaining = Math.max(0, need - dmg);
    const won = remaining <= 0;
    log.push({
      wave: wave.wave,
      size: wave.size,
      defenders: (wave.seats || []).filter(Boolean).map((s) => s.name),
      attackRoll: Math.round(atk),
      dmg,
      need: Math.round(need),
      remaining,
      won,
    });
    if (won) {
      wave.hpLeft = 0;
      waves[cleared] = wave;
      cleared++;
      party *= 0.9; // fatigue into next wave
    } else {
      wave.hpLeft = remaining; // damage carries for next squad
      waves[cleared] = wave;
      break;
    }
  }

  const victory = cleared >= total;
  let lootCoins = 0;
  let lootGems = 0;
  const raidId = nanoid(12);

  def.waves = waves;
  def.wavesCleared = cleared;
  def.powerTotal = waves.reduce((a, w) => a + wavePower(w), 0);

  let defenderKeepCoins = 0;
  let defenderKeepGems = 0;
  if (victory) {
    const totalCoins = Math.floor(target.coins || 0);
    const totalGems = Math.floor(target.gems || 0);
    // Attackers steal 2/3; defenders keep 1/3 — both split to whole clans
    lootCoins = Math.floor((totalCoins * 2) / 3);
    lootGems = Math.floor((totalGems * 2) / 3);
    defenderKeepCoins = totalCoins - lootCoins;
    defenderKeepGems = totalGems - lootGems;

    prepare(
      `UPDATE clans SET
        coins = 0, gems = 0,
        defense_json = ?,
        defense_until = NULL,
        defense_started_at = NULL,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      JSON.stringify({ ...def, raided: true, raidedBy: row.attacker_clan_id }),
      target.id
    );

    splitToClanMembers(
      row.attacker_clan_id,
      lootCoins,
      lootGems,
      'clan_raid_loot',
      raidId
    );
    splitToClanMembers(
      target.id,
      defenderKeepCoins,
      defenderKeepGems,
      'clan_raid_remain',
      raidId
    );

    prepare(
      `UPDATE clans SET total_raids_won = total_raids_won + 1, updated_at = datetime('now') WHERE id = ?`
    ).run(row.attacker_clan_id);

    postSystemChat(
      row.attacker_clan_id,
      `Raided [${target.tag}]! Clan split 🪙${lootCoins} · 💎${lootGems} (2/3).`
    );
    postSystemChat(
      target.id,
      `Chest raided by rivals. Clan kept 🪙${defenderKeepCoins} · 💎${defenderKeepGems} (1/3).`
    );
  } else {
    prepare(
      `UPDATE clans SET defense_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(def), target.id);
  }

  const result = {
    victory,
    wavesCleared: cleared,
    wavesTotal: total,
    wavesGained: Math.max(0, cleared - startWave),
    attackPower: Math.round(seats.reduce((a, s) => a + (s.power || 0), 0)),
    log,
    loot: { coins: lootCoins, gems: lootGems },
    defenderKeep: { coins: defenderKeepCoins, gems: defenderKeepGems },
    targetTag: target.tag,
    targetName: target.name,
    damageCarried: !victory && waves[cleared] ? waves[cleared].hpLeft : 0,
  };

  prepare(
    `UPDATE clan_squads SET status = ?, result_json = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(victory ? 'won' : 'fought', JSON.stringify(result), squadId);

  prepare(
    `INSERT INTO clan_raids (
      id, attacker_clan_id, defender_clan_id, attacker_user_id, status,
      stages_cleared, stages_total, loot_coins, loot_gems, result_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    raidId,
    row.attacker_clan_id,
    target.id,
    row.created_by,
    victory ? 'won' : 'failed',
    cleared,
    total,
    lootCoins,
    lootGems,
    JSON.stringify(result)
  );

  return {
    raidId,
    result,
    squad: publicSquad(squadId),
    message: victory
      ? `Tower fallen! Your clan split 2/3 → 🪙${lootCoins} · 💎${lootGems}. Defenders kept 1/3.`
      : cleared > startWave
        ? `Pushed to wave ${cleared}/${total}. Damage sticks — next squad continues.`
        : `Held at wave ${cleared + 1}/${total}. Chip the HP or bring a bigger squad.`,
  };
}

/** Legacy one-shot raid: opens a 3-squad with you and deploys if size 1, else fillable */
export function raidClan(userId, { targetClanId, maxSize = 1 } = {}) {
  const opened = openRaidSquad(userId, {
    targetClanId,
    maxSize: Math.min(3, Math.max(1, Number(maxSize) || 1)),
  });
  if (opened.deployed) {
    return {
      raidId: opened.deployed.raidId,
      result: opened.deployed.result,
      myClan: getMyClan(userId).clan,
      targetClan: publicClan(
        prepare(`SELECT * FROM clans WHERE id = ?`).get(targetClanId),
        { viewerUserId: userId }
      ),
      balances: getBalances(userId),
      message: opened.deployed.message,
      squad: opened.squad,
    };
  }
  return {
    raidId: null,
    result: null,
    myClan: getMyClan(userId).clan,
    targetClan: publicClan(
      prepare(`SELECT * FROM clans WHERE id = ?`).get(targetClanId),
      { viewerUserId: userId }
    ),
    balances: getBalances(userId),
    message: opened.message,
    squad: opened.squad,
  };
}

export function getMyClan(userId) {
  ensureClanTables();
  tickClanDefenses();
  const clanId = getUserClanId(userId);
  if (!clanId) return { clan: null };
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  const chat = getClanChat(userId, { limit: 40 });
  const squads = listOpenSquads(userId);
  return {
    clan: publicClan(clan, { viewerUserId: userId }),
    chat: chat.messages,
    openSquads: squads.squads,
  };
}

export function getClan(clanId, viewerUserId = null) {
  ensureClanTables();
  tickClanDefenses();
  const clan = prepare(`SELECT * FROM clans WHERE id = ?`).get(clanId);
  if (!clan) return null;
  return publicClan(clan, { viewerUserId });
}

export function postClanChat(userId, { body } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(userId);
  if (!clanId) throw Object.assign(new Error('Join a clan first'), { code: 'NO_CLAN' });
  const text = String(body || '').trim().slice(0, 280);
  if (text.length < 1) {
    throw Object.assign(new Error('Message empty'), { code: 'EMPTY' });
  }
  const u = getUser(userId);
  const id = nanoid(12);
  prepare(
    `INSERT INTO clan_chat (id, clan_id, user_id, display_name, body) VALUES (?, ?, ?, ?, ?)`
  ).run(id, clanId, userId, u?.display_name || 'Member', text);
  return getClanChat(userId, { limit: 50 });
}

export function getClanChat(userId, { limit = 50 } = {}) {
  ensureClanTables();
  const clanId = getUserClanId(userId);
  if (!clanId) return { messages: [] };
  const rows = prepare(
    `SELECT id, user_id, display_name, body, created_at
     FROM clan_chat WHERE clan_id = ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(clanId, Math.min(100, limit));
  return {
    messages: rows.reverse().map((r) => ({
      id: r.id,
      userId: r.user_id,
      displayName: r.display_name,
      body: r.body,
      at: r.created_at,
      system: r.user_id === 'system',
    })),
  };
}

/** Map of userId -> clanId for a set of users (pit ally lookup) */
export function clanIdsForUsers(userIds) {
  ensureClanTables();
  const map = {};
  for (const id of userIds) {
    if (!id) continue;
    map[id] = getUserClanId(id);
  }
  return map;
}
