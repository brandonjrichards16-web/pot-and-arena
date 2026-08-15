/**
 * Official hero looks + multi-angle turn sets for the WebGL orbit stage.
 *
 * Race × class × gender × front/back portraits live under assets/characters/heroes/
 * Naming: {race}_{class}_{boy|girl}_{front|back}.png (transparent cutouts)
 */

import { SET_OUTFIT_MAP } from './setOutfitMap';

const boy = {
  0: require('../assets/characters/boy_0.jpg'),
  1: require('../assets/characters/boy_1.jpg'),
  2: require('../assets/characters/boy_2.jpg'),
};
const girl = {
  0: require('../assets/characters/girl_0.jpg'),
  1: require('../assets/characters/girl_1.jpg'),
  2: require('../assets/characters/girl_2.jpg'),
};

/** 3 races × 3 classes × 2 genders × front+back */
const HERO_ART = {
  human: {
    warrior: {
      boy: {
        front: require('../assets/characters/heroes/human_warrior_boy_front.png'),
        back: require('../assets/characters/heroes/human_warrior_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/human_warrior_girl_front.png'),
        back: require('../assets/characters/heroes/human_warrior_girl_back.png'),
      },
    },
    ranger: {
      boy: {
        front: require('../assets/characters/heroes/human_ranger_boy_front.png'),
        back: require('../assets/characters/heroes/human_ranger_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/human_ranger_girl_front.png'),
        back: require('../assets/characters/heroes/human_ranger_girl_back.png'),
      },
    },
    mage: {
      boy: {
        front: require('../assets/characters/heroes/human_mage_boy_front.png'),
        back: require('../assets/characters/heroes/human_mage_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/human_mage_girl_front.png'),
        back: require('../assets/characters/heroes/human_mage_girl_back.png'),
      },
    },
  },
  elf: {
    warrior: {
      boy: {
        front: require('../assets/characters/heroes/elf_warrior_boy_front.png'),
        back: require('../assets/characters/heroes/elf_warrior_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/elf_warrior_girl_front.png'),
        back: require('../assets/characters/heroes/elf_warrior_girl_back.png'),
      },
    },
    ranger: {
      boy: {
        front: require('../assets/characters/heroes/elf_ranger_boy_front.png'),
        back: require('../assets/characters/heroes/elf_ranger_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/elf_ranger_girl_front.png'),
        back: require('../assets/characters/heroes/elf_ranger_girl_back.png'),
      },
    },
    mage: {
      boy: {
        front: require('../assets/characters/heroes/elf_mage_boy_front.png'),
        back: require('../assets/characters/heroes/elf_mage_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/elf_mage_girl_front.png'),
        back: require('../assets/characters/heroes/elf_mage_girl_back.png'),
      },
    },
  },
  ork: {
    warrior: {
      boy: {
        front: require('../assets/characters/heroes/ork_warrior_boy_front.png'),
        back: require('../assets/characters/heroes/ork_warrior_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/ork_warrior_girl_front.png'),
        back: require('../assets/characters/heroes/ork_warrior_girl_back.png'),
      },
    },
    ranger: {
      boy: {
        front: require('../assets/characters/heroes/ork_ranger_boy_front.png'),
        back: require('../assets/characters/heroes/ork_ranger_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/ork_ranger_girl_front.png'),
        back: require('../assets/characters/heroes/ork_ranger_girl_back.png'),
      },
    },
    mage: {
      boy: {
        front: require('../assets/characters/heroes/ork_mage_boy_front.png'),
        back: require('../assets/characters/heroes/ork_mage_boy_back.png'),
      },
      girl: {
        front: require('../assets/characters/heroes/ork_mage_girl_front.png'),
        back: require('../assets/characters/heroes/ork_mage_girl_back.png'),
      },
    },
  },
};

/**
 * Full-set armor outfits under assets/characters/sets/
 * Key: {origin}_{race}_{class}_{gender}_{view}
 *
 * CRITICAL: set art must NEVER rewrite race, gender, or class.
 * We only swap the body sprite when we have art for THAT exact
 * race × class × gender (+ origin). No cross-identity fallbacks.
 * Map is auto-expanded as outfit PNGs are added (lib/setOutfitMap.js).
 */

/** Labels for set names in UI captions (not color overlays). */
export const GEAR_ORIGIN_LOOK = {
  elvan: { id: 'elvan', name: 'Elvan-Made', emoji: '🌿', color: '#4ade80' },
  human: { id: 'human', name: 'Human-Forged', emoji: '⚒️', color: '#fbbf24' },
  ork: { id: 'ork', name: 'Ork-Made', emoji: '💀', color: '#f87171' },
  concord: { id: 'concord', name: 'Concord Alloy', emoji: '🕊️', color: '#38bdf8' },
  elderblight: {
    id: 'elderblight',
    name: 'Elderblight',
    emoji: '☠️',
    color: '#a78bfa',
  },
};

export function gearOriginLook(originId) {
  return GEAR_ORIGIN_LOOK[originId] || null;
}

/**
 * True only when we have a set sprite for this exact identity + origin.
 */
export function hasExactSetOutfit(opts = {}) {
  const race = HERO_ART[opts.race] ? opts.race : 'human';
  const classId = HERO_ART[race]?.[opts.classId] ? opts.classId : 'warrior';
  const gender = opts.gender === 'girl' ? 'girl' : 'boy';
  const view = opts.view === 'back' ? 'back' : 'front';
  const gearOrigin = opts.gearOrigin || opts.outfitSet || null;
  if (!gearOrigin) return false;
  return !!SET_OUTFIT_MAP[`${gearOrigin}_${race}_${classId}_${gender}_${view}`];
}

/**
 * @param {{ race?: string, classId?: string, gender?: string, view?: 'front'|'back', gearOrigin?: string|null }} opts
 * @returns image source for the hero. Race / gender / class always win over gear.
 */
export function heroPortrait(opts = {}) {
  const race = HERO_ART[opts.race] ? opts.race : 'human';
  const classId = HERO_ART[race][opts.classId] ? opts.classId : 'warrior';
  const gender = opts.gender === 'girl' ? 'girl' : 'boy';
  const view = opts.view === 'back' ? 'back' : 'front';
  const gearOrigin = opts.gearOrigin || opts.outfitSet || null;

  // Full matching set → that origin's outfit art (exact race/class/gender/view only).
  // Never use a front set sprite for a back view.
  if (gearOrigin) {
    const exact = `${gearOrigin}_${race}_${classId}_${gender}_${view}`;
    if (SET_OUTFIT_MAP[exact]) return SET_OUTFIT_MAP[exact];
  }

  // Base hero cutout when no full set (or set art missing for this view).
  return HERO_ART[race][classId][gender][view];
}

export const GEAR_OUTFIT_ORIGINS = [
  'human',
  'elvan',
  'ork',
  'concord',
  'elderblight',
];

/** Bare-boy 8-angle turn (transparent PNG cutouts) */
const boy0Turns = [
  require('../assets/characters/turns/boy_0/000.png'),
  require('../assets/characters/turns/boy_0/045.png'),
  require('../assets/characters/turns/boy_0/090.png'),
  require('../assets/characters/turns/boy_0/135.png'),
  require('../assets/characters/turns/boy_0/180.png'),
  require('../assets/characters/turns/boy_0/225.png'),
  require('../assets/characters/turns/boy_0/270.png'),
  require('../assets/characters/turns/boy_0/315.png'),
];

/**
 * Girl turns — front/rear only for now (+ 045 copy for variety).
 */
const girl0Turns = {
  0: require('../assets/characters/turns/girl_0/000.png'),
  1: require('../assets/characters/turns/girl_0/045.png'),
  4: require('../assets/characters/turns/girl_0/180.png'), // rear
};

export const PATHS = {
  boy: [
    { id: 'bare', label: 'Bare', blurb: 'Nobody from the dust' },
    { id: 'blade', label: 'Blade', blurb: 'Armed and rising' },
    { id: 'crown', label: 'Crown', blurb: 'Ultimate killer' },
  ],
  girl: [
    { id: 'bare', label: 'Bare', blurb: 'Nobody from the dust' },
    { id: 'blade', label: 'Blade', blurb: 'Armed and rising' },
    { id: 'crown', label: 'Crown', blurb: 'Ultimate killer' },
  ],
};

/**
 * Front portrait. Prefer race/class hero art when provided.
 * @param {string} gender
 * @param {number} [tier]
 * @param {{ race?: string, classId?: string }} [hero]
 */
export function portraitFor(gender, tier = 0, hero = null) {
  if (hero?.race || hero?.classId) {
    return heroPortrait({
      race: hero.race || 'human',
      classId: hero.classId || 'warrior',
      gender,
      view: 'front',
      gearOrigin: hero.gearOrigin || hero.outfitSet || null,
    });
  }
  const t = Math.max(0, Math.min(2, Number(tier) || 0));
  if (gender === 'girl') return girl[t];
  return boy[t];
}

/** Rear view (from behind) for over-the-shoulder campaign battles */
export function rearPortraitFor(gender, tier = 0, hero = null) {
  if (hero?.race || hero?.classId) {
    return heroPortrait({
      race: hero.race || 'human',
      classId: hero.classId || 'warrior',
      gender,
      view: 'back',
      gearOrigin: hero.gearOrigin || hero.outfitSet || null,
    });
  }
  if (gender === 'girl') {
    return girl0Turns[4];
  }
  // 180° frame = facing away from camera
  return boy0Turns[4];
}

/**
 * Campaign foe sprite — ALWAYS transparent PNG cutouts.
 * Never use JPG portraits here (those have rectangular painted backgrounds
 * that read as "floating boxes").
 *
 * @param {string} gender
 * @param {number} tier
 * @param {string} [seed] foe id / name for angle variety
 */
export function frontSpriteFor(gender, tier = 0, seed = '') {
  let h = 0;
  const s = String(seed || gender || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;

  if (gender === 'girl') {
    const frontish = [0, 1, 0, 1];
    const idx = frontish[Math.abs(h) % frontish.length];
    return girl0Turns[idx] || girl0Turns[0];
  }

  // Front-ish angles only (facing the player on the path)
  const frontish = [0, 1, 7, 0, 1]; // 000, 045, 315…
  const idx = frontish[Math.abs(h) % frontish.length];
  return boy0Turns[idx];
}

/**
 * Always prefer multi-angle when we have a turn set.
 * Boy: full 8-angle orbit. Girl: front + rear for now.
 */
export function turnFramesFor(gender, tier = 0, hero = null) {
  // Race/class: front + back orbit (full turn set not generated yet)
  if (hero?.race || hero?.classId) {
    const front = heroPortrait({
      race: hero.race || 'human',
      classId: hero.classId || 'warrior',
      gender,
      view: 'front',
    });
    const back = heroPortrait({
      race: hero.race || 'human',
      classId: hero.classId || 'warrior',
      gender,
      view: 'back',
    });
    return [front, front, back, back];
  }
  if (gender === 'girl') {
    return [girl0Turns[0], girl0Turns[1], girl0Turns[4], girl0Turns[1]];
  }
  return boy0Turns;
}

export function tierLabel(tier) {
  if (tier >= 2) return 'Ultimate';
  if (tier >= 1) return 'Armed';
  return 'Bare';
}

export function pathFor(gender, tier = 0) {
  const t = Math.max(0, Math.min(2, Number(tier) || 0));
  const list = gender === 'girl' ? PATHS.girl : PATHS.boy;
  return list[t];
}
