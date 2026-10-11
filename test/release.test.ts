import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('push builds have unique versions and master releases are stable', async () => {
  // @ts-expect-error Build scripts are JavaScript modules.
  const { releaseVersion } = await import('../scripts/release-version.mjs');
  assert.deepEqual(releaseVersion('0.1.1', { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'master', GITHUB_RUN_NUMBER: '12' }), { version: '0.1.13', prerelease: false });
  assert.deepEqual(releaseVersion('0.1.1', { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'feature/test', GITHUB_RUN_NUMBER: '13' }), { version: '0.1.14-ci.13', prerelease: true });
  assert.deepEqual(releaseVersion('0.1.1', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.1' }), { version: '0.1.1', prerelease: false });
  assert.throws(() => releaseVersion('0.1.1', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.1.2' }), /match/);
  assert.throws(() => releaseVersion('0.1.1', { GITHUB_REF_TYPE: 'branch' }), /run number/);
});

test('release publishing waits for every upload and targets the tested commit', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hosts-release-test-'));
  const script = resolve('scripts/create-release.mjs');
  try {
    await mkdir(join(directory, 'release')); await mkdir(join(directory, 'bin')); await mkdir(join(directory, 'scripts'));
    await writeFile(join(directory, 'scripts/install-linux.py'), await readFile(resolve('scripts/install-linux.py')));
    for (const suffix of ['mac-arm64.dmg', 'mac-arm64.zip', 'linux-x64.AppImage', 'linux-x64.tar.gz', 'linux-x64.deb', 'linux-x64.rpm', 'win-x64-installer.exe', 'win-x64-app.zip']) await writeFile(join(directory, 'release', `Hosts-Manager-0.1.13-${suffix}`), suffix);
    await writeFile(join(directory, 'release/Hosts-Manager-0.1.13-source.zip'), 'source must not be uploaded');
    const log = join(directory, 'calls');
    await writeFile(join(directory, 'bin/gh'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_LOG"\nif [ "$2" = "view" ]; then exit 1; fi\nif [ "$2" = "upload" ] && [ "$FAIL_UPLOAD" = "yes" ]; then exit 1; fi\n', { mode: 0o755 });
    const env = { ...process.env, PATH: join(directory, 'bin') + ':' + process.env.PATH, TEST_LOG: log, RELEASE_VERSION: '0.1.13', RELEASE_PRERELEASE: 'false', GH_REPO: 'example/hosts-manager', GITHUB_SHA: 'a'.repeat(40) };
    execFileSync(process.execPath, [script], { cwd: directory, env });
    const calls = (await readFile(log, 'utf8')).trim().split('\n');
    assert.ok(calls[1].includes('--target ' + 'a'.repeat(40)));
    assert.ok(calls[1].includes('--draft'));
    assert.ok(calls[2].startsWith('release upload'));
    assert.ok(calls[2].includes('win-x64-installer.exe'));
    assert.ok(calls[2].includes('win-x64-app.zip'));
    assert.ok(calls[2].includes('linux-x64.deb'));
    assert.ok(calls[2].includes('linux-x64.rpm'));
    assert.ok(!calls[2].includes('source.zip'));
    const notes = await readFile(join(directory, 'release/release-notes.md'), 'utf8');
    assert.ok(notes.includes('## App downloads'));
    assert.ok(notes.includes('https://github.com/example/hosts-manager/releases/download/v0.1.13/Hosts-Manager-0.1.13-win-x64-installer.exe'));
    assert.ok(!notes.includes('source.zip'));
    assert.ok(calls[3].includes('--draft=false'));
    assert.equal((await readFile(join(directory, 'release/SHA256SUMS'), 'utf8')).trim().split('\n').length, 9);
    await writeFile(log, '');
    assert.throws(() => execFileSync(process.execPath, [script], { cwd: directory, env: { ...env, FAIL_UPLOAD: 'yes' }, stdio: 'pipe' }));
    assert.ok(!(await readFile(log, 'utf8')).includes('--draft=false'));
    for (const suffix of ['linux-x64.deb', 'linux-x64.rpm']) {
      const path = join(directory, 'release', `Hosts-Manager-0.1.13-${suffix}`);
      await rm(path);
      await writeFile(log, '');
      assert.throws(() => execFileSync(process.execPath, [script], { cwd: directory, env, stdio: 'pipe' }));
      assert.equal(await readFile(log, 'utf8'), '');
      await writeFile(path, suffix);
    }
    await rm(join(directory, 'release/Hosts-Manager-0.1.13-win-x64-installer.exe'));
    await writeFile(log, '');
    assert.throws(() => execFileSync(process.execPath, [script], { cwd: directory, env, stdio: 'pipe' }));
    assert.equal(await readFile(log, 'utf8'), '');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
