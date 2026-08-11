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

// Evitar watch na raiz inteira do monorepo (node_modules + outra app): no Windows satura watchers e o Metro parece “preso” em 100%.
config.watchFolders = [...new Set([...(config.watchFolders || []), sharedRoot])];

module.exports = config;
