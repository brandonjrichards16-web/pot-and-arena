import { View, StyleSheet, Platform } from 'react-native';
import Character3D from './Character3D';
import SpinCharacter from './SpinCharacter';
import { portraitFor } from '../lib/characters';

/**
 * Home hero stage.
 *
 * Priority: full-body cool person you can spin.
 * - Web: real 3D mesh hero (Character3D)
 * - Native / 3D fail: best painted full-body art with spin (SpinCharacter)
 *
 * Painted art is always available as the quality bar for "looks like our person".
 */
export default function HeroStage({ gender = 'boy', tier = 0, size = 320, style }) {
  const portrait = portraitFor(gender, tier);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.wrap, style]}>
        <SpinCharacter source={portrait} size={size} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <Character3D gender={gender} tier={tier} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
});
