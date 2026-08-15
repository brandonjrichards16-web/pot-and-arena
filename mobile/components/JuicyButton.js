import { useEffect, useRef } from 'react';
import { Pressable, Text, StyleSheet, Animated, View } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Primary CTA.
 * size: 'lg' (lobby default) | 'md' | 'sm' (store / inline)
 * Never force ellipsis on long labels — wrap or shrink so text stays readable.
 */
export default function JuicyButton({
  label = 'PLAY',
  onPress,
  disabled,
  color = 'hot',
  style,
  size = 'lg',
  bounce: allowBounce = true,
}) {
  const bounce = useRef(new Animated.Value(1)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const compact = size === 'sm' || size === 'md';
  const labelStr = String(label ?? '');
  // Long lobby labels (or explicit \n) get multi-line + slightly smaller type
  const multiLine = labelStr.includes('\n') || labelStr.length > 14;

  useEffect(() => {
    if (!allowBounce || compact) {
      bounce.setValue(1);
      return;
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1.04,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(shine, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(shine, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [allowBounce, compact]);

  const bg =
    color === 'gold' ? colors.gold : color === 'gem' ? colors.gem : colors.accentHot;
  const textColor = color === 'gem' || color === 'gold' ? '#1a0a00' : '#fff';

  const sizeStyle =
    size === 'sm' ? styles.btnSm : size === 'md' ? styles.btnMd : styles.btnLg;
  const labelStyle =
    size === 'sm'
      ? styles.labelSm
      : size === 'md'
        ? styles.labelMd
        : multiLine
          ? styles.labelLgWrap
          : styles.labelLg;

  return (
    <Animated.View
      style={[{ transform: [{ scale: bounce }], alignSelf: 'stretch' }, style]}
    >
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          sizeStyle,
          multiLine && !compact && styles.btnLgTall,
          { backgroundColor: bg, opacity: disabled ? 0.55 : 1 },
          pressed && { transform: [{ scale: 0.97 }] },
        ]}
      >
        {!compact ? <View style={styles.topShine} /> : null}
        {!compact ? (
          <Animated.View
            style={[
              styles.sweep,
              {
                opacity: shine.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 0.5, 0],
                }),
                transform: [
                  {
                    translateX: shine.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-80, 220],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        <Text
          style={[labelStyle, { color: textColor }]}
          // Full label always visible — wrap instead of "…"
          numberOfLines={compact ? 2 : multiLine ? 3 : 2}
        >
          {label}
        </Text>
        {!compact ? <View style={styles.bottomEdge} /> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    overflow: 'hidden',
  },
  btnLg: {
    minWidth: 0,
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 3,
  },
  btnLgTall: {
    paddingVertical: 14,
    borderRadius: 22,
  },
  btnMd: {
    minWidth: 0,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnSm: {
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'auto',
  },
  topShine: {
    position: 'absolute',
    top: 4,
    left: 20,
    right: 20,
    height: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ rotate: '18deg' }],
  },
  labelLg: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 2,
  },
  labelLgWrap: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 2,
  },
  labelMd: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  labelSm: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  bottomEdge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
});
