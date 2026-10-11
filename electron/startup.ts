import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { join, isAbsolute, dirname } from 'node:path';

export function desktopArgument(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid startup executable path.');
  const escaped = value.replace(/\\/g, () => '\\'.repeat(4)).replace(/["`$]/g, character => '\\'.repeat(2) + character).replace(/%/g, '%%');
  return '"' + escaped + '"';
}
export class LinuxStartup {
  private file: string;
  constructor(directory: string, private executable: string) {
    if (!isAbsolute(directory) || !isAbsolute(executable)) throw new Error('Startup paths must be absolute.');
    this.file = join(directory, 'autostart', 'hosts-manager.desktop');
  }
  async enabled(): Promise<boolean> {
    try {
      const content = await readFile(this.file, 'utf8');
      return content.includes('X-Hosts-Manager=true') && !/^Hidden=true$/m.test(content);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
  async setEnabled(enabled: boolean): Promise<void> {
    let exists = false;
    try {
      const content = await readFile(this.file, 'utf8'); exists = true;
      if (!content.includes('X-Hosts-Manager=true')) throw new Error('An unrelated hosts-manager.desktop startup entry already exists.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!enabled) { if (exists) await rm(this.file); return; }
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file + '.tmp', `[Desktop Entry]\nType=Application\nName=Hosts Manager\nExec=${desktopArgument(this.executable)}\nTerminal=false\nX-Hosts-Manager=true\nX-GNOME-Autostart-enabled=true\n`, { mode: 0o600 });
    await rename(this.file + '.tmp', this.file);
  }
}
