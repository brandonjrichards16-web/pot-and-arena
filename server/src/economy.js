/**
 * Soft + hard currency economy for Pot & Arena.
 *
 * Goals (from freemium research):
 * - Early progress feels free (cheap first ranks, ads)
 * - Mid/late progress burns gems so packs feel necessary
 * - Recurring money: monthly pass + gem restocks
 * - Never sell pot odds / lottery fairness
 */

/** First-session wallet — enough for 3–5 starter upgrades, not infinite */
export const STARTER = {
  COIN: 40,
  GEM: 60,
};

/** Free daily login (small — ads + IAP remain main faucets) */
export const DAILY_FREE = {
  gems: 8,
  coins: 15,
};

/**
 * Infinite daily reward path (mobile freemium pattern):
 *   Free → Ad → Free → Ad → Free → $0.99
 *   Free → Ad → Free → Ad → Free → $3.99 → …
 * Every-other free keeps ad fatigue low; paid gates still open bigger hauls.
 * Resets each calendar day. Paid anchors never touch pot odds.
 *
 * Layout per segment (6 nodes): [free, ad, free, ad, free, buy]
 */
export const DAILY_PATH = {
  /** Nodes before each paid gate (always free/ad/free/ad/free) */
  stepsBeforeBuy: 5,
  /** Buy prices by segment (then hold top / soft scale) */
  buyPrices: [0.99, 3.99, 9.99, 19.99, 49.99],
  /** How many nodes ahead to show in the store scroller */
  previewAhead: 8,
  previewBehind: 1,
};

/**
 * Build one node on the infinite daily path.
 * Pattern per segment: free, ad, free, ad, free, buy — forever.
 */
export function dailyPathNode(index) {
  const i = Math.max(0, Math.floor(index));
  const segLen = DAILY_PATH.stepsBeforeBuy + 1; // 5 free/ad + 1 buy
  const segment = Math.floor(i / segLen);
  const slot = i % segLen; // 0 free, 1 ad, 2 free, 3 ad, 4 free, 5 buy

  // ——— Paid gate (every 6th node) ———
  if (slot === DAILY_PATH.stepsBeforeBuy) {
    const prices = DAILY_PATH.buyPrices;
    let priceUsd = prices[Math.min(segment, prices.length - 1)];
    if (segment >= prices.length) {
      const extra = segment - (prices.length - 1);
      priceUsd =
        Math.round(prices[prices.length - 1] * Math.pow(1.35, extra) * 100) / 100;
    }
    const gems = Math.round(72 * Math.pow(2.15, segment));
    const coins = Math.round(35 * Math.pow(1.75, segment));
    const skips = segment === 0 ? 1 : Math.min(5, 1 + segment);
    return {
      index: i,
      type: 'buy',
      segment,
      gems,
      coins,
      adSkips: skips,
      label: segment === 0 ? 'Value deal' : `Tier ${segment + 1} deal`,
      blurb: 'Skip the grind · bigger haul',
      cta: `$${priceUsd.toFixed(2)}`,
      priceUsd,
      productId: `daily_path_s${segment}`,
    };
  }

  // Within segment: even slots free, odd slots ad
  const isFree = slot % 2 === 0;
  // Progress within segment (0..4) so later steps pay a bit more
  const stepInSeg = slot;
  const baseGems = isFree ? 6 : 9;
  const baseCoins = isFree ? 10 : 14;
  const gems = Math.max(
    isFree ? 5 : 6,
    Math.round(baseGems * Math.pow(1.4, segment) * Math.pow(1.12, stepInSeg))
  );
  const coins = Math.max(
    isFree ? 8 : 10,
    Math.round(baseCoins * Math.pow(1.28, segment) * Math.pow(1.1, stepInSeg))
  );

  // First free of the day (index 0) matches classic daily gift sizes
  if (i === 0) {
    return {
      index: 0,
      type: 'free',
      segment: 0,
      gems: DAILY_FREE.gems,
      coins: DAILY_FREE.coins,
      label: 'Free',
      blurb: 'Daily gift',
      cta: 'CLAIM',
      priceUsd: null,
    };
  }

  if (isFree) {
    return {
      index: i,
      type: 'free',
      segment,
      gems,
      coins,
      label: 'Free',
      blurb: `Gift · tier ${segment + 1}`,
      cta: 'CLAIM',
      priceUsd: null,
    };
  }

  return {
    index: i,
    type: 'ad',
    segment,
    adSlot: Math.floor(slot / 2) + 1,
    gems,
    coins,
    label: 'Ad',
    blurb: `Watch · tier ${segment + 1}`,
    cta: 'WATCH',
    priceUsd: null,
  };
}

/** Preview strip: a few claimed/current + what's ahead */
export function dailyPathPreview(step, { ahead, behind } = {}) {
  const a = ahead ?? DAILY_PATH.previewAhead;
  const b = behind ?? DAILY_PATH.previewBehind;
  const start = Math.max(0, step - b);
  const end = step + a;
  const nodes = [];
  for (let i = start; i <= end; i++) {
    const n = dailyPathNode(i);
    nodes.push({
      ...n,
      status:
        i < step ? 'claimed' : i === step ? 'current' : 'locked',
    });
  }
  return nodes;
}

/** VIP monthly pass perks (time convenience, not pot odds) */
export const VIP_PASS = {
  productId: 'vip_month',
  priceUsd: 9.99,
  durationDays: 30,
  dailyGems: 45,
  dailyAdSkips: 3,
  shopGemBonusPct: 10, // extra % on gem pack purchases while active
  label: 'VIP Month',
  blurb: 'Daily gems, free ad-skips, 10% more gems from packs. 30 days.',
  perks: [
    '+45 gems every day you claim',
    '+3 free ad-skips each day',
    '+10% gems on every gem pack while active',
    'VIP badge on your name',
  ],
};

/**
 * Real-money catalog (mock checkout now; swap in App Store / Play receipts later).
 * Anchor prices: $0.99 / $4.99 / $9.99 / $19.99 / $49.99
 */
export const STORE_PRODUCTS = [
  {
    id: 'gems_80',
    sku: 'paa_gems_80',
    type: 'gems',
    priceUsd: 0.99,
    gems: 80,
    label: 'Handful of Gems',
    blurb: '80 gems — a few upgrade ranks',
    tag: null,
  },
  {
    id: 'gems_500',
    sku: 'paa_gems_500',
    type: 'gems',
    priceUsd: 4.99,
    gems: 500,
    label: 'Gem Pouch',
    blurb: '500 gems — solid upgrade push',
    tag: 'Popular',
  },
  {
    id: 'gems_1200',
    sku: 'paa_gems_1200',
    type: 'gems',
    priceUsd: 9.99,
    gems: 1200,
    bonusGems: 100,
    label: 'Gem Chest',
    blurb: '1,200 + 100 bonus gems',
    tag: 'Best value',
  },
  {
    id: 'gems_2800',
    sku: 'paa_gems_2800',
    type: 'gems',
    priceUsd: 19.99,
    gems: 2800,
    bonusGems: 400,
    label: 'Gem Vault',
    blurb: '2,800 + 400 bonus gems',
    tag: null,
  },
  {
    id: 'gems_8000',
    sku: 'paa_gems_8000',
    type: 'gems',
    priceUsd: 49.99,
    gems: 8000,
    bonusGems: 2000,
    label: 'Gem Trove',
    blurb: '8,000 + 2,000 bonus gems',
    tag: 'Whale',
  },
  {
    id: 'starter_pack',
    sku: 'paa_starter',
    type: 'bundle',
    priceUsd: 2.99,
    gems: 250,
    adSkips: 5,
    oneTime: true,
    label: 'Starter Pack',
    blurb: '250 gems + 5 ad-skips (once per account)',
    tag: 'New player',
  },
  {
    id: 'ad_skips_10',
    sku: 'paa_skips_10',
    type: 'skips',
    priceUsd: 1.99,
    adSkips: 10,
    label: '10 Ad-Skips',
    blurb: 'Skip 10 rewarded ads when entering pits',
    tag: null,
  },
  {
    id: 'ad_skips_40',
    sku: 'paa_skips_40',
    type: 'skips',
    priceUsd: 5.99,
    adSkips: 40,
    label: '40 Ad-Skips',
    blurb: 'Skip 40 ads — play pits faster',
    tag: null,
  },
  {
    id: VIP_PASS.productId,
    sku: 'paa_vip_month',
    type: 'subscription',
    priceUsd: VIP_PASS.priceUsd,
    durationDays: VIP_PASS.durationDays,
    label: VIP_PASS.label,
    blurb: VIP_PASS.blurb,
    perks: VIP_PASS.perks,
    tag: 'Monthly',
  },
  {
    id: 'road_boost_7d',
    sku: 'paa_road_boost_7d',
    type: 'boost',
    priceUsd: 3.99,
    durationDays: 7,
    label: 'Road Boost (7 days)',
    blurb: '+25% campaign coin & gem bank from clears for 7 days',
    tag: null,
  },
];

export function productById(id) {
  return STORE_PRODUCTS.find((p) => p.id === id) || null;
}

/** Total gems granted for a gem product (base + listed bonus + VIP shop bonus) */
export function gemsForProduct(product, { vipActive = false } = {}) {
  if (!product) return 0;
  let g = (product.gems || 0) + (product.bonusGems || 0);
  if (vipActive && product.type === 'gems' && VIP_PASS.shopGemBonusPct > 0) {
    g = Math.round(g * (1 + VIP_PASS.shopGemBonusPct / 100));
  }
  return g;
}
