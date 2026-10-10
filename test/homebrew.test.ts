import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Homebrew cask uses the exact released ARM64 DMG checksum and versioned URL', async () => {
  // @ts-expect-error Build scripts are JavaScript modules.
  const { renderCask } = await import('../scripts/update-homebrew-cask.mjs');
  const hash = 'a'.repeat(64);
  const cask = renderCask('0.1.11', `${'b'.repeat(64)}  Hosts-Manager-0.1.11-mac-arm64.zip\n${hash}  Hosts-Manager-0.1.11-mac-arm64.dmg\n`, 'example/hosts-manager');
  assert.ok(cask.includes(`sha256 "${hash}"`));
  assert.ok(cask.includes('version "0.1.11"'));
  assert.ok(cask.includes('https://github.com/example/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg'));
  assert.ok(cask.includes('depends_on arch: :arm64'));
  assert.ok(cask.includes('app "Hosts Manager.app"'));
});

test('Homebrew generation rejects prereleases, missing DMGs and invalid checksums', async () => {
  // @ts-expect-error Build scripts are JavaScript modules.
  const { renderCask } = await import('../scripts/update-homebrew-cask.mjs');
  for (const version of ['0.1.11-ci.1', 'bad']) assert.throws(() => renderCask(version, '', 'example/repo'));
  for (const sums of ['', `${'a'.repeat(64)}  Hosts-Manager-0.1.10-mac-arm64.dmg`, 'invalid  Hosts-Manager-0.1.11-mac-arm64.dmg']) assert.throws(() => renderCask('0.1.11', sums, 'example/repo'));
  assert.throws(() => renderCask('0.1.11', '', 'https://evil.test'));
});
