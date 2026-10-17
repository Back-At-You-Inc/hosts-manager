import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { UpdateDownloadProgress, UpdateStatus } from '../shared/types';

interface DownloadOptions {
  temporaryDirectory: string;
  fetcher: typeof fetch;
  openPath: (filename: string) => Promise<string>;
  progress: (progress: UpdateDownloadProgress) => void;
  timeoutMs?: number;
}

export function createUpdateDownloader(options: DownloadOptions): (download: NonNullable<UpdateStatus['download']>) => Promise<void> {
  let pending: Promise<void> | undefined;
  return download => {
    if (pending) return pending;
    pending = run(download).finally(() => { pending = undefined; });
    return pending;
  };
  async function run(download: NonNullable<UpdateStatus['download']>): Promise<void> {
    let directory: string | undefined;
    let received = 0;
    let total: number | undefined;
    const report = (status: UpdateDownloadProgress['status'], message: string) => options.progress({ status, received, total, message });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('The update download timed out. Try again.')), options.timeoutMs ?? 10 * 60 * 1000);
    try {
      if (!/^Hosts-Manager-[A-Za-z0-9.+-]+-mac-[A-Za-z0-9]+\.dmg$/.test(download.filename)) throw new Error('Invalid update filename.');
      report('downloading', 'Downloading update…');
      directory = await fs.mkdtemp(path.join(options.temporaryDirectory, 'hosts-manager-update-'));
      const partial = path.join(directory, download.filename + '.part');
      const target = path.join(directory, download.filename);
      const response = await options.fetcher(download.url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Download returned HTTP ${response.status}.`);
      if (!response.body) throw new Error('The update download was empty.');
      const length = response.headers.get('content-length');
      if (length !== null && /^\d+$/.test(length) && Number.isSafeInteger(Number(length))) total = Number(length);
      const file = await fs.open(partial, 'wx', 0o600);
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await file.writeFile(value);
          received += value.byteLength;
          if (total !== undefined && received > total) throw new Error('The update download size did not match. Try again.');
          report('downloading', total ? `Downloading update… ${Math.round(received / total * 100)}%` : `Downloading update… ${(received / 1048576).toFixed(1)} MB`);
        }
      } finally { await reader.cancel().catch(() => {}); await file.close(); }
      if (!received || (total !== undefined && received !== total)) throw new Error('The update download was incomplete. Try again.');
      await fs.rename(partial, target);
      clearTimeout(timer);
      report('opening', 'Opening the downloaded DMG…');
      const error = await options.openPath(target);
      if (error) throw new Error(`Could not open the downloaded DMG: ${error}`);
      report('complete', 'DMG opened. Save drafts, quit Hosts Manager, then drag the new app into Applications to replace it.');
    } catch (error) {
      if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
      const message = controller.signal.aborted ? 'The update download timed out. Try again.' : error instanceof Error ? error.message : String(error);
      report('error', `Could not download update: ${message}`);
      throw new Error(message);
    } finally { clearTimeout(timer); }
  }
}
