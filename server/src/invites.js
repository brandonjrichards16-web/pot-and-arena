import { nanoid } from 'nanoid';
import { prepare } from './db.js';
import { applyLedger, getBalances } from './ledger.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function assignInviteCode(userId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateInviteCode();
    try {
      prepare(`UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL`).run(
        code,
        userId
      );
      const u = prepare(`SELECT invite_code FROM users WHERE id = ?`).get(userId);
      if (u?.invite_code) return u.invite_code;
    } catch {
      /* collision */
    }
  }
  const fallback = nanoid(6).toUpperCase();
  prepare(`UPDATE users SET invite_code = ? WHERE id = ?`).run(fallback, userId);
  return fallback;
}

export function findUserByInviteCode(code) {
  if (!code) return null;
  return prepare(
    `SELECT * FROM users WHERE invite_code = ? AND is_bot = 0`
  ).get(String(code).trim().toUpperCase());
}

/**
 * Apply invite at signup. Rewards when invitee finishes first real match (see tryRewardInvite).
 */
export function linkInvite(inviteeId, code) {
  const inviter = findUserByInviteCode(code);
  if (!inviter) {
    const e = new Error('Invalid invite code');
    e.code = 'BAD_INVITE';
    throw e;
  }
  if (inviter.id === inviteeId) {
    const e = new Error('Cannot use your own code');
    e.code = 'BAD_INVITE';
    throw e;
  }
  const existing = prepare(`SELECT * FROM invites WHERE invitee_id = ?`).get(inviteeId);
  if (existing) {
    const e = new Error('Invite already applied');
    e.code = 'ALREADY';
    throw e;
  }

  prepare(
    `INSERT INTO invites (id, inviter_id, invitee_id, code_used, rewarded)
     VALUES (?, ?, ?, ?, 0)`
  ).run(nanoid(), inviter.id, inviteeId, inviter.invite_code);
  prepare(`UPDATE users SET invited_by = ? WHERE id = ?`).run(inviter.id, inviteeId);
  return { inviterId: inviter.id, code: inviter.invite_code };
}

/**
 * After invitee completes a match, both get gems (once).
 */
export function tryRewardInvite(inviteeId) {
  const row = prepare(
    `SELECT * FROM invites WHERE invitee_id = ? AND rewarded = 0`
  ).get(inviteeId);
  if (!row) return null;

  const INVITER_GEMS = 15;
  const INVITEE_GEMS = 10;

  applyLedger({
    userId: row.inviter_id,
    asset: 'GEM',
    delta: INVITER_GEMS,
    reason: 'invite_reward_inviter',
    refType: 'invite',
    refId: row.id,
  });
  applyLedger({
    userId: row.invitee_id,
    asset: 'GEM',
    delta: INVITEE_GEMS,
    reason: 'invite_reward_invitee',
    refType: 'invite',
    refId: row.id,
  });
  prepare(`UPDATE invites SET rewarded = 1 WHERE id = ?`).run(row.id);

  return {
    inviterId: row.inviter_id,
    inviteeId: row.invitee_id,
    inviterGems: INVITER_GEMS,
    inviteeGems: INVITEE_GEMS,
  };
}

export function getInviteStats(userId) {
  const u = prepare(`SELECT invite_code FROM users WHERE id = ?`).get(userId);
  const invited = prepare(
    `SELECT COUNT(*) AS c FROM invites WHERE inviter_id = ?`
  ).get(userId)?.c ?? 0;
  const rewarded = prepare(
    `SELECT COUNT(*) AS c FROM invites WHERE inviter_id = ? AND rewarded = 1`
  ).get(userId)?.c ?? 0;
  return {
    code: u?.invite_code || null,
    invitedCount: invited,
    rewardedCount: rewarded,
    shareBlurb: u?.invite_code
      ? `Join Pot & Arena with my code ${u.invite_code} — we both get gems!`
      : null,
  };
}
