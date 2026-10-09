import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, validate } from '../electron/hosts.ts';
const groups = [{ id: 'dev', name: 'Dev', enabled: true, content: '127.0.0.1 app.local' }, { id: 'disabled', name: 'Disabled', enabled: false, content: 'invalid' }];
test('preserves existing entries and includes only enabled groups', () => {
  const output = compose('127.0.0.1 localhost\n', { active: true, groups });
  assert.ok(output.startsWith('127.0.0.1 localhost\n')); assert.ok(output.includes('127.0.0.1 app.local')); assert.ok(!output.includes('invalid'));
  assert.equal(compose(output, { active: true, groups }), output);
  assert.equal(compose(output, { active: false, groups }), '127.0.0.1 localhost\n');
});
test('supports IPv6, comments, multiple names and rejects bad entries', () => {
  validate('# comment\n::1 localhost alias # comment\n127.0.0.1 app.local');
  assert.throws(() => validate('999.0.0.1 bad'), /Line 1/); assert.throws(() => validate('127.0.0.1'), /Line 1/);
});
test('preserves CRLF and suffix outside the managed block', () => {
  const original = '127.0.0.1 localhost\r\n'; const output = compose(original, { active: true, groups });
  assert.equal(compose(output + '# user suffix\r\n', { active: false, groups }), original + '# user suffix\r\n');
});
test('rejects damaged markers and applies groups in order', () => {
  assert.throws(() => compose('# >>> Hosts Manager\n', { active: true, groups }), /malformed/);
  const output = compose('', { active: true, groups: [...groups, { id: 'second', name: 'Second', enabled: true, content: '::1 second.local' }] });
  assert.ok(output.indexOf('app.local') < output.indexOf('second.local'));
});

test('places groups before and after the system entries and preserves that order on reapply', () => {
  const base = '# System hosts\n127.0.0.1 localhost\n::1 localhost\n';
  const state = { active: true, systemPosition: 1, groups: [groups[0], { id: 'second', name: 'Second', enabled: true, content: '::1 second.local' }] };
  const output = compose(base, state);
  assert.ok(output.indexOf('app.local') < output.indexOf('# System hosts'));
  assert.ok(output.indexOf('second.local') > output.indexOf('::1 localhost'));
  assert.equal(compose(output, state), output);
  assert.equal(compose(output, { ...state, active: false }), base);
});

test('moving groups across system entries removes their old sections', () => {
  const base = '127.0.0.1 localhost\r\n';
  const below = compose(base, { active: true, groups, systemPosition: 0 });
  const above = compose(below, { active: true, groups, systemPosition: 2 });
  assert.ok(above.indexOf('app.local') < above.indexOf('localhost'));
  assert.equal(above.split('app.local').length, 2);
  assert.equal(compose(above, { active: false, groups }), base);
});

test('migrates legacy managed sections and rejects mismatched section markers', () => {
  const legacy = '127.0.0.1 localhost\n# >>> Hosts Manager\n127.0.0.1 old.local\n# <<< Hosts Manager\n';
  const output = compose(legacy, { active: true, groups, systemPosition: 1 });
  assert.ok(!output.includes('old.local'));
  assert.ok(output.indexOf('app.local') < output.indexOf('localhost'));
  assert.throws(() => compose('# >>> Hosts Manager (before system)\n# <<< Hosts Manager (after system)\n', { active: true, groups }), /malformed/);
});

test('editing System preserves active groups, validates entries, and rejects stale edits', async () => {
  const { composeSystem, systemContent } = await import('../electron/hosts.ts');
  const base = '127.0.0.1 localhost\n';
  const state = { active: true, systemPosition: 1, groups };
  const original = compose(base, state);
  const edited = '127.0.0.1 localhost\n::1 edited.local\n';
  const output = composeSystem(original, base, edited, state);
  assert.equal(systemContent(output), edited);
  assert.ok(output.includes('app.local'));
  assert.ok(output.indexOf('app.local') < output.indexOf('localhost'));
  assert.equal(composeSystem(original, base, edited, { ...state, active: false }), edited);
  assert.throws(() => composeSystem(original, 'stale', edited, state), /changed/);
  assert.throws(() => composeSystem(original, base, 'invalid entry', state), /Line 1/);
  assert.throws(() => composeSystem(original, base, '# >>> Hosts Manager\n', state), /markers/);
});
