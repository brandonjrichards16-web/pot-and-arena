import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { colors } from '../lib/theme';
import { pollMatchAlerts, requestNotifyPermission } from '../lib/matchWatch';
import { getToken } from '../lib/api';

/**
 * Global banner: your bet/pit filled → watch results.
 * Polls while logged in; optional browser notifications on web.
 */
export default function MatchWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [banner, setBanner] = useState(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const asked = useRef(false);

  useEffect(() => {
    let dead = false;

    async function tick() {
      const token = await getToken();
      if (!token || dead) return;

      if (Platform.OS === 'web' && !asked.current) {
        asked.current = true;
        // Don't block — soft ask once after first successful poll with waiting rooms
      }

      try {
        const { api } = await import('../lib/api');
        const alerts = await api.matchAlerts();
        if (dead) return;
        setWaitingCount((alerts.waiting || []).length);

        if ((alerts.waiting || []).length > 0 && Platform.OS === 'web') {
          requestNotifyPermission();
        }

        await pollMatchAlerts((room) => {
          if (dead) return;
          setBanner({
            roomId: room.id,
            title: room.title || 'Match ready',
            status: 'COMPLETE',
          });
        });
      } catch {
        /* offline / cold start */
      }
    }

    tick();
    const id = setInterval(tick, 4000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  // Hide banner on results page for that room
  useEffect(() => {
    if (banner && pathname?.includes(banner.roomId)) {
      setBanner(null);
    }
  }, [pathname, banner]);

  if (!banner && waitingCount <= 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {banner ? (
        <Pressable
          style={styles.bannerReady}
          onPress={() => {
            const id = banner.roomId;
            setBanner(null);
            router.push(`/results/${id}`);
          }}
        >
          <Text style={styles.bannerEyebrow}>MATCH FILLED</Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={styles.bannerCta}>Tap to watch the draw + pit →</Text>
        </Pressable>
      ) : waitingCount > 0 ? (
        <Pressable style={styles.bannerWait} onPress={() => router.push('/betting')}>
          <Text style={styles.waitText}>
            ⏳ Waiting on {waitingCount} real pit{waitingCount === 1 ? '' : 's'}…
          </Text>
          <Text style={styles.waitSub}>You'll get a push when it's full</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 8 : 48,
    left: 12,
    right: 12,
    zIndex: 9000,
    elevation: 20,
    // Don't steal taps from the whole screen — only the banner itself
    pointerEvents: 'box-none',
  },
  bannerReady: {
    backgroundColor: '#1a3d24',
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  bannerEyebrow: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  bannerTitle: { color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 2 },
  bannerCta: { color: colors.accent, fontWeight: '700', fontSize: 13, marginTop: 4 },
  bannerWait: {
    backgroundColor: 'rgba(20,12,32,0.92)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  waitText: { color: colors.text, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  waitSub: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 2 },
});
