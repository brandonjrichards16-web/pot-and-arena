import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Visual duel: two fighters, HP bars, animated hits from duel log.
 */
export default function FightShow({
  leftName = 'You',
  rightName = 'Foe',
  leftMaxHp = 30,
  rightMaxHp = 30,
  lines = [],
  winnerName,
  onDone,
}) {
  const [leftHp, setLeftHp] = useState(leftMaxHp);
  const [rightHp, setRightHp] = useState(rightMaxHp);
  const [banner, setBanner] = useState('FIGHT!');
  const [logLine, setLogLine] = useState('');
  const [phase, setPhase] = useState('intro'); // intro | fight | end

  const leftX = useRef(new Animated.Value(0)).current;
  const rightX = useRef(new Animated.Value(0)).current;
  const leftFlash = useRef(new Animated.Value(0)).current;
  const rightFlash = useRef(new Animated.Value(0)).current;
  const slam = useRef(new Animated.Value(1)).current;
  const vsPulse = useRef(new Animated.Value(1)).current;
  const leftHpAnim = useRef(new Animated.Value(1)).current;
  const rightHpAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(vsPulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
        Animated.timing(vsPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();

    // Intro beat
    setBanner('⚔️ ARENA');
    const t0 = setTimeout(() => {
      setPhase('fight');
      setBanner('FIGHT!');
      playSequence();
    }, 900);

    return () => clearTimeout(t0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function lunge(side) {
    const anim = side === 'left' ? leftX : rightX;
    Animated.sequence([
      Animated.timing(anim, {
        toValue: side === 'left' ? 28 : -28,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function flash(side) {
    const anim = side === 'left' ? leftFlash : rightFlash;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function hitSlam() {
    Animated.sequence([
      Animated.timing(slam, { toValue: 1.04, duration: 50, useNativeDriver: true }),
      Animated.timing(slam, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  }

  function applyHp(side, ratio) {
    const anim = side === 'left' ? leftHpAnim : rightHpAnim;
    Animated.timing(anim, {
      toValue: Math.max(0, ratio),
      duration: 280,
      useNativeDriver: false,
    }).start();
  }

  function playSequence() {
    const events = lines.length
      ? lines
      : [{ t: 'hit', text: 'Clash!' }, { t: 'end', text: `${winnerName} wins!` }];

    let i = 0;
    let lHp = leftMaxHp;
    let rHp = rightMaxHp;

    const tick = () => {
      if (i >= events.length) {
        // Wait for Continue — do not auto-advance past fight results
        setPhase('end');
        setBanner(winnerName ? `${winnerName} WINS!` : 'DRAW');
        return;
      }
      const ev = events[i];
      i += 1;
      setLogLine(ev.text || '');

      const text = (ev.text || '').toLowerCase();
      const t = ev.t || '';

      // Parse HP from log when present: "→ HP 8/30"
      const hpMatch = (ev.text || '').match(/HP\s+(\d+)\/(\d+)/i);
      const whoHit = text.includes(leftName.toLowerCase())
        ? text.indexOf(leftName.toLowerCase()) < text.indexOf(rightName.toLowerCase())
          ? 'left'
          : 'right'
        : null;

      if (t === 'block' || text.includes('block')) {
        setBanner('BLOCK!');
        flash(text.includes(leftName.toLowerCase()) ? 'left' : 'right');
      } else if (t === 'crit' || text.includes('crit')) {
        setBanner('CRIT!');
        hitSlam();
        lunge(whoHit === 'right' ? 'left' : 'right');
        flash(whoHit === 'left' ? 'right' : 'left');
      } else if (t === 'insta' || text.includes('insta')) {
        setBanner('💀 INSTA!');
        hitSlam();
        lunge('left');
        lunge('right');
        flash('left');
        flash('right');
      } else if (t === 'hit' || text.includes('hits')) {
        setBanner('HIT!');
        // Attacker is first name before "hits"
        const hitsIdx = text.indexOf('hits');
        const attackerIsLeft =
          hitsIdx > 0 && text.slice(0, hitsIdx).includes(leftName.toLowerCase());
        lunge(attackerIsLeft ? 'left' : 'right');
        flash(attackerIsLeft ? 'right' : 'left');
        hitSlam();
      } else if (t === 'end' || text.includes('winner')) {
        setBanner('FINISH!');
      }

      if (hpMatch) {
        const cur = Number(hpMatch[1]);
        const max = Number(hpMatch[2]);
        // Whose HP? the defender after hit — name before → HP
        const before = (ev.text || '').split('→')[0] || '';
        if (before.toLowerCase().includes(leftName.toLowerCase())) {
          lHp = cur;
          setLeftHp(cur);
          applyHp('left', cur / (max || leftMaxHp));
        } else if (before.toLowerCase().includes(rightName.toLowerCase())) {
          rHp = cur;
          setRightHp(cur);
          applyHp('right', cur / (max || rightMaxHp));
        } else {
          // fallback alternate damage visual
          if (t === 'hit' || t === 'crit') {
            rHp = Math.max(0, rHp - 5);
            setRightHp(rHp);
            applyHp('right', rHp / rightMaxHp);
          }
        }
      }

      setTimeout(tick, t === 'end' ? 700 : 650);
    };

    setTimeout(tick, 400);
  }

  const leftHpWidth = leftHpAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const rightHpWidth = rightHpAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale: slam }] }]}>
      <Text style={styles.banner}>{banner}</Text>

      <View style={styles.arena}>
        {/* Left fighter */}
        <Animated.View style={[styles.fighter, { transform: [{ translateX: leftX }] }]}>
          <Animated.View
            style={[
              styles.flash,
              { backgroundColor: colors.danger, opacity: leftFlash },
            ]}
          />
          <View style={[styles.avatar, styles.avatarLeft]}>
            <Text style={styles.avatarEmoji}>🗡️</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {leftName}
          </Text>
          <View style={styles.hpTrack}>
            <Animated.View style={[styles.hpFill, styles.hpLeft, { width: leftHpWidth }]} />
          </View>
          <Text style={styles.hpText}>
            {Math.max(0, Math.round(leftHp))}/{leftMaxHp}
          </Text>
        </Animated.View>

        <Animated.Text style={[styles.vs, { transform: [{ scale: vsPulse }] }]}>VS</Animated.Text>

        {/* Right fighter */}
        <Animated.View style={[styles.fighter, { transform: [{ translateX: rightX }] }]}>
          <Animated.View
            style={[
              styles.flash,
              { backgroundColor: colors.accent, opacity: rightFlash },
            ]}
          />
          <View style={[styles.avatar, styles.avatarRight]}>
            <Text style={styles.avatarEmoji}>🛡️</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {rightName}
          </Text>
          <View style={styles.hpTrack}>
            <Animated.View style={[styles.hpFill, styles.hpRight, { width: rightHpWidth }]} />
          </View>
          <Text style={styles.hpText}>
            {Math.max(0, Math.round(rightHp))}/{rightMaxHp}
          </Text>
        </Animated.View>
      </View>

      <View style={styles.logBox}>
        <Text style={styles.logText}>{logLine || (phase === 'intro' ? 'Warriors enter the arena...' : '...')}</Text>
      </View>

      {phase === 'end' ? (
        <>
          <Text style={styles.endNote}>Full combat log available below ↓</Text>
          <Pressable
            style={styles.continueBtn}
            onPress={() => onDone?.()}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  banner: {
    textAlign: 'center',
    color: colors.gold,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 2,
    marginBottom: 12,
  },
  arena: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0e18',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#2a3350',
    padding: 14,
    minHeight: 200,
  },
  fighter: { flex: 1, alignItems: 'center' },
  flash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    marginBottom: 8,
  },
  avatarLeft: { backgroundColor: '#1e1a3a', borderColor: colors.accent },
  avatarRight: { backgroundColor: '#1a2a2a', borderColor: colors.gem },
  avatarEmoji: { fontSize: 40 },
  name: { color: colors.text, fontWeight: '800', fontSize: 13, maxWidth: 120 },
  hpTrack: {
    width: '100%',
    height: 10,
    backgroundColor: '#1a2030',
    borderRadius: 99,
    marginTop: 8,
    overflow: 'hidden',
  },
  hpFill: { height: 10, borderRadius: 99 },
  hpLeft: { backgroundColor: colors.accent },
  hpRight: { backgroundColor: colors.gem },
  hpText: { color: colors.muted, fontSize: 11, marginTop: 4, fontWeight: '700' },
  vs: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 18,
    marginHorizontal: 6,
  },
  logBox: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: 52,
    justifyContent: 'center',
  },
  logText: { color: colors.text, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  endNote: { color: colors.muted, textAlign: 'center', marginTop: 10, fontSize: 12 },
  continueBtn: {
    marginTop: 16,
    alignSelf: 'center',
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
});
