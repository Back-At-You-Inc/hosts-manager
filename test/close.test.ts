import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareHostsClose } from '../electron/close';
import { compose, systemContent } from '../electron/hosts';
import type { HostsState } from '../shared/types';

test('closing waits for an enabling write, removes managed hosts, and restores enabled groups on the next start', async () => {
  let state: HostsState = { active: false, groups: [{ id: 'dev', name: 'Development', enabled: true, content: '127.0.0.1 app.test\n' }] };
  const system = '127.0.0.1 localhost\n192.0.2.9 original.test\n';
  let hosts = system;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = () => { state = { ...state, active: true }; hosts = compose(system, state); resolve(); }; });
  let cleaned = false;
  const close = prepareHostsClose({ pending: () => [pending], state: () => state, apply: async next => {
    cleaned = true; hosts = compose(hosts, next); return { ok: true, message: 'Removed' };
  } });
  await Promise.resolve(); assert.equal(cleaned, false);
  finish(); assert.equal((await close).ok, true);
  assert.equal(systemContent(hosts), system); assert.ok(!hosts.includes('app.test'));
  assert.equal(state.active, true); assert.equal(state.groups[0].enabled, true); assert.equal(state.groups[0].content, '127.0.0.1 app.test\n');
  hosts = compose(hosts, state);
  assert.ok(hosts.includes('127.0.0.1 app.test'));
  assert.equal(systemContent(hosts), system);
});
test('failed cleanup prevents closing and can be retried without discarding groups', async () => {
  const state: HostsState = { active: true, groups: [{ id: 'dev', name: 'Development', enabled: true, content: '127.0.0.1 app.test\n' }] };
  const options = { pending: () => [], state: () => state, apply: async () => ({ ok: false, message: 'Permission denied' }) };
  assert.deepEqual(await prepareHostsClose(options), { ok: false, message: 'Permission denied' });
  assert.equal(state.active, true); assert.equal(state.groups[0].enabled, true);
  assert.equal((await prepareHostsClose({ ...options, apply: async () => ({ ok: true, message: 'Removed' }) })).ok, true);
});
test('closing when management is off needs no protected write, even after a failed pending operation', async () => {
  const result = await prepareHostsClose({ pending: () => [Promise.reject(new Error('Earlier save failed'))], state: () => ({ active: false, groups: [] }), apply: async () => { throw new Error('Should not write'); } });
  assert.equal(result.ok, true);
});
