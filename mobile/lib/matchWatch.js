/**
 * Watch open pits you're in — poll server, fire browser notifications when filled.
 * Web: Notification API. Native: Alert fallback via callback.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api, getToken } from './api';

const SEEN_KEY = 'paa_seen_ready_rooms';
const WATCH_KEY = 'paa_watch_rooms';

async function getSeen() {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function markSeen(roomId) {
  const seen = await getSeen();
  seen[roomId] = Date.now();
  // prune old
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  for (const k of Object.keys(seen)) {
    if (seen[k] < cutoff) delete seen[k];
  }
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

export async function requestNotifyPermission() {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const p = await Notification.requestPermission();
    return p === 'granted';
  } catch {
    return false;
  }
}

function fireBrowserNotify(title, body, roomId) {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag: `paa-room-${roomId}`,
      renotify: true,
    });
    n.onclick = () => {
      try {
        window.focus();
        if (roomId) window.location.href = `/results/${roomId}`;
      } catch {
        /* ignore */
      }
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/**
 * One poll cycle. Returns newly ready rooms (not yet notified).
 * @param {(room: object) => void} onReady
 */
export async function pollMatchAlerts(onReady) {
  const token = await getToken();
  if (!token) return [];

  let data;
  try {
    data = await api.matchAlerts();
  } catch {
    return [];
  }

  const seen = await getSeen();
  const fresh = [];
  for (const room of data.ready || []) {
    if (seen[room.id]) continue;
    fresh.push(room);
    await markSeen(room.id);
    const stake =
      room.entry_type === 'GEM'
        ? `${room.stake || '?'} gems`
        : room.entry_type === 'COIN'
          ? `${room.stake || '?'} coins`
          : room.entry_type;
    const title = 'Pit filled — results ready!';
    const body = `${room.title || 'Your match'} (${stake}) is complete. Tap to watch.`;
    fireBrowserNotify(title, body, room.id);
    onReady?.(room);
  }
  return fresh;
}

export async function rememberWatchRoom(roomId) {
  try {
    const raw = await AsyncStorage.getItem(WATCH_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!list.includes(roomId)) {
      list.unshift(roomId);
      await AsyncStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 30)));
    }
  } catch {
    /* ignore */
  }
}
