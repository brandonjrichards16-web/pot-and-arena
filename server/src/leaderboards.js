import { nanoid } from 'nanoid';
import { prepare } from './db.js';

export function periodStart(period) {
  const now = new Date();
  if (period === 'all') return '1970-01-01 00:00:00';
  if (period === 'daily') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (period === 'weekly') {
    const day = now.getUTCDay();
    const diff = (day + 6) % 7;
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff)
    );
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (period === 'monthly') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  throw new Error('Invalid period');
}

/**
 * Boards:
 * - pot / arena / fame — from score_events (match payouts)
 * - players — live roster of real humans (so you always see who is playing)
 */
export function getLeaderboard(board, period, limit = 50) {
  const startSql = periodStart(period);
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));

  // Always-visible player roster (not period-filtered by events)
  if (board === 'players') {
    const rows = prepare(
      `
      SELECT
        u.id AS user_id,
        u.display_name,
        u.level,
        u.equipped_frame,
        u.archetype,
        u.matches_played,
        COALESCE(u.campaign_high_water, 0) AS campaign_high_water,
        u.character_ready,
        u.created_at,
        (
          COALESCE(u.matches_played, 0) * 25
          + COALESCE(u.level, 1) * 8
          + COALESCE(u.campaign_high_water, 0) * 3
          + COALESCE(u.xp, 0) * 0.1
          + CASE WHEN u.character_ready = 1 THEN 5 ELSE 0 END
        ) AS score
      FROM users u
      WHERE u.is_bot = 0
      ORDER BY score DESC, u.created_at ASC
      LIMIT ?
    `
    ).all(lim);

    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      displayName: r.display_name,
      level: r.level,
      frame: r.equipped_frame,
      archetype: r.archetype,
      score: Math.round(Number(r.score) * 10) / 10,
      matchesPlayed: r.matches_played || 0,
      campaignHigh: r.campaign_high_water || 0,
      kind: 'players',
    }));
  }

  let scoreExpr;
  if (board === 'pot') {
    scoreExpr = `SUM(CASE
      WHEN se.kind = 'POT_COINS' THEN se.amount
      WHEN se.kind = 'POT_GEMS' THEN se.amount * 5
      ELSE 0 END)`;
  } else if (board === 'arena') {
    scoreExpr = `SUM(CASE WHEN se.kind = 'ARENA_GEMS' THEN se.amount * 3 WHEN se.kind = 'ARENA_WINS' THEN se.amount * 15 ELSE 0 END)`;
  } else {
    scoreExpr = `SUM(
      CASE se.kind
        WHEN 'POT_COINS' THEN se.amount
        WHEN 'POT_GEMS' THEN se.amount * 5
        WHEN 'ARENA_GEMS' THEN se.amount * 3
        WHEN 'POT_WINS' THEN se.amount * 10
        WHEN 'ARENA_WINS' THEN se.amount * 15
        WHEN 'MATCHES_PLAYED' THEN se.amount * 5
        WHEN 'CAMPAIGN' THEN se.amount
        ELSE 0
      END)`;
  }

  const rows = prepare(
    `
    SELECT
      u.id AS user_id,
      u.display_name,
      u.level,
      u.equipped_frame,
      u.archetype,
      ${scoreExpr} AS score
    FROM score_events se
    JOIN users u ON u.id = se.user_id
    WHERE se.created_at >= ?
      AND u.is_bot = 0
    GROUP BY u.id
    HAVING score > 0
    ORDER BY score DESC
    LIMIT ?
  `
  ).all(startSql, lim);

  // Fame fallback: if no pot events yet, still show active humans so boards aren't empty
  if (board === 'fame' && rows.length === 0) {
    return getLeaderboard('players', period, lim).map((e) => ({
      ...e,
      kind: 'fame-fallback',
    }));
  }

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    displayName: r.display_name,
    level: r.level,
    frame: r.equipped_frame,
    archetype: r.archetype,
    score: Math.round(r.score * 10) / 10,
  }));
}

export function awardLeaderboardBadges(period = 'daily') {
  const boards = ['pot', 'arena', 'fame'];
  const thresholds = [
    { maxRank: 1, label: 'top1' },
    { maxRank: 10, label: 'top10' },
    { maxRank: 100, label: 'top100' },
  ];

  let awarded = 0;
  for (const board of boards) {
    const rows = getLeaderboard(board, period, 100);
    for (const row of rows) {
      for (const th of thresholds) {
        if (row.rank <= th.maxRank) {
          const badgeKey = `lb_${period}_${board}_${th.label}`;
          const info = prepare(
            `INSERT OR IGNORE INTO badges (id, user_id, badge_key, period, rank)
             VALUES (?, ?, ?, ?, ?)`
          ).run(nanoid(), row.userId, badgeKey, period, row.rank);
          if (info.changes) {
            awarded++;
            if (th.label === 'top1' && board === 'fame') {
              prepare(`UPDATE users SET equipped_frame = ? WHERE id = ?`).run(
                `frame_${period}_crown`,
                row.userId
              );
            }
          }
        }
      }
    }
  }
  return awarded;
}

export function getUserBadges(userId) {
  return prepare(
    `SELECT badge_key, period, rank, awarded_at FROM badges WHERE user_id = ? ORDER BY awarded_at DESC`
  ).all(userId);
}

/** Rank among humans with score > 0; unranked if no events this period */
export function getUserRank(board, period, userId) {
  const entries = getLeaderboard(board, period, 1000);
  const idx = entries.findIndex((e) => e.userId === userId);
  if (idx === -1) {
    return {
      board,
      period,
      rank: null,
      score: 0,
      playersOnBoard: entries.length,
      unranked: true,
    };
  }
  return {
    board,
    period,
    rank: idx + 1,
    score: entries[idx].score,
    playersOnBoard: entries.length,
    unranked: false,
    displayName: entries[idx].displayName,
  };
}
