'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const before = require('../docs/electron-phase0-performance-baseline.json');
const after = require('../docs/electron-phase1-performance-baseline.json');

function value(report, pathExpression) {
  return pathExpression.split('.').reduce((current, key) => current?.[key], report);
}

const gates = [
  ['Electron ready', 'metrics.electronRuntime.details.electronReadyMs', 0.25, 250],
  ['Probe renderer ready', 'metrics.electronRuntime.details.rendererReadyMs', 0.25, 250],
  ['Main working set', 'metrics.electronRuntime.details.mainWorkingSetKb', 0.20, 50 * 1024],
  ['Renderer working set', 'metrics.electronRuntime.details.rendererWorkingSetKb', 0.20, 50 * 1024],
  ['Retained large-sheet heap', 'fixture.retainedHeapDeltaBytes', 0.25, 10 * 1024 * 1024],
  ['PDF generation', 'metrics.electronRuntime.details.pdfMs', 0.30, 500],
  ['Full offline smoke', 'metrics.fullOfflineSmoke.totalMs', 0.25, 2000],
  ['Database save', 'metrics.databaseSave.medianMs', 0.25, 50],
  ['Backup create/verify', 'metrics.backupCreateVerify.medianMs', 0.25, 20],
  ['Legacy restore', 'metrics.legacyRestore.medianMs', 0.25, 20],
  ['Large-sheet JSON round trip', 'metrics.largeSheetRoundTrip.medianMs', 0.25, 20],
  ['Excel write', 'metrics.excelWrite.medianMs', 0.30, 250],
  ['Excel read', 'metrics.excelRead.medianMs', 0.30, 250],
  ['16 MiB update transfer', 'metrics.updateTransfer16MiB.medianMs', 0.30, 250],
  ['WLAN reconnect', 'metrics.wlanReconnect.medianMs', 0.30, 250],
];

const results = gates.map(([name, metricPath, percentage, fixed]) => {
  const baseline = Number(value(before, metricPath));
  const current = Number(value(after, metricPath));
  const limit = baseline + Math.max(baseline * percentage, fixed);
  return { name, baseline, current, limit: Number(limit.toFixed(2)), pass: Number.isFinite(current) && current <= limit };
});

const markdown = `# Electron Phase 1 Performance Comparison

Baseline: Electron ${before.electronVersion} (${before.recordedAt})  
Current: Electron ${after.electronVersion} (${after.recordedAt})

| Measurement | Phase 0 | Phase 1 | Limit | Result |
|---|---:|---:|---:|---|
${results.map(item => `| ${item.name} | ${item.baseline} | ${item.current} | ${item.limit} | ${item.pass ? 'Pass' : 'Fail'} |`).join('\n')}

The thresholds are the permitted Phase 0 regression gates. Timing measurements remain sensitive to machine load and should be repeated on the same power profile when a result fails narrowly.
`;

fs.writeFileSync(path.join(root, 'docs', 'electron-phase1-performance-comparison.md'), markdown);
const failures = results.filter(item => !item.pass);
if (failures.length) {
  console.error(`Phase 1 performance gate failed: ${failures.map(item => item.name).join(', ')}`);
  process.exit(1);
}
console.log(`Phase 1 performance gate passed all ${results.length} measurements.`);
