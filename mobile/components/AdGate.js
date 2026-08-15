import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Modal, Pressable } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Mock rewarded ad(s). Supports multi-ad tickets (count = ads per ticket).
 * Fires onComplete only after all ads in the set finish.
 */
export default function AdGate({
  visible,
  onComplete,
  onCancel,
  /** How many ads must play for this ticket (1, 2, 3, 5, 10) */
  count = 1,
}) {
  const total = Math.max(1, Math.min(10, Math.floor(Number(count) || 1)));
  const [pct, setPct] = useState(0);
  const [adIndex, setAdIndex] = useState(1); // 1-based current ad
  const width = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(1)).current;
  const finished = useRef(false);

  useEffect(() => {
    if (!visible) {
      setPct(0);
      setAdIndex(1);
      width.setValue(0);
      finished.current = false;
      return;
    }

    finished.current = false;
    setAdIndex(1);
    setPct(0);
    width.setValue(0);

    Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1.05, duration: 400, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();

    let current = 1;
    let p = 0;
    const id = setInterval(() => {
      p += total > 3 ? 6 : 4; // slightly faster for long multi-ad sets
      setPct(Math.min(100, p));
      Animated.timing(width, {
        toValue: Math.min(100, p),
        duration: 70,
        useNativeDriver: false,
      }).start();

      if (p >= 100) {
        if (current >= total) {
          clearInterval(id);
          if (!finished.current) {
            finished.current = true;
            setTimeout(() => onComplete?.(total), 280);
          }
        } else {
          // Next ad in the set
          current += 1;
          setAdIndex(current);
          p = 0;
          setPct(0);
          width.setValue(0);
        }
      }
    }, total > 5 ? 55 : 90);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, total]);

  const barW = width.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Animated.Text style={[styles.adIcon, { transform: [{ scale: bounce }] }]}>
            📺
          </Animated.Text>
          <Text style={styles.title}>
            {total > 1 ? `Watching ad ${adIndex} of ${total}` : 'Watching rewarded ad…'}
          </Text>
          <Text style={styles.sub}>
            {total > 1
              ? `Ad ${total} per ticket · pot pays ×${total}`
              : 'Watch to continue'}
          </Text>
          {total > 1 ? (
            <View style={styles.dots}>
              {Array.from({ length: total }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i + 1 < adIndex && styles.dotDone,
                    i + 1 === adIndex && styles.dotOn,
                  ]}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: barW }]} />
          </View>
          <Text style={styles.pct}>{pct}%</Text>
          <Pressable onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  adIcon: { fontSize: 56, marginBottom: 8 },
  title: { color: colors.text, fontWeight: '800', fontSize: 18, textAlign: 'center' },
  sub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, justifyContent: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2a2038',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  dotOn: { backgroundColor: colors.gem, borderColor: colors.gem },
  dotDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  track: {
    width: '100%',
    height: 12,
    backgroundColor: '#0f1422',
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: { height: 12, backgroundColor: colors.gem },
  pct: { color: colors.gem, fontWeight: '800', marginTop: 10 },
  cancel: { marginTop: 16 },
  cancelText: { color: colors.muted },
});
