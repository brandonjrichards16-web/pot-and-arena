import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  restoreDatabaseFile,
  startDbPersistence,
  markDbDirty,
  isDbBackupEnabled,
} from './db-persist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const dbPath = process.env.DB_PATH || path.join(dataDir, 'game.db');

/** Opened after optional remote restore (see initDatabase). */
export let db = null;
let ready = false;
let readyPromise = null;

/**
 * Restore from free-tier backup (if configured), open SQLite, enable WAL.
 * Safe to call multiple times; concurrent callers share one promise.
 */
export function initDatabase() {
  if (ready && db) return Promise.resolve(db);
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    // Fresh DB if schema evolving during early dev
    if (process.env.RESET_DB === '1' && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    await restoreDatabaseFile(dbPath);
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    ready = true;
    return db;
  })();
  return readyPromise;
}

function ensureOpen() {
  if (!db) {
    throw new Error('Database not open yet — await initDatabase() before use');
  }
  return db;
}

export function prepare(sql) {
  const stmt = ensureOpen().prepare(sql);
  return {
    run(...params) {
      const r = stmt.run(...params);
      if (r.changes > 0) markDbDirty();
      return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
    },
    get(...params) {
      return stmt.get(...params);
    },
    all(...params) {
      return stmt.all(...params);
    },
  };
}

export function transaction(fn) {
  return (...args) => {
    ensureOpen().exec('BEGIN');
    try {
      const result = fn(...args);
      ensureOpen().exec('COMMIT');
      markDbDirty();
      return result;
    } catch (e) {
      try {
        ensureOpen().exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    }
  };
}

/** Call once after migrate() so free hosts keep progress across cold starts. */
export function enableDbPersistence() {
  if (!db) return;
  if (isDbBackupEnabled()) startDbPersistence(db, dbPath);
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      team_id TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0,
      invite_code TEXT UNIQUE,
      invited_by TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      archetype TEXT NOT NULL DEFAULT 'striker',
      power INTEGER NOT NULL DEFAULT 10,
      vitality INTEGER NOT NULL DEFAULT 30,
      speed INTEGER NOT NULL DEFAULT 10,
      luck INTEGER NOT NULL DEFAULT 5,
      guard INTEGER NOT NULL DEFAULT 5,
      draw_style TEXT NOT NULL DEFAULT 'dice',
      equipped_frame TEXT,
      gender TEXT,
      body TEXT DEFAULT 'plain',
      character_ready INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS balances (
      user_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, asset),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      delta REAL NOT NULL,
      reason TEXT NOT NULL,
      ref_type TEXT,
      ref_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      n INTEGER NOT NULL,
      entry_type TEXT NOT NULL,
      stake REAL NOT NULL DEFAULT 0,
      ads_per_ticket INTEGER NOT NULL DEFAULT 1,
      coin_per_ticket REAL NOT NULL DEFAULT 1,
      rake REAL NOT NULL DEFAULT 0.05,
      max_level INTEGER NOT NULL DEFAULT 50,
      allows_house INTEGER NOT NULL DEFAULT 1,
      pot_humans_only INTEGER NOT NULL DEFAULT 1,
      team_id TEXT,
      team_split_enabled INTEGER NOT NULL DEFAULT 0,
      tickets_sold INTEGER NOT NULL DEFAULT 0,
      pot_winner_ticket_id TEXT,
      arena_winner_user_id TEXT,
      replay_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      resolved_at TEXT,
      first_human_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      team_id TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0,
      ticket_number INTEGER NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS score_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      room_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      badge_key TEXT NOT NULL,
      period TEXT,
      rank INTEGER,
      awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      inviter_id TEXT NOT NULL,
      invitee_id TEXT NOT NULL UNIQUE,
      code_used TEXT NOT NULL,
      rewarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (inviter_id) REFERENCES users(id),
      FOREIGN KEY (invitee_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_room ON tickets(room_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_score_user_time ON score_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    CREATE INDEX IF NOT EXISTS idx_users_invite ON users(invite_code);
  `);

  // Light migrations for existing DBs
  const cols = prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  const addCol = (name, def) => {
    if (!cols.includes(name)) {
      try {
        db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
      } catch {
        /* ignore */
      }
    }
  };
  addCol('gender', 'TEXT');
  addCol('body', "TEXT DEFAULT 'plain'");
  addCol('character_ready', 'INTEGER NOT NULL DEFAULT 0');
  addCol('upgrades_json', "TEXT DEFAULT '{}'");
  addCol('fighter_kit', "TEXT DEFAULT 'rookie'");
  addCol('gear_json', "TEXT DEFAULT '{}'");
  addCol('room_unlocks_json', "TEXT DEFAULT '{\"maxCreateN\":5}'");
  addCol('last_weekly_fame_rank', 'INTEGER');
  addCol('prev_weekly_fame_rank', 'INTEGER');
  addCol('ad_skip_tickets', 'INTEGER NOT NULL DEFAULT 0');
  // Ready Player Me free avatar GLB URL (https://models.readyplayer.me/….glb)
  addCol('avatar_url', 'TEXT');
  addCol('campaign_high_water', 'INTEGER NOT NULL DEFAULT 0');
  addCol('campaign_tickets_today', 'INTEGER NOT NULL DEFAULT 0');
  addCol('campaign_tickets_day', 'TEXT');

  // Campaign tower tables
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS campaign_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        floor INTEGER NOT NULL DEFAULT 1,
        checkpoint INTEGER NOT NULL DEFAULT 0,
        high_water INTEGER NOT NULL DEFAULT 0,
        bank_coins REAL NOT NULL DEFAULT 0,
        bank_gems REAL NOT NULL DEFAULT 0,
        blessings_json TEXT NOT NULL DEFAULT '[]',
        pending_offer_json TEXT,
        last_result_json TEXT,
        seed TEXT NOT NULL,
        revived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_campaign_user ON campaign_runs(user_id, status);
    `);
  } catch {
    /* ignore */
  }

  const insertFlag = prepare(
    `INSERT OR IGNORE INTO feature_flags (key, value) VALUES (?, ?)`
  );
  for (const [k, v] of [
    ['withdrawals_enabled', 'false'],
    ['cash_asset_visible', 'false'],
    ['guilds_enabled', 'false'],
    ['iap_cashable', 'false'],
    ['house_bots_enabled', 'true'],
    // launch: high bot share. Scale down later via config.
    ['house_max_bot_share', '0.8'],
    ['house_grace_seconds', '12'],
  ]) {
    insertFlag.run(k, v);
  }
}

export function getFlag(key, fallback = null) {
  const row = prepare(`SELECT value FROM feature_flags WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}

export function getFlagBool(key, fallback = false) {
  const v = getFlag(key, fallback ? 'true' : 'false');
  return v === 'true' || v === '1';
}

export function getFlagNumber(key, fallback = 0) {
  const v = getFlag(key, String(fallback));
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
