const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const mobileRoot = path.resolve(__dirname, '../..');
const sharedRoot = path.join(mobileRoot, 'shared');

config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@': mobileRoot,
};

config.watchFolders = [...new Set([...(config.watchFolders || []), sharedRoot])];

module.exports = config;
