/**
 * Safe commit helper.
 *
 * Creates a local restore point before staging, commits only allowlisted files,
 * then pushes to the configured GitHub repository.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXPECTED_BRANCH = 'main';
const EXPECTED_REMOTE = 'https://github.com/jerniqz-del/eclassrecord.git';
const RESTORE_ROOT = path.join(ROOT_DIR, '.recovery-backups', 'git-restore-points');

const SNAPSHOT_PATHS = [
  '.gitignore',
  'src',
  'scripts',
  'docs',
  'community-relay',
  'package.json',
  'package-lock.json'
];

const STAGE_ALLOWLIST = [
  '.gitignore',
  'package.json',
  'package-lock.json',
  'scripts',
  'src',
  'community-relay',
  'docs/implementation-history.md',
  'docs/grade-transfer-schema-v1.0.md',
  'docs/release-notes-v1.4.0.md',
  'docs/facebook-post-v1.4.0.md',
  'docs/release-notes-v1.4.5.md',
  'docs/facebook-post-v1.4.5.md',
  'docs/release-notes-v1.4.6.md',
  'docs/facebook-post-v1.4.6.md',
  'docs/release-notes-v1.7.0.md'
];

const NEVER_STAGE = [
  '.recovery-backups',
  '.tmp-checks',
  '.agents',
  'AGENTS.md',
  'RTK.md',
  'SF 2 Daily Attendance.xlsx',
  'dist',
  'node_modules'
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

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`git ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }

  return result;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }

  return result;
}

function assertInsideRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : `${ROOT_DIR}${path.sep}`;
  if (resolved !== ROOT_DIR && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Refusing to access path outside repo: ${resolved}`);
  }
  return resolved;
}

function copyIfExists(relativePath, destinationRoot) {
  const source = assertInsideRoot(path.join(ROOT_DIR, relativePath));
  if (!fs.existsSync(source)) return;
  const destination = assertInsideRoot(path.join(destinationRoot, relativePath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function writeFile(targetPath, content) {
  const resolved = assertInsideRoot(targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
}

function getCurrentBranch() {
  return runGit(['branch', '--show-current']).stdout.trim();
}

function getHeadCommit() {
  const result = runGit(['rev-parse', '--short', 'HEAD'], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function getOriginUrl() {
  return runGit(['remote', 'get-url', 'origin']).stdout.trim();
}

function createRestorePoint(commitMessage) {
  const restoreDir = path.join(RESTORE_ROOT, timestampForPath());
  fs.mkdirSync(restoreDir, { recursive: true });

  for (const snapshotPath of SNAPSHOT_PATHS) {
    copyIfExists(snapshotPath, restoreDir);
  }

  writeFile(
    path.join(restoreDir, 'git-status.txt'),
    runGit(['status', '--short'], { allowFailure: true }).stdout
  );
  writeFile(
    path.join(restoreDir, 'tracked-changes.patch'),
    runGit(['diff', '--binary'], { allowFailure: true }).stdout
  );
  writeFile(
    path.join(restoreDir, 'restore-info.json'),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      branch: getCurrentBranch(),
      head: getHeadCommit(),
      remote: getOriginUrl(),
      commitMessage,
      snapshotPaths: SNAPSHOT_PATHS,
      stageAllowlist: STAGE_ALLOWLIST,
      neverStage: NEVER_STAGE,
      restoreHints: [
        'Copy files from this restore point back into the repo to restore the snapshot.',
        'Use git apply tracked-changes.patch to replay tracked text/binary changes when appropriate.',
        'Inspect git-status.txt and staged-files-before-commit.txt before restoring.'
      ]
    }, null, 2)}\n`
  );

  return restoreDir;
}

function stageAllowlistedFiles() {
  runGit(['reset', '--quiet']);

  for (const item of STAGE_ALLOWLIST) {
    if (fs.existsSync(path.join(ROOT_DIR, item))) {
      runGit(['add', '--', item], { stdio: 'inherit' });
    }
  }

  const stagedFiles = runGit(['diff', '--cached', '--name-only']).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const disallowed = stagedFiles.filter((file) =>
    NEVER_STAGE.some((blocked) => file === blocked || file.startsWith(`${blocked}/`))
  );

  if (disallowed.length > 0) {
    runGit(['reset', '--quiet']);
    throw new Error(`Refusing to commit disallowed files:\n${disallowed.join('\n')}`);
  }

  return stagedFiles;
}

function printRestoreInstructions(restoreDir) {
  console.log('');
  console.log('Restore point created before commit:');
  console.log(`  ${restoreDir}`);
  console.log('');
  console.log('Manual restore options:');
  console.log('  - Copy files back from the restore point snapshot.');
  console.log('  - Or apply tracked changes with: git apply tracked-changes.patch');
  console.log('  - Check restore-info.json for branch, commit, and staged-file details.');
  console.log('');
}

function main() {
  const commitMessage = process.argv.slice(2).join(' ').trim();
  if (!commitMessage) {
    console.error('Commit message is required.');
    console.error('Example: npm run safe-commit -- "release v1.4.6 patch update"');
    process.exit(1);
  }

  const branch = getCurrentBranch();
  if (branch !== EXPECTED_BRANCH) {
    throw new Error(`Safe commit must run on ${EXPECTED_BRANCH}. Current branch: ${branch || '(detached)'}`);
  }

  const originUrl = getOriginUrl();
  if (originUrl !== EXPECTED_REMOTE) {
    throw new Error(`Unexpected origin remote.\nExpected: ${EXPECTED_REMOTE}\nActual:   ${originUrl}`);
  }

  const restoreDir = createRestorePoint(commitMessage);
  printRestoreInstructions(restoreDir);

  const stagedFiles = stageAllowlistedFiles();
  writeFile(path.join(restoreDir, 'staged-files-before-commit.txt'), `${stagedFiles.join('\n')}\n`);

  if (stagedFiles.length === 0) {
    throw new Error('No allowlisted changes were staged. Commit aborted.');
  }

  console.log('Files staged for commit:');
  stagedFiles.forEach((file) => console.log(`  ${file}`));
  console.log('');

  runGit(['commit', '-m', commitMessage], { stdio: 'inherit' });
  runGit(['push', 'origin', EXPECTED_BRANCH], { stdio: 'inherit' });

  console.log('');
  console.log('Safe commit and push completed.');
  console.log(`Restore point kept at: ${restoreDir}`);
}

try {
  main();
} catch (error) {
  console.error('');
  console.error('Safe commit failed.');
  console.error(error.message || error);
  process.exit(1);
}
