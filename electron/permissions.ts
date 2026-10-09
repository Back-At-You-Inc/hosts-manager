import { updateWithMacHelper } from './mac-helper';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const psQuote = (value: string) => "'" + value.replace(/'/g, "''") + "'";
const encodedPowerShell = (source: string) => Buffer.from(source, 'utf16le').toString('base64');

export function elevationCommand(platform: string, target: string, original: string, replacement: string): { executable: string; args: string[] } {
  if (platform === 'win32') {
    const script = `$ErrorActionPreference = 'Stop'; try {
      $target = ${psQuote(target)}; $original = ${psQuote(original)}; $replacement = ${psQuote(replacement)};
      if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $original).Hash) { throw 'HOSTS_CHANGED' };
      Copy-Item -LiteralPath $target -Destination ($target + '.hosts-manager.bak') -Force;
      [System.IO.File]::WriteAllBytes($target, [System.IO.File]::ReadAllBytes($replacement));
      exit 0;
    } catch { [Console]::Error.WriteLine($_); exit 1; }`;
    // Run only the file update as administrator, keeping Electron unprivileged.
    const launch = `$ErrorActionPreference = 'Stop'; try { $child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${encodedPowerShell(script)}'; exit $child.ExitCode } catch { [Console]::Error.WriteLine($_); exit 1 }`;
    return { executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedPowerShell(launch)] };
  }
  const command = `set -eu; if ! /usr/bin/cmp -s ${shellQuote(target)} ${shellQuote(original)}; then echo HOSTS_CHANGED >&2; exit 1; fi; /bin/cp -p ${shellQuote(target)} ${shellQuote(target + '.hosts-manager.bak')}; /bin/cat ${shellQuote(replacement)} > ${shellQuote(target)}`;
  if (platform === 'linux') return { executable: 'pkexec', args: ['/bin/sh', '-c', command] };
  throw new Error('Administrator permission prompts are not supported on this operating system.');
}

export async function elevateHosts(target: string, original: string, replacement: string, systemEdit = false): Promise<void> {
  if (process.platform === 'darwin') {
    if (target !== '/etc/hosts') throw new Error('The administrator helper can update only the system hosts file.');
    return updateWithMacHelper(original, replacement, systemEdit);
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hosts-manager-'));
  try {
    await fs.chmod(directory, 0o700);
    const originalPath = path.join(directory, 'original');
    const replacementPath = path.join(directory, 'replacement');
    await fs.writeFile(originalPath, original, { mode: 0o600 });
    await fs.writeFile(replacementPath, replacement, { mode: 0o600 });
    const request = elevationCommand(process.platform, target, originalPath, replacementPath);
    await new Promise<void>((resolve, reject) => {
      execFile(request.executable, request.args, { windowsHide: true, maxBuffer: 64 * 1024 }, (error, _stdout, stderr) => {
        if (!error) return resolve();
        const details = `${stderr || ''} ${error.message}`;
        if (details.includes('HOSTS_CHANGED')) return reject(new Error('The system hosts file changed while permission was requested. Apply again to use the latest entries.'));
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && process.platform === 'linux') return reject(new Error('Linux needs PolicyKit (pkexec) and a desktop authentication agent to show the administrator prompt. Install or enable them, then apply again.'));
        if (/(-128|cancel|canceled|cancelled|1223)/i.test(details) || (process.platform === 'linux' && [126, 127].includes(Number(error.code)))) return reject(new Error('Administrator permission was cancelled or denied. Your groups remain saved.'));
        reject(new Error('The administrator update did not complete. Your groups remain saved. ' + (stderr.trim() || error.message)));
      });
    });
    if (await fs.readFile(target, 'utf8') !== replacement) throw new Error('The hosts file could not be verified after the administrator update. Apply again.');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

interface WriteOperations {
  read(target: string): Promise<string>;
  backup(target: string): Promise<void>;
  write(target: string, content: string): Promise<void>;
  elevate(target: string, original: string, replacement: string, systemEdit?: boolean): Promise<void>;
}
const operations: WriteOperations = {
  read: target => fs.readFile(target, 'utf8'),
  backup: target => fs.copyFile(target, target + '.hosts-manager.bak'),
  write: (target, content) => fs.writeFile(target, content, 'utf8'),
  elevate: elevateHosts
};
export async function writeHosts(target: string, original: string, replacement: string, io: WriteOperations = operations, systemEdit = false): Promise<void> {
  if (original === replacement) return;
  if (await io.read(target) !== original) throw new Error('The system hosts file changed. Apply again to use the latest entries.');
  try {
    await io.backup(target);
    await io.write(target, replacement);
  } catch (error) {
    if (!['EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
    await io.elevate(target, original, replacement, systemEdit);
  }
}
