/**
 * Turn-based tactical combat for Campaign.
 * Speed fills an action gauge — faster units act more often.
 * Player: Attack (pick target) or Buff (costs turn: ATK / DEF / SPD up).
 */

import { mulberry32, hashSeed } from './combat.js';
import { raceDamageMult, normalizeRace } from './heroes.js';
import { cleaveDamageScale } from './gear.js';

const GAUGE_MAX = 100;
const BUFF_MULT = 1.22;
/** Road type chart strength (~25% RPS) */
const ROAD_TYPE_SCALE = 0.25;
/**
 * Damage bias — early road is fair; gear/tech still matter after zone 1.
 */
const FOE_DMG_MULT = 0.98;
const HERO_DMG_MULT = 1.06;

export function buildTacticalBattle({
  hero,
  foes,
  seed,
  clearNote = '',
  sceneKey = null,
  worldTheme = null,
}) {
  const rand = mulberry32(hashSeed(seed + ':tactical'));
  const units = [];

  // Slight hero padding so 1–2 starter tech ranks feel meaningful
  const hMax = Math.max(36, Math.round((hero.vitality || 30) * 1.32));
  const hAtk = Math.max(6, Math.round((hero.power || 10) * 1.06));
  const hDef = Math.max(3, Math.round((hero.guard || 5) * 1.02));
  const hSpd = Math.max(5, Math.round((hero.speed || 10) * 1.0));
  const heroSet = hero.gearSet || null;
  units.push({
    id: hero.userId || 'hero',
    name: hero.displayName || 'You',
    isHero: true,
    isBot: false,
    gender: hero.gender || 'boy',
    visualTier: hero.visualTier || 0,
    race: normalizeRace(hero.race || hero.raceId || 'human'),
    classId: String(hero.classId || 'warrior').toLowerCase(),
    className: hero.className || null,
    maxHp: hMax,
    hp: hMax,
    atk: hAtk,
    def: hDef,
    spd: hSpd,
    baseAtk: hAtk,
    baseDef: hDef,
    baseSpd: hSpd,
    gauge: 40 + Math.floor(rand() * 25),
    alive: true,
    buffs: { atk: 0, def: 0, spd: 0 },
    gearSet: heroSet,
    gearOrigin: heroSet?.originId || hero.gearOrigin || null,
    setBlockCharges: Math.max(
      0,
      Number(heroSet?.blockCharges) || (heroSet?.firstHitBlock ? 1 : 0)
    ),
    stunned: false,
  });

  for (const f of foes) {
    const raw = f.maxHp || (f.vitality || 18) * 1.0;
    // Enough HP that stage-1 foes survive a hit and get a counter swing (class VFX)
    const maxHp = Math.max(32, Math.round(raw * (f.isBoss ? 1.35 : 1.28)));
    const atk = Math.max(4, Math.round((f.power || f.atk || 8) * 1.0));
    const def = Math.max(2, Math.round((f.guard || f.def || 4) * 0.95));
    const spd = Math.max(4, Math.round((f.speed || f.spd || 8) * 1.0));
    units.push({
      id: f.userId,
      name: f.displayName || 'Foe',
      isHero: false,
      isBot: true,
      gender: f.gender || 'boy',
      visualTier: f.visualTier || 0,
      race: normalizeRace(f.race || f.raceId || 'human'),
      classId: String(f.classId || 'warrior').toLowerCase(),
      className: f.className || null,
      isBoss: !!f.isBoss,
      kind: f.kind || 'rival',
      kindLabel: f.kindLabel || 'Foe',
      kindEmoji: f.kindEmoji || '⚔️',
      usePortrait: f.usePortrait !== false, // default: always show a fighter portrait
      lane: typeof f.lane === 'number' ? f.lane : 0,
      depth: f.depth || 0,
      maxHp,
      hp: maxHp,
      atk,
      def,
      spd,
      baseAtk: atk,
      baseDef: def,
      baseSpd: spd,
      // Act often enough to land hits between your swings
      gauge: 15 + Math.floor(rand() * 40),
      alive: true,
      buffs: { atk: 0, def: 0, spd: 0 },
    });
  }

  return {
    seed,
    units,
    log: [],
    turn: 0,
    status: 'active', // active | won | lost
    awaiting: 'player', // player | resolving
    clearNote,
    sceneKey: sceneKey || null,
    worldTheme: worldTheme || null,
  };
}

function effective(u) {
  const atkM = 1 + (u.buffs?.atk || 0) * (BUFF_MULT - 1);
  const defM = 1 + (u.buffs?.def || 0) * (BUFF_MULT - 1);
  const spdM = 1 + (u.buffs?.spd || 0) * (BUFF_MULT - 1);
  // Stacking: each buff level multiplies — first +20%, second more
  let atk = u.baseAtk;
  let def = u.baseDef;
  let spd = u.baseSpd;
  for (let i = 0; i < (u.buffs?.atk || 0); i++) atk = Math.round(atk * BUFF_MULT);
  for (let i = 0; i < (u.buffs?.def || 0); i++) def = Math.round(def * BUFF_MULT);
  for (let i = 0; i < (u.buffs?.spd || 0); i++) spd = Math.round(spd * BUFF_MULT);
  return {
    atk: Math.max(1, atk),
    def: Math.max(0, def),
    spd: Math.max(1, spd),
  };
}

function publicUnit(u) {
  const e = effective(u);
  return {
    id: u.id,
    name: u.name,
    isHero: !!u.isHero,
    isBoss: !!u.isBoss,
    gender: u.gender,
    visualTier: u.visualTier || 0,
    race: u.race || 'human',
    classId: String(u.classId || 'warrior').toLowerCase(),
    className: u.className || null,
    lane: typeof u.lane === 'number' ? u.lane : 0,
    depth: u.depth || 0,
    kind: u.kind || (u.isHero ? 'hero' : 'rival'),
    kindLabel: u.kindLabel || (u.isBoss ? 'Boss' : 'Foe'),
    kindEmoji: u.kindEmoji || (u.isBoss ? '👑' : '⚔️'),
    usePortrait: u.isHero ? true : !!u.usePortrait,
    // Full-set armor art for portraits (road / pits / campaign)
    gearOrigin: u.gearOrigin || u.gearSet?.originId || null,
    gearSet: u.gearSet
      ? {
          originId: u.gearSet.originId,
          name: u.gearSet.name,
          emoji: u.gearSet.emoji,
          minLevel: u.gearSet.minLevel,
        }
      : null,
    hp: u.hp,
    maxHp: u.maxHp,
    atk: e.atk,
    def: e.def,
    spd: e.spd,
    alive: u.alive && u.hp > 0,
    buffs: { ...u.buffs },
  };
}

export function publicBattle(battle) {
  if (!battle) return null;
  const hero = battle.units.find((u) => u.isHero);
  const foes = battle.units.filter((u) => !u.isHero);
  return {
    status: battle.status,
    awaiting: battle.awaiting,
    turn: battle.turn,
    hero: hero ? publicUnit(hero) : null,
    foes: foes.map(publicUnit),
    log: (battle.log || []).slice(-12),
    // Buff menu scrapped — combat is tap-to-attack only
    buffOptions: [],
    sceneKey: battle.sceneKey || null,
    worldTheme: battle.worldTheme || null,
  };
}

/**
 * @returns {{ dmg: number, blocked?: boolean, setProc?: string|null }}
 */
function dealDamage(atk, def, rand, { cleaveScale = 1 } = {}) {
  // Gear set: first-hit block (Stonewall / Apex)
  if (def.setBlockCharges > 0) {
    def.setBlockCharges -= 1;
    let setProc = 'set_block';
    if (
      def.gearSet?.counterStunChance &&
      rand() < def.gearSet.counterStunChance
    ) {
      atk.stunned = true;
      setProc = 'counter_stun';
    }
    return { dmg: 0, blocked: true, setProc };
  }

  const ae = effective(atk);
  const de = effective(def);
  // atk vs def with real variance — both sides hurt
  let dmg = ae.atk - de.def * 0.28 + rand() * (ae.atk * 0.3);
  if (!atk.isHero) dmg *= FOE_DMG_MULT;
  if (atk.isHero) dmg *= HERO_DMG_MULT;
  // Race RPS: Elf > Ork > Human > Elf (~25% on the Road)
  const type = raceDamageMult(atk.race, def.race, ROAD_TYPE_SCALE);
  dmg *= type.mult;
  if (atk.gearSet?.damageMult && atk.gearSet.damageMult !== 1) {
    dmg *= atk.gearSet.damageMult;
  }
  dmg *= cleaveScale;
  dmg = Math.max(atk.isHero ? 3 : 3, Math.round(dmg));
  def.hp = Math.max(0, def.hp - dmg);
  if (def.hp <= 0) def.alive = false;

  let setProc = null;
  if (
    dmg > 0 &&
    atk.gearSet?.stunOnHitChance &&
    rand() < atk.gearSet.stunOnHitChance
  ) {
    def.stunned = true;
    setProc = 'stun';
  }
  return { dmg, blocked: false, setProc };
}

function living(units) {
  return units.filter((u) => u.alive && u.hp > 0);
}

function checkEnd(battle) {
  const hero = battle.units.find((u) => u.isHero);
  const foes = living(battle.units.filter((u) => !u.isHero));
  if (!hero || hero.hp <= 0) {
    battle.status = 'lost';
    battle.awaiting = 'done';
    battle.log.push({ t: 'lose', text: 'You fall…' });
    return true;
  }
  if (!foes.length) {
    battle.status = 'won';
    battle.awaiting = 'done';
    battle.log.push({ t: 'win', text: 'All foes down!' });
    return true;
  }
  return false;
}

/** Advance gauges until someone is ready; return that unit */
function nextActor(battle, rand) {
  let guard = 0;
  while (guard++ < 200) {
    const alive = living(battle.units).filter((u) => u.alive && u.hp > 0);
    if (!alive.length) return null;
    const ready = alive.filter((u) => u.gauge >= GAUGE_MAX && u.alive && u.hp > 0);
    if (ready.length) {
      ready.sort(
        (a, b) =>
          b.gauge - a.gauge ||
          effective(b).spd - effective(a).spd ||
          (rand() - 0.5)
      );
      const actor = ready[0];
      actor.gauge -= GAUGE_MAX;
      return actor;
    }
    for (const u of alive) {
      u.gauge += effective(u).spd;
    }
  }
  return living(battle.units)[0] || null;
}

function enemyAct(battle, actor, rand) {
  // Dead units never swing (including same-turn KOs before AI loop)
  if (!actor || !actor.alive || actor.hp <= 0) return;
  if (actor.stunned) {
    actor.stunned = false;
    battle.log.push({
      t: 'stun_skip',
      atkId: actor.id,
      text: `${actor.name} is stunned and skips!`,
    });
    return;
  }
  const hero = battle.units.find((u) => u.isHero && u.alive && u.hp > 0);
  if (!hero) return;
  const hit = dealDamage(actor, hero, rand);
  if (hit.blocked) {
    battle.log.push({
      t: 'block',
      atkId: actor.id,
      defId: hero.id,
      dmg: 0,
      setProc: hit.setProc,
      text:
        hit.setProc === 'counter_stun'
          ? `Stonewall! You block ${actor.name} and stun them.`
          : `Stonewall! You block ${actor.name}'s hit.`,
      heroHp: hero.hp,
    });
    return;
  }
  battle.log.push({
    t: 'hit',
    atkId: actor.id,
    defId: hero.id,
    dmg: hit.dmg,
    text: `${actor.name} hits you for ${hit.dmg}`,
    heroHp: hero.hp,
  });
}

/**
 * Player acts, then AI runs until player's next turn or battle ends.
 * action: { type: 'attack', targetId } | { type: 'buff', buff: 'atk'|'def'|'spd' }
 */
export function tacticalAct(battle, action) {
  if (!battle || battle.status !== 'active') {
    return { battle, error: 'Battle over' };
  }
  const rand = mulberry32(hashSeed(battle.seed + ':t' + battle.turn));
  const hero = battle.units.find((u) => u.isHero);
  if (!hero || !hero.alive) {
    battle.status = 'lost';
    return { battle, public: publicBattle(battle) };
  }

  // Ensure it's conceptually player turn — if not, catch up AI
  if (battle.awaiting === 'player') {
    battle.turn += 1;

    if (hero.stunned) {
      hero.stunned = false;
      battle.log.push({
        t: 'stun_skip',
        atkId: hero.id,
        text: 'You are stunned and lose a beat!',
      });
    } else if (action?.type === 'buff') {
      const b = action.buff;
      if (!['atk', 'def', 'spd'].includes(b)) {
        return { battle, error: 'Invalid buff', public: publicBattle(battle) };
      }
      // Cap stacks at 3
      if ((hero.buffs[b] || 0) < 3) {
        hero.buffs[b] = (hero.buffs[b] || 0) + 1;
      }
      const labels = { atk: 'ATK', def: 'DEF', spd: 'SPD' };
      battle.log.push({
        t: 'buff',
        buff: b,
        text: `You brace — ${labels[b]} up!`,
      });
    } else {
      // Attack — may cleave with gear set (Storm Cleaver / Apex)
      const foes = living(battle.units.filter((u) => !u.isHero));
      if (!foes.length) {
        checkEnd(battle);
        return { battle, public: publicBattle(battle) };
      }
      const tid = action?.targetId;
      let primary = foes.find((u) => u.id === tid);
      if (!primary) {
        foes.sort((a, b) => a.hp - b.hp);
        primary = foes[0];
      }

      const set = hero.gearSet;
      let targets = [primary];
      if (set?.cleaveAll) {
        targets = [...foes];
      } else if (set?.cleaveCount > 1) {
        const rest = foes
          .filter((f) => f.id !== primary.id)
          .sort(() => rand() - 0.5);
        targets = [primary, ...rest].slice(0, set.cleaveCount);
      }
      const nT = Math.max(1, targets.length);
      const cleaveScale = cleaveDamageScale(set, nT);
      // Ork / Concord multi-strike: repeat the swing (same targets each pass)
      const strikes = Math.max(1, Math.min(6, Number(set?.strikeCount) || 1));

      for (let swing = 0; swing < strikes; swing++) {
        // Refresh living targets for later swings (cleave list may have died)
        const liveTargets =
          nT > 1
            ? targets.filter((t) => t.alive)
            : primary.alive
              ? [primary]
              : [];
        if (!liveTargets.length) break;
        for (const target of liveTargets) {
          if (!target.alive) continue;
          const hit = dealDamage(hero, target, rand, { cleaveScale });
          if (hit.blocked) {
            battle.log.push({
              t: 'block',
              atkId: hero.id,
              defId: target.id,
              dmg: 0,
              text: `${target.name} shrugs it off`,
            });
            continue;
          }
          const stunTxt = hit.setProc === 'stun' ? ' — stunned!' : '';
          const cleaveTxt = nT > 1 ? ' (cleave)' : '';
          const multiTxt =
            strikes > 1 ? ` (${swing + 1}/${strikes})` : '';
          battle.log.push({
            t: 'hit',
            atkId: hero.id,
            defId: target.id,
            dmg: hit.dmg,
            setProc: hit.setProc,
            cleave: nT > 1,
            strike: strikes > 1 ? swing + 1 : undefined,
            strikes: strikes > 1 ? strikes : undefined,
            text: `You hit ${target.name} for ${hit.dmg}${cleaveTxt}${multiTxt}${stunTxt}`,
            defHp: target.hp,
            defMaxHp: target.maxHp,
            ko: !target.alive,
          });
          if (!target.alive) {
            battle.log.push({
              t: 'ko',
              defId: target.id,
              text: `${target.name} falls!`,
            });
          }
        }
      }
    }

    if (checkEnd(battle)) {
      return { battle, public: publicBattle(battle) };
    }
  }

  // AI turns until player is ready again
  battle.awaiting = 'resolving';
  let safety = 0;
  const events = [];
  while (safety++ < 40) {
    if (checkEnd(battle)) break;
    const actor = nextActor(battle, rand);
    if (!actor) break;
    if (actor.isHero) {
      // Player's turn again
      actor.gauge = Math.max(0, actor.gauge); // already spent on act... wait we need player to spend gauge too
      battle.awaiting = 'player';
      break;
    }
    enemyAct(battle, actor, rand);
    events.push({ actor: actor.id });
    if (checkEnd(battle)) break;
  }

  if (battle.status === 'active' && battle.awaiting !== 'player') {
    battle.awaiting = 'player';
  }

  return { battle, public: publicBattle(battle), aiSteps: events.length };
}

/**
 * Open a fresh fight for the player UI.
 * Always full HP + first move — enemies must not pre-swing before the screen appears
 * (that made it look like you "joined" already hurt).
 */
export function beginTactical(battle) {
  if (!battle) return battle;
  battle.status = 'active';
  battle.awaiting = 'player';
  battle.log = battle.log || [];

  const hero = battle.units?.find((u) => u.isHero);
  if (hero) {
    // Fresh stage entry is always full health
    hero.hp = hero.maxHp;
    hero.alive = true;
    hero.stunned = false;
    // Ready to act on the first turn (don't wait for gauge race vs the pack)
    hero.gauge = Math.max(hero.gauge || 0, GAUGE_MAX);
  }
  // Soft-start foes so the pack doesn't all chain immediately after your first hit
  for (const u of battle.units || []) {
    if (u && !u.isHero) {
      u.gauge = Math.min(Number(u.gauge) || 0, 40);
    }
  }

  // Drop any "you got hit" lines from a previous broken pre-act path
  battle.log = (battle.log || []).filter(
    (e) => e && e.t !== 'hit' && e.t !== 'lose'
  );
  battle.log.push({
    t: 'ready',
    text: 'Your move — pick a target!',
  });
  return battle;
}
