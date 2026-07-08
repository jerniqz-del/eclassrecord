/**
 * Interactive update checkpoint helper.
 *
 * Detects the current package version, compares it with the latest release tag,
 * asks for confirmation, then delegates to the safe commit/push workflow.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`git ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result;
}

function runNodeScript(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  process.exit(result.status || 0);
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    raw: match[0],
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function describeBump(previous, current) {
  if (!previous) return 'new release';
  if (current.major !== previous.major) return 'major';
  if (current.minor !== previous.minor) return 'minor';
  if (current.patch !== previous.patch) return 'patch';
  return 'same-version checkpoint';
}

function getPackageVersion() {
  const packagePath = path.join(ROOT_DIR, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const version = parseVersion(packageJson.version);
  if (!version) {
    throw new Error(`package.json version is not semver: ${packageJson.version}`);
  }
  return version;
}

function getLatestSemverTagAtOrBelow(currentVersion) {
  const result = runGit(['tag', '--list'], { allowFailure: true });
  if (result.status !== 0) return null;

  const versions = result.stdout
    .split(/\r?\n/)
    .map((tag) => parseVersion(tag))
    .filter(Boolean)
    .filter((version) => compareVersions(version, currentVersion) <= 0)
    .sort((a, b) => compareVersions(b, a));

  return versions[0] || null;
}

function getChangedFiles() {
  return runGit(['status', '--short']).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const autoYesIndex = args.indexOf('--yes');
  const autoYes = autoYesIndex !== -1;
  if (autoYes) args.splice(autoYesIndex, 1);

  const explicitMessage = args.join(' ').trim();
  const current = getPackageVersion();
  const latestTag = getLatestSemverTagAtOrBelow(current);
  const bumpType = describeBump(latestTag, current);
  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log('No local changes detected. Nothing to checkpoint.');
    return;
  }

  const versionLabel = `v${current.major}.${current.minor}.${current.patch}`;
  const previousLabel = latestTag ? `v${latestTag.major}.${latestTag.minor}.${latestTag.patch}` : 'no previous semver tag';
  const defaultMessage = explicitMessage || `checkpoint: ${versionLabel} ${bumpType} update`;

  console.log('');
  console.log(`Detected ${bumpType} update checkpoint.`);
  console.log(`Current package version: ${versionLabel}`);
  console.log(`Latest release tag: ${previousLabel}`);
  console.log('');
  console.log('Local changes detected:');
  changedFiles.forEach((file) => console.log(`  ${file}`));
  console.log('');
  console.log('This will create a restore point, stage safe files only, commit, and push to origin/main.');
  console.log(`Commit message: ${defaultMessage}`);
  console.log('');

  let shouldProceed = autoYes;
  if (!shouldProceed) {
    const answer = await question('Proceed with safe commit and push? (y/N): ');
    shouldProceed = /^y(es)?$/i.test(answer.trim());
  }

  if (!shouldProceed) {
    console.log('Checkpoint cancelled. No files were staged, committed, or pushed.');
    return;
  }

  runNodeScript(path.join(__dirname, 'safe-commit.js'), [defaultMessage]);
}

main().catch((error) => {
  console.error('');
  console.error('Update checkpoint failed.');
  console.error(error.message || error);
  process.exit(1);
});
