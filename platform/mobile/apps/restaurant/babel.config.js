module.exports = function (api) {
  api.cache(true);
  const expoRoot = require('path').dirname(require.resolve('expo/package.json'));

  return {
    presets: [require.resolve('babel-preset-expo', { paths: [expoRoot] })],
  };
};
