import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { colors } from '../lib/theme';

/**
 * Free Ready Player Me avatar creator (iframe on web).
 * Docs: postMessage source=readyplayerme, event v1.avatar.exported → data.url
 *
 * @param {(url: string) => void} onAvatar — GLB URL https://models.readyplayer.me/….glb
 */
export default function RpmAvatar({ onAvatar, onCancel, style }) {
  const hostRef = useRef(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || !hostRef.current) return undefined;

    const el = hostRef.current;
    while (el.firstChild) el.removeChild(el.firstChild);

    const iframe = document.createElement('iframe');
    // demo subdomain works without paid RPM account — free avatar creator
    iframe.src =
      'https://demo.readyplayer.me/avatar?frameApi&clearCache&bodyType=fullbody';
    iframe.allow = 'camera *; microphone *; clipboard-write';
    iframe.title = 'Ready Player Me';
    iframe.style.cssText =
      'width:100%;height:100%;border:0;border-radius:16px;background:#0a0614;';
    el.appendChild(iframe);

    const onMessage = (event) => {
      try {
        const raw = event.data;
        const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!json || json.source !== 'readyplayerme') return;

        // Subscribe after frame is ready
        if (json.eventName === 'v1.frame.ready') {
          iframe.contentWindow?.postMessage(
            JSON.stringify({
              target: 'readyplayerme',
              type: 'subscribe',
              eventName: 'v1.**',
            }),
            '*'
          );
          return;
        }

        if (json.eventName === 'v1.avatar.exported') {
          const url = json.data?.url || json.data?.avatarUrl;
          if (url && typeof onAvatar === 'function') {
            onAvatar(String(url));
          }
        }
      } catch {
        /* ignore non-JSON */
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (el.contains(iframe)) el.removeChild(iframe);
    };
  }, [onAvatar]);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          Open the web app to create a free Ready Player Me 3D avatar.
        </Text>
        {onCancel ? (
          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Use painted hero instead</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.title}>Free 3D avatar</Text>
      <Text style={styles.sub}>
        Ready Player Me — real-looking person. Customize, then export.
      </Text>
      <View ref={hostRef} style={styles.frame} collapsable={false} />
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {onCancel ? (
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>← Back · painted hero instead</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%' },
  title: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  sub: {
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  frame: {
    flex: 1,
    minHeight: 420,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  err: { color: '#f87171', textAlign: 'center', marginTop: 8 },
  fallback: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.cream,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  cancelBtn: { marginTop: 14, padding: 12, alignItems: 'center' },
  cancelText: { color: colors.gem, fontWeight: '800' },
});
