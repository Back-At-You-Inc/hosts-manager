import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(resolve('build-tools/package.json'));
const names = process.argv.slice(2);
const targets = names.length ? names : ['mac', 'linux', 'windows'];
if (targets.some(target => !['mac', 'linux', 'windows'].includes(target))) throw Error('Targets: mac linux windows');
if (targets.includes('mac') && (process.platform !== 'darwin' || process.arch !== 'arm64')) throw Error('Build macOS ARM64 on an ARM64 Mac so its native helper matches the app.');
let builder;
try { builder = require('electron-builder'); }
catch { throw Error('Packaging tools are missing. Run npm run setup:packaging with internet access, then retry.'); }
const { releaseRepository } = await import('../dist/electron/electron/updates.js');
const configuration = JSON.parse(await readFile('release-config.json', 'utf8'));
if (process.env.HOSTS_MANAGER_RELEASE_REPOSITORY) {
  const repository = releaseRepository(process.env.HOSTS_MANAGER_RELEASE_REPOSITORY);
  if (!repository) throw Error('HOSTS_MANAGER_RELEASE_REPOSITORY must be a GitHub owner/repository.');
  await writeFile('release-config.json', JSON.stringify({ repository }, null, 2) + '\n');
} else if (!releaseRepository(configuration.repository)) {
  console.warn('No release repository configured: this build will explain that updates are unavailable. Set release-config.json before distributing.');
}
// No Developer ID, Authenticode, or automatic updater credentials are used.
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
for (const variable of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']) delete process.env[variable];
const platforms = { mac: builder.Platform.MAC, windows: builder.Platform.WINDOWS, linux: builder.Platform.LINUX };
const selected = new Map();
for (const target of targets) for (const [platform, entries] of platforms[target].createTarget(undefined, target === 'mac' ? builder.Arch.arm64 : builder.Arch.x64)) selected.set(platform, entries);
await builder.build({ targets: selected, config: require(resolve('electron-builder.cjs')), publish: 'never' });
