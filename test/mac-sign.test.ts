import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const signMac = createRequire(import.meta.url)('../scripts/sign-mac.cjs') as (options: { app: string }) => Promise<void>;

test('macOS signing seals bundle resources and detects later changes', { skip: process.platform !== 'darwin' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hosts-manager-sign-'));
  const app = join(directory, 'Fixture.app');
  try {
    await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
    await mkdir(join(app, 'Contents', 'Resources'));
    await copyFile('/bin/echo', join(app, 'Contents', 'MacOS', 'Fixture'));
    await writeFile(join(app, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleIdentifier</key><string>com.hostsmanager.signing-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
    const resource = join(app, 'Contents', 'Resources', 'settings.json');
    await writeFile(resource, '{}');
    await signMac({ app });
    await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    await writeFile(resource, '{"modified":true}');
    await assert.rejects(execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
