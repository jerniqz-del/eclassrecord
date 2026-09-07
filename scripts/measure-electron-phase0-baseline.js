'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
const XLSX = require('xlsx');
const Fixtures = require('./electron-phase0-fixtures');
global.AdvisoryData = require('../src/renderer/js/advisory-data');
const AdvisoryBackup = require('../src/renderer/js/advisory-backup');
const { CompanionSyncService } = require('../src/main/companion-sync-service');

const root = path.resolve(__dirname, '..');

function elapsed(start) {
  return Number((performance.now() - start).toFixed(2));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.floor(sorted.length / 2)].toFixed(2));
}

async function sample(count, operation) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    await operation(index);
    values.push(performance.now() - start);
  }
  return { medianMs: median(values), minMs: Number(Math.min(...values).toFixed(2)), maxMs: Number(Math.max(...values).toFixed(2)), samples: count };
}

function loadFileIo(appData) {
  const moduleRecord = { exports: {} };
  const context = {
    module: moduleRecord,
    exports: moduleRecord.exports,
    console,
    Buffer,
    Date,
    process,
    require(name) {
      if (name === 'electron') return { app: { getPath: () => appData, getVersion: () => '1.9.6-phase0' } };
      if (name === '../renderer/js/backup-recovery-id') return require('../src/renderer/js/backup-recovery-id');
      if (name === './shared-folder-sync') return {
        getDeviceInfo: () => ({ deviceId: '11111111-1111-4111-a111-111111111111' }),
        backupPaths: () => null,
        detectOneDriveRoots: () => [],
        verifyEnvelope: () => false,
      };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'main', 'file-io.js'), 'utf8'), context);
  return moduleRecord.exports;
}

function runElectron(entryArgs, marker, timeout) {
  const electron = require('electron');
  const environment = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const started = performance.now();
  const result = spawnSync(electron, entryArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    env: environment,
    windowsHide: true,
  });
  const totalMs = elapsed(started);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Electron probe failed (${result.status}): ${result.stderr || result.stdout}`);
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const line = text.split(/\r?\n/).find(value => value.startsWith(marker));
  if (!line) throw new Error(`Electron probe did not emit ${marker}.`);
  return { totalMs, details: JSON.parse(line.slice(marker.length).trim()) };
}

function runElectronWithRetries(entryArgs, marker, timeout, maximumAttempts) {
  const failures = [];
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return { ...runElectron(entryArgs, marker, timeout), attempts: attempt, priorFailures: failures };
    } catch (error) {
      failures.push(String(error.message || error).slice(0, 1000));
    }
  }
  throw new Error(`Electron probe failed ${maximumAttempts} consecutive times: ${failures.join(' | ')}`);
}

async function measure() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-phase0-baseline-'));
  try {
    const fixtures = Fixtures.fixtures();
    const largeRoot = fixtures.largeClass;
    const largeJson = JSON.stringify(largeRoot);
    const fileIO = loadFileIo(tempRoot);
    const databasePath = path.join(tempRoot, 'phase0-data.json');

    const databaseSave = await sample(15, () => {
      fileIO.writeJsonAtomically(databasePath, largeJson);
    });
    const backupCreateVerify = await sample(100, () => {
      const envelope = fileIO.createSecondaryBackupEnvelope(fixtures.unprotectedProfile.profiles[0]);
      if (!fileIO.verifyBackupEnvelopeIntegrity(envelope)) throw new Error('Generated backup failed verification.');
    });
    const legacyRestore = await sample(50, () => {
      const restored = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(JSON.stringify(fixtures.legacyBackup)));
      if (restored.advisory?.schemaVersion !== 2) throw new Error('Legacy migration failed.');
    });
    const largeSheetRoundTrip = await sample(30, () => {
      const parsed = JSON.parse(largeJson);
      if (parsed.profiles[0].data.assignments[0].learners.length !== 250) throw new Error('Large fixture was truncated.');
    });
    const memoryBefore = process.memoryUsage().heapUsed;
    const retainedLargeSheet = JSON.parse(largeJson);
    const memoryAfter = process.memoryUsage().heapUsed;
    if (!retainedLargeSheet.profiles.length) throw new Error('Large fixture allocation failed.');

    const workbookPath = path.join(tempRoot, 'phase0-large-class.xlsx');
    const rows = largeRoot.profiles[0].data.assignments[0].learners.map((learner, index) => ({
      SyntheticId: learner.id,
      SyntheticLast: learner.lastName,
      SyntheticFirst: learner.firstName,
      Score: index % 21,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Synthetic');
    const excelWrite = await sample(3, () => XLSX.writeFile(workbook, workbookPath));
    const excelRead = await sample(5, () => {
      const read = XLSX.readFile(workbookPath);
      if (!read.SheetNames.includes('Synthetic')) throw new Error('Excel round trip failed.');
    });

    const updateSource = path.join(tempRoot, 'synthetic-mobile-update.apk');
    const updateTarget = path.join(tempRoot, 'synthetic-mobile-update-copy.apk');
    fs.writeFileSync(updateSource, Buffer.alloc(16 * 1024 * 1024, 0x5a));
    const updateTransfer = await sample(3, () => {
      fs.copyFileSync(updateSource, updateTarget);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(updateTarget)).digest('hex');
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Update transfer digest failed.');
    });

    const identityPath = path.join(tempRoot, 'companion-identity.json');
    const desktopIdPath = path.join(tempRoot, 'companion-desktop-id.txt');
    const service = new CompanionSyncService({ identityPath, desktopIdPath, discoveryPort: 0 });
    await service.start({ profileId: 'synthetic-profile', profileName: 'Synthetic Profile', schoolYear: '2026-2027', desktopName: 'Synthetic Desktop' });
    await service.stop();
    const wlanReconnect = await sample(3, async () => {
      const status = await service.start({ profileId: 'synthetic-profile', profileName: 'Synthetic Profile' });
      if (!status.running || status.transport !== 'wlan') throw new Error('WLAN baseline start failed.');
      await service.stop();
    });

    const runtime = runElectron([path.join(root, 'scripts', 'electron-phase0-runtime-probe.js')], 'PHASE0_RUNTIME_PROBE ', 60000);
    const smoke = runElectronWithRetries(['.', '--offline-smoke-test'], 'SMOKE_OK ', 120000, 3);

    return {
      recordedAt: new Date().toISOString(),
      appVersion: require(path.join(root, 'package.json')).version,
      electronVersion: require(path.join(root, 'node_modules', 'electron', 'package.json')).version,
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        logicalProcessors: os.cpus().length,
        cpu: os.cpus()[0]?.model || '',
        totalMemoryBytes: os.totalmem(),
      },
      fixture: {
        learners: 250,
        serializedBytes: Buffer.byteLength(largeJson),
        retainedHeapDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
      },
      metrics: {
        electronRuntime: runtime,
        fullOfflineSmoke: {
          totalMs: smoke.totalMs,
          smokeModules: smoke.details.modules,
          attempts: smoke.attempts,
          priorFailures: smoke.priorFailures,
        },
        databaseSave,
        backupCreateVerify,
        legacyRestore,
        largeSheetRoundTrip,
        excelWrite,
        excelRead,
        updateTransfer16MiB: updateTransfer,
        wlanReconnect,
      },
    };
  } finally {
    const resolved = path.resolve(tempRoot);
    if (!resolved.startsWith(path.resolve(os.tmpdir()))) throw new Error('Refusing to remove a baseline directory outside the system temp root.');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function markdown(report, title = 'Phase 0 Performance Baseline') {
  const m = report.metrics;
  const runtime = m.electronRuntime.details;
  return `# ${title}

Recorded: ${report.recordedAt}

This is a development-machine baseline, not a hardware requirement. Compare later phases on the same machine and power profile. Each threshold allows the larger of the percentage or fixed tolerance shown.

## Environment

- App: ${report.appVersion}
- Electron: ${report.electronVersion}
- OS: ${report.system.platform} ${report.system.release} (${report.system.arch})
- CPU: ${report.system.cpu}
- Logical processors: ${report.system.logicalProcessors}
- Memory: ${(report.system.totalMemoryBytes / 1024 ** 3).toFixed(2)} GiB
- Large fixture: ${report.fixture.learners} learners, ${report.fixture.serializedBytes} serialized bytes

## Measurements and permitted regression thresholds

| Measurement | Baseline | Phase 1+ gate |
|---|---:|---:|
| Electron ready | ${runtime.electronReadyMs} ms | <= baseline + max(25%, 250 ms) |
| Probe renderer ready | ${runtime.rendererReadyMs} ms | <= baseline + max(25%, 250 ms) |
| Main working set | ${runtime.mainWorkingSetKb} KiB | <= baseline + max(20%, 50 MiB) |
| Renderer working set | ${runtime.rendererWorkingSetKb} KiB | <= baseline + max(20%, 50 MiB) |
| Retained 250-learner sheet heap delta | ${(report.fixture.retainedHeapDeltaBytes / 1024).toFixed(2)} KiB | <= baseline + max(25%, 10 MiB) |
| PDF generation, 250 rows | ${runtime.pdfMs} ms | <= baseline + max(30%, 500 ms) |
| Full offline smoke process | ${m.fullOfflineSmoke.totalMs} ms | <= baseline + max(25%, 2000 ms) |
| Atomic large database save, median | ${m.databaseSave.medianMs} ms | <= baseline + max(25%, 50 ms) |
| Backup creation and integrity, median | ${m.backupCreateVerify.medianMs} ms | <= baseline + max(25%, 20 ms) |
| Legacy restore/migration, median | ${m.legacyRestore.medianMs} ms | <= baseline + max(25%, 20 ms) |
| Large-sheet JSON round trip, median | ${m.largeSheetRoundTrip.medianMs} ms | <= baseline + max(25%, 20 ms) |
| Excel write, median | ${m.excelWrite.medianMs} ms | <= baseline + max(30%, 250 ms) |
| Excel read, median | ${m.excelRead.medianMs} ms | <= baseline + max(30%, 250 ms) |
| 16 MiB update copy and SHA-256, median | ${m.updateTransfer16MiB.medianMs} ms | <= baseline + max(30%, 250 ms) |
| WLAN stop/start reconnect, median | ${m.wlanReconnect.medianMs} ms | <= baseline + max(30%, 250 ms) |

PDF and Electron readiness use a hidden sandboxed runtime probe. The full offline smoke measurement launches the actual application with network requests blocked and waits for its built-in renderer validation to complete.
${m.fullOfflineSmoke.attempts > 1 ? `The smoke probe required ${m.fullOfflineSmoke.attempts} attempts; earlier animation-timing failures are retained in the JSON evidence and must be considered before Phase 1.\n` : ''}

## Measurement commands

- \`node scripts/measure-electron-phase0-baseline.js --write\`
- \`node scripts/electron-phase0-runtime-probe.js\` through Electron
- \`electron . --offline-smoke-test\` through the baseline runner
`;
}

measure().then(report => {
  if (process.argv.includes('--write')) {
    const phaseArgument = process.argv.find(argument => argument.startsWith('--phase='));
    const phase = String(phaseArgument?.split('=')[1] || 'phase0').toLowerCase();
    if (!/^phase[0-9]+$/.test(phase)) throw new Error(`Invalid performance phase label: ${phase}`);
    const title = `${phase.replace('phase', 'Phase ')} Performance Baseline`;
    fs.writeFileSync(path.join(root, 'docs', `electron-${phase}-performance-baseline.json`), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'docs', `electron-${phase}-performance-baseline.md`), markdown(report, title));
    console.log(`Wrote ${title}.`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
