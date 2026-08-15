import { arenaGemsForPlace, arenaPrizeTable } from './arenaPayouts.js';
import { raceDamageMult, normalizeRace } from './heroes.js';
import { cleaveDamageScale } from './gear.js';

/** Pits use a soft type chart (~5%) so race still matters but less than the Road */
const PIT_TYPE_SCALE = 0.05;

/** Seeded PRNG (mulberry32) for deterministic replays */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pit free-for-all — SIMULTANEOUS melee.
 *
 * Every living fighter attacks someone every volley at the same time.
 * Damage applies from a start-of-volley snapshot → multi-KOs in one beat.
 *
 * Simultaneous death ranking (fair, deterministic):
 *   Worse place first (higher place # = out earlier):
 *   1) less total damage dealt  2) less dmg this volley
 *   3) lower HP at volley start  4) lower speed
 *   5) lower luck  6) seeded RNG
 *
 * ALL fighters are in the cast (field size = unique ticket holders).
 * Playback uses compact `volley` events so N=1000 stays watchable.
 */
export function resolveArena(fighters, seedStr, opts = {}) {
  const rand = mulberry32(hashSeed(seedStr));
  if (!fighters.length) {
    return {
      rankings: [],
      arenaWinnerUserId: null,
      battle: null,
      duel: { lines: [] },
      prizeTable: [],
      fieldSize: 0,
    };
  }

  const cast = [...fighters];
  const heroId = opts.heroUserId || cast.find((f) => !f.isBot)?.userId;
  const fieldSize = cast.length;

  // Larger pits: slightly lower HP + snappier damage so the brawl finishes
  const hpScale =
    fieldSize > 200 ? 0.75 : fieldSize > 50 ? 0.9 : fieldSize > 12 ? 1.1 : 1.35;
  const dmgScale =
    fieldSize > 200 ? 1.25 : fieldSize > 50 ? 1.1 : fieldSize > 12 ? 1.05 : 1;

  const units = cast.map((f, idx) => {
    const maxHp = Math.max(18, Math.round((f.vitality || 20) * hpScale + (f.level || 1) * 2));
    const gearSet = f.gearSet || null;
    return {
      userId: f.userId,
      displayName: f.displayName,
      gender: f.gender || null,
      visualTier: f.visualTier || 0,
      race: normalizeRace(f.race || f.raceId || 'human'),
      classId: f.classId || 'warrior',
      clanId: f.clanId || null,
      isBot: !!f.isBot,
      level: f.level || 1,
      power: f.power || 10,
      speed: f.speed || 10,
      luck: f.luck || 5,
      guard: f.guard || 5,
      maxHp,
      hp: maxHp,
      damageDealt: 0,
      hitsLanded: 0,
      dmgThisVolley: 0,
      alive: true,
      isHero: f.userId === heroId,
      place: null,
      gearSet,
      // Human / Concord / Elder: block first N hits taken this fight
      setBlockCharges: Math.max(
        0,
        Number(gearSet?.blockCharges) || (gearSet?.firstHitBlock ? 1 : 0)
      ),
      stunned: false,
      // stable salt for fair tiebreaks
      seedSalt: (hashSeed(String(f.userId) + seedStr) + idx) >>> 0,
    };
  });

  let nextPlace = fieldSize;
  const placeBoard = [];

  function assignPlace(unit, reason = 'ko') {
    if (!unit || unit.place != null) return null;
    unit.place = nextPlace;
    nextPlace -= 1;
    const gems = arenaGemsForPlace(unit.place, fieldSize);
    const entry = {
      t: 'place',
      userId: unit.userId,
      name: unit.displayName,
      place: unit.place,
      gems,
      isHero: !!unit.isHero,
      isBot: !!unit.isBot,
      reason,
      text:
        unit.place === 1
          ? `👑 #1 ${unit.isHero ? 'YOU' : unit.displayName} · 💎${gems}`
          : `#${unit.place} ${unit.isHero ? '★ YOU' : unit.displayName} · 💎${gems}`,
    };
    placeBoard.push(entry);
    return entry;
  }

  /**
   * Fair simultaneous-KO order: worse fighters get worse (higher) places first.
   * Returns units sorted worst → best among the batch.
   */
  function sortSimultaneousDeaths(deadBatch) {
    return [...deadBatch].sort((a, b) => {
      // worse first
      if (a.damageDealt !== b.damageDealt) return a.damageDealt - b.damageDealt;
      if (a.dmgThisVolley !== b.dmgThisVolley) return a.dmgThisVolley - b.dmgThisVolley;
      if (a.hpAtVolleyStart !== b.hpAtVolleyStart) return a.hpAtVolleyStart - b.hpAtVolleyStart;
      if (a.speed !== b.speed) return a.speed - b.speed;
      if (a.luck !== b.luck) return a.luck - b.luck;
      // seeded deterministic coin-flip (not pure Math.random)
      return (a.seedSalt >>> 0) - (b.seedSalt >>> 0);
    });
  }

  function placeBatch(deadBatch, reason) {
    const ordered = sortSimultaneousDeaths(deadBatch);
    const placed = [];
    for (const u of ordered) {
      const e = assignPlace(u, reason);
      if (e) placed.push(e);
    }
    return placed;
  }

  const events = [];
  events.push({
    t: 'init',
    text: `${fieldSize} enter the pit — EVERYONE swings at once. Places pay gems.`,
    mode: 'simultaneous',
    fighters: units.map(publicFighter),
    heroUserId: heroId || null,
    fieldSize,
    totalFighters: fieldSize,
    prizeTable: compactPrizeTable(fieldSize),
  });

  events.push({
    t: 'order',
    text:
      fieldSize <= 8
        ? `All attack together: ${units.map((u) => (u.isHero ? '★YOU' : u.displayName)).join(', ')}`
        : `${fieldSize} fighters · simultaneous volleys · multi-KOs OK`,
    mode: 'simultaneous',
  });

  const maxRounds =
    fieldSize > 500 ? 14 : fieldSize > 100 ? 12 : fieldSize > 30 ? 10 : 8;
  let round = 0;

  while (units.filter((u) => u.alive).length > 1 && round < maxRounds) {
    round++;
    const living = units.filter((u) => u.alive);
    const aliveBefore = living.length;

    // Snapshot start-of-volley state
    for (const u of units) {
      u.hpAtVolleyStart = u.hp;
      u.dmgThisVolley = 0;
    }

    // Player focus target (campaign: tap an enemy — hero prefers them while alive)
    const focusId = opts.preferredTargetUserId || opts.focusTargetId || null;

    // Clear stun at start of volley (skipped this round, then free)
    for (const u of living) {
      if (u.stunned) {
        u.stunned = false;
        u._skipThisVolley = true;
      } else {
        u._skipThisVolley = false;
      }
    }

    // Each living fighter chooses a target and rolls a hit (damage deferred)
    const pending = []; // { atk, def, dmg, crit, blocked, setProc }
    for (const atk of living) {
      if (atk._skipThisVolley) continue; // stunned last hit

      // Clan allies: do not target same clanId (semi-team pits)
      const foes = living.filter((u) => {
        if (u.userId === atk.userId) return false;
        if (atk.clanId && u.clanId && atk.clanId === u.clanId) return false;
        return true;
      });
      // If everyone left is clan (or alone), allow FFA fallback so fight can end
      const pool =
        foes.length > 0
          ? foes
          : living.filter((u) => u.userId !== atk.userId);
      if (!pool.length) break;

      const set = atk.gearSet;
      const cleaveN = set?.cleaveAll
        ? pool.length
        : Math.min(pool.length, set?.cleaveCount || 1);
      const multi = cleaveN > 1;

      // Build target list
      let targets = [];
      if (multi) {
        // Prefer focus + random fill; cleave-all uses entire pool
        if (set.cleaveAll) {
          targets = [...pool];
        } else {
          const shuffled = [...pool].sort(() => rand() - 0.5);
          if (atk.isHero && focusId) {
            const focus = shuffled.find((f) => f.userId === focusId);
            if (focus) {
              targets = [
                focus,
                ...shuffled.filter((f) => f.userId !== focusId),
              ].slice(0, cleaveN);
            } else {
              targets = shuffled.slice(0, cleaveN);
            }
          } else {
            targets = shuffled.slice(0, cleaveN);
          }
        }
      } else {
        let def;
        if (atk.isHero && focusId) {
          const focus = pool.find((f) => f.userId === focusId);
          if (focus) def = focus;
        }
        if (!def) {
          if (rand() < 0.15) {
            let weakest = pool[0];
            for (let i = 1; i < pool.length; i++) {
              if (pool[i].hp < weakest.hp) weakest = pool[i];
            }
            def = weakest;
          } else {
            def = pool[Math.floor(rand() * pool.length)];
          }
        }
        targets = [def];
      }

      const nT = Math.max(1, targets.length);
      const cleaveScale = multi ? cleaveDamageScale(set, nT) : 1;
      const strikes = Math.max(1, Math.min(6, Number(set?.strikeCount) || 1));

      for (let swing = 0; swing < strikes; swing++) {
        for (const def of targets) {
          // Set first-N-hit block (Hearthsteel / Pactfire / Gravewake)
          if (def.setBlockCharges > 0) {
            def.setBlockCharges -= 1;
            let counterStun = false;
            if (
              def.gearSet?.counterStunChance &&
              rand() < def.gearSet.counterStunChance
            ) {
              atk.stunned = true;
              counterStun = true;
            }
            pending.push({
              atk,
              def,
              dmg: 0,
              crit: false,
              blocked: true,
              setBlock: true,
              setProc: counterStun ? 'counter_stun' : 'set_block',
            });
            continue;
          }

          const blockChance = Math.min(26, def.guard * 1.5);
          if (rand() * 100 < blockChance) {
            pending.push({
              atk,
              def,
              dmg: 0,
              crit: false,
              blocked: true,
            });
            continue;
          }

          let dmg =
            atk.power * 1.0 + atk.level * 1.1 + rand() * (atk.power * 0.5);
          dmg *= 1 - Math.min(0.26, def.guard * 0.018);
          dmg *= dmgScale;
          dmg *= raceDamageMult(atk.race, def.race, PIT_TYPE_SCALE).mult;
          if (set?.damageMult && set.damageMult !== 1) {
            dmg *= set.damageMult;
          }
          dmg *= cleaveScale;
          let crit = false;
          if (rand() * 100 < Math.min(28, atk.luck * 2)) {
            crit = true;
            dmg *= 1.55;
          }
          dmg = Math.max(multi || strikes > 1 ? 2 : 3, Math.round(dmg));

          let setProc = null;
          if (set?.stunOnHitChance && rand() < set.stunOnHitChance) {
            def.stunned = true;
            setProc = 'stun';
          }

          pending.push({
            atk,
            def,
            dmg,
            crit,
            blocked: false,
            setProc,
            cleave: multi,
            strike: strikes > 1 ? swing + 1 : undefined,
          });
        }
      }
    }

    // Apply ALL damage at once (mutual kills possible)
    const dmgTaken = new Map(); // userId -> total dmg this volley
    for (const h of pending) {
      if (h.blocked || h.dmg <= 0) continue;
      dmgTaken.set(h.def.userId, (dmgTaken.get(h.def.userId) || 0) + h.dmg);
      h.atk.damageDealt += h.dmg;
      h.atk.hitsLanded += 1;
      h.atk.dmgThisVolley += h.dmg;
    }
    for (const [uid, dmg] of dmgTaken) {
      const u = units.find((x) => x.userId === uid);
      if (!u || !u.alive) continue;
      u.hp = Math.max(0, u.hp - dmg);
    }

    // Who died this volley
    const deadThisVolley = units.filter(
      (u) => u.alive && u.hp <= 0 && u.place == null
    );
    for (const u of deadThisVolley) {
      u.alive = false;
      u.hp = 0;
    }

    // Fair place order for simultaneous deaths
    const places = placeBatch(deadThisVolley, 'volley');

    const aliveAfter = units.filter((u) => u.alive).length;
    const hero = units.find((u) => u.isHero);
    const heroPending = pending.filter(
      (h) => h.atk.isHero || h.def.isHero
    );
    const heroHit = heroPending.find((h) => !h.blocked && h.atk.isHero) || null;
    const heroDef = heroPending.find((h) => !h.blocked && h.def.isHero) || null;
    const heroBlock = heroPending.find((h) => h.blocked && h.def.isHero) || null;

    // Compact hit samples for small pits; large pits only hero + a few samples
    const sampleHits = buildHitSamples(pending, fieldSize, rand);

    events.push({
      t: 'volley',
      round,
      mode: 'simultaneous',
      aliveBefore,
      aliveAfter,
      koCount: deadThisVolley.length,
      text:
        deadThisVolley.length === 0
          ? `Volley ${round} — all ${aliveBefore} clash, nobody drops`
          : deadThisVolley.length === 1
            ? `Volley ${round} — ${deadThisVolley[0].isHero ? '★ YOU' : deadThisVolley[0].displayName} falls! (${aliveAfter} left)`
            : `Volley ${round} — ${deadThisVolley.length} fall together! (${aliveAfter} left)`,
      // Client paints everyone swinging
      hits: sampleHits,
      // Full KO list for this volley (with place already assigned)
      kos: places.map((p) => ({
        userId: p.userId,
        name: p.name,
        place: p.place,
        gems: p.gems,
        isHero: p.isHero,
        isBot: p.isBot,
        hpAtStart: units.find((u) => u.userId === p.userId)?.hpAtVolleyStart ?? 0,
      })),
      places,
      hero: hero
        ? {
            hp: hero.hp,
            maxHp: hero.maxHp,
            alive: hero.alive,
            place: hero.place,
            hit: heroHit
              ? {
                  defId: heroHit.def.userId,
                  defName: heroHit.def.displayName,
                  dmg: heroHit.dmg,
                  crit: heroHit.crit,
                }
              : null,
            took: heroDef
              ? {
                  atkId: heroDef.atk.userId,
                  atkName: heroDef.atk.displayName,
                  dmg: heroDef.dmg,
                  crit: heroDef.crit,
                }
              : null,
            blocked: !!heroBlock,
          }
        : null,
      // HP snapshot for units still relevant (hero + sample for UI)
      hpSnap: buildHpSnap(units, fieldSize),
    });

    // Place details live on the volley. Only stream separate place events for
    // the hero (or tiny pits) so large replays stay small/fast.
    for (const p of places) {
      if (p.isHero || fieldSize <= 20) events.push(p);
    }

    // If only one left, stop
    if (aliveAfter <= 1) break;
  }

  // Sudden death: remaining sorted by HP / damage — simultaneous batch then fair order
  const stillUp = units.filter((u) => u.alive);
  if (stillUp.length > 1) {
    stillUp.sort(
      (a, b) => b.hp - a.hp || b.damageDealt - a.damageDealt || b.speed - a.speed
    );
    const champ = stillUp[0];
    const toDrop = stillUp.slice(1);
    for (const u of toDrop) {
      u.alive = false;
      u.hp = 0;
      u.hpAtVolleyStart = u.hpAtVolleyStart ?? 0;
      u.dmgThisVolley = u.dmgThisVolley || 0;
    }
    const places = placeBatch(toDrop, 'sudden');
    events.push({
      t: 'volley',
      round: round + 1,
      mode: 'simultaneous',
      sudden: true,
      aliveBefore: stillUp.length,
      aliveAfter: 1,
      koCount: toDrop.length,
      text: `Final stand — ${toDrop.length} drop · ${champ.isHero ? '★ YOU' : champ.displayName} remains`,
      hits: [],
      kos: places.map((p) => ({
        userId: p.userId,
        name: p.name,
        place: p.place,
        gems: p.gems,
        isHero: p.isHero,
        isBot: p.isBot,
      })),
      places,
      hero: units.find((u) => u.isHero)
        ? {
            hp: units.find((u) => u.isHero).hp,
            maxHp: units.find((u) => u.isHero).maxHp,
            alive: units.find((u) => u.isHero).alive,
            place: units.find((u) => u.isHero).place,
          }
        : null,
      hpSnap: buildHpSnap(units, fieldSize),
    });
    for (const p of places) {
      if (p.isHero || fieldSize <= 20) events.push(p);
    }
  }

  const winner =
    units.find((u) => u.alive) ||
    [...units].sort((a, b) => b.damageDealt - a.damageDealt)[0];

  // Crown last standing as #1 — they never "died", so they wouldn't hit the KO place path
  const winPlace = assignPlace(winner, 'win');
  if (winPlace) {
    // Always stream the #1 place event (client needs it on the board)
    events.push(winPlace);
  }

  for (const u of [...units].sort((a, b) => a.damageDealt - b.damageDealt)) {
    if (u.place == null) {
      const p = assignPlace(u, 'fill');
      if (p && (p.isHero || fieldSize <= 20 || p.place === 1)) events.push(p);
    }
  }

  const rankings = [...units]
    .sort((a, b) => (a.place || 9999) - (b.place || 9999))
    .map((u) => ({
      userId: u.userId,
      displayName: u.displayName,
      score: u.damageDealt + (u.alive ? u.hp : 0),
      damageDealt: u.damageDealt,
      hitsLanded: u.hitsLanded,
      hpLeft: u.hp,
      maxHp: u.maxHp,
      alive: u.alive,
      rank: u.place,
      place: u.place,
      gems: arenaGemsForPlace(u.place, fieldSize),
      level: u.level,
      power: u.power,
      isHero: u.isHero,
      isBot: u.isBot,
    }));

  const heroUnit = units.find((u) => u.isHero);
  const heroStats = heroUnit
    ? {
        userId: heroUnit.userId,
        damageDealt: heroUnit.damageDealt,
        hitsLanded: heroUnit.hitsLanded,
        survived: heroUnit.alive,
        won: winner.userId === heroUnit.userId,
        place: heroUnit.place,
        gems: arenaGemsForPlace(heroUnit.place, fieldSize),
        hpLeft: heroUnit.hp,
        maxHp: heroUnit.maxHp,
        fieldSize,
      }
    : null;

  events.push({
    t: 'win',
    userId: winner.userId,
    name: winner.displayName,
    place: 1,
    gems: arenaGemsForPlace(1, fieldSize),
    text: winner.isHero
      ? `👑 YOU win the pit! #1 of ${fieldSize} · 💎${arenaGemsForPlace(1, fieldSize)}`
      : `👑 ${winner.displayName} wins the pit (#1 of ${fieldSize})!`,
    heroStats,
    rankings,
    fieldSize,
    mode: 'simultaneous',
  });

  const lines = events
    .filter((e) => e.text)
    .map((e) => ({ t: e.t, text: e.text, round: e.round }));

  // Full cast for the client mass brawl (lightweight)
  const allFighters = units.map(publicFighter);

  return {
    rankings,
    arenaWinnerUserId: winner.userId,
    placeBoard,
    prizeTable: compactPrizeTable(fieldSize),
    fieldSize,
    battle: {
      mode: 'simultaneous',
      fighters: allFighters,
      fieldSize,
      totalFighters: fieldSize,
      visualCount: allFighters.length,
      events,
      heroUserId: heroId || null,
      heroStats,
      prizeTable: compactPrizeTable(fieldSize),
    },
    duel: { lines, duelWinnerUserId: winner.userId },
  };
}

function buildHitSamples(pending, fieldSize, rand) {
  const landed = pending.filter((h) => !h.blocked && h.dmg > 0);
  // Bigger sample so the client can paint true random who-hits-whom FX
  const maxSamples =
    fieldSize <= 12
      ? landed.length
      : fieldSize <= 40
        ? 24
        : fieldSize <= 120
          ? 48
          : fieldSize <= 400
            ? 72
            : 96;

  // Always include hero involvement
  const heroOnes = landed.filter((h) => h.atk.isHero || h.def.isHero);
  const rest = landed.filter((h) => !h.atk.isHero && !h.def.isHero);
  // shuffle rest
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const picked = [...heroOnes, ...rest].slice(0, maxSamples);
  return picked.map((h) => ({
    atkId: h.atk.userId,
    defId: h.def.userId,
    atkName: h.atk.displayName,
    defName: h.def.displayName,
    dmg: h.dmg,
    crit: h.crit,
    classId: h.atk.classId || 'warrior',
    featured: !!(h.atk.isHero || h.def.isHero),
    isHeroAtk: !!h.atk.isHero,
    isHeroDef: !!h.def.isHero,
  }));
}

function buildHpSnap(units, fieldSize) {
  // Full snap for small pits; hero + alive count summary for large
  if (fieldSize <= 40) {
    const o = {};
    for (const u of units) o[u.userId] = { hp: u.hp, maxHp: u.maxHp, alive: u.alive };
    return o;
  }
  const o = {};
  for (const u of units) {
    if (u.isHero || (!u.alive && u.place != null && u.place <= 5)) {
      o[u.userId] = { hp: u.hp, maxHp: u.maxHp, alive: u.alive };
    }
  }
  o._alive = units.filter((u) => u.alive).length;
  return o;
}

function compactPrizeTable(fieldSize) {
  const n = Math.max(1, fieldSize);
  if (n <= 40) return arenaPrizeTable(n);
  const places = new Set([1, 2, 3, 4, 5, 10, Math.ceil(n / 2), n]);
  const topBand = Math.max(4, Math.ceil(n * 0.2));
  for (let p = 1; p <= Math.min(topBand, 25); p++) places.add(p);
  return [...places]
    .filter((p) => p >= 1 && p <= n)
    .sort((a, b) => a - b)
    .map((place) => ({ place, gems: arenaGemsForPlace(place, n) }));
}

function publicFighter(u) {
  return {
    userId: u.userId,
    displayName: u.displayName,
    gender: u.gender || 'boy',
    visualTier: u.visualTier || 0,
    // Race + class drive hero art in the pit (YOU must match equip)
    race: normalizeRace(u.race || u.raceId || 'human'),
    classId: u.classId || 'warrior',
    isBot: u.isBot,
    level: u.level,
    power: u.power,
    speed: u.speed,
    luck: u.luck,
    guard: u.guard,
    maxHp: u.maxHp,
    hp: u.maxHp,
    isHero: !!u.isHero,
  };
}

/** Equal-weight pick among tickets (legacy). */
export function pickPotWinner(tickets, seedStr) {
  return pickWeightedPotWinner(tickets, seedStr);
}

/**
 * Fair lottery: each ticket's weight (default 1) is a share of the pot.
 * House tickets count — if you hold 1 of N seats, you have ~1/N chance.
 */
export function pickWeightedPotWinner(tickets, seedStr) {
  const rand = mulberry32(hashSeed(seedStr + ':pot'));
  if (!tickets.length) return null;
  const weights = tickets.map((t) => Math.max(0.0001, Number(t.weight) || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < tickets.length; i++) {
    r -= weights[i];
    if (r <= 0) return tickets[i];
  }
  return tickets[tickets.length - 1];
}
