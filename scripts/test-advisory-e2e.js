const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
global.AdvisoryDashboard = require('../src/renderer/js/advisory-dashboard.js');
global.AdvisoryBackup = require('../src/renderer/js/advisory-backup.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');

// Adviser B creates an Advisory Class and copies Teacher A's learner roster.
const adviserDb = { version: 3, teacherName: 'Adviser B', schoolName: 'Monbon ES', schoolYear: '2026-2027', assignments: [] };
AdvisoryData.normalizeAdvisoryData(adviserDb);
const advisoryClass = AdvisoryData.createClass(adviserDb, { id: 'advisory-1', schoolYear: adviserDb.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Adviser B', schoolName: adviserDb.schoolName, isActive: true });
Transfer.ensureGradeLevelSubjects(adviserDb, advisoryClass);
const teacherClass = {
  id: 'class-math', schoolYear: '2026-2027', gradeLevel: '4', section: 'Molave', subject: 'Mathematics', dashboardOrder: 7,
  learners: [
    { id: 'source-1', lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan', sex: 'M' },
    { id: 'source-2', lrn: '123456789013', lastName: 'Reyes', firstName: 'Maria', sex: 'F' }
  ], assessments: [], scores: {}
};
const rosterReview = AdvisoryRoster.reviewLearners(adviserDb, advisoryClass.id, teacherClass.learners, `existing-class:${teacherClass.id}`);
const importedLearners = AdvisoryRoster.commitReviewedLearners(adviserDb, advisoryClass.id, rosterReview, new Set([0, 1]));
assert.strictEqual(importedLearners.length, 2);

// Teacher A exports only Term 1 final grades into the versioned offline file.
const sourceDb = { teacherName: 'Teacher A', schoolName: 'Monbon ES', schoolYear: '2026-2027' };
const sourceGrades = { 'source-1': 88, 'source-2': 91 };
const transferFile = Transfer.buildExportPayload({
  assignment: teacherClass,
  profileDb: sourceDb,
  term: 1,
  appVersion: '1.5.0-test',
  exportId: 'e2e-export-1',
  exportedAt: '2026-07-13T01:00:00.000Z',
  getFinalGrade: (_assignment, learnerId, term) => term === '1' ? sourceGrades[learnerId] : null
});
assert.strictEqual(Transfer.validatePayload(transferFile).isValid, true);
assert.strictEqual(transferFile.learners.length, 2);

// Adviser B previews, confirms, and receives scoped grades plus audit history.
const previewSnapshot = JSON.stringify(adviserDb.advisory);
const plan = Transfer.planImport(adviserDb, advisoryClass, JSON.parse(JSON.stringify(transferFile)), Transfer.gradeTransferFilename(transferFile));
assert.strictEqual(JSON.stringify(adviserDb.advisory), previewSnapshot);
assert.deepStrictEqual(plan.rows.map(row => row.status), ['matched-lrn', 'matched-lrn']);
const importResult = Transfer.applyImportPlan(adviserDb, plan);
assert.strictEqual(importResult.importedCount, 2);
assert.strictEqual(adviserDb.advisory.grades.length, 2);
assert.strictEqual(adviserDb.advisory.importBatches.length, 1);
assert.strictEqual(adviserDb.advisory.sourceMappings.length, 1);

// Completion is calculated from actual learner-grade records, not file presence.
let summary = AdvisoryDashboard.summarize(adviserDb, advisoryClass);
assert.strictEqual(summary.completedSets, 1);
assert.strictEqual(summary.expectedSets, 27);
assert.strictEqual(summary.missingGrades, 52);
assert.strictEqual(summary.completionPercent, 4);

// Backup, restore, and restart preserve grades, history, sources, and dashboard invariants.
const backupText = JSON.stringify(adviserDb);
const restartedDb = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(backupText));
assert.deepStrictEqual(restartedDb.advisory, adviserDb.advisory);
summary = AdvisoryDashboard.summarize(restartedDb, restartedDb.advisory.classes[0]);
assert.strictEqual(summary.completedSets, 1);
const advisoryCard = AdvisoryDashboard.renderCard(restartedDb, restartedDb.schoolYear, 'grid');
assert(advisoryCard.includes('data-dashboard-fixed="true"'));
assert(advisoryCard.includes('draggable="false"'));

// The entire advisory transfer path is offline and introduces no network call.
const featureFiles = [
  'src/renderer/js/advisory-data.js',
  'src/renderer/js/advisory-dashboard.js',
  'src/renderer/js/advisory-roster.js',
  'src/renderer/js/advisory-grade-transfer.js',
  'src/renderer/js/advisory-backup.js'
];
featureFiles.forEach(file => {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//.test(source), `${file} must remain offline`);
});

console.log('Complete offline Advisory Class export/import/backup/restart workflow passed.');
