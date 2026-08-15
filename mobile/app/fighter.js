import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import BackToLobby from '../components/BackToLobby';

/** Internal keys → clear combat labels */
const STATS = [
  { id: 'power', label: 'ATK (Attack)' },
  { id: 'vitality', label: 'HP (Hit Points)' },
  { id: 'guard', label: 'DEF (Defense)' },
  { id: 'speed', label: 'SPD (Speed)' },
  { id: 'luck', label: 'LUCK' },
];
const ARCH = ['striker', 'tank', 'rogue', 'support', 'jester'];
const STYLES = ['dice', 'spinner', 'terminal', 'crystal', 'plinko'];

export default function FighterScreen() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const { user, balances } = me;

  async function upgrade(stat) {
    try {
      const res = await api.upgrade(stat);
      setMe((m) => ({ ...m, user: res.user, balances: res.balances }));
    } catch (e) {
      Alert.alert('Upgrade failed', e.message);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <View style={{ marginBottom: 10 }}>
        <BackToLobby />
      </View>
      <Text style={[styles.title, { textAlign: 'center' }]}>{user.displayName}</Text>
      <Text style={styles.meta}>
        Lv {user.level} · XP {user.xp} · 💎 {Math.floor(balances.GEM)}
      </Text>

      <Text style={styles.section}>Archetype</Text>
      <View style={styles.row}>
        {ARCH.map((a) => (
          <Pressable
            key={a}
            style={[styles.chip, user.archetype === a && styles.chipOn]}
            onPress={async () => {
              const res = await api.patchMe({ archetype: a });
              setMe((m) => ({ ...m, user: res.user }));
            }}
          >
            <Text style={styles.chipText}>{a}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Draw style</Text>
      <View style={styles.row}>
        {STYLES.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, user.drawStyle === s && styles.chipOn]}
            onPress={async () => {
              const res = await api.patchMe({ drawStyle: s });
              setMe((m) => ({ ...m, user: res.user }));
            }}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Stats (5 💎 each) — clear combat numbers</Text>
      {STATS.map((s) => (
        <View key={s.id} style={styles.statRow}>
          <Text style={styles.statName}>{s.label}</Text>
          <Text style={styles.statVal}>
            {user.stats?.[s.label.split(' ')[0]] ?? user.stats?.[s.id] ?? 0}
          </Text>
          <Pressable style={styles.upBtn} onPress={() => upgrade(s.id)}>
            <Text style={styles.upText}>+1 {s.label.split(' ')[0]}</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 16, backgroundColor: colors.bg, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: colors.muted, marginBottom: 16 },
  section: { color: colors.text, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statName: { color: colors.text, flex: 1, textTransform: 'capitalize', fontWeight: '600' },
  statVal: { color: colors.gem, fontWeight: '800', marginRight: 12, width: 36, textAlign: 'right' },
  upBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  upText: { color: '#fff', fontWeight: '800' },
});
