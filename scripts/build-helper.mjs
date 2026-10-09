import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
if (process.platform === 'darwin') {
  const source = 'native/macos/hosts-helper.m';
  const version = createHash('sha256').update(await readFile(source)).digest('hex');
  const directory = 'dist/helper';
  await mkdir(directory, { recursive: true });
  let current = false;
  try { current = (await readFile(`${directory}/version.txt`, 'utf8')).trim() === version; await access(`${directory}/hosts-manager-helper`); } catch { current = false; }
  if (!current) {
    execFileSync('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-O2', '-Wall', '-Wextra', '-Werror', '-framework', 'Foundation', `-DHOSTS_HELPER_VERSION="${version}"`, source, '-o', `${directory}/hosts-manager-helper`], { stdio: 'inherit' });
    await writeFile(`${directory}/version.txt`, version + '\n');
  }
}
