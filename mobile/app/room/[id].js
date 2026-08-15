import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { colors } from '../../lib/theme';
import AdGate from '../../components/AdGate';
import BackToLobby from '../../components/BackToLobby';
import { rememberWatchRoom, requestNotifyPermission } from '../../lib/matchWatch';

export default function RoomScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAd, setShowAd] = useState(false);
  const [meId, setMeId] = useState(null);
  const navigatedToResults = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api.room(id);
      setRoom(r);
      // Auto-open results when a humans-only table you care about fills
      if (r.status === 'COMPLETE' && !navigatedToResults.current) {
        const humansOnly = !r.allows_house || r.pot_humans_only;
        if (humansOnly) {
          navigatedToResults.current = true;
          router.replace(`/results/${id}`);
        }
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    api.me().then((p) => setMeId(p.user?.id)).catch(() => {});
    rememberWatchRoom(String(id));
    requestNotifyPermission();
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load, id]);

  async function doJoin(opts = {}) {
    setBusy(true);
    try {
      const adsNeed = Math.max(
        1,
        Number(room?.adsRequired ?? room?.adsPerTicket ?? room?.ads_per_ticket) || 1
      );
      const res = await api.join(id, {
        mockAd: true,
        adsWatched: opts.adsWatched ?? adsNeed,
      });
      setRoom(res.room);
      await rememberWatchRoom(String(id));
      await requestNotifyPermission();
      const humansOnly = !res.room?.allows_house;
      Alert.alert(
        `Ticket #${res.ticketNumber} locked!`,
        humansOnly
          ? 'Waiting for real players. Leave this open or allow notifications — we’ll ping you when the pit fills so you can watch.'
          : 'You can close the app — progress is saved. Watch the draw when the room fills.'
      );
      if (res.room?.status === 'COMPLETE') {
        router.push(`/results/${id}`);
      }
    } catch (e) {
      Alert.alert('Could not join', e.message);
    } finally {
      setBusy(false);
      setShowAd(false);
    }
  }

  async function shareTable() {
    const link =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/room/${id}`
        : `Join room ${id} on Pot & Arena`;
    try {
      await Share.share({
        message: `Join my Pot & Arena table: ${link}`,
        url: Platform.OS === 'web' ? link : undefined,
      });
    } catch {
      /* cancel */
    }
  }

  function join() {
    if (busy) return;
    if (room.entry_type === 'AD' || room.entry_type === 'FREE') {
      // FREE also gets a short “energy” gate so it feels intentional; AD is longer mock
      setShowAd(true);
    } else {
      doJoin();
    }
  }

  async function speedFill() {
    setBusy(true);
    try {
      const r = await api.fillBots(id);
      setRoom(r);
      if (r.status === 'COMPLETE') router.push(`/results/${id}`);
    } catch (e) {
      Alert.alert('Fill failed', e.message);
    } finally {
      setBusy(false);
    }
  }

  function leaveToLobby() {
    // Leave the screen — your ticket stays if you already bought one
    router.replace('/');
  }

  if (loading || !room) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Pressable style={{ marginTop: 20 }} onPress={leaveToLobby}>
          <Text style={{ color: colors.gold, fontWeight: '800' }}>← Leave to lobby</Text>
        </Pressable>
      </View>
    );
  }

  const open = ['OPEN', 'FILLING'].includes(room.status);
  const seated =
    meId &&
    (room.tickets || []).some((t) => t.user_id === meId || t.userId === meId);
  const tickets = room.tickets || [];
  const adsNeed = Math.max(
    1,
    Number(room.adsRequired ?? room.adsPerTicket ?? room.ads_per_ticket) || 1
  );
  const potPreview =
    room.potEstimate != null
      ? room.potEstimate
      : room.entry_type === 'COIN' || room.entry_type === 'GEM'
        ? room.n * room.stake * (1 - room.rake)
        : room.n * (room.coin_per_ticket || 1) * adsNeed * (1 - (room.rake || 0));

  return (
    <>
      <AdGate
        visible={showAd}
        count={adsNeed}
        onCancel={() => setShowAd(false)}
        onComplete={(watched) => doJoin({ adsWatched: watched || adsNeed })}
      />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />
        }
      >
        <View style={styles.topNav}>
          <BackToLobby label="Lobby" onPress={leaveToLobby} />
          <Pressable onPress={() => router.push('/betting')} hitSlop={10}>
            <Text style={styles.navLink}>Betting Pit</Text>
          </Pressable>
        </View>

        <Text style={[styles.title, { textAlign: 'center' }]}>{room.title}</Text>
        <Text style={[styles.meta, { textAlign: 'center' }]}>
          {room.status} · {room.tickets_sold}/{room.n} · {room.entry_type}
          {seated ? ' · you are seated' : ''}
        </Text>
        <Text style={[styles.leaveHint, { textAlign: 'center' }]}>
          Leave anytime. Your ticket stays — we’ll still notify you when the pit fills.
        </Text>

        <View style={styles.potBanner}>
          <Text style={styles.potLabel}>EST. POT</Text>
          <Text style={styles.potVal}>
            🪙 ~{Math.round(potPreview)} {room.entry_type === 'GEM' ? 'GEMS' : 'COINS'}
          </Text>
          <Text style={styles.potSub}>Winner of the random ticket draw takes it</Text>
        </View>

        <View style={styles.barBg}>
          <View
            style={[styles.barFill, { width: `${(room.tickets_sold / room.n) * 100}%` }]}
          />
        </View>

        <View style={styles.row}>
          <Stat label="Humans" value={room.human_tickets ?? '—'} />
          <Stat label="House" value={room.house_tickets ?? '—'} color={colors.house} />
          <Stat label="Max Lv" value={room.max_level} />
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            {room.allows_house ? 'Includes House fighters' : 'Humans only'}
          </Text>
          <Text style={styles.noticeBody}>{room.disclaimer}</Text>
          {room.pot_humans_only ? (
            <Text style={[styles.noticeBody, { color: colors.gold, marginTop: 6 }]}>
              🎲 Coin pot: random draw among human tickets only
            </Text>
          ) : null}
        </View>

        <Text style={styles.section}>🎟️ Ticket board</Text>
        <View style={styles.grid}>
          {Array.from({ length: room.n }, (_, i) => {
            const num = i + 1;
            const t = tickets.find((x) => x.ticket_number === num);
            return (
              <View
                key={num}
                style={[
                  styles.seat,
                  t && styles.seatTaken,
                  t?.is_bot && styles.seatHouse,
                ]}
              >
                <Text style={styles.seatNum}>#{num}</Text>
                <Text style={styles.seatName} numberOfLines={1}>
                  {t ? (t.is_bot ? 'House' : t.display_name?.slice(0, 8)) : '—'}
                </Text>
              </View>
            );
          })}
        </View>

        {open && !room.allows_house ? (
          <View style={styles.waitCard}>
            <Text style={styles.waitTitle}>⏳ Waiting for real players</Text>
            <Text style={styles.waitBody}>
              {room.tickets_sold}/{room.n} seated · {Math.max(0, room.n - room.tickets_sold)} open.
              No House bots. Share the table — you’ll get a banner/notification when it fills.
            </Text>
            <Pressable style={styles.btnSecondary} onPress={shareTable}>
              <Text style={styles.btnText}>🔗 Share table link</Text>
            </Pressable>
          </View>
        ) : null}

        {open ? (
          <>
            <Pressable
              style={styles.btn}
              disabled={busy || seated}
              onPress={join}
            >
              <Text style={styles.btnText}>
                {seated
                  ? '✓ You’re in — waiting for players…'
                  : room.entry_type === 'AD'
                    ? '📺 Watch ad → get ticket'
                    : room.entry_type === 'FREE'
                      ? '🎲 Claim free ticket'
                      : `Join (${room.stake} ${room.entry_type})`}
              </Text>
            </Pressable>
            {room.allows_house ? (
              <Pressable style={styles.btnSecondary} disabled={busy} onPress={speedFill}>
                <Text style={styles.btnText}>⚡ Fill House · START THE PARTY</Text>
              </Pressable>
            ) : null}
            <Text style={styles.hint}>
              When full: spinning lucky number for the pot, then ALL fighters brawl in a mini pit
              until one champ remains.
            </Text>
          </>
        ) : null}

        {room.status === 'COMPLETE' ? (
          <Pressable style={styles.btn} onPress={() => router.push(`/results/${id}`)}>
            <Text style={styles.btnText}>🎬 Watch LUCK draw + PIT brawl</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.leaveBottom} onPress={leaveToLobby}>
          <Text style={styles.leaveBottomText}>← Back to lobby (exit pit)</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: { padding: 16, paddingBottom: 40, backgroundColor: colors.bg },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  leaveBtn: {
    backgroundColor: 'rgba(40,20,50,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  leaveText: { color: colors.gold, fontWeight: '900', fontSize: 14 },
  navLink: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  leaveHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  meta: { color: colors.muted, marginTop: 4, marginBottom: 8 },
  leaveBottom: {
    marginTop: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: 'rgba(20,12,28,0.9)',
  },
  leaveBottomText: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  potBanner: {
    backgroundColor: '#2a2210',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.gold,
    marginBottom: 14,
    alignItems: 'center',
  },
  potLabel: { color: colors.gold, fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  potVal: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 },
  potSub: { color: colors.muted, fontSize: 12, marginTop: 4 },
  waitCard: {
    backgroundColor: '#1a1528',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gold,
    marginBottom: 14,
  },
  waitTitle: { color: colors.gold, fontWeight: '900', fontSize: 15 },
  waitBody: { color: colors.muted, fontSize: 13, marginTop: 6, marginBottom: 10, lineHeight: 18 },
  barBg: {
    height: 8,
    backgroundColor: '#0f1422',
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 14,
  },
  barFill: { height: 8, backgroundColor: colors.accent },
  row: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  statVal: { color: colors.text, fontWeight: '800', fontSize: 18 },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  notice: {
    backgroundColor: '#1a2238',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 16,
  },
  noticeTitle: { color: colors.house, fontWeight: '700', marginBottom: 4 },
  noticeBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  section: { color: colors.text, fontWeight: '700', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  seat: {
    width: '18%',
    flexGrow: 1,
    minWidth: 56,
    backgroundColor: '#0f1422',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  seatTaken: { borderColor: colors.accent, backgroundColor: '#1a1840' },
  seatHouse: { borderColor: colors.house, backgroundColor: '#1a2030' },
  seatNum: { color: colors.gold, fontWeight: '900', fontSize: 12 },
  seatName: { color: colors.muted, fontSize: 9, marginTop: 2 },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  btnSecondary: {
    backgroundColor: '#2a2210',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  btnText: { color: '#fff', fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 12, marginTop: 12, lineHeight: 18 },
});
