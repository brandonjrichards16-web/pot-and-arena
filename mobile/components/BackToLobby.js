import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../lib/theme';

/**
 * Fancy gold pill that returns to the pits lobby.
 * Replaces the bare black circle / floating "Lobby" scraps.
 */
export default function BackToLobby({
  label = 'Lobby',
  onPress,
  style,
  compact = false,
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={onPress || (() => router.replace('/'))}
      hitSlop={10}
      accessibilityLabel="Back to lobby"
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      <View style={styles.arrowWrap}>
        <Text style={styles.arrow}>←</Text>
      </View>
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(40, 24, 8, 0.92)',
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 999,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 14,
    shadowColor: '#fbbf24',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  btnCompact: {
    paddingVertical: 5,
    paddingLeft: 6,
    paddingRight: 10,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  arrowWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(251, 191, 36, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 14,
    marginTop: -1,
  },
  label: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  labelCompact: {
    fontSize: 11,
  },
});
