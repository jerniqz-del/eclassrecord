/**
 * Builds the Electron app with obfuscated renderer/main JavaScript while
 * restoring the readable source tree afterward.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { obfuscateDirectory } = require('./obfuscate');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const tmpDir = path.join(rootDir, '.tmp');
const backupDir = path.join(tmpDir, `src-before-obfuscation-${Date.now()}`);

function assertInsideRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Refusing to operate outside project root: ${resolved}`);
  }
  return resolved;
}

function removeDirectory(targetPath) {
  const resolved = assertInsideRoot(targetPath);
  if (fs.existsSync(resolved)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function copyDirectory(source, destination) {
  const resolvedSource = assertInsideRoot(source);
  const resolvedDestination = assertInsideRoot(destination);
  fs.cpSync(resolvedSource, resolvedDestination, { recursive: true });
}

function restoreSource() {
  if (!fs.existsSync(backupDir)) return;
  console.log('Restoring readable source files...');
  removeDirectory(srcDir);
  copyDirectory(backupDir, srcDir);
  removeDirectory(backupDir);
  console.log('Source files restored.');
}

function runBuilder(args) {
  const cliPath = require.resolve('electron-builder/cli.js');
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  });
}

function main() {
  const builderArgs = process.argv.slice(2);
  if (builderArgs.length === 0) {
    builderArgs.push('--win');
  }

  fs.mkdirSync(tmpDir, { recursive: true });
  removeDirectory(backupDir);

  const bundleResult = spawnSync(process.execPath, [path.join(__dirname, 'bundle-offline-games.js'), '--check'], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  if (bundleResult.status !== 0) {
    throw new Error('Offline game bundles are stale. Run npm run bundle:games before building.');
  }

  console.log('Creating readable source backup before release build...');
  copyDirectory(srcDir, backupDir);

  let result;
  try {
    obfuscateDirectory(srcDir);
    result = runBuilder(builderArgs);
  } finally {
    restoreSource();
  }

  if (result.error) {
    throw result.error;
  }
  process.exit(result.status || 0);
}

try {
  main();
} catch (error) {
  console.error('Build failed:', error);
  try {
    restoreSource();
  } catch (restoreError) {
    console.error('Source restore also failed:', restoreError);
  }
  process.exit(1);
}
