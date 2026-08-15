import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Pressable,
} from 'react-native';
import { colors } from '../lib/theme';

const W = Dimensions.get('window').width;
const CARD_W = 88;
const CARD_GAP = 10;
const STRIDE = CARD_W + CARD_GAP;

/**
 * GAME SHOW pot draw — the fun core.
 * Not Math.random() vibes: pot → your odds → ticket parade → suspense stop → YOU/them.
 */
export default function DrawShow({
  winnerTicketNumber = 1,
  winnerName = '???',
  potAmount = 0,
  potAsset = 'COIN',
  maxTickets = 4,
  tickets = [], // [{ number, displayName, userId, isBot, isYou }]
  heroUserId,
  onDone,
  /** Fired when the result card is up (Continue showing) — parent can hide Skip */
  onResultsReady,
}) {
  const roster = useMemo(() => buildRoster(tickets, maxTickets, heroUserId), [
    tickets,
    maxTickets,
    heroUserId,
  ]);

  const winner = useMemo(() => {
    const n = Math.max(1, Math.min(maxTickets, winnerTicketNumber));
    return roster.find((t) => t.number === n) || roster[0];
  }, [roster, winnerTicketNumber, maxTickets]);

  const yourTickets = roster.filter((t) => t.isYou);
  const yourOdds =
    roster.length > 0 ? Math.round((yourTickets.length / roster.length) * 100) : 0;

  const [phase, setPhase] = useState('pot'); // pot | odds | spin | land | celebrate
  const [cursor, setCursor] = useState(0); // index in extended reel
  const [highlight, setHighlight] = useState(null);

  const potScale = useRef(new Animated.Value(0.5)).current;
  const potGlow = useRef(new Animated.Value(0)).current;
  const reelX = useRef(new Animated.Value(0)).current;
  const landPulse = useRef(new Animated.Value(1)).current;
  const confetti = useRef([...Array(16)].map(() => new Animated.Value(0))).current;
  const timers = useRef([]);

  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };

  // Spin set: full roster when small; sampled when huge (odds still use full roster)
  const spinRoster = useMemo(() => {
    if (roster.length <= 48) return roster;
    // Keep winner, your tickets, plus a spread of others so the reel stays snappy
    const keep = new Map();
    for (const t of roster) {
      if (t.isYou || t.number === winner.number) keep.set(t.number, t);
    }
    const step = Math.max(1, Math.floor(roster.length / 36));
    for (let i = 0; i < roster.length && keep.size < 40; i += step) {
      keep.set(roster[i].number, roster[i]);
    }
    // Fill with neighbors of winner for drama
    for (const t of roster) {
      if (keep.size >= 42) break;
      if (Math.abs(t.number - winner.number) <= 5) keep.set(t.number, t);
    }
    return [...keep.values()].sort((a, b) => a.number - b.number);
  }, [roster, winner.number]);

  // Extended reel for smooth scroll (repeat tickets many times)
  const reel = useMemo(() => {
    const copies = spinRoster.length > 30 ? 5 : 8;
    const arr = [];
    for (let c = 0; c < copies; c++) {
      for (const t of spinRoster) arr.push({ ...t, key: `${c}-${t.number}` });
    }
    return arr;
  }, [spinRoster]);

  useEffect(() => {
    // --- Phase 1: POT reveal ---
    Animated.parallel([
      Animated.spring(potScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(potGlow, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();

    later(() => setPhase('odds'), 1400);

    // --- Phase 2: show your tickets / odds ---
    later(() => {
      setPhase('spin');
      runReel();
    }, 2800);

    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runReel() {
    const centerPad = (W - 32 - CARD_W) / 2;
    const winIdxInRoster = Math.max(
      0,
      spinRoster.findIndex((t) => t.number === winner.number)
    );
    // Your ticket for near-miss theater
    const yourIdx = spinRoster.findIndex((t) => t.isYou);
    const stopIndex = spinRoster.length * 4 + winIdxInRoster;
    const targetX = -(stopIndex * STRIDE - centerPad);

    reelX.setValue(0);

    // Near-miss: crawl across YOUR ticket late in the spin, then land on winner
    let ticks = 0;
    const total = spinRoster.length > 30 ? 48 : 62;
    const nearMissAt = yourIdx >= 0 && !winner.isYou ? Math.floor(total * 0.78) : -1;

    const tickLoop = () => {
      ticks++;
      const progress = ticks / total;
      let ease = 1 - Math.pow(1 - progress, 3);
      // Hold attention on player's ticket briefly
      if (nearMissAt > 0 && ticks >= nearMissAt && ticks < nearMissAt + 6) {
        setHighlight(spinRoster[yourIdx].number);
        setCursor(yourIdx);
        later(tickLoop, 220);
        return;
      }
      const idx = Math.min(stopIndex, Math.floor(ease * stopIndex));
      setCursor(idx % spinRoster.length);
      setHighlight(spinRoster[idx % spinRoster.length]?.number);

      if (ticks < total) {
        let delay = 40;
        if (progress > 0.55) delay = 70;
        if (progress > 0.72) delay = 110;
        if (progress > 0.85) delay = 160;
        if (progress > 0.93) delay = 210;
        later(tickLoop, delay);
      }
    };
    tickLoop();

    Animated.timing(reelX, {
      toValue: targetX,
      duration: spinRoster.length > 30 ? 4400 : 5200,
      easing: Easing.bezier(0.12, 0.9, 0.1, 1),
      useNativeDriver: true,
    }).start(() => {
      setPhase('land');
      setHighlight(winner.number);
      setCursor(winIdxInRoster);

      Animated.sequence([
        Animated.timing(landPulse, { toValue: 1.12, duration: 120, useNativeDriver: true }),
        Animated.spring(landPulse, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();

      if (winner.isYou) {
        confetti.forEach((v, i) => {
          v.setValue(0);
          Animated.timing(v, {
            toValue: 1,
            duration: 1100,
            delay: i * 30,
            useNativeDriver: true,
          }).start();
        });
      }

      // Land on result, then wait for player to hit Continue (no auto-advance)
      later(() => {
        setPhase('celebrate');
        onResultsReady?.();
      }, 1000);
    });
  }

  const assetLabel = potAsset === 'GEM' ? 'GEMS' : 'COINS';

  return (
    <View style={styles.wrap}>
      {/* Confetti if you win */}
      {confetti.map((v, i) => {
        const ang = (i / confetti.length) * Math.PI * 2;
        return (
          <Animated.View
            key={i}
            style={[
              styles.conf,
              {
                backgroundColor: i % 2 ? colors.gold : colors.accentHot,
                opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [
                  {
                    translateX: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.cos(ang) * 120],
                    }),
                  },
                  {
                    translateY: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.sin(ang) * 90 - 30],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}

      {/* POT */}
      <Text style={styles.kicker}>
        {phase === 'pot' && 'THE POT'}
        {phase === 'odds' && 'YOUR SHOT'}
        {phase === 'spin' && 'DRAWING…'}
        {phase === 'land' && 'WINNING TICKET'}
        {phase === 'celebrate' && (winner.isYou ? 'YOU HIT!' : 'TICKET DRAWN')}
      </Text>

      <Animated.View
        style={[
          styles.potOrb,
          {
            transform: [{ scale: potScale }],
            opacity: potGlow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
          },
        ]}
      >
        <Text style={styles.potEmoji}>{potAsset === 'GEM' ? '💎' : '🪙'}</Text>
        <Text style={styles.potAmt}>{Math.round(potAmount)}</Text>
        <Text style={styles.potUnit}>{assetLabel}</Text>
      </Animated.View>

      {/* Odds / your tickets */}
      {(phase === 'odds' || phase === 'spin' || phase === 'land' || phase === 'celebrate') && (
        <View style={styles.oddsBox}>
          {yourTickets.length > 0 ? (
            <>
              <Text style={styles.oddsLine}>
                You hold{' '}
                <Text style={styles.gold}>
                  {yourTickets.map((t) => `#${t.number}`).join(' ')}
                </Text>
              </Text>
              <Text style={styles.oddsSub}>
                {yourTickets.length} of {roster.length} tickets · ~{yourOdds}% chance
                {roster.length >= 100 ? ` · full pit N=${roster.length}` : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.oddsSub}>Watching the draw…</Text>
          )}
        </View>
      )}

      {/* Ticket reel */}
      {(phase === 'spin' || phase === 'land' || phase === 'celebrate') && (
        <View style={styles.reelWindow}>
          <View style={styles.reelCenterMark} />
          <Animated.View
            style={[
              styles.reelTrack,
              { transform: [{ translateX: reelX }], flexDirection: 'row' },
            ]}
          >
            {reel.map((t) => {
              const lit =
                highlight === t.number &&
                (phase === 'spin' || phase === 'land' || phase === 'celebrate');
              const won =
                phase !== 'spin' && t.number === winner.number && phase !== 'odds';
              return (
                <View
                  key={t.key}
                  style={[
                    styles.card,
                    t.isYou && styles.cardYou,
                    lit && styles.cardLit,
                    won && styles.cardWin,
                  ]}
                >
                  <Text style={[styles.cardNum, t.isYou && styles.cardNumYou]}>
                    #{t.number}
                  </Text>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {t.isYou ? '★ YOU' : t.shortName}
                  </Text>
                  {t.isYou ? <Text style={styles.yours}>YOURS</Text> : null}
                </View>
              );
            })}
          </Animated.View>
        </View>
      )}

      {/* Live callout while spinning */}
      {phase === 'spin' && (
        <Text style={styles.live}>
          {highlight
            ? (spinRoster.find((t) => t.number === highlight) ||
                roster.find((t) => t.number === highlight))?.isYou
              ? `★ #${highlight} — that’s YOU…`
              : `#${highlight} · ${(spinRoster.find((t) => t.number === highlight) || roster.find((t) => t.number === highlight))?.shortName || ''}`
            : roster.length > 48
              ? `Drawing from ${roster.length} tickets…`
              : '…'}
        </Text>
      )}

      {/* Final celebration card */}
      {(phase === 'land' || phase === 'celebrate') && (
        <Animated.View style={[styles.finalCard, { transform: [{ scale: landPulse }] }]}>
          <Text style={styles.finalNum}>#{winner.number}</Text>
          <Text style={styles.finalName}>
            {winner.isYou ? '★ YOU WIN THE POT' : winner.displayName}
          </Text>
          {winner.isYou ? (
            <Text style={styles.finalPay}>
              +{Math.round(potAmount)} {assetLabel}
            </Text>
          ) : (
            <Text style={styles.finalMiss}>
              {yourTickets.length
                ? `So close — your ticket${yourTickets.length > 1 ? 's were' : ' was'} ${yourTickets
                    .map((t) => `#${t.number}`)
                    .join(', ')}`
                : `${winner.shortName} takes it`}
            </Text>
          )}
        </Animated.View>
      )}

      {phase === 'pot' && (
        <Text style={styles.hint}>One ticket wins it all…</Text>
      )}

      {phase === 'celebrate' && (
        <Pressable
          style={styles.continueBtn}
          onPress={() => onDone?.()}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      )}
    </View>
  );
}

function buildRoster(tickets, maxTickets, heroUserId) {
  if (tickets && tickets.length) {
    return tickets.map((t) => {
      const num = t.number || t.ticket_number;
      const uid = t.userId || t.user_id;
      const name = t.displayName || t.display_name || 'Player';
      const isBot = !!(t.isBot || t.is_bot);
      const isYou = heroUserId ? uid === heroUserId : !isBot && !!uid;
      return {
        number: num,
        userId: uid,
        displayName: name,
        shortName: isBot ? 'House' : (name || '?').slice(0, 8),
        isBot,
        isYou,
      };
    });
  }
  // fallback fake tickets
  return Array.from({ length: maxTickets }, (_, i) => ({
    number: i + 1,
    userId: `x${i}`,
    displayName: i === 0 ? 'You' : `P${i}`,
    shortName: i === 0 ? 'You' : `P${i}`,
    isBot: i > 0,
    isYou: i === 0,
  }));
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8, width: '100%', minHeight: 420 },
  conf: { position: 'absolute', width: 10, height: 10, borderRadius: 2, top: '40%', zIndex: 20 },
  kicker: {
    color: colors.gold,
    fontWeight: '900',
    letterSpacing: 3,
    fontSize: 14,
    marginBottom: 12,
  },
  potOrb: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(60, 30, 8, 0.95)',
    borderWidth: 4,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 16,
  },
  potEmoji: { fontSize: 28 },
  potAmt: { color: colors.gold, fontSize: 40, fontWeight: '900' },
  potUnit: { color: colors.muted, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  oddsBox: {
    backgroundColor: 'rgba(20,8,40,0.85)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.4)',
    marginBottom: 14,
    alignItems: 'center',
  },
  oddsLine: { color: colors.text, fontWeight: '800', fontSize: 15 },
  oddsSub: { color: colors.muted, fontWeight: '700', fontSize: 12, marginTop: 4 },
  gold: { color: colors.gold },
  reelWindow: {
    width: '100%',
    height: 120,
    overflow: 'hidden',
    marginVertical: 8,
    backgroundColor: 'rgba(10,5,20,0.7)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  reelCenterMark: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.gold,
    zIndex: 5,
    opacity: 0.9,
  },
  reelTrack: {
    paddingVertical: 14,
    paddingLeft: 16,
  },
  card: {
    width: CARD_W,
    height: 92,
    marginRight: CARD_GAP,
    borderRadius: 14,
    backgroundColor: '#1e1435',
    borderWidth: 2,
    borderColor: '#4c3a70',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  cardYou: {
    borderColor: colors.gold,
    backgroundColor: '#3b2a10',
  },
  cardLit: {
    borderColor: '#fff',
    transform: [{ scale: 1.05 }],
  },
  cardWin: {
    borderColor: colors.gold,
    borderWidth: 3,
    backgroundColor: '#4a3210',
  },
  cardNum: { color: colors.accent, fontWeight: '900', fontSize: 22 },
  cardNumYou: { color: colors.gold },
  cardName: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  yours: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 1,
  },
  live: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
    minHeight: 22,
  },
  finalCard: {
    marginTop: 16,
    width: '100%',
    backgroundColor: 'rgba(20,8,40,0.95)',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.gold,
    padding: 18,
    alignItems: 'center',
  },
  finalNum: { color: colors.gold, fontSize: 48, fontWeight: '900' },
  finalName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 6,
    textAlign: 'center',
  },
  finalPay: { color: colors.gold, fontSize: 22, fontWeight: '900', marginTop: 8 },
  finalMiss: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  hint: { color: colors.muted, marginTop: 16, fontWeight: '700' },
  continueBtn: {
    marginTop: 20,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 16,
    minWidth: 200,
    alignItems: 'center',
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  continueText: {
    color: '#1a0f00',
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 1,
  },
});
