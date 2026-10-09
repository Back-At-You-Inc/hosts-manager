import { execFileSync } from 'node:child_process';
if (process.platform === 'darwin') {
  execFileSync(process.execPath, ['scripts/build-helper.mjs'], { stdio: 'inherit' });
  execFileSync('dist/helper/hosts-manager-helper', ['--self-test'], { stdio: 'inherit' });
}
