import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm. RN Alert often no-ops on web — use window.confirm there.
 * onOk runs only if user accepts.
 */
export function confirmAction(title, message, onOk, okLabel = 'Continue') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok && typeof onOk === 'function') onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: okLabel, onPress: onOk },
  ]);
}

export function alertMsg(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
