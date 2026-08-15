import { useEffect, useRef } from 'react';
import { View, Image, Text, StyleSheet, Animated, Platform } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Premium hero showcase — full-body painted warrior.
 * NO fake 3D squash-spin (that made the hero look like crap).
 * Soft idle float + ground glow so it feels alive on the lobby stage.
 */
export default function SpinCharacter({ source, size = 340, style }) {
  const bob = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.55)).current;

  const figW = size;
  const figH = Math.round(size * 1.12);

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: -8,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.95,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    bobLoop.start();
    glowLoop.start();
    return () => {
      bobLoop.stop();
      glowLoop.stop();
    };
  }, [bob, pulse]);

  return (
    <View style={[styles.wrap, { width: figW + 24, height: figH + 48 }, style]}>
      {/* Soft under-glow (arena spotlight) */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: figW * 0.72,
            height: 36,
            opacity: pulse,
          },
        ]}
      />
      <View style={[styles.pedestal, { width: figW * 0.58 }]} />

      <Animated.View
        style={[
          styles.figure,
          {
            width: figW,
            height: figH,
            transform: [{ translateY: bob }],
          },
        ]}
      >
        <Image
          source={source}
          style={{
            width: figW,
            height: figH,
            // @ts-ignore web
            userSelect: 'none',
            ...(Platform.OS === 'web'
              ? {
                  filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.55))',
                }
              : null),
          }}
          resizeMode="contain"
        />
      </Animated.View>

      <Text style={styles.hint}>Your fighter</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  figure: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  pedestal: {
    position: 'absolute',
    bottom: 22,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 4, 22, 0.92)',
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.65)',
    zIndex: 1,
    // soft outer ring
    shadowColor: '#fbbf24',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  glow: {
    position: 'absolute',
    bottom: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.45)',
    zIndex: 0,
  },
  hint: {
    position: 'absolute',
    bottom: 0,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
