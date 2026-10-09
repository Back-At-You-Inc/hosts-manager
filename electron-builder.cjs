module.exports = {
  appId: 'com.hostsmanager.desktop',
  productName: 'Hosts Manager',
  directories: { output: 'release', buildResources: 'assets/icons' },
  artifactName: 'Hosts-Manager-${version}-${os}-${arch}.${ext}',
  files: ['dist/electron/**', 'dist/renderer/**', 'assets/icons/**', 'release-config.json', 'package.json', '!node_modules/**'],
  asar: true,
  npmRebuild: false,
  forceCodeSigning: false,
  publish: null,
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
    icon: 'assets/icons/app-icon.icns',
    category: 'public.app-category.developer-tools',
    identity: null,
    hardenedRuntime: false,
    notarize: false,
    extraResources: [{ from: 'dist/helper', to: 'helper' }]
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }, { target: 'zip', arch: ['x64'] }],
    icon: 'assets/icons/app-icon.ico'
  },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'tar.gz', arch: ['x64'] }],
    icon: 'assets/icons/app-icon.png',
    category: 'Utility',
    executableName: 'hosts-manager'
  }
};
