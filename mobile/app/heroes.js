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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import { heroPortrait } from '../lib/characters';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';
import BackToLobby from '../components/BackToLobby';

/**
 * Races + classes roster.
 * Unlock with gems · equip one · party grows after chapter clears.
 */
export default function HeroesScreen() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickRace, setPickRace] = useState(null);
  const [meGender, setMeGender] = useState('boy');
  const [showBack, setShowBack] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, me] = await Promise.all([api.heroes(), api.me().catch(() => null)]);
      setData(h);
      setPickRace((prev) => prev || h.active?.race || 'human');
      if (me?.user?.gender) setMeGender(me.user.gender);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function buyRace(raceId) {
    setBusy(true);
    try {
      const res = await api.unlockRace(raceId);
      Alert.alert('Unlocked!', res.message || 'Race unlocked');
      setData(res.heroes);
      setPickRace(raceId);
    } catch (e) {
      Alert.alert('Need more gems?', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function buyClass(raceId, classId) {
    setBusy(true);
    try {
      const res = await api.unlockClass(raceId, classId);
      Alert.alert('Unlocked!', res.message || 'Class unlocked');
      setData(res.heroes);
    } catch (e) {
      Alert.alert('Need more gems?', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function equip(raceId, classId) {
    setBusy(true);
    try {
      const res = await api.equipHero(raceId, classId);
      setData(res.heroes);
      Alert.alert('Equipped', res.message || 'Ready for the road');
    } catch (e) {
      Alert.alert('Locked', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleParty(raceId) {
    if (!data) return;
    const slots = data.partySlots || 1;
    let party = [...(data.party || [])];
    if (party.includes(raceId)) {
      if (party.length <= 1) return;
      party = party.filter((id) => id !== raceId);
    } else {
      if (party.length >= slots) {
        Alert.alert(
          'Party full',
          slots < 2
            ? 'Clear chapter 3 to field 2 heroes.'
            : slots < 3
              ? 'Clear chapter 6 to field all 3 races.'
              : 'Party is full.'
        );
        return;
      }
      party.push(raceId);
    }
    setBusy(true);
    try {
      const res = await api.setParty(party);
      setData(res.heroes);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <FunShell dim>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <BackToLobby />
          </View>
        </View>
      </FunShell>
    );
  }

  const race = (data.races || []).find((r) => r.id === pickRace) || data.races?.[0];
  const active = data.active || {};
  const previewClass = active.race === pickRace ? active.classId : 'warrior';
  const previewSrc = heroPortrait({
    race: pickRace || 'human',
    classId: previewClass || 'warrior',
    gender: meGender,
    view: showBack ? 'back' : 'front',
  });

  return (
    <FunShell dim>
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.gold} />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <BackToLobby />
        </View>
        <Text style={[styles.sub, { textAlign: 'center' }]}>
          Race & class for the Road · switch for biomes that favor you
        </Text>

        <View style={styles.activeCard}>
          <View style={styles.activeTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeLabel}>FIGHTING AS</Text>
              <Text style={styles.activeName}>{active.label || '—'}</Text>
            </View>
            <Pressable
              style={styles.upgradeHeroBtn}
              onPress={() => router.push('/upgrade')}
            >
              <Text style={styles.upgradeHeroBtnText}>Upgrade</Text>
              <Text style={styles.upgradeHeroBtnSub}>your hero →</Text>
            </Pressable>
          </View>
          <View style={styles.previewRow}>
            <Image source={previewSrc} style={styles.previewArt} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeBonus}>
                +{active.bonus?.ATK || 0} ATK · +{active.bonus?.HP || 0} HP · +
                {active.bonus?.DEF || 0} DEF · +{active.bonus?.SPD || 0} SPD
              </Text>
              <Text style={styles.partyMeta}>
                Party {data.party?.length || 1}/{data.partySlots || 1}
                {data.partySlotsNext
                  ? ` · ${data.partySlotsNext.hint}`
                  : ' · full party unlocked'}
              </Text>
              <Pressable
                style={styles.flipBtn}
                onPress={() => setShowBack((b) => !b)}
              >
                <Text style={styles.flipText}>
                  {showBack ? 'Show front' : 'Show back'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.section}>RACES</Text>
        <View style={styles.raceRow}>
          {(data.races || []).map((r) => {
            const on = pickRace === r.id;
            const activeRace = active.race === r.id;
            const inParty = (data.party || []).includes(r.id);
            return (
              <Pressable
                key={r.id}
                onPress={() => setPickRace(r.id)}
                style={[
                  styles.raceCard,
                  on && styles.raceOn,
                  !r.unlocked && styles.raceLock,
                ]}
              >
                <Text style={styles.raceEmoji}>{r.emoji}</Text>
                <Text style={styles.raceName}>{r.name}</Text>
                {activeRace ? <Text style={styles.tag}>ACTIVE</Text> : null}
                {inParty && !activeRace ? <Text style={styles.tagDim}>PARTY</Text> : null}
                {!r.unlocked ? (
                  <Text style={styles.cost}>🔒 {r.gemCost}💎</Text>
                ) : (
                  <Text style={styles.strong}>{r.strongLabel}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {race ? (
          <View style={styles.detail}>
            <Text style={styles.detailTitle}>
              {race.emoji} {race.name}
            </Text>
            <Text style={styles.detailBlurb}>{race.blurb}</Text>
            <Text style={styles.detailStrong}>Strong on: {race.strongLabel}</Text>

            {!race.unlocked ? (
              <JuicyButton
                label={busy ? '…' : `UNLOCK · ${race.gemCost}💎`}
                onPress={() => buyRace(race.id)}
                color="gold"
                disabled={busy}
                style={{ marginTop: 12 }}
              />
            ) : (
              <>
                <Pressable
                  style={styles.partyBtn}
                  onPress={() => toggleParty(race.id)}
                  disabled={busy}
                >
                  <Text style={styles.partyBtnText}>
                    {(data.party || []).includes(race.id)
                      ? '✓ In party (tap to remove)'
                      : `Add to party (${data.party?.length || 0}/${data.partySlots})`}
                  </Text>
                </Pressable>

                <Text style={[styles.section, { marginTop: 16 }]}>CLASSES · {race.name}</Text>
                {(race.classes || []).map((c) => {
                  const isActive =
                    active.race === race.id && active.classId === c.id;
                  const thumb = heroPortrait({
                    race: race.id,
                    classId: c.id,
                    gender: meGender,
                    view: 'front',
                  });
                  return (
                    <View key={c.id} style={styles.classRow}>
                      <Image source={thumb} style={styles.classThumb} resizeMode="contain" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.className}>
                          {c.emoji} {c.name}
                          {isActive ? ' · EQUIPPED' : ''}
                        </Text>
                        <Text style={styles.classBlurb}>{c.blurb}</Text>
                      </View>
                      {!c.unlocked ? (
                        <Pressable
                          style={styles.smallBtn}
                          disabled={busy}
                          onPress={() => buyClass(race.id, c.id)}
                        >
                          <Text style={styles.smallBtnText}>{c.gemCost}💎</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={[styles.smallBtn, isActive && styles.smallBtnOn]}
                          disabled={busy || isActive}
                          onPress={() => equip(race.id, c.id)}
                        >
                          <Text style={styles.smallBtnText}>
                            {isActive ? 'ON' : 'USE'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        ) : null}

        <View style={styles.typeBox}>
          <Text style={styles.typeTitle}>TYPE CHART</Text>
          <Text style={styles.typeBody}>
            {data.typeChart?.blurb ||
              'Elf > Ork > Human > Elf. ~25% stronger / resist on the Road · ~5% in pits.'}
          </Text>
          <Text style={styles.typeBody}>
            🧝 beats 👹 · 👹 beats 🧑 · 🧑 beats 🧝 — pick your fighter for the pack.
          </Text>
        </View>
        <Text style={styles.foot}>
          Tip: Biomes + type chart stack. Elves on wild roads vs orks; Orks vs human packs; Humans
          check elves. Swap before a hard zone — upgrades still carry over.
        </Text>
      </ScrollView>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 16, paddingBottom: 48 },
  back: { color: colors.gold, fontWeight: '900', marginBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  sub: { color: colors.muted, marginTop: 6, marginBottom: 14, lineHeight: 18, fontSize: 13 },
  activeCard: {
    backgroundColor: '#1a3d24',
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: 'rgba(74,222,128,0.55)',
    marginBottom: 14,
  },
  activeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeLabel: { color: colors.gold, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  activeName: { color: colors.text, fontWeight: '900', fontSize: 18, marginTop: 4 },
  upgradeHeroBtn: {
    backgroundColor: 'rgba(34, 120, 70, 0.98)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 100,
  },
  upgradeHeroBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  upgradeHeroBtnSub: {
    color: 'rgba(236,253,245,0.9)',
    fontWeight: '700',
    fontSize: 11,
    marginTop: 2,
  },
  previewRow: { flexDirection: 'row', gap: 12, marginTop: 10, alignItems: 'center' },
  previewArt: {
    width: 100,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#1a0f28',
  },
  flipBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  flipText: { color: colors.gold, fontWeight: '800', fontSize: 11 },
  activeBonus: { color: colors.accent, fontWeight: '700', marginTop: 4, fontSize: 13 },
  partyMeta: { color: colors.muted, fontSize: 11, marginTop: 6 },
  classThumb: {
    width: 48,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#1a0f28',
  },
  section: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  raceRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  raceCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  raceOn: { borderColor: colors.gold },
  raceLock: { opacity: 0.75 },
  raceEmoji: { fontSize: 28 },
  raceName: { color: colors.text, fontWeight: '800', marginTop: 4 },
  tag: { color: colors.gold, fontSize: 9, fontWeight: '900', marginTop: 4 },
  tagDim: { color: colors.muted, fontSize: 9, fontWeight: '800', marginTop: 4 },
  cost: { color: colors.gem || '#c4b5fd', fontWeight: '800', fontSize: 11, marginTop: 4 },
  strong: { color: colors.muted, fontSize: 9, textAlign: 'center', marginTop: 4 },
  detail: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  detailTitle: { color: colors.text, fontWeight: '900', fontSize: 18 },
  detailBlurb: { color: colors.muted, marginTop: 6, lineHeight: 18, fontSize: 13 },
  detailStrong: { color: colors.gold, marginTop: 8, fontWeight: '700', fontSize: 12 },
  partyBtn: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
  },
  partyBtnText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  className: { color: colors.text, fontWeight: '800' },
  classBlurb: { color: colors.muted, fontSize: 11, marginTop: 2 },
  smallBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  smallBtnOn: { backgroundColor: '#1a3d24', borderWidth: 1, borderColor: colors.gold },
  smallBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  typeBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1a1528',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  typeTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
  },
  typeBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  foot: { color: colors.muted, fontSize: 11, marginTop: 18, lineHeight: 16, textAlign: 'center' },
});
