import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { cp, readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
let executable = require('electron');
if (process.platform === 'darwin') {
  const bundle = resolve('dist/macos/Hosts Manager.app');
  const original = resolve(executable, '../../..');
  const packageVersion = JSON.parse(await readFile(require.resolve('electron/package.json'), 'utf8')).version;
  const fingerprint = packageVersion + ':1:' + createHash('sha256').update(await readFile(resolve('assets/icons/app-icon.icns'))).digest('hex');
  const stamp = resolve('dist/macos/.hosts-manager-version');
  let current = false;
  try { current = (await readFile(stamp, 'utf8')) === fingerprint; } catch { /* First launch. */ }
  if (!current) {
    await mkdir(resolve('dist/macos'), { recursive: true });
    await rm(bundle, { recursive: true, force: true });
    await cp(original, bundle, { recursive: true, verbatimSymlinks: true });
    const plist = join(bundle, 'Contents/Info.plist');
    for (const [key, value] of Object.entries({ CFBundleName: 'Hosts Manager', CFBundleDisplayName: 'Hosts Manager', CFBundleExecutable: 'Hosts Manager', CFBundleIdentifier: 'com.hostsmanager.desktop', CFBundleIconFile: 'hosts-manager.icns' })) {
      try { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]); }
      catch { execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]); }
    }
    await rename(join(bundle, 'Contents/MacOS/Electron'), join(bundle, 'Contents/MacOS/Hosts Manager'));
    await cp(resolve('assets/icons/app-icon.icns'), join(bundle, 'Contents/Resources/hosts-manager.icns'));
    // Local ad-hoc signing repairs the modified development bundle.
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' });
    await writeFile(stamp, fingerprint);
  }
  executable = join(bundle, 'Contents/MacOS/Hosts Manager');
}
if (process.argv.includes('--prepare-only')) { console.log(executable); process.exit(0); }
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [resolve('.'), ...process.argv.slice(2)], { stdio: 'inherit', env: environment });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1; });
