const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Real 3D character models
config.resolver.assetExts.push('glb', 'gltf');

module.exports = config;
