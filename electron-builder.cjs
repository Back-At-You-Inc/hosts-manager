module.exports = {
  appId: 'com.hostsmanager.desktop',
  productName: 'Hosts Manager',
  directories: { output: 'release', buildResources: 'assets/icons' },
  artifactName: 'Hosts-Manager-${version}-${os}-${arch}.${ext}',
  files: ['dist/electron/**', 'dist/renderer/**', 'assets/icons/**', 'release-config.json', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', '!node_modules/**'],
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
    icon: 'assets/icons/app-icon.ico',
    artifactName: 'Hosts-Manager-${version}-win-${arch}-app.${ext}'
  },
  appImage: { artifactName: 'Hosts-Manager-${version}-linux-x64.${ext}' },
  nsis: { artifactName: 'Hosts-Manager-${version}-win-${arch}-installer.${ext}', oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  deb: {
    artifactName: 'Hosts-Manager-${version}-linux-x64.${ext}',
    maintainer: 'Back At You, Inc.',
    depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'pkexec']
  },
  rpm: {
    artifactName: 'Hosts-Manager-${version}-linux-x64.${ext}',
    maintainer: 'Back At You, Inc.',
    fpm: ['--license', 'Proprietary'],
    depends: ['gtk3', 'libnotify', 'nss', 'libXScrnSaver', '(libXtst or libXtst6)', 'xdg-utils', 'at-spi2-core', '(libuuid or libuuid1)', 'polkit']
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }, { target: 'tar.gz', arch: ['x64'] }, { target: 'deb', arch: ['x64'] }, { target: 'rpm', arch: ['x64'] }],
    icon: 'assets/icons/app-icon.png',
    category: 'Utility',
    synopsis: 'Manage hosts files with switchable groups',
    executableName: 'hosts-manager',
    extraResources: [{ from: 'assets/icons/app-icon.png', to: 'app-icon.png' }]
  }
};
