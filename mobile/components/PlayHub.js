import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import FunShell from './FunShell';
import JuicyButton from './JuicyButton';
import BackToLobby from './BackToLobby';

const GEM_OPTIONS = [1, 2, 5, 10, 25];

/**
 * Random / PvP hub:
 * - Join any open room (any N)
 * - Create only up to unlocked maxCreateN (5 → 10 → 50 → 100 → 1000)
 */
export default function PlayHub({ mode = 'random' }) {
  const router = useRouter();
  const [rooms, setRooms] = useState([]);
  const [unlocks, setUnlocks] = useState(null);
  const [n, setN] = useState(5);
  const [gemStake, setGemStake] = useState(2);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const isPvp = mode === 'pvp';

  const maxCreateN = unlocks?.maxCreateN ?? 5;

  const nOptions = useMemo(() => {
    const ladder = [5, 10, 50, 100, 1000];
    return ladder.map((size) => ({
      size,
      unlocked: size <= maxCreateN,
    }));
  }, [maxCreateN]);

  const load = useCallback(async () => {
    try {
      const [data, u] = await Promise.all([api.rooms(), api.roomUnlocks()]);
      let list = data.rooms || [];
      if (isPvp) list = list.filter((r) => r.entry_type === 'GEM');
      else list = list.filter((r) => r.entry_type === 'FREE' || r.entry_type === 'AD');
      setRooms(list);
      setUnlocks(u);
      setN((prev) => Math.min(prev, u.maxCreateN || 5));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [isPvp]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (n > maxCreateN) {
      Alert.alert('Locked', `You can only create pits up to N=${maxCreateN}. Unlock more below.`);
      return;
    }
    setBusy(true);
    try {
      const room = await api.createCustomRoom({
        mode: isPvp ? 'pvp' : 'random',
        n,
        gemStake: isPvp ? gemStake : 0,
      });
      router.push(`/room/${room.id}`);
    } catch (e) {
      Alert.alert('Could not create', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function buyUnlock() {
    setBusy(true);
    try {
      const res = await api.buyRoomUnlock();
      Alert.alert('Unlocked!', `${res.label} — you can create up to N=${res.unlockedMaxN}`);
      await load();
    } catch (e) {
      Alert.alert('Not yet', e.message);
    } finally {
      setBusy(false);
    }
  }

  const next = unlocks?.ladder?.find((t) => t.isNext);

  return (
    <FunShell dim>
    <ScrollView
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold} />
      }
    >
      <View style={{ marginBottom: 10 }}>
        <BackToLobby />
      </View>
      <Text style={[styles.title, { textAlign: 'center' }]}>
        {isPvp ? 'PvP battles' : 'Random play'}
      </Text>
      <Text style={[styles.sub, { textAlign: 'center' }]}>
        {isPvp
          ? 'Humans only. Join any pit — or create one if you’ve unlocked that size.'
          : 'Join any pit. Creating larger pits is an unlock (gems + playtime).'}
      </Text>

      <View style={styles.capBanner}>
        <Text style={styles.capLabel}>YOUR CREATE LIMIT</Text>
        <Text style={styles.capVal}>N ≤ {maxCreateN}</Text>
        <Text style={styles.capHint}>
          Matches {unlocks?.matchesPlayed ?? 0} · Upgrades {unlocks?.upgradePoints ?? 0} · 💎{' '}
          {Math.floor(unlocks?.gems ?? 0)}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start your own</Text>
        <Text style={styles.label}>Pit size (N)</Text>
        <View style={styles.chips}>
          {nOptions.map(({ size, unlocked }) => (
            <Pressable
              key={size}
              onPress={() => {
                if (!unlocked) {
                  Alert.alert(
                    'Locked',
                    `Create limit is ${maxCreateN}. Unlock N=${size} with gems + requirements.`
                  );
                  return;
                }
                setN(size);
              }}
              style={[
                styles.chip,
                n === size && unlocked && styles.chipOn,
                !unlocked && styles.chipLocked,
              ]}
            >
              <Text style={[styles.chipText, !unlocked && styles.chipTextLocked]}>
                {unlocked ? size : `🔒 ${size}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {isPvp ? (
          <>
            <Text style={styles.label}>Gem bet each ticket</Text>
            <View style={styles.chips}>
              {GEM_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setGemStake(opt)}
                  style={[styles.chip, gemStake === opt && styles.chipOnGem]}
                >
                  <Text style={styles.chipText}>💎 {opt}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {busy ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <JuicyButton
            label={isPvp ? `CREATE ×${n} · ${gemStake}💎` : `CREATE ×${n}`}
            onPress={create}
            color="hot"
            style={{ marginTop: 8, alignSelf: 'center' }}
          />
        )}
      </View>

      {/* Unlock ladder */}
      <Text style={styles.section}>🔓 Unlock larger creates</Text>
      <Text style={styles.unlockBlurb}>
        You can always *join* big pits. *Hosting* huge ones is earned — not free.
      </Text>
      {(unlocks?.ladder || []).map((t) => (
        <View
          key={t.maxN}
          style={[styles.unlockRow, t.unlocked && styles.unlockDone, t.isNext && styles.unlockNext]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.unlockTitle}>
              {t.unlocked ? '✓' : t.isNext ? '▶' : '·'} N={t.maxN} · {t.label}
            </Text>
            {!t.unlocked ? (
              <Text style={styles.unlockReq}>
                💎 {t.gemCost}
                {t.matches ? ` · ${t.matches} matches` : ''}
                {t.upgradePoints ? ` · ${t.upgradePoints} upgrade ranks` : ''}
                {t.requirementHint ? `\n${t.requirementHint}` : ''}
              </Text>
            ) : (
              <Text style={styles.unlockReq}>Unlocked</Text>
            )}
          </View>
          {t.isNext ? (
            <Pressable
              style={[styles.unlockBtn, !t.requirementsMet && styles.unlockBtnDim]}
              disabled={busy || !t.requirementsMet}
              onPress={buyUnlock}
            >
              <Text style={styles.unlockBtnText}>
                {t.requirementsMet ? `Buy 💎${t.gemCost}` : 'Locked'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {next && !next.requirementsMet ? (
        <Text style={styles.nextHint}>
          Next unlock N={next.maxN}: keep playing and upgrading, then pay 💎{next.gemCost}.
        </Text>
      ) : null}

      <Text style={[styles.section, { marginTop: 18 }]}>Join existing</Text>
      {loading ? (
        <ActivityIndicator color={colors.gold} />
      ) : rooms.length === 0 ? (
        <Text style={styles.empty}>No open rooms — start a small one above.</Text>
      ) : (
        rooms.map((r) => (
          <Pressable
            key={r.id}
            style={styles.room}
            onPress={() => router.push(`/room/${r.id}`)}
          >
            <View style={styles.roomTop}>
              <Text style={styles.roomTitle}>{r.title}</Text>
              <Text style={styles.pill}>
                {r.tickets_sold}/{r.n}
              </Text>
            </View>
            <Text style={styles.meta}>
              {r.entry_type}
              {r.entry_type === 'GEM' ? ` · ${r.stake}💎` : ''}
              {r.allows_house ? ' · House OK' : ' · humans only'}
            </Text>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, (r.tickets_sold / r.n) * 100)}%` },
                ]}
              />
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  sub: { color: colors.muted, marginTop: 6, marginBottom: 12, lineHeight: 20 },
  capBanner: {
    backgroundColor: '#1a1840',
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: colors.accent,
    marginBottom: 14,
    alignItems: 'center',
  },
  capLabel: { color: colors.muted, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  capVal: { color: colors.gold, fontWeight: '900', fontSize: 28, marginTop: 4 },
  capHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    marginBottom: 18,
  },
  cardTitle: { color: colors.gold, fontWeight: '900', marginBottom: 12 },
  label: { color: colors.muted, fontWeight: '700', marginBottom: 8, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0a0614',
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: '#2a1f50' },
  chipOnGem: { borderColor: colors.gem, backgroundColor: '#0f2a2a' },
  chipLocked: { opacity: 0.55 },
  chipText: { color: colors.text, fontWeight: '800' },
  chipTextLocked: { color: colors.muted },
  createBtn: {
    backgroundColor: colors.accentHot,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  createText: { color: '#fff', fontWeight: '900' },
  section: { color: colors.text, fontWeight: '900', fontSize: 16, marginBottom: 6 },
  unlockBlurb: { color: colors.muted, fontSize: 12, marginBottom: 10, lineHeight: 17 },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 8,
  },
  unlockDone: { borderColor: colors.win, opacity: 0.85 },
  unlockNext: { borderColor: colors.gold, borderWidth: 2 },
  unlockTitle: { color: colors.text, fontWeight: '800' },
  unlockReq: { color: colors.muted, fontSize: 11, marginTop: 3, lineHeight: 15 },
  unlockBtn: {
    backgroundColor: colors.gem,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unlockBtnDim: { backgroundColor: '#444' },
  unlockBtnText: { color: '#042f2e', fontWeight: '900', fontSize: 12 },
  nextHint: { color: colors.muted, fontSize: 12, marginBottom: 8, lineHeight: 17 },
  empty: { color: colors.muted },
  room: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  roomTop: { flexDirection: 'row', justifyContent: 'space-between' },
  roomTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  pill: { color: colors.gem, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  barBg: {
    height: 6,
    backgroundColor: '#0a0614',
    borderRadius: 99,
    marginTop: 10,
    overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: colors.accent },
});
