/**
 * Chapter / zone road battle backgrounds.
 * Keys match server sceneKey: `${themeId}_${variant}` (variant 0|1).
 * Falls back by theme, then dustlands.
 */

const SCENES = {
  dustlands_0: require('../assets/bg/roads/dustlands_0.jpg'),
  dustlands_1: require('../assets/bg/roads/dustlands_1.jpg'),
  boneyard_0: require('../assets/bg/roads/boneyard_0.jpg'),
  boneyard_1: require('../assets/bg/roads/boneyard_1.jpg'),
  ruins_0: require('../assets/bg/roads/ruins_0.jpg'),
  ruins_1: require('../assets/bg/roads/ruins_1.jpg'),
  castle_0: require('../assets/bg/roads/castle_0.jpg'),
  castle_1: require('../assets/bg/roads/castle_1.jpg'),
  forest_0: require('../assets/bg/roads/forest_0.jpg'),
  forest_1: require('../assets/bg/roads/forest_1.jpg'),
  swamp_0: require('../assets/bg/roads/swamp_0.jpg'),
  swamp_1: require('../assets/bg/roads/swamp_1.jpg'),
  ice_0: require('../assets/bg/roads/ice_0.jpg'),
  ice_1: require('../assets/bg/roads/ice_1.jpg'),
  dungeon_0: require('../assets/bg/roads/dungeon_0.jpg'),
  dungeon_1: require('../assets/bg/roads/dungeon_1.jpg'),
  skybridge_0: require('../assets/bg/roads/skybridge_0.jpg'),
  skybridge_1: require('../assets/bg/roads/skybridge_1.jpg'),
  sewer_0: require('../assets/bg/roads/sewer_0.jpg'),
  sewer_1: require('../assets/bg/roads/sewer_1.jpg'),
  volcano_0: require('../assets/bg/roads/volcano_0.jpg'),
  volcano_1: require('../assets/bg/roads/volcano_1.jpg'),
  nightmarket_0: require('../assets/bg/roads/nightmarket_0.jpg'),
  nightmarket_1: require('../assets/bg/roads/nightmarket_1.jpg'),
  crypt_0: require('../assets/bg/roads/crypt_0.jpg'),
  crypt_1: require('../assets/bg/roads/crypt_1.jpg'),
};

/**
 * @param {string|null} sceneKey e.g. "dustlands_0"
 * @param {string|object|null} worldTheme theme id or theme object from resolveTheme
 */
export function roadSceneSource(sceneKey, worldTheme = null) {
  if (sceneKey && SCENES[sceneKey]) return SCENES[sceneKey];
  const themeId =
    typeof worldTheme === 'string'
      ? worldTheme
      : worldTheme?.id ||
        (typeof worldTheme === 'object' && worldTheme?.name
          ? null
          : null);
  // try theme_0
  if (themeId && SCENES[`${themeId}_0`]) return SCENES[`${themeId}_0`];
  // resolveTheme-style object may only have id
  const id = worldTheme?.id;
  if (id && SCENES[`${id}_0`]) return SCENES[`${id}_0`];
  return SCENES.dustlands_0;
}
