'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DiagnosticService, redact } = require('../src/main/diagnostic-service');
const { RecoveryController } = require('../src/main/recovery-controller');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-phase3-'));
try {
  const diagnostics = new DiagnosticService({
    root: path.join(root, 'diagnostics'),
    maxLogBytes: 180,
    maxLogFiles: 3
  });
  const sensitive = 'pin=123456 token=abcdefghijklmnopqrstuvwxyz123456 teacherName="Juan Dela Cruz" LRN 123456789012 C:\\Users\\Teacher\\profile.json TEST DATA - NOT FOR OFFICIAL USE';
  diagnostics.log('forced-renderer-crash', { detail: sensitive });
  diagnostics.log('forced-preload-error', { detail: sensitive });
  diagnostics.log('forced-child-process-gone', { detail: sensitive });
  const combined = diagnostics.listLogFiles().map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert(!combined.includes('123456'));
  assert(!combined.includes('123456789012'));
  assert(!combined.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert(!combined.includes('C:\\Users\\Teacher'));
  assert(!combined.includes('TEST DATA - NOT FOR OFFICIAL USE'));
  assert(redact(sensitive).includes('[REDACTED_CREDENTIAL]'));
  assert(diagnostics.listLogFiles().length <= 3);

  const bundle = diagnostics.supportBundleFiles({ version: '1.9.6', electron: '44.2.0', platform: 'win32', arch: 'x64' });
  const bundleText = bundle.map(file => file.content).join('\n');
  assert(bundle.some(file => file.name === 'manifest.json'));
  assert(!bundle.some(file => file.name.endsWith('.dmp')));
  assert(!bundleText.includes('Juan Dela Cruz'));
  assert(!bundleText.includes('123456789012'));
  assert(bundleText.includes('Raw crash dumps'));

  const crashFile = path.join(diagnostics.crashRoot, 'expired.dmp');
  fs.writeFileSync(crashFile, 'crash');
  fs.utimesSync(crashFile, new Date(0), new Date(0));
  diagnostics.prune();
  assert(!fs.existsSync(crashFile));
  diagnostics.deleteAll();
  assert.strictEqual(diagnostics.listLogFiles().length, 0);

  let now = 10_000;
  const recovery = new RecoveryController({
    statePath: path.join(root, 'recovery.json'),
    now: () => now,
    crashLoopThreshold: 3,
    maxAutomaticRecoveries: 3
  });
  assert.strictEqual(recovery.recordFailure('renderer').safeMode, false);
  now += 100;
  assert.strictEqual(recovery.recordFailure('renderer').safeMode, false);
  now += 100;
  const safe = recovery.recordFailure('renderer');
  assert.strictEqual(safe.safeMode, true);
  assert.strictEqual(safe.mayReload, true);
  now += 100;
  assert.strictEqual(recovery.recordFailure('renderer').mayReload, false);
  recovery.markStable();
  assert.strictEqual(recovery.read().failures.length, 0);

  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const early = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'early-startup.js'), 'utf8');
  const startup = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'startup.js'), 'utf8');
  for (const marker of ['crashReporter.start', "uploadToServer: false", "'render-process-gone'", "'unresponsive'", "'responsive'", "'did-fail-load'", "'preload-error'", "'child-process-gone'", 'createLocalRestorePoint', 'Reload safely', 'Safe Mode']) {
    assert(main.includes(marker), `Missing Phase 3 main-process marker: ${marker}`);
  }
  for (const channel of ['diagnostics:policy', 'diagnostics:set-enabled', 'diagnostics:export', 'diagnostics:delete']) {
    assert(main.includes(channel));
    assert(preload.includes(channel));
  }
  assert(html.includes('diagnosticsSettingsCard'));
  assert(html.includes('btnExportDiagnosticBundle'));
  assert(html.includes('btnDeleteDiagnosticData'));
  assert(early.includes('__ECLASS_SAFE_MODE'));
  assert(startup.includes('!window.__ECLASS_SAFE_MODE'));

  console.log('Electron Phase 3 diagnostics, redaction, crash-loop, safe-mode, and recovery tests passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
