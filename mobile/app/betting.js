import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';
import { rememberWatchRoom, requestNotifyPermission } from '../lib/matchWatch';
import BackToLobby from '../components/BackToLobby';

const SEAT_OPTS = [2, 3, 4, 5, 6, 8, 10];
const GEM_STAKES = [1, 2, 5, 10, 25];
const COIN_STAKES = [5, 10, 25, 40, 100];

/**
 * Betting Pit — humans only.
 * See open real rooms · create your own · wait for players · notified when full.
 */
export default function BettingPit() {
  const router = useRouter();
  const [rooms, setRooms] = useState([]);
  const [mine, setMine] = useState({ waiting: [], ready: [] });
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState('GEM'); // GEM | COIN
  const [n, setN] = useState(2);
  const [stake, setStake] = useState(5);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, alerts, profile] = await Promise.all([
        api.bettingRooms(),
        api.matchAlerts().catch(() => ({ waiting: [], ready: [] })),
        api.me().catch(() => null),
      ]);
      setRooms(list.rooms || []);
      setMine({ waiting: alerts.waiting || [], ready: alerts.ready || [] });
      setMe(profile);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    // Default stake when currency flips
    setStake(currency === 'GEM' ? 5 : 10);
  }, [currency]);

  async function createTable() {
    setBusy(true);
    try {
      await requestNotifyPermission();
      const room = await api.createBettingRoom({
        currency,
        n,
        stake,
      });
      await rememberWatchRoom(room.id);
      const link =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/room/${room.id}`
          : `Join pit ${room.id} on Pot & Arena`;
      try {
        await Share.share({
          message: `Join my betting pit (${n} seats · ${stake}${currency === 'GEM' ? '💎' : '🪙'}): ${link}`,
          url: Platform.OS === 'web' ? link : undefined,
          title: 'Pot & Arena bet',
        });
      } catch {
        /* user cancelled share */
      }
      Alert.alert(
        'Table open',
        `You're seated. Waiting for real players (${room.tickets_sold || 1}/${room.n}). Share the link — you'll get a push when it fills.`,
        [{ text: 'Open table', onPress: () => router.push(`/room/${room.id}`) }]
      );
      router.push(`/room/${room.id}`);
    } catch (e) {
      Alert.alert('Could not create', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(id) {
    setBusy(true);
    try {
      await requestNotifyPermission();
      await rememberWatchRoom(id);
      router.push(`/room/${id}`);
    } finally {
      setBusy(false);
    }
  }

  const stakes = currency === 'GEM' ? GEM_STAKES : COIN_STAKES;
  const bal = me?.balances || {};
  const canAfford =
    currency === 'GEM'
      ? (bal.GEM || 0) >= stake
      : (bal.COIN || 0) >= stake;

  return (
    <FunShell dim>
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold} />
        }
      >
        <Pressable onPress={() => router.replace('/')} style={styles.backRow} hitSlop={8}>
          <BackToLobby label="Lobby" />
        </Pressable>
        <Text style={styles.eyebrow}>HUMANS ONLY · NO HOUSE FILL</Text>
        <Text style={[styles.title, { textAlign: "center" }]}>Betting Pit</Text>
        <Text style={styles.sub}>
          Join a real table someone opened — or host your own and wait. Same lucky-number pot + pit
          brawl. Push when it's full so you can watch.
        </Text>

        {me ? (
          <Text style={styles.bal}>
            You have 🪙 {Math.floor(bal.COIN || 0)} · 💎 {Math.floor(bal.GEM || 0)}
          </Text>
        ) : null}

        {(mine.ready?.length > 0 || mine.waiting?.length > 0) && (
          <View style={styles.mineBox}>
            <Text style={styles.mineTitle}>Your tables</Text>
            {(mine.ready || []).map((r) => (
              <Pressable
                key={r.id}
                style={styles.mineReady}
                onPress={() => router.push(`/results/${r.id}`)}
              >
                <Text style={styles.mineReadyText}>🎬 READY · {r.title}</Text>
                <Text style={styles.mineHint}>Watch results →</Text>
              </Pressable>
            ))}
            {(mine.waiting || []).map((r) => (
              <Pressable
                key={r.id}
                style={styles.mineWait}
                onPress={() => router.push(`/room/${r.id}`)}
              >
                <Text style={styles.mineWaitText}>
                  ⏳ {r.title} · {r.tickets_sold}/{r.n}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <JuicyButton
          label={showCreate ? 'CLOSE HOST' : '＋ HOST A TABLE'}
          onPress={() => setShowCreate((s) => !s)}
          color="gold"
          style={{ marginBottom: 12 }}
        />

        {showCreate ? (
          <View style={styles.createCard}>
            <Text style={styles.createLabel}>Bet with</Text>
            <View style={styles.row}>
              {['GEM', 'COIN'].map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCurrency(c)}
                  style={[styles.chip, currency === c && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{c === 'GEM' ? '💎 Gems' : '🪙 Coins'}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.createLabel}>Seats (real players)</Text>
            <View style={styles.row}>
              {SEAT_OPTS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setN(s)}
                  style={[styles.chip, n === s && styles.chipOn]}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.createLabel}>Stake per seat</Text>
            <View style={styles.row}>
              {stakes.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStake(s)}
                  style={[styles.chip, stake === s && styles.chipOn]}
                >
                  <Text style={styles.chipText}>
                    {s}
                    {currency === 'GEM' ? '💎' : '🪙'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.potLine}>
              Est. pot ~{Math.round(n * stake * 0.9)} {currency === 'GEM' ? 'gems' : 'coins'} after
              rake · you sit first
            </Text>
            {!canAfford ? (
              <Text style={styles.warn}>Not enough {currency === 'GEM' ? 'gems' : 'coins'} for this stake.</Text>
            ) : null}

            <JuicyButton
              label={busy ? 'Opening…' : `OPEN TABLE · ${n}×${stake}${currency === 'GEM' ? '💎' : '🪙'}`}
              onPress={createTable}
              color="hot"
              disabled={busy || !canAfford}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : null}

        <Text style={styles.section}>Open tables</Text>
        {loading && rooms.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 20 }} />
        ) : rooms.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No open bets yet</Text>
            <Text style={styles.emptyBody}>
              Host a table above and share the link with a friend — or wait for someone else to open
              one.
            </Text>
          </View>
        ) : (
          rooms.map((r) => {
            const left = r.seatsLeft ?? r.n - r.tickets_sold;
            const full = left <= 0;
            return (
              <Pressable
                key={r.id}
                style={styles.room}
                onPress={() => joinRoom(r.id)}
                disabled={busy || full}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.roomTitle}>{r.title}</Text>
                  <Text style={styles.roomMeta}>
                    {r.tickets_sold}/{r.n} seated · {left} open ·{' '}
                    {r.entry_type === 'GEM' ? '💎' : '🪙'} {r.stake} each
                  </Text>
                  <Text style={styles.roomPot}>
                    Pot ~{r.potEstimate ?? Math.round(r.n * r.stake * 0.9)}
                  </Text>
                </View>
                <View style={styles.joinPill}>
                  <Text style={styles.joinText}>{full ? 'FULL' : 'JOIN'}</Text>
                </View>
              </Pressable>
            );
          })
        )}

        <Text style={styles.foot}>
          Tip: N=2 is a head-to-head duel. Leave this tab open (or allow notifications) to get pinged
          when the pit fills.
        </Text>
      </ScrollView>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  backRow: { marginBottom: 10, alignSelf: 'flex-start' },
  backText: { color: colors.gold, fontWeight: '900', fontSize: 15 },
  eyebrow: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  bal: { color: colors.text, fontWeight: '700', marginTop: 10, marginBottom: 8 },
  mineBox: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 12,
    gap: 8,
  },
  mineTitle: { color: colors.gold, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  mineReady: {
    backgroundColor: '#1a3d24',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  mineReadyText: { color: colors.text, fontWeight: '800' },
  mineHint: { color: colors.accent, fontSize: 12, marginTop: 2 },
  mineWait: {
    backgroundColor: '#1a1528',
    borderRadius: 10,
    padding: 10,
  },
  mineWaitText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  createCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gold,
    marginBottom: 16,
  },
  createLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#1a1528',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  potLine: { color: colors.gold, marginTop: 12, fontWeight: '700', fontSize: 13 },
  warn: { color: '#f87171', marginTop: 6, fontSize: 12 },
  section: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  emptyBody: { color: colors.muted, textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 18 },
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 10,
  },
  roomTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  roomMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  roomPot: { color: colors.gold, fontWeight: '700', fontSize: 12, marginTop: 3 },
  joinPill: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  joinText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  foot: { color: colors.muted, fontSize: 11, marginTop: 16, lineHeight: 16, textAlign: 'center' },
});
