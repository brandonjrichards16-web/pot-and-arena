import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';
import AdGate from '../components/AdGate';
import ResourcePills from '../components/ResourcePills';
import BackToLobby from '../components/BackToLobby';

/**
 * Join/Start pit → ads (count from room) → more ads for more tickets → fill → draw.
 * Multi-ad pits: full ad set per ticket; second ticket = watch the set again.
 * Skips only show if inventory > 0 (from IAP); multi-ad uses that many skips.
 */
export default function PlaySession() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mode = params.mode || 'join';
  const paramRoomId = params.roomId;
  // Match server ABSOLUTE_MAX_N (1000) — do not clamp to 100
  const paramN = Math.min(1000, Math.max(4, Number(params.n) || 4));
  const ADS_OPTIONS = [1, 2, 3, 5, 10];
  const paramAds = ADS_OPTIONS.includes(Number(params.ads))
    ? Number(params.ads)
    : 1;

  const [phase, setPhase] = useState('boot');
  const [room, setRoom] = useState(null);
  const [pitChoices, setPitChoices] = useState([]);
  const [balances, setBalances] = useState({ COIN: 0, GEM: 0 });
  const [skips, setSkips] = useState(0);
  const [myTickets, setMyTickets] = useState(0);
  const [ticketNums, setTicketNums] = useState([]);
  const [statusLine, setStatusLine] = useState('…');
  const [busy, setBusy] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const pendingSkip = useRef(false);
  const fillLock = useRef(false); // prevent double Lock-in

  const adsPerTicket = Math.max(
    1,
    Number(room?.adsRequired ?? room?.adsPerTicket ?? room?.ads_per_ticket) || paramAds
  );

  const refreshRoom = useCallback(async (id) => {
    const r = await api.room(id);
    setRoom(r);
    return r;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        setBalances(me.balances);
        setSkips(me.adSkipTickets || me.user?.adSkipTickets || 0);

        let r = null;
        if (paramRoomId) {
          r = await api.room(paramRoomId);
          if (!['OPEN', 'FILLING'].includes(r.status) || r.tickets_sold >= r.n) {
            throw new Error('That pit already filled — pick another.');
          }
        } else if (mode === 'start') {
          r = await api.createCustomRoom({
            mode: 'random',
            n: paramN,
            adsPerTicket: paramAds,
          });
        } else {
          // Browse free/ad pits — show list when several exist (don't hide them)
          const { rooms } = await api.rooms();
          const open = (rooms || [])
            .filter(
              (x) =>
                (x.entry_type === 'FREE' || x.entry_type === 'AD') &&
                (x.tickets_sold || 0) < x.n &&
                ['OPEN', 'FILLING'].includes(x.status)
            )
            .sort((a, b) => {
              const ta = a.tickets_sold || 0;
              const tb = b.tickets_sold || 0;
              if (tb !== ta) return tb - ta;
              return String(b.created_at || '').localeCompare(String(a.created_at || ''));
            });
          if (open.length > 1) {
            if (cancelled) return;
            setPitChoices(open);
            setPhase('pick');
            setStatusLine('Pick an open pit — or start a new one.');
            return;
          }
          r =
            open[0] ||
            (await api.createCustomRoom({
              mode: 'random',
              n: 4,
              adsPerTicket: 1,
            }));
        }

        if (cancelled) return;
        await enterRoom(r);
      } catch (e) {
        Alert.alert('Could not start', e.message, [
          { text: 'Back', onPress: () => router.replace('/') },
        ]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, paramRoomId, paramN, paramAds, router]);

  async function enterRoom(r) {
    setRoom(r);
    setPitChoices([]);
    const need =
      Number(r.adsRequired ?? r.adsPerTicket ?? r.ads_per_ticket) || 1;
    setStatusLine(
      need > 1
        ? `This pit needs ${need} ads per ticket · pot pays ×${need}`
        : 'Every ticket costs one ad — that’s your chip on the table.'
    );
    setPhase('ad');
    setShowAd(true);
  }

  async function pickPit(choice) {
    setBusy(true);
    try {
      const r = await api.room(choice.id);
      if (!['OPEN', 'FILLING'].includes(r.status) || r.tickets_sold >= r.n) {
        throw new Error('That pit just filled — pick another.');
      }
      await enterRoom(r);
    } catch (e) {
      Alert.alert('Pit', e.message);
      // refresh choices
      try {
        const { rooms } = await api.rooms();
        const open = (rooms || []).filter(
          (x) =>
            (x.entry_type === 'FREE' || x.entry_type === 'AD') &&
            (x.tickets_sold || 0) < x.n &&
            ['OPEN', 'FILLING'].includes(x.status)
        );
        setPitChoices(open);
        if (!open.length) {
          const r = await api.createCustomRoom({
            mode: 'random',
            n: 4,
            adsPerTicket: 1,
          });
          await enterRoom(r);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  }

  async function startNewFromPick() {
    setBusy(true);
    try {
      const r = await api.createCustomRoom({
        mode: 'random',
        n: 4,
        adsPerTicket: 1,
      });
      await enterRoom(r);
    } catch (e) {
      Alert.alert('Could not open pit', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function takeTicket({ useSkip, adsWatched } = {}) {
    setBusy(true);
    try {
      const need = adsPerTicket;
      const res = await api.join(room.id, {
        mockAd: !useSkip,
        useSkipTicket: !!useSkip,
        adsWatched: useSkip ? 0 : adsWatched ?? need,
      });
      setBalances(res.balances);
      setSkips(res.adSkipTickets ?? skips);
      setMyTickets(res.myTickets || 1);
      setTicketNums((t) => [...t, res.ticketNumber]);
      setRoom(res.room);
      setStatusLine(
        useSkip
          ? `Used ${res.skipsUsed || need} skip(s) · ticket #${res.ticketNumber}`
          : need > 1
            ? `${need} ads done · ticket #${res.ticketNumber} is yours`
            : `Ad done · ticket #${res.ticketNumber} is yours`
      );
      setPhase('tickets');
    } catch (e) {
      Alert.alert('Ticket failed', e.message);
      if (!myTickets) router.replace('/');
    } finally {
      setBusy(false);
      setShowAd(false);
      pendingSkip.current = false;
    }
  }

  function afterAd(watchedCount) {
    takeTicket({ useSkip: false, adsWatched: watchedCount || adsPerTicket });
  }

  function watchAnotherAd() {
    // Full ad set again for each extra ticket
    setShowAd(true);
  }

  function useSkip() {
    takeTicket({ useSkip: true });
  }

  async function startFill() {
    if (fillLock.current || !room?.id) return;
    fillLock.current = true;
    setPhase('filling');
    setStatusLine('The pit is filling…');
    setBusy(true);
    const roomId = room.id;

    async function tryFillBots() {
      return api.fillBots(roomId);
    }

    async function waitUntilComplete(start) {
      let r = start;
      // FULL / RESOLVING → poll until COMPLETE (resolve can take a beat on big N)
      for (let i = 0; i < 40; i++) {
        if (!r) r = await refreshRoom(roomId);
        if (r.status === 'COMPLETE') return r;
        if (r.status === 'FULL' || r.status === 'RESOLVING') {
          setStatusLine('Drawing results…');
          await sleep(250);
          try {
            // fill-bots is idempotent and will finish resolve if full
            r = await tryFillBots();
          } catch {
            r = await refreshRoom(roomId);
          }
          setRoom(r);
          continue;
        }
        break;
      }
      return r;
    }

    try {
      let r = await refreshRoom(roomId);
      setRoom(r);

      // Already finished (retry after a partial attempt)
      if (r.status === 'COMPLETE') {
        setStatusLine('PIT FULL — THE DRAW');
        setPhase('go');
        await sleep(400);
        router.replace(`/results/${roomId}`);
        return;
      }

      if (r.status === 'FULL' || r.status === 'RESOLVING') {
        r = await waitUntilComplete(r);
        if (r.status === 'COMPLETE') {
          setStatusLine('PIT FULL — THE DRAW');
          setPhase('go');
          await sleep(400);
          router.replace(`/results/${roomId}`);
          return;
        }
      }

      const allowsHouse = !!(r.allows_house ?? r.allowsHouse);
      if (!allowsHouse) {
        setStatusLine('Waiting for other players…');
        await sleep(1200);
        r = await refreshRoom(roomId);
        setRoom(r);
      } else {
        const left0 = Math.max(0, (r.n || 0) - (r.tickets_sold || 0));
        // Big pits: one (or few) fat server fills — not 200× tiny drips
        // Small pits: short drip drama, then finish with fillBots
        if (left0 > 20) {
          setStatusLine(`Filling ${r.tickets_sold || 0}/${r.n}… packing the pit`);
          // Chunked fill so progress updates; each chunk up to 200 seats
          let guard = 0;
          while (
            r.status !== 'COMPLETE' &&
            (r.tickets_sold || 0) < (r.n || 0) &&
            guard < 30
          ) {
            guard++;
            const left = r.n - r.tickets_sold;
            const batch = Math.min(left, left > 200 ? 200 : left > 50 ? 100 : 40);
            setStatusLine(`Filling… ${r.tickets_sold}/${r.n} seats`);
            try {
              r = await api.dripHouse(roomId, batch);
            } catch (err) {
              // Network blip — retry once with fillBots
              setStatusLine('Reconnecting fill…');
              await sleep(300);
              r = await tryFillBots();
            }
            setRoom(r);
            if (r.status === 'COMPLETE') break;
            if (r.status === 'FULL' || r.status === 'RESOLVING') {
              r = await waitUntilComplete(r);
              break;
            }
            // Tiny pause for bar animation only (not multi-second stalls)
            if ((r.tickets_sold || 0) < (r.n || 0)) await sleep(80);
          }
        } else {
          // Tiny room: drip for feel
          let guard = 0;
          while (
            r.status !== 'COMPLETE' &&
            (r.tickets_sold || 0) < (r.n || 0) &&
            allowsHouse &&
            guard < 40
          ) {
            guard++;
            const left = r.n - r.tickets_sold;
            setStatusLine(
              left === 1
                ? '🔥 ONE SEAT LEFT…'
                : `Filling… ${r.tickets_sold}/${r.n} seats`
            );
            await sleep(left <= 2 ? 450 : 220);
            r = await api.dripHouse(roomId, Math.min(left, 3));
            setRoom(r);
            if (r.status === 'COMPLETE' || r.status === 'FULL' || r.status === 'RESOLVING') {
              break;
            }
          }
        }
      }

      // Always finish with fillBots if still open seats / unresolved
      if (r.status !== 'COMPLETE') {
        setStatusLine('Locking the pit…');
        for (let attempt = 0; attempt < 3 && r.status !== 'COMPLETE'; attempt++) {
          try {
            r = await tryFillBots();
            setRoom(r);
          } catch (err) {
            setStatusLine(`Retry ${attempt + 1}/3…`);
            await sleep(400);
            r = await refreshRoom(roomId);
            setRoom(r);
          }
          if (r.status === 'FULL' || r.status === 'RESOLVING') {
            r = await waitUntilComplete(r);
          }
        }
      }

      if (r.status !== 'COMPLETE') {
        // Don't silently dump the player — keep room progress, offer retry
        setStatusLine(
          `Stalled at ${r.tickets_sold || 0}/${r.n || '?'} — tap Lock-in again`
        );
        Alert.alert(
          'Fill stalled',
          `Got to ${r.tickets_sold || 0} of ${r.n || '?'} seats. Tap “Lock in · fill the pit” again — progress is saved.`,
          [{ text: 'OK' }]
        );
        setBusy(false);
        setPhase('tickets');
        fillLock.current = false;
        return;
      }

      setStatusLine('PIT FULL — THE DRAW');
      setPhase('go');
      await sleep(500);
      router.replace(`/results/${roomId}`);
    } catch (e) {
      Alert.alert(
        'Fill failed',
        `${e.message || 'Network error'}\n\nTap Lock-in again — your tickets are kept.`,
        [{ text: 'OK' }]
      );
      setBusy(false);
      setPhase('tickets');
      fillLock.current = false;
    }
  }

  if (!room && phase === 'pick') {
    return (
      <FunShell dim>
        <View style={styles.wrap}>
          <View style={styles.top}>
            <BackToLobby />
            <ResourcePills coins={balances.COIN} gems={balances.GEM} />
          </View>
          <Text style={[styles.title, { textAlign: 'center' }]}>OPEN PITS</Text>
          <Text style={styles.status}>
            {statusLine || 'Pick a pit with open seats.'}
          </Text>
          {pitChoices.map((p) => {
            const sold = p.tickets_sold || 0;
            const left = p.seatsLeft ?? Math.max(0, p.n - sold);
            const ads = p.ads_per_ticket || p.adsPerTicket || 0;
            return (
              <Pressable
                key={p.id}
                style={styles.pickRow}
                disabled={busy}
                onPress={() => pickPit(p)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickTitle}>{p.title || 'Pit'}</Text>
                  <Text style={styles.pickMeta}>
                    {sold}/{p.n} seated · {left} open
                    {p.entry_type === 'FREE' ? ' · free' : ''}
                    {ads > 0 ? ` · ${ads} ad(s)/ticket` : ''}
                    {sold > 0 ? ' · has players' : ''}
                  </Text>
                </View>
                <View style={styles.pickPill}>
                  <Text style={styles.pickPillText}>JOIN</Text>
                </View>
              </Pressable>
            );
          })}
          <JuicyButton
            label={busy ? '…' : 'START A NEW PIT'}
            onPress={startNewFromPick}
            color="gold"
            size="md"
            disabled={busy}
            style={{ marginTop: 16 }}
          />
        </View>
      </FunShell>
    );
  }

  if (!room && phase === 'boot') {
    return (
      <FunShell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      </FunShell>
    );
  }

  const fillPct = room ? Math.min(100, (room.tickets_sold / room.n) * 100) : 0;
  const potEst =
    room?.potEstimate != null
      ? Math.round(room.potEstimate)
      : Math.round(
          (room?.n || 4) * (room?.coin_per_ticket || 1) * adsPerTicket
        );

  return (
    <FunShell dim>
      <AdGate
        visible={showAd}
        count={adsPerTicket}
        onComplete={afterAd}
        onCancel={() => {
          if (myTickets > 0) {
            setShowAd(false);
            setPhase('tickets');
          } else {
            router.replace('/');
          }
        }}
      />

      <View style={styles.wrap}>
        <View style={styles.top}>
          <BackToLobby />
          <ResourcePills coins={balances.COIN} gems={balances.GEM} />
        </View>

        <Text style={[styles.modeTag, { textAlign: 'center' }]}>
          {mode === 'start' ? 'YOU OPENED THIS PIT' : 'YOU JOINED THIS PIT'}
        </Text>
        <Text style={[styles.title, { textAlign: 'center' }]}>THE POT</Text>
        <Text style={styles.pot}>🪙 {potEst}</Text>
        <Text style={styles.sub}>
          {room?.title || 'Pit'}
          {adsPerTicket > 1 ? ` · ×${adsPerTicket} from ads` : ''}
        </Text>

        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${fillPct}%` }]} />
        </View>
        <Text style={styles.fillText}>
          {room?.tickets_sold || 0} / {room?.n || 4} tickets
        </Text>

        <Text style={styles.status}>{statusLine}</Text>

        {myTickets > 0 && (
          <View style={styles.ticketBox}>
            <Text style={styles.ticketLabel}>YOUR TICKETS</Text>
            <Text style={styles.ticketNums}>
              {ticketNums.map((n) => `#${n}`).join('   ')}
            </Text>
            <Text style={styles.odds}>
              ~{Math.round((myTickets / (room?.n || 4)) * 100)}% chance
            </Text>
          </View>
        )}

        {phase === 'tickets' && (
          <View style={styles.actions}>
            <Text style={styles.rule}>
              {adsPerTicket > 1
                ? `Each ticket = ${adsPerTicket} ads (full set again for another ticket). Pot pays ×${adsPerTicket}.`
                : 'Each ticket = one ad. More tickets = better odds.'}
            </Text>
            <JuicyButton
              label={
                adsPerTicket > 1
                  ? `📺 WATCH ${adsPerTicket} ADS · +TICKET`
                  : '📺 WATCH AD · +TICKET'
              }
              onPress={watchAnotherAd}
              disabled={busy || room.tickets_sold >= room.n}
              color="hot"
            />

            {/* Only if they own paid skips — multi-ad pits spend that many skips */}
            {skips >= adsPerTicket ? (
              <Pressable style={styles.skipBtn} onPress={useSkip} disabled={busy}>
                <Text style={styles.skipText}>
                  {adsPerTicket > 1
                    ? `Use ${adsPerTicket} skips · +ticket (${skips} left)`
                    : `Use ad-skip (${skips} left)`}
                </Text>
              </Pressable>
            ) : skips > 0 && adsPerTicket > 1 ? (
              <Text style={styles.skipHint}>
                Need {adsPerTicket} skips for one ticket (you have {skips})
              </Text>
            ) : null}

            <JuicyButton
              label="LOCK IN · FILL THE PIT"
              onPress={startFill}
              disabled={busy}
              color="gold"
              style={{ marginTop: 18 }}
            />
          </View>
        )}

        {(phase === 'filling' || phase === 'go') && (
          <View style={styles.centerPad}>
            <ActivityIndicator color={colors.gold} />
            <Text style={[styles.line, { marginTop: 12 }]}>{statusLine}</Text>
          </View>
        )}
      </View>
    </FunShell>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: { alignItems: 'center', marginTop: 24 },
  wrap: { flex: 1, padding: 20, paddingTop: 52 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginTop: 10,
  },
  pickTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  pickMeta: { color: colors.muted, fontSize: 12, marginTop: 3, fontWeight: '600' },
  pickPill: {
    backgroundColor: colors.accentHot,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickPillText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  back: { color: colors.muted, fontWeight: '800', fontSize: 15 },
  modeTag: {
    color: colors.accentHot,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    fontSize: 11,
    marginBottom: 6,
  },
  title: {
    color: colors.gold,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    fontSize: 13,
  },
  pot: {
    color: colors.gold,
    fontSize: 48,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  sub: { color: colors.muted, textAlign: 'center', fontWeight: '700', marginBottom: 14 },
  barBg: {
    height: 14,
    backgroundColor: '#0a0614',
    borderRadius: 99,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  barFill: { height: '100%', backgroundColor: colors.accentHot },
  fillText: {
    color: colors.text,
    textAlign: 'center',
    fontWeight: '800',
    marginTop: 8,
    fontSize: 16,
  },
  status: {
    color: colors.cream,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 14,
    fontSize: 15,
    minHeight: 40,
  },
  ticketBox: {
    backgroundColor: 'rgba(60,40,10,0.9)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  ticketLabel: { color: colors.gold, fontWeight: '900', letterSpacing: 2, fontSize: 11 },
  ticketNums: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 8 },
  odds: { color: colors.muted, marginTop: 6, fontWeight: '700' },
  actions: { alignItems: 'center', marginTop: 4 },
  rule: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 18,
  },
  skipHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  skipBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gem,
  },
  skipText: { color: colors.gem, fontWeight: '900' },
  line: { color: colors.muted, fontWeight: '700' },
});
