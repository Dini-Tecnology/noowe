const fs = require('fs');
const path = require('path');

function resolvePackageDir(appRoot, mobileRoot, packageName) {
  const appPackage = path.join(appRoot, 'node_modules', packageName);
  if (fs.existsSync(appPackage)) return appPackage;
  return path.join(mobileRoot, 'node_modules', packageName);
}

function createMetroConfig(appRoot) {
  const mobileRoot = path.resolve(appRoot, '../..');

  // Monorepo: alinha serverRoot e rewrite do entry point com a raiz do workspace,
  // para que expo-router/entry resolva em mobile/node_modules (e não em apps/*/node_modules).
  process.env.EXPO_USE_METRO_WORKSPACE_ROOT = '1';

  const { getDefaultConfig } = require(require.resolve('expo/metro-config', {
    paths: [appRoot],
  }));
  const config = getDefaultConfig(appRoot);

  // Gradle/pnpm criam e apagam pastas dentro de node_modules durante `run:android`.
  // No Windows o watcher do Metro quebra com ENOENT se tentar observar esses paths.
  const nativeBuildBlockList = [
    /[/\\]\.gradle[/\\]/,
    /[/\\]\.cxx[/\\]/,
    /[/\\]android[/\\].*[/\\]build[/\\]/,
    /[/\\]ios[/\\]build[/\\]/,
    /[/\\]ios[/\\]Pods[/\\]/,
    /[/\\]node_modules[/\\].*_tmp_\d+[/\\]/,
  ];

  const existingBlockList = config.resolver?.blockList;
  const blockList = Array.isArray(existingBlockList)
    ? [...existingBlockList, ...nativeBuildBlockList]
    : existingBlockList
      ? [existingBlockList, ...nativeBuildBlockList]
      : nativeBuildBlockList;

  config.watchFolders = [...(config.watchFolders || []), mobileRoot];
  config.server = {
    ...config.server,
    unstable_serverRoot: mobileRoot,
  };
  config.resolver = {
    ...config.resolver,
    blockList,
    nodeModulesPaths: [
      path.resolve(appRoot, 'node_modules'),
      path.resolve(mobileRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: true,
    extraNodeModules: {
      ...(config.resolver?.extraNodeModules || {}),
      '@': mobileRoot,
      '@okinawa/shared': path.resolve(mobileRoot, 'shared'),
      // Evita carregar duas cópias de react-native-svg no bundle (RNSVGRect duplicado).
      'react-native-svg': resolvePackageDir(appRoot, mobileRoot, 'react-native-svg'),
      'lucide-react-native': resolvePackageDir(appRoot, mobileRoot, 'lucide-react-native'),
    },
  };

  return config;
}

module.exports = { createMetroConfig };
