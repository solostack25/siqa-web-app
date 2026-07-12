const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable web as a valid platform
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

module.exports = config;
