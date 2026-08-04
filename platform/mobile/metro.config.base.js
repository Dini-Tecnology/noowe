const fs = require('fs');
const path = require('path');

function resolvePackageDir(appRoot, mobileRoot, packageName) {
  const appPackage = path.join(appRoot, 'node_modules', packageName);
  if (fs.existsSync(appPackage)) return appPackage;
  return path.join(mobileRoot, 'node_modules', packageName);
}

function isExistingDir(folder) {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

function createMetroConfig(appRoot) {
  const mobileRoot = path.resolve(appRoot, '../..');

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

  // Expo SDK 54 already discovers the workspace packages and node_modules.
  // Watching the entire mobileRoot as well makes Metro index the same files
  // through overlapping roots (for example node_modules/eslint), which can
  // corrupt TreeFS when dependencies change between pnpm symlinks and npm
  // directories. The shared source folder is not a package, so watch it
  // explicitly without adding the broad workspace root.
  // O campo `workspaces` faz o Expo incluir a node_modules da raiz do workspace,
  // mas cada app instala as próprias dependências, então essa pasta pode não
  // existir. O Metro aborta a criação do transformer se um watchFolder faltar.
  config.watchFolders = [
    ...new Set([...(config.watchFolders || []), path.resolve(mobileRoot, 'shared')]),
  ]
    .filter((folder) => path.resolve(folder) !== path.resolve(appRoot))
    .filter(isExistingDir);
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
