import { nanoid } from 'nanoid';
import { prepare, getFlagBool, getFlagNumber } from './db.js';
import { ensureBalances } from './ledger.js';

const HOUSE_NAMES = [
  'House Rook',
  'House Sparrow',
  'House Flint',
  'House Ember',
  'House Nox',
  'House Pike',
  'House Vale',
  'House Drift',
  'House Quill',
  'House Ash',
  'House Cobalt',
  'House Mirage',
];

export function isBotUser(user) {
  return !!(user && (user.is_bot === 1 || user.is_bot === true || String(user.id).startsWith('house_')));
}

export function ensureHouseBot(index, maxLevel = 50) {
  const id = `house_${index}`;
  const existing = prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  if (existing) return existing;

  const lvl = 1 + (index % Math.min(10, maxLevel));
  const name = HOUSE_NAMES[index % HOUSE_NAMES.length] + ` ${index + 1}`;
  const gender = index % 2 === 0 ? 'boy' : 'girl';
  prepare(
    `INSERT INTO users (
      id, display_name, token, is_bot, level, power, vitality, speed, luck, guard, archetype,
      invite_code, gender, body, character_ready
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'plain', 1)`
  ).run(
    id,
    name,
    `house-token-${index}`,
    lvl,
    7 + (index % 8),
    22 + (index % 12),
    7 + (index % 7),
    3 + (index % 6),
    3 + (index % 6),
    ['striker', 'tank', 'rogue', 'support'][index % 4],
    gender
  );
  ensureBalances(id);
  return prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

/**
 * Add up to `count` house tickets to a room (FREE/AD only).
 * Returns number added.
 */
export function addHouseTickets(roomId, count) {
  if (count <= 0) return 0;
  let room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room || !['OPEN', 'FILLING'].includes(room.status)) return 0;
  if (!room.allows_house) return 0;
  if (room.entry_type === 'COIN' || room.entry_type === 'GEM') return 0;

  let added = 0;
  while (added < count) {
    room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
    if (room.tickets_sold >= room.n) break;

    const botIndex = room.tickets_sold + 1000 + added;
    const bot = ensureHouseBot(botIndex, room.max_level);
    const ticketId = nanoid(12);
    const ticketNumber = room.tickets_sold + 1;

    prepare(
      `INSERT INTO tickets (id, room_id, user_id, team_id, is_bot, ticket_number, weight)
       VALUES (?, ?, ?, NULL, 1, ?, 1)`
    ).run(ticketId, roomId, bot.id, ticketNumber);

    const sold = ticketNumber;
    const status = sold >= room.n ? 'FULL' : 'FILLING';
    prepare(
      `UPDATE rooms SET tickets_sold = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(sold, status, roomId);
    added++;
  }
  return added;
}

export function roomHumanTicketCount(roomId) {
  const row = prepare(
    `SELECT COUNT(*) AS c FROM tickets WHERE room_id = ? AND is_bot = 0`
  ).get(roomId);
  return row?.c ?? 0;
}

export function roomBotTicketCount(roomId) {
  const row = prepare(
    `SELECT COUNT(*) AS c FROM tickets WHERE room_id = ? AND is_bot = 1`
  ).get(roomId);
  return row?.c ?? 0;
}

/**
 * Cold-start autofill: for FREE/AD rooms with at least one human,
 * after grace period, drip house seats up to max bot share, then fill remainder.
 */
export function tickHouseFill() {
  if (!getFlagBool('house_bots_enabled', true)) return { filled: 0, resolved: [] };

  const grace = getFlagNumber('house_grace_seconds', 12);
  const maxShare = getFlagNumber('house_max_bot_share', 0.8);

  const rooms = prepare(
    `SELECT * FROM rooms
     WHERE status IN ('OPEN', 'FILLING')
       AND allows_house = 1
       AND entry_type IN ('FREE', 'AD')
       AND tickets_sold < n`
  ).all();

  let filled = 0;
  const toResolve = [];

  for (const room of rooms) {
    const humans = roomHumanTicketCount(room.id);
    if (humans < 1) continue;

    // Grace from first human join
    const anchor = room.first_human_at || room.created_at;
    const anchorMs = Date.parse(anchor.includes('T') ? anchor : anchor.replace(' ', 'T') + 'Z');
    const ageSec = (Date.now() - (Number.isFinite(anchorMs) ? anchorMs : Date.now())) / 1000;
    if (ageSec < grace) continue;

    const maxBots = Math.floor(room.n * maxShare);
    const bots = roomBotTicketCount(room.id);
    const seatsLeft = room.n - room.tickets_sold;

    // After grace: fill remaining seats with house (respect max bot share when humans still joining)
    // If humans + current bots + seatsLeft would exceed, still fill so match completes:
    // once grace passed and ≥1 human, complete the room for fun.
    const want = seatsLeft; // complete the match after grace
    // Soft cap: don't exceed maxShare unless humans already committed and room is stale
    const hardCap = humans >= 1 && ageSec > grace * 2 ? seatsLeft : Math.max(0, maxBots - bots);
    const add = Math.min(want, hardCap > 0 ? hardCap : seatsLeft);

    // After 2x grace, force-complete with house for cold start
    const forceAdd = ageSec >= grace * 2 ? seatsLeft : Math.min(2, seatsLeft); // drip 2 at a time normally
    const nAdd = ageSec >= grace * 2 ? seatsLeft : Math.min(forceAdd, add || seatsLeft);

    if (nAdd > 0) {
      filled += addHouseTickets(room.id, nAdd);
    }

    const updated = prepare(`SELECT * FROM rooms WHERE id = ?`).get(room.id);
    if (updated.tickets_sold >= updated.n && updated.status === 'FULL') {
      toResolve.push(room.id);
    }
  }

  return { filled, resolved: toResolve };
}

/** Instant fill remaining with house (dev / explicit). */
export function fillRestWithHouse(roomId) {
  const room = prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.entry_type === 'COIN' || room.entry_type === 'GEM') {
    throw new Error('House fighters cannot enter stake rooms');
  }
  const left = room.n - room.tickets_sold;
  addHouseTickets(roomId, left);
  return prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
}
