import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function renderCask(version, sums, repository) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('A stable release version is required.');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error('A GitHub repository is required.');
  const name = `Hosts-Manager-${version}-mac-arm64.dmg`;
  const line = sums.split('\n').find(line => line.trim().split(/\s+/)[1] === name);
  const hash = line?.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(hash || '')) throw Error('Missing valid DMG checksum.');
  return `cask "hosts-manager" do\n  version "${version}"\n  sha256 "${hash}"\n\n  url "https://github.com/${repository}/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"\n  name "Hosts Manager"\n  desc "Manage hosts files with switchable groups"\n  homepage "https://github.com/${repository}"\n\n  depends_on arch: :arm64\n  app "Hosts Manager.app"\nend\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.env.RELEASE_VERSION || process.argv[2];
  const repo = process.env.GH_REPO || 'Back-At-You-Inc/hosts-manager';
  const cask = renderCask(version, await readFile(process.argv[3] || 'release/SHA256SUMS', 'utf8'), repo);
  const path = 'Casks/hosts-manager.rb';
  if (process.env.GITHUB_ACTIONS !== 'true') {
    await writeFile(path, cask);
  } else {
    const endpoint = `repos/${repo}/contents/${path}`;
    const file = JSON.parse(execFileSync('gh', ['api', `${endpoint}?ref=master`], { encoding: 'utf8' }));
    const old = Buffer.from(file.content, 'base64').toString().match(/version "(\d+\.\d+\.\d+)"/);
    if (old) {
      const next = version.split('.').map(BigInt), previous = old[1].split('.').map(BigInt);
      const difference = next.map((value, i) => value - previous[i]).find(value => value !== 0n) || 0n;
      if (difference <= 0n) process.exit(0);
    }
    const payload = { message: `docs: update Homebrew cask to v${version} [skip ci]`, branch: 'master', sha: file.sha, content: Buffer.from(cask).toString('base64') };
    execFileSync('gh', ['api', '--method', 'PUT', endpoint, '--input', '-'], { input: JSON.stringify(payload), stdio: ['pipe', 'ignore', 'inherit'] });
  }
}
