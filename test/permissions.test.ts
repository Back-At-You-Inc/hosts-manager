import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elevationCommand, writeHosts } from '../electron/permissions.ts';

function fixture(failure?: string) {
  const calls: string[] = [];
  const io = {
    read: async () => 'original',
    backup: async () => { calls.push('backup'); },
    write: async () => { calls.push('write'); if (failure) throw Object.assign(new Error(failure), { code: failure }); },
    elevate: async (target: string, original: string, replacement: string) => { calls.push('elevate'); assert.equal(target, '/etc/hosts'); assert.equal(original, 'original'); assert.equal(replacement, 'updated'); }
  };
  return { calls, io };
}

test('normal writes back up first without prompting', async () => {
  const { io, calls } = fixture(); await writeHosts('/etc/hosts', 'original', 'updated', io);
  assert.deepEqual(calls, ['backup', 'write']);
});
test('permission failures request elevation for the same update', async () => {
  for (const code of ['EACCES', 'EPERM']) {
    const { io, calls } = fixture(code); await writeHosts('/etc/hosts', 'original', 'updated', io);
    assert.deepEqual(calls, ['backup', 'write', 'elevate']);
  }
});
test('backup permission failures also request elevation', async () => {
  const { io, calls } = fixture(); io.backup = async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
  await writeHosts('/etc/hosts', 'original', 'updated', io); assert.deepEqual(calls, ['elevate']);
});
test('unrelated errors do not prompt and cancelled authorization rejects', async () => {
  const disk = fixture('ENOSPC'); await assert.rejects(writeHosts('/etc/hosts', 'original', 'updated', disk.io), /ENOSPC/); assert.ok(!disk.calls.includes('elevate'));
  const denied = fixture('EPERM'); denied.io.elevate = async () => { throw new Error('Permission cancelled'); };
  await assert.rejects(writeHosts('/etc/hosts', 'original', 'updated', denied.io), /cancelled/);
});
test('unchanged updates do not prompt and concurrent system edits are preserved', async () => {
  const { io, calls } = fixture(); await writeHosts('/etc/hosts', 'original', 'original', io); assert.deepEqual(calls, []);
  io.read = async () => 'external edit'; await assert.rejects(writeHosts('/etc/hosts', 'original', 'updated', io), /changed/); assert.deepEqual(calls, []);
});
test('Linux commands quote filenames and use OS authorization', () => {
  const original = "/tmp/a'b/$(touch danger)";
  const linux = elevationCommand('linux', '/etc/hosts', original, '/tmp/replacement');
  assert.equal(linux.executable, 'pkexec'); assert.deepEqual(linux.args.slice(0, 2), ['/bin/sh', '-c']);
  assert.ok(linux.args[2].includes("'/tmp/a'\\''b/$(touch danger)'")); assert.ok(linux.args[2].includes('cmp -s')); assert.ok(linux.args[2].includes('hosts-manager.bak'));
});
test('Windows uses UAC and propagates elevated process failure', () => {
  const request = elevationCommand('win32', 'C:\\Windows\\System32\\drivers\\etc\\hosts', "C:\\Temp\\user's file", 'C:\\Temp\\replacement');
  assert.equal(request.executable, 'powershell.exe');
  const outer = Buffer.from(request.args.at(-1)!, 'base64').toString('utf16le');
  assert.ok(outer.includes('-Verb RunAs -Wait -PassThru')); assert.ok(outer.includes('exit $child.ExitCode'));
  const encoded = /-EncodedCommand ([A-Za-z0-9+/=]+)/.exec(outer)![1];
  const inner = Buffer.from(encoded, 'base64').toString('utf16le');
  assert.ok(inner.includes("user''s file")); assert.ok(inner.includes('HOSTS_CHANGED')); assert.ok(inner.indexOf('Copy-Item') < inner.indexOf('WriteAllBytes'));
});

test('file-update command preserves backup and rejects stale snapshots using temporary files', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  if (process.platform === 'win32') return;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hosts-manager-test-'"));
  try {
    const target = path.join(directory, 'hosts');
    const snapshot = path.join(directory, 'original');
    const replacement = path.join(directory, 'replacement $(do-not-execute)');
    await fs.writeFile(target, 'original'); await fs.writeFile(snapshot, 'original'); await fs.writeFile(replacement, 'updated');
    const command = elevationCommand('linux', target, snapshot, replacement);
    const run = promisify(execFile);
    await run('/bin/sh', command.args.slice(1));
    assert.equal(await fs.readFile(target, 'utf8'), 'updated');
    assert.equal(await fs.readFile(target + '.hosts-manager.bak', 'utf8'), 'original');
    await fs.writeFile(target, 'external change');
    await assert.rejects(run('/bin/sh', command.args.slice(1)), /HOSTS_CHANGED/);
    assert.equal(await fs.readFile(target, 'utf8'), 'external change');
    assert.equal(await fs.readFile(target + '.hosts-manager.bak', 'utf8'), 'original');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
