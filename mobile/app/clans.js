import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Image,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import { alertMsg } from '../lib/dialogs';
import ResourcePills from '../components/ResourcePills';
import JuicyButton from '../components/JuicyButton';

const { height: WIN_H, width: WIN_W } = Dimensions.get('window');
/** Pin rail ~2× original (~128–152) — floated so center doesn't shift */
const LEFT_RAIL_W = Math.min(304, Math.max(256, Math.round(WIN_W * 0.22 * 2)));
/** Chat ~2× original (~156–188) — floated so center/left don't shift */
const RIGHT_RAIL_W = Math.min(376, Math.max(312, Math.round(WIN_W * 0.28 * 2)));
/** Matches server pin cap */
const PIN_MAX_LEN = 400;

/**
 * Clan campsite hub (not the pit lobby).
 * - No clan: join / create only
 * - In clan: home, defense seats, raids, chat
 * Side icons: store · manage heroes · return to pits
 */
export default function ClansScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(null);
  const [chat, setChat] = useState([]);
  const [openSquads, setOpenSquads] = useState([]);
  const [list, setList] = useState([]);
  const [balances, setBalances] = useState({ COIN: 0, GEM: 0 });
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [joinTag, setJoinTag] = useState('');
  const [chatBody, setChatBody] = useState('');
  const [tab, setTab] = useState('home'); // home | crew | defend | raid
  const [status, setStatus] = useState('');
  const [raidSize, setRaidSize] = useState(3);
  const [lastResult, setLastResult] = useState(null);
  const [minLevelDraft, setMinLevelDraft] = useState('1');
  const [announceDraft, setAnnounceDraft] = useState('');
  /** Don't let the 6s poll wipe the pin field while Chief is typing */
  const announceEditingRef = useRef(false);
  const minLevelEditingRef = useRef(false);
  const lastClanIdRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [me, clans, profile] = await Promise.all([
        api.myClan().catch(() => ({ clan: null })),
        api.clans().catch(() => ({ clans: [] })),
        api.me().catch(() => null),
      ]);
      setMine(me.clan || null);
      setChat(me.chat || []);
      setOpenSquads(me.openSquads || []);
      // Show ALL clans so people can join (was wrongly only defenseActive)
      const all = [...(clans.clans || [])];
      all.sort((a, b) => {
        // Prefer open-to-join, then bigger camps, then name
        if (!!b.autoAccept !== !!a.autoAccept) return b.autoAccept ? 1 : -1;
        if ((b.memberCount || 0) !== (a.memberCount || 0)) {
          return (b.memberCount || 0) - (a.memberCount || 0);
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      setList(all);
      if (profile?.balances) setBalances(profile.balances);

      const clanId = me.clan?.id || null;
      const clanChanged = clanId !== lastClanIdRef.current;
      lastClanIdRef.current = clanId;

      // Only hydrate drafts when joining a different clan / first load,
      // or when the user is not mid-edit (poll was wiping the pin field).
      if (me.clan) {
        if (
          clanChanged ||
          (!minLevelEditingRef.current && me.clan.settings?.minLevel != null)
        ) {
          if (me.clan.settings?.minLevel != null) {
            setMinLevelDraft(String(me.clan.settings.minLevel));
          }
        }
        if (clanChanged || !announceEditingRef.current) {
          setAnnounceDraft(me.clan.announcement || '');
        }
      } else {
        announceEditingRef.current = false;
        minLevelEditingRef.current = false;
        setTab('home');
      }
    } catch (e) {
      alertMsg('Campsite', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  async function doCreate() {
    setBusy(true);
    try {
      const res = await api.createClan({ name, tag });
      setMine(res.clan);
      setStatus(res.message || 'Clan founded');
      await load();
    } catch (e) {
      alertMsg('Create', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doJoin(tagOverride) {
    setBusy(true);
    try {
      const res = await api.joinClan({ tag: tagOverride || joinTag });
      if (res.pending) {
        setStatus(res.message || 'Request pending approval');
        alertMsg('Join request', res.message || 'Waiting for Chief approval');
      } else {
        setMine(res.clan);
        setStatus(res.message || 'Joined');
      }
      await load();
    } catch (e) {
      alertMsg('Join', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doKick(userId) {
    setBusy(true);
    try {
      const res = await api.clanKick(userId);
      setMine(res.clan);
      setStatus(res.message || 'Kicked');
    } catch (e) {
      alertMsg('Kick', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doSetRole(userId, role) {
    setBusy(true);
    try {
      const res = await api.clanSetRole(userId, role);
      setMine(res.clan);
      setStatus(res.message || 'Rank updated');
    } catch (e) {
      alertMsg('Rank', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doSaveSettings({ autoAccept } = {}) {
    setBusy(true);
    try {
      const body = { minLevel: Number(minLevelDraft) || 1 };
      if (autoAccept != null) body.autoAccept = autoAccept;
      const res = await api.clanSettings(body);
      minLevelEditingRef.current = false;
      setMine(res.clan);
      if (res.clan?.settings?.minLevel != null) {
        setMinLevelDraft(String(res.clan.settings.minLevel));
      }
      setStatus(res.message || 'Settings saved');
    } catch (e) {
      alertMsg('Settings', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doApproveJoin(req) {
    setBusy(true);
    try {
      const res = await api.clanJoinApprove({
        requestId: req.id,
        userId: req.userId,
      });
      setMine(res.clan);
      setStatus(res.message || 'Approved');
    } catch (e) {
      alertMsg('Approve', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doRejectJoin(req) {
    setBusy(true);
    try {
      const res = await api.clanJoinReject({
        requestId: req.id,
        userId: req.userId,
      });
      setMine(res.clan);
      setStatus(res.message || 'Rejected');
    } catch (e) {
      alertMsg('Reject', e.message);
    } finally {
      setBusy(false);
    }
  }

  function roleBadge(m) {
    if (m.role === 'leader') return '👑';
    if (m.role === 'coleader') return '⭐';
    if (m.role === 'warrior') return '⚔';
    return '·';
  }

  function PartDot({ ok, label }) {
    return (
      <View style={styles.partDotWrap}>
        <View
          style={[styles.partDot, ok ? styles.partDotOn : styles.partDotOff]}
        />
        <Text style={styles.partDotLbl}>{label}</Text>
      </View>
    );
  }

  async function doLeave() {
    setBusy(true);
    try {
      await api.leaveClan();
      setMine(null);
      setStatus('Left clan');
      await load();
    } catch (e) {
      alertMsg('Leave', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doTransfer(userId) {
    setBusy(true);
    try {
      const res = await api.clanTransfer(userId);
      setMine(res.clan);
      setStatus(res.message || 'Leadership transferred');
    } catch (e) {
      alertMsg('Transfer', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doAnnounce() {
    setBusy(true);
    try {
      const res = await api.clanAnnounce(announceDraft);
      announceEditingRef.current = false;
      setMine(res.clan);
      setAnnounceDraft(res.clan?.announcement || announceDraft);
      setStatus(res.message || 'Pinned');
      // Refresh roster/chat without relying on poll to rewrite the draft
      await load();
    } catch (e) {
      alertMsg('Announce', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doDefend() {
    setBusy(true);
    try {
      const res = await api.clanDefend({ hours: 1 });
      setMine(res.clan);
      setStatus(res.message || 'Defense board open');
      setTab('defend');
    } catch (e) {
      alertMsg('Defend', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doClaimSeat(waveIndex) {
    setBusy(true);
    try {
      const res = await api.clanDefendSeat({ waveIndex });
      setMine(res.clan);
      setStatus(res.message || 'Seated');
    } catch (e) {
      alertMsg('Seat', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openSquad(targetId) {
    setBusy(true);
    try {
      const res = await api.clanRaidOpen({
        targetClanId: targetId,
        maxSize: raidSize,
      });
      if (res.deployed?.result) {
        setLastResult(res.deployed.result);
        alertMsg(
          res.deployed.result.victory ? 'Tower fallen!' : 'Wave fight',
          res.deployed.message || res.message
        );
      } else {
        setStatus(res.message || 'Squad opened');
      }
      await load();
    } catch (e) {
      alertMsg('Raid', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinSquad(squadId) {
    setBusy(true);
    try {
      const res = await api.clanRaidJoin(squadId);
      if (res.deployed?.result) {
        setLastResult(res.deployed.result);
        alertMsg(
          res.deployed.result.victory ? 'Tower fallen!' : 'Wave fight',
          res.deployed.message || res.message
        );
      } else {
        setStatus(res.message || 'Joined squad');
      }
      await load();
    } catch (e) {
      alertMsg('Join squad', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendChat() {
    if (!chatBody.trim()) return;
    setBusy(true);
    try {
      const res = await api.clanChatPost(chatBody.trim());
      setChat(res.messages || []);
      setChatBody('');
    } catch (e) {
      alertMsg('Chat', e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ImageBackground
        source={require('../assets/clans/campfire.jpg')}
        style={styles.root}
        imageStyle={styles.bgImg}
      >
        <View style={[styles.dim, styles.centerLoad]}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </ImageBackground>
    );
  }

  const clan = mine;
  const waves = clan?.defense?.waves || [];
  const war = clan?.war || null;
  const perms = clan?.permissions || {};
  const canKick = !!perms.kick;
  const canPromote = !!perms.promote;
  const canEditSettings = !!perms.editSettings;
  const canManageJoins = !!perms.manageJoins;
  const canTransfer = !!perms.transfer;
  const canAnnounce = !!perms.announce;
  const isAttackDay = war?.phase === 'attack';
  const isPrep = war?.phase === 'prep';

  // If someone still has chat tab selected, fall back
  const activeTab = tab === 'chat' ? 'home' : tab;

  return (
    <ImageBackground
      source={require('../assets/clans/campfire.jpg')}
      style={styles.root}
      imageStyle={styles.bgImg}
    >
      <View style={styles.dim}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.replace('/')}>
            <Text style={styles.back}>← Pits</Text>
          </Pressable>
          <Text style={styles.campTitle}>CAMPSITE</Text>
          <ResourcePills coins={balances.COIN} gems={balances.GEM} />
        </View>

        {/* —— Layout: left pin/store · center · right chat/pits —— */}
        <View style={styles.bodyRow}>
          {/* LEFT rail */}
          <View style={styles.leftRail}>
            {clan?.announcement ? (
              <View style={styles.pinBoard}>
                <Text style={styles.pinBoardTitle}>📌 PIN</Text>
                <ScrollView style={styles.pinBoardScroll} nestedScrollEnabled>
                  <Text style={styles.pinBoardBody}>{clan.announcement}</Text>
                </ScrollView>
              </View>
            ) : clan && canAnnounce ? (
              <View style={styles.pinBoardEmpty}>
                <Text style={styles.pinBoardEmptyText}>No pin yet</Text>
              </View>
            ) : null}
            <Pressable
              style={styles.railIconBtn}
              onPress={() => router.push('/store')}
            >
              <Image
                source={require('../assets/store/stall.png')}
                style={styles.sideImg}
                resizeMode="contain"
              />
              <Text style={styles.sideLbl}>Store</Text>
            </Pressable>
            <Pressable
              style={styles.railIconBtn}
              onPress={() => router.replace('/')}
            >
              <Image
                source={require('../assets/clans/pit_return.jpg')}
                style={styles.sideImgRound}
                resizeMode="cover"
              />
              <Text style={styles.sideLbl}>To the Pits</Text>
            </Pressable>
          </View>

          {/* CENTER */}
          <ScrollView
            style={styles.centerScroll}
            contentContainerStyle={styles.pad}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={load}
                tintColor={colors.gold}
              />
            }
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.col}>
              {status ? <Text style={styles.status}>{status}</Text> : null}

              {/* ——— Not in a clan ——— */}
              {!clan ? (
                <View>
                  <Text style={styles.lead}>
                    Join or found a clan — then defend & raid together.
                  </Text>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Start a clan</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Clan name"
                      placeholderTextColor={colors.muted}
                      value={name}
                      onChangeText={setName}
                      maxLength={28}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="TAG (2–5)"
                      placeholderTextColor={colors.muted}
                      value={tag}
                      onChangeText={setTag}
                      autoCapitalize="characters"
                      maxLength={5}
                    />
                    <JuicyButton
                      label={busy ? '…' : 'CREATE'}
                      onPress={doCreate}
                      color="gold"
                      size="sm"
                      disabled={busy}
                    />
                  </View>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Browse camps</Text>
                    <Text style={styles.hint}>
                      Tap Join on a clan below. Or type a TAG if a friend gave you
                      one.
                    </Text>
                    {list.length === 0 ? (
                      <Text style={styles.hint}>
                        No clans yet — create one above and friends can join
                        yours.
                      </Text>
                    ) : (
                      list.map((c) => (
                        <View key={c.id} style={styles.clanRow}>
                          <View style={styles.clanRowMain}>
                            <Text style={styles.clanRowTitle} numberOfLines={1}>
                              [{c.tag}] {c.name}
                            </Text>
                            <Text style={styles.clanRowMeta}>
                              {c.memberCount || 0} members
                              {c.minLevel > 1 ? ` · lvl ${c.minLevel}+` : ''}
                              {c.autoAccept === false ? ' · needs approval' : ' · open'}
                              {c.defenseActive ? ' · defending' : ''}
                            </Text>
                          </View>
                          <Pressable
                            style={[
                              styles.clanJoinBtn,
                              busy && styles.clanJoinBtnOff,
                            ]}
                            disabled={busy}
                            onPress={() => doJoin(c.tag)}
                          >
                            <Text style={styles.clanJoinBtnText}>Join</Text>
                          </Pressable>
                        </View>
                      ))
                    )}
                    <Text style={[styles.cardTitle, { marginTop: 12 }]}>
                      Join by TAG
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Clan TAG"
                      placeholderTextColor={colors.muted}
                      value={joinTag}
                      onChangeText={setJoinTag}
                      autoCapitalize="characters"
                      maxLength={5}
                    />
                    <JuicyButton
                      label={busy ? '…' : 'JOIN TAG'}
                      onPress={() => doJoin()}
                      color="hot"
                      size="sm"
                      disabled={busy}
                    />
                  </View>
                  <Pressable
                    style={styles.manageHeroes}
                    onPress={() => router.push('/heroes')}
                  >
                    <Text style={styles.manageHeroesText}>
                      Manage your heroes
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  {/* Slim header — no heavy banner box */}
                  <Text style={styles.slimTitle}>
                    [{clan.tag}] {clan.name}
                  </Text>
                  <Text style={styles.slimMeta}>
                    {clan.memberCount}/{clan.maxMembers || 25} · 🪙{clan.coins} ·
                    💎{clan.gems}
                    {clan.myRoleLabel ? ` · ${clan.myRoleLabel}` : ''}
                  </Text>
                  {war ? (
                    <Text
                      style={[
                        styles.warLine,
                        isAttackDay ? styles.warAttack : styles.warPrep,
                      ]}
                    >
                      {isAttackDay ? '⚔ ' : '🛠 '}
                      {war.label}
                    </Text>
                  ) : null}

                  {/* Mini tabs — chat lives on the right rail */}
                  <View style={styles.tabs}>
                    {[
                      { id: 'home', label: 'Home' },
                      { id: 'crew', label: 'Crew' },
                      { id: 'defend', label: 'Defend' },
                      { id: 'raid', label: 'Raid' },
                    ].map((t) => (
                      <Pressable
                        key={t.id}
                        style={[
                          styles.tab,
                          activeTab === t.id && styles.tabOn,
                        ]}
                        onPress={() => setTab(t.id)}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            activeTab === t.id && styles.tabTextOn,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {activeTab === 'home' ? (
                    <View>
                      <View style={styles.card}>
                        <Text style={styles.cardTitle}>Clan chest</Text>
                        <Text style={styles.chestBig}>
                          🪙 {clan.coins} · 💎 {clan.gems}
                        </Text>
                        <Text style={styles.hint}>
                          Fills when members play (~25% +1 🪙/💎). Defend to
                          double · raid steals 2/3.
                        </Text>
                      </View>
                      {canAnnounce ? (
                        <View style={styles.card}>
                          <Text style={styles.cardTitle}>
                            Set pin (Chief only)
                          </Text>
                          <TextInput
                            style={styles.input}
                            value={announceDraft}
                            onChangeText={(t) => {
                              announceEditingRef.current = true;
                              setAnnounceDraft(t);
                            }}
                            onFocus={() => {
                              announceEditingRef.current = true;
                            }}
                            onBlur={() => {
                              // Keep draft stable until pin succeeds or user leaves
                              // (don't clear editing on blur — poll could still race)
                            }}
                            placeholder="Rules, raid plan…"
                            placeholderTextColor={colors.muted}
                            maxLength={PIN_MAX_LEN}
                            multiline
                          />
                          <JuicyButton
                            label={busy ? '…' : 'PIN LEFT'}
                            onPress={doAnnounce}
                            color="gold"
                            size="sm"
                            disabled={busy}
                          />
                        </View>
                      ) : null}
                      {canEditSettings ? (
                        <Text style={styles.hint}>
                          Join gate: lvl {clan.settings?.minLevel || 1}+ ·{' '}
                          {clan.settings?.autoAccept
                            ? 'auto-accept'
                            : 'approval'}{' '}
                          (edit in Crew)
                        </Text>
                      ) : null}
                      <Pressable
                        style={styles.manageHeroes}
                        onPress={() => setTab('crew')}
                      >
                        <Text style={styles.manageHeroesText}>
                          Open crew roster →
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.manageHeroes}
                        onPress={() => router.push('/heroes')}
                      >
                        <Text style={styles.manageHeroesText}>
                          Manage your heroes
                        </Text>
                      </Pressable>
                      <Pressable onPress={doLeave} style={styles.leaveBtn}>
                        <Text style={styles.leaveText}>
                          {clan.myRole === 'leader'
                            ? 'Leave (transfer Chief first)'
                            : 'Leave clan'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

              {activeTab === 'crew' ? (
                <View>
                  {/* Join requests (Chief / Co-leader) */}
                  {canManageJoins && (clan.joinRequests || []).length > 0 ? (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Join requests</Text>
                      {clan.joinRequests.map((r) => (
                        <View key={r.id} style={styles.joinReqRow}>
                          <Text style={styles.memberLine}>
                            {r.displayName} · lvl {r.level}
                          </Text>
                          <View style={styles.row}>
                            <Pressable
                              style={styles.okBtn}
                              onPress={() => doApproveJoin(r)}
                              disabled={busy}
                            >
                              <Text style={styles.okBtnText}>Accept</Text>
                            </Pressable>
                            <Pressable
                              style={styles.noBtn}
                              onPress={() => doRejectJoin(r)}
                              disabled={busy}
                            >
                              <Text style={styles.noBtnText}>No</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Chief settings */}
                  {canEditSettings ? (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Clan settings</Text>
                      <Text style={styles.hint}>Min hero level to join</Text>
                      <View style={styles.row}>
                        <TextInput
                          style={[styles.input, styles.half, { marginBottom: 0 }]}
                          keyboardType="number-pad"
                          value={minLevelDraft}
                          onChangeText={(t) => {
                            minLevelEditingRef.current = true;
                            setMinLevelDraft(t);
                          }}
                          onFocus={() => {
                            minLevelEditingRef.current = true;
                          }}
                          maxLength={3}
                        />
                        <Pressable
                          style={styles.okBtn}
                          onPress={() => doSaveSettings()}
                          disabled={busy}
                        >
                          <Text style={styles.okBtnText}>Save lvl</Text>
                        </Pressable>
                      </View>
                      <View style={[styles.row, { marginTop: 8 }]}>
                        <Pressable
                          style={[
                            styles.toggleChip,
                            clan.settings?.autoAccept && styles.toggleChipOn,
                          ]}
                          onPress={() => doSaveSettings({ autoAccept: true })}
                          disabled={busy}
                        >
                          <Text style={styles.toggleChipText}>Auto-accept</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.toggleChip,
                            !clan.settings?.autoAccept && styles.toggleChipOn,
                          ]}
                          onPress={() => doSaveSettings({ autoAccept: false })}
                          disabled={busy}
                        >
                          <Text style={styles.toggleChipText}>Approve</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {/* Roster header for officers */}
                  {canKick || canPromote ? (
                    <View style={styles.rosterHead}>
                      <Text style={styles.rosterHeadName}>Name</Text>
                      <Text style={styles.rosterHeadPart}>D</Text>
                      <Text style={styles.rosterHeadPart}>A</Text>
                    </View>
                  ) : null}

                  {(clan.members || []).map((m) => {
                    return (
                      <View key={m.userId} style={styles.memberCard}>
                        <View style={styles.memberTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName} numberOfLines={1}>
                              {roleBadge(m)} {m.displayName}
                            </Text>
                            <Text style={styles.memberMeta} numberOfLines={1}>
                              {m.roleLabel || m.role} · lvl {m.level}
                              {m.race ? ` · ${m.race}` : ''}
                              {m.classId ? ` ${m.classId}` : ''}
                            </Text>
                            <Text style={styles.memberSeen}>
                              {m.online ? '● Online' : m.lastSeenLabel || '—'}
                            </Text>
                            <Text style={styles.memberContrib}>
                              Chest +🪙{m.contribCoins || 0} · +💎
                              {m.contribGems || 0}
                            </Text>
                            {m.stats ? (
                              <Text style={styles.memberStats}>
                                ⚔{m.stats.ATK} · ♥{m.stats.HP} · 🛡{m.stats.DEF}{' '}
                                · 💨{m.stats.SPD}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.partCol}>
                            <PartDot ok={!!m.participatedDef} label="D" />
                            <PartDot ok={!!m.participatedAtk} label="A" />
                          </View>
                        </View>
                        {m.role !== 'leader' &&
                        (canKick || canPromote || canTransfer) ? (
                          <View style={styles.memberActions}>
                            {canTransfer ? (
                              <Pressable
                                style={styles.rankBtn}
                                onPress={() => doTransfer(m.userId)}
                                disabled={busy}
                              >
                                <Text style={styles.rankBtnText}>
                                  Make Chief
                                </Text>
                              </Pressable>
                            ) : null}
                            {canPromote ? (
                              <>
                                {m.role !== 'coleader' ? (
                                  <Pressable
                                    style={styles.rankBtn}
                                    onPress={() =>
                                      doSetRole(m.userId, 'coleader')
                                    }
                                    disabled={busy}
                                  >
                                    <Text style={styles.rankBtnText}>
                                      → Co
                                    </Text>
                                  </Pressable>
                                ) : null}
                                {m.role !== 'warrior' ? (
                                  <Pressable
                                    style={styles.rankBtn}
                                    onPress={() =>
                                      doSetRole(m.userId, 'warrior')
                                    }
                                    disabled={busy}
                                  >
                                    <Text style={styles.rankBtnText}>
                                      → War
                                    </Text>
                                  </Pressable>
                                ) : null}
                                {m.role !== 'member' ? (
                                  <Pressable
                                    style={styles.rankBtn}
                                    onPress={() =>
                                      doSetRole(m.userId, 'member')
                                    }
                                    disabled={busy}
                                  >
                                    <Text style={styles.rankBtnText}>
                                      → Mem
                                    </Text>
                                  </Pressable>
                                ) : null}
                              </>
                            ) : null}
                            {canKick ? (
                              <Pressable
                                style={styles.kickBtn}
                                onPress={() => doKick(m.userId)}
                                disabled={busy}
                              >
                                <Text style={styles.kickBtnText}>Kick</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  {!clan.members?.length ? (
                    <Text style={styles.hint}>No members yet.</Text>
                  ) : null}
                  <Text style={styles.hint}>
                    D = defended · A = attacked · green = yes · Chest + = how
                    much they filled the clan chest by playing
                  </Text>
                </View>
              ) : null}

              {activeTab === 'defend' ? (
                <View>
                  {war ? (
                    <Text style={styles.hint}>
                      {isPrep
                        ? 'Prep phase — open the board and claim seats before attack day.'
                        : 'Attack day — seats still claimable; rivals can raid now.'}
                    </Text>
                  ) : null}
                  {!clan.defense?.active ? (
                    <View style={styles.card}>
                      <Text style={styles.hint}>
                        9 waves (3·3·3·3·3·2·3·3·2). One seat each. Hold until
                        attack day ends to double the chest. Attackers don’t see
                        who sits where.
                      </Text>
                      <JuicyButton
                        label={busy ? '…' : 'OPEN DEFENSE'}
                        onPress={doDefend}
                        color="hot"
                        size="sm"
                        disabled={busy}
                      />
                    </View>
                  ) : (
                    <View>
                      <Text style={styles.defBanner}>
                        🛡️ until{' '}
                        {new Date(clan.defense.until).toLocaleTimeString()} ·
                        cleared {clan.defense.wavesCleared || 0}/
                        {clan.defense.waveCount || 9} · seats{' '}
                        {clan.defense.seatsFilled || 0}/
                        {clan.defense.seatsTotal || 25}
                      </Text>
                      <JuicyButton
                        label={busy ? '…' : 'CLAIM SEAT'}
                        onPress={() => doClaimSeat(null)}
                        color="gold"
                        size="sm"
                        disabled={busy}
                        style={{ marginBottom: 8 }}
                      />
                      {(waves.length ? waves : []).map((w, wi) => (
                        <Pressable
                          key={w.wave}
                          style={styles.waveCard}
                          onPress={() => doClaimSeat(wi)}
                        >
                          <Text style={styles.waveTitle}>
                            W{w.wave} ·×{w.size}
                            {w.hpLeft != null && w.hpLeft < w.maxHp
                              ? ` · ${w.hpLeft}hp`
                              : ''}
                          </Text>
                          <View style={styles.seatRow}>
                            {(w.seats || []).map((s, si) => (
                              <View
                                key={si}
                                style={[
                                  styles.seat,
                                  s ? styles.seatFilled : styles.seatEmpty,
                                ]}
                              >
                                <Text style={styles.seatText} numberOfLines={1}>
                                  {s ? `${s.name}` : '·'}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {activeTab === 'raid' ? (
                <View>
                  {isPrep ? (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Prep phase</Text>
                      <Text style={styles.hint}>
                        Raids open on attack day. Use prep to fill seats and grow
                        the chest by playing pits & campaign.
                      </Text>
                      {war?.label ? (
                        <Text style={styles.memberSeen}>{war.label}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  <Text style={styles.hint}>
                    1–3 squad · fills then launches · progress + damage carry ·
                    full clear steals 2/3 for your clan (1/3 stays with them)
                  </Text>
                  <View style={styles.sizeRow}>
                    {[1, 2, 3].map((n) => (
                      <Pressable
                        key={n}
                        style={[
                          styles.sizeChip,
                          raidSize === n && styles.sizeChipOn,
                        ]}
                        onPress={() => setRaidSize(n)}
                      >
                        <Text style={styles.sizeChipText}>{n}</Text>
                      </Pressable>
                    ))}
                    <Text style={styles.sizeLbl}>size</Text>
                  </View>

                  {openSquads?.length ? (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Open squads</Text>
                      {openSquads.map((s) => (
                        <View key={s.id} style={styles.squadRow}>
                          <Text style={styles.squadMeta} numberOfLines={1}>
                            {s.seatsFilled}/{s.maxSize}{' '}
                            {(s.seats || []).map((x) => x.name).join(', ')}
                          </Text>
                          <Pressable
                            style={styles.joinSquadBtn}
                            onPress={() => joinSquad(s.id)}
                          >
                            <Text style={styles.joinSquadText}>Join</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.cardTitle}>Defending</Text>
                  {(() => {
                    const targets = list.filter(
                      (c) => c.defenseActive && c.id !== clan?.id
                    );
                    if (!targets.length) {
                      return (
                        <Text style={styles.hint}>
                          Nobody defending right now. Other camps still show under
                          Browse when you leave a clan.
                        </Text>
                      );
                    }
                    return targets.map((c) => (
                      <View key={c.id} style={styles.raidCard}>
                        <Text style={styles.raidName}>
                          [{c.tag}] {c.name}
                        </Text>
                        <Text style={styles.raidMeta}>
                          {c.memberCount} · 🪙{c.coins}
                        </Text>
                        <JuicyButton
                          label={busy ? '…' : `${raidSize}-SQUAD`}
                          onPress={() => openSquad(c.id)}
                          color="hot"
                          size="sm"
                          disabled={busy || isPrep}
                        />
                      </View>
                    ));
                  })()}

                  {lastResult ? (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Last fight</Text>
                      <Text style={styles.hint}>
                        {lastResult.wavesCleared}/{lastResult.wavesTotal}
                        {lastResult.victory ? ' WIN' : ''} · ⚔
                        {lastResult.attackPower}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
                </View>
              )}
            </View>
          </ScrollView>

          {/* RIGHT rail — chat always visible when in a clan */}
          <View style={styles.rightRail}>
            {clan ? (
              <View style={styles.chatDock}>
                <Text style={styles.chatDockTitle}>Chat</Text>
                <ScrollView
                  style={styles.chatDockScroll}
                  contentContainerStyle={styles.chatDockPad}
                  nestedScrollEnabled
                >
                  {(chat || []).map((m) =>
                    m.system || m.userId === 'system' ? (
                      <Text key={m.id} style={styles.chatSys}>
                        ✦ {m.body}
                      </Text>
                    ) : (
                      <Text key={m.id} style={styles.chatLine}>
                        <Text style={styles.chatWho}>{m.displayName}: </Text>
                        {m.body}
                      </Text>
                    )
                  )}
                  {!chat?.length ? (
                    <Text style={styles.chatEmpty}>Say hi to the clan…</Text>
                  ) : null}
                </ScrollView>
                <View style={styles.chatDockInputRow}>
                  <TextInput
                    style={styles.chatDockInput}
                    value={chatBody}
                    onChangeText={setChatBody}
                    placeholder="msg…"
                    placeholderTextColor={colors.muted}
                    maxLength={280}
                  />
                  <Pressable
                    style={styles.sendBtn}
                    onPress={sendChat}
                    disabled={busy}
                  >
                    <Text style={styles.sendText}>›</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: WIN_H },
  bgImg: { opacity: 0.92 },
  dim: {
    flex: 1,
    // Light veil so campfire art stays visible
    backgroundColor: 'rgba(8, 4, 14, 0.38)',
  },
  centerLoad: { alignItems: 'center', justifyContent: 'center' },
  bodyRow: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
  },
  /** Floated — does not push center content */
  leftRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: LEFT_RAIL_W,
    zIndex: 12,
    paddingTop: 6,
    paddingLeft: 14,
    paddingRight: 6,
    alignItems: 'center',
    gap: 10,
  },
  /** Floated wider chat — center stays put */
  rightRail: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: RIGHT_RAIL_W,
    zIndex: 12,
    paddingTop: 6,
    paddingLeft: 6,
    paddingRight: 14,
    alignItems: 'center',
    gap: 8,
  },
  centerScroll: {
    flex: 1,
    width: '100%',
    minWidth: 0,
  },
  railIconBtn: {
    alignItems: 'center',
    marginTop: 4,
  },
  /** +50% vs previous 52×72 / 48 */
  sideImg: { width: 78, height: 108 },
  sideImgRound: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  sideLbl: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: '#000',
    textShadowRadius: 3,
    maxWidth: 120,
  },
  pinBoard: {
    width: '100%',
    minHeight: 120,
    maxHeight: Math.min(WIN_H * 0.42, 280),
    backgroundColor: 'rgba(20, 12, 6, 0.82)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.55)',
    padding: 8,
  },
  pinBoardTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 5,
    textAlign: 'center',
  },
  pinBoardScroll: {
    flexGrow: 0,
    maxHeight: Math.min(WIN_H * 0.34, 230),
  },
  pinBoardBody: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
  },
  pinBoardEmpty: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    borderStyle: 'dashed',
  },
  pinBoardEmptyText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 9,
    textAlign: 'center',
  },
  chatDock: {
    flex: 1,
    width: '100%',
    minHeight: 200,
    maxHeight: WIN_H * 0.62,
    backgroundColor: 'rgba(10, 6, 16, 0.86)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.45)',
    padding: 7,
    marginBottom: 6,
  },
  chatDockTitle: {
    color: '#c4b5fd',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginBottom: 4,
  },
  chatDockScroll: { flex: 1, minHeight: 100 },
  chatDockPad: { paddingBottom: 6, paddingRight: 2 },
  chatDockInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  chatDockInput: {
    flex: 1,
    backgroundColor: 'rgba(8, 4, 14, 0.85)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    color: colors.text,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
  },
  chatEmpty: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    fontStyle: 'italic',
  },
  slimTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 15,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  slimMeta: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    textShadowColor: '#000',
    textShadowRadius: 2,
  },
  warLine: {
    fontWeight: '800',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 44,
    paddingBottom: 4,
  },
  back: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 12,
    width: 56,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  campTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1.5,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  pad: {
    paddingBottom: 28,
    paddingTop: 2,
    alignItems: 'center',
  },
  /** Center column — room for left pin + right chat */
  col: {
    width: '100%',
    maxWidth: 320,
    paddingHorizontal: 4,
  },
  lead: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  status: {
    color: colors.gem,
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 6,
  },
  card: {
    backgroundColor: 'rgba(12, 6, 20, 0.62)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    padding: 8,
    marginBottom: 7,
  },
  clanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  clanRowMain: { flex: 1, minWidth: 0 },
  clanRowTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 15,
  },
  clanRowMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  clanJoinBtn: {
    backgroundColor: colors.accentHot || colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  clanJoinBtnOff: { opacity: 0.5 },
  clanJoinBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  cardTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(8, 4, 14, 0.75)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    color: colors.text,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
    fontSize: 13,
  },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  half: { flex: 1 },
  banner: {
    backgroundColor: 'rgba(20, 10, 6, 0.65)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.55)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 7,
    alignItems: 'center',
  },
  bannerTag: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  bannerName: { color: colors.text, fontWeight: '900', fontSize: 15 },
  bannerMeta: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 7,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(50, 32, 8, 0.8)',
  },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 11 },
  tabTextOn: { color: colors.gold },
  memberLine: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 11,
    marginBottom: 2,
  },
  memberCard: {
    backgroundColor: 'rgba(12, 6, 20, 0.62)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    padding: 7,
    marginBottom: 5,
  },
  memberTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  memberName: {
    color: colors.cream,
    fontWeight: '900',
    fontSize: 12,
  },
  memberMeta: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 10,
    marginTop: 1,
  },
  memberSeen: {
    color: colors.gem,
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
  },
  memberStats: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 10,
    marginTop: 2,
  },
  memberContrib: {
    color: '#fbbf24',
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
  },
  chestBig: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 4,
  },
  warBanner: {
    fontWeight: '800',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  warPrep: { color: '#93c5fd' },
  warAttack: { color: '#fca5a5' },
  pinText: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  chatSys: {
    color: '#a78bfa',
    fontWeight: '700',
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 4,
    lineHeight: 15,
  },
  partCol: { alignItems: 'center', gap: 3, paddingTop: 2 },
  partDotWrap: { alignItems: 'center' },
  partDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  partDotOn: { backgroundColor: '#22c55e' },
  partDotOff: { backgroundColor: '#ef4444' },
  partDotLbl: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  memberActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  rankBtn: {
    backgroundColor: 'rgba(50, 32, 8, 0.85)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  rankBtnText: { color: colors.gold, fontWeight: '800', fontSize: 10 },
  kickBtn: {
    backgroundColor: 'rgba(80, 16, 20, 0.85)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  kickBtnText: { color: '#fecaca', fontWeight: '800', fontSize: 10 },
  joinReqRow: {
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  okBtn: {
    backgroundColor: 'rgba(16, 60, 36, 0.9)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  okBtnText: { color: '#ecfdf5', fontWeight: '800', fontSize: 11 },
  noBtn: {
    backgroundColor: 'rgba(80, 16, 20, 0.85)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  noBtnText: { color: '#fecaca', fontWeight: '800', fontSize: 11 },
  toggleChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleChipOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(50, 32, 8, 0.85)',
  },
  toggleChipText: { color: colors.cream, fontWeight: '800', fontSize: 11 },
  rosterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  rosterHeadName: {
    flex: 1,
    color: colors.muted,
    fontWeight: '800',
    fontSize: 9,
  },
  rosterHeadPart: {
    width: 18,
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '800',
    fontSize: 9,
  },
  hint: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 7,
  },
  manageHeroes: {
    backgroundColor: 'rgba(16, 60, 36, 0.75)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(74,222,128,0.45)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 7,
  },
  manageHeroesText: {
    color: '#ecfdf5',
    fontWeight: '900',
    fontSize: 12,
  },
  leaveBtn: { padding: 6, alignItems: 'center' },
  leaveText: { color: colors.danger, fontWeight: '700', fontSize: 11 },
  defBanner: {
    color: colors.gem,
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 7,
    textAlign: 'center',
  },
  waveCard: {
    backgroundColor: 'rgba(12, 6, 20, 0.55)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    padding: 6,
    marginBottom: 5,
  },
  waveTitle: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 10,
    marginBottom: 4,
  },
  seatRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  seat: {
    minWidth: 48,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  seatEmpty: {
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  seatFilled: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(50,32,8,0.7)',
  },
  seatText: {
    color: colors.cream,
    fontWeight: '700',
    fontSize: 9,
    textAlign: 'center',
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sizeChip: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,4,14,0.7)',
  },
  sizeChipOn: { borderColor: colors.gold, backgroundColor: '#3b2a10' },
  sizeChipText: { color: colors.text, fontWeight: '900', fontSize: 12 },
  sizeLbl: { color: colors.muted, fontWeight: '700', fontSize: 11 },
  raidCard: {
    backgroundColor: 'rgba(12, 6, 20, 0.6)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
    padding: 8,
    marginBottom: 7,
  },
  raidName: { color: colors.text, fontWeight: '900', fontSize: 12 },
  raidMeta: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 10,
    marginVertical: 4,
  },
  squadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  squadMeta: { flex: 1, color: colors.cream, fontWeight: '700', fontSize: 10 },
  joinSquadBtn: {
    backgroundColor: colors.gold,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  joinSquadText: { color: '#1a1000', fontWeight: '900', fontSize: 11 },
  chatBox: {
    maxHeight: 160,
    marginBottom: 7,
  },
  chatLine: {
    color: colors.cream,
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 16,
  },
  chatWho: { color: colors.gold, fontWeight: '900' },
  sendBtn: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sendText: { color: '#1a1000', fontWeight: '900', fontSize: 14 },
});
