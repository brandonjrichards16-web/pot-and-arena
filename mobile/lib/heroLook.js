/**
 * Simple look ladder from upgrades → one clean full-body portrait.
 * No gear overlays stacked on top (those covered the hero).
 */

const boyLooks = {
  bare: require('../assets/characters/looks/boy_bare.jpg'),
  muscle: require('../assets/characters/looks/boy_muscle.jpg'),
  club: require('../assets/characters/looks/boy_club.jpg'),
  leather: require('../assets/characters/looks/boy_leather.jpg'),
  armed: require('../assets/characters/looks/boy_armed.jpg'),
  armedPlus: require('../assets/characters/looks/boy_armed_plus.jpg'),
  ultimate: require('../assets/characters/looks/boy_ultimate.jpg'),
};

const girlLooks = {
  bare: require('../assets/characters/looks/girl_bare.jpg'),
  muscle: require('../assets/characters/looks/girl_bare.jpg'),
  club: require('../assets/characters/looks/girl_bare.jpg'),
  leather: require('../assets/characters/looks/girl_armed.jpg'),
  armed: require('../assets/characters/looks/girl_armed.jpg'),
  armedPlus: require('../assets/characters/looks/girl_armed.jpg'),
  ultimate: require('../assets/characters/looks/girl_ultimate.jpg'),
};

/**
 * One portrait for the current build (tech upgrades only).
 * Gear is inventory/stats — it does not recolor or swap the hero art.
 */
export function resolveBodyArt(gender, upgrades = {}, _gearKinds = null) {
  const g = gender === 'girl' ? girlLooks : boyLooks;
  const w = upgrades.weapon || 0;
  const a = upgrades.armor || 0;
  const m = upgrades.muscle || 0;
  const f = upgrades.footwork || 0;
  const s = upgrades.iron_skin || 0;
  const fate = upgrades.fate || 0;
  const total = w + a + m + f + s + fate;

  if (w >= 4 || a >= 4 || total >= 16) {
    return { source: g.ultimate, key: 'ultimate', label: 'Ultimate' };
  }
  if ((w >= 2 && a >= 2) || total >= 10) {
    return { source: g.armedPlus, key: 'armedPlus', label: 'War ready' };
  }
  if (w >= 2 || a >= 2 || total >= 6) {
    return { source: g.armed, key: 'armed', label: 'Armed' };
  }
  if (w >= 1 && a >= 1) {
    return { source: g.leather, key: 'leather', label: 'Leather & steel' };
  }
  if (w >= 1) {
    return { source: g.club, key: 'club', label: 'First weapon' };
  }
  if (m >= 1 || s >= 2) {
    return { source: g.muscle, key: 'muscle', label: 'Trained' };
  }
  return { source: g.bare, key: 'bare', label: 'Bare' };
}

/** Short label for next buy on a track (upgrade chips). */
export function describeLookChange(track, level) {
  const map = {
    muscle: ['Trained body', 'Thicker frame', 'Brawler build', 'Beast bulk', 'Titan build'],
    iron_skin: ['Tougher hide', 'Stone hide', 'Scarred tough', 'Iron flesh', 'Unbreakable'],
    footwork: ['Better footing', 'Quick step', 'Greaves', 'Shadow step', 'Gale stride'],
    armor: ['Leather', 'Spaulders', 'Iron plate', 'Helm', 'Full plate'],
    weapon: ['Club', 'Blade', 'Steel sword', 'War axe', 'Doom edge'],
    fate: ['Lucky edge', 'Fate mark', 'Oracle eye', 'Star-touched', 'Chosen'],
  };
  const arr = map[track];
  if (!arr || level < 1) return null;
  return arr[level - 1] || null;
}
