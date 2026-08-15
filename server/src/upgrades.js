/**
 * Hero growth for Campaign & skill/boss fights (not pot odds).
 *
 * Research takeaways we follow:
 * - Flat, readable numbers (+2 ATK), never vague % or mystery "power"
 * - Simple branches players understand (ATK / HP / DEF / SPD)
 * - Unlockable fighter kits like other mobile RPGs (clear passives)
 * - Gems sink that ties pots ↔ campaign (same wallet)
 */

export const STAT_SHORT = {
  power: 'ATK',
  vitality: 'HP',
  guard: 'DEF',
  speed: 'SPD',
  luck: 'LUCK',
};

export const STAT_FULL = {
  power: 'Attack',
  vitality: 'Hit Points',
  guard: 'Defense',
  speed: 'Speed',
  luck: 'Luck',
};

/**
 * Unlockable fighters. One active kit at a time.
 * Bonuses apply only to Campaign / skill combat (server campaign load).
 */
export const FIGHTER_KITS = [
  {
    id: 'rookie',
    name: 'Rookie',
    emoji: '🥋',
    blurb: 'Starter. No extra bonus.',
    unlock: { type: 'free' },
    bonus: {},
    bonusLines: ['No kit bonus'],
  },
  {
    id: 'striker',
    name: 'Striker',
    emoji: '⚔️',
    blurb: 'Hits harder in Campaign & boss fights.',
    unlock: { type: 'campaign_high', value: 10 },
    unlockText: 'Unlock: clear Campaign level 10',
    bonus: { power: 4 },
    bonusLines: ['+4 ATK in Campaign & boss fights'],
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    emoji: '🛡️',
    blurb: 'Tougher in Campaign & boss fights.',
    unlock: { type: 'campaign_high', value: 20 },
    unlockText: 'Unlock: clear Campaign level 20',
    bonus: { vitality: 10, guard: 3 },
    bonusLines: ['+10 HP in Campaign & boss fights', '+3 DEF in Campaign & boss fights'],
  },
  {
    id: 'swift',
    name: 'Swift',
    emoji: '💨',
    blurb: 'Acts more often in Campaign & boss fights.',
    unlock: { type: 'campaign_high', value: 30 },
    unlockText: 'Unlock: clear Campaign level 30',
    bonus: { speed: 5 },
    bonusLines: ['+5 SPD in Campaign & boss fights (more turns)'],
  },
  {
    id: 'champion',
    name: 'Champion',
    emoji: '👑',
    blurb: 'All-around kit for deep Campaign runs.',
    unlock: { type: 'campaign_high', value: 50 },
    unlockText: 'Unlock: clear Campaign level 50',
    bonus: { power: 3, vitality: 8, guard: 2, speed: 2 },
    bonusLines: [
      '+3 ATK in Campaign & boss fights',
      '+8 HP in Campaign & boss fights',
      '+2 DEF in Campaign & boss fights',
      '+2 SPD in Campaign & boss fights',
    ],
  },
];

/**
 * Tech tree — permanent base stats for pits + campaign.
 *
 * Design for 6 chapters × ~50 stages:
 * - Early roots: cheap, long ladders (many ranks) so you always have *something* to buy
 * - Mid branches: need a couple root ranks (post first boss / pit loop)
 * - Late mastery: expensive, high per-level gain (chapter 3–6 gem sinks)
 * - Gear is a second track; tech is the steady base
 *
 * requires: node id that must be at requiresLevel (default 1)
 */
const cheap = (lvl) =>
  [10, 18, 28, 42, 60, 85, 120, 165, 220, 290][lvl] ?? 290 + (lvl - 9) * 50;
const mid = (lvl) =>
  [40, 65, 95, 140, 200, 280, 380, 500][lvl] ?? 500 + (lvl - 7) * 80;
const hard = (lvl) =>
  [90, 140, 210, 300, 420, 580, 780, 1000][lvl] ?? 1000 + (lvl - 7) * 150;
const late = (lvl) =>
  [200, 320, 480, 700, 1000, 1400][lvl] ?? 1400 + (lvl - 5) * 250;

export const UPGRADE_TREE = [
  // ——— ATK roots & mid ———
  {
    id: 'blade',
    name: 'Sharp Blade',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 10,
    cost: cheap,
    stat: 'power',
    perLevel: 2,
    gainLabel: '+2 ATK',
    desc: 'Foundation attack ranks. Cheap early, deep ladder.',
    where: 'Campaign & pits',
    requires: null,
  },
  {
    id: 'muscle',
    name: 'Muscle',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 8,
    cost: mid,
    stat: 'power',
    perLevel: 2,
    gainLabel: '+2 ATK',
    desc: 'Raw power. Needs Sharp Blade 1.',
    where: 'Campaign & pits',
    requires: 'blade',
    requiresLevel: 1,
  },
  {
    id: 'weapon',
    name: 'Better Weapon',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 8,
    cost: mid,
    stat: 'power',
    perLevel: 2,
    gainLabel: '+2 ATK',
    desc: 'Steel over wood. Also upgrades your look. Needs Blade 1.',
    where: 'Campaign & pits',
    requires: 'blade',
    requiresLevel: 1,
  },
  {
    id: 'heavy_swing',
    name: 'Heavy Swing',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 8,
    cost: hard,
    stat: 'power',
    perLevel: 3,
    gainLabel: '+3 ATK',
    desc: 'Big hits. Needs Sharp Blade 3.',
    where: 'Campaign & pits',
    requires: 'blade',
    requiresLevel: 3,
  },
  {
    id: 'war_cry',
    name: 'War Cry',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 6,
    cost: late,
    stat: 'power',
    perLevel: 4,
    gainLabel: '+4 ATK',
    desc: 'Late-game power. Needs Heavy Swing 2.',
    where: 'Campaign & pits',
    requires: 'heavy_swing',
    requiresLevel: 2,
  },
  {
    id: 'executioner',
    name: 'Executioner',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 5,
    cost: late,
    stat: 'power',
    perLevel: 5,
    gainLabel: '+5 ATK',
    desc: 'Endgame edge. Needs War Cry 2.',
    where: 'Campaign & pits',
    requires: 'war_cry',
    requiresLevel: 2,
  },
  {
    id: 'fate',
    name: 'Lucky Edge',
    branch: 'atk',
    branchLabel: 'ATTACK',
    max: 5,
    cost: (lvl) => [100, 180, 280, 420, 600][lvl] ?? 600,
    stat: 'luck',
    perLevel: 2,
    gainLabel: '+2 LUCK',
    desc: 'Wilder skill-fight swings. Needs Heavy Swing 1.',
    where: 'Campaign skill fights',
    requires: 'heavy_swing',
    requiresLevel: 1,
  },

  // ——— HP ———
  {
    id: 'iron_skin',
    name: 'Iron Skin',
    branch: 'hp',
    branchLabel: 'HIT POINTS',
    max: 10,
    cost: cheap,
    stat: 'vitality',
    perLevel: 5,
    gainLabel: '+5 HP',
    desc: 'Foundation HP. Long cheap ladder.',
    where: 'Campaign & pits',
    requires: null,
  },
  {
    id: 'vital_core',
    name: 'Vital Core',
    branch: 'hp',
    branchLabel: 'HIT POINTS',
    max: 8,
    cost: hard,
    stat: 'vitality',
    perLevel: 8,
    gainLabel: '+8 HP',
    desc: 'Deeper reserves. Needs Iron Skin 3.',
    where: 'Campaign & pits',
    requires: 'iron_skin',
    requiresLevel: 3,
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    branch: 'hp',
    branchLabel: 'HIT POINTS',
    max: 6,
    cost: late,
    stat: 'vitality',
    perLevel: 10,
    gainLabel: '+10 HP',
    desc: 'Survive packs. Needs Vital Core 2.',
    where: 'Campaign & pits',
    requires: 'vital_core',
    requiresLevel: 2,
  },
  {
    id: 'titan_heart',
    name: 'Titan Heart',
    branch: 'hp',
    branchLabel: 'HIT POINTS',
    max: 5,
    cost: late,
    stat: 'vitality',
    perLevel: 14,
    gainLabel: '+14 HP',
    desc: 'Endgame bulk. Needs Second Wind 2.',
    where: 'Campaign & pits',
    requires: 'second_wind',
    requiresLevel: 2,
  },

  // ——— DEF ———
  {
    id: 'armor',
    name: 'Armor Plates',
    branch: 'def',
    branchLabel: 'DEFENSE',
    max: 10,
    cost: cheap,
    stat: 'guard',
    perLevel: 2,
    gainLabel: '+2 DEF',
    desc: 'Foundation defense. Take less damage each hit.',
    where: 'Campaign & pits',
    requires: null,
  },
  {
    id: 'fortress',
    name: 'Fortress',
    branch: 'def',
    branchLabel: 'DEFENSE',
    max: 8,
    cost: hard,
    stat: 'guard',
    perLevel: 3,
    gainLabel: '+3 DEF',
    desc: 'Harder shell. Needs Armor 3.',
    where: 'Campaign & pits',
    requires: 'armor',
    requiresLevel: 3,
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    branch: 'def',
    branchLabel: 'DEFENSE',
    max: 6,
    cost: late,
    stat: 'guard',
    perLevel: 4,
    gainLabel: '+4 DEF',
    desc: 'Pack survival. Needs Fortress 2.',
    where: 'Campaign & pits',
    requires: 'fortress',
    requiresLevel: 2,
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    branch: 'def',
    branchLabel: 'DEFENSE',
    max: 5,
    cost: late,
    stat: 'guard',
    perLevel: 5,
    gainLabel: '+5 DEF',
    desc: 'Endgame guard. Needs Bulwark 2.',
    where: 'Campaign & pits',
    requires: 'bulwark',
    requiresLevel: 2,
  },

  // ——— SPD ———
  {
    id: 'footwork',
    name: 'Footwork',
    branch: 'spd',
    branchLabel: 'SPEED',
    max: 10,
    cost: cheap,
    stat: 'speed',
    perLevel: 2,
    gainLabel: '+2 SPD',
    desc: 'Foundation speed — more turns in a fight.',
    where: 'Campaign & pits',
    requires: null,
  },
  {
    id: 'haste',
    name: 'Haste',
    branch: 'spd',
    branchLabel: 'SPEED',
    max: 8,
    cost: hard,
    stat: 'speed',
    perLevel: 3,
    gainLabel: '+3 SPD',
    desc: 'Faster gauge fill. Needs Footwork 3.',
    where: 'Campaign & pits',
    requires: 'footwork',
    requiresLevel: 3,
  },
  {
    id: 'lightning_step',
    name: 'Lightning Step',
    branch: 'spd',
    branchLabel: 'SPEED',
    max: 6,
    cost: late,
    stat: 'speed',
    perLevel: 4,
    gainLabel: '+4 SPD',
    desc: 'Act often vs packs. Needs Haste 2.',
    where: 'Campaign & pits',
    requires: 'haste',
    requiresLevel: 2,
  },
  {
    id: 'ghost_step',
    name: 'Ghost Step',
    branch: 'spd',
    branchLabel: 'SPEED',
    max: 5,
    cost: late,
    stat: 'speed',
    perLevel: 5,
    gainLabel: '+5 SPD',
    desc: 'Endgame tempo. Needs Lightning Step 2.',
    where: 'Campaign & pits',
    requires: 'lightning_step',
    requiresLevel: 2,
  },
];

export function emptyUpgrades() {
  const o = {};
  for (const u of UPGRADE_TREE) o[u.id] = 0;
  return o;
}

export function parseUpgrades(json) {
  try {
    const o = JSON.parse(json || '{}');
    const base = emptyUpgrades();
    for (const k of Object.keys(base)) {
      if (typeof o[k] === 'number') {
        const max = UPGRADE_TREE.find((n) => n.id === k)?.max || 5;
        base[k] = Math.max(0, Math.min(max, o[k]));
      }
    }
    // preserve unknown keys from old saves lightly
    return base;
  } catch {
    return emptyUpgrades();
  }
}

export function canBuyNode(upgrades, node) {
  if (!node.requires) return { ok: true };
  const need = node.requiresLevel || 1;
  const have = upgrades[node.requires] || 0;
  if (have >= need) return { ok: true };
  const reqNode = UPGRADE_TREE.find((n) => n.id === node.requires);
  return {
    ok: false,
    reason: `Need ${reqNode?.name || node.requires} level ${need} first`,
  };
}

/**
 * Portrait art tier (0 bare → 1 armed → 2 ultimate).
 */
export function visualTier(upgrades) {
  const armor = upgrades.armor || 0;
  const weapon = upgrades.weapon || 0;
  const blade = upgrades.blade || 0;
  const total = Object.values(upgrades).reduce((a, b) => a + (b || 0), 0);
  if (armor + weapon >= 6 || total >= 16) return 2;
  if (armor >= 1 || weapon >= 1 || blade >= 2 || total >= 5) return 1;
  return 0;
}

export function totalUpgradePoints(upgrades) {
  return Object.values(upgrades).reduce((a, b) => a + b, 0);
}

export function kitById(id) {
  return FIGHTER_KITS.find((k) => k.id === id) || FIGHTER_KITS[0];
}

export function isKitUnlocked(kit, user) {
  if (!kit || kit.unlock?.type === 'free') return true;
  const high = Math.max(
    Number(user?.campaign_high_water) || 0,
    Number(user?.campaign_chapter_cleared) || 0
  );
  if (kit.unlock?.type === 'campaign_high') {
    return high >= (kit.unlock.value || 0);
  }
  return false;
}

/** Apply active kit bonuses onto a fighter for skill/campaign combat */
export function applyKitBonus(fighter, kitId) {
  const kit = kitById(kitId);
  const b = kit.bonus || {};
  return {
    ...fighter,
    power: (fighter.power || 0) + (b.power || 0),
    vitality: (fighter.vitality || 0) + (b.vitality || 0),
    guard: (fighter.guard || 0) + (b.guard || 0),
    speed: (fighter.speed || 0) + (b.speed || 0),
    luck: (fighter.luck || 0) + (b.luck || 0),
    kitId: kit.id,
    kitName: kit.name,
  };
}

export function publicKit(kit, user, activeId) {
  const unlocked = isKitUnlocked(kit, user);
  return {
    id: kit.id,
    name: kit.name,
    emoji: kit.emoji,
    blurb: kit.blurb,
    bonusLines: kit.bonusLines || [],
    unlockText: kit.unlockText || 'Unlocked',
    unlocked,
    active: activeId === kit.id,
    bonus: kit.bonus || {},
  };
}

export function publicUpgradeNode(node, upgrades = {}) {
  const lvl = upgrades[node.id] || 0;
  const gate = canBuyNode(upgrades, node);
  return {
    id: node.id,
    name: node.name,
    branch: node.branch,
    branchLabel: node.branchLabel || node.branch,
    max: node.max,
    level: lvl,
    stat: node.stat,
    statShort: STAT_SHORT[node.stat] || node.stat,
    perLevel: node.perLevel,
    gainLabel: node.gainLabel,
    desc: node.desc,
    where: node.where,
    requires: node.requires,
    requiresLevel: node.requiresLevel || null,
    locked: !gate.ok,
    lockReason: gate.ok ? null : gate.reason,
    costs: Array.from({ length: node.max }, (_, i) => node.cost(i)),
    nextCost: lvl >= node.max ? null : node.cost(lvl),
    maxed: lvl >= node.max,
  };
}
