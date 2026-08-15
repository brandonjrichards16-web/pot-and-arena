/**
 * Campaign worlds — long roads (~50 stages), boss every 10, many environments.
 * Stats always shown as ATK / HP / DEF / SPD.
 *
 * STORY THROUGHLINE (why you walk):
 * The City of Pots crowns two kinds of kings —
 *   Pot King  = pure luck (the draw)
 *   Road King = pure skill (the climb)
 * You already know how tickets feel. The Road is the proof that
 * you are more than a number in a pot. Walk 50 markers a chapter,
 * break the wardens who sell “fate,” and claim the Second Crown.
 */

/** How often a boss gate appears (also forces an ad on entry). */
export const BOSS_EVERY = 10;
/** Default length of a chapter road. */
export const STAGES_PER_CHAPTER = 50;

/**
 * Global premise — shown on campaign hub + chapter open.
 * Keep player-facing, short enough to read on mobile.
 */
export const CAMPAIGN_PREMISE = {
  title: 'The Second Crown',
  hook: 'Luck fills pots. Skill clears roads.',
  text:
    'In the City of Pots, a ticket can make you rich overnight — or leave you dust. ' +
    'But under the stands runs another path: the Road of Proof. ' +
    'Wardens guard each stretch and sell “fate” to the weak. ' +
    'You walk to show the city that a fighter’s crown is earned, not drawn. ' +
    'Fifty markers a chapter. A boss every ten. No pot odds on this path — only steel.',
  goal: 'Clear six chapters. Claim the Twin Crown. Prove skill is king.',
};

/**
 * Many distinct places you can stand in.
 * Used for fight scenery + map zone labels.
 */
export const WORLD_THEMES = {
  dustlands: {
    id: 'dustlands',
    name: 'Dustlands',
    blurb: 'Open waste under pot-stand roar',
    emoji: '🏜️',
    sky: ['#3d2a18', '#6b4423', '#c4a574'],
    ground: '#5c3d1e',
    path: '#8b6914',
    accent: '#e8c070',
    fog: 'rgba(200,160,80,0.12)',
    props: ['🌵', '🪨', '💀', '🏚️'],
    farShape: 'hills',
  },
  boneyard: {
    id: 'boneyard',
    name: 'Boneyard',
    blurb: 'Ribs and losers’ names',
    emoji: '🦴',
    sky: ['#1a1e28', '#3a4255', '#8a9bb0'],
    ground: '#2a3038',
    path: '#5a6570',
    accent: '#a8b4c4',
    fog: 'rgba(160,180,200,0.1)',
    props: ['🦴', '☠️', '🪦', '⛓️'],
    farShape: 'ruins',
  },
  castle: {
    id: 'castle',
    name: 'Iron Keep',
    blurb: 'Stone walls, torch light',
    emoji: '🏰',
    sky: ['#1a1528', '#2d2540', '#4a3a60'],
    ground: '#2a2430',
    path: '#4a4050',
    accent: '#c0a0e0',
    fog: 'rgba(100,80,140,0.14)',
    props: ['🏰', '🗡️', '🧱', '🔥'],
    farShape: 'towers',
  },
  dungeon: {
    id: 'dungeon',
    name: 'Deep Cells',
    blurb: 'Damp stone and iron doors',
    emoji: '🗝️',
    sky: ['#0a0a10', '#14141f', '#1e1e30'],
    ground: '#121218',
    path: '#2a2a38',
    accent: '#6ee7b7',
    fog: 'rgba(40,80,60,0.15)',
    props: ['🗝️', '🔗', '🐀', '💧'],
    farShape: 'arches',
  },
  forest: {
    id: 'forest',
    name: 'Gloomwood',
    blurb: 'Canopy that eats the sun',
    emoji: '🌲',
    sky: ['#0f1f14', '#1a3a24', '#2d5a3a'],
    ground: '#1a2e1c',
    path: '#3d5a30',
    accent: '#4ade80',
    fog: 'rgba(60,120,70,0.14)',
    props: ['🌲', '🍄', '🦉', '🕸️'],
    farShape: 'trees',
  },
  swamp: {
    id: 'swamp',
    name: 'Sunk Fen',
    blurb: 'Fog and wrong water',
    emoji: '🐸',
    sky: ['#1a2418', '#2a3a28', '#4a5a38'],
    ground: '#243020',
    path: '#3a4a28',
    accent: '#a3e635',
    fog: 'rgba(100,140,60,0.18)',
    props: ['🐸', '🪵', '🦟', '🫧'],
    farShape: 'mist',
  },
  ice: {
    id: 'ice',
    name: 'Frost Span',
    blurb: 'White wind, black ice',
    emoji: '❄️',
    sky: ['#0e1a28', '#1e3a50', '#7dd3fc'],
    ground: '#1a3040',
    path: '#5a8aa0',
    accent: '#bae6fd',
    fog: 'rgba(180,220,255,0.16)',
    props: ['❄️', '🧊', '🏔️', '🌬️'],
    farShape: 'peaks',
  },
  volcano: {
    id: 'volcano',
    name: 'Ash Throat',
    blurb: 'Heat that cooks steel',
    emoji: '🌋',
    sky: ['#1a0808', '#4a1810', '#ea580c'],
    ground: '#2a1010',
    path: '#5a2818',
    accent: '#fb923c',
    fog: 'rgba(255,80,20,0.14)',
    props: ['🌋', '🔥', '🪨', '⚡'],
    farShape: 'crags',
  },
  nightmarket: {
    id: 'nightmarket',
    name: 'Night Market',
    blurb: 'Lanterns over stolen luck',
    emoji: '🏮',
    sky: ['#0a0618', '#1a0a30', '#4c1d95'],
    ground: '#1a1028',
    path: '#3b2060',
    accent: '#f472b6',
    fog: 'rgba(180,60,140,0.12)',
    props: ['🏮', '🪙', '🎭', '✨'],
    farShape: 'stalls',
  },
  ruins: {
    id: 'ruins',
    name: 'Fallen Arena',
    blurb: 'Where champions used to stand',
    emoji: '🏛️',
    sky: ['#1c1810', '#3a3020', '#8b7355'],
    ground: '#2a2418',
    path: '#5a4a30',
    accent: '#d4a574',
    fog: 'rgba(180,150,100,0.12)',
    props: ['🏛️', '🧱', '⚱️', '🗿'],
    farShape: 'columns',
  },
  sewer: {
    id: 'sewer',
    name: 'Underflow',
    blurb: 'Beneath the pot stands',
    emoji: '🕳️',
    sky: ['#0a1210', '#142018', '#1e3028'],
    ground: '#101814',
    path: '#243028',
    accent: '#34d399',
    fog: 'rgba(40,100,70,0.16)',
    props: ['🕳️', '🐀', '💧', '🔧'],
    farShape: 'pipes',
  },
  skybridge: {
    id: 'skybridge',
    name: 'Sky Bridge',
    blurb: 'Wind and a long drop',
    emoji: '🌉',
    sky: ['#0c1a2e', '#1e3a5f', '#60a5fa'],
    ground: '#1a2838',
    path: '#3a5070',
    accent: '#93c5fd',
    fog: 'rgba(100,160,255,0.12)',
    props: ['🌉', '☁️', '🦅', '💨'],
    farShape: 'clouds',
  },
  crypt: {
    id: 'crypt',
    name: 'Crown Crypt',
    blurb: 'Where second crowns sleep',
    emoji: '👑',
    sky: ['#100818', '#201028', '#3b1f4a'],
    ground: '#180e20',
    path: '#2a1838',
    accent: '#fbbf24',
    fog: 'rgba(180,120,40,0.1)',
    props: ['👑', '🕯️', '📜', '💎'],
    farShape: 'vault',
  },
};

/** Ordered theme keys for lookup */
export const THEME_LIST = Object.values(WORLD_THEMES);

/**
 * Each chapter is a long road through a sequence of environments.
 * stages = 50, boss every 10.
 */
export const CHAPTERS = [
  {
    id: 1,
    title: 'Dust Gate',
    subtitle: 'Where the Road begins under the pots',
    tint: '#c4a574',
    emoji: '🚪',
    stages: STAGES_PER_CHAPTER,
    themeTrail: ['dustlands', 'boneyard', 'ruins', 'dustlands', 'castle'],
    bossName: 'Pit Dog Alpha',
    zoneBosses: {
      10: 'Sand Warden',
      20: 'Bone Tally',
      30: 'Ruined Champ',
      40: 'Gate Tyrant',
      50: 'Pit Dog Alpha',
    },
    open:
      'You leave the pot stands behind. Dust sticks to your teeth. ' +
      'Above, crowds still scream for lucky numbers — down here, the Road only cares if you can still stand. ' +
      'Fifty markers to the first Gate. Wardens ahead sell “fate” to anyone too weak to swing. ' +
      'You came for the Second Crown: proof that skill can outshine a draw.',
    mid:
      'Halfway through Dust Gate. Names scratched into bone markers — people who trusted tickets more than fists. ' +
      'The stands still roar. You keep walking. Every step is an argument: you are not only a number.',
    boss:
      'Pit Dog Alpha blocks the last dust gate, scarred from a hundred lucky fools. ' +
      '“No ticket saves you here,” he growls. “Show me the part of you the pot never owned.”',
    clear:
      'Dust Gate falls. The crowd above doesn’t know your name yet — but the Road does. ' +
      'Iron Keep waits. Deeper proof. Harder wardens.',
    battleBeats: [
      'Dust underfoot. The Road is listening.',
      'A marker stone. Someone quit here.',
      'Pot roar fades. Only your breath left.',
    ],
  },
  {
    id: 2,
    title: 'Iron March',
    subtitle: 'Stone keep of the Red Chain',
    tint: '#94a3b8',
    emoji: '🏰',
    stages: STAGES_PER_CHAPTER,
    themeTrail: ['castle', 'dungeon', 'sewer', 'crypt', 'castle'],
    bossName: 'Red Chain',
    zoneBosses: {
      10: 'Portcullis',
      20: 'Cell Lord',
      30: 'Sump King',
      40: 'Crypt Guard',
      50: 'Red Chain',
    },
    open:
      'Stone instead of dust. The Keep once fed champions into the pits for coin. ' +
      'Red Chain still runs the march: train them, break them, sell their luck back to the city. ' +
      'If you clear Iron March, you prove you were never their product.',
    mid:
      'Torchlight thins. Chains rattle where fighters used to wait for a “lucky” draw. ' +
      'You are not waiting. You are walking through the machine that made pot kings.',
    boss:
      'Red Chain laughs, iron links on both wrists. ' +
      '“Champions of chance,” he says. “Let’s see if steel still remembers how to choose.”',
    clear:
      'The march ends. Red Chain’s links lie cold. ' +
      'Wild roads open beyond the walls — green that hides older, hungrier tests.',
    battleBeats: [
      'Torch smoke. Iron taste.',
      'A cell door hangs open. Empty on purpose.',
      'Footsteps echo like bets being placed.',
    ],
  },
  {
    id: 3,
    title: 'Wild Tangle',
    subtitle: 'Where the city forgets its own name',
    tint: '#4ade80',
    emoji: '🌲',
    stages: STAGES_PER_CHAPTER,
    themeTrail: ['forest', 'swamp', 'ice', 'forest', 'swamp'],
    bossName: 'Swarm Queen',
    zoneBosses: {
      10: 'Root Snare',
      20: 'Fen Mother',
      30: 'Ice Howl',
      40: 'Canopy Witch',
      50: 'Swarm Queen',
    },
    open:
      'Green closes over the path. Out here, pots and numbers feel like a dream. ' +
      'The Swarm Queen feeds on travelers who still think fortune will save them. ' +
      'Clear the Tangle, and the Road remembers you are more than prey.',
    mid:
      'Bugs, mist, then white wind. Every zone tries a different kind of fear. ' +
      'You answer the same way: one fight at a time, no draw to hide behind.',
    boss:
      'The Swarm Queen hisses from a throne of woven bones. ' +
      '“Only the strong leave the tangle. The lucky get eaten first — they never watch their feet.”',
    clear:
      'The tangle parts. Heat shimmers on the horizon. ' +
      'Ash and lantern light: the city’s other face, still selling fate.',
    battleBeats: [
      'Leaves hide the sun. Good.',
      'Something moves that is not wind.',
      'Cold air. You are not alone.',
    ],
  },
  {
    id: 4,
    title: 'Ash & Lantern',
    subtitle: 'Fire markets and stolen luck',
    tint: '#fb923c',
    emoji: '🌋',
    stages: STAGES_PER_CHAPTER,
    themeTrail: ['volcano', 'nightmarket', 'ruins', 'volcano', 'skybridge'],
    bossName: 'Iron Crow',
    zoneBosses: {
      10: 'Cinder Maw',
      20: 'Lantern Thief',
      30: 'Arena Ghost',
      40: 'Magma Duke',
      50: 'Iron Crow',
    },
    open:
      'Heat first — then neon lies painted over the ash. ' +
      'Night Market sells charms “guaranteed” to tip a pot. Iron Crow owns both the fire and the lie. ' +
      'Walk through both. Buy nothing. Break him.',
    mid:
      'Coins flip in the dark. You don’t buy luck. ' +
      'Every lantern is a promise someone else failed to keep.',
    boss:
      'Iron Crow spreads black-steel wings of scrap. ' +
      '“Skill is the only pot that never lies,” he croaks. “Prove you can fill it.”',
    clear:
      'Ash cools. Far above, the High Road glows like a dare. ' +
      'One more climb before the Twin Crown.',
    battleBeats: [
      'Cinder in the air. Eyes sting.',
      'A lantern swings. No wind.',
      'Old arena stone under the soot.',
    ],
  },
  {
    id: 5,
    title: 'High Road',
    subtitle: 'Wind, ice, and no soft landing',
    tint: '#60a5fa',
    emoji: '🌉',
    stages: STAGES_PER_CHAPTER,
    themeTrail: ['skybridge', 'ice', 'nightmarket', 'skybridge', 'crypt'],
    bossName: 'Glass Fang',
    zoneBosses: {
      10: 'Wind Knife',
      20: 'Frost Peer',
      30: 'Market Shade',
      40: 'Span Breaker',
      50: 'Glass Fang',
    },
    open:
      'The path leaves the ground. Don’t look down — look ahead. ' +
      'Glass Fang bets the city you will fall like every lucky fool before you. ' +
      'Your answer is fifty markers in the sky.',
    mid:
      'Stars, ice, then lanterns again. Height doesn’t change the rule: ' +
      'hit harder than what hits you. Keep the Road.',
    boss:
      'Glass Fang grins, teeth like broken goblets. ' +
      '“Even the draw would bet against you,” he says. “I only take the sure ones.”',
    clear:
      'High Road done. Below, the Crown Crypt opens its mouth. ' +
      'One warden left who still holds two crowns.',
    battleBeats: [
      'Wind tries to steal your stance.',
      'Ice sings underfoot.',
      'A long drop. You don’t take it.',
    ],
  },
  {
    id: 6,
    title: 'Crown Road',
    subtitle: 'The Second Crown — final proof',
    tint: '#fbbf24',
    emoji: '👑',
    stages: STAGES_PER_CHAPTER,
    themeTrail: ['crypt', 'castle', 'dungeon', 'ruins', 'crypt'],
    bossName: 'Twin Crown Warden',
    zoneBosses: {
      10: 'Oath Warden',
      20: 'Vault Hound',
      30: 'Deep Jury',
      40: 'Fallen King',
      50: 'Twin Crown Warden',
    },
    open:
      'Pot King is luck. Road King is you — if you finish this. ' +
      'The Twin Crown Warden keeps both crowns locked so the city never has to admit skill matters. ' +
      'Fifty stages. Then the argument ends.',
    mid:
      'Somewhere a pot fills and a stranger cheers. You still climb. ' +
      'This crown will not come from a ticket. It comes from every fight you already won.',
    boss:
      'The Warden lifts two crowns — one bright with chance, one dark with scars. ' +
      '“Only one fits skill,” he says. “Take it, if you are more than the draw.”',
    clear:
      'The Road ends. The scarred crown is yours. ' +
      'The city will still scream for pots — but you know which king you are. ' +
      'Endless depths wait if you want to keep proving it.',
    battleBeats: [
      'Candle smoke. Old oaths.',
      'Two crowns cast two shadows.',
      'This is the last argument.',
    ],
  },
];

/** Short line for battle UI — rotates by stage */
export function battleStoryBeat(chapter, stage) {
  const ch = CHAPTERS.find((c) => c.id === chapter) || CHAPTERS[0];
  const beats = ch.battleBeats || [];
  if (!beats.length) return '';
  return beats[Math.abs((stage || 1) - 1) % beats.length];
}

export const STAT_DISPLAY = {
  power: { id: 'power', short: 'ATK', full: 'Attack', emoji: '⚔️' },
  vitality: { id: 'vitality', short: 'HP', full: 'Hit Points', emoji: '❤️' },
  guard: { id: 'guard', short: 'DEF', full: 'Defense', emoji: '🛡️' },
  speed: { id: 'speed', short: 'SPD', full: 'Speed', emoji: '💨' },
};

export function chapterById(id) {
  return CHAPTERS.find((c) => c.id === Number(id)) || CHAPTERS[0];
}

export function totalChapters() {
  return CHAPTERS.length;
}

/** Boss gate every BOSS_EVERY stages (10, 20, … and final). */
export function isBossStage(ch, stage) {
  const s = Number(stage) || 0;
  const total = ch?.stages || STAGES_PER_CHAPTER;
  if (s <= 0) return false;
  if (s >= total) return true;
  return s % BOSS_EVERY === 0;
}

export function isChapterEnd(ch, stage) {
  return Number(stage) >= (ch?.stages || STAGES_PER_CHAPTER);
}

/** Named boss for this stage if any */
export function bossNameFor(ch, stage) {
  const s = Number(stage);
  if (ch?.zoneBosses?.[s]) return ch.zoneBosses[s];
  if (isChapterEnd(ch, s)) return ch.bossName;
  if (isBossStage(ch, s)) return `${ch.title} Gate ${s}`;
  return ch.bossName;
}

/**
 * Which world theme you’re standing in at this stage.
 * Trails map equal slices of the 50-stage road.
 */
export function themeForStage(chapterId, stage) {
  const ch = chapterById(chapterId);
  const trail = ch.themeTrail || ['dustlands'];
  const total = ch.stages || STAGES_PER_CHAPTER;
  const s = Math.max(1, Math.min(total, Number(stage) || 1));
  const idx = Math.min(
    trail.length - 1,
    Math.floor(((s - 1) / total) * trail.length)
  );
  const key = trail[idx];
  const theme = WORLD_THEMES[key] || WORLD_THEMES.dustlands;
  const zone = Math.ceil(s / BOSS_EVERY);
  return {
    ...theme,
    zone,
    zoneLabel: `Zone ${zone}`,
    stageInZone: ((s - 1) % BOSS_EVERY) + 1,
    isBoss: isBossStage(ch, s),
    needsBossAd: isBossStage(ch, s),
  };
}

function formatStatGain(parts) {
  return parts
    .filter((p) => p.amount > 0)
    .map((p) => {
      const d = STAT_DISPLAY[p.stat] || { short: p.stat };
      return `+${p.amount} ${d.short}`;
    })
    .join(' · ');
}

const ROAD_STAT_CYCLE = ['power', 'vitality', 'guard', 'speed', 'power', 'guard'];

/**
 * Clear permanent rewards — exact ATK/HP/DEF/SPD, never vague %.
 * First clear > replay. Boss stages pay better.
 */
export function roadRewardForStage(chapterId, stage, stagesTotal, { replay = false } = {}) {
  const ch = chapterById(chapterId);
  const isBoss = isBossStage(ch, stage);
  const isFinal = isChapterEnd(ch, stage);

  if (isBoss) {
    if (replay) {
      return {
        power: 1,
        label: '+1 ATK (replay)',
        kind: 'boss_replay',
        icon: '👑',
        replay: true,
        parts: [{ stat: 'power', amount: 1, short: 'ATK' }],
      };
    }
    // First-clear boss: big clear package
    const atk = isFinal ? 4 : 3;
    const def = isFinal ? 3 : 2;
    const hp = isFinal ? 2 : 1;
    return {
      power: atk,
      guard: def,
      vitality: hp,
      label: formatStatGain([
        { stat: 'power', amount: atk },
        { stat: 'guard', amount: def },
        { stat: 'vitality', amount: hp },
      ]),
      kind: isFinal ? 'chapter_boss' : 'zone_boss',
      icon: '👑',
      replay: false,
      parts: [
        { stat: 'power', amount: atk, short: 'ATK' },
        { stat: 'guard', amount: def, short: 'DEF' },
        { stat: 'vitality', amount: hp, short: 'HP' },
      ],
    };
  }

  const idx = ((chapterId - 1) * 3 + (stage - 1)) % ROAD_STAT_CYCLE.length;
  const stat = ROAD_STAT_CYCLE[idx];
  const amt = replay ? 1 : stage % 5 === 0 ? 2 : 1;
  const d = STAT_DISPLAY[stat];
  return {
    [stat]: amt,
    label: formatStatGain([{ stat, amount: amt }]) + (replay ? ' (replay)' : ''),
    kind: replay ? 'replay' : 'milestone',
    icon: d.emoji,
    stat,
    replay: !!replay,
    parts: [{ stat, amount: amt, short: d.short }],
  };
}

/**
 * Path nodes for map UI.
 * 50 stages: mark zone bosses, theme labels, hero on frontier.
 */
export function buildChapterPath(chapterId, frontierStage) {
  const ch = chapterById(chapterId);
  const total = ch.stages || STAGES_PER_CHAPTER;
  const frontier = Math.max(1, Math.min(total, Number(frontierStage) || 1));
  const nodes = [];
  for (let s = 1; s <= total; s++) {
    const reward = roadRewardForStage(chapterId, s, total, { replay: false });
    const replayReward = roadRewardForStage(chapterId, s, total, { replay: true });
    const theme = themeForStage(chapterId, s);
    const boss = isBossStage(ch, s);
    let state = 'locked';
    if (s < frontier) state = 'cleared';
    else if (s === frontier) state = 'here';
    else state = 'locked';

    // Boss loot blurb for map chest chip (gems on first-clear boss come from finishTactical)
    const bossLoot = boss
      ? {
          chest: true,
          title: 'BOSS',
          name: bossNameFor(ch, s),
          // First clear: permanent stats + bank gems (server pays 3–8 on boss win)
          gemHint: isChapterEnd(ch, s) ? '💎8+' : '💎3+',
          rewardLabel: reward.label,
          blurb: `${reward.label} · gems`,
        }
      : null;

    nodes.push({
      stage: s,
      label: boss ? bossNameFor(ch, s) : `Lv ${s}`,
      isBoss: boss,
      bossLoot,
      // Portrait hint for map art (client picks cutout by gender/tier)
      bossArt: boss
        ? {
            gender: s % 2 === 0 ? 'girl' : 'boy',
            visualTier: 2,
            emoji: '👑',
          }
        : null,
      reward,
      replayReward,
      state,
      playable: s <= frontier,
      needsAd: s < frontier || boss, // replay OR boss entry needs ad
      needsBossAd: boss,
      themeId: theme.id,
      themeName: theme.name,
      themeEmoji: theme.emoji,
      zone: theme.zone,
      cta: boss
        ? s < frontier
          ? `Replay boss · ad · ${replayReward.label}`
          : s === frontier
            ? `Boss · ad · ${reward.label}`
            : 'Locked'
        : s < frontier
          ? `Replay · ad · ${replayReward.label}`
          : s === frontier
            ? `Play · ${reward.label}`
            : 'Locked',
    });
  }
  return nodes;
}

export function emptyRoadBonus() {
  return { power: 0, vitality: 0, speed: 0, guard: 0, luck: 0 };
}

export function parseRoadBonus(json) {
  const o = emptyRoadBonus();
  try {
    const j = typeof json === 'string' ? JSON.parse(json || '{}') : json || {};
    for (const k of Object.keys(o)) {
      const n = Number(j[k]) || 0;
      o[k] = Math.max(0, Math.min(120, Math.floor(n)));
    }
  } catch {
    /* ignore */
  }
  return o;
}

export function applyRoadReward(bonus, reward) {
  const next = { ...bonus };
  for (const k of ['power', 'vitality', 'speed', 'guard', 'luck']) {
    if (reward[k]) next[k] = Math.min(120, (next[k] || 0) + reward[k]);
  }
  return next;
}

export function formatRoadBonus(bonus) {
  const b = bonus || emptyRoadBonus();
  return [
    `ATK +${b.power || 0}`,
    `HP +${b.vitality || 0}`,
    `DEF +${b.guard || 0}`,
    `SPD +${b.speed || 0}`,
  ].join('  ');
}

/** Flat permanent pick after bosses — exact numbers, not % */
export function bossPickOptions() {
  return [
    {
      id: 'power',
      label: 'ATK',
      emoji: '⚔️',
      blurb: 'Permanent +2 Attack (ATK)',
      amount: 2,
    },
    {
      id: 'vitality',
      label: 'HP',
      emoji: '❤️',
      blurb: 'Permanent +4 Hit Points (HP)',
      amount: 4,
    },
    {
      id: 'guard',
      label: 'DEF',
      emoji: '🛡️',
      blurb: 'Permanent +2 Defense (DEF)',
      amount: 2,
    },
    {
      id: 'speed',
      label: 'SPD',
      emoji: '💨',
      blurb: 'Permanent +2 Speed (SPD)',
      amount: 2,
    },
  ];
}
