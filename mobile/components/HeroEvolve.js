import { View, Image, Text, StyleSheet } from 'react-native';
import { resolveBodyArt } from '../lib/heroLook';
import {
  heroPortrait,
  hasExactSetOutfit,
  gearOriginLook,
} from '../lib/characters';
import { colors } from '../lib/theme';

/**
 * Hero portrait — race × class × gender always win.
 * Full gear set swaps body to real set armor art when we have the
 * exact sprite for this identity. No color-block overlays.
 */
export default function HeroEvolve({
  gender = 'boy',
  upgrades = {},
  gearKinds: _gearKinds = null,
  gearOrigin = null,
  race = null,
  classId = null,
  avatarUrl: _avatarUrl = null,
  size = 300,
  flashLabel = null,
  style,
}) {
  const g = gender === 'girl' ? 'girl' : 'boy';
  const r = race || 'human';
  const c = classId || 'warrior';
  const origin = gearOrigin || null;
  const originLook = origin ? gearOriginLook(origin) : null;
  const wearingSetArt = !!(
    origin &&
    hasExactSetOutfit({
      race: r,
      classId: c,
      gender: g,
      view: 'front',
      gearOrigin: origin,
    })
  );

  const raceArt =
    race || classId
      ? heroPortrait({
          race: r,
          classId: c,
          gender: g,
          view: 'front',
          // Pass origin always — heroPortrait only swaps when exact art exists
          gearOrigin: origin,
        })
      : null;
  const resolved = resolveBodyArt(g, upgrades, null);
  const source = raceArt || resolved.source;

  const who = race || classId ? `${r} ${c} · ${g}` : resolved.label;
  const setBit =
    originLook && wearingSetArt
      ? ` · ${originLook.emoji} ${originLook.name}`
      : originLook
        ? ` · ${originLook.emoji} ${originLook.name} (art pending)`
        : '';
  const label = flashLabel || `${who}${setBit}`;

  const figW = size;
  const figH = Math.round(size * 1.18);
  const showCaption = !!flashLabel || size >= 140;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: figW + 28,
          minHeight: showCaption ? figH + 36 : figH,
        },
        style,
      ]}
    >
      <View style={{ width: figW, height: figH, position: 'relative' }}>
        <Image
          source={source}
          style={{ width: figW, height: figH }}
          resizeMode="contain"
        />
      </View>

      {flashLabel ? (
        <Text style={styles.flash}>✦ {flashLabel}</Text>
      ) : showCaption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  flash: {
    marginTop: 6,
    color: colors.gold,
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
  },
  caption: {
    marginTop: 6,
    color: colors.muted,
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center',
    textTransform: 'capitalize',
    maxWidth: 200,
    lineHeight: 14,
  },
});
