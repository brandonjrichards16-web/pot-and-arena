/**
 * Every upgrade rank = one visible perk on the hero.
 * 6 tracks × 5 ranks = 30 distinct looks.
 *
 * Zones are laid out around the character stage (not random HUD).
 */

/** @typedef {{ id: string, name: string, icon: string, zone: string, glow?: string }} VisualPerk */

/** Rank index 0 = first purchase (level becomes 1). */
export const PERK_LADDERS = {
  muscle: [
    { id: 'muscle_1', name: 'Pumped', icon: '💪', zone: 'arms', glow: '#4ade80' },
    { id: 'muscle_2', name: 'Thick Arms', icon: '🦾', zone: 'arms', glow: '#4ade80' },
    { id: 'muscle_3', name: 'Brawler Chest', icon: '🫁', zone: 'chest', glow: '#22c55e' },
    { id: 'muscle_4', name: 'Pit Beast', icon: '🐗', zone: 'chest', glow: '#16a34a' },
    { id: 'muscle_5', name: 'Titan Frame', icon: '🗿', zone: 'head', glow: '#15803d' },
  ],
  iron_skin: [
    { id: 'skin_1', name: 'Calloused', icon: '🩹', zone: 'chest', glow: '#94a3b8' },
    { id: 'skin_2', name: 'Stone Hide', icon: '🪨', zone: 'chest', glow: '#64748b' },
    { id: 'skin_3', name: 'Scar Map', icon: '⚔️', zone: 'face', glow: '#78716c' },
    { id: 'skin_4', name: 'Iron Flesh', icon: '🛡️', zone: 'chest', glow: '#a8a29e' },
    { id: 'skin_5', name: 'Unbreakable', icon: '💎', zone: 'aura', glow: '#e2e8f0' },
  ],
  footwork: [
    { id: 'feet_1', name: 'Wraps', icon: '🦶', zone: 'feet', glow: '#fbbf24' },
    { id: 'feet_2', name: 'Sandals+', icon: '👡', zone: 'feet', glow: '#f59e0b' },
    { id: 'feet_3', name: 'Greaves', icon: '🦿', zone: 'feet', glow: '#d97706' },
    { id: 'feet_4', name: 'Shadow Step', icon: '💨', zone: 'feet', glow: '#a78bfa' },
    { id: 'feet_5', name: 'Gale Boots', icon: '🌪️', zone: 'feet', glow: '#c4b5fd' },
  ],
  armor: [
    { id: 'armor_1', name: 'Leather Vest', icon: '🦺', zone: 'chest', glow: '#a16207' },
    { id: 'armor_2', name: 'Spaulders', icon: '🥋', zone: 'shoulders', glow: '#78716c' },
    { id: 'armor_3', name: 'Iron Plate', icon: '🧱', zone: 'chest', glow: '#94a3b8' },
    { id: 'armor_4', name: 'Helm', icon: '⛑️', zone: 'head', glow: '#cbd5e1' },
    { id: 'armor_5', name: 'Full Plate', icon: '🛡️', zone: 'aura', glow: '#fbbf24' },
  ],
  weapon: [
    { id: 'wep_1', name: 'Wood Club', icon: '🪵', zone: 'hand', glow: '#a16207' },
    { id: 'wep_2', name: 'Rusty Blade', icon: '🔪', zone: 'hand', glow: '#78716c' },
    { id: 'wep_3', name: 'Steel Sword', icon: '🗡️', zone: 'hand', glow: '#94a3b8' },
    { id: 'wep_4', name: 'War Axe', icon: '🪓', zone: 'hand', glow: '#f87171' },
    { id: 'wep_5', name: 'Doom Edge', icon: '⚔️', zone: 'hand', glow: '#fbbf24' },
  ],
  fate: [
    { id: 'fate_1', name: 'Lucky Charm', icon: '🍀', zone: 'aura', glow: '#4ade80' },
    { id: 'fate_2', name: 'Fate Mark', icon: '✨', zone: 'face', glow: '#fde047' },
    { id: 'fate_3', name: 'Oracle Eye', icon: '👁️', zone: 'face', glow: '#a78bfa' },
    { id: 'fate_4', name: 'Star Halo', icon: '🌟', zone: 'head', glow: '#fbbf24' },
    { id: 'fate_5', name: 'Chosen Aura', icon: '👑', zone: 'aura', glow: '#f59e0b' },
  ],
};

/**
 * All perks currently owned (level N unlocks ranks 0..N-1).
 * @returns {VisualPerk[]}
 */
export function activePerks(upgrades = {}) {
  const list = [];
  for (const [track, ladder] of Object.entries(PERK_LADDERS)) {
    const lvl = Math.max(0, Math.min(ladder.length, Number(upgrades[track]) || 0));
    for (let i = 0; i < lvl; i++) list.push({ ...ladder[i], track });
  }
  return list;
}

/** Newest perk from a track after buying (for toast / flash). */
export function perkJustUnlocked(track, newLevel) {
  const ladder = PERK_LADDERS[track];
  if (!ladder || newLevel < 1) return null;
  return ladder[newLevel - 1] || null;
}

/**
 * Where to pin a zone around a portrait (percent of stage).
 * Tuned for full-body centered art.
 */
export const ZONE_STYLE = {
  head: { top: '4%', left: '42%' },
  face: { top: '12%', left: '58%' },
  shoulders: { top: '22%', left: '12%' },
  arms: { top: '36%', left: '6%' },
  chest: { top: '40%', left: '70%' },
  hand: { top: '48%', right: '6%', left: undefined },
  feet: { bottom: '8%', left: '38%' },
  aura: { top: '2%', right: '4%', left: undefined },
};

/** Stack offset when multiple perks share a zone */
export function zoneOffset(indexInZone) {
  return {
    transform: [{ translateX: (indexInZone % 3) * 18 }, { translateY: Math.floor(indexInZone / 3) * 20 }],
  };
}
