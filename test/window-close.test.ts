import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleWindowClose } from '../electron/window-close';

for (const platform of ['darwin', 'win32', 'linux']) {
  for (const hasTray of [true, false]) {
    test(`${platform}: close keeps app reachable with tray=${hasTray}`, () => {
      const calls: string[] = [];
      handleWindowClose({ platform, hasTray, allowClose: false, quitting: false,
        preventDefault: () => calls.push('prevent'), hide: () => calls.push('hide'), minimize: () => calls.push('minimize') });
      assert.deepEqual(calls, ['prevent', hasTray || platform === 'darwin' ? 'hide' : 'minimize']);
    });
  }
  test(`${platform}: explicit Quit permits window destruction after cleanup`, () => {
    const unexpected = () => assert.fail('Quit must not hide or prevent closing');
    handleWindowClose({ platform, hasTray: true, allowClose: true, quitting: true,
      preventDefault: unexpected, hide: unexpected, minimize: unexpected });
  });
  test(`${platform}: close during cleanup waits for Quit to finish`, () => {
    let prevented = false;
    const unexpected = () => assert.fail('Keep cleanup errors visible');
    handleWindowClose({ platform, hasTray: true, allowClose: false, quitting: true,
      preventDefault: () => { prevented = true; }, hide: unexpected, minimize: unexpected });
    assert.equal(prevented, true);
  });
}
