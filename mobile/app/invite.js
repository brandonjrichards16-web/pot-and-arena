import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import BackToLobby from '../components/BackToLobby';

export default function InviteScreen() {
  const router = useRouter();
  const [invite, setInvite] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .inviteStats()
      .then(setInvite)
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.pad}>
      <Pressable onPress={() => router.replace('/')} style={{ marginBottom: 12 }} hitSlop={8}>
        <BackToLobby label="Lobby" />
      </Pressable>
      <Text style={[styles.title, { textAlign: "center" }]}>Invite friends</Text>
      <Text style={styles.body}>
        Share your code. When a friend finishes their first match, you both get gems.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Your code</Text>
        <Text style={styles.code}>{invite?.code || '—'}</Text>
        <Text style={styles.meta}>
          Invited {invite?.invitedCount ?? 0} · Rewarded {invite?.rewardedCount ?? 0}
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() =>
            Share.share({
              message: invite?.shareBlurb || `Join Pot & Arena with code ${invite?.code}`,
            })
          }
        >
          <Text style={styles.btnText}>Share code</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Have a code?</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="ABC123"
          placeholderTextColor={colors.muted}
        />
        <Pressable
          style={[styles.btn, { backgroundColor: colors.cardBorder }]}
          onPress={async () => {
            try {
              const res = await api.applyInvite(code);
              setInvite(res.invite);
              Alert.alert('Linked!', 'Play a match to unlock invite gems for both of you.');
            } catch (e) {
              Alert.alert('Failed', e.message);
            }
          }}
        >
          <Text style={styles.btnText}>Apply code</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  pad: { flex: 1, padding: 16, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  body: { color: colors.muted, marginVertical: 10, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 14,
  },
  label: { color: colors.muted, marginBottom: 6 },
  code: { color: colors.gold, fontSize: 32, fontWeight: '900', letterSpacing: 4 },
  meta: { color: colors.muted, marginTop: 6 },
  input: {
    backgroundColor: '#0f1422',
    borderRadius: 10,
    padding: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
