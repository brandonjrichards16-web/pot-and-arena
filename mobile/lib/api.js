import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * API base URL:
 * - EXPO_PUBLIC_API_URL wins when set (build-time or env)
 * - Web same-origin (empty) when hosted with the API (Fly/Render one-box)
 * - Web Metro dev (ports 8081/19006/8080) → API on :3847
 * - Android emulator → 10.0.2.2; native sim → 127.0.0.1
 */
function defaultApiBase() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const port = String(window.location.port || '');
    if (port === '8081' || port === '19006' || port === '8080') {
      return `${window.location.protocol}//${window.location.hostname}:3847`;
    }
    // Production / one-box: same origin (API + static on one host)
    return '';
  }
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  return `http://${host}:3847`;
}

export const API_BASE = process.env.EXPO_PUBLIC_API_URL || defaultApiBase();

const TOKEN_KEY = 'paa_token';

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = true, timeoutMs = 20000 } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    // Force JSON so shared paths (/campaign, /store) never return the SPA HTML shell
    Accept: 'application/json',
  };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    ctrl && timeoutMs > 0
      ? setTimeout(() => ctrl.abort(), timeoutMs)
      : null;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl?.signal,
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    if (e?.name === 'AbortError') {
      throw new Error('Server is waking up — tap again in a few seconds');
    }
    throw e;
  }
  if (timer) clearTimeout(timer);

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // HTML or garbage (SPA shell / cold error page) — never treat as success
    if (!res.ok) {
      throw Object.assign(new Error(res.statusText || 'Request failed'), {
        status: res.status,
      });
    }
    throw new Error('Got a web page instead of game data — refresh and try again');
  }
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  meta: () => request('/meta', { auth: false }),
  guest: (displayName, inviteCode) =>
    request('/auth/guest', {
      method: 'POST',
      auth: false,
      body: { displayName, inviteCode: inviteCode || undefined },
    }),
  me: () => request('/me'),
  rooms: () => request('/rooms', { auth: false }),
  /** Humans-only COIN/GEM betting tables */
  bettingRooms: () => request('/rooms/betting', { auth: false }),
  createBettingRoom: (body) =>
    request('/rooms/betting', { method: 'POST', body: body || {} }),
  room: (id) => request(`/rooms/${id}`, { auth: false }),
  myRooms: async () => {
    const data = await request('/rooms/mine');
    // Support both { rooms: [] } and legacy array
    if (Array.isArray(data)) return { rooms: data, waiting: [], ready: [] };
    return data;
  },
  matchAlerts: () => request('/me/match-alerts'),
  createRoom: (template) => request('/rooms', { method: 'POST', body: { template } }),
  join: (id, opts = {}) =>
    request(`/rooms/${id}/join`, {
      method: 'POST',
      body: {
        mockAd: opts.useSkipTicket ? false : opts.mockAd !== false,
        useSkipTicket: !!opts.useSkipTicket,
        /** How many rewarded ads completed for this ticket (must meet room.ads_per_ticket) */
        adsWatched: opts.adsWatched ?? (opts.useSkipTicket ? 0 : opts.mockAd === false ? 0 : 1),
      },
    }),
  fillBots: (id) => request(`/rooms/${id}/fill-bots`, { method: 'POST', body: {} }),
  dripHouse: (id, count = 1) =>
    request(`/rooms/${id}/drip-house`, { method: 'POST', body: { count } }),
  leaderboard: (board, period) =>
    request(`/leaderboards/${board}/${period}`, { auth: false }),
  upgrade: (stat) => request('/me/upgrade', { method: 'POST', body: { stat } }),
  patchMe: (body) => request('/me', { method: 'PATCH', body }),
  inviteStats: () => request('/me/invite'),
  applyInvite: (code) => request('/me/invite', { method: 'POST', body: { code } }),
  createCharacter: (body) => request('/me/character', { method: 'POST', body }),
  /** Clans / guilds */
  clans: () => request('/clans', { auth: false }),
  myClan: () => request('/clans/mine'),
  clan: (id) => request(`/clans/${id}`, { auth: false }),
  createClan: (body) => request('/clans', { method: 'POST', body }),
  joinClan: (body) => request('/clans/join', { method: 'POST', body }),
  leaveClan: () => request('/clans/leave', { method: 'POST', body: {} }),
  clanDeposit: (body) => request('/clans/deposit', { method: 'POST', body }),
  clanDefend: (body = {}) => request('/clans/defend', { method: 'POST', body }),
  clanDefendSeat: (body = {}) =>
    request('/clans/defend/seat', { method: 'POST', body }),
  clanRaid: (targetClanId, maxSize = 1) =>
    request('/clans/raid', {
      method: 'POST',
      body: { targetClanId, maxSize },
    }),
  clanRaidOpen: (body) =>
    request('/clans/raid/open', { method: 'POST', body: body || {} }),
  clanRaidJoin: (squadId) =>
    request('/clans/raid/join', { method: 'POST', body: { squadId } }),
  clanOpenSquads: (targetClanId) =>
    request(
      `/clans/raid/open${targetClanId ? `?targetClanId=${encodeURIComponent(targetClanId)}` : ''}`
    ),
  clanChat: () => request('/clans/chat'),
  clanChatPost: (body) =>
    request('/clans/chat', { method: 'POST', body: { body } }),
  clanKick: (targetUserId) =>
    request('/clans/kick', { method: 'POST', body: { targetUserId } }),
  clanSetRole: (targetUserId, role) =>
    request('/clans/role', { method: 'POST', body: { targetUserId, role } }),
  clanSettings: (body) =>
    request('/clans/settings', { method: 'POST', body: body || {} }),
  clanJoinApprove: (body) =>
    request('/clans/join/approve', { method: 'POST', body: body || {} }),
  clanJoinReject: (body) =>
    request('/clans/join/reject', { method: 'POST', body: body || {} }),
  clanTransfer: (targetUserId) =>
    request('/clans/transfer', { method: 'POST', body: { targetUserId } }),
  clanAnnounce: (text) =>
    request('/clans/announce', { method: 'POST', body: { text } }),
  clanWar: () => request('/clans/war', { auth: false }),

  /** Races / classes / party */
  heroes: () => request('/heroes'),
  unlockRace: (raceId) =>
    request('/heroes/unlock-race', { method: 'POST', body: { raceId } }),
  unlockClass: (raceId, classId) =>
    request('/heroes/unlock-class', {
      method: 'POST',
      body: { raceId, classId },
    }),
  equipHero: (race, classId) =>
    request('/heroes/equip', { method: 'POST', body: { race, classId } }),
  setParty: (party) =>
    request('/heroes/party', { method: 'POST', body: { party } }),
  /** body: { avatarUrl, gender? } — Ready Player Me free GLB */
  upgradeTree: () => request('/upgrades/tree'),
  upgradeNode: (id) => request('/me/upgrade-node', { method: 'POST', body: { id } }),
  /** Equip fighter kit for Campaign / boss fights (legacy — UI no longer shows kits) */
  setKit: (id) => request('/me/kit', { method: 'POST', body: { id } }),
  /** Gear inventory (4 kinds · merge · optional auto-equip) */
  gear: () => request('/me/gear'),
  gearMerge: (kindOrOrigin, tierOrSlot, level) => {
    // New: (originId, slot, level) or legacy (kind, tier)
    if (level != null) {
      return request('/me/gear/merge', {
        method: 'POST',
        body: { originId: kindOrOrigin, slot: tierOrSlot, level },
      });
    }
    return request('/me/gear/merge', {
      method: 'POST',
      body: { kind: kindOrOrigin, tier: tierOrSlot },
    });
  },
  /** Merge every possible level for one origin+slot (cascades). */
  gearMergeAll: (originId, slotId) =>
    request('/me/gear/merge-all', {
      method: 'POST',
      body: { originId, slot: slotId },
    }),
  gearAutoEquip: (enabled) =>
    request('/me/gear/auto-equip', {
      method: 'POST',
      body: { enabled: !!enabled },
    }),
  gearEquip: (slotOrKind, originOrTier) => {
    if (typeof originOrTier === 'string' || originOrTier == null) {
      return request('/me/gear/equip', {
        method: 'POST',
        body: { slot: slotOrKind, originId: originOrTier || null },
      });
    }
    return request('/me/gear/equip', {
      method: 'POST',
      body: { kind: slotOrKind, tier: originOrTier },
    });
  },
  /** Wipe upgrades + base stats; top up gems to retry bare → max look path */
  resetUpgrades: () => request('/me/upgrades/reset', { method: 'POST', body: {} }),
  createCustomRoom: (body) => request('/rooms/custom', { method: 'POST', body }),
  roomUnlocks: () => request('/room-unlocks'),
  buyRoomUnlock: () => request('/room-unlocks/buy', { method: 'POST', body: {} }),
  /** Dev: unlock every create size (N≤1000) */
  unlockAllPits: () =>
    request('/me/room-unlocks/all', { method: 'POST', body: { dev: true } }),
  /** Dev only: top up gems for testing */
  grantGems: (amount = 100) =>
    request('/me/gems/grant', { method: 'POST', body: { dev: true, amount } }),

  // Real-money store (mock checkout until App Store / Play)
  store: () => request('/store'),
  storePurchase: (productId) =>
    request('/store/purchase', {
      method: 'POST',
      body: { productId, mock: true },
    }),
  storeGearBuy: (offerId, opts = {}) =>
    request('/store/gear', {
      method: 'POST',
      body: {
        offerId,
        originId: opts.originId || null,
        slotId: opts.slotId || null,
        pickOriginId: opts.pickOriginId || null,
        pickSlotId: opts.pickSlotId || null,
      },
    }),
  storeDailyClaim: (opts = {}) =>
    request('/store/daily-claim', {
      method: 'POST',
      body: { mockAd: opts.mockAd !== false },
    }),
  /** Buy current paid node on the daily reward path (mock IAP) */
  storeDailyPathBuy: () =>
    request('/store/daily-path-buy', {
      method: 'POST',
      body: { mock: true },
    }),

  // Campaign (Pit Road story)
  campaign: () => request('/campaign'),
  campaignStart: (body = {}) =>
    request('/campaign/start', { method: 'POST', body }),
  campaignStoryAck: () =>
    request('/campaign/story-ack', { method: 'POST', body: {} }),
  campaignPath: (path) =>
    request('/campaign/path', { method: 'POST', body: { path } }),
  /** Pick a stage on the map. Replay of old stages: { stage, mockAd: true } */
  campaignEnterStage: (body = {}) =>
    request('/campaign/enter-stage', { method: 'POST', body }),
  campaignLeaveBattle: () =>
    request('/campaign/leave-battle', { method: 'POST', body: {} }),
  campaignEncounter: () => request('/campaign/encounter'),
  campaignBattleStart: () =>
    request('/campaign/battle/start', { method: 'POST', body: {} }),
  campaignBattleAct: (body) =>
    request('/campaign/battle/act', { method: 'POST', body: body || {} }),
  campaignBossPick: (body) =>
    request('/campaign/boss-pick', { method: 'POST', body: body || {} }),
  campaignFight: (stance, targetUserId) =>
    request('/campaign/fight', {
      method: 'POST',
      body: { stance, targetUserId: targetUserId || undefined },
    }),
  campaignEquip: (body) =>
    request('/campaign/equip', { method: 'POST', body: body || {} }),
  campaignChoose: (body) =>
    request('/campaign/choose', { method: 'POST', body: body || {} }),
  campaignCashOut: () => request('/campaign/cashout', { method: 'POST', body: {} }),
  campaignRevive: () => request('/campaign/revive', { method: 'POST', body: {} }),
  campaignAbandon: () => request('/campaign/abandon', { method: 'POST', body: {} }),
};
