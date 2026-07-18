const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');
const AdvisoryBackup = require('../src/renderer/js/advisory-backup.js');
const AdvisoryReset = require('../src/renderer/js/advisory-reset.js');
const AdminTestMode = require('../src/renderer/js/admin-testing.js');
const { createZip, crc32 } = require('../src/main/zip-archive.js');

function securityContext() {
  const context = {
    crypto: webcrypto, console, TextEncoder, TextDecoder, Uint8Array,
    Date, JSON, WeakSet, Object, Array, String, Number, Error
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/security.js'), 'utf8'), context);
  return context;
}

function readStoredZip(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const checksum = buffer.readUInt32LE(offset + 14);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.strictEqual(method, 0, 'advisory backup entries must use the supported stored format');
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const content = buffer.subarray(contentStart, contentStart + size);
    assert.strictEqual(crc32(content), checksum, `ZIP checksum mismatch for ${name}`);
    entries.set(name, content);
    offset = contentStart + size;
  }
  return entries;
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-admin-mock-files-'));
  const realProfile = { teacherName: 'REAL PROFILE - MUST NOT LEAK', schoolYear: '2026-2027', assignments: [{ id: 'real-only' }] };
  const realBytes = JSON.stringify(realProfile);
  let activeDb = realProfile;
  let navigation = { currentView: 'record', recordTab: '2' };

  global.getRootDatabase = () => ({ activeProfileId: 'real-profile' });
  global.saveDatabase = async () => true;
  global.getActiveProfileDatabase = () => activeDb;
  global.replaceActiveProfileDatabase = next => { activeDb = next; };
  global.getRuntimeNavigationState = () => ({ ...navigation });
  global.replaceRuntimeNavigationState = next => { navigation = { ...next }; };
  global.normalizeDatabase = () => global.AdvisoryData.normalizeAdvisoryData(activeDb);
  global.render = () => {};
  global.setStatus = () => {};
  global.toast = () => {};

  try {
    assert.strictEqual(await AdminTestMode.startCompleteWorkspace(), true);
    assert.strictEqual(activeDb.isMockTestData, true);
    const mockProfile = activeDb;
    const secure = securityContext();

    // Real backup export/import round trip, including integrity verification.
    const envelope = await secure.createBackupEnvelope(mockProfile, '', { appVersion: '1.6.3-test' });
    const backupName = AdminTestMode.markExportFilename('eclass-record-backup.json');
    const backupPath = path.join(tempRoot, backupName);
    fs.writeFileSync(backupPath, JSON.stringify(envelope, null, 2));
    const backupText = fs.readFileSync(backupPath, 'utf8');
    assert.ok(path.basename(backupPath).startsWith('TEST-MOCK-'));
    assert.ok(backupText.includes('TEST DATA'));
    assert.ok(!backupText.includes(realProfile.teacherName), 'mock backup must not contain the real profile');
    const opened = await secure.openBackupEnvelope(JSON.parse(backupText));
    const restored = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(JSON.stringify(opened)));
    assert.strictEqual(restored.isMockTestData, true);
    assert.strictEqual(restored.assignments.length, 4);
    assert.strictEqual(restored.advisory.learners.length, 24);

    const corruptedEnvelope = JSON.parse(backupText);
    corruptedEnvelope.payload.teacherName = 'CORRUPTED';
    await assert.rejects(() => secure.openBackupEnvelope(corruptedEnvelope), /integrity check failed/);

    // CSV artifact is clearly labeled and contains only fictional learners.
    const advisoryLearners = mockProfile.advisory.learners;
    const csvBody = ['LRN,Official Name', ...advisoryLearners.map(item => `${item.lrn},"${item.lastName}, ${item.firstName}"`)].join('\r\n');
    const csvText = AdminTestMode.markCsvContent(csvBody);
    const csvPath = path.join(tempRoot, AdminTestMode.markExportFilename('advisory-learners.csv'));
    fs.writeFileSync(csvPath, csvText);
    const savedCsv = fs.readFileSync(csvPath, 'utf8');
    assert.ok(savedCsv.startsWith(`"${AdminTestMode.TEST_MARKER}"`));
    assert.ok(savedCsv.includes('990000000001'));
    assert.ok(!savedCsv.includes(realProfile.teacherName));

    // Build, write, read, validate, preview-plan, and apply a Grade Transfer File.
    const source = mockProfile.assignments.find(item => item.gradeLevel === '11');
    const teacherAssignment = {
      ...JSON.parse(JSON.stringify(source)),
      id: 'mock-general-mathematics-teacher-class',
      subject: 'General Mathematics',
      section: 'Integrity'
    };
    const gradeByLearner = new Map(teacherAssignment.learners.map((learner, index) => [learner.id, 60 + (index % 41)]));
    const transferPayload = Transfer.buildExportPayload({
      assignment: teacherAssignment,
      profileDb: mockProfile,
      term: 3,
      appVersion: '1.6.3-test',
      exportId: 'mock-deep-review-export',
      exportedAt: '2026-07-18T09:00:00.000Z',
      adviserMayModifySubmittedGrades: true,
      adviserModificationNote: 'TEST DATA note: Verify the encoding before adjusting grades.',
      getFinalGrade: (_assignment, learnerId) => gradeByLearner.get(learnerId)
    });
    const transferName = AdminTestMode.markExportFilename(Transfer.gradeTransferFilename(transferPayload));
    const transferPath = path.join(tempRoot, transferName);
    fs.writeFileSync(transferPath, JSON.stringify(transferPayload, null, 2));
    const importedPayload = JSON.parse(fs.readFileSync(transferPath, 'utf8'));
    assert.strictEqual(Transfer.validatePayload(importedPayload).isValid, true);
    assert.strictEqual(importedPayload.learners.length, 24);
    assert.strictEqual(importedPayload.permissions.adviserMayModifySubmittedGrades, true);

    const advisoryClass = mockProfile.advisory.classes[0];
    const importPlan = Transfer.planImport(mockProfile, advisoryClass, importedPayload, transferName);
    assert.strictEqual(importPlan.canImport, true, importPlan.errors.join('; '));
    const importResult = Transfer.applyImportPlan(mockProfile, importPlan);
    assert.strictEqual(importResult.importedCount, 24);
    assert.strictEqual(importResult.batch.adviserModificationNote, importedPayload.permissions.adviserModificationNote);
    const importedGrades = mockProfile.advisory.grades.filter(item => item.importBatchId === importResult.batch.id);
    assert.strictEqual(importedGrades.length, 24);
    assert.ok(importedGrades.every(item => item.sourceType === 'grade-transfer-file' && item.adviserEditAllowed === true));

    // Malformed and incompatible files are rejected without changing the store.
    const gradeCountBeforeInvalidImport = mockProfile.advisory.grades.length;
    assert.throws(() => JSON.parse('{not-valid-json'), SyntaxError);
    const invalidPayload = JSON.parse(JSON.stringify(importedPayload));
    invalidPayload.exportId = 'mock-invalid-export';
    invalidPayload.learners[0].finalGrade = 101;
    const invalidPlan = Transfer.planImport(mockProfile, advisoryClass, invalidPayload, 'TEST-MOCK-invalid.json');
    assert.strictEqual(invalidPlan.canImport, false);
    assert.ok(invalidPlan.errors.some(message => /invalid final grade/i.test(message)));
    assert.strictEqual(mockProfile.advisory.grades.length, gradeCountBeforeInvalidImport);

    // Advisory reset ZIP is physically written, parsed, CRC-checked, and inspected.
    const resetFiles = AdvisoryReset.buildResetBackupFiles(mockProfile, advisoryClass, '2026-07-18T10:00:00.000Z');
    const zipBuffer = createZip(resetFiles, new Date('2026-07-18T10:00:00.000Z'));
    const zipPath = path.join(tempRoot, AdminTestMode.markExportFilename(AdvisoryReset.resetBackupFilename(mockProfile, advisoryClass)));
    fs.writeFileSync(zipPath, zipBuffer);
    const zipEntries = readStoredZip(fs.readFileSync(zipPath));
    assert.ok(zipEntries.has('manifest.json'));
    assert.ok(zipEntries.has('learners.json'));
    assert.ok(zipEntries.has('import-history.json'));
    const manifest = JSON.parse(zipEntries.get('manifest.json').toString('utf8'));
    const importHistory = JSON.parse(zipEntries.get('import-history.json').toString('utf8'));
    assert.strictEqual(manifest.learnerCount, 24);
    assert.ok(importHistory.some(item => item.id === importResult.batch.id && item.adviserModificationNote === importedPayload.permissions.adviserModificationNote));
    assert.ok(path.basename(zipPath).startsWith('TEST-MOCK-'));

    // Test-mode edits and imports disappear; the original runtime is restored exactly.
    assert.strictEqual(AdminTestMode.exitTestMode(), true);
    assert.strictEqual(activeDb, realProfile);
    assert.strictEqual(JSON.stringify(realProfile), realBytes);
    assert.deepStrictEqual(navigation, { currentView: 'record', recordTab: '2' });
    console.log(`Admin mock file workflow passed: backup, CSV, Grade Transfer import/export, invalid import rejection, and advisory ZIP (${tempRoot}).`);
  } finally {
    if (AdminTestMode.isActive()) AdminTestMode.exitTestMode({ renderAfter: false });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
