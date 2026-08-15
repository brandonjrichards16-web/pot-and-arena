import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  TextInput,
  Modal,
  Share,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, getToken, setToken } from '../lib/api';
import { colors } from '../lib/theme';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';
import ResourcePills from '../components/ResourcePills';
import HeroEvolve from '../components/HeroEvolve';
import SplashPit from '../components/SplashPit';

/**
 * Home = big hero + rank + JOIN / START.
 * No room list clutter — join finds a pot; start opens one.
 */
export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState(null);
  const [unlocks, setUnlocks] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [softLaunch, setSoftLaunch] = useState(true);
  const [softBrief, setSoftBrief] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackStars, setFeedbackStars] = useState(0);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  async function saveName() {
    const displayName = renameDraft.trim().slice(0, 24);
    if (displayName.length < 2) {
      Alert.alert('Name', 'Need at least 2 characters.');
      return;
    }
    setRenameBusy(true);
    try {
      await api.patchMe({ displayName });
      setRenameOpen(false);
      await load();
    } catch (e) {
      Alert.alert('Could not rename', e.message);
    } finally {
      setRenameBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setMe(null);
        setUnlocks(null);
        return;
      }
      let profile = await api.me();
      if (!profile.user?.characterReady) {
        setMe(null);
        router.replace('/character');
        return;
      }
      setMe(profile);
      let maxN = profile.user?.maxCreateN || 5;
      // Dev-only unlock (production returns 403 — never block lobby on it)
      if (maxN < 1000) {
        try {
          const all = await api.unlockAllPits();
          if (all?.user) {
            profile = { ...profile, user: { ...profile.user, ...all.user } };
            setMe(profile);
          }
        } catch {
          /* production: ignore */
        }
      }
      try {
        const u = await api.roomUnlocks();
        setUnlocks(u);
      } catch {
        setUnlocks(null);
      }
    } catch {
      await setToken(null);
      setMe(null);
      setUnlocks(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    api
      .meta()
      .then((m) => {
        setSoftLaunch(m?.softLaunch !== false);
        setSoftBrief(m?.softLaunchBrief || null);
      })
      .catch(() => {});
    // Light poll only while logged in — don't thrash the splash
    const t = setInterval(() => {
      getToken().then((tok) => {
        if (tok) load();
      });
    }, 12000);
    return () => clearInterval(t);
  }, [load]);

  async function sendFeedback() {
    const message = feedbackText.trim();
    if (message.length < 2) {
      Alert.alert('Feedback', 'Write a quick note (2+ characters).');
      return;
    }
    setFeedbackBusy(true);
    try {
      await api.playtestFeedback({
        message,
        stars: feedbackStars || undefined,
        path: 'lobby',
      });
      setFeedbackOpen(false);
      setFeedbackText('');
      setFeedbackStars(0);
      Alert.alert('Thanks!', 'Logged for the soft launch. Keep playing.');
    } catch (e) {
      Alert.alert('Could not send', e.message);
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function shareInvite() {
    const code = me?.user?.inviteCode;
    if (!code) {
      router.push('/invite');
      return;
    }
    const blurb = `Play Pot & Arena with me — soft launch playtest. My invite code: ${code}`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Pot & Arena', text: blurb });
      } else if (
        Platform.OS === 'web' &&
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(blurb);
        Alert.alert('Copied', blurb);
      } else {
        await Share.share({ message: blurb });
      }
    } catch {
      router.push('/invite');
    }
  }

  async function begin() {
    setLoading(true);
    try {
      const data = await api.guest();
      await setToken(data.token);
      router.replace('/character');
    } catch (e) {
      Alert.alert(
        'Could not start',
        e.message || 'Server may be waking up — try again in a few seconds.'
      );
    } finally {
      // Always clear spinner (navigation may keep this screen briefly)
      setLoading(false);
    }
  }

  /** Wipe local session and return to the pit splash (first page). */
  async function hardResetToStart() {
    try {
      await setToken(null);
    } catch {
      /* ignore storage errors */
    }
    setMe(null);
    setUnlocks(null);
    setLoading(false);
    setRefreshing(false);
    // Land on `/` so URL isn't stuck on /campaign etc.
    router.replace('/');
  }

  function joinPit() {
    // play-session finds / creates a filling pot — no list needed on home
    router.push({ pathname: '/play-session', params: { mode: 'join' } });
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

  if (!me) {
    return (
      <FunShell>
        <View style={styles.splash}>
          <Text style={styles.logo}>POT & ARENA</Text>
          <Text style={styles.tag}>Every race · every class · one brutal pit</Text>
          <SplashPit />
          <View style={styles.splashCtaWrap}>
            <JuicyButton label="▶  START" onPress={begin} style={styles.splashCta} />
          </View>
          <Text style={styles.splashHint}>
            Pick your race, class & gender next — then own the Road
          </Text>
        </View>
      </FunShell>
    );
  }

  const { user, balances } = me;
  const tier = user.visualTier || 0;
  const weekly = me.rank?.weeklyFame;
  const rankDelta = me.rank?.rankDelta;
  const rankLabel = weekly?.unranked
    ? 'Unranked'
    : weekly?.rank
      ? `#${weekly.rank}`
      : '—';

  return (
    <FunShell>
      {/* Painted merchant stall — left edge */}
      <Pressable
        style={styles.shopSide}
        onPress={() => router.push('/store')}
        accessibilityLabel="Open store"
      >
        <Image
          source={require('../assets/store/stall.png')}
          style={styles.shopStall}
          resizeMode="contain"
        />
        <Text style={styles.shopHint}>Store</Text>
      </Pressable>

      {/* Clan campfire — right edge */}
      <Pressable
        style={styles.clanSide}
        onPress={() => router.push('/clans')}
        accessibilityLabel="Open clans"
      >
        <Image
          source={require('../assets/clans/campfire.jpg')}
          style={styles.clanCamp}
          resizeMode="contain"
        />
        <Text style={styles.clanHint}>Clans</Text>
        <Text style={styles.clanSub}>Chest · raid</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.gold}
          />
        }
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>POT & ARENA</Text>
            <Pressable onPress={() => router.push('/leaderboards')} hitSlop={6}>
              <Text style={styles.rankInline}>
                Rank {rankLabel}
                {rankDelta != null && rankDelta !== 0
                  ? rankDelta > 0
                    ? ` ↑${rankDelta}`
                    : ` ↓${Math.abs(rankDelta)}`
                  : ''}
              </Text>
            </Pressable>
          </View>
          <ResourcePills coins={balances.COIN} gems={balances.GEM} />
        </View>

        {/* Hero portrait — not a giant click target */}
        <View style={styles.stage}>
          <HeroEvolve
            gender={user.gender || 'boy'}
            upgrades={user.upgrades || {}}
            avatarUrl={user.avatarUrl}
            race={user.race}
            classId={user.classId}
            gearKinds={user.gear?.kinds || null}
            gearOrigin={
              user.gear?.setActive
                ? user.gear?.set?.originId || null
                : null
            }
            size={148}
          />
          <View style={styles.nameplate}>
            <Pressable
              onPress={() => {
                setRenameDraft(user.displayName || '');
                setRenameOpen(true);
              }}
              hitSlop={8}
              style={styles.nameRow}
            >
              <Text style={styles.name} numberOfLines={1}>
                {user.displayName}
              </Text>
              <Text style={styles.editName}>✎</Text>
            </Pressable>
            <Text style={styles.statsLine}>
              ATK {user.stats?.ATK ?? user.stats?.power ?? 0}
              {'  ·  '}
              HP {user.stats?.HP ?? user.stats?.vitality ?? 0}
            </Text>
          </View>
        </View>

        <Modal visible={renameOpen} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Your fighter name</Text>
              <Text style={styles.modalSub}>Friends see this on boards and in the pit.</Text>
              <TextInput
                value={renameDraft}
                onChangeText={setRenameDraft}
                maxLength={24}
                autoFocus
                autoCapitalize="words"
                placeholder="Name"
                placeholderTextColor={colors.muted}
                style={styles.modalInput}
              />
              <View style={styles.modalRow}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setRenameOpen(false)}
                  disabled={renameBusy}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalSave}
                  onPress={saveName}
                  disabled={renameBusy}
                >
                  <Text style={styles.modalSaveText}>
                    {renameBusy ? '…' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {softLaunch ? (
          <View style={styles.softBanner}>
            <Text style={styles.softBannerTitle}>Friends soft launch</Text>
            <Text style={styles.softBannerBody}>
              {softBrief?.focus ||
                'START → fighter → Join a pit → watch. Everything else is optional.'}
            </Text>
            <View style={styles.softRow}>
              <Pressable style={styles.softChip} onPress={shareInvite}>
                <Text style={styles.softChipTextDark}>
                  Invite {user.inviteCode ? `· ${user.inviteCode}` : ''}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.softChip, styles.softChipAlt]}
                onPress={() => setFeedbackOpen(true)}
              >
                <Text style={styles.softChipTextLight}>Feedback</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.ctaCol}>
          {/* Soft launch: PLAY first. Campaign is secondary. */}
          <JuicyButton
            label="▶  JOIN A PIT"
            onPress={joinPit}
            color="hot"
            size="md"
            style={styles.ctaBtn}
          />

          <JuicyButton
            label="CAMPAIGN"
            onPress={() => router.push('/campaign')}
            color={softLaunch ? 'gold' : 'hot'}
            size="md"
            style={styles.ctaBtn}
          />

          {/* Manage hero: green strip → races/classes · Upgrade on the right */}
          <View style={styles.manageRow}>
            <Pressable
              style={styles.manageMain}
              onPress={() => router.push('/heroes')}
            >
              <Text style={styles.manageMainTitle}>Manage your heroes</Text>
              <Text style={styles.manageMainSub}>Race · class · party</Text>
            </Pressable>
            <Pressable
              style={styles.manageUpgrade}
              onPress={() => router.push('/upgrade')}
            >
              <Text style={styles.manageUpgradeText}>Upgrade</Text>
              <Text style={styles.manageUpgradeSub}>gear & tree</Text>
            </Pressable>
          </View>

          {/* Pits: Start | Betting — Join is already the main CTA */}
          <View style={styles.pitBar}>
            <Pressable
              style={styles.pitSeg}
              onPress={() => router.push('/create-pit')}
            >
              <Text style={styles.pitSegTitle}>Start a pit</Text>
              <Text style={styles.pitSegSub}>Host · set N</Text>
            </Pressable>
            <View style={styles.pitDivider} />
            <Pressable
              style={[styles.pitSeg, styles.pitSegBet]}
              onPress={() => router.push('/betting')}
            >
              <Text style={styles.pitSegTitle}>Betting</Text>
              <Text style={styles.pitSegSub}>Humans only</Text>
            </Pressable>
            {!softLaunch ? (
              <>
                <View style={styles.pitDivider} />
                <Pressable style={styles.pitSeg} onPress={joinPit}>
                  <Text style={styles.pitSegTitle}>Join a pit</Text>
                  <Text style={styles.pitSegSub}>Find a fight</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          <Pressable
            onPress={hardResetToStart}
            style={styles.resetBtn}
            hitSlop={8}
          >
            <Text style={styles.resetBtnText}>↩ Back to title screen</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={feedbackOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Soft launch feedback</Text>
            <Text style={styles.modalSub}>
              What was fun? What sucked? One line is enough.
            </Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setFeedbackStars(n)} hitSlop={6}>
                  <Text style={styles.star}>
                    {feedbackStars >= n ? '★' : '☆'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              maxLength={2000}
              multiline
              placeholder="e.g. First fight was cool but I got lost in Upgrade"
              placeholderTextColor={colors.muted}
              style={[styles.modalInput, styles.feedbackInput]}
            />
            <View style={styles.modalRow}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setFeedbackOpen(false)}
                disabled={feedbackBusy}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSave}
                onPress={sendFeedback}
                disabled={feedbackBusy}
              >
                <Text style={styles.modalSaveText}>
                  {feedbackBusy ? '…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pad: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 44,
    paddingBottom: 28,
    /* room for store (left) + clans camp (right) */
    paddingLeft: 92,
    paddingRight: 92,
  },
  /* —— left-edge painted merchant stall —— */
  shopSide: {
    position: 'absolute',
    left: 2,
    top: '28%',
    zIndex: 20,
    width: 88,
    alignItems: 'center',
  },
  shopStall: {
    width: 84,
    height: 122,
  },
  shopHint: {
    marginTop: 2,
    color: colors.cream,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /* —— right-edge clan campfire —— */
  clanSide: {
    position: 'absolute',
    right: 2,
    top: '28%',
    zIndex: 20,
    width: 88,
    alignItems: 'center',
  },
  clanCamp: {
    width: 84,
    height: 122,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.45)',
  },
  clanHint: {
    marginTop: 4,
    color: colors.gold,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  clanSub: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 9,
    marginTop: 1,
    textShadowColor: '#000',
    textShadowRadius: 2,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  brand: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
  },
  rankInline: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 11,
    marginTop: 2,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 36,
    paddingBottom: 28,
  },
  logo: {
    color: colors.gold,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
    textShadowColor: '#000',
    textShadowRadius: 8,
  },
  tag: {
    color: colors.cream,
    fontWeight: '700',
    marginBottom: 12,
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.95,
  },
  splashCtaWrap: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  splashCta: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 300,
  },
  splashHint: {
    marginTop: 12,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  resetBtn: {
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  resetBtnText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  pair: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  mini: { width: 130, height: 165 },
  rankDelta: { fontWeight: '900', fontSize: 16 },
  up: { color: colors.win },
  down: { color: colors.danger },
  stage: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 6,
    overflow: 'visible',
  },
  nameplate: {
    marginTop: 2,
    backgroundColor: 'rgba(12, 4, 28, 0.92)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    minWidth: 160,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 17,
    textAlign: 'center',
    maxWidth: 180,
  },
  editName: { color: colors.gold, fontSize: 14, fontWeight: '700' },
  statsLine: {
    color: colors.gold,
    fontWeight: '800',
    marginTop: 4,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1a1028',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  modalTitle: { color: colors.gold, fontWeight: '900', fontSize: 18 },
  modalSub: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 12 },
  modalInput: {
    backgroundColor: '#0e0818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackInput: { minHeight: 88, textAlignVertical: 'top' },
  starRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  star: { color: colors.gold, fontSize: 28, fontWeight: '900' },
  softBanner: {
    backgroundColor: 'rgba(40, 18, 8, 0.92)',
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  softBannerTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  softBannerBody: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
  },
  softRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  softChip: {
    flex: 1,
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  softChipAlt: { backgroundColor: '#3d2a12', borderWidth: 1, borderColor: colors.gold },
  softChipTextDark: { color: '#1a0a04', fontWeight: '900', fontSize: 12 },
  softChipTextLight: { color: '#fff8e8', fontWeight: '900', fontSize: 12 },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancel: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  modalCancelText: { color: colors.muted, fontWeight: '700' },
  modalSave: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.gold,
    alignItems: 'center',
  },
  modalSaveText: { color: '#1a1000', fontWeight: '900' },
  ctaCol: {
    alignItems: 'stretch',
    marginTop: 6,
    marginBottom: 8,
    gap: 8,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  ctaBtn: { alignSelf: 'stretch', width: '100%' },
  manageRow: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(74,222,128,0.65)',
    minHeight: 52,
  },
  manageMain: {
    flex: 1.35,
    backgroundColor: 'rgba(20, 80, 45, 0.92)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  manageMainTitle: {
    color: '#ecfdf5',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  manageMainSub: {
    color: 'rgba(220,252,231,0.85)',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 2,
  },
  manageUpgrade: {
    flex: 0.9,
    backgroundColor: 'rgba(34, 120, 70, 0.98)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageUpgradeText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  manageUpgradeSub: {
    color: 'rgba(236,253,245,0.85)',
    fontWeight: '700',
    fontSize: 10,
    marginTop: 1,
  },
  pitBar: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.55)',
    backgroundColor: 'rgba(50, 32, 8, 0.92)',
    minHeight: 54,
  },
  pitSeg: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitSegBet: {
    backgroundColor: 'rgba(70, 40, 10, 0.55)',
  },
  pitDivider: {
    width: 1,
    backgroundColor: 'rgba(251,191,36,0.35)',
    marginVertical: 8,
  },
  pitSegTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },
  pitSegSub: {
    color: 'rgba(255,245,220,0.75)',
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  unlockDone: { opacity: 0.55 },
  unlockNext: { borderColor: 'rgba(251,191,36,0.45)' },
  unlockOpen: { borderColor: colors.gold, backgroundColor: 'rgba(40,24,8,0.75)' },
  unlockMain: { flex: 1 },
  unlockTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 52,
    alignItems: 'center',
  },
  unlockBtnText: { color: '#1a0f2e', fontWeight: '900', fontSize: 12 },
  tapHint: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    opacity: 0.8,
  },
});
