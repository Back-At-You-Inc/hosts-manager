const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execute = promisify(execFile);

// Seal the final bundle without requiring a paid Developer ID certificate.
// Run in builder's signing phase, after all bundle modifications are complete.
module.exports = async function signMac({ app }) {
  await execute('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app]);
  await execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
};
