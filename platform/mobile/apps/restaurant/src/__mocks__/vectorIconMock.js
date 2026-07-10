// Jest mock for '@expo/vector-icons' and any of its subpath imports
// (e.g. '@expo/vector-icons/MaterialCommunityIcons'). The real package
// pulls in expo-font -> expo-modules-core, which needs native modules that
// don't exist under the plain 'react-native' Jest preset (no jest-expo).
const IconStub = 'Icon';

module.exports = new Proxy(
  { default: IconStub, __esModule: true },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return IconStub;
    },
  }
);
