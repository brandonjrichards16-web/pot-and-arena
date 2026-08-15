/**
 * In-app store — mock real-money purchases (receipt verify later).
 * Grants gems, ad-skips, VIP month, campaign road boost.
 */
import { nanoid } from 'nanoid';
import { prepare } from './db.js';
import { applyLedger, getBalances } from './ledger.js';
import {
  STORE_PRODUCTS,
  productById,
  gemsForProduct,
  VIP_PASS,
  DAILY_FREE,
  STARTER,
  dailyPathNode,
  dailyPathPreview,
} from './economy.js';
import {
  parseGear,
  serializeGear,
  publicGear,
  GEAR_SHOP,
  applyGearShopPurchase,
} from './gear.js';

export function ensureStoreColumns() {
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
  add('vip_until', 'TEXT');
  add('vip_last_claim', 'TEXT');
  add('daily_claim_day', 'TEXT');
  add('daily_path_day', 'TEXT');
  add('daily_path_step', 'INTEGER NOT NULL DEFAULT 0');
  add('starter_pack_bought', 'INTEGER NOT NULL DEFAULT 0');
  add('road_boost_until', 'TEXT');
  add('iap_json', "TEXT DEFAULT '[]'");

  prepare(`
    CREATE TABLE IF NOT EXISTS store_purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      price_usd REAL NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function isActiveUntil(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export function vipActive(user) {
  return isActiveUntil(user?.vip_until);
}

export function roadBoostActive(user) {
  return isActiveUntil(user?.road_boost_until);
}

/** Current daily path step for user (resets on new calendar day) */
export function getDailyPathState(user) {
  ensureStoreColumns();
  const today = dayKey();
  const day = user.daily_path_day || user.daily_claim_day || null;
  let step = Number(user.daily_path_step) || 0;
  if (day !== today) {
    step = 0;
  }
  const current = dailyPathNode(step);
  const nodes = dailyPathPreview(step);
  return {
    day: today,
    step,
    current,
    nodes,
    canClaim: current.type === 'free' || current.type === 'ad',
    canBuy: current.type === 'buy',
    // legacy fields so old clients still show something
    freeGems: DAILY_FREE.gems,
    freeCoins: DAILY_FREE.coins,
    canClaimFree: current.type === 'free',
  };
}

function ensurePathDay(user) {
  const today = dayKey();
  if (user.daily_path_day !== today) {
    prepare(
      `UPDATE users SET daily_path_day = ?, daily_path_step = 0 WHERE id = ?`
    ).run(today, user.id);
    return { ...user, daily_path_day: today, daily_path_step: 0 };
  }
  return user;
}

function grantPathRewards(userId, node, reason) {
  if (node.gems > 0) {
    applyLedger({
      userId,
      asset: 'GEM',
      delta: node.gems,
      reason,
      refType: 'daily_path',
      refId: String(node.index),
    });
  }
  if (node.coins > 0) {
    applyLedger({
      userId,
      asset: 'COIN',
      delta: node.coins,
      reason,
      refType: 'daily_path',
      refId: String(node.index),
    });
  }
  if (node.adSkips) {
    prepare(
      `UPDATE users SET ad_skip_tickets = COALESCE(ad_skip_tickets,0) + ? WHERE id = ?`
    ).run(node.adSkips, userId);
  }
}

export function getStoreCatalog(user) {
  ensureStoreColumns();
  const vip = vipActive(user);
  const products = STORE_PRODUCTS.map((p) => {
    const soldOut =
      p.oneTime && Number(user.starter_pack_bought || 0) === 1 && p.id === 'starter_pack';
    const gems = gemsForProduct(p, { vipActive: vip });
    return {
      id: p.id,
      sku: p.sku,
      type: p.type,
      priceUsd: p.priceUsd,
      label: p.label,
      blurb: p.blurb,
      tag: p.tag,
      gems: p.gems || 0,
      bonusGems: p.bonusGems || 0,
      gemsTotal: gems,
      adSkips: p.adSkips || 0,
      durationDays: p.durationDays || null,
      perks: p.perks || null,
      oneTime: !!p.oneTime,
      soldOut: !!soldOut,
      vipBonusApplied: vip && p.type === 'gems',
    };
  });

  const bal = getBalances(user.id);
  const gemBal = Math.floor(bal.GEM || 0);
  const gearOffers = GEAR_SHOP.map((o) => {
    const isGem = (o.currency || 'GEM') === 'GEM';
    const gemCost = isGem ? o.gemCost || 0 : 0;
    return {
      id: o.id,
      label: o.label,
      blurb: o.blurb,
      tag: o.tag,
      section: o.section || 'other',
      mode: o.mode,
      originId: o.originId || null,
      level: o.level || 1,
      count: o.count || 1,
      packCount: o.packCount || null,
      bonusLevel: o.bonusLevel || null,
      color: o.color || null,
      gemCost,
      priceUsd: o.priceUsd != null ? o.priceUsd : null,
      currency: o.currency || 'GEM',
      needsPiecePick: o.mode === 'pick_piece',
      needsL3Pick: o.mode === 'super_random' || o.mode === 'super_origin',
      canAfford: isGem ? gemBal >= gemCost : true, // USD mock always "affordable"
    };
  });

  return {
    products,
    gearShop: gearOffers,
    gearSections: [
      {
        id: 'gem_l1',
        title: 'GEAR · GEM PACKS (L1)',
        hint: 'Affordable merge fuel. Random any-origin is cheapest; origin-locked costs more.',
      },
      {
        id: 'usd_piece',
        title: 'GEAR · PICK A PIECE (L1)',
        hint: 'Real-money gap fill — one L1 piece you choose. Still merge to grow it.',
      },
      {
        id: 'usd_l2',
        title: 'GEAR · ADEPT PACKS (L2)',
        hint: 'Random L2 crates. Origin-locked is pricier than full random.',
      },
      {
        id: 'usd_super',
        title: 'GEAR · SUPER (10× + FREE L3)',
        hint: 'Buy ten packs at once — bulk price + any L3 piece of your choice as a bonus.',
      },
    ],
    vip: {
      active: vip,
      until: user.vip_until || null,
      dailyGems: VIP_PASS.dailyGems,
      dailyAdSkips: VIP_PASS.dailyAdSkips,
      shopGemBonusPct: VIP_PASS.shopGemBonusPct,
      canClaimToday: vip && user.vip_last_claim !== dayKey(),
      perks: VIP_PASS.perks,
    },
    roadBoost: {
      active: roadBoostActive(user),
      until: user.road_boost_until || null,
    },
    daily: getDailyPathState(user),
    disclaimer:
      'Purchases never change pot / lottery odds. Shop gear is low-level only — merge is the real path. Coins fund coin-pits & pots; gems fund tech & gem gear packs.',
  };
}

/**
 * Buy a gear shop offer.
 * Gems: deduct gemCost. USD: mock IAP (priceUsd logged, no card).
 * opts: { originId, slotId, pickOriginId, pickSlotId } for pick/super flows.
 */
export function purchaseGearShop(userId, offerId, opts = {}) {
  ensureStoreColumns();
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NO_USER' });

  const bal = getBalances(userId);
  const result = applyGearShopPurchase(parseGear(user.gear_json), offerId, opts);
  if (!result.ok) {
    throw Object.assign(new Error(result.error || 'Bad offer'), {
      code: result.code || 'BAD_OFFER',
    });
  }

  const currency = result.currency || 'GEM';
  if (currency === 'GEM') {
    if ((bal.GEM || 0) < result.gemCost) {
      throw Object.assign(
        new Error(
          `Need 💎${result.gemCost} (you have ${Math.floor(bal.GEM || 0)})`
        ),
        { code: 'NO_GEMS' }
      );
    }
    applyLedger({
      userId,
      asset: 'GEM',
      delta: -result.gemCost,
      reason: `gear_shop_${result.offer.id}`,
      refType: 'gear_shop',
      refId: result.offer.id,
    });
  }
  // USD: mock checkout — no ledger debit (real IAP later)

  prepare(`UPDATE users SET gear_json = ? WHERE id = ?`).run(
    serializeGear(result.gear),
    userId
  );

  const purchaseId = nanoid(12);
  prepare(
    `INSERT INTO store_purchases (id, user_id, product_id, price_usd, payload_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    purchaseId,
    userId,
    result.offer.id,
    result.priceUsd || 0,
    JSON.stringify({
      currency,
      gemCost: result.gemCost,
      priceUsd: result.priceUsd,
      granted: result.granted,
      opts,
    })
  );

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  const costTxt =
    currency === 'USD'
      ? `$${Number(result.priceUsd || 0).toFixed(2)} (mock)`
      : `💎${result.gemCost}`;
  const n = (result.granted || []).length;
  return {
    ok: true,
    purchaseId,
    offerId: result.offer.id,
    gemCost: result.gemCost,
    priceUsd: result.priceUsd,
    currency,
    granted: result.granted,
    gear: publicGear(result.gear),
    balances: getBalances(userId),
    store: getStoreCatalog(updated),
    message: `Bought ${result.offer.label} for ${costTxt} · +${n} piece${n === 1 ? '' : 's'}`,
  };
}

/**
 * Mock purchase. Production: verify App Store / Play receipt first.
 */
export function purchaseProduct(userId, productId, { mock = true } = {}) {
  ensureStoreColumns();
  const user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NO_USER' });

  const product = productById(productId);
  if (!product) throw Object.assign(new Error('Unknown product'), { code: 'BAD_PRODUCT' });

  if (!mock) {
    throw Object.assign(new Error('Live receipts not wired yet — use mock checkout'), {
      code: 'NO_IAP',
    });
  }

  if (product.oneTime && product.id === 'starter_pack' && user.starter_pack_bought) {
    throw Object.assign(new Error('Starter pack already owned'), { code: 'ONE_TIME' });
  }

  const vip = vipActive(user);
  const grants = { gems: 0, adSkips: 0, vipUntil: null, roadBoostUntil: null };

  if (product.type === 'gems' || product.type === 'bundle') {
    grants.gems = gemsForProduct(product, { vipActive: vip });
    if (grants.gems > 0) {
      applyLedger({
        userId,
        asset: 'GEM',
        delta: grants.gems,
        reason: `iap_${product.id}`,
        refType: 'store',
        refId: product.id,
      });
    }
  }

  if (product.adSkips) {
    grants.adSkips = product.adSkips;
    prepare(
      `UPDATE users SET ad_skip_tickets = COALESCE(ad_skip_tickets,0) + ? WHERE id = ?`
    ).run(product.adSkips, userId);
  }

  if (product.type === 'subscription' && product.id === VIP_PASS.productId) {
    const base = vipActive(user) ? new Date(user.vip_until) : new Date();
    base.setUTCDate(base.getUTCDate() + (product.durationDays || 30));
    grants.vipUntil = base.toISOString();
    prepare(`UPDATE users SET vip_until = ? WHERE id = ?`).run(grants.vipUntil, userId);
  }

  if (product.type === 'boost' && product.id === 'road_boost_7d') {
    const base = roadBoostActive(user) ? new Date(user.road_boost_until) : new Date();
    base.setUTCDate(base.getUTCDate() + (product.durationDays || 7));
    grants.roadBoostUntil = base.toISOString();
    prepare(`UPDATE users SET road_boost_until = ? WHERE id = ?`).run(
      grants.roadBoostUntil,
      userId
    );
  }

  if (product.id === 'starter_pack') {
    prepare(`UPDATE users SET starter_pack_bought = 1 WHERE id = ?`).run(userId);
  }

  const purchaseId = nanoid(12);
  prepare(
    `INSERT INTO store_purchases (id, user_id, product_id, price_usd, payload_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(purchaseId, userId, product.id, product.priceUsd, JSON.stringify(grants));

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    ok: true,
    purchaseId,
    productId: product.id,
    grants,
    balances: getBalances(userId),
    adSkipTickets: updated.ad_skip_tickets || 0,
    store: getStoreCatalog(updated),
    mock: true,
  };
}

/**
 * Claim the current free or ad node on the daily path.
 * Paid nodes must use claimDailyPathBuy (mock IAP).
 * body.mockAd is accepted for ad nodes (real ad SDK later).
 */
export function claimDaily(userId, { mockAd = true } = {}) {
  ensureStoreColumns();
  let user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NO_USER' });
  user = ensurePathDay(user);
  const today = dayKey();
  const step = Number(user.daily_path_step) || 0;
  const node = dailyPathNode(step);

  if (node.type === 'buy') {
    throw Object.assign(
      new Error(`This reward is a $${node.priceUsd.toFixed(2)} deal — buy to claim`),
      { code: 'NEED_BUY', node }
    );
  }

  if (node.type === 'ad' && !mockAd) {
    throw Object.assign(new Error('Watch the ad first'), { code: 'NEED_AD' });
  }

  const reason = node.type === 'free' ? 'daily_path_free' : 'daily_path_ad';
  grantPathRewards(userId, node, reason);

  // VIP daily bonus only on the free node once per day
  let vipGems = 0;
  let vipSkips = 0;
  if (node.type === 'free' && vipActive(user) && user.vip_last_claim !== today) {
    vipGems = VIP_PASS.dailyGems;
    vipSkips = VIP_PASS.dailyAdSkips;
    applyLedger({
      userId,
      asset: 'GEM',
      delta: vipGems,
      reason: 'vip_daily',
    });
    prepare(
      `UPDATE users SET ad_skip_tickets = COALESCE(ad_skip_tickets,0) + ?, vip_last_claim = ? WHERE id = ?`
    ).run(vipSkips, today, userId);
  }

  const nextStep = step + 1;
  prepare(
    `UPDATE users SET daily_path_day = ?, daily_path_step = ?, daily_claim_day = ? WHERE id = ?`
  ).run(today, nextStep, today, userId);

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    ok: true,
    claimed: node,
    freeGems: node.gems,
    freeCoins: node.coins,
    vipGems,
    vipSkips,
    step: nextStep,
    balances: getBalances(userId),
    adSkipTickets: updated.ad_skip_tickets || 0,
    store: getStoreCatalog(updated),
  };
}

/**
 * Buy the current paid node on the daily path (mock IAP).
 * Unlocks the next segment of larger ad rewards.
 */
export function claimDailyPathBuy(userId, { mock = true } = {}) {
  ensureStoreColumns();
  let user = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NO_USER' });
  user = ensurePathDay(user);
  const today = dayKey();
  const step = Number(user.daily_path_step) || 0;
  const node = dailyPathNode(step);

  if (node.type !== 'buy') {
    throw Object.assign(new Error('Current reward is not a paid deal'), {
      code: 'NOT_BUY',
      node,
    });
  }
  if (!mock) {
    throw Object.assign(new Error('Live receipts not wired yet — use mock checkout'), {
      code: 'NO_IAP',
    });
  }

  grantPathRewards(userId, node, `daily_path_buy_s${node.segment}`);

  const purchaseId = nanoid(12);
  prepare(
    `INSERT INTO store_purchases (id, user_id, product_id, price_usd, payload_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    purchaseId,
    userId,
    node.productId || `daily_path_${step}`,
    node.priceUsd,
    JSON.stringify({ gems: node.gems, coins: node.coins, adSkips: node.adSkips || 0 })
  );

  const nextStep = step + 1;
  prepare(
    `UPDATE users SET daily_path_day = ?, daily_path_step = ? WHERE id = ?`
  ).run(today, nextStep, userId);

  const updated = prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
  return {
    ok: true,
    purchaseId,
    claimed: node,
    grants: {
      gems: node.gems,
      coins: node.coins,
      adSkips: node.adSkips || 0,
    },
    step: nextStep,
    balances: getBalances(userId),
    adSkipTickets: updated.ad_skip_tickets || 0,
    store: getStoreCatalog(updated),
    mock: true,
  };
}

export { STARTER, VIP_PASS, DAILY_FREE };
