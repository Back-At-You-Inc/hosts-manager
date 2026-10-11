import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinuxStartup, desktopArgument } from '../electron/startup';

test('Linux launch at startup creates, reads, and removes only its own entry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hosts-startup-'));
  try {
    const startup = new LinuxStartup(directory, '/home/user/My Apps/Hosts Manager');
    assert.equal(await startup.enabled(), false);
    await startup.setEnabled(true); assert.equal(await startup.enabled(), true);
    const file = join(directory, 'autostart/hosts-manager.desktop');
    assert.match(await readFile(file, 'utf8'), /Exec="\/home\/user\/My Apps\/Hosts Manager"/);
    await startup.setEnabled(false); assert.equal(await startup.enabled(), false);
    await writeFile(file, '[Desktop Entry]\nName=Another app\n');
    await assert.rejects(startup.setEnabled(true), /unrelated/);
    await assert.rejects(startup.setEnabled(false), /unrelated/);
    assert.match(await readFile(file, 'utf8'), /Another app/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('startup executable quoting preserves desktop field codes and rejects line injection', () => {
  assert.equal(desktopArgument('/Apps/100% "$Home"'), String.raw`"/Apps/100%% \\"\\$Home\\""`);
  assert.equal(desktopArgument('/Apps/a\\b'), String.raw`"/Apps/a\\\\b"`);
  assert.throws(() => desktopArgument('/app\nExec=bad'));
});
