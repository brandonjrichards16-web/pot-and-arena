import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
  Pressable,
} from 'react-native';
import { colors } from '../lib/theme';
import { portraitFor, heroPortrait } from '../lib/characters';
import MassPitScene from './MassPitScene';

/**
 * Pit fight playback.
 * Small fields: portrait ring.
 * Large fields: full-width mass spectacle (packed oval + HUD).
 * Simultaneous volleys with multi-KOs.
 */
export default function BrawlArena({
  fighters = [],
  battle = null,
  winnerUserId,
  winnerName,
  rankings: rankingsProp = null,
  onDone,
  /** Fired when fight result card is up — parent can hide Skip */
  onResultsReady,
}) {
  const winW = Dimensions.get('window').width;
  const heroId = battle?.heroUserId || fighters.find((f) => !f.isBot)?.userId;

  const fieldSize =
    battle?.fieldSize ||
    battle?.totalFighters ||
    rankingsProp?.length ||
    battle?.fighters?.length ||
    fighters.length ||
    4;

  const massMode = fieldSize > 24;

  // Full-width for mass; leave room for side board only on small pits
  const arenaW = massMode
    ? Math.min(winW - 24, 520)
    : Math.min(winW - 160, 340);
  const arenaH = massMode
    ? Math.min(360, Math.round(arenaW * 0.72))
    : 260;

  const roster = useMemo(() => {
    const fromBattle = battle?.fighters?.length ? battle.fighters : fighters;
    const list = fromBattle.length ? fromBattle : [];
    if (massMode) {
      // MassPitScene does its own packing — just normalize
      return list.map((f, i) => ({
        ...f,
        isHero: f.userId === heroId || f.isHero,
        gender: f.gender || (i % 2 === 0 ? 'boy' : 'girl'),
        race: f.race || 'human',
        classId: f.classId || 'warrior',
        maxHp: f.maxHp || 40,
      }));
    }
    const n = list.length;
    return list.map((f, i) => {
      const isHero = f.userId === heroId || f.isHero;
      const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      const rx = arenaW * 0.34;
      const ry = arenaH * 0.3;
      return {
        ...f,
        isHero,
        gender: f.gender || (i % 2 === 0 ? 'boy' : 'girl'),
        race: f.race || 'human',
        classId: f.classId || 'warrior',
        maxHp: f.maxHp || 40,
        power: f.power || 10,
        x0: isHero ? arenaW / 2 - 28 : arenaW / 2 - 26 + Math.cos(angle) * rx,
        y0: isHero ? arenaH / 2 - 16 : arenaH / 2 - 40 + Math.sin(angle) * ry,
      };
    });
  }, [fighters, battle, arenaW, arenaH, heroId, massMode]);

  const [hpMap, setHpMap] = useState(() =>
    Object.fromEntries(roster.map((f) => [f.userId, f.maxHp]))
  );
  const [dead, setDead] = useState(() => new Set());
  const [banner, setBanner] = useState('FIGHT!');
  const [callout, setCallout] = useState('');
  const [floaters, setFloaters] = useState([]);
  const [showCard, setShowCard] = useState(false);
  const [heroStats, setHeroStats] = useState(battle?.heroStats || null);
  const [board, setBoard] = useState([]);
  const [elimCount, setElimCount] = useState(0);
  const [aliveCount, setAliveCount] = useState(fieldSize);
  const [volleyKey, setVolleyKey] = useState(0);
  const [koBurst, setKoBurst] = useState(0);
  /** Latest real hit sample for mass-pit FX */
  const [volleyHits, setVolleyHits] = useState(null);
  /** Small-pit flying attacks this volley: {id, kind, x, y, rot, opacity} */
  const [volleyFx, setVolleyFx] = useState([]);
  const fxSeq = useRef(0);

  const pulse = useRef(new Animated.Value(1)).current;
  const flashOp = useRef(new Animated.Value(0)).current;
  const timers = useRef([]);
  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };

  /** Splash-style simultaneous attacks — prefer REAL hit pairs from combat */
  function spawnSmallPitVolleyFx(livingRoster, hits) {
    const byId = Object.fromEntries(
      livingRoster.map((f) => [f.userId, f])
    );
    const living = livingRoster.filter((f) => !dead.has(f.userId));
    const shots = [];

    if (hits?.length) {
      for (const h of hits) {
        if (shots.length >= 16) break;
        const atk = byId[h.atkId];
        const def = byId[h.defId];
        if (!atk || !def) continue;
        const cls = String(h.classId || atk.classId || 'warrior').toLowerCase();
        const kind =
          cls === 'ranger' || cls === 'archer'
            ? 'ranged'
            : cls === 'mage' || cls === 'mystic'
              ? 'magic'
              : 'melee';
        const x0 = (atk.x0 || 0) + 24;
        const y0 = (atk.y0 || 0) + 20;
        const x1 = (def.x0 || 0) + 24;
        const y1 = (def.y0 || 0) + 20;
        shots.push({
          id: ++fxSeq.current,
          kind,
          x0,
          y0,
          x1,
          y1,
          ang: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI,
        });
      }
    }

    // Fallback: random pairings (never circular i→i+1)
    if (!shots.length && living.length >= 2) {
      const max = Math.min(living.length, 14);
      for (let i = 0; i < max; i++) {
        const atk = living[i];
        let t = Math.floor(Math.random() * living.length);
        if (living[t].userId === atk.userId) t = (t + 1) % living.length;
        const def = living[t];
        if (!def || def.userId === atk.userId) continue;
        const cls = String(atk.classId || 'warrior').toLowerCase();
        const kind =
          cls === 'ranger' || cls === 'archer'
            ? 'ranged'
            : cls === 'mage' || cls === 'mystic'
              ? 'magic'
              : 'melee';
        const x0 = (atk.x0 || 0) + 24;
        const y0 = (atk.y0 || 0) + 20;
        const x1 = (def.x0 || 0) + 24;
        const y1 = (def.y0 || 0) + 20;
        shots.push({
          id: ++fxSeq.current,
          kind,
          x0,
          y0,
          x1,
          y1,
          ang: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI,
        });
      }
    }

    let step = 0;
    const steps = 10;
    const run = () => {
      step += 1;
      const t = step / steps;
      const e = 1 - Math.pow(1 - t, 2);
      setVolleyFx(
        shots.map((s) => ({
          id: s.id,
          kind: s.kind,
          x: s.x0 + (s.x1 - s.x0) * e,
          y: s.y0 + (s.y1 - s.y0) * e,
          rot: s.ang,
          opacity: t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1,
        }))
      );
      if (step < steps) later(run, 32);
      else later(() => setVolleyFx([]), 40);
    };
    run();
  }

  useEffect(() => {
    const raw = battle?.events || [];
    const hasVolley = raw.some((e) => e.t === 'volley');
    // Volley.kos carries most places; also keep hero places + #1 crown (last alive)
    const events = hasVolley
      ? raw.filter(
          (e) =>
            e.t === 'volley' ||
            e.t === 'win' ||
            (e.t === 'place' && (e.isHero || e.place === 1))
        )
      : raw.filter((e) =>
          ['hit', 'crit', 'ko', 'block', 'win', 'round', 'place'].includes(e.t)
        );

    if (!events.length) {
      setBanner('No fight data');
      setShowCard(true);
      onResultsReady?.();
      return;
    }

    let i = 0;
    const play = () => {
      if (i >= events.length) {
        setShowCard(true);
        onResultsReady?.();
        return;
      }
      const ev = events[i++];

      if (ev.t === 'volley') {
        const before = ev.aliveBefore ?? aliveCount;
        const after = ev.aliveAfter ?? before - (ev.koCount || 0);
        const kos = ev.kos || [];
        setBanner(
          ev.sudden
            ? `FINAL STAND · ${before}`
            : `VOLLEY ${ev.round} · ${before} swinging`
        );
        setCallout(ev.text || `${ev.koCount || 0} fall`);
        setAliveCount(after);
        setVolleyKey((k) => k + 1);
        // Real combat pairs — random who hits whom (not a circle)
        const hits = Array.isArray(ev.hits) ? ev.hits : [];
        setVolleyHits(hits);

        // Portrait pits: fly arrows / fire / slashes along real hit lines
        if (!massMode) {
          spawnSmallPitVolleyFx(roster, hits);
        }

        if (kos.length > 0) {
          setKoBurst(kos.length);
          // Keep −N FELL on screen long enough to read on big pits
          later(() => setKoBurst(0), fieldSize > 100 ? 1400 : 1100);
        }

        Animated.sequence([
          Animated.timing(flashOp, {
            toValue: 0.32,
            duration: 90,
            useNativeDriver: true,
          }),
          Animated.timing(flashOp, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
        ]).start();
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.03, duration: 100, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();

        if (ev.hero?.hit) {
          const fid = `h-${Date.now()}`;
          setFloaters((f) => [
            ...f,
            {
              id: fid,
              text: `★ −${ev.hero.hit.dmg}${ev.hero.hit.crit ? '!' : ''}`,
              crit: true,
              x: arenaW / 2 - 20,
              y: arenaH * 0.42,
            },
          ]);
          later(() => setFloaters((f) => f.filter((x) => x.id !== fid)), 1000);
        }
        if (ev.hero && typeof ev.hero.hp === 'number') {
          setHpMap((m) => ({ ...m, [heroId]: ev.hero.hp }));
        }
        if (ev.hpSnap && typeof ev.hpSnap === 'object') {
          setHpMap((m) => {
            const next = { ...m };
            for (const [uid, v] of Object.entries(ev.hpSnap)) {
              if (uid.startsWith('_')) continue;
              if (v && typeof v.hp === 'number') next[uid] = v.hp;
            }
            return next;
          });
        }

        if (kos.length) {
          setDead((d) => {
            const n = new Set(d);
            for (const k of kos) n.add(k.userId);
            return n;
          });
          setBoard((b) => {
            const seen = new Set(b.map((x) => x.userId));
            const add = [];
            for (const k of kos) {
              if (seen.has(k.userId)) continue;
              seen.add(k.userId);
              add.push({
                t: 'place',
                userId: k.userId,
                name: k.name,
                place: k.place,
                gems: k.gems,
                isHero: k.isHero,
                isBot: k.isBot,
              });
            }
            return add.length ? [...b, ...add] : b;
          });
          setElimCount((c) => c + kos.length);
          const heroKo = kos.find((k) => k.isHero);
          if (heroKo) {
            setCallout(`★ YOU fall — #${heroKo.place} of ${fieldSize}`);
          }
        }

        const heroIn =
          !!ev.hero?.hit ||
          !!ev.hero?.took ||
          !!ev.hero?.blocked ||
          kos.some((k) => k.isHero);

        // Pace for readability — big pits used to be *faster* (wrong).
        // ~12–18s for a full 1000-pit at ~14 volleys; Skip is always available.
        let delay = 700; // small pits
        if (fieldSize > 24) delay = 850;
        if (fieldSize > 80) delay = 1000;
        if (fieldSize > 200) delay = 1100;
        if (fieldSize > 500) delay = 1200;
        // Multi-KO: hold so the −N burst + alive bar register
        if (kos.length >= 5) delay += 200;
        if (kos.length >= 30) delay += 250;
        if (kos.length >= 100) delay += 300;
        if (heroIn) delay += 400;
        if (ev.sudden) delay += 350;
        // Cap so a long fight never feels endless (~2s max per beat)
        delay = Math.min(delay, 2000);

        later(play, delay);
        return;
      }

      if (ev.t === 'place') {
        setBoard((b) => {
          if (b.some((x) => x.userId === ev.userId || x.place === ev.place)) {
            // Upgrade empty/#1 if this is a better fill
            return b.map((x) =>
              x.place === ev.place && x.empty ? { ...ev, empty: false } : x
            );
          }
          return [...b, ev];
        });
        if (ev.place === 1) {
          setCallout(
            ev.isHero
              ? `👑 YOU take #1 of ${fieldSize}`
              : `👑 #1 ${ev.name || 'Champion'} · last standing`
          );
          setElimCount(fieldSize);
          later(play, 900);
        } else if (ev.isHero) {
          setCallout(ev.text || `★ YOU — #${ev.place}`);
          later(play, 650);
        } else {
          later(play, hasVolley ? 0 : 200);
        }
        return;
      }

      if (ev.t === 'win') {
        if (ev.heroStats) setHeroStats(ev.heroStats);
        setBanner(ev.text || 'DONE');
        setAliveCount(1);

        // Last living fighter never "dies", so pin them into #1 on the places board
        const champId = ev.userId || winnerUserId;
        const champName = ev.name || winnerName || 'Champion';
        const champIsHero = champId === heroId || !!ev.heroStats?.won;
        const champGems =
          ev.gems != null
            ? ev.gems
            : rankingsProp?.find((r) => r.place === 1 || r.userId === champId)?.gems;

        setBoard((b) => {
          if (b.some((x) => x.place === 1 && x.userId)) return b;
          const withoutEmpty1 = b.filter((x) => x.place !== 1);
          return [
            ...withoutEmpty1,
            {
              t: 'place',
              userId: champId,
              name: champName,
              place: 1,
              gems: champGems ?? 0,
              isHero: champIsHero,
              isBot: !champIsHero && String(champId || '').startsWith('house_'),
              reason: 'win',
            },
          ];
        });
        setElimCount(fieldSize);
        setCallout(
          champIsHero
            ? `👑 YOU win the pit — #1 of ${fieldSize}`
            : `👑 #1 ${champName} — last standing`
        );

        // Hold the final result a beat before the end card
        later(() => {
          setShowCard(true);
          onResultsReady?.();
        }, massMode ? 1000 : 700);
        return;
      }

      if (ev.t === 'round') {
        setBanner(`R${ev.round}`);
        later(play, 200);
        return;
      }
      if (ev.t === 'block' || ev.t === 'hit' || ev.t === 'crit' || ev.t === 'ko') {
        setBanner(ev.t === 'block' ? 'BLOCK' : ev.ko || ev.t === 'ko' ? 'KO' : 'HIT');
        setCallout(ev.text || '');
        if (typeof ev.defHp === 'number' && ev.defId) {
          setHpMap((m) => ({ ...m, [ev.defId]: ev.defHp }));
        }
        if (ev.ko || ev.t === 'ko') {
          setDead((d) => new Set([...d, ev.defId]));
        }
        later(play, ev.featured ? 400 : 220);
        return;
      }

      later(play, 100);
    };

    setBanner(massMode ? `ALL-OUT BRAWL · ${fieldSize}` : 'PIT BRAWL');
    setCallout(
      massMode
        ? `${fieldSize} packed in the pit — everyone attacks every volley`
        : 'Simultaneous volleys — multi-KOs land together'
    );
    // Beat to read the setup before volleys start
    later(play, massMode ? 900 : 650);
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hs = heroStats || battle?.heroStats;
  const heroHp = hpMap[heroId] ?? roster.find((f) => f.isHero)?.maxHp ?? 40;
  const heroMax = roster.find((f) => f.isHero)?.maxHp ?? 40;

  const boardByPlace = useMemo(() => {
    const map = new Map(board.map((b) => [b.place, b]));
    if (fieldSize <= 16) {
      const rows = [];
      for (let p = fieldSize; p >= 1; p--) {
        rows.push(map.get(p) || { place: p, empty: true });
      }
      return rows;
    }
    const filled = [...board].sort((a, b) => b.place - a.place);
    const recent = filled.slice(-6);
    const tops = filled.filter((b) => b.place <= 5);
    const heroRow = filled.find((b) => b.isHero);
    const byPlace = new Map();
    for (const r of [...recent, ...tops, ...(heroRow ? [heroRow] : [])]) {
      byPlace.set(r.place, r);
    }
    for (let p = 1; p <= 3; p++) {
      if (!byPlace.has(p)) byPlace.set(p, map.get(p) || { place: p, empty: true });
    }
    // Prefer filled #1 at top of compact list
    return [...byPlace.values()].sort((a, b) => a.place - b.place);
  }, [board, fieldSize]);

  const placesPanel = (
    <View style={[styles.board, massMode && styles.boardWide]}>
      <Text style={styles.boardTitle}>PLACES</Text>
      <Text style={styles.boardSub}>
        {fieldSize > 16
          ? `${elimCount}/${fieldSize} placed · multi-KO ranked fair`
          : 'same-time deaths ranked fair'}
      </Text>
      <View style={massMode ? styles.boardGrid : null}>
        {boardByPlace.map((row) => (
          <View
            key={row.place}
            style={[
              styles.boardRow,
              massMode && styles.boardRowWide,
              !row.empty && styles.boardRowFilled,
              row.isHero && styles.boardRowYou,
              row.place === 1 && row.userId && styles.boardRowChamp,
            ]}
          >
            <Text style={styles.boardPlace}>#{row.place}</Text>
            <Text
              style={[styles.boardName, row.empty && styles.boardEmpty]}
              numberOfLines={1}
            >
              {row.empty
                ? '—'
                : row.isHero
                  ? '★ YOU'
                  : (row.name || '?').slice(0, 10)}
            </Text>
            <Text style={styles.boardGems}>
              {row.empty ? '' : `💎${row.gems ?? 0}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.banner}>{banner}</Text>
      <Text style={styles.fieldMeta}>
        {massMode
          ? `${aliveCount} standing of ${fieldSize} · full field`
          : `${fieldSize} in the pit · ${aliveCount} standing`}
        {elimCount > 0 ? ` · ${elimCount} out` : ''}
      </Text>
      <Text style={styles.callout} numberOfLines={2}>
        {callout}
      </Text>

      <Animated.View style={{ transform: [{ scale: pulse }], alignItems: 'center' }}>
        {massMode ? (
          <View style={{ position: 'relative' }}>
            <MassPitScene
              width={arenaW}
              height={arenaH}
              fighters={roster}
              heroId={heroId}
              deadIds={dead}
              aliveCount={aliveCount}
              fieldSize={fieldSize}
              volleyKey={volleyKey}
              volleyHits={volleyHits}
              koBurst={koBurst}
              heroHp={heroHp}
              heroMaxHp={heroMax}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.volleyWash, { opacity: flashOp, borderRadius: 18 }]}
            />
            {floaters.map((f) => (
              <Floater key={f.id} {...f} />
            ))}
          </View>
        ) : (
          <View style={styles.row}>
            <View style={[styles.arena, { width: arenaW, height: arenaH }]}>
              <View style={styles.sand} />
              <Animated.View
                pointerEvents="none"
                style={[styles.volleyWash, { opacity: flashOp }]}
              />
              {floaters.map((f) => (
                <Floater key={f.id} {...f} />
              ))}
              {/* Simultaneous class attacks this volley */}
              {volleyFx.map((p) => (
                <View
                  key={p.id}
                  pointerEvents="none"
                  style={[
                    styles.pitProj,
                    {
                      left: p.x,
                      top: p.y,
                      opacity: p.opacity,
                      transform: [
                        { translateX: -10 },
                        { translateY: -10 },
                        { rotate: `${p.rot || 0}deg` },
                      ],
                    },
                  ]}
                >
                  {p.kind === 'magic' ? (
                    <Text style={styles.pitProjMagic}>🔥</Text>
                  ) : p.kind === 'ranged' ? (
                    <View style={styles.pitArrow}>
                      <View style={styles.pitArrowShaft} />
                      <View style={styles.pitArrowHead} />
                    </View>
                  ) : (
                    <Text style={styles.pitProjMelee}>⚔️</Text>
                  )}
                </View>
              ))}
              {roster.map((f) => {
                const isDead = dead.has(f.userId);
                const hp = hpMap[f.userId] ?? f.maxHp;
                const pct = Math.max(0, hp / f.maxHp);
                const size = f.isHero ? 54 : 48;
                return (
                  <View
                    key={f.userId}
                    style={[
                      styles.unit,
                      {
                        left: f.x0,
                        top: f.y0,
                        width: size + 8,
                        zIndex: f.isHero ? 10 : 2,
                        opacity: isDead ? 0.3 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.ring,
                        f.isHero && styles.ringHero,
                        {
                          width: size,
                          height: size,
                          borderRadius: size / 2,
                        },
                      ]}
                    >
                      <Image
                        source={
                          f.race
                            ? heroPortrait({
                                race: f.race,
                                classId: f.classId || 'warrior',
                                gender: f.gender || 'boy',
                                view: 'front',
                                gearOrigin:
                                  f.gearOrigin ||
                                  f.gearSet?.originId ||
                                  null,
                              })
                            : portraitFor(f.gender, f.visualTier || 0, {
                                race: f.race,
                                classId: f.classId,
                                gearOrigin:
                                  f.gearOrigin || f.gearSet?.originId || null,
                              })
                        }
                        style={{
                          width: size,
                          height: size,
                          opacity: isDead ? 0.4 : 1,
                          backgroundColor: 'transparent',
                        }}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.hpTrack}>
                      <View
                        style={[
                          styles.hpFill,
                          {
                            width: `${pct * 100}%`,
                            backgroundColor:
                              pct < 0.3
                                ? colors.danger
                                : f.isHero
                                  ? colors.gold
                                  : colors.win,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[styles.tag, f.isHero && styles.tagHero]}
                      numberOfLines={1}
                    >
                      {f.isHero ? '★ YOU' : (f.displayName || '?').slice(0, 7)}
                    </Text>
                  </View>
                );
              })}
            </View>
            {placesPanel}
          </View>
        )}
      </Animated.View>

      {/* Large pits: places under the arena so the crowd gets full width */}
      {massMode ? <View style={styles.boardUnder}>{placesPanel}</View> : null}

      {showCard ? (
        <>
          {hs ? (
            <View style={styles.endCard}>
              <Text style={styles.endTitle}>
                {hs.place === 1
                  ? `👑 YOU — #1 of ${fieldSize}`
                  : hs.place
                    ? `YOU — #${hs.place} of ${fieldSize}`
                    : 'YOUR FIGHT'}
              </Text>
              <Text style={styles.endStat}>
                Pit gems  💎{hs.gems != null ? hs.gems : '—'}
              </Text>
              <Text style={styles.endStat}>Damage  {hs.damageDealt}</Text>
              <Text style={styles.endStat}>Hits  {hs.hitsLanded}</Text>
              <Text style={styles.endHint}>
                {fieldSize} fighters · simultaneous volleys
              </Text>
            </View>
          ) : (
            <View style={styles.endCard}>
              <Text style={styles.endTitle}>
                {winnerName ? `${winnerName} wins` : 'Fight over'}
              </Text>
            </View>
          )}
          <Pressable
            style={styles.continueBtn}
            onPress={() => onDone?.()}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.hint}>
          {massMode
            ? 'Watch the alive count & −N falls · Skip fight → if you want to jump ahead'
            : 'Everyone attacks each volley · multi-KOs ranked fairly'}
        </Text>
      )}
    </View>
  );
}

function Floater({ text, crit, x, y }) {
  const yAnim = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(yAnim, { toValue: -40, duration: 650, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.Text
      style={[
        styles.floater,
        crit && styles.floaterCrit,
        { left: x, top: y, opacity: op, transform: [{ translateY: yAnim }] },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 4, width: '100%' },
  banner: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  fieldMeta: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  callout: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 6,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    justifyContent: 'center',
  },
  arena: {
    backgroundColor: '#2a1a0a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gold,
    overflow: 'hidden',
  },
  sand: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(180,120,40,0.25)',
  },
  volleyWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 8,
  },
  unit: { position: 'absolute', alignItems: 'center' },
  pitProj: {
    position: 'absolute',
    zIndex: 30,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitProjMagic: { fontSize: 16 },
  pitProjMelee: { fontSize: 14 },
  pitArrow: { flexDirection: 'row', alignItems: 'center', width: 18 },
  pitArrowShaft: {
    width: 12,
    height: 2,
    backgroundColor: '#fbbf24',
    borderRadius: 1,
  },
  pitArrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fde68a',
  },
  ring: {
    borderWidth: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringHero: { borderWidth: 0 },
  hpTrack: {
    width: 44,
    height: 4,
    backgroundColor: '#111',
    borderRadius: 2,
    marginTop: 2,
    overflow: 'hidden',
  },
  hpFill: { height: 4, borderRadius: 2 },
  tag: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 1 },
  tagHero: { color: colors.gold },
  boardUnder: {
    width: '100%',
    maxWidth: 520,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  board: {
    width: 132,
    maxHeight: 300,
    backgroundColor: 'rgba(12,4,28,0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 6,
  },
  boardWide: {
    width: '100%',
    maxHeight: 160,
  },
  boardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  boardTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
  },
  boardSub: {
    color: colors.muted,
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '600',
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 6,
    marginBottom: 2,
    backgroundColor: 'rgba(0,0,0,0.25)',
    minHeight: 20,
  },
  boardRowWide: {
    width: '48%',
    marginBottom: 0,
  },
  boardRowFilled: { backgroundColor: 'rgba(40,24,8,0.65)' },
  boardRowYou: { borderWidth: 1, borderColor: colors.gold },
  boardRowChamp: { backgroundColor: 'rgba(80,50,10,0.85)' },
  boardPlace: {
    color: colors.muted,
    fontWeight: '900',
    fontSize: 10,
    width: 22,
  },
  boardName: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 10 },
  boardEmpty: { color: colors.muted, opacity: 0.45 },
  boardGems: {
    color: colors.gem,
    fontWeight: '800',
    fontSize: 9,
    minWidth: 28,
    textAlign: 'right',
  },
  endCard: {
    marginTop: 12,
    backgroundColor: 'rgba(20,8,40,0.9)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  endTitle: { color: colors.gold, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  endStat: { color: colors.cream, fontWeight: '700', fontSize: 13, marginTop: 2 },
  endHint: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  hint: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  continueBtn: {
    marginTop: 16,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
  },
  continueText: {
    color: '#1a0f00',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 1,
  },
  floater: {
    position: 'absolute',
    color: colors.text,
    fontWeight: '900',
    fontSize: 15,
    zIndex: 30,
  },
  floaterCrit: { color: colors.gold, fontSize: 17 },
});
