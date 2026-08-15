import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { prepare, migrate, getFlagBool } from './db.js';
import { applyLedger, getBalances, ensureBalances } from './ledger.js';
import {
  ROOM_TEMPLATES,
  HOUSE_DISCLAIMER,
  ADS_PER_TICKET_OPTIONS,
  potAdMultiplier,
  adsRequiredPerTicket,
  createRoomFromTemplate,
  listOpenRooms,
  listBettingRooms,
  createBettingRoom,
  getRoom,
  joinRoom,
  myRooms,
  fillWithBots,
  dripHouse,
  cancelExpiredRooms,
  resolveRoom,
  EXTRA_TICKET_COIN_COST,
} from './rooms.js';
import { tickHouseFill } from './bots.js';
import {
  getLeaderboard,
  awardLeaderboardBadges,
  getUserBadges,
  getUserRank,
} from './leaderboards.js';
import {
  assignInviteCode,
  linkInvite,
  getInviteStats,
} from './invites.js';
import {
  UPGRADE_TREE,
  FIGHTER_KITS,
  emptyUpgrades,
  parseUpgrades,
  visualTier,
  totalUpgradePoints,
  canBuyNode,
  publicUpgradeNode,
  publicKit,
  kitById,
  isKitUnlocked,
} from './upgrades.js';
import {
  parseGear,
  publicGear,
  gearBonus,
  mergeGear,
  mergeAllGear,
  serializeGear,
  setAutoEquipBest,
  setEquippedTier,
  setEquippedOrigin,
  GEAR_KINDS,
  GEAR_ORIGINS,
} from './gear.js';
import {
  ensureStoreColumns,
  getStoreCatalog,
  purchaseProduct,
  purchaseGearShop,
  claimDaily,
  claimDailyPathBuy,
  vipActive,
  roadBoostActive,
} from './store.js';
import {
  ROOM_SIZE_LADDER,
  ABSOLUTE_MAX_N,
  parseUnlockedMaxN,
  nextUnlock,
  canMeetRequirements,
} from './roomUnlocks.js';
import {
  ensureHeroesColumns,
  publicHeroes,
  unlockRace,
  unlockClass,
  equipHero,
  setParty,
  bootstrapHeroes,
  heroStatBonus,
  parseHeroes,
} from './heroes.js';
import {
  ensureClanTables,
  tickClanDefenses,
  listClans,
  createClan,
  joinClan,
  leaveClan,
  depositToClan,
  startDefense,
  claimDefendSeat,
  openRaidSquad,
  joinRaidSquad,
  listOpenSquads,
  raidClan,
  getMyClan,
  getClan,
  getUserClanId,
  postClanChat,
  getClanChat,
  touchLastSeen,
  kickMember,
  setMemberRole,
  updateClanSettings,
  approveJoinRequest,
  rejectJoinRequest,
  transferLeadership,
  setClanAnnouncement,
  getWarSchedule,
} from './clans.js';
import {
  ensureCampaignTables,
  getCampaignStatus,
  startCampaign,
  campaignFight,
  campaignEncounter,
  campaignEnterStage,
  campaignLeaveBattle,
  campaignStartBattle,
  campaignBattleAct,
  campaignBossPick,
  campaignChoose,
  campaignChoosePath,
  campaignEquip,
  campaignAckStory,
  campaignCashOut,
  campaignRevive,
  campaignAbandon,
} from './campaign.js';

migrate();
ensureCampaignTables();
ensureStoreColumns();
ensureHeroesColumns();
ensureClanTables();
cancelExpiredRooms();
tickClanDefenses();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
/** Free/dev cheat endpoints (gem dump, unlock-all). Mock store stays available. */
const ALLOW_DEV_CHEATS =
  process.env.ALLOW_DEV_IAP === '1' ||
  (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_IAP !== '0');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const user = prepare(`SELECT * FROM users WHERE token = ?`).get(token);
  if (!user || user.is_bot) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  touchLastSeen(user.id);
  next();
}

/** Browser document navigation prefers text/html; fetch() typically does not. */
function prefersHtml(req) {
  const accept = req.headers.accept || '';
  if (!accept.includes('text/html')) return false;
  const html = accept.indexOf('text/html');
  const json = accept.indexOf('application/json');
  return json === -1 || html < json;
}

function sendSpa(res) {
  const indexHtml = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    return res.status(404).json({ error: 'Web client not built' });
  }
  return res.sendFile(indexHtml);
}

/** For paths shared by expo-router pages and JSON APIs (/campaign, /store). */
function spaOrAuth(handler) {
  return (req, res, next) => {
    // Authenticated API clients always get JSON — never the SPA shell
    // (browsers sometimes send Accept: text/html even on fetch).
    if (req.headers.authorization || req.headers['x-token']) {
      return auth(req, res, () => handler(req, res, next));
    }
    if (prefersHtml(req)) return sendSpa(res);
    return auth(req, res, () => handler(req, res, next));
  };
}

function publicUser(u) {
  const upgrades = parseUpgrades(u.upgrades_json);
  const gear = parseGear(u.gear_json);
  const gBonus = gearBonus(gear);
  const maxCreateN = parseUnlockedMaxN(u.room_unlocks_json);
  const points = totalUpgradePoints(upgrades);
  const nxt = nextUnlock(maxCreateN);
  const heroB = heroStatBonus(u, {
    chapterCleared: u.campaign_chapter_cleared || 0,
  });
  const baseAtk = (u.power || 0) + (heroB.ATK || 0);
  const baseHp = (u.vitality || 0) + (heroB.HP || 0);
  const baseDef = (u.guard || 0) + (heroB.DEF || 0);
  const baseSpd = (u.speed || 0) + (heroB.SPD || 0);
  const heroesState = parseHeroes(u);
  return {
    id: u.id,
    displayName: u.display_name,
    level: u.level,
    xp: u.xp,
    teamId: u.team_id,
    archetype: u.archetype,
    inviteCode: u.invite_code,
    gender: u.gender || null,
    body: u.body || 'plain',
    avatarUrl: u.avatar_url || null,
    race: heroesState.activeRace,
    classId: heroesState.activeClass,
    heroLabel: `${heroB.raceEmoji || ''} ${heroB.raceName || ''} ${heroB.classEmoji || ''} ${heroB.className || ''}`.trim(),
    heroBonus: {
      ATK: heroB.ATK,
      HP: heroB.HP,
      DEF: heroB.DEF,
      SPD: heroB.SPD,
    },
    clanId: u.clan_id || getUserClanId(u.id) || null,
    characterReady: !!(u.character_ready),
    upgrades,
    // Compact embed — full bag levels live on GET /me/gear
    gear: publicGear(gear, { compact: true }),
    gearBonus: {
      ATK: gBonus.ATK,
      HP: gBonus.HP,
      DEF: gBonus.DEF,
      SPD: gBonus.SPD,
    },
    visualTier: visualTier(upgrades),
    upgradePoints: points,
    fighterKit: u.fighter_kit || 'rookie',
    kitBonus: kitById(u.fighter_kit || 'rookie').bonus || {},
    vipActive: vipActive(u),
    vipUntil: u.vip_until || null,
    roadBoostActive: roadBoostActive(u),
    roadBoostUntil: u.road_boost_until || null,
    adSkipTickets: u.ad_skip_tickets || 0,
    maxCreateN,
    nextRoomUnlock: nxt
      ? {
          maxN: nxt.maxN,
          label: nxt.label,
          gemCost: nxt.gemCost,
          matches: nxt.matches,
          upgradePoints: nxt.upgradePoints || 0,
          ready: canMeetRequirements(nxt, {
            matchesPlayed: u.matches_played,
            upgradePoints: points,
          }).ok,
        }
      : null,
    // Base from gem tech tree (user row)
    statsBase: {
      ATK: baseAtk,
      HP: baseHp,
      DEF: baseDef,
      SPD: baseSpd,
      LUCK: u.luck,
    },
    // Combat numbers for display = base + equipped gear
    stats: {
      ATK: baseAtk + gBonus.ATK,
      HP: baseHp + gBonus.HP,
      DEF: baseDef + gBonus.DEF,
      SPD: baseSpd + gBonus.SPD,
      LUCK: u.luck,
      // legacy keys for older clients
      power: baseAtk + gBonus.ATK,
      vitality: baseHp + gBonus.HP,
      speed: baseSpd + gBonus.SPD,
      luck: u.luck,
      guard: baseDef + gBonus.DEF,
    },
    // From campaign road — gem/skill combat only, never pot odds
    roadBonus: (() => {
      try {
        const j = JSON.parse(u.campaign_road_json || '{}');
        return {
          ATK: j.power || 0,
          HP: j.vitality || 0,
          DEF: j.guard || 0,
          SPD: j.speed || 0,
          power: j.power || 0,
          vitality: j.vitality || 0,
          speed: j.speed || 0,
          guard: j.guard || 0,
        };
      } catch {
        return {
          ATK: 0,
          HP: 0,
          DEF: 0,
          SPD: 0,
          power: 0,
          vitality: 0,
          speed: 0,
          guard: 0,
        };
      }
    })(),
    drawStyle: u.draw_style,
    equippedFrame: u.equipped_frame,
    matchesPlayed: u.matches_played,
    weeklyFameRank: u.last_weekly_fame_rank ?? null,
    prevWeeklyFameRank: u.prev_weekly_fame_rank ?? null,
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pot-and-arena', houseBots: getFlagBool('house_bots_enabled', true) });
});

app.get('/meta', (_req, res) => {
  res.json({
    disclaimer: HOUSE_DISCLAIMER,
    houseBotsEnabled: getFlagBool('house_bots_enabled', true),
    withdrawalsEnabled: getFlagBool('withdrawals_enabled', false),
    guildsEnabled: getFlagBool('guilds_enabled', false),
  });
});

app.get('/flags', (_req, res) => {
  const rows = prepare(`SELECT key, value FROM feature_flags`).all();
  const flags = {};
  for (const r of rows) flags[r.key] = r.value === 'true' ? true : r.value === 'false' ? false : r.value;
  res.json(flags);
});

// --- Auth ---
app.post('/auth/guest', (req, res) => {
  const displayName =
    (req.body?.displayName || '').trim().slice(0, 24) ||
    `Player${Math.floor(Math.random() * 9000 + 1000)}`;
  const id = nanoid(12);
  const token = nanoid(32);
  prepare(`INSERT INTO users (id, display_name, token, is_bot) VALUES (?, ?, ?, 0)`).run(
    id,
    displayName,
    token
  );
  ensureBalances(id);
  assignInviteCode(id);
  // Tight starter — enough for a few ranks, not the whole tree
  applyLedger({ userId: id, asset: 'COIN', delta: 40, reason: 'starter_pack' });
  applyLedger({ userId: id, asset: 'GEM', delta: 60, reason: 'starter_pack' });

  let invite = null;
  if (req.body?.inviteCode) {
    try {
      invite = linkInvite(id, req.body.inviteCode);
    } catch (e) {
      // non-fatal at signup
      invite = { error: e.message };
    }
  }

  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  res.json({
    token,
    user: publicUser(user),
    balances: getBalances(id),
    invite,
    disclaimer: HOUSE_DISCLAIMER,
  });
});

app.get('/me', auth, (req, res) => {
  const weekly = getUserRank('fame', 'weekly', req.user.id);
  const daily = getUserRank('fame', 'daily', req.user.id);
  const potWeekly = getUserRank('pot', 'weekly', req.user.id);
  res.json({
    user: publicUser(req.user),
    balances: getBalances(req.user.id),
    badges: getUserBadges(req.user.id),
    invite: getInviteStats(req.user.id),
    disclaimer: HOUSE_DISCLAIMER,
    rank: {
      weeklyFame: weekly,
      dailyFame: daily,
      weeklyPot: potWeekly,
      rankDelta:
        req.user.prev_weekly_fame_rank != null && weekly.rank != null
          ? req.user.prev_weekly_fame_rank - weekly.rank
          : null,
    },
    adSkipTickets: req.user.ad_skip_tickets || 0,
  });
});

/**
 * Grant ad-skip tickets (IAP hook). Real StoreKit later —
 * for now only via this endpoint when you wire purchases.
 * Body: { count: 5, receipt?: string }
 */
app.post('/me/ad-skips/grant', auth, (req, res) => {
  // Production: verify receipt. Dev: allow grant with secret or always for testing.
  const count = Math.min(50, Math.max(1, Number(req.body?.count) || 1));
  const devOk = ALLOW_DEV_CHEATS || (process.env.NODE_ENV !== 'production' && req.body?.dev === true);
  if (!devOk && !req.body?.receipt) {
    return res.status(403).json({
      error: 'Purchase required. Ad-skips only appear after a real buy.',
      code: 'NEED_PURCHASE',
    });
  }
  prepare(`UPDATE users SET ad_skip_tickets = ad_skip_tickets + ? WHERE id = ?`).run(
    count,
    req.user.id
  );
  const u = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(u),
    adSkipTickets: u.ad_skip_tickets,
    granted: count,
  });
});

/** Dev/testing: grant gems so upgrades can be tried without grinding. */
app.post('/me/gems/grant', auth, (req, res) => {
  const devOk = ALLOW_DEV_CHEATS || (process.env.NODE_ENV !== 'production' && req.body?.dev === true);
  if (!devOk) {
    return res.status(403).json({ error: 'Dev only', code: 'NEED_DEV' });
  }
  const amount = Math.min(5000, Math.max(1, Number(req.body?.amount) || 1000));
  applyLedger({
    userId: req.user.id,
    asset: 'GEM',
    delta: amount,
    reason: 'dev_gem_grant',
  });
  res.json({
    user: publicUser(prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)),
    balances: getBalances(req.user.id),
    granted: amount,
  });
});

app.post('/me/invite', auth, (req, res) => {
  try {
    const result = linkInvite(req.user.id, req.body?.code);
    res.json({ ok: true, ...result, invite: getInviteStats(req.user.id) });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/me/invite', auth, (req, res) => {
  res.json(getInviteStats(req.user.id));
});

app.patch('/me', auth, (req, res) => {
  const { displayName, archetype, drawStyle, gender, body, characterReady } = req.body || {};
  if (displayName) {
    prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(
      String(displayName).slice(0, 24),
      req.user.id
    );
  }
  const arch = ['striker', 'tank', 'rogue', 'support', 'jester'];
  if (archetype && arch.includes(archetype)) {
    prepare(`UPDATE users SET archetype = ? WHERE id = ?`).run(archetype, req.user.id);
  }
  const styles = ['dice', 'spinner', 'terminal', 'crystal', 'plinko'];
  if (drawStyle && styles.includes(drawStyle)) {
    prepare(`UPDATE users SET draw_style = ? WHERE id = ?`).run(drawStyle, req.user.id);
  }
  if (gender === 'boy' || gender === 'girl') {
    prepare(`UPDATE users SET gender = ? WHERE id = ?`).run(gender, req.user.id);
  }
  if (body) {
    prepare(`UPDATE users SET body = ? WHERE id = ?`).run(String(body).slice(0, 32), req.user.id);
  }
  if (characterReady === true) {
    prepare(`UPDATE users SET character_ready = 1 WHERE id = ?`).run(req.user.id);
  }
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: publicUser(user) });
});

/** Create / finalize character (fun-first onboarding)
 *  Free 3D path: Ready Player Me avatarUrl (models.readyplayer.me/….glb)
 *  Gender still used for painted fallbacks in fight UI.
 */
app.post('/me/character', auth, (req, res) => {
  let gender = req.body?.gender;
  const displayName = (req.body?.displayName || '').trim().slice(0, 24);
  let avatarUrl = (req.body?.avatarUrl || '').trim();

  // Only allow Ready Player Me CDN URLs (free avatar platform)
  if (avatarUrl) {
    try {
      const u = new URL(avatarUrl);
      if (u.hostname !== 'models.readyplayer.me') {
        return res.status(400).json({ error: 'Avatar must be a Ready Player Me model URL' });
      }
      // Normalize to .glb
      if (!u.pathname.endsWith('.glb')) {
        u.pathname = u.pathname.replace(/\/?$/, '') + '.glb';
      }
      avatarUrl = u.toString().split('?')[0];
    } catch {
      return res.status(400).json({ error: 'Invalid avatar URL' });
    }
  }

  if (gender !== 'boy' && gender !== 'girl') {
    // Infer a soft default from avatar; UI still asks when no RPM
    gender = req.body?.avatarUrl ? 'boy' : null;
  }
  if (!avatarUrl && gender !== 'boy' && gender !== 'girl') {
    return res.status(400).json({ error: 'Create a free 3D avatar or pick boy/girl' });
  }
  if (!gender) gender = 'boy';

  if (displayName) {
    prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(displayName, req.user.id);
  }
  prepare(
    `UPDATE users SET gender = ?, body = 'plain', character_ready = 1,
     avatar_url = COALESCE(?, avatar_url),
     upgrades_json = COALESCE(NULLIF(upgrades_json, ''), '{}'),
     room_unlocks_json = COALESCE(NULLIF(room_unlocks_json, ''), '{"maxCreateN":5}')
     WHERE id = ?`
  ).run(gender, avatarUrl || null, req.user.id);
  // First-time create: only the race + class you pick unlock free.
  // Unpicked races/classes (including Human / Warrior) cost gems later.
  const raceRaw = String(req.body?.race || 'human').toLowerCase();
  const classRaw = String(req.body?.classId || req.body?.class || 'warrior').toLowerCase();
  const racePick = ['human', 'elf', 'ork'].includes(raceRaw) ? raceRaw : 'human';
  const classPick = ['warrior', 'ranger', 'mage'].includes(classRaw)
    ? classRaw
    : 'warrior';
  bootstrapHeroes(req.user.id, { race: racePick, classId: classPick });
  try {
    equipHero(req.user.id, { race: racePick, classId: classPick });
  } catch {
    /* already set by bootstrap */
  }
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: publicUser(user), balances: getBalances(req.user.id) });
});

// --- Clans / guilds ---
app.get('/clans', (_req, res) => {
  try {
    res.json({
      clans: listClans(50),
      hint: 'Create or join a clan. Fund the chest, defend the road, raid rivals. Clan mates skip each other in pits.',
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/clans/mine', auth, (req, res) => {
  try {
    res.json(getMyClan(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

// Static paths MUST be registered before /clans/:id
app.get('/clans/chat', auth, (req, res) => {
  try {
    res.json(getClanChat(req.user.id, { limit: Number(req.query?.limit) || 50 }));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/clans/raid/open', auth, (req, res) => {
  try {
    res.json(
      listOpenSquads(req.user.id, {
        targetClanId: req.query?.targetClanId || req.query?.clanId,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/clans/war', (_req, res) => {
  try {
    res.json({ war: getWarSchedule() });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/clans/:id', auth, (req, res) => {
  try {
    const clan = getClan(req.params.id, req.user.id);
    if (!clan) return res.status(404).json({ error: 'Not found' });
    res.json({ clan });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans', auth, (req, res) => {
  try {
    res.status(201).json(createClan(req.user.id, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/join', auth, (req, res) => {
  try {
    res.json(joinClan(req.user.id, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/leave', auth, (req, res) => {
  try {
    res.json(leaveClan(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/deposit', auth, (req, res) => {
  try {
    res.json(
      depositToClan(req.user.id, {
        coins: req.body?.coins,
        gems: req.body?.gems,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/defend', auth, (req, res) => {
  try {
    res.json(startDefense(req.user.id, { hours: req.body?.hours }));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/defend/seat', auth, (req, res) => {
  try {
    res.json(
      claimDefendSeat(req.user.id, { waveIndex: req.body?.waveIndex })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/raid', auth, (req, res) => {
  try {
    res.json(
      raidClan(req.user.id, {
        targetClanId: req.body?.targetClanId || req.body?.clanId,
        maxSize: req.body?.maxSize,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/raid/open', auth, (req, res) => {
  try {
    res.json(
      openRaidSquad(req.user.id, {
        targetClanId: req.body?.targetClanId || req.body?.clanId,
        maxSize: req.body?.maxSize,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/raid/join', auth, (req, res) => {
  try {
    res.json(
      joinRaidSquad(req.user.id, { squadId: req.body?.squadId })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/chat', auth, (req, res) => {
  try {
    res.json(postClanChat(req.user.id, { body: req.body?.body || req.body?.text }));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

// Officer tools — kick / promote / settings / join requests
app.post('/clans/kick', auth, (req, res) => {
  try {
    res.json(
      kickMember(req.user.id, {
        targetUserId: req.body?.targetUserId || req.body?.userId,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/role', auth, (req, res) => {
  try {
    res.json(
      setMemberRole(req.user.id, {
        targetUserId: req.body?.targetUserId || req.body?.userId,
        role: req.body?.role,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/settings', auth, (req, res) => {
  try {
    res.json(
      updateClanSettings(req.user.id, {
        minLevel: req.body?.minLevel,
        autoAccept: req.body?.autoAccept,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/join/approve', auth, (req, res) => {
  try {
    res.json(
      approveJoinRequest(req.user.id, {
        requestId: req.body?.requestId,
        userId: req.body?.userId || req.body?.targetUserId,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/join/reject', auth, (req, res) => {
  try {
    res.json(
      rejectJoinRequest(req.user.id, {
        requestId: req.body?.requestId,
        userId: req.body?.userId || req.body?.targetUserId,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/transfer', auth, (req, res) => {
  try {
    res.json(
      transferLeadership(req.user.id, {
        targetUserId: req.body?.targetUserId || req.body?.userId,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/clans/announce', auth, (req, res) => {
  try {
    res.json(
      setClanAnnouncement(req.user.id, {
        text: req.body?.text ?? req.body?.announcement ?? req.body?.body,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

// --- Heroes: races, classes, party ---
app.get('/heroes', auth, (req, res) => {
  try {
    const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    res.json(publicHeroes(user));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/heroes/unlock-race', auth, (req, res) => {
  try {
    const out = unlockRace(req.user.id, req.body?.raceId || req.body?.race);
    res.json({ ...out, user: publicUser(prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/heroes/unlock-class', auth, (req, res) => {
  try {
    const out = unlockClass(
      req.user.id,
      req.body?.raceId || req.body?.race,
      req.body?.classId || req.body?.class
    );
    res.json({ ...out, user: publicUser(prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/heroes/equip', auth, (req, res) => {
  try {
    const out = equipHero(req.user.id, {
      race: req.body?.race || req.body?.raceId,
      classId: req.body?.classId || req.body?.class,
    });
    res.json({
      ...out,
      user: publicUser(prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)),
      balances: getBalances(req.user.id),
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/heroes/party', auth, (req, res) => {
  try {
    const out = setParty(req.user.id, req.body?.party || []);
    res.json({
      ...out,
      user: publicUser(prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)),
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/upgrades/tree', auth, (req, res) => {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const upgrades = parseUpgrades(user.upgrades_json);
  const gear = parseGear(user.gear_json);
  const gBonus = gearBonus(gear);
  res.json({
    tree: UPGRADE_TREE.map((n) => publicUpgradeNode(n, upgrades)),
    branches: [
      { id: 'atk', label: 'ATTACK', stat: 'ATK' },
      { id: 'hp', label: 'HIT POINTS', stat: 'HP' },
      { id: 'def', label: 'DEFENSE', stat: 'DEF' },
      { id: 'spd', label: 'SPEED', stat: 'SPD' },
    ],
    // kits kept for old clients — UI no longer surfaces them
    kits: [],
    // Compact — inventory levels on GET /me/gear
    gear: publicGear(gear, { compact: true }),
    gearKinds: GEAR_KINDS.map((k) => ({
      id: k.id,
      name: k.name,
      emoji: k.emoji,
      short: k.short,
    })),
    note: 'Spend gems on the tech tree. Gear drops from Campaign & pits — merge 3 into the next tier.',
    combatStats: {
      ATK: (user.power || 0) + gBonus.ATK,
      HP: (user.vitality || 0) + gBonus.HP,
      DEF: (user.guard || 0) + gBonus.DEF,
      SPD: (user.speed || 0) + gBonus.SPD,
    },
    combatStatsBase: {
      ATK: user.power || 0,
      HP: user.vitality || 0,
      DEF: user.guard || 0,
      SPD: user.speed || 0,
    },
    gearBonus: {
      ATK: gBonus.ATK,
      HP: gBonus.HP,
      DEF: gBonus.DEF,
      SPD: gBonus.SPD,
    },
  });
});

/** Full gear inventory */
app.get('/me/gear', auth, (req, res) => {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json(publicGear(parseGear(user.gear_json)));
});

/**
 * Merge 3 of same origin+slot+level → next level.
 * body: { originId, slot|kind, level|tier }
 * or legacy: { kind, tier } (finds an origin with enough pieces)
 */
app.post('/me/gear/merge', auth, (req, res) => {
  const originId = req.body?.originId || req.body?.setId;
  const slot = req.body?.slot || req.body?.kind || req.body?.slotId;
  const level = Number(req.body?.level ?? req.body?.tier);
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const gear = parseGear(user.gear_json);
  const result = originId
    ? mergeGear(gear, originId, slot, level)
    : mergeGear(gear, slot, level);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, code: 'MERGE_FAIL' });
  }
  prepare(`UPDATE users SET gear_json = ? WHERE id = ?`).run(
    serializeGear(result.gear),
    req.user.id
  );
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    gear: publicGear(result.gear),
    crafted: result.crafted,
  });
});

/**
 * Merge all possible for one origin+slot (cascades lowest → highest).
 * body: { originId, slot|kind|slotId }
 */
app.post('/me/gear/merge-all', auth, (req, res) => {
  const originId = req.body?.originId || req.body?.setId;
  const slot = req.body?.slot || req.body?.kind || req.body?.slotId;
  if (!originId || !slot) {
    return res.status(400).json({
      error: 'originId and slot required',
      code: 'MERGE_ALL_FAIL',
    });
  }
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const gear = parseGear(user.gear_json);
  const result = mergeAllGear(gear, originId, slot);
  if (!result.ok) {
    return res.status(400).json({ error: result.error, code: 'MERGE_ALL_FAIL' });
  }
  prepare(`UPDATE users SET gear_json = ? WHERE id = ?`).run(
    serializeGear(result.gear),
    req.user.id
  );
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    gear: publicGear(result.gear),
    crafted: result.crafted,
    merges: result.merges,
    highestCrafted: result.highestCrafted,
  });
});

/** Toggle auto-equip strongest piece per slot (default on). */
app.post('/me/gear/auto-equip', auth, (req, res) => {
  const enabled = req.body?.enabled !== false && req.body?.enabled !== 0;
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const gear = setAutoEquipBest(parseGear(user.gear_json), enabled);
  prepare(`UPDATE users SET gear_json = ? WHERE id = ?`).run(
    serializeGear(gear),
    req.user.id
  );
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    gear: publicGear(gear),
    message: enabled
      ? 'Auto-equip ON — highest level in each slot (may mix origins).'
      : 'Auto-equip OFF — pick an origin per slot for full-set bonuses.',
  });
});

/**
 * Manually equip an origin's piece in a slot (turns auto off).
 * body: { slot|kind, originId|setId } — omit originId to unequip
 * legacy: { kind, tier } still accepted
 */
app.post('/me/gear/equip', auth, (req, res) => {
  const slot = req.body?.slot || req.body?.kind || req.body?.slotId;
  const originId =
    req.body?.originId || req.body?.setId || req.body?.origin || null;
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  let result;
  if (req.body?.tier != null && !req.body?.originId && !req.body?.setId) {
    result = setEquippedTier(
      parseGear(user.gear_json),
      slot,
      Number(req.body.tier)
    );
  } else {
    result = setEquippedOrigin(parseGear(user.gear_json), slot, originId);
  }
  if (!result.ok) {
    return res.status(400).json({ error: result.error, code: 'EQUIP_FAIL' });
  }
  prepare(`UPDATE users SET gear_json = ? WHERE id = ?`).run(
    serializeGear(result.gear),
    req.user.id
  );
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    gear: publicGear(result.gear),
    message: originId
      ? `Equipped ${originId} ${slot}`
      : `Unequipped ${slot}`,
  });
});

app.post('/me/upgrade-node', auth, (req, res) => {
  const nodeId = req.body?.id;
  const node = UPGRADE_TREE.find((u) => u.id === nodeId);
  if (!node) return res.status(400).json({ error: 'Unknown upgrade' });

  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const upgrades = parseUpgrades(user.upgrades_json);
  const lvl = upgrades[nodeId] || 0;
  if (lvl >= node.max) return res.status(400).json({ error: 'Already maxed' });

  const gate = canBuyNode(upgrades, node);
  if (!gate.ok) {
    return res.status(400).json({ error: gate.reason, code: 'LOCKED' });
  }

  const cost = node.cost(lvl);
  try {
    applyLedger({
      userId: req.user.id,
      asset: 'GEM',
      delta: -cost,
      reason: `upgrade_${nodeId}`,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message, code: e.code });
  }

  upgrades[nodeId] = lvl + 1;
  // luck is a valid column; keep dynamic update safe
  const allowed = ['power', 'vitality', 'speed', 'luck', 'guard'];
  if (!allowed.includes(node.stat)) {
    return res.status(400).json({ error: 'Bad stat' });
  }
  prepare(
    `UPDATE users SET upgrades_json = ?, ${node.stat} = ${node.stat} + ? WHERE id = ?`
  ).run(JSON.stringify(upgrades), node.perLevel, req.user.id);

  prepare(`UPDATE users SET xp = xp + 8 WHERE id = ?`).run(req.user.id);

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    balances: getBalances(req.user.id),
    spent: cost,
    node: nodeId,
    newLevel: upgrades[nodeId],
    gain: { stat: node.stat, short: node.gainLabel, amount: node.perLevel },
  });
});

/** Equip an unlocked fighter kit for Campaign / boss fights */
app.post('/me/kit', auth, (req, res) => {
  const kitId = req.body?.id || 'rookie';
  const kit = kitById(kitId);
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!isKitUnlocked(kit, user)) {
    return res.status(400).json({
      error: kit.unlockText || 'Not unlocked yet',
      code: 'LOCKED',
    });
  }
  prepare(`UPDATE users SET fighter_kit = ? WHERE id = ?`).run(kit.id, req.user.id);
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    kit: publicKit(kit, updated, kit.id),
  });
});

/**
 * Reset all upgrades + base stats (dev). Does NOT flood gems — economy stays tight.
 */
app.post('/me/upgrades/reset', auth, (req, res) => {
  const empty = emptyUpgrades();
  prepare(
    `UPDATE users SET
      upgrades_json = ?,
      power = 10,
      vitality = 30,
      speed = 10,
      luck = 5,
      guard = 5
     WHERE id = ?`
  ).run(JSON.stringify(empty), req.user.id);

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    balances: getBalances(req.user.id),
    reset: true,
  });
});

/**
 * Full day-one restart: wipe progress, campaign, gear, wallet → starter.
 * Keeps account id/token so the browser stays logged in.
 * Body: { confirm: true }
 */
function fullRestartUser(userId) {
  const empty = emptyUpgrades();
  // Kill campaign runs
  try {
    prepare(
      `UPDATE campaign_runs SET status = 'abandoned', battle_json = NULL,
       updated_at = datetime('now')
       WHERE user_id = ? AND status NOT IN ('abandoned','cashed')`
    ).run(userId);
  } catch {
    /* table may not exist on tiny DBs */
  }
  try {
    prepare(`DELETE FROM campaign_runs WHERE user_id = ?`).run(userId);
  } catch {
    /* ignore */
  }

  prepare(
    `UPDATE users SET
      upgrades_json = ?,
      gear_json = '{}',
      fighter_kit = 'rookie',
      power = 10,
      vitality = 30,
      speed = 10,
      luck = 5,
      guard = 5,
      level = 1,
      xp = 0,
      matches_played = 0,
      character_ready = 0,
      gender = NULL,
      body = 'plain',
      avatar_url = NULL,
      room_unlocks_json = '{"maxCreateN":5}',
      campaign_high_water = 0,
      campaign_chapter_cleared = 0,
      campaign_endless_unlocked = 0,
      campaign_road_json = '{}',
      campaign_tickets_today = 0,
      campaign_tickets_day = NULL,
      daily_claim_day = NULL,
      daily_path_day = NULL,
      daily_path_step = 0,
      vip_until = NULL,
      vip_last_claim = NULL,
      road_boost_until = NULL,
      starter_pack_bought = 0,
      ad_skip_tickets = 0,
      display_name = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(empty),
    `Player${Math.floor(Math.random() * 9000 + 1000)}`,
    userId
  );

  // Wallet → exact starter
  ensureBalances(userId);
  for (const asset of ['COIN', 'GEM', 'CASH']) {
    prepare(`UPDATE balances SET amount = 0 WHERE user_id = ? AND asset = ?`).run(
      userId,
      asset
    );
  }
  applyLedger({ userId, asset: 'COIN', delta: 40, reason: 'restart_starter' });
  applyLedger({ userId, asset: 'GEM', delta: 60, reason: 'restart_starter' });

  return prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
}

app.post('/me/restart', auth, (req, res) => {
  if (req.body?.confirm !== true && req.body?.confirm !== 'true') {
    return res.status(400).json({
      error: 'Pass { "confirm": true } to wipe progress and start day one.',
      code: 'NEED_CONFIRM',
    });
  }
  const updated = fullRestartUser(req.user.id);
  res.json({
    ok: true,
    restarted: true,
    user: publicUser(updated),
    balances: getBalances(req.user.id),
    message: 'Fresh start — pick your character again.',
  });
});

// --- Store (real-money catalog; mock checkout until App Store / Play receipts) ---
// GET /store is also the Expo web page path — browser HTML → SPA, fetch → JSON API
app.get('/store', spaOrAuth((req, res) => {
  try {
    const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    res.json(getStoreCatalog(user));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
}));

app.post('/store/purchase', auth, (req, res) => {
  try {
    res.json(
      purchaseProduct(req.user.id, req.body?.productId || req.body?.id, {
        mock: req.body?.mock !== false,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

/** Gear shop — gem packs (L1) or mock USD packs (L1 pick / L2 / super + L3 pick) */
app.post('/store/gear', auth, (req, res) => {
  try {
    res.json(
      purchaseGearShop(req.user.id, req.body?.offerId || req.body?.id, {
        originId: req.body?.originId || null,
        slotId: req.body?.slotId || req.body?.kind || null,
        pickOriginId: req.body?.pickOriginId || null,
        pickSlotId: req.body?.pickSlotId || null,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/store/daily-claim', auth, (req, res) => {
  try {
    res.json(
      claimDaily(req.user.id, {
        mockAd: req.body?.mockAd !== false,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code, node: e.node });
  }
});

/** Buy the current paid node on the infinite daily path (mock IAP) */
app.post('/store/daily-path-buy', auth, (req, res) => {
  try {
    res.json(
      claimDailyPathBuy(req.user.id, {
        mock: req.body?.mock !== false,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code, node: e.node });
  }
});

app.get('/room-unlocks', auth, (req, res) => {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const maxCreateN = parseUnlockedMaxN(user.room_unlocks_json);
  const upgrades = parseUpgrades(user.upgrades_json);
  const points = totalUpgradePoints(upgrades);
  const ladder = ROOM_SIZE_LADDER.map((t) => {
    const unlocked = maxCreateN >= t.maxN;
    const reqs = canMeetRequirements(t, {
      matchesPlayed: user.matches_played,
      upgradePoints: points,
    });
    return {
      maxN: t.maxN,
      label: t.label,
      gemCost: t.gemCost,
      matches: t.matches,
      upgradePoints: t.upgradePoints || 0,
      unlocked,
      requirementsMet: reqs.ok,
      requirementHint: reqs.ok ? null : reqs.reason,
      isNext: !unlocked && nextUnlock(maxCreateN)?.maxN === t.maxN,
    };
  });
  res.json({
    maxCreateN,
    absoluteMax: ABSOLUTE_MAX_N,
    matchesPlayed: user.matches_played,
    upgradePoints: points,
    gems: getBalances(user.id).GEM,
    ladder,
  });
});

/** Dev / testing: unlock every host size (N≤1000). */
app.post('/me/room-unlocks/all', auth, (req, res) => {
  const devOk = ALLOW_DEV_CHEATS || (process.env.NODE_ENV !== 'production' && req.body?.dev === true);
  if (!devOk) {
    return res.status(403).json({ error: 'Dev only', code: 'NEED_DEV' });
  }
  prepare(`UPDATE users SET room_unlocks_json = ? WHERE id = ?`).run(
    JSON.stringify({ maxCreateN: ABSOLUTE_MAX_N }),
    req.user.id
  );
  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({
    user: publicUser(updated),
    balances: getBalances(req.user.id),
    unlockedMaxN: ABSOLUTE_MAX_N,
    label: 'All host sizes',
  });
});

/** Spend gems to unlock next create-size tier (must meet match/upgrade gates first). */
app.post('/room-unlocks/buy', auth, (req, res) => {
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  const maxCreateN = parseUnlockedMaxN(user.room_unlocks_json);
  const tier = nextUnlock(maxCreateN);
  if (!tier) {
    return res.status(400).json({ error: 'All pit sizes unlocked (max 1000)' });
  }

  const upgrades = parseUpgrades(user.upgrades_json);
  const points = totalUpgradePoints(upgrades);
  const reqs = canMeetRequirements(tier, {
    matchesPlayed: user.matches_played,
    upgradePoints: points,
  });
  if (!reqs.ok) {
    return res.status(400).json({ error: reqs.reason, code: 'LOCKED' });
  }

  try {
    applyLedger({
      userId: user.id,
      asset: 'GEM',
      delta: -tier.gemCost,
      reason: `unlock_create_n_${tier.maxN}`,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message, code: e.code });
  }

  prepare(`UPDATE users SET room_unlocks_json = ? WHERE id = ?`).run(
    JSON.stringify({ maxCreateN: tier.maxN }),
    user.id
  );

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
  res.json({
    user: publicUser(updated),
    balances: getBalances(user.id),
    unlockedMaxN: tier.maxN,
    label: tier.label,
  });
});

/** Custom room create for Random / PvP — N capped by unlock ladder */
app.post('/rooms/custom', auth, (req, res) => {
  try {
    const mode = req.body?.mode === 'pvp' ? 'pvp' : 'random';
    const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    const maxCreateN = parseUnlockedMaxN(user.room_unlocks_json);
    let n = Math.min(ABSOLUTE_MAX_N, Math.max(4, Number(req.body?.n) || 5));
    if (n > maxCreateN) {
      return res.status(400).json({
        error: `Your create limit is N=${maxCreateN}. Unlock larger pits first.`,
        code: 'CREATE_CAP',
        maxCreateN,
      });
    }

    const gemStake =
      mode === 'pvp' ? Math.max(1, Math.min(100, Number(req.body?.gemStake) || 2)) : 0;

    // Build-your-own: ads per ticket → pot multiplies by that amount
    let ads_per_ticket = 0;
    if (mode !== 'pvp') {
      const raw = Number(req.body?.adsPerTicket ?? req.body?.ads_per_ticket ?? 1);
      ads_per_ticket = ADS_PER_TICKET_OPTIONS.includes(raw) ? raw : 1;
    }

    const title =
      mode === 'pvp'
        ? `PvP ×${n} · ${gemStake}💎`
        : ads_per_ticket > 1
          ? `Pit ×${n} · ${ads_per_ticket} ads (×${ads_per_ticket} pot)`
          : `Pit ×${n} · 1 ad`;

    const id = nanoid(10);
    // Random/host pits always use AD entry so multi-ad rooms are enforced
    const entry_type = mode === 'pvp' ? 'GEM' : 'AD';
    const stake = mode === 'pvp' ? gemStake : 0;
    const coin_per_ticket = mode === 'pvp' ? 0 : 1;
    const rake = mode === 'pvp' ? 0.1 : 0;
    const allows_house = mode === 'pvp' ? 0 : 1;
    const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    // Free/random + House: pot includes all seats (fair odds). PvP: humans only.
    const pot_humans_only = mode === 'pvp' ? 1 : 0;
    prepare(
      `INSERT INTO rooms (
        id, title, status, n, entry_type, stake, ads_per_ticket, coin_per_ticket,
        rake, max_level, allows_house, pot_humans_only, team_split_enabled, expires_at
      ) VALUES (?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, 50, ?, ?, 0, ?)`
    ).run(
      id,
      title,
      n,
      entry_type,
      stake,
      ads_per_ticket,
      coin_per_ticket,
      rake,
      allows_house,
      pot_humans_only,
      expires
    );

    const room = getRoom(id);
    res.status(201).json({
      ...room,
      potEstimate: n * coin_per_ticket * potAdMultiplier(room),
      adsPerTicket: ads_per_ticket,
      adsOptions: ADS_PER_TICKET_OPTIONS,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/me/upgrade', auth, (req, res) => {
  const { stat } = req.body || {};
  const allowed = ['power', 'vitality', 'speed', 'luck', 'guard'];
  if (!allowed.includes(stat)) return res.status(400).json({ error: 'Invalid stat' });
  try {
    applyLedger({
      userId: req.user.id,
      asset: 'GEM',
      delta: -5,
      reason: 'stat_upgrade',
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  prepare(`UPDATE users SET ${stat} = ${stat} + 1 WHERE id = ?`).run(req.user.id);
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: publicUser(user), balances: getBalances(req.user.id) });
});

// --- Rooms ---
app.get('/templates', (_req, res) => {
  res.json({ templates: ROOM_TEMPLATES, disclaimer: HOUSE_DISCLAIMER });
});

app.get('/rooms', (_req, res) => {
  res.json({ rooms: listOpenRooms(), disclaimer: HOUSE_DISCLAIMER });
});

/** Betting Pit lobby — humans-only COIN/GEM rooms (no House autofill). */
app.get('/rooms/betting', (_req, res) => {
  res.json({
    rooms: listBettingRooms(),
    disclaimer: 'Real players only. Create a table or join one and wait until it fills.',
  });
});

app.get('/rooms/mine', auth, (req, res) => {
  const rooms = myRooms(req.user.id);
  res.json({
    rooms,
    waiting: rooms.filter((r) => r.waiting),
    ready: rooms.filter((r) => r.ready),
  });
});

/**
 * Alerts for pits you joined that finished (or are about to).
 * Client polls this for push-style banners / browser notifications.
 */
app.get('/me/match-alerts', auth, (req, res) => {
  const rooms = myRooms(req.user.id);
  const waiting = rooms.filter((r) => r.waiting);
  const ready = rooms.filter((r) => r.ready).slice(0, 10);
  res.json({
    waiting,
    ready,
    hasReady: ready.length > 0,
    hasWaiting: waiting.length > 0,
    message: ready.length
      ? `${ready.length} match${ready.length === 1 ? '' : 'es'} ready to watch`
      : waiting.length
        ? `Waiting on ${waiting.length} open pit${waiting.length === 1 ? '' : 's'}`
        : null,
  });
});

/** Create humans-only bet room and auto-seat the host. */
app.post('/rooms/betting', auth, (req, res) => {
  try {
    const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    const currency =
      String(req.body?.currency || req.body?.entry || 'GEM').toUpperCase() === 'COIN'
        ? 'COIN'
        : 'GEM';
    const room = createBettingRoom({
      hostUser: user,
      n: req.body?.n,
      stake: req.body?.stake ?? req.body?.gemStake,
      currency,
    });
    // Host takes seat 1 automatically
    const joined = joinRoom(room.id, user, { mockAd: false, adsWatched: 0 });
    res.status(201).json({
      ...joined.room,
      ticketNumber: joined.ticketNumber,
      hostSeated: true,
      message: 'Table open — waiting for real players. You’ll be notified when it fills.',
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/rooms', auth, (req, res) => {
  try {
    const template = req.body?.template || 'ad_pot_10';
    const room = createRoomFromTemplate(template, {
      max_level: req.body?.maxLevel,
      title: req.body?.title,
    });
    res.status(201).json(room);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/rooms/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Not found' });
  res.json(room);
});

app.post('/rooms/:id/join', auth, (req, res) => {
  try {
    const mockAd = req.body?.mockAd !== false;
    const useSkipTicket = !!req.body?.useSkipTicket;
    const adsWatched = Number(req.body?.adsWatched) || 0;
    // re-fetch user for skip balance
    const user = prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
    const result = joinRoom(req.params.id, user, { mockAd, useSkipTicket, adsWatched });
    res.json(result);
  } catch (e) {
    res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({
      error: e.message,
      code: e.code,
      adsRequired: e.adsRequired,
      adsWatched: e.adsWatched,
    });
  }
});

app.post('/rooms/:id/fill-bots', auth, (req, res) => {
  try {
    const room = fillWithBots(req.params.id);
    res.json(room);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Drip House seats (batch ok — client uses this for fill animation). */
app.post('/rooms/:id/drip-house', auth, (req, res) => {
  try {
    // Was hard-capped at 5 which made N=100/1000 fills stall (hundreds of round-trips).
    const count = Math.min(250, Math.max(1, Number(req.body?.count) || 1));
    const room = dripHouse(req.params.id, count);
    res.json(room);
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/meta/costs', (_req, res) => {
  res.json({
    tickets: 'Each pot ticket = 1 ad, OR 1 ad-skip if you own skips from IAP',
    coins: 'Jackpot / pot prize currency (not for buying tickets)',
    gems: 'Upgrades',
  });
});

app.post('/rooms/:id/resolve', auth, (req, res) => {
  const room = resolveRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Not found' });
  res.json(room);
});

// --- Leaderboards ---
// --- Campaign / Hero Path ---
// GET /campaign is also the Expo web page path — browser HTML → SPA, fetch → JSON API
app.get('/campaign', spaOrAuth((req, res) => {
  try {
    res.json(getCampaignStatus(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
}));

app.post('/campaign/start', auth, (req, res) => {
  try {
    const run = startCampaign(req.user.id, {
      mode: req.body?.mode === 'endless' ? 'endless' : 'story',
      chapter: req.body?.chapter,
    });
    res.status(201).json({ run, balances: getBalances(req.user.id) });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/story-ack', auth, (req, res) => {
  try {
    res.json(campaignAckStory(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/path', auth, (req, res) => {
  try {
    res.json(
      campaignChoosePath(req.user.id, { path: req.body?.path || 'safe' })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

/** Map: tap a stage — frontier free, older stages need ad (mockAd) */
app.post('/campaign/enter-stage', auth, (req, res) => {
  try {
    res.json(
      campaignEnterStage(req.user.id, {
        stage: req.body?.stage,
        mockAd: !!req.body?.mockAd,
      })
    );
  } catch (e) {
    res.status(400).json({
      error: e.message,
      code: e.code,
      stage: e.stage,
      reason: e.reason,
    });
  }
});

/** Leave unfinished fight → map */
app.post('/campaign/leave-battle', auth, (req, res) => {
  try {
    res.json(campaignLeaveBattle(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/campaign/encounter', auth, (req, res) => {
  try {
    res.json(campaignEncounter(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/battle/start', auth, (req, res) => {
  try {
    res.json(campaignStartBattle(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/battle/act', auth, (req, res) => {
  try {
    res.json(
      campaignBattleAct(req.user.id, {
        action: req.body?.action || 'attack',
        targetId: req.body?.targetId || req.body?.targetUserId,
        buff: req.body?.buff || req.body?.stat,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/boss-pick', auth, (req, res) => {
  try {
    res.json(
      campaignBossPick(req.user.id, {
        stat: req.body?.stat,
        watchAd: !!req.body?.watchAd,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/fight', auth, (req, res) => {
  try {
    const result = campaignFight(req.user.id, {
      stance: req.body?.stance || 'hold',
      targetUserId: req.body?.targetUserId || null,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/equip', auth, (req, res) => {
  try {
    res.json(
      campaignEquip(req.user.id, {
        slot: req.body?.slot,
        skip: !!req.body?.skip,
      })
    );
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/choose', auth, (req, res) => {
  try {
    const result = campaignChoose(req.user.id, {
      blessingId: req.body?.blessingId,
      slot: req.body?.slot,
      path: req.body?.path,
      skip: !!req.body?.skip,
      cashOut: !!req.body?.cashOut,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/cashout', auth, (req, res) => {
  try {
    res.json(campaignCashOut(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/revive', auth, (req, res) => {
  try {
    // Client shows ad first; this marks revive used
    res.json(campaignRevive(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.post('/campaign/abandon', auth, (req, res) => {
  try {
    res.json(campaignAbandon(req.user.id));
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code });
  }
});

app.get('/leaderboards/:board/:period', (req, res) => {
  const { board, period } = req.params;
  if (!['pot', 'arena', 'fame', 'players'].includes(board)) {
    return res.status(400).json({ error: 'board must be pot|arena|fame|players' });
  }
  if (!['daily', 'weekly', 'monthly', 'all'].includes(period)) {
    return res.status(400).json({ error: 'period must be daily|weekly|monthly|all' });
  }
  const limit = Math.min(100, Number(req.query.limit) || 50);
  res.json({
    board,
    period,
    entries: getLeaderboard(board, period, limit),
    hint:
      board === 'players'
        ? 'Everyone who made a hero — ranked by matches, level, and road progress.'
        : board === 'fame'
          ? 'Pot + arena score. Empty periods fall back to active players.'
          : null,
  });
});

app.post('/leaderboards/award-badges', auth, (req, res) => {
  const period = req.body?.period || 'daily';
  res.json({ awarded: awardLeaderboardBadges(period), period });
});

function ensureDemoRooms() {
  const count = prepare(
    `SELECT COUNT(*) AS c FROM rooms WHERE status IN ('OPEN','FILLING')`
  ).get().c;
  if (count === 0) {
    createRoomFromTemplate('free_quick');
    createRoomFromTemplate('ad_pot_10');
    createRoomFromTemplate('ad_pot_25');
    createRoomFromTemplate('coin_stakes_10');
    createRoomFromTemplate('gem_arena_10');
    console.log('Seeded demo rooms');
  }
}
ensureDemoRooms();

// --- Static web client (Expo export → server/public) for one-box free host ---
if (fs.existsSync(PUBLIC_DIR)) {
  // Root always serves the app shell (pit splash → start)
  app.get(['/', '/index.html'], (req, res, next) => {
    if (req.headers.authorization || req.headers['x-token']) return next();
    return sendSpa(res);
  });
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
      index: false,
      fallthrough: true,
    })
  );
  // SPA fallback for expo-router client routes (browser HTML navigations)
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (path.extname(req.path)) return next();
    // Never SPA-steal authenticated API probes
    if (req.headers.authorization || req.headers['x-token']) return next();
    if (!prefersHtml(req)) return next();
    return sendSpa(res);
  });
  console.log(`Serving web client from ${PUBLIC_DIR}`);
} else {
  console.log(`No public/ web build at ${PUBLIC_DIR} (API only)`);
}

// House fill drip + expiry + clan defense timers
setInterval(() => {
  try {
    const held = tickClanDefenses();
    if (held) console.log(`Clan defenses held: ${held}`);
  } catch (e) {
    console.error('clan tick', e.message);
  }
  const n = cancelExpiredRooms();
  if (n) console.log(`Cancelled ${n} expired rooms`);

  const { filled, resolved } = tickHouseFill();
  if (filled) console.log(`House filled ${filled} seats`);
  for (const id of resolved) {
    try {
      resolveRoom(id);
      console.log(`Resolved room ${id} after house fill`);
    } catch (e) {
      console.error('resolve failed', id, e.message);
    }
  }

  // Keep open free/ad rooms available
  const open = prepare(
    `SELECT COUNT(*) AS c FROM rooms WHERE status IN ('OPEN','FILLING') AND entry_type IN ('FREE','AD')`
  ).get().c;
  if (open < 3) {
    createRoomFromTemplate('free_quick');
    createRoomFromTemplate('ad_pot_10');
  }
}, 3000);

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Pot & Arena http://${HOST}:${PORT}`);
  console.log(`House bots: ${getFlagBool('house_bots_enabled', true)}`);
  console.log(`Dev cheats: ${ALLOW_DEV_CHEATS ? 'ON' : 'OFF'} (NODE_ENV=${process.env.NODE_ENV || 'unset'})`);
});
