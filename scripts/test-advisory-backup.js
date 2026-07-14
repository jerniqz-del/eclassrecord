const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
const AdvisoryBackup = require('../src/renderer/js/advisory-backup.js');

function populatedProfile() {
  const profile = { version: 3, schoolYear: '2026-2027', assignments: [{ id: 'subject-class', learners: [], assessments: [], scores: {} }] };
  AdvisoryData.normalizeAdvisoryData(profile);
  const advisoryClass = AdvisoryData.createClass(profile, { id: 'advisory-1', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Adviser', isActive: true });
  const learner = AdvisoryData.createLearner(profile, { id: 'learner-1', advisoryClassId: advisoryClass.id, lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan' });
  const subject = AdvisoryData.createSubject(profile, { id: 'subject-1', advisoryClassId: advisoryClass.id, subjectName: 'Mathematics', normalizedSubjectKey: 'MATHEMATICS' });
  const batch = AdvisoryData.createImportBatch(profile, { id: 'batch-1', advisoryClassId: advisoryClass.id, exportId: 'export-1', filename: 'math.json', fileFingerprint: 'fingerprint', schoolYear: profile.schoolYear, subject: 'Mathematics', term: '1', status: 'complete', conflictDecisions: { 0: 'replace' }, undoMetadata: { entries: [] } });
  AdvisoryData.createSourceMapping(profile, { id: 'mapping-1', advisoryClassId: advisoryClass.id, importedSubjectName: 'Math', importedNormalizedKey: 'MATHEMATICS', advisorySubjectId: subject.id, schoolYear: profile.schoolYear });
  AdvisoryData.createGrade(profile, { id: 'grade-1', advisoryClassId: advisoryClass.id, advisoryLearnerId: learner.id, advisorySubjectId: subject.id, schoolYear: profile.schoolYear, learnerLrn: learner.lrn, subjectName: subject.subjectName, normalizedSubjectKey: subject.normalizedSubjectKey, term: '1', finalGrade: 88, importBatchId: batch.id });
  return profile;
}

(async () => {
  // Download/upload round-trip retains every advisory entity and ordinary class data.
  const original = populatedProfile();
  const serialized = JSON.stringify(original, null, 2);
  const restored = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(serialized));
  assert.deepStrictEqual(restored.advisory, original.advisory);
  assert.deepStrictEqual(restored.assignments, original.assignments);

  // Older backups without advisory data remain valid and receive safe defaults.
  const oldBackup = { version: 2, schoolYear: '2025-2026', assignments: [{ id: 'legacy-class', learners: [], assessments: [], scores: {} }] };
  const migrated = AdvisoryBackup.prepareRestoredDatabase(oldBackup);
  assert.strictEqual(migrated.advisory.schemaVersion, 1);
  assert.deepStrictEqual(migrated.advisory.classes, []);
  assert.strictEqual(oldBackup.advisory, undefined, 'restore validation must not mutate the selected backup object');

  // Corrupt advisory references are rejected before replacement and the input is unchanged.
  const corrupt = populatedProfile();
  corrupt.advisory.grades[0].advisoryLearnerId = 'missing';
  const corruptSnapshot = JSON.stringify(corrupt);
  assert.throws(() => AdvisoryBackup.prepareRestoredDatabase(corrupt), /No data was restored/);
  assert.strictEqual(JSON.stringify(corrupt), corruptSnapshot);

  // PIN-protected backup encryption/decryption preserves the same advisory payload.
  const securitySource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/security.js'), 'utf8');
  const context = { window: { crypto: webcrypto }, console, TextEncoder, TextDecoder, Uint8Array };
  vm.createContext(context);
  vm.runInContext(securitySource, context);
  const encrypted = await context.encryptPayload(serialized, '123456');
  const decrypted = await context.decryptPayload(encrypted, '123456');
  const secureRestored = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(decrypted));
  assert.deepStrictEqual(secureRestored.advisory, original.advisory);

  // Every renderer restore entry point validates before assigning db.
  const importSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/import-export.js'), 'utf8');
  assert(importSource.includes('applyRestoredProfileDatabase(decryptedDb)'));
  assert(importSource.includes('applyRestoredProfileDatabase(restoredDb)'));
  const fileIoSource = fs.readFileSync(path.join(__dirname, '../src/main/file-io.js'), 'utf8');
  assert(fileIoSource.includes('createSecondaryBackupEnvelope(activeProfile)'));
  assert(fileIoSource.includes("format: 'eclass-record-backup'"));
  assert(fileIoSource.includes('createRollingBackup(payload'));

  console.log('Advisory backup, encrypted restore, older-backup migration, and validation tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
