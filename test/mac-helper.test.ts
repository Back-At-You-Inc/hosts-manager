import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helperPaths, helperPlist, helperInstallCommand, helperRemoveCommand } from '../electron/mac-helper.ts';

test('helper installs a root-owned daemon scoped to the authorized account', () => {
  const names = helperPaths(501);
  assert.equal(names.socket, '/var/run/hosts-manager-501.sock');
  assert.equal(names.binary, '/Library/PrivilegedHelperTools/com.hostsmanager.helper.501');
  const plist = helperPlist(501);
  assert.ok(plist.includes('<string>501</string>')); assert.ok(plist.includes('<key>KeepAlive</key><true/>'));
  assert.ok(!plist.includes('node')); assert.ok(!plist.includes('electron')); assert.ok(!plist.includes('<key>UserName</key>'));
  const command = helperInstallCommand(501, "/tmp/it's a helper", '/tmp/helper.plist');
  assert.ok(command.includes("'/tmp/it'\\''s a helper'"));
  assert.ok(command.includes('-o root -g wheel -m 755')); assert.ok(command.includes('-o root -g wheel -m 644'));
  assert.ok(command.includes('/bin/launchctl bootstrap system'));
});
test('invalid or privileged user IDs cannot construct helper paths', () => {
  for (const uid of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => helperPaths(uid), /regular user/);
});
test('removal stops only this account helper and never touches hosts', () => {
  const command = helperRemoveCommand(501);
  assert.ok(command.includes('system/com.hostsmanager.helper.501'));
  assert.ok(command.includes('/var/run/hosts-manager-501.sock'));
  assert.ok(!command.includes('/etc/hosts'));
  assert.ok(!command.includes('helper.502'));
});
