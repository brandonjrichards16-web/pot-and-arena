import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import { heroPortrait } from '../lib/characters';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';

const RACES = [
  {
    id: 'human',
    name: 'Human',
    emoji: '🧑',
    blurb: 'Balanced · city roads',
  },
  {
    id: 'elf',
    name: 'Elf',
    emoji: '🧝',
    blurb: 'Swift · wild roads',
  },
  {
    id: 'ork',
    name: 'Ork',
    emoji: '👹',
    blurb: 'Brute · bone & fire',
  },
];

const CLASSES = [
  { id: 'warrior', name: 'Warrior', emoji: '⚔️', blurb: 'Front-line steel' },
  { id: 'ranger', name: 'Ranger', emoji: '🏹', blurb: 'Speed + first strike' },
  { id: 'mage', name: 'Mage', emoji: '✨', blurb: 'Glass cannon burst' },
];

/**
 * Name + race + class + look.
 * First create: only the race + class you pick unlock free.
 * Unpicked combos stay locked until bought with gems on Heroes.
 */
export default function CharacterScreen() {
  const router = useRouter();
  const [gender, setGender] = useState(null);
  const [name, setName] = useState('');
  const [race, setRace] = useState(null);
  const [classId, setClassId] = useState(null);
  const [busy, setBusy] = useState(false);

  const preview = heroPortrait({
    race: race || 'human',
    classId: classId || 'warrior',
    gender: gender || 'boy',
    view: 'front',
  });

  const finish = useCallback(async () => {
    if (!gender) return;
    if (!race || !classId) {
      Alert.alert('Pick your fighter', 'Choose a race and a class — that combo unlocks free. The rest stay locked.');
      return;
    }
    const displayName = name.trim().slice(0, 24);
    if (displayName.length < 2) {
      Alert.alert(
        'Name needed',
        'Enter a name (at least 2 characters) so others see you on the boards.'
      );
      return;
    }
    setBusy(true);
    try {
      await api.createCharacter({
        gender,
        displayName,
        race,
        classId,
      });
      try {
        await api.equipHero(race, classId);
      } catch {
        /* bootstrap already equipped */
      }
      // Always land on lobby (pit splash is only for logged-out) — never /campaign
      router.replace('/');
    } catch (e) {
      Alert.alert(
        'Could not save hero',
        e.message || 'Try again — the server may be waking up.'
      );
    } finally {
      setBusy(false);
    }
  }, [gender, name, race, classId, router]);

  return (
    <FunShell dim>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Who are you?</Text>
        <Text style={styles.sub}>
          Pick one race + one class free. Everything else unlocks later with gems
          on Heroes. Type chart: Elf &gt; Ork &gt; Human &gt; Elf.
        </Text>

        <Text style={styles.fieldLabel}>YOUR NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. RoadKing"
          placeholderTextColor={colors.muted}
          maxLength={24}
          autoCapitalize="words"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>RACE</Text>
        <View style={styles.raceRow}>
          {RACES.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRace(r.id)}
              style={[styles.raceCard, race === r.id && styles.raceOn]}
            >
              <Image
                source={heroPortrait({
                  race: r.id,
                  classId: classId || 'warrior',
                  gender: gender || 'boy',
                  view: 'front',
                })}
                style={styles.raceArt}
                resizeMode="contain"
              />
              <Text style={styles.raceEmoji}>{r.emoji}</Text>
              <Text style={styles.raceName}>{r.name}</Text>
              <Text style={styles.raceBlurb}>{r.blurb}</Text>
              {race === r.id ? (
                <Text style={styles.pickTag}>YOUR PICK</Text>
              ) : (
                <Text style={styles.lockTag}>else 💎 later</Text>
              )}
            </Pressable>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>CLASS</Text>
        <View style={styles.classRow}>
          {CLASSES.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setClassId(c.id)}
              style={[styles.classChip, classId === c.id && styles.classOn]}
            >
              <Text style={styles.classText}>
                {c.emoji} {c.name}
                {classId === c.id ? ' · free' : ''}
              </Text>
              <Text style={styles.classBlurb}>{c.blurb}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>LOOK</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => setGender('boy')}
            style={[styles.card, gender === 'boy' && styles.cardOn]}
          >
            <Image
              source={heroPortrait({
                race,
                classId,
                gender: 'boy',
                view: 'front',
              })}
              style={styles.art}
              resizeMode="contain"
            />
            <Text style={styles.label}>Male</Text>
          </Pressable>
          <Pressable
            onPress={() => setGender('girl')}
            style={[styles.card, gender === 'girl' && styles.cardOn]}
          >
            <Image
              source={heroPortrait({
                race,
                classId,
                gender: 'girl',
                view: 'front',
              })}
              style={styles.art}
              resizeMode="contain"
            />
            <Text style={styles.label}>Female</Text>
          </Pressable>
        </View>

        <View style={styles.previewBox}>
          <Image source={preview} style={styles.previewBig} resizeMode="contain" />
          <Text style={styles.previewLabel}>
            {race && classId
              ? `${RACES.find((r) => r.id === race)?.emoji || ''} ${
                  RACES.find((r) => r.id === race)?.name || ''
                } ${CLASSES.find((c) => c.id === classId)?.emoji || ''} ${
                  CLASSES.find((c) => c.id === classId)?.name || ''
                }`
              : 'Pick race + class'}
          </Text>
        </View>

        {busy ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: 20 }} />
        ) : (
          <JuicyButton
            label={
              !name.trim() || name.trim().length < 2
                ? 'ENTER A NAME'
                : !race || !classId
                  ? 'PICK RACE + CLASS'
                  : gender
                    ? "LET'S GO"
                    : 'PICK A LOOK'
            }
            disabled={
              !gender ||
              !race ||
              !classId ||
              name.trim().length < 2
            }
            onPress={finish}
            color="gold"
            style={{ marginTop: 16, marginBottom: 32 }}
          />
        )}
      </ScrollView>
    </FunShell>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48 },
  title: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  sub: {
    color: colors.cream,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(20,8,40,0.95)',
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  raceRow: { flexDirection: 'row', gap: 8 },
  raceCard: {
    flex: 1,
    backgroundColor: 'rgba(20,8,40,0.9)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    padding: 8,
    alignItems: 'center',
  },
  raceOn: { borderColor: colors.gold, backgroundColor: 'rgba(60,40,10,0.95)' },
  raceArt: { width: 72, height: 96, borderRadius: 8 },
  raceEmoji: { fontSize: 18, marginTop: 4 },
  raceName: { color: colors.text, fontWeight: '900', fontSize: 13 },
  raceBlurb: {
    color: colors.muted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 12,
  },
  pickTag: {
    marginTop: 4,
    color: colors.gold,
    fontWeight: '900',
    fontSize: 9,
    letterSpacing: 0.4,
  },
  lockTag: {
    marginTop: 4,
    color: colors.muted,
    fontWeight: '700',
    fontSize: 9,
  },
  classRow: { gap: 8 },
  classChip: {
    backgroundColor: 'rgba(20,8,40,0.9)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    padding: 10,
  },
  classOn: { borderColor: colors.accent, backgroundColor: 'rgba(30,50,80,0.95)' },
  classText: { color: colors.text, fontWeight: '900', fontSize: 15 },
  classBlurb: { color: colors.muted, fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  card: {
    flex: 1,
    maxWidth: 160,
    backgroundColor: 'rgba(20,8,40,0.9)',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.cardBorder,
    padding: 10,
    alignItems: 'center',
  },
  cardOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(60,40,10,0.95)',
  },
  art: { width: 100, height: 140 },
  label: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 16,
    marginTop: 6,
  },
  previewBox: { alignItems: 'center', marginTop: 16 },
  previewBig: {
    width: 140,
    height: 190,
    borderRadius: 12,
    backgroundColor: '#1a0f28',
  },
  previewLabel: {
    color: colors.gold,
    fontWeight: '800',
    marginTop: 8,
    fontSize: 14,
  },
});
