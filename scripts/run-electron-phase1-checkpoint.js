'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const expectedVersion = String(process.argv[2] || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error('Usage: node scripts/run-electron-phase1-checkpoint.js <electron-version>');
}

const actualVersion = require('../node_modules/electron/package.json').version;
if (actualVersion !== expectedVersion) {
  throw new Error(`Installed Electron ${actualVersion} does not match checkpoint ${expectedVersion}.`);
}

function run(command, args, options = {}) {
  const environment = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
    timeout: options.timeout || 120000,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${options.label || command} failed (${result.status}).\n${output.slice(-6000)}`);
  }
  if (options.marker && !output.includes(options.marker)) {
    throw new Error(`${options.label || command} did not emit ${options.marker}.\n${output.slice(-3000)}`);
  }
  return { label: options.label || command, durationMs: Date.now() - startedAt, marker: options.marker || '', outputTail: output.slice(-1200) };
}

function node(script, label) {
  return run(process.execPath, [path.join(root, script)], { label, timeout: 120000 });
}

const checks = [];
checks.push(node('scripts/check-electron-modernization-migration-safety.js', 'schema freeze'));
checks.push(node('scripts/test-electron-phase0-fixtures.js', 'compatibility fixtures'));
checks.push(node('scripts/test-database-future-proof.js', 'database and backup compatibility'));
checks.push(node('scripts/test-attendance-pdf-print.js', 'attendance PDF/print'));
checks.push(node('scripts/test-auto-updater.js', 'desktop updater'));
checks.push(node('scripts/test-companion-sync-service.js', 'WLAN companion service'));
checks.push(node('scripts/test-mobile-sync-bluetooth-qr.js', 'Bluetooth fallback'));
checks.push(node('scripts/test-single-instance.js', 'single instance'));

const electron = require('electron');
checks.push(run(electron, ['.', '--offline-smoke-test'], { label: 'source offline smoke', marker: 'SMOKE_OK ', timeout: 150000 }));

const outputDir = path.join('dist', 'phase1-checkpoint');
checks.push(run(process.execPath, [
  require.resolve('electron-builder/cli.js'),
  '--win',
  '--dir',
  `--config.directories.output=${outputDir.replace(/\\/g, '/')}`,
], { label: 'unpacked Windows build', timeout: 240000 }));

const packagedExe = path.join(root, outputDir, 'win-unpacked', 'E-Class Record.exe');
checks.push(run(packagedExe, ['--offline-smoke-test'], { label: 'packaged offline smoke', marker: 'SMOKE_OK ', timeout: 150000 }));

const reportPath = path.join(root, 'docs', 'electron-phase1-checkpoints.json');
let report = { target: '44.2.0', baseline: '33.4.11', checkpoints: [] };
if (fs.existsSync(reportPath)) report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
for (const checkpoint of report.checkpoints || []) {
  if (checkpoint.nodeVersion && !checkpoint.hostNodeVersion) checkpoint.hostNodeVersion = checkpoint.nodeVersion;
  delete checkpoint.nodeVersion;
}
report.checkpoints = (report.checkpoints || []).filter(item => item.electronVersion !== actualVersion);
report.checkpoints.push({
  electronVersion: actualVersion,
  hostNodeVersion: process.versions.node,
  recordedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  checks: checks.map(({ label, durationMs, marker }) => ({ label, durationMs, marker })),
});
report.checkpoints.sort((left, right) => Number(left.electronVersion.split('.')[0]) - Number(right.electronVersion.split('.')[0]));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Electron ${actualVersion} checkpoint passed ${checks.length} checks, including source and packaged smoke.`);
