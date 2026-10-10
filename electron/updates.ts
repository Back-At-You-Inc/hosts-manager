import type { UpdateStatus } from '../shared/types';

export function releaseRepository(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const repo = value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  return /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo) && !['.', '..'].includes(repo.split('/')[1]) ? repo : undefined;
}
function versionParts(value: string, allowPrerelease = false): bigint[] | undefined {
  if (allowPrerelease) value = value.replace(/-[A-Za-z0-9.-]+(?=\+|$)/, '');
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[A-Za-z0-9.-]+)?$/.exec(value);
  return match ? match.slice(1, 4).map(BigInt) : undefined;
}
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate), installed = versionParts(current, true);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) { if (next[i] !== installed[i]) return next[i] > installed[i]; }
  return /-/.test(current.split('+')[0]);
}
export async function checkRelease(repository: string | undefined, currentVersion: string, platform: string, arch: string, fetcher: typeof fetch = fetch): Promise<UpdateStatus> {
  const repo = releaseRepository(repository);
  if (!repo) return { status: 'unconfigured', currentVersion, message: 'A GitHub release repository has not been configured for this build.' };
  try {
    const response = await fetcher(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Hosts-Manager' },
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 404) return { status: 'error', currentVersion, message: 'No public release was found. The repository may be private or have no published releases yet.' };
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub rate limit reached. Try again later.' : `GitHub returned HTTP ${response.status}.`);
    const release: unknown = await response.json();
    if (!release || typeof release !== 'object') throw new Error('GitHub returned invalid release information.');
    const data = release as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
    if (typeof data.tag_name !== 'string' || !versionParts(data.tag_name) || data.draft || data.prerelease) throw new Error('The latest release must have a stable version tag such as v1.2.3.');
    if (!isNewerVersion(data.tag_name, currentVersion)) return { status: 'current', currentVersion, message: `Hosts Manager ${currentVersion} is up to date.` };
    const os = { darwin: 'mac', win32: 'win', linux: 'linux' }[platform];
    const prefix = `Hosts-Manager-${data.tag_name.replace(/^v/, '')}-${os}-${arch}`;
    const extensions = platform === 'darwin' ? ['dmg', 'zip'] : platform === 'win32' ? ['exe', 'zip'] : ['AppImage', 'tar.gz'];
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const compatible = assets.some(asset => asset && typeof asset.name === 'string' && (extensions.some(extension => asset.name === `${prefix}.${extension}`) || (platform === 'win32' && ['-installer.exe', '-app.zip'].some(suffix => asset.name === prefix + suffix))));
    if (!compatible) return { status: 'error', currentVersion, message: 'A newer release exists, but its download for this computer is not available yet.' };
    return { status: 'available', currentVersion, version: data.tag_name.replace(/^v/, ''), url: `https://github.com/${repo}/releases/tag/${encodeURIComponent(data.tag_name)}`, message: `Hosts Manager ${data.tag_name.replace(/^v/, '')} is available.` };
  } catch (error) {
    return { status: 'error', currentVersion, message: error instanceof Error && error.name !== 'TimeoutError' ? `Could not check for updates: ${error.message}` : 'The update check timed out. Try again later.' };
  }
}
