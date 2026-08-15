import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  ScrollView,
  Pressable,
  ImageBackground,
} from 'react-native';
import { colors } from '../lib/theme';
import { rearPortraitFor, frontSpriteFor, heroPortrait } from '../lib/characters';

/** Vertical space between stage stones — roomy, not crunched */
const NODE_GAP = 112;
const HERO_W = 56;
const roadBg = require('../assets/bg/lobby.jpg');

/**
 * Level map: winding path, stage stones with reward chips on the side,
 * and a smooth walk animation when you clear a stage.
 */
export default function CampaignRoadMap({
  pathNodes = [],
  chapterInfo = null,
  gender = 'boy',
  race = 'human',
  classId = 'warrior',
  /** Full-set armor origin (shows set outfit on the road hero) */
  gearOrigin = null,
  /** 0-based index of the stage you just left (for walk anim) */
  animateFrom = null,
  onWalkDone = null,
  height = 520,
  onSelectStage = null,
  /** Optional one-line loot after clear — not a huge banner */
  clearNote = null,
}) {
  const nodes = pathNodes.length
    ? pathNodes
    : [{ stage: 1, state: 'here', label: 'Start', reward: {} }];

  const [width, setWidth] = useState(0);
  const hereIdx = Math.max(
    0,
    nodes.findIndex((n) => n.state === 'here')
  );
  const fromIdx =
    animateFrom != null && animateFrom >= 0
      ? Math.max(0, Math.min(nodes.length - 1, animateFrom))
      : hereIdx;

  const padTop = 56;
  const padBot = 100;
  const contentH = padTop + Math.max(1, nodes.length) * NODE_GAP + padBot;

  const points = useMemo(() => {
    if (width < 40) return [];
    const n = nodes.length;
    const cx = width / 2;
    // Gentle S-curve — more horizontal room so path isn’t a thin crushed line
    const amplitude = Math.min(56, width * 0.18);
    return nodes.map((node, i) => {
      const y = padTop + (n - 1 - i) * NODE_GAP;
      const wave = Math.sin(i * 0.55) * amplitude;
      const x = cx + wave;
      return { x, y, node, i };
    });
  }, [nodes, width]);

  const heroY = useRef(new Animated.Value(0)).current;
  const heroX = useRef(new Animated.Value(0)).current;
  const heroReady = useRef(false);
  const scrollRef = useRef(null);
  const walkToken = useRef(0);
  /** Avoid re-snapping when parent clears animateFrom after a walk */
  const settledKey = useRef('');

  const scrollToHere = useCallback(
    (y, animated = true) => {
      const target = Math.max(0, y - height * 0.38);
      setTimeout(
        () => scrollRef.current?.scrollTo?.({ y: target, animated }),
        30
      );
    },
    [height]
  );

  // Stable keys so we don’t re-walk on every parent re-render
  const pathKey = `${nodes.length}:${hereIdx}:${fromIdx}:${animateFrom ?? 'x'}:${Math.round(width)}`;
  const placeKey = `${nodes.length}:${hereIdx}:${Math.round(width)}`;

  // Walk / place hero whenever path geometry or “here” changes
  useEffect(() => {
    if (!points.length || width < 40) return;
    const from = points[fromIdx] || points[0];
    const to = points[hereIdx] || points[0];
    if (!to) return;

    const shouldWalk =
      animateFrom != null &&
      fromIdx !== hereIdx &&
      from &&
      Math.abs(from.y - to.y) > 2;

    const token = ++walkToken.current;

    if (shouldWalk) {
      // Snap to cleared stage, then walk to the new frontier
      heroX.setValue(from.x);
      heroY.setValue(from.y);
      heroReady.current = true;
      settledKey.current = '';
      scrollToHere(from.y, false);

      Animated.parallel([
        Animated.timing(heroY, {
          toValue: to.y,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(heroX, {
          toValue: to.x,
          duration: 1100,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (!finished || token !== walkToken.current) return;
        settledKey.current = placeKey;
        scrollToHere(to.y, true);
        onWalkDone?.();
      });
    } else {
      // Already sitting on this node (e.g. walk finished + animateFrom cleared)
      if (settledKey.current === placeKey && heroReady.current) {
        return;
      }
      heroX.setValue(to.x);
      heroY.setValue(to.y);
      heroReady.current = true;
      settledKey.current = placeKey;
      scrollToHere(to.y, true);
    }
    // pathKey encodes geometry + walk intent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const rear = heroPortrait({
    race: race || 'human',
    classId: classId || 'warrior',
    gender: gender || 'boy',
    view: 'back',
    gearOrigin: gearOrigin || null,
  });
  const tint = chapterInfo?.tint || colors.gold;
  const here = nodes[hereIdx];

  /**
   * Continuous dirt trail: dense overlapping pads along the polyline.
   * Reads as one road a person would walk — not hotdog sticks end-to-end.
   */
  const trailPads = useMemo(() => {
    if (points.length < 2) return [];
    const pads = [];
    const STEP = 9;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const n = Math.max(3, Math.ceil(len / STEP));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        // Slight width wobble so it feels packed earth, not a tube
        const wobble = 1 + Math.sin((i * 11 + k * 2.3) * 0.7) * 0.08;
        const base = 26 * wobble;
        pads.push({
          x: a.x + dx * t,
          y: a.y + dy * t,
          outer: base + 10,
          mid: base + 2,
          inner: Math.max(8, base * 0.38),
        });
      }
    }
    return pads;
  }, [points]);

  function pressNode(node) {
    if (!node || node.state === 'locked') return;
    onSelectStage?.(node);
  }

  /** Compact reward text — never long enough to need "…" */
  function shortReward(node, { replay = false } = {}) {
    if (!node) return '';
    const r = replay ? node.replayReward || node.reward : node.reward;
    if (!r) return '';
    if (Array.isArray(r.parts) && r.parts.length) {
      // "+2 ATK" or "+3 ATK +2 DEF" — short stats only
      return r.parts
        .map((p) => `+${p.amount} ${p.short || p.stat}`)
        .join(' ');
    }
    return String(r.label || '')
      .replace(/\s*\(replay\)\s*/gi, '')
      .replace(/\s*·\s*/g, ' ')
      .trim();
  }

  function rewardLine(node) {
    if (!node) return '';
    if (node.state === 'locked') {
      // Still show what the stage pays so the path reads clearly
      return shortReward(node) || 'Locked';
    }
    if (node.state === 'cleared') {
      const s = shortReward(node, { replay: true });
      return s ? `Replay ${s}` : 'Replay';
    }
    // here
    const s = shortReward(node);
    return s || 'Play';
  }

  function stageTitle(node) {
    if (!node) return '';
    if (node.isBoss) {
      const name = String(node.bossLoot?.name || node.label || 'Boss');
      return name.length > 16 ? `Boss ${node.stage}` : name;
    }
    return `Lv ${node.stage}`;
  }

  function rewardLineBoss(node) {
    if (!node?.isBoss) return rewardLine(node);
    if (node.state === 'locked') {
      return `${node.bossLoot?.rewardLabel || shortReward(node)} · 🎁`;
    }
    if (node.state === 'cleared') {
      const s = shortReward(node, { replay: true });
      return s ? `Replay ${s}` : 'Replay boss';
    }
    // here — treasure callout
    const stats = node.bossLoot?.rewardLabel || shortReward(node);
    const gems = node.bossLoot?.gemHint || '💎';
    return `${stats} · ${gems}`;
  }

  return (
    <View
      style={[styles.wrap, { height, borderColor: tint + '66' }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 40 && Math.abs(w - width) > 2) setWidth(w);
      }}
    >
      <Text style={[styles.title, { color: tint }]}>
        {chapterInfo?.title || 'The Road'}
      </Text>
      <Text style={styles.sub}>
        {here?.themeName
          ? `${here.themeName} · ${here?.stage || 1}/${nodes.length}`
          : `${here?.stage || 1} / ${nodes.length}`}
      </Text>
      {clearNote ? (
        <Text style={styles.clearNote}>{clearNote}</Text>
      ) : null}

      {/* No full-width play banner — tap the stage stone / chip on the path */}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ height: contentH, width: '100%' }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {width < 40 ? (
          <Text style={styles.sub}>Loading path…</Text>
        ) : (
          <ImageBackground
            source={roadBg}
            style={{ height: contentH, width: '100%' }}
            imageStyle={styles.bgImage}
            resizeMode="cover"
            pointerEvents="box-none"
          >
            <View
              style={[styles.bgTint, { backgroundColor: tint + '38' }]}
              pointerEvents="none"
            />

            {/* —— ROAD LAYER (always under stones / boss / chips) —— */}
            <View style={styles.trailLayer} pointerEvents="none">
              {trailPads.map((p, i) => (
                <View
                  key={`to-${i}`}
                  style={[
                    styles.trailOuter,
                    {
                      width: p.outer,
                      height: p.outer,
                      borderRadius: p.outer / 2,
                      left: p.x - p.outer / 2,
                      top: p.y - p.outer / 2,
                    },
                  ]}
                />
              ))}
              {trailPads.map((p, i) => (
                <View
                  key={`tm-${i}`}
                  style={[
                    styles.trailMid,
                    {
                      width: p.mid,
                      height: p.mid,
                      borderRadius: p.mid / 2,
                      left: p.x - p.mid / 2,
                      top: p.y - p.mid / 2,
                    },
                  ]}
                />
              ))}
              {trailPads.map((p, i) => (
                <View
                  key={`ti-${i}`}
                  style={[
                    styles.trailInner,
                    {
                      width: p.inner,
                      height: p.inner,
                      borderRadius: p.inner / 2,
                      left: p.x - p.inner / 2,
                      top: p.y - p.inner / 2,
                    },
                  ]}
                />
              ))}
            </View>

            {/* —— NODES / BOSS / CHIPS (above road) —— */}
            {points.map(({ x, y, node }) => {
              const isHere = node.state === 'here';
              const cleared = node.state === 'cleared';
              const locked = node.state === 'locked';
              const boss = !!node.isBoss;
              const r = boss ? 28 : 20;
              const zoneStart = node.stage % 10 === 1;
              const labelOnRight = x < width / 2;
              // Boss chips need portrait + treasure line
              const hitW = Math.min(
                boss ? 250 : 230,
                Math.max(boss ? 190 : 168, width * (boss ? 0.6 : 0.55))
              );
              const hitH = boss ? 92 : 72;

              return (
                <View
                  key={node.stage}
                  pointerEvents="box-none"
                  style={styles.nodeLayer}
                >
                  {zoneStart ? (
                    <View
                      pointerEvents="none"
                      style={[styles.zoneBanner, { top: y - 42 }]}
                    >
                      <Text style={styles.zoneText}>
                        {node.themeEmoji ? `${node.themeEmoji} ` : ''}
                        {node.themeName || `Zone ${Math.ceil(node.stage / 10)}`}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    disabled={locked || !onSelectStage}
                    onPress={() => pressNode(node)}
                    style={({ pressed }) => [
                      styles.hitArea,
                      {
                        left: labelOnRight ? x - r - 2 : x - hitW + r + 2,
                        top: y - hitH / 2,
                        width: hitW,
                        height: hitH,
                        opacity: locked ? 0.42 : pressed ? 0.88 : 1,
                        flexDirection: labelOnRight ? 'row' : 'row-reverse',
                      },
                    ]}
                  >
                    {boss ? (
                      <View
                        style={[
                          styles.bossMark,
                          isHere && styles.bossMarkHere,
                          cleared && styles.bossMarkCleared,
                        ]}
                      >
                        <Image
                          source={frontSpriteFor(
                            node.bossArt?.gender || 'boy',
                            node.bossArt?.visualTier || 2,
                            node.label || String(node.stage)
                          )}
                          style={styles.bossPortrait}
                          resizeMode="contain"
                        />
                        <View style={styles.bossBadge}>
                          <Text style={styles.bossBadgeText}>BOSS</Text>
                        </View>
                        <Text style={styles.bossChest} accessible={false}>
                          🎁
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.stone,
                          isHere && styles.stoneHere,
                          cleared && styles.stoneCleared,
                          {
                            width: r * 2,
                            height: r * 2,
                            borderRadius: r,
                            borderColor: isHere ? colors.gold : '#c4a574',
                          },
                        ]}
                      >
                        <Text style={styles.stoneText}>{node.stage}</Text>
                      </View>
                    )}

                    {/* Full reward text — wrap, never "…" */}
                    <View
                      style={[
                        styles.chip,
                        boss && styles.chipBoss,
                        isHere && styles.chipHere,
                        locked && styles.chipLocked,
                        labelOnRight ? { marginLeft: 8 } : { marginRight: 8 },
                      ]}
                    >
                      <Text style={[styles.chipTitle, boss && styles.chipTitleBoss]}>
                        {boss ? `👑 ${stageTitle(node)}` : stageTitle(node)}
                      </Text>
                      <Text
                        style={[
                          styles.chipReward,
                          boss && styles.chipRewardBoss,
                          isHere && { color: colors.gold },
                          cleared && { color: colors.win },
                          locked && { color: 'rgba(245,239,227,0.45)' },
                        ]}
                      >
                        {boss ? rewardLineBoss(node) : rewardLine(node)}
                      </Text>
                      {boss && node.state === 'here' ? (
                        <Text style={styles.chipTap}>Tap · watch ad · fight</Text>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}

            {heroReady.current || points[hereIdx] ? (
              <Animated.View
                style={[
                  styles.hero,
                  {
                    top: Animated.subtract(heroY, 48),
                    left: Animated.subtract(heroX, HERO_W / 2),
                  },
                ]}
                pointerEvents="none"
              >
                <Image
                  source={rear}
                  style={styles.heroImg}
                  resizeMode="contain"
                  // Transparent cutouts only — no box / plate behind the hero
                />
                <View style={styles.youChip}>
                  <Text style={styles.youText}>YOU</Text>
                </View>
              </Animated.View>
            ) : null}
          </ImageBackground>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    flex: 1,
    minHeight: 360,
    backgroundColor: '#1a1208',
  },
  title: {
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  sub: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  clearNote: {
    color: colors.win,
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  scroll: { flex: 1 },
  bgImage: { opacity: 0.45 },
  bgTint: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  /** Continuous packed-earth trail — under everything interactive */
  trailLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    elevation: 1,
  },
  trailOuter: {
    position: 'absolute',
    backgroundColor: 'rgba(42, 28, 14, 0.88)',
  },
  trailMid: {
    position: 'absolute',
    backgroundColor: 'rgba(122, 86, 42, 0.92)',
  },
  trailInner: {
    position: 'absolute',
    backgroundColor: 'rgba(168, 128, 68, 0.55)',
  },
  nodeLayer: {
    zIndex: 20,
    elevation: 8,
  },
  zoneBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 18,
    elevation: 6,
  },
  zoneText: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  hitArea: {
    position: 'absolute',
    zIndex: 40,
    elevation: 12,
    cursor: 'pointer',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  stone: {
    borderWidth: 3,
    backgroundColor: 'rgba(55, 38, 18, 0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 23,
    elevation: 11,
  },
  stoneHere: {
    backgroundColor: 'rgba(100, 70, 12, 0.98)',
  },
  stoneCleared: {
    backgroundColor: 'rgba(22, 55, 32, 0.95)',
  },
  stoneText: {
    color: colors.cream,
    fontWeight: '900',
    fontSize: 12,
  },
  bossMark: {
    width: 58,
    height: 72,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accentHot,
    backgroundColor: 'rgba(40, 12, 16, 0.92)',
    overflow: 'visible',
    paddingBottom: 2,
    zIndex: 24,
    elevation: 12,
  },
  bossMarkHere: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(50, 28, 8, 0.95)',
  },
  bossMarkCleared: {
    borderColor: colors.win,
    opacity: 0.9,
  },
  bossPortrait: {
    width: 52,
    height: 62,
    backgroundColor: 'transparent',
  },
  bossBadge: {
    position: 'absolute',
    top: -8,
    backgroundColor: colors.accentHot,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#1a0508',
  },
  bossBadgeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  bossChest: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    fontSize: 16,
  },
  chip: {
    flexShrink: 1,
    flexGrow: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    zIndex: 25,
    elevation: 14,
  },
  chipBoss: {
    borderColor: 'rgba(251,113,133,0.55)',
    backgroundColor: 'rgba(28, 8, 12, 0.94)',
    minWidth: 128,
  },
  chipHere: {
    borderColor: 'rgba(251,191,36,0.65)',
    backgroundColor: 'rgba(30,18,4,0.94)',
  },
  chipLocked: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chipTitle: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 12,
  },
  chipTitleBoss: {
    color: '#fecdd3',
    fontSize: 12,
  },
  chipReward: {
    color: colors.gem,
    fontWeight: '800',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  chipRewardBoss: {
    color: '#fde68a',
    fontSize: 11,
  },
  chipTap: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 10,
    marginTop: 3,
  },
  hero: {
    position: 'absolute',
    width: HERO_W,
    alignItems: 'center',
    zIndex: 30,
    elevation: 16,
  },
  heroImg: {
    width: HERO_W,
    height: 70,
    backgroundColor: 'transparent',
  },
  youChip: {
    marginTop: -6,
    backgroundColor: colors.gold,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  youText: {
    color: '#1a0a00',
    fontWeight: '900',
    fontSize: 9,
  },
});
