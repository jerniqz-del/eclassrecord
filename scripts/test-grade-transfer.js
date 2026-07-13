const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');

function fixture() {
  const profile = { teacherName: 'Teacher A', schoolName: 'Monbon ES', schoolId: '123456', division: 'Sorsogon', region: 'V', schoolYear: '2026-2027', assignments: [] };
  AdvisoryData.normalizeAdvisoryData(profile);
  const advisoryClass = AdvisoryData.createClass(profile, { id: 'advisory-1', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Adviser B', isActive: true });
  const learners = [
    AdvisoryData.createLearner(profile, { id: 'advisory-learner-1', advisoryClassId: advisoryClass.id, lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos' }),
    AdvisoryData.createLearner(profile, { id: 'advisory-learner-2', advisoryClassId: advisoryClass.id, lrn: '123456789013', lastName: 'Reyes', firstName: 'Maria' })
  ];
  const assignment = {
    id: 'class-math-4', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', subject: 'Mathematics',
    learners: [
      { id: 'source-1', lrn: learners[0].lrn, lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos' },
      { id: 'source-2', lrn: learners[1].lrn, lastName: 'Reyes', firstName: 'Maria' },
      { id: 'source-3', lrn: '123456789014', lastName: 'Missing', firstName: 'Learner' }
    ]
  };
  return { profile, advisoryClass, learners, assignment };
}

function validPayload(data = fixture()) {
  const grades = { 'source-1': 88, 'source-2': 91, 'source-3': null };
  return Transfer.buildExportPayload({
    assignment: data.assignment,
    profileDb: data.profile,
    term: 1,
    appVersion: '1.5.0',
    exportId: 'export-fixed',
    exportedAt: '2026-07-13T00:00:00.000Z',
    getFinalGrade: (_assignment, learnerId, term) => term === '1' ? grades[learnerId] : 75
  });
}

// Term export is human-readable, versioned, scoped, and contains only saved final grades.
{
  const payload = validPayload();
  assert.strictEqual(payload.format, Transfer.FORMAT);
  assert.strictEqual(payload.schemaVersion, '1.0');
  assert.strictEqual(payload.schoolYear, '2026-2027');
  assert.strictEqual(payload.class.id, 'class-math-4');
  assert.strictEqual(payload.subject.normalizedKey, 'MATHEMATICS');
  assert.strictEqual(payload.term.number, 1);
  assert.deepStrictEqual(payload.learners.map(item => item.finalGrade), [88, 91]);
  assert(!JSON.stringify(payload).includes('assessments'));
  assert(!JSON.stringify(payload).includes('attendance'));
  assert(!JSON.stringify(payload).includes('scores'));
  assert.strictEqual(Transfer.validatePayload(payload).isValid, true);
}

// Filename sanitization removes reserved symbols and export IDs are unique by default.
{
  const payload = validPayload();
  payload.subject.name = 'Math: Number / Operations?';
  const filename = Transfer.gradeTransferFilename(payload);
  assert(filename.endsWith('.json'));
  assert(!/[<>:"/\\|?*]/.test(filename));
  const data = fixture();
  const first = Transfer.buildExportPayload({ assignment: data.assignment, profileDb: data.profile, term: 1, appVersion: '1', getFinalGrade: () => 88 });
  const second = Transfer.buildExportPayload({ assignment: data.assignment, profileDb: data.profile, term: 1, appVersion: '1', getFinalGrade: () => 88 });
  assert.notStrictEqual(first.exportId, second.exportId);
}

// Invalid JSON structures, schema versions, metadata, duplicate LRNs, and grades are rejected.
{
  assert.strictEqual(Transfer.validatePayload(null).isValid, false);
  const payload = validPayload();
  payload.schemaVersion = '9.0';
  payload.learners[1].lrn = payload.learners[0].lrn;
  payload.learners[0].finalGrade = 101;
  const report = Transfer.validatePayload(payload);
  assert(report.errors.some(message => /unsupported schema/.test(message)));
  assert(report.errors.some(message => /same LRN/.test(message)));
  assert(report.errors.some(message => /invalid final grade/.test(message)));
}

// School year, grade level, and section validation happen before a write plan is accepted.
{
  const data = fixture();
  const payload = validPayload(data);
  payload.schoolYear = '2025-2026';
  payload.class.gradeLevel = '5';
  payload.class.section = 'Narra';
  const plan = Transfer.planImport(data.profile, data.advisoryClass, payload, 'wrong.json');
  assert.strictEqual(plan.canImport, false);
  assert.strictEqual(plan.errors.length, 3);
}

// Planning is read-only; exact LRN and safe name fallback match correctly.
{
  const data = fixture();
  const payload = validPayload(data);
  payload.learners[1].lrn = '';
  const snapshot = JSON.stringify(data.profile.advisory);
  const plan = Transfer.planImport(data.profile, data.advisoryClass, payload, 'math-t1.json');
  assert.strictEqual(JSON.stringify(data.profile.advisory), snapshot, 'preview must not write to the database');
  assert.deepStrictEqual(plan.rows.map(row => row.status), ['matched-lrn', 'matched-name']);
  assert.strictEqual(plan.canImport, true);
}

// Explicit application inserts subject, source mapping, grades, and import history in the correct scope.
{
  const data = fixture();
  const payload = validPayload(data);
  const plan = Transfer.planImport(data.profile, data.advisoryClass, payload, 'math-t1.json');
  const result = Transfer.applyImportPlan(data.profile, plan);
  assert.strictEqual(result.importedCount, 2);
  const store = data.profile.advisory;
  assert.strictEqual(store.subjects.length, 1);
  assert.strictEqual(store.grades.length, 2);
  assert.strictEqual(store.importBatches.length, 1);
  assert.strictEqual(store.sourceMappings.length, 1);
  assert(store.grades.every(grade => grade.schoolYear === '2026-2027' && grade.term === '1'));
  assert(store.grades.every(grade => grade.importBatchId === result.batch.id));

  const secondPlan = Transfer.planImport(data.profile, data.advisoryClass, payload, 'math-t1-again.json');
  assert(secondPlan.rows.every(row => row.status === 'conflict'));
  assert(secondPlan.errors.some(message => /already been imported/.test(message)));
  assert.strictEqual(secondPlan.canImport, false, 'duplicate files and existing grades must never be silently overwritten');
}

// UI wiring uses local file bridges and has no network dependency.
{
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/advisory-grade-transfer.js'), 'utf8');
  assert(source.includes('electronAPI.exportGradeTransfer'));
  assert(source.includes('electronAPI.importGradeTransfer'));
  assert(!/\bfetch\s*\(/.test(source));
  const dashboard = fs.readFileSync(path.join(__dirname, '../src/renderer/js/dashboard.js'), 'utf8');
  assert(dashboard.includes('showGradeTransferExportModal'));
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert(main.includes("title: 'Save Grade Transfer File'"));
  assert(main.includes("title: 'Select Grade Transfer File'"));
}

console.log('Offline Grade Transfer File export, validation, preview, and import tests passed.');
