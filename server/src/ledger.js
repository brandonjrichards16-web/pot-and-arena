import { nanoid } from 'nanoid';
import { prepare } from './db.js';

const ASSETS = ['COIN', 'GEM', 'CASH'];

export function ensureBalances(userId) {
  const insert = prepare(
    `INSERT OR IGNORE INTO balances (user_id, asset, amount) VALUES (?, ?, 0)`
  );
  for (const asset of ASSETS) insert.run(userId, asset);
}

export function getBalances(userId) {
  ensureBalances(userId);
  const rows = prepare(`SELECT asset, amount FROM balances WHERE user_id = ?`).all(userId);
  const out = { COIN: 0, GEM: 0, CASH: 0 };
  for (const r of rows) out[r.asset] = r.amount;
  return out;
}

/** No nested BEGIN — callers may already be inside a transaction. */
export function applyLedger({ userId, asset, delta, reason, refType = null, refId = null }) {
  if (!ASSETS.includes(asset)) throw new Error(`Unknown asset ${asset}`);
  ensureBalances(userId);

  const row = prepare(
    `SELECT amount FROM balances WHERE user_id = ? AND asset = ?`
  ).get(userId, asset);
  const next = (row?.amount ?? 0) + delta;
  if (next < -1e-9) {
    const err = new Error(`Insufficient ${asset}`);
    err.code = 'INSUFFICIENT';
    throw err;
  }

  const id = nanoid();
  prepare(
    `INSERT INTO ledger (id, user_id, asset, delta, reason, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, asset, delta, reason, refType, refId);
  prepare(`UPDATE balances SET amount = ? WHERE user_id = ? AND asset = ?`).run(
    Math.max(0, next),
    userId,
    asset
  );
  return { id, balance: Math.max(0, next) };
}
