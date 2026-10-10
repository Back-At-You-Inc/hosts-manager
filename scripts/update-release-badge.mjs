import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const version = process.env.RELEASE_VERSION || process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw Error('A stable release version is required.');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20" role="img" aria-label="release: v${version}"><title>release: v${version}</title><rect width="56" height="20" fill="#555"/><rect x="56" width="64" height="20" fill="#6468df"/><g fill="white" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="28" y="14">release</text><text x="88" y="14">v${version}</text></g></svg>\n`;
const path = 'assets/readme/version.svg';
if (!process.env.GITHUB_ACTIONS) {
  await writeFile(path, svg);
} else {
  const repo = process.env.GH_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Error('GH_REPO is required.');
  // Read the current master file, not the potentially older workflow checkout.
  const endpoint = `repos/${repo}/contents/${path}`;
  const file = JSON.parse(execFileSync('gh', ['api', `${endpoint}?ref=master`], { encoding: 'utf8' }));
  const current = Buffer.from(file.content, 'base64').toString();
  const previous = current.match(/release: v(\d+)\.(\d+)\.(\d+)/);
  if (previous) {
    const next = version.split('.').map(Number);
    const old = previous.slice(1).map(Number);
    const difference = next.map((part, i) => part - old[i]).find(value => value !== 0) || 0;
    if (difference <= 0) process.exit(0);
  }
  const payload = { message: `docs: refresh release badge to v${version} [skip ci]`, branch: 'master', sha: file.sha, content: Buffer.from(svg).toString('base64') };
  execFileSync('gh', ['api', '--method', 'PUT', endpoint, '--input', '-'], { input: JSON.stringify(payload), stdio: ['pipe', 'ignore', 'inherit'] });
}
