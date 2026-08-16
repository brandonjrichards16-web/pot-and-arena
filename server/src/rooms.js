import { nanoid } from 'nanoid';
import { prepare, transaction } from './db.js';
import { applyLedger, getBalances } from './ledger.js';
import { pickPotWinner, pickWeightedPotWinner, resolveArena } from './combat.js';
import { parseHeroes, normalizeRace, RACE_IDS } from './heroes.js';
import { getUserClanId, maybeClanChestContrib } from './clans.js';
import { fillRestWithHouse, addHouseTickets, isBotUser } from './bots.js';
import { tryRewardInvite } from './invites.js';
import { getUserRank } from './leaderboards.js';
import { parseRoadBonus } from './campaignStory.js';
import {
  rollGearDrop,
  pitShouldDrop,
  grantGearToUser,
  parseGear,
  applyGearBonus,
} from './gear.js';

/** @deprecated coins no longer buy tickets — use ad_skip_tickets from IAP */
export const EXTRA_TICKET_COIN_COST = 0;

/** Stable full-string hash (bots are house_1001… — first char alone is useless). */
function hashStr(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const ROOM_TEMPLATES = [
  {
    key: 'free_quick',
    title: 'Free Quick',
    n: 10,
    entry_type: 'FREE',
    stake: 0,
    ads_per_ticket: 0,
    coin_per_ticket: 1,
    rake: 0,
    max_level: 50,
    allows_house: 1,
    // Every seat is a lottery ticket (House can win). Humans-only = always-win solo.
    pot_humans_only: 0,
  },
  {
    key: 'ad_pot_10',
    title: 'Ad Pot 10',
    n: 10,
    entry_type: 'AD',
    stake: 0,
    ads_per_ticket: 1,
    coin_per_ticket: 1,
    rake: 0.05,
    max_level: 50,
    allows_house: 1,
    pot_humans_only: 0,
  },
  {
    key: 'ad_pot_25',
    title: 'Ad Pot 25',
    n: 25,
    entry_type: 'AD',
    stake: 0,
    ads_per_ticket: 1,
    coin_per_ticket: 1,
    rake: 0.05,
    max_level: 50,
    allows_house: 1,
    pot_humans_only: 0,
  },
  {
    key: 'coin_stakes_10',
    title: 'Coin Stakes 10',
    n: 10,
    entry_type: 'COIN',
    stake: 5,
    ads_per_ticket: 0,
    coin_per_ticket: 0,
    rake: 0.1,
    max_level: 50,
    allows_house: 0,
    pot_humans_only: 1,
  },
  {
    key: 'gem_arena_10',
    title: 'Gem Arena 10',
    n: 10,
    entry_type: 'GEM',
    stake: 2,
    ads_per_ticket: 0,
    coin_per_ticket: 0,
    rake: 0.1,
    max_level: 50,
    allows_house: 0,
    pot_humans_only: 1,
  },
];

export const HOUSE_DISCLAIMER =
  'House fighters fill empty seats so rooms can start. Every seat is a real lottery ticket — House can win the pot. Stake rooms stay humans only.';

/** Allowed host “ads per ticket” choices (build-your-own). */
export const ADS_PER_TICKET_OPTIONS = [1, 2, 3, 5, 10];

/**
 * Pot multiplier from ads-per-ticket.
 * 1 ad = 1× pot, 3 ads = 3× pot, 10 ads = 10× pot.
 * Legacy FREE rooms with ads_per_ticket=0 still pay 1×.
 */
export function potAdMultiplier(room) {
  const a = Number(room?.ads_per_ticket);
  if (!Number.isFinite(a) || a <= 0) return 1;
  return Math.min(10, Math.max(1, Math.floor(a)));
}

/** Ads (or skip tickets) required to buy one seat in this room. */
export function adsRequiredPerTicket(room) {
  if (!room) return 0;
  if (room.entry_type === 'COIN' || room.entry_type === 'GEM') return 0;
  const a = Number(room.ads_per_ticket);
  if (Number.isFinite(a) && a > 0) return Math.min(10, Math.max(1, Math.floor(a)));
  // Legacy FREE (0 ads) still allows mock “free” entry as 0 required ads
  if (room.entry_type === 'FREE') return 0;
  return 1;
}

function expiresInHours(h = 24) {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}

export function createRoomFromTemplate(templateKey, opts = {}) {
  const t = ROOM_TEMPLATES.find((x) => x.key === templateKey);
  if (!t) throw new Error('Unknown template');

  const id = nanoid(10);
  prepare(
    `INSERT INTO rooms (
      id, title, status, n, entry_type, stake, ads_per_ticket, coin_per_ticket,
      rake, max_level, allows_house, pot_humans_only, team_split_enabled, expires_at
    ) VALUES (?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    opts.title || t.title,
    t.n,
    t.entry_type,
    t.stake,
    t.ads_per_ticket,
    t.coin_per_ticket,
    t.rake,
    opts.max_level ?? t.max_level,
    t.allows_house,
    t.pot_humans_only,
    expiresInHours(24)
  );
  return getRoom(id);
}

export function getRoom(id) {
  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(id);
  if (!room) return null;
  const tickets = prepare(
    `SELECT t.*, u.display_name, u.is_bot AS user_is_bot, u.gender
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.room_id = ? ORDER BY t.ticket_number`
  ).all(id);
  const humans = tickets.filter((t) => !t.is_bot).length;
  const house = tickets.filter((t) => t.is_bot).length;
  let replay = null;
  if (room.replay_json) {
    try {
      replay = JSON.parse(room.replay_json);
    } catch {
      replay = null;
    }
  }
  const adMult = potAdMultiplier(room);
  const adsNeed = adsRequiredPerTicket(room);
  const potEstimate =
    room.entry_type === 'GEM' || room.entry_type === 'COIN'
      ? room.n * room.stake * (1 - (room.rake || 0))
      : room.n * (room.coin_per_ticket || 1) * adMult * (1 - (room.rake || 0));

  return {
    ...room,
    tickets,
    human_tickets: humans,
    house_tickets: house,
    allows_house: !!room.allows_house,
    pot_humans_only: !!room.pot_humans_only,
    adsPerTicket: adMult,
    adsRequired: adsNeed,
    potEstimate: Math.round(potEstimate),
    disclaimer: room.allows_house ? HOUSE_DISCLAIMER : 'Humans only — no House fighters.',
    replay,
  };
}

export function listOpenRooms() {
  try {
    cancelExpiredRooms();
  } catch {
    /* ignore */
  }
  return prepare(
    `SELECT id, title, status, n, entry_type, stake, ads_per_ticket,
            tickets_sold, max_level, allows_house, pot_humans_only,
            expires_at, created_at
     FROM rooms
     WHERE status IN ('OPEN', 'FILLING')
       AND tickets_sold < n
     ORDER BY
       CASE WHEN tickets_sold > 0 THEN 0 ELSE 1 END,
       CASE WHEN status = 'FILLING' THEN 0 ELSE 1 END,
       tickets_sold DESC,
       created_at DESC
     LIMIT 50`
  )
    .all()
    .map((r) => {
      const seatsLeft = Math.max(0, r.n - (r.tickets_sold || 0));
      return {
        ...r,
        allows_house: !!r.allows_house,
        pot_humans_only: !!r.pot_humans_only,
        seatsLeft,
        disclaimer: r.allows_house ? HOUSE_DISCLAIMER : 'Humans only.',
      };
    });
}

export function myRooms(userId) {
  return prepare(
    `SELECT r.id, r.title, r.status, r.n, r.entry_type, r.stake, r.tickets_sold,
            r.pot_winner_ticket_id, r.arena_winner_user_id, r.resolved_at,
            r.allows_house, r.pot_humans_only, r.updated_at, r.created_at,
            COUNT(t.id) AS my_tickets
     FROM rooms r
     JOIN tickets t ON t.room_id = r.id
     WHERE t.user_id = ?
     GROUP BY r.id
     ORDER BY r.updated_at DESC
     LIMIT 40`
  )
    .all(userId)
    .map((r) => ({
      ...r,
      allows_house: !!r.allows_house,
      pot_humans_only: !!r.pot_humans_only,
      waiting: ['OPEN', 'FILLING'].includes(r.status),
      ready: r.status === 'COMPLETE',
    }));
}

/** Open human-only stake rooms (Betting Pit lobby). */
export function listBettingRooms() {
  try {
    cancelExpiredRooms();
  } catch {
    /* ignore */
  }
  return prepare(
    `SELECT id, title, status, n, entry_type, stake, ads_per_ticket,
            tickets_sold, max_level, allows_house, pot_humans_only,
            expires_at, created_at, updated_at
     FROM rooms
     WHERE status IN ('OPEN', 'FILLING')
       AND allows_house = 0
       AND entry_type IN ('COIN', 'GEM')
       AND tickets_sold < n
     ORDER BY
       CASE WHEN tickets_sold > 0 THEN 0 ELSE 1 END,
       CASE WHEN status = 'FILLING' THEN 0 ELSE 1 END,
       tickets_sold DESC,
       created_at DESC
     LIMIT 60`
  )
    .all()
    .map((r) => {
      const seatsLeft = Math.max(0, r.n - (r.tickets_sold || 0));
      return {
        ...r,
        allows_house: false,
        pot_humans_only: true,
        seatsLeft,
        humansOnly: true,
        potEstimate: Math.round(r.n * r.stake * (1 - 0.1)),
        stakeLabel:
          r.entry_type === 'GEM'
            ? `${r.stake} 💎`
            : `${r.stake} 🪙`,
        disclaimer: 'Humans only — real players bet, no House fill.',
      };
    });
}

/**
 * Create a humans-only betting room (coins or gems).
 * Caller should auto-join the host after.
 */
export function createBettingRoom({
  hostUser,
  n = 2,
  stake = 5,
  currency = 'GEM', // GEM | COIN
}) {
  const maxCreateN = (() => {
    try {
      const j = JSON.parse(hostUser.room_unlocks_json || '{}');
      return Math.max(2, Number(j.maxCreateN) || 5);
    } catch {
      return 5;
    }
  })();

  let size = Math.min(50, Math.max(2, Math.floor(Number(n) || 2)));
  // Betting pits stay small so friends can fill them
  if (size > maxCreateN) size = maxCreateN;
  size = Math.min(size, 10);

  const entry = currency === 'COIN' ? 'COIN' : 'GEM';
  const stakeAmt = Math.max(1, Math.min(500, Math.floor(Number(stake) || 5)));
  const rake = 0.1;
  const id = nanoid(10);
  const title =
    entry === 'GEM'
      ? `Bet · ${size} seats · ${stakeAmt}💎`
      : `Bet · ${size} seats · ${stakeAmt}🪙`;
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  prepare(
    `INSERT INTO rooms (
      id, title, status, n, entry_type, stake, ads_per_ticket, coin_per_ticket,
      rake, max_level, allows_house, pot_humans_only, team_split_enabled, expires_at
    ) VALUES (?, ?, 'OPEN', ?, ?, ?, 0, 0, ?, 50, 0, 1, 0, ?)`
  ).run(id, title, size, entry, stakeAmt, rake, expires);

  return getRoom(id);
}

export function joinRoom(
  roomId,
  user,
  { mockAd = false, useSkipTicket = false, adsWatched = 0 } = {}
) {
  if (isBotUser(user)) throw new Error('Bots cannot use join API');

  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room) {
    const e = new Error('Room not found');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (!['OPEN', 'FILLING'].includes(room.status)) {
    const e = new Error('Room not open');
    e.code = 'CLOSED';
    throw e;
  }
  if (room.tickets_sold >= room.n) {
    const e = new Error('Room full');
    e.code = 'FULL';
    throw e;
  }
  if (user.level > room.max_level) {
    const e = new Error(`Max level for this room is ${room.max_level}`);
    e.code = 'LEVEL';
    throw e;
  }

  const rankBefore = getUserRank('fame', 'weekly', user.id);
  prepare(`UPDATE users SET prev_weekly_fame_rank = ? WHERE id = ?`).run(
    rankBefore.rank,
    user.id
  );

  const alreadyIn = prepare(
    `SELECT COUNT(*) AS c FROM tickets WHERE room_id = ? AND user_id = ? AND is_bot = 0`
  ).get(roomId, user.id).c;

  // Stake tables: one seat per human (no multi-ticket spam)
  if (alreadyIn > 0 && (room.entry_type === 'COIN' || room.entry_type === 'GEM')) {
    const e = new Error('You’re already seated at this table.');
    e.code = 'ALREADY_IN';
    throw e;
  }

  const skips =
    prepare(`SELECT ad_skip_tickets FROM users WHERE id = ?`).get(user.id)
      ?.ad_skip_tickets || 0;
  let usedSkip = false;
  let skipsUsed = 0;
  const needAds = adsRequiredPerTicket(room);

  if (room.entry_type === 'COIN') {
    applyLedger({
      userId: user.id,
      asset: 'COIN',
      delta: -room.stake,
      reason: 'stake_escrow',
      refType: 'room',
      refId: roomId,
    });
  } else if (room.entry_type === 'GEM') {
    applyLedger({
      userId: user.id,
      asset: 'GEM',
      delta: -room.stake,
      reason: 'stake_escrow',
      refType: 'room',
      refId: roomId,
    });
  } else {
    // FREE / AD: each ticket costs ads_per_ticket ads (or that many skip tickets).
    // Buying a 2nd ticket requires the full ad set again.
    if (useSkipTicket) {
      const needSkips = Math.max(1, needAds || 1);
      if (skips < needSkips) {
        const e = new Error(
          needSkips > 1
            ? `Need ${needSkips} ad-skips for one ticket in this pit (you have ${skips}).`
            : 'No ad-skip tickets. Watch ads, or buy skips in the shop.'
        );
        e.code = 'NO_SKIPS';
        throw e;
      }
      prepare(
        `UPDATE users SET ad_skip_tickets = ad_skip_tickets - ? WHERE id = ? AND ad_skip_tickets >= ?`
      ).run(needSkips, user.id, needSkips);
      usedSkip = true;
      skipsUsed = needSkips;
    } else if (needAds <= 0) {
      // Legacy free entry (0 ads)
    } else {
      // mockAd alone is not enough for multi-ad rooms — need adsWatched count
      const watched = Math.max(
        0,
        Number(adsWatched) || (mockAd && needAds <= 1 ? 1 : 0)
      );
      if (watched < needAds) {
        const e = new Error(
          needAds === 1
            ? 'Ad completion required (or use a skip ticket)'
            : `This pit needs ${needAds} ads per ticket (you sent ${watched}). Watch all ads, then claim the ticket.`
        );
        e.code = 'AD_REQUIRED';
        e.adsRequired = needAds;
        e.adsWatched = watched;
        throw e;
      }
    }
  }

  const ticketNumber = room.tickets_sold + 1;
  const ticketId = nanoid(12);
  const isFirstHuman =
    prepare(
      `SELECT COUNT(*) AS c FROM tickets WHERE room_id = ? AND is_bot = 0`
    ).get(roomId).c === 0;

  const tx = transaction(() => {
    prepare(
      `INSERT INTO tickets (id, room_id, user_id, team_id, is_bot, ticket_number, weight)
       VALUES (?, ?, ?, ?, 0, ?, 1)`
    ).run(ticketId, roomId, user.id, user.team_id || null, ticketNumber);

    const sold = ticketNumber;
    const status = sold >= room.n ? 'FULL' : 'FILLING';
    if (isFirstHuman) {
      prepare(
        `UPDATE rooms SET tickets_sold = ?, status = ?, first_human_at = datetime('now'),
         updated_at = datetime('now') WHERE id = ?`
      ).run(sold, status, roomId);
    } else {
      prepare(
        `UPDATE rooms SET tickets_sold = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(sold, status, roomId);
    }
  });
  tx();

  if (ticketNumber >= room.n) {
    resolveRoom(roomId);
  }

  const skipsLeft =
    prepare(`SELECT ad_skip_tickets FROM users WHERE id = ?`).get(user.id)
      ?.ad_skip_tickets || 0;

  return {
    ticketId,
    ticketNumber,
    room: getRoom(roomId),
    balances: getBalances(user.id),
    disclaimer: HOUSE_DISCLAIMER,
    usedSkip,
    skipsUsed,
    adsRequired: needAds,
    adSkipTickets: skipsLeft,
    myTickets: alreadyIn + 1,
  };
}

/** Add House seats (batch) — fill-tension UI or fast fill. */
export function dripHouse(roomId, count = 1) {
  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room) {
    const e = new Error('Room not found');
    e.code = 'NOT_FOUND';
    throw e;
  }
  // Already done — idempotent so client retries don't die mid-fill
  if (room.status === 'COMPLETE') return getRoom(roomId);
  if (room.status === 'RESOLVING') {
    // Waiter: try finish resolve if stuck
    try {
      return resolveRoom(roomId);
    } catch {
      return getRoom(roomId);
    }
  }
  if (!['OPEN', 'FILLING', 'FULL'].includes(room.status)) {
    const e = new Error(`Room not open (${room.status})`);
    e.code = 'CLOSED';
    throw e;
  }
  if (!room.allows_house) {
    const e = new Error('No House in this room');
    e.code = 'NO_HOUSE';
    throw e;
  }
  if (room.status === 'FULL' || room.tickets_sold >= room.n) {
    return resolveRoom(roomId);
  }
  const left = room.n - room.tickets_sold;
  const n = Math.min(Math.max(1, Number(count) || 1), left);
  if (n > 0) addHouseTickets(roomId, n);
  const updated = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (updated.tickets_sold >= updated.n) {
    return resolveRoom(roomId);
  }
  return getRoom(roomId);
}

export function resolveRoom(roomId) {
  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room) return null;
  if (room.status === 'COMPLETE' || room.status === 'CANCELLED') return getRoom(roomId);
  if (room.tickets_sold < room.n && room.status !== 'FULL') {
    return getRoom(roomId);
  }

  prepare(
    `UPDATE rooms SET status = 'RESOLVING', updated_at = datetime('now') WHERE id = ?`
  ).run(roomId);

  const tickets = prepare(
    `SELECT t.*, u.is_bot AS user_is_bot, u.display_name, u.gender
     FROM tickets t JOIN users u ON u.id = t.user_id
     WHERE t.room_id = ? ORDER BY t.ticket_number`
  ).all(roomId);

  const seed = `${roomId}:${room.created_at}:${tickets.map((t) => t.id).join(',')}`;

  // Pot draw: fair RNG over eligible tickets.
  // pot_humans_only=0 (default Free/Ad): ALL seats count — House can win (player loses pot).
  // pot_humans_only=1: humans only (legacy / special rooms) — never use alone with House fill.
  let potPool = tickets;
  if (room.pot_humans_only) {
    potPool = tickets.filter((t) => !t.is_bot);
    // Safety: if somehow only one human in a House room, still include House tickets
    // so solo play isn't a free win.
    if (room.allows_house && potPool.length < 2 && tickets.length > potPool.length) {
      potPool = tickets;
    }
  }
  const potTicket = potPool.length ? pickWeightedPotWinner(potPool, seed) : null;

  const userIds = [...new Set(tickets.map((t) => t.user_id))];
  // Campaign road bonuses: GEM/skill pits only — never pot/ad lottery rooms
  const useRoadBonus = room.entry_type === 'GEM';

  const fighters = userIds.map((uid) => {
    const u = prepare(`SELECT * FROM users WHERE id = ?`).get(uid);
    let visualTier = 0;
    try {
      const ups = JSON.parse(u.upgrades_json || '{}');
      const armor = ups.armor || 0;
      const weapon = ups.weapon || 0;
      const muscle = ups.muscle || 0;
      const score = armor * 2 + weapon * 2 + muscle;
      if (score >= 10) visualTier = 2;
      else if (score >= 2) visualTier = 1;
    } catch {
      /* ignore */
    }
    let power = u.power;
    let vitality = u.vitality;
    let speed = u.speed;
    let guard = u.guard;
    let gearSet = null;
    if (useRoadBonus && !u.is_bot) {
      const b = parseRoadBonus(u.campaign_road_json);
      power += b.power || 0;
      vitality += b.vitality || 0;
      speed += b.speed || 0;
      guard += b.guard || 0;
    }
    let race = 'human';
    let classId = 'warrior';
    let gender = u.gender || 'boy';
    if (u.is_bot) {
      // Hash the FULL id — house bots are house_1001, house_1003… and all start
      // with "h", so charCodeAt(0) alone made every bot the same class (mage).
      const h = hashStr(uid);
      race = RACE_IDS[h % RACE_IDS.length];
      classId = ['warrior', 'ranger', 'mage'][(h >>> 8) % 3];
      gender = (h >>> 16) % 2 === 0 ? 'boy' : 'girl';
    } else {
      try {
        const heroes = parseHeroes(u);
        race = normalizeRace(heroes.activeRace);
        classId = heroes.activeClass || 'warrior';
      } catch {
        race = normalizeRace(u.race);
        classId = u.class_id || 'warrior';
      }
      gender = u.gender === 'girl' ? 'girl' : 'boy';
      // Permanent gear + full-set powers (pits + road skill fights)
      try {
        const geared = applyGearBonus(
          { power, vitality, speed, guard },
          parseGear(u.gear_json)
        );
        power = geared.power;
        vitality = geared.vitality;
        speed = geared.speed;
        guard = geared.guard;
        gearSet = geared.gearSet || null;
      } catch {
        /* gear optional */
      }
    }
    return {
      userId: u.id,
      displayName: u.display_name,
      level: u.level,
      archetype: u.archetype,
      power,
      vitality,
      speed,
      luck: u.luck,
      guard,
      isBot: !!u.is_bot,
      gender,
      visualTier,
      race,
      classId,
      gearSet,
      // Full-set armor art key (client heroPortrait) — only when set is complete
      gearOrigin: gearSet?.originId || null,
      // Humans share clanId so pit allies skip targeting each other
      clanId: u.is_bot ? null : getUserClanId(u.id) || u.clan_id || null,
    };
  });

  // Hero = first human ticket holder
  const heroUserId =
    tickets.find((t) => !t.is_bot)?.user_id || fighters.find((f) => !f.isBot)?.userId;
  // All unique ticket holders fight; playback may show a visual subset
  const arena = resolveArena(fighters, seed + ':arena', { heroUserId });

  let potGross = 0;
  let potAsset = 'COIN';
  if (room.entry_type === 'FREE' || room.entry_type === 'AD') {
    // Each seat contributes coin_per_ticket × ads multiplier (3 ads → 3× pot)
    const adMult = potAdMultiplier(room);
    const perSeat = Math.max(1, Number(room.coin_per_ticket) || 1);
    potGross = room.n * perSeat * adMult;
    potAsset = 'COIN';
  } else if (room.entry_type === 'COIN') {
    potGross = room.n * room.stake;
    potAsset = 'COIN';
  } else if (room.entry_type === 'GEM') {
    potGross = room.n * room.stake;
    potAsset = 'GEM';
  }

  const potNet = potGross * (1 - room.rake);

  const humanUserIds = userIds.filter((uid) => {
    const u = prepare(`SELECT is_bot FROM users WHERE id = ?`).get(uid);
    return u && !u.is_bot;
  });

  /** Per-player loot for client ceremony */
  const earnings = {};
  for (const uid of humanUserIds) {
    earnings[uid] = {
      coins: 0,
      gems: 0,
      xp: 0,
      leveledUp: false,
      newLevel: null,
      oldLevel: null,
      wonPot: false,
      wonPit: false,
      pitPlace: null,
      pitGems: 0,
      outcome: 'FOUGHT_HARD',
    };
  }

  const payoutTx = transaction(() => {
    if (potTicket && potNet > 0) {
      const winnerIsBot = !!potTicket.is_bot;
      if (!winnerIsBot) {
        applyLedger({
          userId: potTicket.user_id,
          asset: potAsset,
          delta: potNet,
          reason: 'pot_win',
          refType: 'room',
          refId: roomId,
        });
        if (earnings[potTicket.user_id]) {
          if (potAsset === 'COIN') earnings[potTicket.user_id].coins += potNet;
          else earnings[potTicket.user_id].gems += potNet;
          earnings[potTicket.user_id].wonPot = true;
        }
        if (potAsset === 'COIN') {
          recordScore(potTicket.user_id, 'POT_COINS', potNet, roomId);
        } else {
          recordScore(potTicket.user_id, 'POT_GEMS', potNet, roomId);
        }
        recordScore(potTicket.user_id, 'POT_WINS', 1, roomId);
      }
    }

    // Place-based pit gems (humans only — House places get nothing paid out)
    for (const row of arena.rankings || []) {
      if (!row.userId || row.isBot || !row.gems) continue;
      if (!earnings[row.userId]) continue;
      applyLedger({
        userId: row.userId,
        asset: 'GEM',
        delta: row.gems,
        reason: `arena_place_${row.place}`,
        refType: 'room',
        refId: roomId,
      });
      earnings[row.userId].gems += row.gems;
      earnings[row.userId].pitPlace = row.place;
      earnings[row.userId].pitGems = row.gems;
      if (row.place === 1) {
        earnings[row.userId].wonPit = true;
        recordScore(row.userId, 'ARENA_WINS', 1, roomId);
      }
      recordScore(row.userId, 'ARENA_GEMS', row.gems, roomId);
    }

    for (const uid of humanUserIds) {
      const before = prepare(`SELECT level, xp, matches_played FROM users WHERE id = ?`).get(uid);
      const matches = before.matches_played || 0;
      let xpGain = matches < 3 ? 18 : 10;
      if (earnings[uid]?.wonPit) xpGain += 8;
      else if (earnings[uid]?.pitPlace && earnings[uid].pitPlace <= 3) xpGain += 4;
      if (earnings[uid]?.wonPot) xpGain += 6;

      // Free/ad consolation crumbs if no pot
      if (
        (room.entry_type === 'FREE' || room.entry_type === 'AD') &&
        !earnings[uid]?.wonPot
      ) {
        applyLedger({
          userId: uid,
          asset: 'COIN',
          delta: 3,
          reason: 'consolation',
          refType: 'room',
          refId: roomId,
        });
        if (earnings[uid]) earnings[uid].coins += 3;
      }

      prepare(
        `UPDATE users SET xp = xp + ?, matches_played = matches_played + 1 WHERE id = ?`
      ).run(xpGain, uid);
      // Gear drop from pit place (top finishes guaranteed)
      try {
        const place = earnings[uid]?.pitPlace;
        if (place && pitShouldDrop(place, room.n)) {
          const drop = rollGearDrop({
            source: 'pit',
            place,
            fieldSize: room.n,
          });
          const granted = grantGearToUser(uid, [drop], { prepare });
          if (earnings[uid] && granted.drops?.length) {
            earnings[uid].gearDrops = granted.drops;
            earnings[uid].gearDropLabel = granted.drops
              .map((d) => d.label)
              .join(' · ');
          }
        }
      } catch {
        /* gear optional */
      }
      if (earnings[uid]) {
        earnings[uid].xp = xpGain;
        earnings[uid].oldLevel = before.level;
      }
      const leveled = maybeLevelUp(uid);
      if (earnings[uid]) {
        const after = prepare(`SELECT level FROM users WHERE id = ?`).get(uid);
        earnings[uid].leveledUp = !!leveled || after.level > before.level;
        earnings[uid].newLevel = after.level;
        if (earnings[uid].wonPot && earnings[uid].wonPit) {
          earnings[uid].outcome = 'DOUBLE_CROWN';
        } else if (earnings[uid].wonPot) {
          earnings[uid].outcome = 'POT_KING';
        } else if (earnings[uid].wonPit) {
          earnings[uid].outcome = 'PIT_CHAMP';
        } else {
          earnings[uid].outcome = 'FOUGHT_HARD';
        }
      }
      recordScore(uid, 'MATCHES_PLAYED', 1, roomId);
      tryRewardInvite(uid);
      // Passive clan chest drip (~25% chance +1 coin or gem)
      try {
        const chest = maybeClanChestContrib(uid, { source: 'pit' });
        if (chest?.added && earnings[uid]) {
          earnings[uid].clanChest = {
            asset: chest.asset,
            amount: chest.amount,
          };
        }
      } catch {
        /* optional */
      }

      // Rank after this match
      const rankAfter = getUserRank('fame', 'weekly', uid);
      const prev = prepare(
        `SELECT prev_weekly_fame_rank FROM users WHERE id = ?`
      ).get(uid)?.prev_weekly_fame_rank;
      prepare(`UPDATE users SET last_weekly_fame_rank = ? WHERE id = ?`).run(
        rankAfter.rank,
        uid
      );
      if (earnings[uid]) {
        earnings[uid].rankBefore = prev ?? null;
        earnings[uid].rankAfter = rankAfter.rank;
        earnings[uid].rankScore = rankAfter.score;
        // positive delta = climbed (rank number decreased)
        if (rankAfter.rank != null && prev != null) {
          earnings[uid].rankDelta = prev - rankAfter.rank;
        } else if (rankAfter.rank != null && prev == null) {
          earnings[uid].rankDelta = null;
          earnings[uid].firstOnBoard = true;
        } else {
          earnings[uid].rankDelta = null;
        }
      }
    }

    const winnerUser = potTicket
      ? prepare(`SELECT display_name, is_bot FROM users WHERE id = ?`).get(potTicket.user_id)
      : null;
    const arenaUser = arena.arenaWinnerUserId
      ? prepare(`SELECT display_name, is_bot FROM users WHERE id = ?`).get(arena.arenaWinnerUserId)
      : null;

    const replay = {
      seed,
      houseNote: room.allows_house
        ? 'House fills empty seats. Every seat is a ticket — fair draw.'
        : null,
      pot: {
        asset: potAsset,
        gross: potGross,
        net: potNet,
        rake: room.rake,
        adsPerTicket: potAdMultiplier(room),
        coinPerTicket: room.coin_per_ticket,
        humansOnly: !!room.pot_humans_only,
        winnerTicketId: potTicket?.id ?? null,
        winnerUserId: potTicket?.user_id ?? null,
        winnerTicketNumber: potTicket?.ticket_number ?? null,
        winnerName: winnerUser?.display_name ?? null,
        winnerIsBot: !!winnerUser?.is_bot,
      },
      arena: {
        rankings: arena.rankings,
        placeBoard: arena.placeBoard || [],
        prizeTable: arena.prizeTable || [],
        fieldSize: arena.fieldSize || (arena.rankings || []).length,
        winnerUserId: arena.arenaWinnerUserId,
        winnerName: arenaUser?.display_name ?? null,
        winnerIsBot: !!arenaUser?.is_bot,
        duel: arena.duel,
        battle: arena.battle,
        heroStats: arena.battle?.heroStats || null,
      },
      /** Map userId -> loot for ceremony */
      earnings,
      tickets: tickets.map((t) => ({
        id: t.id,
        userId: t.user_id,
        number: t.ticket_number,
        isBot: !!t.is_bot,
        displayName: t.display_name,
        gender: t.gender || (t.is_bot ? (t.ticket_number % 2 === 0 ? 'boy' : 'girl') : null),
        visualTier: 0,
      })),
      drawStyleHint: 'dice',
    };

    prepare(
      `UPDATE rooms SET
        status = 'COMPLETE',
        pot_winner_ticket_id = ?,
        arena_winner_user_id = ?,
        replay_json = ?,
        resolved_at = datetime('now'),
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      potTicket?.id ?? null,
      arena.arenaWinnerUserId,
      JSON.stringify(replay),
      roomId
    );
  });

  payoutTx();
  return getRoom(roomId);
}

function recordScore(userId, kind, amount, roomId) {
  if (!amount) return;
  prepare(
    `INSERT INTO score_events (id, user_id, kind, amount, room_id) VALUES (?, ?, ?, ?, ?)`
  ).run(nanoid(), userId, kind, amount, roomId);
}

function maybeLevelUp(userId) {
  const u = prepare(`SELECT level, xp FROM users WHERE id = ?`).get(userId);
  if (!u) return false;
  // Friendlier early curve
  const need = u.level < 5 ? 20 + u.level * 15 : u.level * 50;
  if (u.xp >= need && u.level < 50) {
    prepare(
      `UPDATE users SET level = level + 1, xp = xp - ?, power = power + 1,
       vitality = vitality + 2, speed = speed + 1 WHERE id = ?`
    ).run(need, userId);
    return true;
  }
  return false;
}

export function cancelExpiredRooms() {
  const expired = prepare(
    `SELECT * FROM rooms
     WHERE status IN ('OPEN', 'FILLING')
       AND expires_at IS NOT NULL
       AND expires_at < datetime('now')
       AND tickets_sold < n`
  ).all();

  for (const room of expired) {
    cancelRoom(room.id, 'timeout');
  }
  return expired.length;
}

export function cancelRoom(roomId, reason = 'timeout') {
  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room || !['OPEN', 'FILLING'].includes(room.status)) return null;

  const tickets = prepare(`SELECT * FROM tickets WHERE room_id = ? AND is_bot = 0`).all(roomId);
  const byUser = new Map();
  for (const t of tickets) {
    byUser.set(t.user_id, (byUser.get(t.user_id) || 0) + 1);
  }

  const tx = transaction(() => {
    if (room.entry_type === 'COIN' || room.entry_type === 'GEM') {
      const asset = room.entry_type;
      for (const [uid, count] of byUser) {
        const staked = count * room.stake;
        const refund = staked * 0.9;
        if (refund > 0) {
          applyLedger({
            userId: uid,
            asset,
            delta: refund,
            reason: 'cancel_refund',
            refType: 'room',
            refId: roomId,
          });
        }
      }
    }

    prepare(
      `UPDATE rooms SET status = 'CANCELLED', updated_at = datetime('now'),
       replay_json = ? WHERE id = ?`
    ).run(JSON.stringify({ cancelled: true, reason }), roomId);
  });
  tx();
  return getRoom(roomId);
}

export function fillWithBots(roomId) {
  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'COMPLETE') return getRoom(roomId);
  if (room.status === 'RESOLVING' || room.status === 'FULL' || room.tickets_sold >= room.n) {
    return resolveRoom(roomId);
  }
  if (!room.allows_house) throw new Error('No House in this room');
  fillRestWithHouse(roomId);
  const after = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (after.tickets_sold >= after.n) {
    return resolveRoom(roomId);
  }
  return getRoom(roomId);
}
