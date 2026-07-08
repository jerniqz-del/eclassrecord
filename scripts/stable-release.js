/**
 * Stable release helper.
 *
 * Releases the exact package.json version as a GitHub draft release after
 * checkpointing local changes, creating a release restore point, building
 * installer assets, and pushing the matching tag.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXPECTED_BRANCH = 'main';
const EXPECTED_REMOTE = 'https://github.com/jerniqz-del/eclassrecord.git';
const RESTORE_ROOT = path.join(ROOT_DIR, '.recovery-backups', 'release-restore-points');

const SNAPSHOT_PATHS = [
  '.gitignore',
  'src',
  'scripts',
  'docs',
  'community-relay',
  'package.json',
  'package-lock.json'
];

function timestampForPath(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
  return result;
}

function git(args, options = {}) {
  return run('git', args, options);
}

function assertInsideRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : `${ROOT_DIR}${path.sep}`;
  if (resolved !== ROOT_DIR && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Refusing to access path outside repo: ${resolved}`);
  }
  return resolved;
}

function writeFile(targetPath, content) {
  const resolved = assertInsideRoot(targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
}

function copyIfExists(relativePath, destinationRoot) {
  const source = assertInsideRoot(path.join(ROOT_DIR, relativePath));
  if (!fs.existsSync(source)) return;
  const destination = assertInsideRoot(path.join(destinationRoot, relativePath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function parseVersion(value) {
  const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Version must be in X.Y.Z format. Received: ${value}`);
  }
  return match[0];
}

function getPackageVersion() {
  const packagePath = path.join(ROOT_DIR, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return parseVersion(packageJson.version);
}

function getBranch() {
  return git(['branch', '--show-current']).stdout.trim();
}

function getHead() {
  return git(['rev-parse', 'HEAD']).stdout.trim();
}

function getShortHead() {
  return git(['rev-parse', '--short', 'HEAD']).stdout.trim();
}

function getOriginUrl() {
  return git(['remote', 'get-url', 'origin']).stdout.trim();
}

function getStatusLines() {
  return git(['status', '--short']).stdout
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

function releaseNotesPath(version) {
  const filePath = path.join(ROOT_DIR, 'docs', `release-notes-v${version}.md`);
  return fs.existsSync(filePath) ? filePath : '';
}

function createRestorePoint(version, notesPath) {
  const tagName = `v${version}`;
  const restoreDir = path.join(RESTORE_ROOT, `${tagName}-${timestampForPath()}`);
  fs.mkdirSync(restoreDir, { recursive: true });

  for (const snapshotPath of SNAPSHOT_PATHS) {
    copyIfExists(snapshotPath, restoreDir);
  }

  const status = git(['status', '--short'], { allowFailure: true }).stdout;
  const restoreInfo = {
    createdAt: new Date().toISOString(),
    version,
    tagName,
    branch: getBranch(),
    head: getHead(),
    shortHead: getShortHead(),
    remote: getOriginUrl(),
    releaseNotesUsed: notesPath ? path.relative(ROOT_DIR, notesPath) : '',
    expectedAssets: expectedAssets(version).map((asset) => path.relative(ROOT_DIR, asset)),
    snapshotPaths: SNAPSHOT_PATHS,
    releaseMode: 'draft'
  };

  writeFile(path.join(restoreDir, 'git-status.txt'), status);
  writeFile(path.join(restoreDir, 'release-info.json'), `${JSON.stringify(restoreInfo, null, 2)}\n`);
  if (notesPath) {
    writeFile(
      path.join(restoreDir, 'release-notes-used.md'),
      fs.readFileSync(notesPath, 'utf8')
    );
  }

  return restoreDir;
}

function expectedAssets(version) {
  return [
    path.join(ROOT_DIR, 'dist', `E-Class-Record-Setup-${version}.exe`),
    path.join(ROOT_DIR, 'dist', `E-Class-Record-Setup-${version}.exe.blockmap`),
    path.join(ROOT_DIR, 'dist', 'latest.yml')
  ];
}

function ensureBranchAndRemote() {
  const branch = getBranch();
  if (branch !== EXPECTED_BRANCH) {
    throw new Error(`Stable release must run on ${EXPECTED_BRANCH}. Current branch: ${branch || '(detached)'}`);
  }

  const origin = getOriginUrl();
  if (origin !== EXPECTED_REMOTE) {
    throw new Error(`Unexpected origin remote.\nExpected: ${EXPECTED_REMOTE}\nActual:   ${origin}`);
  }
}

async function ensureCleanTreeOrCheckpoint(version) {
  const statusLines = getStatusLines();
  if (statusLines.length === 0) return;

  console.log('');
  console.log('Local changes are present:');
  statusLines.forEach((line) => console.log(`  ${line}`));
  console.log('');
  console.log('A stable release needs a clean committed state.');
  const answer = await question('Create a safe checkpoint commit and push first? (y/N): ');
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new Error('Release cancelled because local changes are not committed.');
  }

  const checkpointMessage = `checkpoint: v${version} stable release prep`;
  const checkpoint = run(
    process.execPath,
    [path.join(__dirname, 'update-checkpoint.js'), '--yes', checkpointMessage],
    { stdio: 'inherit' }
  );

  if (checkpoint.status !== 0) {
    throw new Error('Checkpoint failed. Stable release cancelled.');
  }

  const remaining = getStatusLines();
  if (remaining.length > 0) {
    throw new Error(`Working tree is still dirty after checkpoint:\n${remaining.join('\n')}`);
  }
}

function ensureGithubCli() {
  run('gh', ['--version'], { allowFailure: false });
}

function ensureTag(version) {
  const tagName = `v${version}`;
  const head = getHead();
  const tagResult = git(['rev-list', '-n', '1', tagName], { allowFailure: true });

  if (tagResult.status === 0) {
    const tagHead = tagResult.stdout.trim();
    if (tagHead !== head) {
      throw new Error(`Tag ${tagName} already exists but points to ${tagHead.slice(0, 12)}, not current ${head.slice(0, 12)}.`);
    }
    console.log(`Tag ${tagName} already exists on the current commit.`);
  } else {
    git(['tag', '-a', tagName, '-m', `Release ${tagName}`], { stdio: 'inherit' });
    console.log(`Created tag ${tagName}.`);
  }

  git(['push', 'origin', tagName], { stdio: 'inherit' });
}

function runBuild() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npmCommand, ['run', 'build'], { stdio: 'inherit' });
}

function ensureAssets(version) {
  const missing = expectedAssets(version).filter((assetPath) => !fs.existsSync(assetPath));
  if (missing.length > 0) {
    throw new Error(`Build completed but required release assets are missing:\n${missing.join('\n')}`);
  }
}

function ensureDraftRelease(version, notesPath) {
  const tagName = `v${version}`;
  const viewResult = run('gh', ['release', 'view', tagName, '--json', 'isDraft'], { allowFailure: true });

  if (viewResult.status === 0) {
    const releaseInfo = JSON.parse(viewResult.stdout || '{}');
    if (releaseInfo.isDraft === false) {
      throw new Error(`GitHub release ${tagName} is already published. Aborting to avoid changing a live release.`);
    }
    console.log(`GitHub release ${tagName} already exists. Uploading assets with --clobber.`);
  } else {
    const args = ['release', 'create', tagName, '--draft', '--title', `E-Class Record ${tagName}`];
    if (notesPath) {
      args.push('--notes-file', notesPath);
    } else {
      args.push('--generate-notes');
    }
    run('gh', args, { stdio: 'inherit' });
  }
}

function uploadAssets(version) {
  const tagName = `v${version}`;
  run(
    'gh',
    ['release', 'upload', tagName, ...expectedAssets(version), '--clobber'],
    { stdio: 'inherit' }
  );
}

function writeReleaseResult(restoreDir, version, notesPath) {
  const tagName = `v${version}`;
  const result = {
    completedAt: new Date().toISOString(),
    version,
    tagName,
    branch: getBranch(),
    head: getHead(),
    remote: getOriginUrl(),
    releaseMode: 'draft',
    releaseNotesUsed: notesPath ? path.relative(ROOT_DIR, notesPath) : '',
    uploadedAssets: expectedAssets(version).map((asset) => path.relative(ROOT_DIR, asset)),
    publishCommand: `gh release edit ${tagName} --draft=false`
  };

  writeFile(path.join(restoreDir, 'release-result.json'), `${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  ensureBranchAndRemote();
  const version = getPackageVersion();
  const tagName = `v${version}`;
  const notesPath = releaseNotesPath(version);

  console.log('');
  console.log(`Preparing stable draft release for ${tagName}.`);
  console.log(`Release notes: ${notesPath ? path.relative(ROOT_DIR, notesPath) : 'GitHub autogenerated notes'}`);

  await ensureCleanTreeOrCheckpoint(version);
  ensureGithubCli();

  const restoreDir = createRestorePoint(version, notesPath);
  console.log(`Release restore point created: ${restoreDir}`);

  ensureTag(version);
  runBuild();
  ensureAssets(version);
  ensureDraftRelease(version, notesPath);
  uploadAssets(version);
  writeReleaseResult(restoreDir, version, notesPath);

  console.log('');
  console.log(`Draft release ${tagName} is ready for inspection.`);
  console.log('When ready to publish it live, run:');
  console.log(`  gh release edit ${tagName} --draft=false`);
}

main().catch((error) => {
  console.error('');
  console.error('Stable release failed.');
  console.error(error.message || error);
  process.exit(1);
});
