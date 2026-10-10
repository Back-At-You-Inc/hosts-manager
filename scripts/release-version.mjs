import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function releaseVersion(base, env) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(base);
  if (!match) throw Error('package.json must have a stable major.minor.patch version.');
  if (env.GITHUB_REF_TYPE === 'tag') {
    if (env.GITHUB_REF_NAME !== `v${base}`) throw Error('Tag must match package.json version.');
    return { version: base, prerelease: false };
  }
  if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_NUMBER ?? '')) throw Error('A GitHub workflow run number is required.');
  const core = `${match[1]}.${match[2]}.${BigInt(match[3]) + BigInt(env.GITHUB_RUN_NUMBER)}`;
  const prerelease = env.GITHUB_REF_NAME !== 'master';
  return { version: core + (prerelease ? `-ci.${env.GITHUB_RUN_NUMBER}` : ''), prerelease };
}
export async function setVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-ci\.[1-9]\d*)?$/.test(version ?? '')) throw Error('Invalid build release version.');
  for (const file of ['package.json', 'package-lock.json']) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    data.version = version;
    if (file === 'package-lock.json') data.packages[''].version = version;
    await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--set') await setVersion(process.env.RELEASE_VERSION);
  else {
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    const result = releaseVersion(version, process.env);
    if (!process.env.GITHUB_OUTPUT) throw Error('This command runs inside GitHub Actions.');
    await appendFile(process.env.GITHUB_OUTPUT, `version=${result.version}\nprerelease=${result.prerelease}\n`);
    console.log(`Release version: ${result.version}`);
  }
}
