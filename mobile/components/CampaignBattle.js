import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ImageBackground,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { colors } from '../lib/theme';
import { frontSpriteFor, heroPortrait } from '../lib/characters';
import { resolveTheme } from '../lib/worldThemes';
import { roadSceneSource } from '../lib/roadScenes';

const { height: WIN_H, width: WIN_W } = Dimensions.get('window');
const FIELD_H = Math.min(520, Math.max(400, WIN_H * 0.58));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Class → attack VFX for EVERY race/gender.
 * If ANY hint says ranger/mage, use that (never let a stale "warrior" win).
 */
function resolveAttackStyle(...hints) {
  const tokens = [];
  for (const h of hints) {
    if (h == null) continue;
    if (typeof h === 'string' || typeof h === 'number') {
      tokens.push(String(h).toLowerCase());
      continue;
    }
    if (typeof h === 'object') {
      for (const k of [
        'classId',
        'class',
        'className',
        'kind',
        'kindLabel',
        'kindId',
        'role',
        'heroLabel',
        'name',
      ]) {
        if (h[k]) tokens.push(String(h[k]).toLowerCase());
      }
    }
  }
  const blob = tokens.join(' ');
  // Prefer ranged/magic if any token matches — stale warrior must not override
  if (/ranger|archer|bow|arrow|marksman|rogue|hunter|🏹/.test(blob)) {
    return 'ranged';
  }
  if (
    /mage|mystic|wizard|sorcer|cultist|warlock|witch|firebolt|magic|spell|🔥/.test(
      blob
    )
  ) {
    return 'magic';
  }
  return 'melee';
}

function styleBanner(style) {
  if (style === 'ranged') return '🏹 ARROW!';
  if (style === 'magic') return '🔥 FIREBOLT!';
  return '⚔️ STRIKE!';
}

/**
 * Path fight theater:
 * - Warrior lunges · Ranger shoots arrow · Mage firebolt
 * - Damage numbers on hit · foes attack by their class too
 */
export default function CampaignBattle({
  gender = 'boy',
  race = 'human',
  classId = 'warrior',
  /** Full-set armor origin for hero rear portrait (elvan/human/ork/…) */
  gearOrigin = null,
  battle = null,
  /** Fetch attack result only (no parent HP update yet) */
  onAttack,
  /** Apply server result after hit animations land */
  onAttackResolved,
  busy = false,
  logLine = '',
  worldTheme = null,
  chapterTitle = '',
  storyBeat = '',
}) {
  const [fieldW, setFieldW] = useState(WIN_W);
  const [animating, setAnimating] = useState(false);
  const [floaters, setFloaters] = useState([]); // {id, text, x, y, color, anim}
  const [flashId, setFlashId] = useState(null);
  const [heroFlash, setHeroFlash] = useState(false);
  /** Flying projectiles as plain numbers (reliable on web) */
  const [projectiles, setProjectiles] = useState([]);
  /** Big callout so the attack type is obvious: ARROW / FIREBOLT / STRIKE */
  const [strikeBanner, setStrikeBanner] = useState(null);
  /**
   * Local HP paint during an exchange so bars only drop when the hit lands.
   * null = use parent battle prop.
   */
  const [paint, setPaint] = useState(null);
  const heroTX = useRef(new Animated.Value(0)).current;
  const heroTY = useRef(new Animated.Value(0)).current;
  const foeOff = useRef({}).current; // id -> {x,y} Animated values
  const floaterSeq = useRef(0);
  const projSeq = useRef(0);
  const floaterAnims = useRef({}).current; // id -> {y, opacity}

  const theme = resolveTheme(worldTheme || battle?.worldTheme);
  const sceneSrc = roadSceneSource(
    battle?.sceneKey,
    battle?.worldTheme || worldTheme || theme
  );
  const hero = paint?.hero || battle?.hero;
  const foes = (paint?.foes || battle?.foes || []).filter(Boolean);
  const myTurn =
    !animating &&
    battle?.awaiting === 'player' &&
    battle?.status === 'active';
  // Prefer live battle identity, fall back to equipped hero from lobby
  // Race/gender only pick art; class alone picks attack VFX (all combos).
  const hGender = hero?.gender || gender || 'boy';
  const hRace = hero?.race || race || 'human';
  // Prefer non-warrior equip from lobby if battle unit is stale warrior
  const hClass =
    resolveAttackStyle(classId) !== 'melee' &&
    resolveAttackStyle(hero?.classId) === 'melee'
      ? classId
      : hero?.classId || hero?.class || classId || 'warrior';
  const heroStyle = resolveAttackStyle(
    hero,
    hClass,
    classId,
    hero?.className,
    hero?.heroLabel
  );
  const hGearOrigin =
    hero?.gearOrigin || hero?.gearSet?.originId || gearOrigin || null;
  const rear = heroPortrait({
    race: hRace,
    classId: hClass,
    gender: hGender,
    view: 'back',
    gearOrigin: hGearOrigin,
  });

  const ensureFoeAnim = useCallback(
    (id) => {
      if (!foeOff[id]) {
        foeOff[id] = {
          x: new Animated.Value(0),
          y: new Animated.Value(0),
        };
      }
      return foeOff[id];
    },
    [foeOff]
  );

  /** Rising damage number so hits always read "how hard we hit" */
  function addFloater(text, x, y, color = '#fbbf24') {
    const id = `f${++floaterSeq.current}`;
    const ay = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    floaterAnims[id] = { y: ay, opacity };
    setFloaters((prev) => [...prev, { id, text, x, y, color }]);
    Animated.parallel([
      Animated.timing(ay, {
        toValue: -42,
        duration: 720,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
      delete floaterAnims[id];
    });
  }

  /** Hero melee lunge toward a lane */
  async function playHeroLunge(lane, laneUnit) {
    const dx = lane * laneUnit * 0.45;
    const dy = -95;
    await new Promise((resolve) => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(heroTX, {
            toValue: dx,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(heroTY, {
            toValue: dy,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(heroTX, {
            toValue: 0,
            duration: 200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(heroTY, {
            toValue: 0,
            duration: 200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => resolve());
    });
  }

  /** Small draw-back so ranged/magic still feel active */
  async function playHeroRecoil() {
    await new Promise((resolve) => {
      Animated.sequence([
        Animated.timing(heroTY, {
          toValue: 10,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(heroTY, {
          toValue: 0,
          duration: 140,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => resolve());
    });
  }

  /**
   * Fly an arrow or firebolt using plain setState positions (no Animated left/top).
   * This is the reliable path on Expo web — Animated layout props often no-op.
   */
  async function playProjectile({ fromX, fromY, toX, toY, style }) {
    const id = `p${++projSeq.current}`;
    const ang = (Math.atan2(toY - fromY, toX - fromX) * 180) / Math.PI;
    const rotate = style === 'ranged' ? `${ang}deg` : '0deg';
    const dur = style === 'magic' ? 420 : 340;
    const steps = 14;
    const stepMs = Math.round(dur / steps);

    setProjectiles((prev) => [
      ...prev,
      {
        id,
        style,
        rotate,
        x: fromX,
        y: fromY,
        scale: style === 'magic' ? 1.15 : 1,
        opacity: 1,
      },
    ]);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // ease-out
      const e = 1 - Math.pow(1 - t, 2.2);
      const x = fromX + (toX - fromX) * e;
      const y = fromY + (toY - fromY) * e;
      const scale =
        style === 'magic'
          ? t < 0.7
            ? 1.15 + t * 0.9
            : 1.8 - (t - 0.7) * 4
          : 1;
      const opacity = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
      setProjectiles((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, x, y, scale, opacity } : p
        )
      );
      await sleep(stepMs);
    }

    setProjectiles((prev) => prev.filter((p) => p.id !== id));
  }

  function flashStrikeBanner(style) {
    setStrikeBanner(styleBanner(style));
    setTimeout(() => setStrikeBanner(null), 520);
  }

  /** Foe melee: step toward the hero */
  async function playFoeLunge(foeId) {
    const a = ensureFoeAnim(foeId);
    await new Promise((resolve) => {
      Animated.sequence([
        Animated.timing(a.y, {
          toValue: 70,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(a.y, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => resolve());
    });
  }

  async function playFoeRecoil(foeId) {
    const a = ensureFoeAnim(foeId);
    await new Promise((resolve) => {
      Animated.sequence([
        Animated.timing(a.y, {
          toValue: -8,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(a.y, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => resolve());
    });
  }

  /**
   * Pull hit events from this exchange only.
   * Server public log is sliced to last 12, so index-by-length is unreliable —
   * find the latest hero hit on tid, then foe hits after it.
   */
  function eventsFromExchange(log, heroId, tid) {
    const list = Array.isArray(log) ? log : [];
    let myHitIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e?.t !== 'hit' || !e.dmg) continue;
      const hitsTarget = e.defId === tid;
      const fromHero =
        e.atkId === heroId ||
        (typeof e.text === 'string' && e.text.startsWith('You hit'));
      if (hitsTarget && fromHero) {
        myHitIdx = i;
        break;
      }
    }
    // Fallback: parse "You hit … for N" from the tail
    let myHit = myHitIdx >= 0 ? list[myHitIdx] : null;
    if (!myHit) {
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e?.t === 'hit' && e.dmg && e.defId === tid) {
          myHit = e;
          myHitIdx = i;
          break;
        }
        if (typeof e?.text === 'string') {
          const m = e.text.match(/^You hit .+ for (\d+)/i);
          if (m) {
            myHit = { ...e, dmg: e.dmg || Number(m[1]), defId: tid };
            myHitIdx = i;
            break;
          }
        }
      }
    }

    const after = myHitIdx >= 0 ? list.slice(myHitIdx + 1) : list.slice(-6);
    const foeHits = after.filter(
      (e) =>
        e?.t === 'hit' &&
        e.dmg &&
        e.atkId &&
        e.atkId !== heroId &&
        (e.defId === heroId ||
          (typeof e.text === 'string' &&
            e.text.toLowerCase().includes('hits you')))
    );
    return { myHit, foeHits };
  }

  async function handleAttack(tid) {
    if (busy || animating || !myTurn || !tid) return;
    const liveHero = battle?.hero;
    const liveFoes = (battle?.foes || []).filter(Boolean);
    const foe = liveFoes.find((f) => f.id === tid && f.alive);
    if (!foe || !liveHero) return;

    setAnimating(true);
    // Freeze pre-attack HP for paint — parent must not jump bars early
    const preHero = { ...liveHero };
    const preFoes = liveFoes.map((f) => ({ ...f }));
    setPaint({ hero: preHero, foes: preFoes });

    const heroId = preHero?.id;
    const n = preFoes.length;
    const laneUnit = Math.min(96, Math.max(74, fieldW * 0.22));
    const lane =
      typeof foe.lane === 'number'
        ? foe.lane
        : n === 1
          ? 0
          : preFoes.indexOf(foe) - (n - 1) / 2;

    const heroX = fieldW / 2;
    const heroY = FIELD_H * 0.72;
    const foeX = fieldW / 2 + lane * laneUnit;
    const foeY = FIELD_H * (foe.depth ? 0.32 : 0.26);

    // Resolve style at click time — any ranger/mage hint wins over warrior
    const styleNow = resolveAttackStyle(
      preHero,
      battle?.hero,
      hClass,
      classId,
      preHero?.classId,
      preHero?.className,
      preHero?.heroLabel
    );

    // Snapshot foes for counter VFX
    const foesBefore = preFoes;

    flashStrikeBanner(styleNow);

    // Kick API in parallel (does NOT update parent HP — see onAttackResolved)
    let res = null;
    const apiPromise = (async () => {
      if (typeof onAttack === 'function') {
        res = await onAttack(tid);
      }
    })();

    // 1) Hero commits — strike must finish BEFORE HP/floaters
    if (styleNow === 'melee') {
      await playHeroLunge(lane, laneUnit);
    } else {
      const recoil = playHeroRecoil();
      await playProjectile({
        fromX: heroX,
        fromY: heroY - 28,
        toX: foeX,
        toY: foeY + 36,
        style: styleNow,
      });
      await recoil;
    }

    // Ensure server result is ready for numbers
    await apiPromise;

    if (!res) {
      // API failed — release freeze, no HP drama
      setPaint(null);
      setAnimating(false);
      return;
    }

    // 2) Damage floater + foe bar drop at impact
    const log =
      res?.battle?.log ||
      res?.result?.log ||
      res?.public?.log ||
      [];
    const { myHit, foeHits } = eventsFromExchange(log, heroId, tid);

    const dmgShown =
      myHit?.dmg ||
      (() => {
        for (let i = log.length - 1; i >= 0; i--) {
          const m = String(log[i]?.text || '').match(/You hit .+ for (\d+)/i);
          if (m) return Number(m[1]);
        }
        return null;
      })();

    // After your hit lands: show target HP from server (or subtract local dmg)
    const postFoes = (res?.battle?.foes || res?.public?.foes || preFoes).map(
      (f) => ({ ...f })
    );
    setPaint({
      hero: { ...preHero },
      foes: postFoes,
    });

    if (dmgShown) {
      setFlashId(tid);
      addFloater(`-${dmgShown}`, foeX - 18, foeY - 8, '#fbbf24');
      await sleep(280);
      setFlashId(null);
    } else {
      await sleep(80);
    }

    // 3) Foe counters — animate first, then drop YOUR HP
    const afterFoes = postFoes;
    const deadIds = new Set(
      afterFoes.filter((f) => !f.alive || f.hp <= 0).map((f) => f.id)
    );

    let heroHp = preHero.hp;
    for (const hit of foeHits) {
      const atkId = hit.atkId;
      if (!atkId || deadIds.has(atkId)) continue;
      const stillUp =
        afterFoes.find((f) => f.id === atkId) ||
        foesBefore.find((f) => f.id === atkId);
      if (!stillUp) continue;

      const foeStyle = resolveAttackStyle(
        stillUp,
        stillUp.classId,
        stillUp.kind,
        stillUp.kindLabel,
        stillUp.className
      );
      const fLane =
        typeof stillUp.lane === 'number'
          ? stillUp.lane
          : foesBefore.findIndex((f) => f.id === atkId) - (n - 1) / 2;
      const fx = fieldW / 2 + fLane * laneUnit;
      const fy = FIELD_H * (stillUp.depth ? 0.32 : 0.26);

      flashStrikeBanner(foeStyle);
      setHeroFlash(true);
      if (foeStyle === 'melee') {
        await playFoeLunge(atkId);
      } else {
        const recoil = playFoeRecoil(atkId);
        await playProjectile({
          fromX: fx,
          fromY: fy + 30,
          toX: heroX,
          toY: heroY - 16,
          style: foeStyle,
        });
        await recoil;
      }

      // HP drop + number at the moment the counter lands
      const dmg = Number(hit.dmg) || 0;
      heroHp = Math.max(0, heroHp - dmg);
      setPaint((p) => ({
        hero: {
          ...(p?.hero || preHero),
          hp: heroHp,
          alive: heroHp > 0,
        },
        foes: p?.foes || postFoes,
      }));
      addFloater(`-${dmg}`, heroX - 16, heroY - 24, '#fb7185');
      await sleep(160);
      setHeroFlash(false);
      await sleep(90);
    }

    // 4) Commit server state to parent (result sheet, final HP, etc.)
    if (typeof onAttackResolved === 'function' && res) {
      onAttackResolved(res);
    }
    // Prefer final server snapshot if present
    if (res?.battle?.hero || res?.battle?.foes) {
      setPaint({
        hero: res.battle.hero || preHero,
        foes: res.battle.foes || postFoes,
      });
    }
    // Brief hold so the last number is readable, then release paint to parent
    await sleep(120);
    setPaint(null);
    setAnimating(false);
  }

  if (!battle || !hero) {
    return (
      <View style={styles.shell}>
        <Text style={styles.loading}>Entering battle…</Text>
      </View>
    );
  }

  const aliveFoes = foes.filter((f) => f.alive);
  const message =
    logLine ||
    (animating
      ? '…'
      : myTurn
        ? aliveFoes.length
          ? heroStyle === 'ranged'
            ? 'Tap a foe — loose an arrow!'
            : heroStyle === 'magic'
              ? 'Tap a foe — cast a firebolt!'
              : 'Tap a foe — you strike, then they strike back'
          : '…'
        : 'Enemy turn…');

  const heroHpPct = Math.max(0, Math.min(100, (hero.hp / hero.maxHp) * 100));
  const n = foes.length;
  const heroW = Math.min(150, fieldW * 0.36);
  const heroH = heroW * 1.28;
  const laneUnit = Math.min(96, Math.max(74, fieldW * 0.22));

  return (
    <View style={styles.shell}>
      <ImageBackground
        source={sceneSrc}
        style={styles.field}
        imageStyle={styles.fieldImage}
        resizeMode="cover"
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 40 && Math.abs(w - fieldW) > 2) setFieldW(w);
        }}
      >
        <View style={styles.softTop} pointerEvents="none" />
        <View style={styles.softBot} pointerEvents="none" />

        <Text style={styles.placeTag} pointerEvents="none" numberOfLines={1}>
          {theme.name || 'The Road'}
          {chapterTitle ? `  ·  ${chapterTitle}` : ''}
        </Text>
        {storyBeat ? (
          <Text style={styles.storyBeat} pointerEvents="none" numberOfLines={2}>
            {storyBeat}
          </Text>
        ) : null}

        {/* FOES */}
        <View style={styles.foeLine} pointerEvents="box-none">
          {foes.map((f, i) => {
            const dead = !f.alive;
            const size = f.isBoss
              ? 138
              : n === 1
                ? 128
                : f.depth
                  ? 108
                  : 122;
            const spriteH = size * 1.32;
            const lane =
              typeof f.lane === 'number'
                ? f.lane
                : n === 1
                  ? 0
                  : i - (n - 1) / 2;
            const hitW = Math.max(size + 16, 120);
            const hitH = spriteH + 52;
            const centerX = fieldW / 2 + lane * laneUnit;
            const left = centerX - hitW / 2;
            const bottom = f.depth ? 28 : 8;
            const fa = ensureFoeAnim(f.id);
            const flashing = flashId === f.id;
            const fStyle = resolveAttackStyle(f, f.classId, f.kind);

            return (
              <Animated.View
                key={f.id}
                style={[
                  styles.foeHit,
                  {
                    left,
                    bottom,
                    width: hitW,
                    height: hitH,
                    opacity: dead ? 0.28 : 1,
                    zIndex: f.isBoss ? 8 : f.depth ? 4 : 6,
                    transform: [
                      { translateX: fa.x },
                      { translateY: fa.y },
                    ],
                  },
                ]}
                pointerEvents={dead || animating ? 'none' : 'box-none'}
              >
                <Pressable
                  disabled={busy || dead || !myTurn || animating}
                  onPress={() => handleAttack(f.id)}
                  style={styles.foePress}
                >
                  <View style={styles.foeLabels} pointerEvents="none">
                    <Text style={styles.headName} numberOfLines={1}>
                      {f.isBoss ? '★ ' : ''}
                      {f.name}
                    </Text>
                    <View style={styles.headBar}>
                      <View
                        style={[
                          styles.headFill,
                          {
                            width: `${Math.max(0, (f.hp / f.maxHp) * 100)}%`,
                            backgroundColor:
                              f.hp < f.maxHp * 0.3 ? '#e74c3c' : '#2ecc71',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.headStats}>
                      {f.hp}/{f.maxHp}
                      {!dead ? (
                        <Text style={styles.classCue}>
                          {' '}
                          ·{' '}
                          {fStyle === 'ranged'
                            ? '🏹'
                            : fStyle === 'magic'
                              ? '🔥'
                              : '⚔️'}
                        </Text>
                      ) : null}
                    </Text>
                    {myTurn && !dead ? (
                      <Text style={styles.tapCue}>TAP</Text>
                    ) : null}
                  </View>

                  <Image
                    source={
                      f.race
                        ? heroPortrait({
                            race: f.race,
                            classId: f.classId || 'warrior',
                            gender: f.gender || 'boy',
                            view: 'front',
                            gearOrigin:
                              f.gearOrigin || f.gearSet?.originId || null,
                          })
                        : frontSpriteFor(
                            f.gender || 'boy',
                            f.isBoss ? 2 : f.visualTier || 0,
                            f.id || f.name || String(i)
                          )
                    }
                    pointerEvents="none"
                    style={[
                      styles.foeSprite,
                      {
                        width: size,
                        height: spriteH,
                      },
                      flashing && styles.foeFlash,
                      dead && styles.foeDead,
                    ]}
                    resizeMode="contain"
                  />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {/* YOU — lunges (warrior) or shoots (ranger/mage) */}
        <Animated.View
          style={[
            styles.heroSpot,
            {
              transform: [
                { translateX: heroTX },
                { translateY: heroTY },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={rear}
            style={[
              styles.heroImg,
              { width: heroW, height: heroH },
              heroFlash && styles.heroFlash,
            ]}
            resizeMode="contain"
          />
          <Text style={styles.footName}>
            YOU · {hRace} {hClass}
            {heroStyle === 'ranged'
              ? ' 🏹'
              : heroStyle === 'magic'
                ? ' 🔥'
                : ' ⚔️'}
          </Text>
          <View style={[styles.footBar, { width: Math.min(100, heroW * 0.75) }]}>
            <View
              style={[
                styles.footFill,
                {
                  width: `${heroHpPct}%`,
                  backgroundColor:
                    hero.hp < hero.maxHp * 0.35 ? '#e74c3c' : colors.gold,
                },
              ]}
            />
          </View>
          <Text style={styles.footStats}>
            {hero.hp}/{hero.maxHp}
          </Text>
        </Animated.View>

        {/* Attack type callout — makes class VFX unmistakable */}
        {strikeBanner ? (
          <View style={styles.strikeBanner} pointerEvents="none">
            <Text style={styles.strikeBannerText}>{strikeBanner}</Text>
          </View>
        ) : null}

        {/* Projectiles — plain left/top numbers (reliable on web) */}
        {projectiles.map((p) => {
          const isMagic = p.style === 'magic';
          const isRanged = p.style === 'ranged';
          return (
            <View
              key={p.id}
              pointerEvents="none"
              style={[
                styles.projectile,
                {
                  left: p.x,
                  top: p.y,
                  opacity: p.opacity ?? 1,
                  transform: [
                    { scale: p.scale ?? 1 },
                    { rotate: p.rotate || '0deg' },
                  ],
                },
              ]}
            >
              {isRanged ? (
                <View style={styles.arrowBody}>
                  <View style={styles.arrowFletch} />
                  <View style={styles.arrowShaft} />
                  <View style={styles.arrowHead} />
                </View>
              ) : isMagic ? (
                <View style={styles.fireball}>
                  <View style={styles.fireballCore} />
                  <Text style={styles.projEmojiMagic}>🔥</Text>
                </View>
              ) : (
                <Text style={styles.projEmoji}>⚔️</Text>
              )}
            </View>
          );
        })}

        {/* Damage numbers — show hit power */}
        {floaters.map((f) => {
          const a = floaterAnims[f.id];
          return (
            <Animated.View
              key={f.id}
              pointerEvents="none"
              style={[
                styles.floater,
                {
                  left: f.x,
                  top: f.y,
                  opacity: a?.opacity || 1,
                  transform: a ? [{ translateY: a.y }] : undefined,
                },
              ]}
            >
              <Text style={[styles.floaterText, { color: f.color }]}>
                {f.text}
              </Text>
            </Animated.View>
          );
        })}

        <View style={styles.msgFloat} pointerEvents="none">
          <Text style={styles.msgText}>{message}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 0,
    backgroundColor: 'transparent',
    flex: 1,
    minHeight: FIELD_H,
  },
  loading: {
    color: colors.cream,
    fontWeight: '800',
    textAlign: 'center',
    padding: 48,
  },
  field: {
    width: '100%',
    height: FIELD_H,
    position: 'relative',
    flex: 1,
  },
  fieldImage: {},
  softTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  softBot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  placeTag: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    textAlign: 'center',
    color: 'rgba(255,245,220,0.95)',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textShadowColor: '#000',
    textShadowRadius: 6,
    zIndex: 8,
  },
  storyBeat: {
    position: 'absolute',
    top: 28,
    left: 20,
    right: 20,
    textAlign: 'center',
    color: 'rgba(255,230,180,0.9)',
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 15,
    textShadowColor: '#000',
    textShadowRadius: 5,
    zIndex: 8,
  },
  foeLine: {
    position: 'absolute',
    top: '8%',
    left: 0,
    right: 0,
    bottom: '38%',
    zIndex: 5,
  },
  foeHit: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  foePress: {
    alignItems: 'center',
    width: '100%',
  },
  foeLabels: {
    alignItems: 'center',
    marginBottom: 2,
  },
  foeSprite: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  foeFlash: {
    opacity: 0.75,
  },
  foeDead: {
    opacity: 0.35,
  },
  headName: {
    color: '#fff8e7',
    fontWeight: '900',
    fontSize: 13,
    textShadowColor: '#000',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
    textAlign: 'center',
    maxWidth: 140,
  },
  headStats: {
    color: 'rgba(255,245,220,0.9)',
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 2,
    textShadowColor: '#000',
    textShadowRadius: 4,
    textAlign: 'center',
  },
  classCue: {
    fontWeight: '700',
    opacity: 0.9,
  },
  headBar: {
    width: 78,
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 2,
    marginTop: 2,
    marginBottom: 2,
    overflow: 'hidden',
  },
  headFill: { height: '100%', borderRadius: 2 },
  footName: {
    color: '#fff8e7',
    fontWeight: '900',
    fontSize: 11,
    textShadowColor: '#000',
    textShadowRadius: 5,
    textAlign: 'center',
    marginTop: -4,
  },
  footStats: {
    color: 'rgba(255,245,220,0.9)',
    fontWeight: '800',
    fontSize: 10,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowRadius: 4,
    textAlign: 'center',
  },
  footBar: {
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 3,
    marginTop: 3,
    overflow: 'hidden',
  },
  footFill: { height: '100%', borderRadius: 2 },
  tapCue: {
    marginBottom: 2,
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.5,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  heroSpot: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
  },
  heroImg: {
    backgroundColor: 'transparent',
  },
  heroFlash: {
    opacity: 0.65,
  },
  strikeBanner: {
    position: 'absolute',
    top: '42%',
    left: 20,
    right: 20,
    zIndex: 60,
    alignItems: 'center',
  },
  strikeBannerText: {
    color: '#fff8e7',
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: 1.5,
    textShadowColor: '#000',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.7)',
  },
  projectile: {
    position: 'absolute',
    zIndex: 50,
    width: 56,
    height: 56,
    marginLeft: -28,
    marginTop: -28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 44,
    height: 14,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fde68a',
    // triangle points right = leading edge in flight
    zIndex: 2,
    marginLeft: -2,
  },
  arrowShaft: {
    width: 22,
    height: 4,
    backgroundColor: '#fbbf24',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  arrowFletch: {
    width: 8,
    height: 12,
    backgroundColor: '#f87171',
    borderRadius: 1,
    marginRight: -1,
  },
  fireball: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(249,115,22,0.55)',
    borderWidth: 2,
    borderColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f97316',
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  fireballCore: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fef08a',
  },
  projEmoji: {
    fontSize: 28,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  projEmojiMagic: {
    fontSize: 22,
    zIndex: 2,
    textShadowColor: '#ea580c',
    textShadowRadius: 8,
  },
  floater: {
    position: 'absolute',
    zIndex: 40,
  },
  floaterText: {
    fontWeight: '900',
    fontSize: 26,
    textShadowColor: '#000',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  msgFloat: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(8,4,12,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 10,
  },
  msgText: {
    color: '#fff8e7',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
});
