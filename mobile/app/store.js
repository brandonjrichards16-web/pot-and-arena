import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  Dimensions,
  // StyleSheet used for absoluteFill
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import FunShell from '../components/FunShell';
import ResourcePills from '../components/ResourcePills';
import JuicyButton from '../components/JuicyButton';
import { alertMsg } from '../lib/dialogs';
import BackToLobby from '../components/BackToLobby';

const { height: WIN_H } = Dimensions.get('window');
const PANEL_MAX_H = Math.min(560, Math.round(WIN_H * 0.82));
const PATH_CARD_W = 72;

const GEAR_ORIGINS_UI = [
  { id: 'human', name: 'Human-Forged', emoji: '⚒️' },
  { id: 'elvan', name: 'Elvan-Made', emoji: '🌿' },
  { id: 'ork', name: 'Ork-Made', emoji: '💀' },
  { id: 'concord', name: 'Concord Alloy', emoji: '🕊️' },
  { id: 'elderblight', name: 'Elderblight', emoji: '☠️' },
];
const GEAR_SLOTS_UI = [
  { id: 'blade', name: 'Sword', emoji: '⚔️' },
  { id: 'helm', name: 'Helm', emoji: '🪖' },
  { id: 'mail', name: 'Cuirass', emoji: '🦺' },
  { id: 'shield', name: 'Shield', emoji: '🛡️' },
  { id: 'greaves', name: 'Greaves', emoji: '🥾' },
];

/**
 * Merchant store — solid panel, compact CTAs.
 * Mock purchases use an in-game confirm sheet (web-safe; Alert often fails on web).
 */
export default function StoreScreen() {
  const router = useRouter();
  const pathScroll = useRef(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [balances, setBalances] = useState({ COIN: 0, GEM: 0 });
  const [catalog, setCatalog] = useState(null);
  /** { title, body, confirmLabel, onConfirm } | null */
  const [confirm, setConfirm] = useState(null);
  /** Piece / L3 picker: { offer, phase: 'piece'|'l3', originId, slotId } | null */
  const [gearPick, setGearPick] = useState(null);

  function leaveStore() {
    setConfirm(null);
    // Prefer back; if stack is empty (web), go home
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  const load = useCallback(async () => {
    try {
      const [me, store] = await Promise.all([api.me(), api.store()]);
      setBalances(me.balances || { COIN: 0, GEM: 0 });
      setCatalog(store);
    } catch (e) {
      alertMsg('Store', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const nodes = catalog?.daily?.nodes || [];
    const step = catalog?.daily?.step ?? 0;
    const idx = nodes.findIndex((n) => n.index === step);
    if (idx >= 0 && pathScroll.current) {
      const x = Math.max(0, idx * (PATH_CARD_W + 8) - 24);
      setTimeout(() => {
        pathScroll.current?.scrollTo?.({ x, animated: true });
      }, 80);
    }
  }, [catalog?.daily?.step, catalog?.daily?.nodes?.length]);

  function openConfirm({ title, body, confirmLabel = 'Continue', onConfirm }) {
    setConfirm({ title, body, confirmLabel, onConfirm });
  }

  async function runBuy(productId, label, priceUsd) {
    openConfirm({
      title: 'You are about to purchase',
      body:
        `${label}\n` +
        (priceUsd != null ? `Price: $${Number(priceUsd).toFixed(2)}\n\n` : '\n') +
        'This is a MOCK checkout for playtesting.\n' +
        'No real money will be charged.\n' +
        'Gems / perks still apply so you can try upgrades.',
      confirmLabel: 'Continue · mock buy',
      onConfirm: async () => {
        setConfirm(null);
        setBusy(productId);
        try {
          const res = await api.storePurchase(productId);
          setCatalog(res.store);
          setBalances(res.balances || balances);
          // Gems update in the header — no second popup after Continue
        } catch (e) {
          alertMsg('Purchase failed', e.message);
        } finally {
          setBusy(null);
        }
      },
    });
  }

  function offerPriceLabel(offer) {
    if (offer.currency === 'USD' && offer.priceUsd != null) {
      return `$${Number(offer.priceUsd).toFixed(2)}`;
    }
    return `💎${offer.gemCost || 0}`;
  }

  function startGearBuy(offer) {
    if (offer.needsPiecePick || offer.needsL3Pick) {
      setGearPick({
        offer,
        phase: offer.needsPiecePick ? 'piece' : 'l3',
        originId: offer.originId || 'human',
        slotId: 'blade',
      });
      return;
    }
    confirmGearBuy(offer, {});
  }

  function confirmGearBuy(offer, opts) {
    setGearPick(null);
    const isUsd = offer.currency === 'USD';
    const cost = offerPriceLabel(offer);
    openConfirm({
      title: isUsd ? 'Mock purchase · gear' : 'Spend gems on gear?',
      body:
        `${offer.label}\n` +
        `Cost: ${cost}\n` +
        (offer.blurb ? `${offer.blurb}\n\n` : '\n') +
        (opts.pickOriginId
          ? `Bonus L3: ${opts.pickOriginId} / ${opts.pickSlotId}\n\n`
          : opts.originId
            ? `Piece: ${opts.originId} / ${opts.slotId}\n\n`
            : '') +
        (isUsd
          ? 'MOCK checkout — no card charged.\n'
          : '') +
        'All shop gear is low-level. Merge is how you grow power.',
      confirmLabel: isUsd ? `Continue · ${cost}` : `Buy · ${cost}`,
      onConfirm: async () => {
        setConfirm(null);
        setGearPick(null);
        setBusy(offer.id);
        try {
          const res = await api.storeGearBuy(offer.id, opts);
          setCatalog(res.store);
          setBalances(res.balances || balances);
          const lines = (res.granted || [])
            .slice(0, 8)
            .map((g) => g.label)
            .join('\n');
          const extra =
            (res.granted || []).length > 8
              ? `\n…+${(res.granted || []).length - 8} more`
              : '';
          alertMsg(
            'Gear chest',
            res.message + (lines ? `\n\n${lines}${extra}` : '')
          );
        } catch (e) {
          alertMsg('Gear shop', e.message);
        } finally {
          setBusy(null);
        }
      },
    });
  }

  async function claimPathNode() {
    const cur = catalog?.daily?.current;
    if (!cur) return;

    if (cur.type === 'buy') {
      openConfirm({
        title: 'You are about to purchase',
        body:
          `${cur.label || 'Path deal'}\n` +
          `+${cur.gems} gems · +${cur.coins} coins` +
          (cur.adSkips ? ` · +${cur.adSkips} ad-skips` : '') +
          `\nPrice: $${cur.priceUsd?.toFixed(2)}\n\n` +
          'MOCK checkout — no card charged.',
        confirmLabel: 'Continue · mock buy',
        onConfirm: async () => {
          setConfirm(null);
          setBusy('path');
          try {
            const res = await api.storeDailyPathBuy();
            setCatalog(res.store);
            setBalances(res.balances || balances);
            // No second popup — confirm sheet already listed the rewards
          } catch (e) {
            alertMsg('Purchase failed', e.message);
          } finally {
            setBusy(null);
          }
        },
      });
      return;
    }

    // Free + mock-ad claims: no popup — path cards already show the reward.
    // Only paid nodes use the "about to purchase" sheet.
    setBusy('path');
    try {
      const res = await api.storeDailyClaim({ mockAd: true });
      setCatalog(res.store);
      setBalances(res.balances || balances);
    } catch (e) {
      alertMsg('Daily path', e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading || !catalog) {
    return (
      <FunShell dim>
        <View style={styles.backdrop}>
          <View style={[styles.panel, styles.panelLoading]}>
            <ActivityIndicator color={colors.gold} />
            <Pressable onPress={leaveStore} style={styles.leaveBtn}>
              <Text style={styles.leaveBtnText}>Close store</Text>
            </Pressable>
          </View>
        </View>
      </FunShell>
    );
  }

  const gems = (catalog.products || []).filter((p) => p.type === 'gems');
  const packs = (catalog.products || []).filter(
    (p) => p.type === 'bundle' || p.type === 'skips' || p.type === 'boost'
  );
  const vip = (catalog.products || []).find((p) => p.type === 'subscription');
  const cur = catalog.daily?.current;

  return (
    <FunShell dim>
      <View style={styles.backdrop} pointerEvents="box-none">
        {/* Dim tap-outside — behind panel so it never steals the ✕ */}
        <Pressable
          style={styles.dimTap}
          onPress={leaveStore}
          accessibilityLabel="Close store"
        />

        <View style={styles.panel} pointerEvents="auto">
          <View style={styles.topBar}>
            <BackToLobby label="Lobby" onPress={leaveStore} />
            <View style={styles.topMid}>
              <Text style={[styles.sub, { textAlign: 'center' }]}>Mock buys · no card charged</Text>
            </View>
            <ResourcePills coins={balances.COIN} gems={balances.GEM} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.pad}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Daily path</Text>
              <Text style={styles.blockHint}>
                Free ↔ ad, then a paid deal · resets each day · scroll →
              </Text>
              <ScrollView
                ref={pathScroll}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pathTrack}
              >
                {(catalog.daily?.nodes || []).map((n, i) => {
                  const isCur = n.status === 'current';
                  const isDone = n.status === 'claimed';
                  const isBuy = n.type === 'buy';
                  return (
                    <View key={n.index} style={styles.pathStep}>
                      {i > 0 ? <View style={styles.pathLine} /> : null}
                      <Pressable
                        disabled={!isCur || busy === 'path'}
                        onPress={claimPathNode}
                        style={[
                          styles.pathCard,
                          isCur && styles.pathCardCur,
                          isDone && styles.pathCardDone,
                          isBuy && styles.pathCardBuy,
                          !isCur && !isDone && styles.pathCardLock,
                        ]}
                      >
                        <Text style={styles.pathType}>
                          {isDone
                            ? '✓'
                            : n.type === 'free'
                              ? 'FREE'
                              : n.type === 'ad'
                                ? 'AD'
                                : 'BUY'}
                        </Text>
                        <Text style={styles.pathGems}>💎{n.gems}</Text>
                        <Text style={styles.pathCoins}>🪙{n.coins}</Text>
                        {isBuy ? (
                          <Text style={styles.pathPrice}>
                            ${n.priceUsd?.toFixed(2)}
                          </Text>
                        ) : (
                          <Text style={styles.pathCta}>
                            {isDone ? '—' : n.cta}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
              <JuicyButton
                size="md"
                bounce={false}
                label={
                  busy === 'path'
                    ? '…'
                    : cur?.type === 'buy'
                      ? cur.cta || 'BUY DEAL'
                      : cur?.type === 'ad'
                        ? 'WATCH AD'
                        : cur?.type === 'free'
                          ? 'CLAIM FREE'
                          : 'CLAIM'
                }
                onPress={claimPathNode}
                color={
                  cur?.type === 'buy' ? 'hot' : cur?.type === 'ad' ? 'gem' : 'gold'
                }
                disabled={busy === 'path' || !cur}
                style={styles.ctaMd}
              />
            </View>

            {vip ? (
              <View style={[styles.block, styles.vipBlock]}>
                <View style={styles.vipRow}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                    <Text style={styles.tag}>MONTHLY · MOCK</Text>
                    <Text style={styles.blockTitle}>{vip.label}</Text>
                    <Text style={styles.price}>
                      ${vip.priceUsd.toFixed(2)}/mo
                    </Text>
                    <Text style={styles.cardBody} numberOfLines={2}>
                      {vip.blurb}
                    </Text>
                    {catalog.vip?.active ? (
                      <Text style={styles.activeNote}>
                        Active ·{' '}
                        {new Date(catalog.vip.until).toLocaleDateString()}
                      </Text>
                    ) : null}
                  </View>
                  <JuicyButton
                    size="sm"
                    bounce={false}
                    label={
                      busy === vip.id
                        ? '…'
                        : catalog.vip?.active
                          ? 'EXTEND'
                          : 'GET VIP'
                    }
                    onPress={() => runBuy(vip.id, vip.label, vip.priceUsd)}
                    color="hot"
                    style={styles.vipBtn}
                  />
                </View>
              </View>
            ) : null}

            {(catalog.gearSections || [
              { id: 'gem_l1', title: 'GEAR · GEM PACKS (L1)', hint: '' },
              { id: 'usd_piece', title: 'GEAR · PICK A PIECE', hint: '' },
              { id: 'usd_l2', title: 'GEAR · ADEPT (L2)', hint: '' },
              { id: 'usd_super', title: 'GEAR · SUPER', hint: '' },
            ]).map((sec) => {
              const rows = (catalog.gearShop || []).filter(
                (o) => (o.section || 'other') === sec.id
              );
              if (!rows.length) return null;
              return (
                <View key={sec.id}>
                  <Text style={styles.section}>{sec.title}</Text>
                  {sec.hint ? (
                    <Text style={styles.sectionHint}>{sec.hint}</Text>
                  ) : null}
                  {rows.map((o) => (
                    <Pressable
                      key={o.id}
                      style={[
                        styles.row,
                        o.currency === 'GEM' && !o.canAfford && styles.soldOut,
                      ]}
                      disabled={busy === o.id}
                      onPress={() => startGearBuy(o)}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowLabel}>{o.label}</Text>
                          {o.tag ? (
                            <Text style={styles.rowTag}>{o.tag}</Text>
                          ) : null}
                        </View>
                        {o.blurb ? (
                          <Text style={styles.rowBlurb} numberOfLines={2}>
                            {o.blurb}
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.rowPrice,
                          {
                            color:
                              o.currency === 'USD'
                                ? colors.gold
                                : o.canAfford
                                  ? colors.gem
                                  : colors.muted,
                          },
                        ]}
                      >
                        {busy === o.id ? '…' : offerPriceLabel(o)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })}

            <Text style={styles.section}>GEM PACKS · TAP A ROW TO BUY</Text>
            {gems.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.row, p.soldOut && styles.soldOut]}
                disabled={p.soldOut || busy === p.id}
                onPress={() => runBuy(p.id, p.label, p.priceUsd)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowLabel}>{p.label}</Text>
                    {p.tag ? <Text style={styles.rowTag}>{p.tag}</Text> : null}
                  </View>
                  <Text style={styles.rowGems}>
                    {p.gemsTotal} gems
                    {p.vipBonusApplied ? ' · VIP bonus' : ''}
                  </Text>
                </View>
                <Text style={styles.rowPrice}>${p.priceUsd.toFixed(2)}</Text>
              </Pressable>
            ))}

            <Text style={styles.section}>PLAY FASTER</Text>
            {packs.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.row, p.soldOut && styles.soldOut]}
                disabled={p.soldOut || busy === p.id}
                onPress={() => runBuy(p.id, p.label, p.priceUsd)}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowLabel}>{p.label}</Text>
                    {p.tag ? <Text style={styles.rowTag}>{p.tag}</Text> : null}
                  </View>
                  {p.blurb ? (
                    <Text style={styles.rowBlurb} numberOfLines={2}>
                      {p.blurb}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.rowPrice}>
                  {p.soldOut ? 'OWNED' : `$${p.priceUsd.toFixed(2)}`}
                </Text>
              </Pressable>
            ))}

            <Text style={styles.foot}>
              All purchases are mock for playtests · pot odds never change
            </Text>
            <Pressable onPress={leaveStore} style={styles.leaveBtn}>
              <Text style={styles.leaveBtnText}>← Back to lobby</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Gear piece / L3 picker */}
        <Modal
          visible={!!gearPick}
          transparent
          animationType="fade"
          onRequestClose={() => setGearPick(null)}
        >
          <View style={styles.modalBack}>
            <View style={[styles.modalCard, { maxWidth: 360 }]}>
              <Text style={styles.modalTitle}>
                {gearPick?.phase === 'l3'
                  ? 'Pick your free L3 bonus'
                  : 'Pick your L1 piece'}
              </Text>
              <Text style={styles.modalBody}>
                {gearPick?.offer?.label}
                {'\n'}
                {gearPick?.phase === 'l3'
                  ? 'Super packs include one L3 of your choice on top of the bulk L2 haul.'
                  : 'Always L1 — merge to grow it.'}
              </Text>
              <Text style={styles.pickLabel}>Origin</Text>
              <View style={styles.pickRow}>
                {GEAR_ORIGINS_UI.map((o) => {
                  const on = gearPick?.originId === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      style={[styles.pickChip, on && styles.pickChipOn]}
                      onPress={() =>
                        setGearPick((p) => (p ? { ...p, originId: o.id } : p))
                      }
                    >
                      <Text style={styles.pickChipText}>
                        {o.emoji} {o.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.pickLabel}>Piece</Text>
              <View style={styles.pickRow}>
                {GEAR_SLOTS_UI.map((s) => {
                  const on = gearPick?.slotId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.pickChip, on && styles.pickChipOn]}
                      onPress={() =>
                        setGearPick((p) => (p ? { ...p, slotId: s.id } : p))
                      }
                    >
                      <Text style={styles.pickChipText}>
                        {s.emoji} {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setGearPick(null)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalOk}
                  onPress={() => {
                    if (!gearPick?.offer) return;
                    const o = gearPick.offer;
                    const opts =
                      gearPick.phase === 'l3'
                        ? {
                            pickOriginId: gearPick.originId,
                            pickSlotId: gearPick.slotId,
                          }
                        : {
                            originId: gearPick.originId,
                            slotId: gearPick.slotId,
                          };
                    confirmGearBuy(o, opts);
                  }}
                >
                  <Text style={styles.modalOkText}>
                    Continue · {gearPick ? offerPriceLabel(gearPick.offer) : ''}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Purchase confirm sheet — always works on web */}
        <Modal
          visible={!!confirm}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirm(null)}
        >
          <View style={styles.modalBack}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {confirm?.title || 'Confirm'}
              </Text>
              <Text style={styles.modalBody}>{confirm?.body}</Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setConfirm(null)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={styles.modalOk}
                  onPress={() => confirm?.onConfirm?.()}
                >
                  <Text style={styles.modalOkText}>
                    {confirm?.confirmLabel || 'Continue'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  dimTap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    maxHeight: PANEL_MAX_H,
    zIndex: 10,
    elevation: 20,
    backgroundColor: '#1c1410',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#c9a24a',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  panelLoading: {
    minHeight: 140,
    maxWidth: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#14100c',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(201,162,74,0.4)',
    zIndex: 20,
  },
  closeHit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a1810',
    borderWidth: 2,
    borderColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  close: { color: '#fbbf24', fontWeight: '900', fontSize: 16 },
  leaveBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.5)',
    backgroundColor: '#14100c',
  },
  leaveBtnText: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 13,
  },
  topMid: { flex: 1, minWidth: 0 },
  title: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sub: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '600',
    fontSize: 10,
    marginTop: 1,
  },
  scroll: { maxHeight: PANEL_MAX_H - 56 },
  pad: { padding: 12, paddingBottom: 16 },
  block: {
    backgroundColor: '#12101a',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.5)',
    padding: 12,
    marginBottom: 10,
  },
  vipBlock: { borderColor: 'rgba(251,191,36,0.65)' },
  blockTitle: { color: '#f5efe3', fontWeight: '900', fontSize: 14 },
  blockHint: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10,
  },
  pathTrack: { paddingRight: 8, paddingBottom: 4, alignItems: 'center' },
  pathStep: { flexDirection: 'row', alignItems: 'center' },
  pathLine: {
    width: 8,
    height: 2,
    backgroundColor: 'rgba(201,162,74,0.4)',
  },
  pathCard: {
    width: PATH_CARD_W,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.45)',
    backgroundColor: '#0c0a10',
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  pathCardCur: { borderColor: '#fbbf24', backgroundColor: '#2a2010' },
  pathCardDone: { opacity: 0.45, borderColor: 'rgba(74,222,128,0.45)' },
  pathCardBuy: { borderColor: 'rgba(244,63,94,0.75)' },
  pathCardLock: { opacity: 0.55 },
  pathType: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  pathGems: { color: colors.gem, fontWeight: '900', fontSize: 12 },
  pathCoins: {
    color: '#fbbf24',
    fontWeight: '800',
    fontSize: 11,
    marginTop: 1,
  },
  pathPrice: {
    color: colors.accentHot,
    fontWeight: '900',
    fontSize: 11,
    marginTop: 3,
  },
  pathCta: {
    color: 'rgba(245,239,227,0.7)',
    fontWeight: '800',
    fontSize: 10,
    marginTop: 3,
  },
  ctaMd: { marginTop: 10 },
  vipRow: { flexDirection: 'row', alignItems: 'center' },
  vipBtn: { width: 88, flexShrink: 0 },
  tag: {
    color: '#fb7185',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  price: { color: '#fbbf24', fontWeight: '900', fontSize: 15, marginTop: 2 },
  cardBody: {
    color: 'rgba(245,239,227,0.75)',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  activeNote: {
    color: colors.win,
    fontWeight: '700',
    fontSize: 11,
    marginTop: 4,
  },
  section: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionHint: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '600',
    fontSize: 11,
    lineHeight: 15,
    marginTop: -4,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12101a',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(201,162,74,0.45)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 10,
  },
  soldOut: { opacity: 0.45 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rowLabel: { color: '#f5efe3', fontWeight: '900', fontSize: 13 },
  rowTag: {
    color: '#1a1008',
    backgroundColor: '#fbbf24',
    fontWeight: '900',
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  rowBlurb: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 2,
  },
  rowGems: {
    color: '#22d3ee',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 2,
  },
  rowPrice: { color: '#fbbf24', fontWeight: '900', fontSize: 14 },
  foot: {
    color: 'rgba(245,239,227,0.45)',
    fontWeight: '600',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 14,
  },
  modalBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1c1410',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fbbf24',
    padding: 18,
  },
  modalTitle: {
    color: '#fbbf24',
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  modalBody: {
    color: '#f5efe3',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(245,239,227,0.35)',
    alignItems: 'center',
  },
  modalCancelText: {
    color: 'rgba(245,239,227,0.75)',
    fontWeight: '800',
    fontSize: 13,
  },
  modalOk: {
    flex: 1.3,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
  },
  modalOkText: {
    color: '#1a1008',
    fontWeight: '900',
    fontSize: 13,
  },
  pickLabel: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
  },
  pickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  pickChip: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pickChipOn: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(251,191,36,0.2)',
  },
  pickChipText: {
    color: '#f5efe3',
    fontWeight: '800',
    fontSize: 11,
  },
});
