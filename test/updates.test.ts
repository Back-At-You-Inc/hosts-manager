import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, isNewerVersion, releaseRepository } from '../electron/updates.ts';
const repo = 'example/hosts-manager';
const release = { tag_name: 'v0.2.0', draft: false, prerelease: false, assets: [{ name: 'Hosts-Manager-0.2.0-mac-arm64.dmg' }, { name: 'Hosts-Manager-0.2.0-win-x64.exe' }, { name: 'Hosts-Manager-0.2.0-linux-x64.AppImage' }] };
const mock = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
test('update configuration accepts GitHub repos and rejects unrelated URLs and path traversal', () => {
  assert.equal(releaseRepository('https://github.com/example/hosts-manager.git'), repo);
  assert.equal(releaseRepository(repo), repo);
  for (const invalid of ['https://evil.test/example/repo', '../repo', 'owner/repo/extra', '', 'owner/repo?token=secret']) assert.equal(releaseRepository(invalid), undefined);
});
test('stable versions compare numerically and do not install prereleases or downgrades', () => {
  assert.ok(isNewerVersion('v1.10.0', '1.9.9'));
  for (const version of ['1.9.9', '1.9.8', '1.10.0-beta.1', 'garbage']) assert.equal(isNewerVersion(version, '1.9.9'), false);
  assert.equal(isNewerVersion('1.0.0+build', '1.0.0'), false);
});
test('each platform finds its download and opens only a constructed GitHub release URL', async () => {
  for (const [platform, arch] of [['darwin', 'arm64'], ['win32', 'x64'], ['linux', 'x64']]) {
    const result = await checkRelease(repo, '0.1.0', platform, arch, mock({ ...release, html_url: 'https://evil.test' }));
    assert.equal(result.status, 'available');
    assert.equal(result.url, 'https://github.com/example/hosts-manager/releases/tag/v0.2.0');
  }
});
test('offline checks, missing downloads, drafts, rate limits and missing configuration report clearly', async () => {
  assert.equal((await checkRelease(undefined, '0.1.0', 'darwin', 'arm64', mock(release))).status, 'unconfigured');
  assert.equal((await checkRelease(repo, '0.2.0', 'darwin', 'arm64', mock(release))).status, 'current');
  assert.equal((await checkRelease(repo, '0.1.0', 'darwin', 'x64', mock(release))).status, 'error');
  for (const payload of [{ ...release, draft: true }, { ...release, prerelease: true }, null, { tag_name: 'bad' }]) assert.equal((await checkRelease(repo, '0.1.0', 'darwin', 'arm64', mock(payload))).status, 'error');
  for (const status of [403, 404, 429, 500]) assert.equal((await checkRelease(repo, '0.1.0', 'darwin', 'arm64', mock({}, status))).status, 'error');
  assert.equal((await checkRelease(repo, '0.1.0', 'darwin', 'arm64', (async () => { throw Error('offline'); }) as typeof fetch)).status, 'error');
});
