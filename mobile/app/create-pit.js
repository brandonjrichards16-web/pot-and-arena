import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';
import ResourcePills from '../components/ResourcePills';
import BackToLobby from '../components/BackToLobby';

const N_OPTIONS = [4, 5, 10, 25, 50, 100, 1000];
const ADS_OPTIONS = [1, 2, 3, 5, 10];

/**
 * Own screen for hosting a pit — not a folded panel on the lobby.
 */
export default function CreatePitScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [balances, setBalances] = useState({ COIN: 0, GEM: 0 });
  const [unlocks, setUnlocks] = useState(null);
  const [startN, setStartN] = useState(4);
  const [startAds, setStartAds] = useState(1);
  const [detailN, setDetailN] = useState(null);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, u] = await Promise.all([
        api.me(),
        api.roomUnlocks().catch(() => null),
      ]);
      setBalances(me.balances || { COIN: 0, GEM: 0 });
      setUnlocks(u);
      const maxN = u?.maxCreateN || me.user?.maxCreateN || 5;
      setStartN((n) => Math.min(n, maxN));
    } catch (e) {
      Alert.alert('Host', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxCreateN = unlocks?.maxCreateN || 5;
  const ladder = unlocks?.ladder || [];
  const matchesPlayed = unlocks?.matchesPlayed || 0;
  const upgradePoints = unlocks?.upgradePoints || 0;

  async function buyNextUnlock() {
    setUnlockBusy(true);
    try {
      const res = await api.buyRoomUnlock();
      Alert.alert('Unlocked!', `${res.label} — create up to N=${res.unlockedMaxN}`);
      await load();
    } catch (e) {
      Alert.alert('Not yet', e.message);
    } finally {
      setUnlockBusy(false);
    }
  }

  function openPit() {
    if (startN > maxCreateN) {
      Alert.alert(
        'Locked',
        `You can only start pits up to N=${maxCreateN}. Unlock larger sizes below.`
      );
      return;
    }
    setBusy(true);
    router.push({
      pathname: '/play-session',
      params: {
        mode: 'start',
        n: String(startN),
        ads: String(startAds),
      },
    });
    setBusy(false);
  }

  if (loading) {
    return (
      <FunShell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      </FunShell>
    );
  }

  return (
    <FunShell dim>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} hitSlop={12}>
          <BackToLobby />
        </Pressable>
        <Text style={styles.title}>CREATE A PIT</Text>
        <ResourcePills coins={balances.COIN} gems={balances.GEM} />
      </View>

      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.lead}>
          Host a free/ad pit · House may fill empty seats · max N={maxCreateN}
        </Text>

        <Text style={styles.hostLabel}>Seats (N)</Text>
        <View style={styles.nRow}>
          {N_OPTIONS.map((n) => {
            const locked = n > maxCreateN;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  if (locked) {
                    const need = ladder.find((t) => t.maxN >= n && !t.unlocked);
                    setDetailN(need?.maxN ?? null);
                    return;
                  }
                  setStartN(n);
                }}
                style={[
                  styles.nChip,
                  startN === n && !locked && styles.nChipOn,
                  locked && styles.nChipLock,
                ]}
              >
                <Text style={styles.nChipText}>{locked ? `🔒${n}` : n}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.hostLabel}>Ads / ticket</Text>
        <View style={styles.nRow}>
          {ADS_OPTIONS.map((a) => (
            <Pressable
              key={a}
              onPress={() => setStartAds(a)}
              style={[styles.nChip, startAds === a && styles.nChipOn]}
            >
              <Text style={styles.nChipText}>{a}×</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.potPreview}>
          Pot 🪙{startN * startAds}
          {startAds > 1 ? ` (×${startAds} ads each seat)` : ''}
        </Text>

        {busy ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 16 }} />
        ) : (
          <JuicyButton
            label={`OPEN PIT · N=${startN}`}
            onPress={openPit}
            color="hot"
            style={styles.openBtn}
          />
        )}

        {ladder.length > 0 ? (
          <View style={styles.unlockList}>
            <Text style={styles.unlockSection}>Unlock larger hosts</Text>
            {ladder.map((t) => {
              const open = detailN === t.maxN;
              const matchProg =
                t.matches > 0
                  ? `${Math.min(matchesPlayed, t.matches)}/${t.matches} matches`
                  : null;
              const upProg =
                t.upgradePoints > 0
                  ? `${Math.min(upgradePoints, t.upgradePoints)}/${t.upgradePoints} ranks`
                  : null;
              return (
                <Pressable
                  key={t.maxN}
                  onPress={() =>
                    setDetailN((cur) => (cur === t.maxN ? null : t.maxN))
                  }
                  style={[
                    styles.unlockRow,
                    t.unlocked && styles.unlockDone,
                    t.isNext && styles.unlockNext,
                    open && styles.unlockOpen,
                  ]}
                >
                  <View style={styles.unlockMain}>
                    <Text style={styles.unlockTitle}>
                      {t.unlocked ? '✓' : t.isNext ? '▶' : '·'} N≤{t.maxN}
                      {t.label ? ` · ${t.label}` : ''}
                      {!t.unlocked && t.gemCost ? ` · 💎${t.gemCost}` : ''}
                    </Text>
                    {open && !t.unlocked ? (
                      <Text style={styles.unlockReq}>
                        {[matchProg, upProg].filter(Boolean).join(' · ') ||
                          'No extra requirements'}
                        {t.requirementHint ? ` — ${t.requirementHint}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  {t.isNext && t.requirementsMet ? (
                    <Pressable
                      style={styles.unlockBtn}
                      disabled={unlockBusy}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        buyNextUnlock();
                      }}
                    >
                      {unlockBusy ? (
                        <ActivityIndicator color="#0a0614" size="small" />
                      ) : (
                        <Text style={styles.unlockBtnText}>💎{t.gemCost}</Text>
                      )}
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 48,
    paddingBottom: 10,
  },
  back: { color: colors.gold, fontWeight: '800', fontSize: 14, width: 72 },
  title: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  pad: { padding: 16, paddingBottom: 48 },
  lead: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  hostLabel: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  nRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  nChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0a0614',
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  nChipOn: { borderColor: colors.gold, backgroundColor: '#3b2a10' },
  nChipLock: { opacity: 0.5 },
  nChipText: { color: colors.text, fontWeight: '900' },
  potPreview: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  openBtn: { marginTop: 16, alignSelf: 'stretch' },
  unlockList: { marginTop: 28 },
  unlockSection: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(10,6,20,0.75)',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  unlockDone: { opacity: 0.55 },
  unlockNext: { borderColor: 'rgba(251,191,36,0.45)' },
  unlockOpen: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(40,24,8,0.75)',
  },
  unlockMain: { flex: 1 },
  unlockTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 18,
  },
  unlockReq: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  unlockBtn: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  unlockBtnText: { color: '#1a1000', fontWeight: '900', fontSize: 13 },
});
