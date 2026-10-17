import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleWindowClose } from '../electron/window-close';

for (const platform of ['darwin', 'win32', 'linux']) {
  for (const hasTray of [true, false]) {
    test(`${platform}: close keeps app reachable with tray=${hasTray}`, () => {
      const calls: string[] = [];
      handleWindowClose({ platform, hasTray, allowClose: false, quitting: false,
        preventDefault: () => calls.push('prevent'), hide: () => calls.push('hide'), minimize: () => calls.push('minimize'),
        hideDock: () => calls.push('hideDock') });
      const expected = ['prevent', hasTray || platform === 'darwin' ? 'hide' : 'minimize'];
      if (platform === 'darwin' && hasTray) expected.push('hideDock');
      assert.deepEqual(calls, expected);
    });
  }
  test(`${platform}: explicit Quit permits window destruction after cleanup`, () => {
    const unexpected = () => assert.fail('Quit must not hide or prevent closing');
    handleWindowClose({ platform, hasTray: true, allowClose: true, quitting: true,
      preventDefault: unexpected, hide: unexpected, minimize: unexpected, hideDock: unexpected });
  });
  test(`${platform}: close during cleanup waits for Quit to finish`, () => {
    let prevented = false;
    const unexpected = () => assert.fail('Keep cleanup errors visible');
    handleWindowClose({ platform, hasTray: true, allowClose: false, quitting: true,
      preventDefault: () => { prevented = true; }, hide: unexpected, minimize: unexpected, hideDock: unexpected });
    assert.equal(prevented, true);
  });
}
