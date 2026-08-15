import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

/** Top-corner currency chips — every casual game has these */
export default function ResourcePills({ coins = 0, gems = 0 }) {
  return (
    <View style={styles.row}>
      <View style={[styles.pill, styles.coin]}>
        <Text style={styles.icon}>🪙</Text>
        <Text style={styles.val}>{Math.floor(coins)}</Text>
      </View>
      <View style={[styles.pill, styles.gem]}>
        <Text style={styles.icon}>💎</Text>
        <Text style={styles.val}>{Math.floor(gems)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  coin: {
    backgroundColor: '#422006',
    borderColor: colors.gold,
  },
  gem: {
    backgroundColor: '#083344',
    borderColor: colors.gem,
  },
  icon: { fontSize: 14 },
  val: { color: '#fff', fontWeight: '900', fontSize: 15, minWidth: 28 },
});
