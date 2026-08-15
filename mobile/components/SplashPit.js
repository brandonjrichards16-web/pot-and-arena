import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { heroPortrait } from '../lib/characters';
import { colors } from '../lib/theme';

const { width: WIN_W, height: WIN_H } = Dimensions.get('window');

/**
 * Mixed cast for the title pit — every race, both genders, all three classes.
 * Positions are % of the arena so it scales on phone + web.
 */
const FIGHTERS = [
  { race: 'ork', classId: 'warrior', gender: 'boy', x: 0.5, y: 0.48, z: 6, scale: 1.12 },
  { race: 'elf', classId: 'ranger', gender: 'girl', x: 0.28, y: 0.42, z: 5, scale: 1.0 },
  { race: 'human', classId: 'mage', gender: 'boy', x: 0.72, y: 0.44, z: 5, scale: 1.0 },
  { race: 'ork', classId: 'ranger', gender: 'girl', x: 0.14, y: 0.55, z: 7, scale: 0.95 },
  { race: 'elf', classId: 'mage', gender: 'boy', x: 0.86, y: 0.52, z: 7, scale: 0.95 },
  { race: 'human', classId: 'warrior', gender: 'girl', x: 0.38, y: 0.62, z: 8, scale: 1.05 },
  { race: 'ork', classId: 'mage', gender: 'girl', x: 0.62, y: 0.64, z: 8, scale: 1.02 },
  { race: 'elf', classId: 'warrior', gender: 'girl', x: 0.5, y: 0.3, z: 3, scale: 0.88 },
  { race: 'human', classId: 'ranger', gender: 'boy', x: 0.2, y: 0.34, z: 4, scale: 0.9 },
  { race: 'ork', classId: 'warrior', gender: 'girl', x: 0.8, y: 0.34, z: 4, scale: 0.9 },
  { race: 'elf', classId: 'ranger', gender: 'boy', x: 0.42, y: 0.22, z: 2, scale: 0.72 },
  { race: 'human', classId: 'mage', gender: 'girl', x: 0.6, y: 0.24, z: 2, scale: 0.72 },
];

const TAUNTS = [
  'Come face me in the pit if you dare!',
  'The pit is mine. Prove me wrong!',
  'One crown left… still want a ticket?',
  'Luck filled the pot. Skill cleared the rest.',
  'I am still standing. Are you?',
  'Step into the pit… if you think you can take me!',
];

function attackStyle(classId) {
  if (classId === 'ranger') return 'ranged';
  if (classId === 'mage') return 'magic';
  return 'melee';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Title splash: slow pit brawl → fighters fall one by one → last one taunts.
 * Loops after a short victory pose so the open screen stays alive.
 */
export default function SplashPit({ height }) {
  const H = height || Math.min(420, Math.max(300, WIN_H * 0.48));
  const W = Math.min(WIN_W - 24, 520);
  const n = FIGHTERS.length;

  const [alive, setAlive] = useState(() => FIGHTERS.map(() => true));
  const [fx, setFx] = useState([]);
  const [floaters, setFloaters] = useState([]);
  const [winnerIdx, setWinnerIdx] = useState(null);
  const [taunt, setTaunt] = useState(null);

  const fxSeq = useRef(0);
  const floaterSeq = useRef(0);
  const bob = useRef(FIGHTERS.map(() => new Animated.Value(0))).current;
  const lunge = useRef(FIGHTERS.map(() => new Animated.Value(0))).current;
  const fall = useRef(FIGHTERS.map(() => new Animated.Value(0))).current; // 0 live → 1 dead
  const pulse = useRef(new Animated.Value(0)).current;
  const bubblePop = useRef(new Animated.Value(0)).current;
  const aliveRef = useRef(alive);
  aliveRef.current = alive;

  // Idle bob + pit glow
  useEffect(() => {
    bob.forEach((v, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 800 + i * 90,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 800 + i * 70,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [bob, pulse]);

  function killFighter(idx) {
    setAlive((prev) => {
      const next = [...prev];
      next[idx] = false;
      return next;
    });
    Animated.timing(fall[idx], {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function showHitFloater(x, y) {
    const id = ++floaterSeq.current;
    setFloaters((prev) => [...prev, { id, x, y, text: '✗' }]);
    setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 600);
  }

  async function playMelee(i, j) {
    await new Promise((res) => {
      Animated.sequence([
        Animated.timing(lunge[i], {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lunge[i], {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => res());
    });
    await new Promise((res) => {
      Animated.sequence([
        Animated.timing(lunge[j], {
          toValue: -0.4,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(lunge[j], {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start(() => res());
    });
  }

  async function playProjectile(i, j, style, cancelled) {
    const f = FIGHTERS[i];
    const t = FIGHTERS[j];
    const id = ++fxSeq.current;
    const fromX = f.x * W;
    const fromY = f.y * H;
    const toX = t.x * W;
    const toY = t.y * H;
    const ang = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      if (cancelled()) return;
      const p = s / steps;
      const e = 1 - Math.pow(1 - p, 2);
      setFx((prev) => {
        const rest = prev.filter((x) => x.id !== id);
        if (s === steps) return rest;
        return [
          ...rest,
          {
            id,
            kind: style,
            x: fromX + (toX - fromX) * e,
            y: fromY + (toY - fromY) * e,
            rot: ang,
            opacity: p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1,
            scale: style === 'magic' ? 1 + p * 0.55 : 1,
          },
        ];
      });
      await sleep(32);
    }
    await new Promise((res) => {
      Animated.sequence([
        Animated.timing(lunge[j], {
          toValue: -0.4,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(lunge[j], {
          toValue: 0,
          duration: 130,
          useNativeDriver: true,
        }),
      ]).start(() => res());
    });
  }

  function resetMatch() {
    setAlive(FIGHTERS.map(() => true));
    setWinnerIdx(null);
    setTaunt(null);
    setFx([]);
    setFloaters([]);
    fall.forEach((v) => v.setValue(0));
    bubblePop.setValue(0);
  }

  // Slow elimination match → winner taunt → reset
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    async function runMatch() {
      // Small beat before first swing
      await sleep(600);
      if (cancelled) return;

      let hits = 0;
      // local mirror so we don't wait on React state lag
      const living = FIGHTERS.map(() => true);

      while (!cancelled) {
        const livingIdx = living
          .map((a, i) => (a ? i : -1))
          .filter((i) => i >= 0);

        if (livingIdx.length <= 1) {
          const champ = livingIdx[0] ?? 0;
          setWinnerIdx(champ);
          const line = pick(TAUNTS);
          setTaunt(line);
          bubblePop.setValue(0);
          Animated.spring(bubblePop, {
            toValue: 1,
            friction: 6,
            tension: 80,
            useNativeDriver: true,
          }).start();
          // Victory pose linger, then new match
          await sleep(5200);
          if (cancelled) return;
          resetMatch();
          await sleep(700);
          // restart loop with fresh living
          for (let i = 0; i < living.length; i++) living[i] = true;
          hits = 0;
          continue;
        }

        const attacker = pick(livingIdx);
        const targets = livingIdx.filter((i) => i !== attacker);
        const target = pick(targets);
        const style = attackStyle(FIGHTERS[attacker].classId);

        if (style === 'melee') {
          await playMelee(attacker, target);
        } else {
          await playProjectile(attacker, target, style, isCancelled);
        }
        if (cancelled) return;

        const t = FIGHTERS[target];
        showHitFloater(t.x * W - 6, t.y * H - 40);
        hits += 1;

        // Warm-up a few swings, then slowly start dropping fighters
        // Chance rises so the match never stalls forever
        const canKill = hits >= 3 && livingIdx.length > 1;
        const killChance =
          livingIdx.length <= 3 ? 0.72 : livingIdx.length <= 6 ? 0.48 : 0.32;
        // Every 3rd hit after warm-up guarantees a KO so the story always progresses
        const forceKill = hits >= 3 && hits % 3 === 0;

        if (canKill && (forceKill || Math.random() < killChance)) {
          living[target] = false;
          killFighter(target);
          // Slight pause to read the fall
          await sleep(480);
        }

        // Nice and slow between exchanges
        const pace =
          livingIdx.length <= 3
            ? 520 + Math.random() * 200
            : 380 + Math.random() * 220;
        await sleep(pace);
      }
    }

    runMatch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [H, W]);

  // Lunge aim roughly toward a neighbor (visual only)
  const lungeDir = useRef(
    FIGHTERS.map((f, i) => {
      const t = FIGHTERS[(i + 3) % FIGHTERS.length];
      return { dx: (t.x - f.x) * 36, dy: (t.y - f.y) * 28 };
    })
  ).current;

  const livingCount = alive.filter(Boolean).length;

  return (
    <View style={[styles.wrap, { width: W, height: H }]}>
      <View style={styles.pitRing} />
      <View style={styles.pitFloor} />
      <Animated.View
        style={[
          styles.pitGlow,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.25, 0.55],
            }),
          },
        ]}
      />
      <View style={styles.hazeTop} />
      <View style={styles.hazeBot} />

      {/* Alive counter */}
      <View style={styles.countPill} pointerEvents="none">
        <Text style={styles.countText}>
          {winnerIdx != null
            ? '👑 WINNER'
            : `${livingCount} / ${n} STANDING`}
        </Text>
      </View>

      {/* Fighters */}
      {FIGHTERS.map((f, i) => {
        const size = Math.round(78 * f.scale * (W / 360));
        const spriteH = size * 1.28;
        const style = attackStyle(f.classId);
        const dir = lungeDir[i];
        const isDead = !alive[i];
        const isWinner = winnerIdx === i;
        return (
          <Animated.View
            key={`${f.race}-${f.classId}-${f.gender}-${i}`}
            style={[
              styles.fighter,
              {
                left: f.x * W - size / 2,
                top: f.y * H - spriteH * 0.75,
                width: size,
                height: spriteH + 18,
                zIndex: isWinner ? 20 : isDead ? 1 : f.z,
                opacity: fall[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.28],
                }),
                transform: [
                  {
                    translateX: lunge[i].interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [-dir.dx * 0.4, 0, dir.dx],
                    }),
                  },
                  {
                    translateY: Animated.add(
                      bob[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, isDead ? 0 : -5 - (i % 3)],
                      }),
                      Animated.add(
                        lunge[i].interpolate({
                          inputRange: [-1, 0, 1],
                          outputRange: [-dir.dy * 0.3, 0, dir.dy],
                        }),
                        fall[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 18],
                        })
                      )
                    ),
                  },
                  {
                    rotate: fall[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', i % 2 === 0 ? '-78deg' : '82deg'],
                    }),
                  },
                  {
                    scale: isWinner
                      ? pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1.05, 1.14],
                        })
                      : 1,
                  },
                ],
              },
            ]}
          >
            <Image
              source={heroPortrait({
                race: f.race,
                classId: f.classId,
                gender: f.gender,
                view: 'front',
              })}
              style={{ width: size, height: spriteH }}
              resizeMode="contain"
            />
            {!isDead ? (
              <Text style={styles.classDot}>
                {style === 'ranged' ? '🏹' : style === 'magic' ? '🔥' : '⚔️'}
              </Text>
            ) : (
              <Text style={styles.koMark}>KO</Text>
            )}
            {isWinner ? <Text style={styles.crown}>👑</Text> : null}
          </Animated.View>
        );
      })}

      {/* Winner taunt — fixed mid/lower overlay so it never clips off-screen */}
      {winnerIdx != null && taunt ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bubbleOverlay,
            {
              opacity: bubblePop,
              transform: [
                {
                  scale: bubblePop.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.bubbleWho}>
            👑{' '}
            {FIGHTERS[winnerIdx]
              ? `${FIGHTERS[winnerIdx].race} ${FIGHTERS[winnerIdx].classId}`
              : 'Champion'}{' '}
            says:
          </Text>
          <Text style={styles.bubbleText}>{taunt}</Text>
        </Animated.View>
      ) : null}

      {/* Projectiles */}
      {fx.map((p) => (
        <View
          key={p.id}
          pointerEvents="none"
          style={[
            styles.proj,
            {
              left: p.x,
              top: p.y,
              opacity: p.opacity,
              transform: [
                { translateX: -14 },
                { translateY: -14 },
                { rotate: `${p.rot || 0}deg` },
                { scale: p.scale || 1 },
              ],
            },
          ]}
        >
          {p.kind === 'magic' ? (
            <View style={styles.fireball}>
              <Text style={styles.projEmoji}>🔥</Text>
            </View>
          ) : (
            <View style={styles.arrow}>
              <View style={styles.arrowFletch} />
              <View style={styles.arrowShaft} />
              <View style={styles.arrowHead} />
            </View>
          )}
        </View>
      ))}

      {/* Hit marks */}
      {floaters.map((f) => (
        <View
          key={f.id}
          pointerEvents="none"
          style={[styles.hitFloat, { left: f.x, top: f.y }]}
        >
          <Text style={styles.hitFloatText}>{f.text}</Text>
        </View>
      ))}

      <View style={styles.legend} pointerEvents="none">
        <Text style={styles.legendText}>🧑 Human  ·  🧝 Elf  ·  👹 Ork</Text>
        <Text style={styles.legendSub}>
          {winnerIdx != null
            ? 'One left standing… your turn?'
            : 'Warriors · Rangers · Mages · last one standing'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.45)',
    backgroundColor: 'rgba(12, 6, 22, 0.55)',
    marginBottom: 14,
  },
  pitRing: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '18%',
    bottom: '10%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(180, 120, 40, 0.55)',
    backgroundColor: 'rgba(60, 30, 10, 0.25)',
  },
  pitFloor: {
    position: 'absolute',
    left: '14%',
    right: '14%',
    top: '28%',
    bottom: '16%',
    borderRadius: 999,
    backgroundColor: 'rgba(90, 50, 20, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  pitGlow: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: '35%',
    bottom: '22%',
    borderRadius: 999,
    backgroundColor: 'rgba(251, 146, 60, 0.2)',
  },
  hazeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hazeBot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  countPill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  countText: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  fighter: {
    position: 'absolute',
    alignItems: 'center',
  },
  classDot: {
    marginTop: -8,
    fontSize: 12,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  koMark: {
    marginTop: -6,
    color: '#f87171',
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  crown: {
    position: 'absolute',
    top: -6,
    fontSize: 18,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  /** Centered lower third — always on-screen, readable */
  bubbleOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 44,
    zIndex: 60,
    backgroundColor: 'rgba(255, 248, 230, 0.97)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleWho: {
    color: '#92400e',
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  bubbleText: {
    color: '#1a0a00',
    fontWeight: '900',
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
  },
  proj: {
    position: 'absolute',
    zIndex: 40,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 36,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fde68a',
  },
  arrowShaft: {
    width: 16,
    height: 3,
    backgroundColor: '#fbbf24',
    borderRadius: 1,
  },
  arrowFletch: {
    width: 6,
    height: 9,
    backgroundColor: '#f87171',
    borderRadius: 1,
  },
  fireball: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(249,115,22,0.55)',
    borderWidth: 1.5,
    borderColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projEmoji: { fontSize: 14 },
  hitFloat: {
    position: 'absolute',
    zIndex: 45,
  },
  hitFloatText: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 16,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  legend: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  legendText: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  legendSub: {
    color: 'rgba(255,245,220,0.85)',
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
});
