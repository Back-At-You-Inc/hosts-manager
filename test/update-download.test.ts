import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createUpdateDownloader } from '../electron/update-download.ts';
import type { UpdateDownloadProgress } from '../shared/types.ts';

const download = { filename: 'Hosts-Manager-0.2.0-mac-arm64.dmg', url: 'https://github.com/example/hosts-manager/releases/download/v0.2.0/Hosts-Manager-0.2.0-mac-arm64.dmg' };
test('downloads atomically, reports progress, opens the DMG and shares concurrent requests', async t => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'update-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const progress: UpdateDownloadProgress[] = [];
  let requests = 0, opened = 0;
  const run = createUpdateDownloader({ temporaryDirectory: directory, progress: value => progress.push(value),
    fetcher: (async () => { requests++; return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-length': '3' } }); }) as typeof fetch,
    openPath: async filename => { opened++; assert.equal(path.basename(filename), download.filename); assert.deepEqual(await fs.readFile(filename), Buffer.from([1, 2, 3])); assert.deepEqual(await fs.readdir(path.dirname(filename)), [download.filename]); return ''; }
  });
  const first = run(download);
  assert.equal(run(download), first);
  await first;
  assert.equal(requests, 1); assert.equal(opened, 1);
  assert.ok(progress.some(value => value.status === 'downloading' && value.received === 3 && value.total === 3));
  assert.equal(progress.at(-1)?.status, 'complete');
});
test('HTTP, network, empty, truncated, stream and open failures clean files and allow retry', async t => {
  for (const failure of ['http', 'network', 'empty', 'truncated', 'stream', 'open']) {
    await t.test(failure, async t => {
      const directory = await fs.mkdtemp(path.join(tmpdir(), 'update-test-'));
      t.after(() => fs.rm(directory, { recursive: true, force: true }));
      let failing = true;
      const progress: UpdateDownloadProgress[] = [];
      const run = createUpdateDownloader({ temporaryDirectory: directory, progress: value => progress.push(value),
        fetcher: (async () => {
          if (failing && failure === 'network') throw new Error('offline');
          if (failing && failure === 'http') return new Response('', { status: 503 });
          if (failing && failure === 'empty') return new Response('');
          if (failing && failure === 'stream') return new Response(new ReadableStream({ start(controller) { controller.error(new Error('stream failed')); } }));
          return new Response('abc', { headers: { 'content-length': failing && failure === 'truncated' ? '10' : '3' } });
        }) as typeof fetch,
        openPath: async () => failing && failure === 'open' ? 'could not mount' : ''
      });
      await assert.rejects(run(download));
      assert.equal(progress.at(-1)?.status, 'error');
      assert.deepEqual(await fs.readdir(directory), []);
      failing = false;
      await run(download);
      assert.equal(progress.at(-1)?.status, 'complete');
    });
  }
});
test('unsafe filenames, filesystem failures and timed-out requests fail safely', async t => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'update-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const options = { temporaryDirectory: directory, progress: () => {}, openPath: async () => '', fetcher: (async () => new Response('abc')) as typeof fetch };
  await assert.rejects(createUpdateDownloader(options)({ ...download, filename: '../escape.dmg' }), /Invalid update filename/);
  await assert.rejects(createUpdateDownloader({ ...options, temporaryDirectory: path.join(directory, 'missing') })(download), /ENOENT/);
  await assert.rejects(createUpdateDownloader({ ...options, timeoutMs: 5, fetcher: (async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))) as typeof fetch })(download), /timed out/);
  assert.deepEqual(await fs.readdir(directory), []);
});
test('a streamed write failure closes the file, removes the partial download and never opens it', async t => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'update-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const originalOpen = filesystem.open;
  let closed = false, opened = false;
  const replacement = t.mock.method(filesystem, 'open', async (...args: Parameters<typeof filesystem.open>) => {
    const file = await originalOpen(...args);
    t.mock.method(file, 'writeFile', async () => { throw new Error('disk full'); });
    const close = file.close.bind(file);
    t.mock.method(file, 'close', async () => { closed = true; await close(); });
    return file;
  });
  const run = createUpdateDownloader({ temporaryDirectory: directory, fetcher: (async () => new Response('abc')) as typeof fetch, progress: () => {}, openPath: async () => { opened = true; return ''; } });
  try { await assert.rejects(run(download), /disk full/); }
  finally { replacement.mock.restore(); }
  assert.equal(closed, true); assert.equal(opened, false);
  assert.deepEqual(await fs.readdir(directory), []);
});
