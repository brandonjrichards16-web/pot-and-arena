import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../lib/theme';
import JuicyButton from './JuicyButton';

const BANNERS = {
  DOUBLE_CROWN: { title: '👑 DOUBLE CROWN', sub: 'Pot + Pit. Absolute unit.', color: colors.gold },
  POT_KING: { title: '🪙 YOU TOOK THE POT', sub: 'Luck loved you.', color: colors.gold },
  PIT_CHAMP: { title: '⚔️ YOU TOOK THE PIT', sub: 'You brawled them down.', color: colors.gem },
  FOUGHT_HARD: { title: '🔥 FOUGHT HARD', sub: 'Still paid. Always.', color: colors.accentHot },
};

/**
 * Post-fight reward theater — the missing act that makes every PLAY feel paid.
 */
export default function LootCeremony({
  earned = {},
  heroStats,
  potName,
  pitName,
  onAgain,
  onUpgrade,
}) {
  const outcome = earned.outcome || 'FOUGHT_HARD';
  const banner = BANNERS[outcome] || BANNERS.FOUGHT_HARD;

  const [coinShow, setCoinShow] = useState(0);
  const [gemShow, setGemShow] = useState(0);
  const [xpShow, setXpShow] = useState(0);
  const [phase, setPhase] = useState(0); // 0 banner, 1 loot, 2 level, 3 done

  const slam = useRef(new Animated.Value(0.4)).current;
  const xpW = useRef(new Animated.Value(0)).current;

  const coins = Math.round(earned.coins || 0);
  const gems = Math.round(earned.gems || 0);
  const xp = Math.round(earned.xp || 0);

  useEffect(() => {
    Animated.spring(slam, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    const t1 = setTimeout(() => setPhase(1), 500);
    // count-up
    const steps = 12;
    let i = 0;
    const tick = setInterval(() => {
      i++;
      const p = i / steps;
      setCoinShow(Math.round(coins * p));
      setGemShow(Math.round(gems * p));
      setXpShow(Math.round(xp * p));
      if (i >= steps) clearInterval(tick);
    }, 40);
    Animated.timing(xpW, {
      toValue: Math.min(1, xp / 40),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    const t2 = setTimeout(() => {
      if (earned.leveledUp) setPhase(2);
      else setPhase(3);
    }, 1400);
    const t3 = setTimeout(() => setPhase(3), earned.leveledUp ? 2800 : 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(tick);
    };
  }, []);

  const barW = xpW.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.banner, { borderColor: banner.color, transform: [{ scale: slam }] }]}>
        <Text style={[styles.bannerTitle, { color: banner.color }]}>{banner.title}</Text>
        <Text style={styles.bannerSub}>{banner.sub}</Text>
      </Animated.View>

      {phase >= 1 && (
        <View style={styles.lootBox}>
          <Text style={styles.lootHead}>MATCH LOOT</Text>
          <View style={styles.row}>
            <Text style={styles.lootEmoji}>🪙</Text>
            <Text style={styles.lootVal}>+{coinShow}</Text>
            <Text style={styles.lootLabel}>coins</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lootEmoji}>💎</Text>
            <Text style={[styles.lootVal, { color: colors.gem }]}>+{gemShow}</Text>
            <Text style={styles.lootLabel}>gems</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.lootEmoji}>⭐</Text>
            <Text style={[styles.lootVal, { color: colors.accent }]}>+{xpShow}</Text>
            <Text style={styles.lootLabel}>xp</Text>
          </View>
          <View style={styles.xpTrack}>
            <Animated.View style={[styles.xpFill, { width: barW }]} />
          </View>
          {heroStats ? (
            <Text style={styles.brag}>
              You dealt {heroStats.damageDealt} dmg · {heroStats.hitsLanded} hits
            </Text>
          ) : null}
          {(earned.gearDrops?.length || earned.gearDropLabel) ? (
            <View style={styles.gearDropBox}>
              <Text style={styles.gearDropHead}>🎁 GEAR DROP</Text>
              {earned.gearDrops?.length
                ? earned.gearDrops.map((d, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.gearDropLine,
                        d.color ? { color: d.color } : null,
                      ]}
                    >
                      {d.label || `${d.emoji} ${d.name} T${d.tier}`}
                      {d.detail ? ` · ${d.detail}` : ''}
                    </Text>
                  ))
                : (
                  <Text style={styles.gearDropLine}>{earned.gearDropLabel}</Text>
                )}
              <Text style={styles.gearDropHint}>
                Auto-equipped if best · see Upgrade → Gear
              </Text>
            </View>
          ) : null}
          {earned.rankAfter != null || earned.firstOnBoard ? (
            <Text style={styles.rankLine}>
              {earned.firstOnBoard
                ? `📈 On the board · #${earned.rankAfter}`
                : `Weekly #${earned.rankBefore ?? '—'} → #${earned.rankAfter ?? '—'}${
                    earned.rankDelta > 0
                      ? `  ↑${earned.rankDelta}`
                      : earned.rankDelta < 0
                        ? `  ↓${Math.abs(earned.rankDelta)}`
                        : ''
                  }`}
            </Text>
          ) : null}
        </View>
      )}

      {phase === 2 && earned.leveledUp && (
        <View style={styles.levelUp}>
          <Text style={styles.levelTitle}>LEVEL UP!</Text>
          <Text style={styles.levelNum}>
            {earned.oldLevel} → {earned.newLevel}
          </Text>
          <Text style={styles.levelStats}>+1 Power · +2 Vitality · +1 Speed</Text>
        </View>
      )}

      {phase >= 3 && (
        <>
          <Text style={styles.footer}>
            Pot: {potName || '—'} · Pit: {pitName || '—'}
          </Text>
          <JuicyButton label="▶ PLAY AGAIN" onPress={onAgain} style={{ marginTop: 16 }} />
          {onUpgrade && gems > 0 ? (
            <Text style={styles.upgradeLink} onPress={onUpgrade}>
              Spend gems → Upgrade
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 12, width: '100%' },
  banner: {
    width: '100%',
    backgroundColor: 'rgba(20,8,40,0.9)',
    borderRadius: 20,
    borderWidth: 3,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  bannerTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  bannerSub: { color: colors.muted, marginTop: 6, fontWeight: '700' },
  lootBox: {
    width: '100%',
    backgroundColor: 'rgba(15,8,30,0.88)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 16,
    marginBottom: 12,
  },
  lootHead: {
    color: colors.gold,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  lootEmoji: { fontSize: 26, width: 36 },
  lootVal: { color: colors.gold, fontSize: 28, fontWeight: '900', minWidth: 70 },
  lootLabel: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  xpTrack: {
    height: 10,
    backgroundColor: '#0a0614',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 6,
  },
  xpFill: { height: 10, backgroundColor: colors.accent },
  brag: { color: colors.cream, textAlign: 'center', marginTop: 12, fontWeight: '700' },
  gearDropBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: 'rgba(40, 28, 8, 0.65)',
    alignItems: 'center',
  },
  gearDropHead: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 6,
  },
  gearDropLine: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 2,
  },
  gearDropHint: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  rankLine: {
    color: colors.gold,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '900',
    fontSize: 15,
  },
  levelUp: {
    width: '100%',
    backgroundColor: '#3b1d6e',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.accent,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  levelTitle: { color: colors.gold, fontWeight: '900', fontSize: 22, letterSpacing: 2 },
  levelNum: { color: colors.text, fontWeight: '900', fontSize: 36, marginVertical: 8 },
  levelStats: { color: colors.muted, fontWeight: '700' },
  footer: { color: colors.muted, fontSize: 12, marginTop: 8, textAlign: 'center' },
  upgradeLink: {
    color: colors.gem,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
});
