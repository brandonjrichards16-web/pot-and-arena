import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import { tierLabel } from '../lib/characters';
import FunShell from '../components/FunShell';
import ResourcePills from '../components/ResourcePills';
import HeroEvolve from '../components/HeroEvolve';
import BackToLobby from '../components/BackToLobby';

/**
 * Hero screen — gear + tech.
 * Solid cards (no washed-out transparency). Clear copy on:
 * what gear does, what merge does, what tech buys.
 * Same fighter powers pits + campaign.
 */
export default function UpgradeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const wide = width >= 700;
  const heroSize = wide
    ? Math.min(280, Math.round(height * 0.42))
    : Math.min(190, Math.round(Math.min(width * 0.4, height * 0.3)));

  const [tab, setTab] = useState('gear');
  const [me, setMe] = useState(null);
  const [tree, setTree] = useState([]);
  const [branches, setBranches] = useState([]);
  const [gear, setGear] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);
  /** { originId, slotId } | null — open piece bag */
  const [openPiece, setOpenPiece] = useState(null);
  /** originId | null — open set boost ladder popup */
  const [openSetInfo, setOpenSetInfo] = useState(null);
  /** Screen coords for anchoring the ℹ popup to the right of the button */
  const [setInfoAnchor, setSetInfoAnchor] = useState(null);

  function closeSetInfo() {
    setOpenSetInfo(null);
    setSetInfoAnchor(null);
  }

  /** Open set ladder as a floating panel to the right of the ℹ control */
  async function openSetInfoAt(originId, evt) {
    if (openSetInfo === originId) {
      closeSetInfo();
      return;
    }
    let anchor = null;
    try {
      const target =
        evt?.nativeEvent?.target || evt?.currentTarget || evt?.target;
      if (target && typeof target.getBoundingClientRect === 'function') {
        const r = target.getBoundingClientRect();
        anchor = {
          x: r.right,
          y: r.top,
          left: r.left,
          bottom: r.bottom,
          w: r.width,
          h: r.height,
        };
      } else if (evt?.nativeEvent?.pageX != null) {
        anchor = {
          x: evt.nativeEvent.pageX + 16,
          y: evt.nativeEvent.pageY,
          left: evt.nativeEvent.pageX,
          bottom: evt.nativeEvent.pageY,
          w: 0,
          h: 0,
        };
      }
    } catch {
      /* fall through — right-side popup */
    }
    // Prefer right side of gear column when we couldn't measure the button
    if (!anchor) {
      const colW = wide ? 400 : Math.min(420, width * 0.55);
      anchor = {
        x: Math.min(width - 20, colW + 24),
        y: Math.round(height * 0.22),
        left: colW,
        bottom: Math.round(height * 0.22),
        w: 0,
        h: 0,
      };
    }
    setSetInfoAnchor(anchor);
    setOpenSetInfo(originId);

    // Compact /me embeds omit boostLadder — pull full gear for the popup list
    const origin = (gear?.origins || []).find((o) => o.id === originId);
    if (!(origin?.boostLadder || []).length) {
      try {
        const full = await api.gear();
        if (full?.origins?.length) setGear(full);
      } catch {
        /* ignore */
      }
    }
  }

  const load = useCallback(async () => {
    try {
      // Load independently so a fat/failing endpoint never blanks the bag
      let profile = null;
      let t = null;
      let gearOnly = null;
      const errors = [];
      await Promise.all([
        api
          .me()
          .then((r) => {
            profile = r;
          })
          .catch((e) => errors.push(`me: ${e.message}`)),
        api
          .upgradeTree()
          .then((r) => {
            t = r;
          })
          .catch((e) => errors.push(`tree: ${e.message}`)),
        api
          .gear()
          .then((r) => {
            gearOnly = r;
          })
          .catch((e) => errors.push(`gear: ${e.message}`)),
      ]);
      if (!profile) {
        throw new Error(errors[0] || 'Could not load hero');
      }
      setMe(profile);
      setTree(t?.tree || []);
      setBranches(
        t?.branches || [
          { id: 'atk', label: 'ATTACK', stat: 'ATK' },
          { id: 'hp', label: 'HIT POINTS', stat: 'HP' },
          { id: 'def', label: 'DEFENSE', stat: 'DEF' },
          { id: 'spd', label: 'SPEED', stat: 'SPD' },
        ]
      );
      // Prefer full /me/gear (levels for merge). Compact embeds still have bestLevel.
      const pick =
        (gearOnly?.origins?.length && gearOnly) ||
        (t?.gear?.origins?.length && t.gear) ||
        profile.user?.gear ||
        null;
      setGear(pick);
      if (errors.length && !pick?.origins?.length) {
        Alert.alert('Gear load issue', errors.join('\n'));
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function buy(nodeId) {
    setBusy(nodeId);
    try {
      const res = await api.upgradeNode(nodeId);
      setMe((prev) => ({
        ...prev,
        user: res.user,
        balances: res.balances,
      }));
      const t = await api.upgradeTree();
      setTree(t.tree || []);
      setGear(t.gear || null);
      if (res.gain?.short) {
        Alert.alert('Tech upgraded', `Permanent ${res.gain.short} on your hero (pits + campaign).`);
      }
    } catch (e) {
      Alert.alert("Can't upgrade", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function merge(originId, slotId, level) {
    setBusy(`merge_${originId}_${slotId}_${level}`);
    try {
      const before = { ...(me?.user?.stats || {}) };
      const res = await api.gearMerge(originId, slotId, level);
      setMe((prev) => ({ ...prev, user: res.user }));
      setGear(res.gear);
      const c = res.crafted;
      const after = res.user?.stats || {};
      const deltas = ['ATK', 'HP', 'DEF', 'SPD']
        .map((k) => {
          const d = (after[k] || 0) - (before[k] || 0);
          return d ? `${d > 0 ? '+' : ''}${d} ${k}` : null;
        })
        .filter(Boolean);
      if (c) {
        Alert.alert(
          'Merged!',
          `Spent 3× ${c.name} L${c.from?.level || level}\n` +
            `Got 1× ${c.name} L${c.level || c.tier}\n\n` +
            (deltas.length
              ? `Stats: ${deltas.join(' · ')}`
              : 'Wear a full origin set for its special power.')
        );
      }
    } catch (e) {
      Alert.alert("Can't merge", e.message);
    } finally {
      setBusy(null);
    }
  }

  /** Cascade-merge every possible 3→1 for this origin+slot */
  async function mergeAll(originId, slotId) {
    const busyKey = `mergeall_${originId}_${slotId}`;
    setBusy(busyKey);
    try {
      const before = { ...(me?.user?.stats || {}) };
      const res = await api.gearMergeAll(originId, slotId);
      setMe((prev) => ({ ...prev, user: res.user }));
      setGear(res.gear);
      const after = res.user?.stats || {};
      const deltas = ['ATK', 'HP', 'DEF', 'SPD']
        .map((k) => {
          const d = (after[k] || 0) - (before[k] || 0);
          return d ? `${d > 0 ? '+' : ''}${d} ${k}` : null;
        })
        .filter(Boolean);
      const n = res.merges || 0;
      const hi = res.highestCrafted || res.crafted?.level;
      const name = res.crafted?.name || 'piece';
      Alert.alert(
        n === 1 ? 'Merged!' : `Merged ${n} times!`,
        `${name}: ran every possible 3→1 merge` +
          (hi ? `\nHighest piece now involves L${hi}` : '') +
          (deltas.length ? `\n\nStats: ${deltas.join(' · ')}` : '')
      );
    } catch (e) {
      Alert.alert("Can't merge all", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function setAutoMode(enabled) {
    const want = !!enabled;
    if ((gear?.autoEquipBest !== false) === want) return;
    setBusy('auto');
    try {
      const res = await api.gearAutoEquip(want);
      setMe((prev) => ({ ...prev, user: res.user }));
      setGear(res.gear);
    } catch (e) {
      Alert.alert('Equip mode', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutoEquip() {
    await setAutoMode(!(gear?.autoEquipBest !== false));
  }

  async function equipOrigin(slotId, originId) {
    setBusy(`eq_${slotId}_${originId || 'off'}`);
    try {
      const res = await api.gearEquip(slotId, originId || null);
      setMe((prev) => ({ ...prev, user: res.user }));
      setGear(res.gear);
    } catch (e) {
      Alert.alert('Equip', e.message);
    } finally {
      setBusy(null);
    }
  }

  /** Equip all 5 slots of this origin (highest piece each) */
  async function wearFullSet(originId) {
    setBusy(`wear_${originId}`);
    try {
      await api.gearAutoEquip(false);
      const origin = (gear?.origins || []).find((o) => o.id === originId);
      const slots = (origin?.pieces || [])
        .filter((p) => p.total > 0)
        .map((p) => p.slotId);
      let last = null;
      for (const slotId of slots) {
        last = await api.gearEquip(slotId, originId);
      }
      if (last) {
        setMe((prev) => ({ ...prev, user: last.user }));
        setGear(last.gear);
      } else {
        await load();
      }
    } catch (e) {
      Alert.alert('Wear set', e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading || !me) {
    return (
      <FunShell dim>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      </FunShell>
    );
  }

  const { user, balances } = me;
  const tier = user.visualTier || 0;
  const stats = user.stats || {};
  const base = user.statsBase || {};
  const gearBonus = user.gearBonus || gear?.bonus || {};
  const kinds = gear?.kinds || [];
  const origins = gear?.origins || [];
  const mergeNeed = gear?.mergeNeed || 3;
  const autoEquip = gear?.autoEquipBest !== false;
  const bagPieceCount =
    gear?.bagPieceCount ??
    kinds.reduce((a, k) => a + (Number(k.total) || 0), 0) ??
    0;
  const kindTotalsLine = kinds
    .map((k) => `${k.emoji || ''} ${k.name} ×${k.total || 0}`)
    .join('  ·  ');

  const gearParts = ['ATK', 'HP', 'DEF', 'SPD']
    .map((k) => (gearBonus[k] ? `+${gearBonus[k]} ${k}` : null))
    .filter(Boolean);

  /** Loadout snapshot for set-progress UI */
  const wornBySlot = gear?.setProgress?.wornOrigins || {};
  const wornSlotList = (gear?.slots || kinds || []).map((s) => {
    const id = s.id || s.slotId;
    const eq = (kinds || []).find((k) => k.id === id)?.equipped;
    return {
      id,
      name: s.name || s.slotName || id,
      emoji: s.emoji || '•',
      originId: wornBySlot[id] || eq?.originId || null,
      level: eq?.level || eq?.tier || 0,
      color: eq?.color || null,
    };
  });
  const setHint =
    gear?.setProgress?.hint ||
    (gear?.setActive
      ? null
      : 'Wear all 5 slots from the SAME armor origin to unlock that set’s special combat bonus.');

  const infoOrigin = openSetInfo
    ? origins.find((o) => o.id === openSetInfo) || null
    : null;
  const infoCol = infoOrigin?.color || colors.gold;
  // Popup size + clamp so it stays on screen, preferring right of the ℹ
  const popupW = Math.min(340, Math.max(260, Math.round(width * 0.42)));
  const popupH = Math.min(Math.round(height * 0.72), 520);
  let popupLeft = width - popupW - 16;
  let popupTop = Math.round(height * 0.14);
  if (setInfoAnchor) {
    const preferRight = setInfoAnchor.x + 10;
    const preferLeft = (setInfoAnchor.left ?? setInfoAnchor.x) - popupW - 10;
    if (preferRight + popupW <= width - 8) {
      popupLeft = preferRight;
    } else if (preferLeft >= 8) {
      popupLeft = preferLeft;
    } else {
      popupLeft = Math.max(8, Math.min(preferRight, width - popupW - 8));
    }
    popupTop = Math.max(
      12,
      Math.min(setInfoAnchor.y - 8, height - popupH - 16)
    );
  }

  return (
    <FunShell dim>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <BackToLobby />
          <View style={{ flex: 1 }} />
          <ResourcePills coins={balances.COIN} gems={balances.GEM} />
        </View>

        <View style={[styles.stage, wide && styles.stageWide]}>
          <View style={[styles.sideCol, wide && styles.sideColWide]}>
            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={1}>
                {user.displayName}
              </Text>
              <Text style={styles.tierLook}>
                {tierLabel(tier)} look · same fighter in pits & campaign
              </Text>
            </View>

            {/* Total stats with base vs gear breakdown */}
            <View style={styles.statsRow}>
              {['ATK', 'HP', 'DEF', 'SPD'].map((k) => {
                const total = stats[k] ?? 0;
                const b = base[k] ?? total;
                const g = gearBonus[k] || 0;
                return (
                  <View
                    key={k}
                    style={[styles.statChip, g > 0 && styles.statChipGeared]}
                  >
                    <Text style={styles.statK}>{k}</Text>
                    <Text style={styles.statV}>{total}</Text>
                    {g > 0 ? (
                      <Text style={styles.statSplit}>
                        tech {b} + gear {g}
                      </Text>
                    ) : (
                      <Text style={styles.statSplit}>tech only</Text>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.powerBox}>
              <Text style={styles.powerTitle}>What powers you</Text>
              <Text style={styles.powerLine}>
                · Tech (gems) → permanent base ATK / HP / DEF / SPD
              </Text>
              <Text style={styles.powerLine}>
                · Gear (drops) → bonus on top · full matching set = special power
              </Text>
              <Text style={styles.powerLine}>
                · Pits earn gems & gear → come back stronger for the Road
              </Text>
              {gearParts.length ? (
                <Text style={styles.powerGear}>
                  Gear right now: {gearParts.join(' · ')}
                </Text>
              ) : (
                <Text style={styles.powerGear}>
                  No gear equipped yet — win fights to drop pieces
                </Text>
              )}
            </View>

            {/* Solid panel — no translucent frame wash */}
            <View style={styles.panel}>
              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tab, tab === 'gear' && styles.tabOn]}
                  onPress={() => setTab('gear')}
                >
                  <Text
                    style={[styles.tabText, tab === 'gear' && styles.tabTextOn]}
                  >
                    GEAR
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, tab === 'tree' && styles.tabOn]}
                  onPress={() => setTab('tree')}
                >
                  <Text
                    style={[styles.tabText, tab === 'tree' && styles.tabTextOn]}
                  >
                    TECH
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.pad}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {tab === 'gear' ? (
                  <>
                    {/* Always-visible bag totals so empty UI is never a silent lie */}
                    <View style={styles.bagBar}>
                      <Text style={styles.bagBarTitle}>
                        YOUR BAG · {bagPieceCount} pieces
                      </Text>
                      <Text style={styles.bagBarLine}>
                        {kindTotalsLine ||
                          'No pieces counted — pull to refresh or re-open Hero.'}
                      </Text>
                      <Pressable onPress={load} style={styles.bagRefresh}>
                        <Text style={styles.bagRefreshText}>↻ Refresh gear</Text>
                      </Pressable>
                    </View>

                    {/* Auto vs pick — always visible so you're never stuck on auto */}
                    <View style={styles.modeBar}>
                      <Text style={styles.modeBarTitle}>HOW YOU EQUIP</Text>
                      <View style={styles.modeToggleRow}>
                        <Pressable
                          style={[
                            styles.modeBtn,
                            autoEquip && styles.modeBtnOn,
                          ]}
                          disabled={busy === 'auto'}
                          onPress={() => setAutoMode(true)}
                        >
                          <Text
                            style={[
                              styles.modeBtnText,
                              autoEquip && styles.modeBtnTextOn,
                            ]}
                          >
                            {busy === 'auto' && autoEquip ? '…' : 'AUTO BEST'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.modeBtn,
                            !autoEquip && styles.modeBtnOnPick,
                          ]}
                          disabled={busy === 'auto'}
                          onPress={() => setAutoMode(false)}
                        >
                          <Text
                            style={[
                              styles.modeBtnText,
                              !autoEquip && styles.modeBtnTextOn,
                            ]}
                          >
                            {busy === 'auto' && !autoEquip
                              ? '…'
                              : 'PICK MY OWN'}
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={styles.modeHint}>
                        {autoEquip
                          ? 'Auto: strongest piece in each slot (may mix origins — often no set bonus).'
                          : 'Pick: you choose armor per slot. Matching all 5 of one origin unlocks the set power.'}
                      </Text>
                    </View>

                    {/* Set bonus status — loud when active, clear when missing */}
                    {gear?.setActive ? (
                      <View style={[styles.setBox, styles.setBoxOn]}>
                        <Text style={styles.setBonusBadge}>★ SET BONUS ACTIVE</Text>
                        <Text style={styles.setTitle}>
                          {gear.set.emoji} {String(gear.set.originName || '').toUpperCase()} · “
                          {gear.set.name}”
                        </Text>
                        <Text style={styles.setBody}>
                          Set level {gear.set.minLevel}
                          {gear.set.maxLevel > gear.set.minLevel
                            ? ` (pieces up to L${gear.set.maxLevel})`
                            : ''}
                          {' · '}
                          set power {gear.set.setPowerProgress ?? '—'}%
                          {gear.set.boostLines?.length
                            ? `\n${gear.set.boostLines.join(' · ')}`
                            : ''}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.setBox, styles.setBoxOff]}>
                        <Text style={styles.setBonusBadgeOff}>
                          ★ SET BONUS LOCKED
                        </Text>
                        <Text style={styles.setTitleOff}>
                          Equip all 5 slots from the SAME armor origin
                        </Text>
                        <Text style={styles.setBody}>
                          Matching armor unlocks that set’s special combat power
                          (extra stats + unique effect). Mixed pieces still give
                          their slot stats — just no set bonus.
                        </Text>
                        {wornSlotList.length ? (
                          <View style={styles.wornStrip}>
                            {wornSlotList.map((s) => (
                              <View key={s.id} style={styles.wornChip}>
                                <Text style={styles.wornChipEmoji}>
                                  {s.emoji}
                                </Text>
                                <Text
                                  style={[
                                    styles.wornChipOrigin,
                                    s.color ? { color: s.color } : null,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {s.originId && s.originId !== '—'
                                    ? String(s.originId).slice(0, 6)
                                    : '—'}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                        {setHint ? (
                          <Text style={styles.setProgressHint}>{setHint}</Text>
                        ) : null}
                        <Text style={styles.gearLead}>
                          Tap a piece → <Text style={{ color: colors.gold }}>EQUIP</Text>
                          {' · '}
                          or <Text style={{ color: colors.gold }}>WEAR SET</Text> when
                          you own all 5 · ℹ for bonus ladder
                        </Text>
                      </View>
                    )}

                    {origins.length === 0 ? (
                      <Text style={styles.empty}>
                        {bagPieceCount > 0
                          ? 'Bag has pieces but sets failed to load — tap Refresh gear.'
                          : 'No gear yet — win pits or Campaign.'}
                      </Text>
                    ) : (
                      origins.map((origin) => {
                        const col = origin.color || colors.gold;
                        const complete = !!origin.complete;
                        const infoOpen = openSetInfo === origin.id;
                        const wornHere = origin.wornCount || 0;
                        const ownsAll =
                          origin.ownedCount >= 5 ||
                          origin.pieces?.every((p) => p.total > 0);
                        const firstBoost =
                          origin.setBonusSummary ||
                          (origin.boostLadder || []).find((r) => r.level === 1)
                            ?.summary ||
                          (origin.boostLadder || [])[0]?.summary ||
                          null;
                        return (
                          <View
                            key={origin.id}
                            style={[
                              styles.setRowCard,
                              {
                                borderColor: complete
                                  ? col
                                  : 'rgba(255,255,255,0.14)',
                              },
                              complete && {
                                backgroundColor: `${col}14`,
                              },
                            ]}
                          >
                            {/* SET NAME + wear + info */}
                            <View style={styles.setNameRow}>
                              <Text style={[styles.setNameBig, { color: col }]}>
                                {origin.emoji}{' '}
                                {String(origin.name || '').toUpperCase()}
                              </Text>
                              <View style={styles.setNameActions}>
                                <Pressable
                                  style={[
                                    styles.infoBtn,
                                    { borderColor: col },
                                    infoOpen && {
                                      backgroundColor: `${col}33`,
                                    },
                                  ]}
                                  onPress={(e) => openSetInfoAt(origin.id, e)}
                                >
                                  <Text style={[styles.infoBtnText, { color: col }]}>
                                    {infoOpen ? '✕' : 'ℹ'}
                                  </Text>
                                </Pressable>
                                {ownsAll ? (
                                  <Pressable
                                    style={[
                                      styles.wearBtn,
                                      { backgroundColor: col },
                                      complete && styles.wearBtnActive,
                                    ]}
                                    disabled={busy === `wear_${origin.id}`}
                                    onPress={() => wearFullSet(origin.id)}
                                  >
                                    <Text style={styles.wearBtnText}>
                                      {busy === `wear_${origin.id}`
                                        ? '…'
                                        : complete
                                          ? '★ SET ON'
                                          : '★ WEAR SET'}
                                    </Text>
                                  </Pressable>
                                ) : null}
                              </View>
                            </View>

                            {/* Always show what the set bonus is for */}
                            <View
                              style={[
                                styles.setTeaser,
                                complete
                                  ? { borderColor: col, backgroundColor: `${col}22` }
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.setTeaserTitle,
                                  { color: complete ? col : colors.gold },
                                ]}
                                numberOfLines={1}
                              >
                                {complete
                                  ? `★ “${origin.setName}” ON`
                                  : `★ SET · “${origin.setName || origin.name}”`}
                              </Text>
                              <Text style={styles.setTeaserBody} numberOfLines={3}>
                                {complete && gear?.set?.boostLines?.length
                                  ? gear.set.boostLines.slice(0, 4).join(' · ')
                                  : origin.blurb ||
                                    firstBoost ||
                                    'Wear all 5 of this origin for the set power.'}
                              </Text>
                              {!complete ? (
                                <Text
                                  style={styles.setTeaserProgress}
                                  numberOfLines={1}
                                >
                                  {ownsAll
                                    ? `${wornHere}/5 on · tap ★ WEAR SET`
                                    : `${origin.ownedCount || 0}/5 owned · ${wornHere}/5 on`}
                                </Text>
                              ) : null}
                            </View>

                            {/* 5 pieces left → right */}
                            <View style={styles.pieceRow}>
                              {(origin.pieces || []).map((piece) => {
                                const best = piece.showLevel || piece.bestLevel || 0;
                                const canUp = !!piece.canUpgrade;
                                const selected =
                                  openPiece?.originId === origin.id &&
                                  openPiece?.slotId === piece.slotId;
                                return (
                                  <Pressable
                                    key={piece.slotId}
                                    style={[
                                      styles.pieceCell,
                                      selected && {
                                        borderColor: col,
                                        backgroundColor: `${col}22`,
                                      },
                                      piece.equipped && {
                                        borderColor: col,
                                      },
                                    ]}
                                    onPress={async () => {
                                      if (selected) {
                                        setOpenPiece(null);
                                        return;
                                      }
                                      setOpenPiece({
                                        originId: origin.id,
                                        slotId: piece.slotId,
                                      });
                                      // Compact embeds omit level rows — pull full bag for merge UI
                                      if (!(piece.levels || []).length && piece.total > 0) {
                                        try {
                                          const full = await api.gear();
                                          if (full?.origins?.length) setGear(full);
                                        } catch {
                                          /* ignore */
                                        }
                                      }
                                    }}
                                  >
                                    <Text style={styles.pieceEmoji}>
                                      {piece.emoji}
                                    </Text>
                                    <Text
                                      style={styles.pieceName}
                                      numberOfLines={1}
                                    >
                                      {piece.slotName}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.pieceLvl,
                                        {
                                          color: best
                                            ? col
                                            : colors.muted,
                                        },
                                      ]}
                                    >
                                      {best
                                        ? `L${best}`
                                        : piece.total
                                          ? `×${piece.total}`
                                          : '—'}
                                    </Text>
                                    {piece.total > 0 ? (
                                      <Text style={styles.pieceCount}>
                                        ×{piece.total}
                                      </Text>
                                    ) : (
                                      <Text style={styles.upgradeTagOff}>0</Text>
                                    )}
                                    {piece.equipped ? (
                                      <Text
                                        style={[styles.equippedTag, { color: col }]}
                                      >
                                        ON
                                      </Text>
                                    ) : canUp ? (
                                      <Text style={styles.upgradeTag}>
                                        upgrade
                                      </Text>
                                    ) : (
                                      <Text style={styles.upgradeTagOff}> </Text>
                                    )}
                                  </Pressable>
                                );
                              })}
                            </View>

                            {/* Piece detail: equip + levels + merge */}
                            {openPiece?.originId === origin.id &&
                            openPiece?.slotId ? (
                              (() => {
                                const piece = (origin.pieces || []).find(
                                  (p) => p.slotId === openPiece.slotId
                                );
                                if (!piece) return null;
                                const levels = piece.levels || piece.tiers || [];
                                const canMergeAny = levels.some((lv) => lv.canMerge);
                                const mergeAllKey = `mergeall_${origin.id}_${piece.slotId}`;
                                const mergeAllBusy = busy === mergeAllKey;
                                const eqKey = `eq_${piece.slotId}_${origin.id}`;
                                const uneqKey = `eq_${piece.slotId}_off`;
                                const canEquip = (piece.total || 0) > 0;
                                return (
                                  <View style={styles.pieceDetail}>
                                    <View style={styles.pieceDetailHead}>
                                      <Text
                                        style={[
                                          styles.pieceDetailTitle,
                                          { flex: 1, marginBottom: 0 },
                                        ]}
                                      >
                                        {piece.emoji} {origin.name}{' '}
                                        {piece.slotName}
                                      </Text>
                                      {canMergeAny ? (
                                        <Pressable
                                          style={[
                                            styles.mergeAllBtn,
                                            { backgroundColor: col },
                                          ]}
                                          disabled={!!busy}
                                          onPress={() =>
                                            mergeAll(origin.id, piece.slotId)
                                          }
                                        >
                                          <Text style={styles.mergeAllBtnText}>
                                            {mergeAllBusy ? '…' : 'Merge all'}
                                          </Text>
                                        </Pressable>
                                      ) : null}
                                    </View>

                                    {/* Equip this piece (switches to Pick My Own) */}
                                    {canEquip ? (
                                      <View style={styles.equipRow}>
                                        {piece.equipped ? (
                                          <>
                                            <View
                                              style={[
                                                styles.equippedPill,
                                                { borderColor: col },
                                              ]}
                                            >
                                              <Text
                                                style={[
                                                  styles.equippedPillText,
                                                  { color: col },
                                                ]}
                                              >
                                                ✓ Equipped L{piece.bestLevel || piece.showLevel || '?'}
                                              </Text>
                                            </View>
                                            <Pressable
                                              style={styles.unequipBtn}
                                              disabled={!!busy}
                                              onPress={() =>
                                                equipOrigin(piece.slotId, null)
                                              }
                                            >
                                              <Text style={styles.unequipBtnText}>
                                                {busy === uneqKey ? '…' : 'Unequip'}
                                              </Text>
                                            </Pressable>
                                          </>
                                        ) : (
                                          <Pressable
                                            style={[
                                              styles.equipBtn,
                                              { backgroundColor: col },
                                            ]}
                                            disabled={!!busy}
                                            onPress={() =>
                                              equipOrigin(piece.slotId, origin.id)
                                            }
                                          >
                                            <Text style={styles.equipBtnText}>
                                              {busy === eqKey
                                                ? '…'
                                                : autoEquip
                                                  ? 'EQUIP (switches to Pick My Own)'
                                                  : `EQUIP ${origin.name} ${piece.slotName}`}
                                            </Text>
                                          </Pressable>
                                        )}
                                      </View>
                                    ) : (
                                      <Text style={styles.mergeAllHint}>
                                        You don’t own this piece yet — drops from
                                        pits / Campaign.
                                      </Text>
                                    )}

                                    {canMergeAny ? (
                                      <Text style={styles.mergeAllHint}>
                                        Merge all = keep 3→1 from lowest level
                                        until nothing left to merge.
                                      </Text>
                                    ) : null}
                                    {!levels.length ? (
                                      <Text style={styles.tierBonus}>
                                        {canEquip
                                          ? 'Levels load below after refresh if missing.'
                                          : 'None yet — drops from pits / Campaign.'}
                                      </Text>
                                    ) : (
                                      levels
                                        .slice()
                                        .sort(
                                          (a, b) =>
                                            (b.level || b.tier) -
                                            (a.level || a.tier)
                                        )
                                        .map((lv) => {
                                          const L = lv.level || lv.tier;
                                          const busyKey = `merge_${origin.id}_${piece.slotId}_${L}`;
                                          return (
                                            <View
                                              key={L}
                                              style={styles.lvlRow}
                                            >
                                              <View style={{ flex: 1 }}>
                                                <Text style={styles.tierLabel}>
                                                  Level {L}
                                                  {lv.equipped ? ' · equipped' : ''}
                                                </Text>
                                                <Text style={styles.tierBonus}>
                                                  ×{lv.count} owned · {lv.bonusLabel}
                                                </Text>
                                              </View>
                                              {lv.canMerge ? (
                                                <Pressable
                                                  style={[
                                                    styles.mergeBtn,
                                                    { backgroundColor: col },
                                                  ]}
                                                  disabled={!!busy}
                                                  onPress={() =>
                                                    merge(
                                                      origin.id,
                                                      piece.slotId,
                                                      L
                                                    )
                                                  }
                                                >
                                                  <Text
                                                    style={styles.mergeBtnText}
                                                  >
                                                    {busy === busyKey
                                                      ? '…'
                                                      : `Merge 3 → L${L + 1}`}
                                                  </Text>
                                                </Pressable>
                                              ) : L < (gear?.maxLevel || 50) ? (
                                                <Text style={styles.mergeHint}>
                                                  need{' '}
                                                  {(lv.mergeNeed || mergeNeed) -
                                                    lv.count}{' '}
                                                  more
                                                </Text>
                                              ) : (
                                                <Text style={styles.mergeHint}>
                                                  max
                                                </Text>
                                              )}
                                            </View>
                                          );
                                        })
                                    )}
                                    <Text style={styles.pieceDetailFoot}>
                                      Equip uses your highest level of this
                                      piece. Merge {mergeNeed} of the same level
                                      to upgrade — or Merge all to cascade.
                                    </Text>
                                  </View>
                                );
                              })()
                            ) : null}
                          </View>
                        );
                      })
                    )}
                    <Text style={styles.foot}>
                      Gear affects pits & Campaign combat — not pot ticket odds.
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={styles.howBox}>
                      <Text style={styles.howTitle}>How tech works</Text>
                      <Text style={styles.howText}>
                        Spend gems (from pits, store, dailies) on a permanent
                        rank. Each buy raises base ATK, HP, DEF, or SPD forever.
                      </Text>
                      <Text style={styles.howText}>
                        That base stacks with gear bonuses and is used in
                        Campaign bosses and pit fights.
                      </Text>
                    </View>

                    {branches.map((b) => {
                      const nodes = tree.filter((n) => n.branch === b.id);
                      if (!nodes.length) return null;
                      const color =
                        b.id === 'atk'
                          ? colors.accentHot
                          : b.id === 'hp'
                            ? colors.win
                            : b.id === 'def'
                              ? colors.gem
                              : colors.gold;
                      return (
                        <View key={b.id} style={styles.branch}>
                          <Text style={[styles.branchTitle, { color }]}>
                            {b.label}
                          </Text>
                          {nodes.map((n) => {
                            const lvl = n.level || 0;
                            const maxed = n.maxed;
                            const locked = n.locked;
                            return (
                              <Pressable
                                key={n.id}
                                style={[
                                  styles.node,
                                  maxed && styles.nodeMax,
                                  locked && styles.nodeLocked,
                                ]}
                                disabled={maxed || locked || busy === n.id}
                                onPress={() => buy(n.id)}
                              >
                                <View style={styles.nodeTop}>
                                  <Text style={styles.nodeName}>{n.name}</Text>
                                  <Text style={styles.nodeLvl}>
                                    {lvl}/{n.max}
                                  </Text>
                                </View>
                                <Text style={styles.nodeGain}>
                                  Each rank: {n.gainLabel}
                                </Text>
                                <Text style={styles.nodeDesc} numberOfLines={2}>
                                  {n.desc ||
                                    `Permanent ${n.gainLabel} on your hero`}
                                </Text>
                                <View style={styles.pips}>
                                  {Array.from({ length: n.max }).map((_, i) => (
                                    <View
                                      key={i}
                                      style={[
                                        styles.pip,
                                        i < lvl && { backgroundColor: color },
                                      ]}
                                    />
                                  ))}
                                </View>
                                <Text style={styles.nodeBuy}>
                                  {maxed
                                    ? 'MAXED'
                                    : locked
                                      ? n.lockReason
                                      : busy === n.id
                                        ? '…'
                                        : `Buy next · 💎 ${n.nextCost} · get ${n.gainLabel}`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                    <Pressable
                      onPress={() => router.push('/store')}
                      style={styles.storeLink}
                    >
                      <Text style={styles.storeLinkText}>
                        Need gems? Open store →
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => router.replace('/')}
                      style={styles.storeLink}
                    >
                      <Text style={styles.storeLinkText}>
                        Earn gems in pits → lobby
                      </Text>
                    </Pressable>
                  </>
                )}
              </ScrollView>
            </View>
          </View>

          <View style={[styles.heroCol, { width: heroSize + 48 }]}>
            {/* Warm charcoal pedestal — avoids purple lobby wash clashing with Elderblight */}
            <View style={styles.heroPedestal}>
              <View style={styles.heroPedestalGlow} />
              <HeroEvolve
                gender={user.gender || 'boy'}
                race={user.race || 'human'}
                classId={user.classId || 'warrior'}
                upgrades={user.upgrades || {}}
                gearKinds={kinds}
                gearOrigin={gear?.setActive ? gear?.set?.originId || null : null}
                avatarUrl={user.avatarUrl}
                size={heroSize}
              />
            </View>
            <Text style={styles.heroGearHint}>
              {gear?.setActive
                ? `★ SET BONUS · ${gear.set?.originName || 'set'} “${gear.set?.name || ''}” on your ${user.race || 'hero'} ${user.classId || ''}`
                : kinds.some((k) => k.equipped)
                  ? autoEquip
                    ? 'Auto equip is on — switch to Pick My Own or ★ WEAR SET for set bonus'
                    : 'Need all 5 slots same origin for ★ set bonus + outfit art'
                  : 'No gear yet — win pits/Campaign for drops'}
            </Text>
          </View>
        </View>
      </View>

      {/* Set bonus ladder — floating popup (not an inline expand) */}
      <Modal
        visible={!!infoOrigin}
        transparent
        animationType="fade"
        onRequestClose={closeSetInfo}
      >
        <View style={styles.infoModalRoot} pointerEvents="box-none">
          <Pressable style={styles.infoModalBackdrop} onPress={closeSetInfo} />
          {infoOrigin ? (
            <View
              style={[
                styles.infoPopup,
                {
                  width: popupW,
                  maxHeight: popupH,
                  left: popupLeft,
                  top: popupTop,
                  borderColor: infoCol,
                  ...(Platform.OS === 'web'
                    ? { boxShadow: `0 12px 40px ${infoCol}55` }
                    : {}),
                },
              ]}
            >
              <View style={styles.infoPopupHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.infoPopupTitle, { color: infoCol }]}>
                    {infoOrigin.emoji} {infoOrigin.name}
                  </Text>
                  <Text style={styles.infoPopupSet}>
                    ★ SET BONUS · “{infoOrigin.setName}”
                  </Text>
                </View>
                <Pressable
                  onPress={closeSetInfo}
                  style={[styles.infoPopupClose, { borderColor: infoCol }]}
                  hitSlop={10}
                >
                  <Text style={[styles.infoPopupCloseText, { color: infoCol }]}>
                    ✕
                  </Text>
                </Pressable>
              </View>
              <View style={styles.infoBonusCallout}>
                <Text style={styles.infoBonusCalloutTitle} numberOfLines={1}>
                  {infoOrigin.complete
                    ? '★ Set bonus active'
                    : 'Wear all 5 pieces to unlock'}
                </Text>
                <Text style={styles.boostBlurb} numberOfLines={3}>
                  {infoOrigin.blurb}
                </Text>
              </View>
              <Text style={styles.boostNote} numberOfLines={2}>
                Set level = lowest of your 5 equipped pieces. Pool values are
                whole numbers (×1…×50), then ÷ number of targets.
              </Text>
              <ScrollView
                style={styles.infoPopupScroll}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {(infoOrigin.boostLadder || []).length ? (
                  (infoOrigin.boostLadder || []).map((row) => (
                    <View key={row.level} style={styles.boostRow}>
                      <Text style={[styles.boostLvl, { color: infoCol }]}>
                        L{row.level}
                      </Text>
                      <Text style={styles.boostSum} numberOfLines={3}>
                        {row.summary}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.boostNote}>
                    Ladder empty — tap ↻ Refresh gear.
                  </Text>
                )}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  root: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 14,
    paddingBottom: 16,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    // Warm neutral wash so purple set armor doesn’t fight the lobby purple
    backgroundColor: 'rgba(18, 12, 8, 0.55)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },

  stage: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    minHeight: 0,
  },
  stageWide: { gap: 28, justifyContent: 'center' },
  sideCol: { flex: 1, minWidth: 0, maxWidth: 420, gap: 8 },
  sideColWide: { maxWidth: 400 },
  identity: { marginBottom: 2 },
  name: {
    color: '#f5efe3',
    fontWeight: '900',
    fontSize: 20,
  },
  tierLook: {
    color: 'rgba(245,239,227,0.7)',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statChip: {
    backgroundColor: '#1a140e',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#c9a24a',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 64,
  },
  statChipGeared: {
    borderColor: '#22d3ee',
    backgroundColor: '#0c1a22',
  },
  statK: {
    color: 'rgba(245,239,227,0.65)',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  statV: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 18,
    marginTop: 2,
  },
  statSplit: {
    color: '#6ec9d4',
    fontWeight: '700',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'center',
  },
  heroGearHint: {
    color: 'rgba(245,239,227,0.65)',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 160,
    lineHeight: 14,
  },
  powerBox: {
    backgroundColor: '#16110c',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.4)',
    padding: 10,
  },
  powerTitle: {
    color: '#e8c56a',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  powerLine: {
    color: '#f5efe3',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  powerGear: {
    color: '#fbbf24',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 8,
  },
  heroCol: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  /** Charcoal-bronze stage so purple armor reads; not lobby violet */
  heroPedestal: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(201,162,74,0.55)',
    backgroundColor: '#14100c',
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  heroPedestalGlow: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    bottom: 18,
    height: 28,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    flex: 1,
    minHeight: 200,
    maxHeight: 520,
    backgroundColor: '#1c1410',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#c9a24a',
    overflow: 'hidden',
  },
  tabs: {
    flexDirection: 'row',
    gap: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(201,162,74,0.35)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#120e0c',
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: '#2a2010',
    borderBottomWidth: 3,
    borderBottomColor: '#fbbf24',
  },
  tabText: {
    color: 'rgba(245,239,227,0.5)',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.2,
  },
  tabTextOn: { color: '#fbbf24' },
  scroll: { flex: 1, minHeight: 0 },
  pad: { padding: 12, paddingBottom: 16 },
  howBox: {
    backgroundColor: '#0c0a12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    padding: 10,
    marginBottom: 12,
  },
  howTitle: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 6,
  },
  howText: {
    color: '#f5efe3',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  kitSummary: {
    backgroundColor: 'rgba(12, 8, 20, 0.85)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.4)',
    padding: 10,
    marginBottom: 12,
  },
  kitSummaryTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
    textAlign: 'center',
  },
  kitSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  kitSlot: {
    width: '23%',
    minWidth: 64,
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  kitSlotEmoji: { fontSize: 18 },
  kitSlotStat: { fontWeight: '900', fontSize: 11, marginTop: 3 },
  kitSlotTier: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 9,
    marginTop: 2,
  },
  empty: {
    color: colors.muted,
    fontWeight: '700',
    textAlign: 'center',
    padding: 16,
  },
  kindCard: {
    backgroundColor: '#12101a',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.55)',
    padding: 12,
    marginBottom: 10,
  },
  kindTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kindIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindEmoji: { fontSize: 22 },
  kindName: { color: '#f5efe3', fontWeight: '900', fontSize: 15 },
  kindShort: { color: '#fbbf24', fontWeight: '800', fontSize: 13 },
  kindBlurb: {
    color: 'rgba(245,239,227,0.75)',
    fontWeight: '600',
    fontSize: 12,
    marginTop: 2,
  },
  gearLead: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    textAlign: 'center',
  },
  bagBar: {
    backgroundColor: '#0a1620',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(110,201,212,0.55)',
    padding: 10,
    marginBottom: 12,
  },
  bagBarTitle: {
    color: '#6ec9d4',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  bagBarLine: {
    color: '#f5efe3',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
  bagRefresh: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(110,201,212,0.15)',
  },
  bagRefreshText: {
    color: '#6ec9d4',
    fontWeight: '800',
    fontSize: 11,
  },
  modeBar: {
    backgroundColor: '#12101a',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.45)',
    padding: 10,
    marginBottom: 12,
  },
  modeBarTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#0a0810',
    alignItems: 'center',
  },
  modeBtnOn: {
    borderColor: '#6ec9d4',
    backgroundColor: 'rgba(110,201,212,0.2)',
  },
  modeBtnOnPick: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251,191,36,0.18)',
  },
  modeBtnText: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  modeBtnTextOn: {
    color: '#f5efe3',
  },
  modeHint: {
    color: 'rgba(245,239,227,0.72)',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
  },
  pieceCount: {
    color: 'rgba(245,239,227,0.75)',
    fontWeight: '800',
    fontSize: 10,
    marginTop: 1,
  },
  equippedTag: {
    fontWeight: '900',
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  equipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  equipBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexGrow: 1,
    alignItems: 'center',
  },
  equipBtnText: {
    color: '#0a0614',
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },
  equippedPill: {
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  equippedPillText: {
    fontWeight: '900',
    fontSize: 12,
  },
  unequipBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  unequipBtnText: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 11,
  },
  setBox: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 10,
    marginBottom: 12,
  },
  setBoxOn: {
    // Gold/bronze active — not purple (clashes with Elderblight art)
    backgroundColor: 'rgba(50, 36, 12, 0.85)',
    borderColor: 'rgba(251, 191, 36, 0.7)',
  },
  setBoxOff: {
    backgroundColor: 'rgba(20, 12, 8, 0.9)',
    borderColor: 'rgba(251,191,36,0.4)',
  },
  setBonusBadge: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  setBonusBadgeOff: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  setTitle: {
    color: '#f5efe3',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 4,
  },
  setTitleOff: {
    color: '#f5efe3',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 4,
  },
  setBody: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 15,
  },
  setProgressHint: {
    color: 'rgba(245,239,227,0.75)',
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 6,
  },
  wornStrip: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  wornChip: {
    flex: 1,
    minWidth: 48,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  wornChipEmoji: { fontSize: 14 },
  wornChipOrigin: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 9,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  setTeaser: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    padding: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  setTeaserTitle: {
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.2,
    marginBottom: 3,
    flexShrink: 1,
  },
  setTeaserBody: {
    color: 'rgba(245,239,227,0.85)',
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 14,
    flexShrink: 1,
  },
  setTeaserProgress: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 10,
    marginTop: 5,
    flexShrink: 1,
  },
  wearBtnActive: {
    borderWidth: 2,
    borderColor: '#f5efe3',
  },
  infoBonusCallout: {
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    padding: 8,
    marginBottom: 8,
  },
  infoBonusCalloutTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    marginBottom: 4,
  },
  setRowCard: {
    backgroundColor: 'rgba(18, 12, 8, 0.94)',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 14,
  },
  setNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  setNameBig: {
    flex: 1,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.6,
  },
  setNameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: { fontWeight: '900', fontSize: 14 },
  wearBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  wearBtnText: {
    color: '#0a0614',
    fontWeight: '900',
    fontSize: 11,
  },
  wearingTag: {
    fontWeight: '800',
    fontSize: 11,
    marginBottom: 8,
  },
  ownedTag: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    marginBottom: 8,
  },
  pieceRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  pieceCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  pieceEmoji: { fontSize: 20, marginBottom: 2 },
  pieceName: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 9,
    textAlign: 'center',
  },
  pieceLvl: {
    fontWeight: '900',
    fontSize: 12,
    marginTop: 2,
  },
  upgradeTag: {
    color: '#fbbf24',
    fontWeight: '800',
    fontSize: 9,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  upgradeTagOff: {
    fontSize: 9,
    marginTop: 2,
  },
  pieceDetail: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  pieceDetailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pieceDetailTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 8,
  },
  mergeAllBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  mergeAllBtnText: {
    color: '#0a0614',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  mergeAllHint: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
  },
  pieceDetailFoot: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 10,
    marginTop: 8,
    lineHeight: 14,
  },
  lvlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  boostBlurb: {
    color: colors.cream,
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 4,
    flexShrink: 1,
  },
  boostNote: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
  },
  boostRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  boostLvl: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 12,
    width: 36,
  },
  boostSum: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(245,239,227,0.88)',
    fontWeight: '600',
    fontSize: 10,
    lineHeight: 14,
  },
  infoModalRoot: {
    flex: 1,
  },
  infoModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 2, 12, 0.55)',
  },
  infoPopup: {
    position: 'absolute',
    backgroundColor: '#16110c',
    borderRadius: 14,
    borderWidth: 2,
    padding: 12,
    zIndex: 20,
    // Keep popup above backdrop on native
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  infoPopupHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  infoPopupTitle: {
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.4,
  },
  infoPopupSet: {
    color: 'rgba(245,239,227,0.75)',
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  infoPopupClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoPopupCloseText: {
    fontWeight: '900',
    fontSize: 13,
  },
  infoPopupScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 120,
  },
  tierActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  equipBanner: {
    marginTop: 10,
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22d3ee',
    padding: 8,
  },
  equipBannerText: {
    color: '#67e8f9',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
  equipBannerText: {
    color: '#67e8f9',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyBanner: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    padding: 8,
  },
  emptyBannerText: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '700',
    fontSize: 11,
  },
  tierList: { marginTop: 10 },
  tierHead: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '700',
    fontSize: 10,
    marginBottom: 6,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tierLabel: {
    color: '#f5efe3',
    fontWeight: '900',
    fontSize: 13,
  },
  tierBonus: {
    color: 'rgba(245,239,227,0.7)',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 2,
  },
  mergeBtn: {
    backgroundColor: '#fbbf24',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mergeBtnText: {
    color: '#1a1008',
    fontWeight: '900',
    fontSize: 11,
  },
  mergeHint: {
    color: 'rgba(245,239,227,0.4)',
    fontWeight: '700',
    fontSize: 10,
    maxWidth: 72,
    textAlign: 'right',
  },
  foot: {
    color: 'rgba(245,239,227,0.45)',
    fontWeight: '600',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 14,
  },
  branch: { marginBottom: 14 },
  branchTitle: {
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  node: {
    backgroundColor: '#12101a',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.55)',
    padding: 12,
    marginBottom: 8,
  },
  nodeMax: { borderColor: 'rgba(74,222,128,0.7)' },
  nodeLocked: { opacity: 0.55 },
  nodeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeName: { color: '#f5efe3', fontWeight: '900', fontSize: 14 },
  nodeLvl: {
    color: 'rgba(245,239,227,0.65)',
    fontWeight: '800',
    fontSize: 12,
  },
  nodeGain: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 15,
    marginTop: 4,
  },
  nodeDesc: {
    color: 'rgba(245,239,227,0.7)',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  pips: { flexDirection: 'row', gap: 4, marginTop: 8 },
  pip: {
    width: 14,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  nodeBuy: {
    color: '#22d3ee',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 8,
  },
  storeLink: { marginTop: 6, padding: 8 },
  storeLinkText: {
    color: '#22d3ee',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
});
