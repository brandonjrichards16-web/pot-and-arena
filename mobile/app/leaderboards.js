import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import BackToLobby from '../components/BackToLobby';

const BOARDS = [
  { key: 'players', label: 'Players' },
  { key: 'fame', label: 'Fame' },
  { key: 'pot', label: 'Pot King' },
  { key: 'arena', label: 'Arena' },
];
const PERIODS = [
  { key: 'all', label: 'All-time' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
];

export default function Leaderboards() {
  const router = useRouter();
  const [board, setBoard] = useState('players');
  const [period, setPeriod] = useState('all');
  const [entries, setEntries] = useState([]);
  const [hint, setHint] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .leaderboard(board, period)
      .then((d) => {
        setEntries(d.entries || []);
        setHint(d.hint || '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [board, period]);

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Pressable
        onPress={() => router.replace('/')}
        style={styles.leaveBtn}
        hitSlop={10}
        accessibilityLabel="Leave boards to lobby"
      >
        <BackToLobby label="Lobby" />
      </Pressable>
      <Text style={styles.hint}>
        {hint ||
          (board === 'players'
            ? 'Live roster of real humans — campaign + pits count.'
            : 'Pot/arena scores from finished matches.')}
      </Text>
      <View style={styles.row}>
        {BOARDS.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => setBoard(b.key)}
            style={[styles.chip, board === b.key && styles.chipOn]}
          >
            <Text style={styles.chipText}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
      {board !== 'players' ? (
        <View style={styles.row}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[styles.chip, period === p.key && styles.chipOn]}
            >
              <Text style={styles.chipText}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>
          No scores yet. Finish a pot, bet, or campaign stage — Players board shows heroes who
          checked in.
        </Text>
      ) : (
        entries.map((e) => (
          <View key={e.userId} style={styles.rowItem}>
            <Text style={styles.rank}>#{e.rank}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{e.displayName}</Text>
              <Text style={styles.meta}>
                Lv {e.level}
                {e.matchesPlayed != null ? ` · ${e.matchesPlayed} matches` : ''}
                {e.campaignHigh != null && e.campaignHigh > 0
                  ? ` · road ${e.campaignHigh}`
                  : ''}
                {e.archetype ? ` · ${e.archetype}` : ''}
              </Text>
            </View>
            <Text style={styles.score}>{e.score}</Text>
          </View>
        ))
      )}
      <Pressable
        onPress={() => router.replace('/')}
        style={styles.leaveBottom}
        hitSlop={10}
      >
        <Text style={styles.leaveText}>← Back to lobby</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, backgroundColor: colors.bg, paddingBottom: 40 },
  leaveBtn: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(40,20,50,0.9)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  leaveBottom: {
    marginTop: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: 'rgba(20,12,28,0.9)',
  },
  leaveText: { color: colors.gold, fontWeight: '900', fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, marginBottom: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 12 },
  empty: { color: colors.muted, marginTop: 24, textAlign: 'center', lineHeight: 20 },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  rank: { color: colors.gold, fontWeight: '800', width: 36 },
  name: { color: colors.text, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 11 },
  score: { color: colors.gem, fontWeight: '800' },
});
