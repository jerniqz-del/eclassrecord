const assert = require('assert');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');

function setup() {
  const profile = { schoolYear: '2026-2027', teacherName: 'Teacher A', assignments: [] };
  AdvisoryData.normalizeAdvisoryData(profile);
  const advisoryClass = AdvisoryData.createClass(profile, { id: 'advisory-1', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Adviser', isActive: true });
  AdvisoryData.createLearner(profile, { id: 'learner-1', advisoryClassId: advisoryClass.id, lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan' });
  AdvisoryData.createLearner(profile, { id: 'learner-2', advisoryClassId: advisoryClass.id, lrn: '123456789013', lastName: 'Reyes', firstName: 'Maria' });
  Transfer.ensureGradeLevelSubjects(profile, advisoryClass);
  return { profile, advisoryClass };
}

function payload(exportId = 'export-1', grades = [88, 90]) {
  return {
    format: Transfer.FORMAT,
    schemaVersion: Transfer.SCHEMA_VERSION,
    appVersion: '1.5.0',
    exportId,
    exportedAt: '2026-07-13T00:00:00.000Z',
    schoolYear: '2026-2027',
    school: { name: 'School' },
    teacher: { name: 'Teacher A' },
    class: { id: 'class-1', name: 'Mathematics 4 - Molave', gradeLevel: '4', section: 'Molave' },
    subject: { id: 'mathematics-4', name: 'Mathematics', normalizedKey: 'MATHEMATICS' },
    term: { number: 1, label: 'Term 1' },
    learners: [
      { learnerId: 'source-1', lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan', middleName: '', extensionName: '', fullName: 'Cruz, Juan', finalGrade: grades[0], gradeStatus: 'final', remarks: '' },
      { learnerId: 'source-2', lrn: '123456789013', lastName: 'Reyes', firstName: 'Maria', middleName: '', extensionName: '', fullName: 'Reyes, Maria', finalGrade: grades[1], gradeStatus: 'final', remarks: '' }
    ]
  };
}

function importInitial(data) {
  const plan = Transfer.planImport(data.profile, data.advisoryClass, payload(), 'initial.json');
  assert.strictEqual(plan.canImport, true);
  return Transfer.applyImportPlan(data.profile, plan);
}

// Exact file and export duplicates stop before confirmation.
{
  const data = setup();
  importInitial(data);
  const duplicate = Transfer.planImport(data.profile, data.advisoryClass, payload(), 'initial-copy.json');
  assert.strictEqual(duplicate.canImport, false);
  assert(duplicate.errors.some(message => /already been imported/.test(message)));
}

// Corrected-file re-import requires a decision for every existing grade.
{
  const data = setup();
  importInitial(data);
  const corrected = Transfer.planImport(data.profile, data.advisoryClass, payload('export-1', [89, 92]), 'corrected.json');
  assert.strictEqual(corrected.correctedReimport, true);
  assert.strictEqual(corrected.unresolvedConflictCount, 2);
  assert.strictEqual(corrected.canImport, false);
  Transfer.setConflictDecision(corrected, 0, 'keep');
  assert.strictEqual(corrected.canImport, false);
  Transfer.setConflictDecision(corrected, 1, 'replace');
  assert.strictEqual(corrected.canImport, true);
  const result = Transfer.applyImportPlan(data.profile, corrected);
  const grades = data.profile.advisory.grades.sort((a, b) => a.learnerLrn.localeCompare(b.learnerLrn));
  assert.deepStrictEqual(grades.map(item => item.finalGrade), [88, 92]);
  assert.deepStrictEqual(result.batch.conflictDecisions, { '0': 'keep', '1': 'replace' });
  assert.strictEqual(data.profile.advisory.importBatches.length, 2);
}

// Apply-to-all supports both keep-existing and replace-with-imported.
{
  const keepData = setup();
  importInitial(keepData);
  const keepPlan = Transfer.planImport(keepData.profile, keepData.advisoryClass, payload('export-2', [91, 93]), 'second.json');
  Transfer.applyConflictDecisionToAll(keepPlan, 'keep');
  assert.strictEqual(keepPlan.canImport, true);
  Transfer.applyImportPlan(keepData.profile, keepPlan);
  assert.deepStrictEqual(keepData.profile.advisory.grades.map(item => item.finalGrade), [88, 90]);

  const replaceData = setup();
  importInitial(replaceData);
  const replacePlan = Transfer.planImport(replaceData.profile, replaceData.advisoryClass, payload('export-2', [91, 93]), 'second.json');
  Transfer.applyConflictDecisionToAll(replacePlan, 'replace');
  Transfer.applyImportPlan(replaceData.profile, replacePlan);
  assert.deepStrictEqual(replaceData.profile.advisory.grades.map(item => item.finalGrade), [91, 93]);
}

// Unmatched records can be explicitly mapped; they are never auto-assigned.
{
  const data = setup();
  const incoming = payload();
  incoming.learners[0].lrn = '999999999999';
  incoming.learners[0].lastName = 'Unknown';
  incoming.learners[0].firstName = 'Learner';
  const plan = Transfer.planImport(data.profile, data.advisoryClass, incoming, 'unmatched.json');
  assert.strictEqual(plan.rows[0].status, 'unmatched');
  assert.strictEqual(plan.rows[0].accepted, false);
  Transfer.assignUnmatchedLearner(data.profile, plan, 0, 'learner-1');
  assert.strictEqual(plan.rows[0].status, 'matched-manual');
  assert.strictEqual(plan.rows[0].accepted, true);
  const secondUnmatched = { ...plan.rows[1], index: 99, status: 'unmatched', matchedLearner: null, accepted: false };
  plan.rows.push(secondUnmatched);
  assert.throws(() => Transfer.assignUnmatchedLearner(data.profile, plan, 99, 'learner-1'), /already matched/);
}

// Any write failure rolls back subjects, mappings, batches, and grades together.
{
  const data = setup();
  const plan = Transfer.planImport(data.profile, data.advisoryClass, payload(), 'rollback.json');
  const snapshot = JSON.stringify(data.profile.advisory);
  const originalCreateGrade = AdvisoryData.createGrade;
  let calls = 0;
  AdvisoryData.createGrade = (...args) => {
    calls++;
    if (calls === 2) throw new Error('simulated write failure');
    return originalCreateGrade(...args);
  };
  assert.throws(() => Transfer.applyImportPlan(data.profile, plan), /simulated write failure/);
  AdvisoryData.createGrade = originalCreateGrade;
  assert.strictEqual(JSON.stringify(data.profile.advisory), snapshot, 'failed import must roll back completely');
}

// Safe undo restores replaced values, retains the audit batch, and marks it undone.
{
  const data = setup();
  importInitial(data);
  const corrected = Transfer.planImport(data.profile, data.advisoryClass, payload('export-2', [95, 96]), 'replace.json');
  Transfer.applyConflictDecisionToAll(corrected, 'replace');
  const imported = Transfer.applyImportPlan(data.profile, corrected);
  assert.deepStrictEqual(data.profile.advisory.grades.map(item => item.finalGrade), [95, 96]);
  Transfer.undoImportBatch(data.profile, imported.batch.id);
  assert.deepStrictEqual(data.profile.advisory.grades.map(item => item.finalGrade), [88, 90]);
  assert.strictEqual(data.profile.advisory.importBatches.find(item => item.id === imported.batch.id).status, 'undone');
}

// Undo refuses to overwrite a grade changed after the import.
{
  const data = setup();
  const imported = importInitial(data);
  const grade = data.profile.advisory.grades[0];
  AdvisoryData.updateGrade(data.profile, grade.id, { finalGrade: 99, sourceType: 'manual' });
  const snapshot = JSON.stringify(data.profile.advisory);
  assert.throws(() => Transfer.undoImportBatch(data.profile, imported.batch.id), /changed later/);
  assert.strictEqual(JSON.stringify(data.profile.advisory), snapshot);
}

console.log('Grade conflict, duplicate, rollback, corrected re-import, and undo tests passed.');
