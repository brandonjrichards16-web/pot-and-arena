import { View, Text, Image, StyleSheet } from 'react-native';
import { portraitFor } from '../lib/characters';
import {
  activePerks,
  ZONE_STYLE,
  zoneOffset,
} from '../lib/visualLoadout';
import { colors } from '../lib/theme';

/**
 * Hero stage that shows EVERY owned upgrade as a visible perk badge
 * pinned to body zones — so buying Muscle 1, Fate 2, etc. always changes the look.
 */
export default function HeroWithLoadout({
  gender = 'boy',
  tier = 0,
  upgrades = {},
  // avatarUrl ignored — painted heroes only
  avatarUrl: _avatarUrl = null,
  size = 280,
  highlightPerkId = null,
  style,
}) {
  const perks = activePerks(upgrades);
  const byZone = {};
  perks.forEach((p) => {
    if (!byZone[p.zone]) byZone[p.zone] = [];
    byZone[p.zone].push(p);
  });

  const figH = Math.round(size * 1.15);
  const figW = size;

  return (
    <View style={[styles.wrap, { width: figW + 24, height: figH + 56 }, style]}>
      <View style={[styles.stage, { width: figW, height: figH }]}>
        <Image
          source={portraitFor(gender, tier)}
          style={{ width: figW, height: figH }}
          resizeMode="contain"
        />

        {/* Perk pins — one badge per upgrade rank owned */}
        {Object.entries(byZone).map(([zone, list]) =>
          list.map((p, i) => {
            const pos = ZONE_STYLE[zone] || ZONE_STYLE.aura;
            const hot = highlightPerkId && p.id === highlightPerkId;
            return (
              <View
                key={p.id}
                style={[
                  styles.badge,
                  pos,
                  zoneOffset(i),
                  hot && styles.badgeHot,
                  p.glow ? { borderColor: p.glow, shadowColor: p.glow } : null,
                ]}
                pointerEvents="none"
              >
                <Text style={styles.badgeIcon}>{p.icon}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Compact strip of latest gear names */}
      <View style={styles.strip}>
        {perks.length === 0 ? (
          <Text style={styles.stripEmpty}>Bare · buy upgrades to gear up</Text>
        ) : (
          perks.slice(-6).map((p) => (
            <View
              key={p.id}
              style={[
                styles.stripChip,
                highlightPerkId === p.id && styles.stripChipHot,
              ]}
            >
              <Text style={styles.stripIcon}>{p.icon}</Text>
              <Text style={styles.stripName} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
          ))
        )}
      </View>
      <Text style={styles.count}>{perks.length}/30 looks unlocked</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  stage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(12,4,28,0.92)',
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 5,
  },
  badgeHot: {
    transform: [{ scale: 1.25 }],
    borderColor: '#fff',
    backgroundColor: 'rgba(80,40,10,0.95)',
  },
  badgeIcon: { fontSize: 15 },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
    marginTop: 6,
    maxWidth: 320,
  },
  stripEmpty: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  stripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(20,8,40,0.85)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stripChipHot: { borderColor: colors.gold, backgroundColor: 'rgba(60,30,10,0.9)' },
  stripIcon: { fontSize: 11 },
  stripName: { color: colors.cream, fontSize: 10, fontWeight: '700', maxWidth: 72 },
  count: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
});
