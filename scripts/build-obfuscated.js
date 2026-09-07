/**
 * Builds the Electron app from an isolated obfuscated staging tree. The
 * readable workspace source is never modified, even if the build is killed.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { obfuscateDirectory } = require('./obfuscate');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const tmpDir = path.join(rootDir, '.tmp');
const stageDir = path.join(tmpDir, `electron-build-stage-${Date.now()}-${process.pid}`);

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

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) return;
  const stats = fs.statSync(source);
  if (stats.isDirectory()) copyDirectory(source, destination);
  else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function runBuilder(args) {
  const cliPath = require.resolve('electron-builder/cli.js');
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: stageDir,
    stdio: 'inherit',
    env: process.env
  });
}

function normalizedBuilderArgs(args) {
  let hasOutput = false;
  const normalized = args.map((argument) => {
    const prefix = '--config.directories.output=';
    if (!String(argument).startsWith(prefix)) return argument;
    hasOutput = true;
    const requested = String(argument).slice(prefix.length);
    return `${prefix}${path.isAbsolute(requested) ? requested : path.resolve(rootDir, requested)}`;
  });
  if (!hasOutput) normalized.push(`--config.directories.output=${path.join(rootDir, 'dist')}`);
  return normalized;
}

function prepareStage() {
  removeDirectory(stageDir);
  fs.mkdirSync(stageDir, { recursive: true });
  copyDirectory(srcDir, path.join(stageDir, 'src'));
  copyIfPresent(path.join(rootDir, 'package.json'), path.join(stageDir, 'package.json'));
  copyIfPresent(path.join(rootDir, 'package-lock.json'), path.join(stageDir, 'package-lock.json'));
  copyIfPresent(path.join(rootDir, 'electron-builder.yml'), path.join(stageDir, 'electron-builder.yml'));
  copyIfPresent(path.join(rootDir, 'build'), path.join(stageDir, 'build'));
  copyIfPresent(
    path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug'),
    path.join(stageDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug')
  );
  fs.symlinkSync(path.join(rootDir, 'node_modules'), path.join(stageDir, 'node_modules'), 'junction');
}

function main() {
  const requestedArgs = process.argv.slice(2);
  if (requestedArgs.length === 0) requestedArgs.push('--win');
  const builderArgs = normalizedBuilderArgs(requestedArgs);

  fs.mkdirSync(tmpDir, { recursive: true });
  console.log('Creating isolated release-build staging tree...');
  prepareStage();

  let result;
  try {
    obfuscateDirectory(path.join(stageDir, 'src'));
    result = runBuilder(builderArgs);
  } finally {
    removeDirectory(stageDir);
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
  try { removeDirectory(stageDir); } catch (_cleanupError) {}
  process.exit(1);
}
