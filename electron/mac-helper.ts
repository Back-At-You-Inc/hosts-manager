import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createConnection } from 'node:net';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
export interface HelperReply { ok: boolean; version: string; message?: string }
export function helperPaths(uid: number) {
  if (!Number.isSafeInteger(uid) || uid <= 0) throw new Error('The hosts helper requires a regular user account.');
  const label = `com.hostsmanager.helper.${uid}`;
  return { label, socket: `/var/run/hosts-manager-${uid}.sock`, binary: `/Library/PrivilegedHelperTools/${label}`, plist: `/Library/LaunchDaemons/${label}.plist` };
}
export function helperPlist(uid: number) {
  const names = helperPaths(uid);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${names.label}</string>
<key>ProgramArguments</key><array><string>${names.binary}</string><string>${uid}</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>Umask</key><integer>63</integer>
</dict></plist>`;
}
export function helperInstallCommand(uid: number, stagedBinary: string, stagedPlist: string) {
  const names = helperPaths(uid);
  return `set -eu; /usr/bin/install -d -o root -g wheel -m 755 /Library/PrivilegedHelperTools; /bin/launchctl bootout ${quote('system/' + names.label)} >/dev/null 2>&1 || true; /usr/bin/install -o root -g wheel -m 755 ${quote(stagedBinary)} ${quote(names.binary)}; /usr/bin/install -o root -g wheel -m 644 ${quote(stagedPlist)} ${quote(names.plist)}; /bin/launchctl bootstrap system ${quote(names.plist)}`;
}
export function helperRemoveCommand(uid: number) {
  const names = helperPaths(uid);
  return `/bin/launchctl bootout ${quote('system/' + names.label)} >/dev/null 2>&1 || true; /bin/rm -f ${quote(names.plist)} ${quote(names.binary)} ${quote(names.socket)}`;
}
async function authorize(command: string, prompt: string) {
  try {
    await exec('/usr/bin/osascript', ['-e', `do shell script ${JSON.stringify(command)} with administrator privileges with prompt ${JSON.stringify(prompt)}`], { maxBuffer: 64 * 1024 });
  } catch (error) {
    const details = error as Error & { stderr?: string };
    if (/(-128|cancel)/i.test(`${details.stderr || ''} ${details.message}`)) throw new Error('Helper authorization was cancelled. Your groups remain saved.');
    throw new Error('Could not set up the hosts helper. ' + (details.stderr?.trim() || details.message));
  }
}
export function requestHelper(socketPath: string, payload: Record<string, unknown>): Promise<HelperReply> {
  return new Promise((resolve, reject) => {
    let response = '';
    const socket = createConnection(socketPath);
    let completed = false;
    const finish = (error?: Error, reply?: HelperReply) => {
      if (completed) return;
      completed = true; socket.destroy();
      if (error) reject(error); else resolve(reply!);
    };
    socket.setTimeout(15000, () => finish(new Error('The hosts helper did not respond. Try applying again.')));
    socket.on('connect', () => socket.write(JSON.stringify(payload) + '\n'));
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      response += chunk;
      if (response.length > 64 * 1024) return finish(new Error('Invalid response from the hosts helper.'));
      if (!response.includes('\n')) return;
      try {
        const result: unknown = JSON.parse(response.slice(0, response.indexOf('\n')));
        if (!result || typeof result !== 'object' || !('ok' in result) || typeof result.ok !== 'boolean' || !('version' in result) || typeof result.version !== 'string') throw new Error('Invalid response from the hosts helper.');
        finish(undefined, result as HelperReply);
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
    socket.on('error', finish);
    socket.on('end', () => { if (!completed) finish(new Error('The hosts helper closed the connection before responding.')); });
  });
}
let installation: Promise<void> | undefined;
async function ensureHelper(uid: number) {
  const names = helperPaths(uid);
  // Development build resources. Packaged apps can supply their copied resources here.
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const resources = resourcesPath ? path.join(resourcesPath, 'helper') : '';
  const development = path.resolve(__dirname, '../../helper');
  let directory = development;
  try { await fs.access(path.join(resources, 'version.txt')); directory = resources; } catch { /* Development app. */ }
  const version = (await fs.readFile(path.join(directory, 'version.txt'), 'utf8')).trim();
  try {
    const reply = await requestHelper(names.socket, { operation: 'ping' });
    if (reply.ok && reply.version === version) return;
  } catch (error) {
    if (!['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
  }
  if (!installation) installation = (async () => {
    const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'hosts-helper-install-'));
    try {
      await fs.chmod(stage, 0o700);
      const binary = path.join(stage, 'helper');
      const plist = path.join(stage, 'helper.plist');
      await fs.copyFile(path.join(directory, 'hosts-manager-helper'), binary);
      await fs.chmod(binary, 0o700);
      await fs.writeFile(plist, helperPlist(uid), { mode: 0o600 });
      await authorize(helperInstallCommand(uid, binary, plist), 'Install the Hosts Manager helper to allow future hosts updates without repeated password prompts.');
      // launchd may return before the daemon has bound its socket.
      for (let attempt = 0; attempt < 30; attempt++) {
        try { const reply = await requestHelper(names.socket, { operation: 'ping' }); if (reply.ok && reply.version === version) return; } catch { /* Startup pending. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('The hosts helper was installed but did not start. Try applying again.');
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  })().finally(() => { installation = undefined; });
  await installation;
}
export async function updateWithMacHelper(original: string, replacement: string, systemEdit = false) {
  const uid = process.getuid!();
  await ensureHelper(uid);
  const reply = await requestHelper(helperPaths(uid).socket, { operation: systemEdit ? 'save-system' : 'apply', original, replacement });
  if (!reply.ok) throw new Error(reply.message || 'The hosts helper could not apply the update.');
  if (await fs.readFile('/etc/hosts', 'utf8') !== replacement) throw new Error('The hosts update could not be verified. Apply again.');
}
export async function removeMacHelper() {
  await authorize(helperRemoveCommand(process.getuid!()), 'Remove the Hosts Manager administrator helper.');
}
