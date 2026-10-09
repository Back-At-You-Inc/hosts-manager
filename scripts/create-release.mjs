import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const tag = `v${version}`;
if (process.env.GITHUB_REF_NAME !== tag) throw Error('Release tag does not match package.json version.');
const names = (await readdir('release')).filter(name => name.startsWith(`Hosts-Manager-${version}-`) && /\.(dmg|zip|exe|AppImage|tar\.gz)$/.test(name)).sort();
for (const suffix of ['mac-arm64.dmg', 'mac-arm64.zip', 'linux-x64.AppImage', 'linux-x64.tar.gz', 'win-x64.exe', 'win-x64.zip']) {
  if (!names.includes(`Hosts-Manager-${version}-${suffix}`)) throw Error(`Missing release artifact: ${suffix}`);
}
const hashes = [];
for (const name of names) hashes.push(`${createHash('sha256').update(await readFile(`release/${name}`)).digest('hex')}  ${name}`);
await writeFile('release/SHA256SUMS', hashes.join('\n') + '\n');
const notes = `Hosts Manager ${version}\n\nUnsigned release with manual updates.\n\n- macOS ARM64: open the DMG and move Hosts Manager to Applications, or extract the ZIP. This app is not Developer ID signed or notarized; macOS may require approval in Privacy & Security.\n- Windows x64: run the EXE installer, or extract the complete ZIP. Windows may show an unknown-publisher or SmartScreen warning.\n- Linux x64: make the AppImage executable and run it, or extract the tar.gz and run hosts-manager. Administrator changes require pkexec and a desktop authentication agent.\n\nUse Check for updates in the sidebar to find newer releases. Download update opens the release page; installation is manual. Existing saved groups remain in your user-data directory. Save editor drafts and fully quit through the tray before replacing the app.\n\nSHA256SUMS contains checksums for all six downloads.\n`;
await writeFile('release/release-notes.md', notes);
let existing;
try { existing = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch { /* Create the draft below; authentication errors will surface. */ }
if (existing && !existing.isDraft) throw Error('Refusing to change an already-published release.');
if (!existing) execFileSync('gh', ['release', 'create', tag, '--verify-tag', '--draft', '--title', `Hosts Manager ${version}`, '--notes-file', 'release/release-notes.md'], { stdio: 'inherit' });
if (existing) execFileSync('gh', ['release', 'edit', tag, '--title', `Hosts Manager ${version}`, '--notes-file', 'release/release-notes.md'], { stdio: 'inherit' });
execFileSync('gh', ['release', 'upload', tag, ...names.map(name => `release/${name}`), 'release/SHA256SUMS', '--clobber'], { stdio: 'inherit' });
console.log('Draft release is ready. Review the downloads on GitHub, then publish it to make update notifications available.');
