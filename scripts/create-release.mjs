import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const version = process.env.RELEASE_VERSION;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-ci\.[1-9]\d*)?$/.test(version ?? '')) throw Error('A valid RELEASE_VERSION is required.');
if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '')) throw Error('A full build commit SHA is required.');
const prerelease = process.env.RELEASE_PRERELEASE === 'true';
const tag = `v${version}`;
const suffixes = ['mac-arm64.dmg', 'mac-arm64.zip', 'linux-x64.AppImage', 'linux-x64.tar.gz', 'win-x64-installer.exe', 'win-x64-app.zip'];
const files = await readdir('release');
const names = suffixes.map(suffix => `Hosts-Manager-${version}-${suffix}`).sort();
for (const name of names) {
  if (!files.includes(name)) throw Error(`Missing release artifact: ${name}`);
}
await writeFile('release/install-linux.py', await readFile('scripts/install-linux.py'));
names.push('install-linux.py');
const downloads = names.map(name => `- [${name}](https://github.com/${process.env.GH_REPO}/releases/download/${tag}/${name})`).join('\n');
const hashes = [];
for (const name of names) hashes.push(`${createHash('sha256').update(await readFile(`release/${name}`)).digest('hex')}  ${name}`);
await writeFile('release/SHA256SUMS', hashes.join('\n') + '\n');
const notes = `Hosts Manager ${version}\n\nUnsigned release with manual updates.\n\n## App downloads\n\n${downloads}\n\nThe Windows \`-installer.exe\` runs the setup wizard. The \`-app.zip\` contains the portable app; extract it and run Hosts Manager.exe.\n\n- macOS ARM64: open the DMG and move Hosts Manager to Applications, or extract the ZIP. This app is not Developer ID signed or notarized; macOS may require approval in Privacy & Security.\n- Windows x64: run the EXE installer, or extract the complete ZIP. Windows may show an unknown-publisher or SmartScreen warning.\n- Linux x64: make the AppImage executable and run it, or extract the tar.gz and run hosts-manager. Administrator changes require pkexec and a desktop authentication agent.\n\nUse Check for updates in the sidebar to find newer releases. Download update opens the release page; installation is manual. Existing saved groups remain in your user-data directory. Save editor drafts and fully quit through the tray before replacing the app.\n\nSHA256SUMS contains checksums for all six app downloads and the Linux install script.\n`;
await writeFile('release/release-notes.md', notes);
let existing;
try { existing = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch { /* Create the draft below; authentication errors will surface. */ }
if (existing && !existing.isDraft) throw Error('Refusing to change an already-published release.');
if (!existing) execFileSync('gh', ['release', 'create', tag, '--target', process.env.GITHUB_SHA, '--draft', `--prerelease=${prerelease}`, '--title', `Hosts Manager ${version}`, '--notes-file', 'release/release-notes.md'], { stdio: 'inherit' });
if (existing) execFileSync('gh', ['release', 'edit', tag, '--title', `Hosts Manager ${version}`, '--notes-file', 'release/release-notes.md'], { stdio: 'inherit' });
execFileSync('gh', ['release', 'upload', tag, ...names.map(name => `release/${name}`), 'release/SHA256SUMS', '--clobber'], { stdio: 'inherit' });
// Publish only after every artifact and checksum uploaded successfully.
execFileSync('gh', ['release', 'edit', tag, '--draft=false', `--prerelease=${prerelease}`, ...(prerelease ? ['--latest=false'] : [])], { stdio: 'inherit' });
console.log(`Published ${tag} with all six downloads and SHA256SUMS.`);
