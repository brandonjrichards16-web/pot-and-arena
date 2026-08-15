import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { colors } from '../../lib/theme';
import DrawShow from '../../components/DrawShow';
import BrawlArena from '../../components/BrawlArena';
import FunShell from '../../components/FunShell';
import LootCeremony from '../../components/LootCeremony';

export default function ResultsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [room, setRoom] = useState(null);
  const [act, setAct] = useState(0);
  const [myId, setMyId] = useState(null);
  /** Skip only while draw/fight is still animating — hide once results + Continue show */
  const [canSkip, setCanSkip] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setMyId(me.user?.id);
      } catch {
        /* guest token may exist */
      }
      const r = await api.room(id);
      setRoom(r);
      setAct(1);
    })().catch(console.error);
  }, [id]);

  const rep = room?.replay || {};
  const pot = rep.pot || {};
  const arena = rep.arena || {};
  const tickets = rep.tickets || room?.tickets || [];
  const earningsMap = rep.earnings || {};

  // Prefer logged-in user; else first human ticket
  const heroId =
    myId ||
    arena.battle?.heroUserId ||
    tickets.find((t) => !t.isBot && !t.is_bot)?.userId ||
    tickets.find((t) => !t.isBot && !t.is_bot)?.user_id;

  const earned = (heroId && earningsMap[heroId]) || {
    coins: 0,
    gems: 2,
    xp: 10,
    outcome: 'FOUGHT_HARD',
  };

  const fighters = useMemo(() => {
    const byId = new Map();
    for (const t of tickets) {
      const uid = t.userId || t.user_id;
      if (!uid || byId.has(uid)) continue;
      byId.set(uid, {
        userId: uid,
        displayName: t.displayName || t.display_name || 'Fighter',
        isBot: !!(t.isBot || t.is_bot),
        gender: t.gender || null,
        visualTier: t.visualTier || 0,
      });
    }
    for (const r of arena.rankings || []) {
      if (!byId.has(r.userId)) {
        byId.set(r.userId, {
          userId: r.userId,
          displayName: r.displayName,
          isBot: String(r.userId).startsWith('house_'),
          gender: null,
          visualTier: 0,
        });
      }
    }
    return [...byId.values()];
  }, [tickets, arena]);

  if (!room || act === 0) {
    return (
      <FunShell dim>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.loading}>Loading the show…</Text>
        </View>
      </FunShell>
    );
  }

  return (
    <FunShell dim>
      <ScrollView contentContainerStyle={styles.pad}>
        <Pressable style={styles.leaveTop} onPress={() => router.replace('/')}>
          <Text style={styles.leaveTopText}>← Leave to lobby</Text>
        </Pressable>
        {act === 1 && (
          <DrawShow
            winnerTicketNumber={pot.winnerTicketNumber || 1}
            winnerName={
              pot.winnerUserId === heroId ? '★ YOU' : pot.winnerName || '???'
            }
            potAmount={pot.net || 0}
            potAsset={pot.asset || 'COIN'}
            maxTickets={room.n || tickets.length || 4}
            tickets={tickets}
            heroUserId={heroId}
            onResultsReady={() => setCanSkip(false)}
            onDone={() => {
              setCanSkip(true);
              setAct(2);
            }}
          />
        )}

        {act === 2 && (
          <BrawlArena
            fighters={fighters}
            battle={arena.battle || null}
            rankings={arena.rankings || null}
            winnerUserId={arena.winnerUserId}
            winnerName={
              arena.winnerUserId === heroId ? '★ YOU' : arena.winnerName || 'Champ'
            }
            onResultsReady={() => setCanSkip(false)}
            onDone={() => {
              setCanSkip(false);
              setAct(3);
            }}
          />
        )}

        {act === 3 && (
          <LootCeremony
            earned={earned}
            heroStats={arena.heroStats || arena.battle?.heroStats}
            potName={pot.winnerUserId === heroId ? 'You' : pot.winnerName}
            pitName={arena.winnerUserId === heroId ? 'You' : arena.winnerName}
            onAgain={() => router.replace('/')}
            onUpgrade={() => router.push('/upgrade')}
          />
        )}

        {/* Skip only while the draw/fight is still playing — gone once results (or loot) show */}
        {act < 3 && canSkip ? (
          <Pressable
            style={styles.skip}
            onPress={() => {
              if (act === 1) {
                setCanSkip(true);
                setAct(2);
              } else {
                setCanSkip(false);
                setAct(3);
              }
            }}
          >
            <Text style={styles.skipText}>
              {act === 2 ? 'Skip fight →' : 'Skip draw →'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: colors.muted, marginTop: 12, fontWeight: '700' },
  pad: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  leaveTop: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(40,20,50,0.9)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  leaveTopText: { color: colors.gold, fontWeight: '900', fontSize: 14 },
  skip: { alignItems: 'center', marginTop: 16 },
  skipText: { color: colors.muted, fontWeight: '700' },
});
