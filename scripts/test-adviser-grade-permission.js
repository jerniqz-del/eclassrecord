const assert = require('assert');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');

function setupMockProfiles() {
  const learners = [
    { id: 'source-1', lrn: '123456789001', lastName: 'Abad', firstName: 'Ana', middleName: 'Cruz' },
    { id: 'source-2', lrn: '123456789002', lastName: 'Bautista', firstName: 'Ben' },
    { id: 'source-3', lrn: '123456789003', lastName: 'Castillo', firstName: 'Carla' },
    { id: 'source-4', lrn: '123456789004', lastName: 'Dela Rosa', firstName: 'Diego' }
  ];
  const subjectProfile = {
    teacherName: 'Mr. Subject Teacher',
    schoolName: 'Mock Senior High School',
    schoolId: '654321',
    schoolYear: '2026-2027',
    assignments: [{
      id: 'mock-general-math',
      subjectId: 'general-mathematics',
      schoolYear: '2026-2027',
      gradeLevel: '11',
      section: 'Integrity',
      subject: 'General Mathematics',
      learners
    }]
  };
  const adviserProfile = {
    teacherName: 'Ms. Advisory Teacher',
    schoolName: 'Mock Senior High School',
    schoolId: '654321',
    schoolYear: '2026-2027',
    assignments: []
  };
  AdvisoryData.normalizeAdvisoryData(adviserProfile);
  const advisoryClass = AdvisoryData.createClass(adviserProfile, {
    id: 'mock-advisory',
    schoolYear: '2026-2027',
    gradeLevel: '11',
    section: 'Integrity',
    adviserName: 'Ms. Advisory Teacher',
    isActive: true
  });
  learners.forEach(item => AdvisoryData.createLearner(adviserProfile, {
    id: `advisory-${item.id}`,
    advisoryClassId: advisoryClass.id,
    lrn: item.lrn,
    lastName: item.lastName,
    firstName: item.firstName,
    middleName: item.middleName || ''
  }));
  const [subject] = Transfer.syncSeniorHighSubjects(adviserProfile, advisoryClass, ['General Mathematics']);
  return { subjectProfile, adviserProfile, advisoryClass, subject, assignment: subjectProfile.assignments[0], learners };
}

function exportMock(data, { term, exportId, grades, allowed = false, note = '' }) {
  return Transfer.buildExportPayload({
    assignment: data.assignment,
    profileDb: data.subjectProfile,
    term,
    appVersion: '1.6.0',
    exportId,
    exportedAt: `2026-07-${String(10 + Number(term)).padStart(2, '0')}T08:00:00.000Z`,
    adviserMayModifySubmittedGrades: allowed,
    adviserModificationNote: note,
    getFinalGrade: (_assignment, learnerId) => grades[learnerId] ?? null
  });
}

function importMock(data, payload, filename, conflictDecision = '') {
  const plan = Transfer.planImport(data.adviserProfile, data.advisoryClass, payload, filename);
  if (conflictDecision) Transfer.applyConflictDecisionToAll(plan, conflictDecision);
  assert.strictEqual(plan.canImport, true, `mock import should be ready: ${plan.errors.join('; ')}`);
  return Transfer.applyImportPlan(data.adviserProfile, plan);
}

// A permitted term crosses the offline profile boundary with a literal plain-text note.
{
  const data = setupMockProfiles();
  const note = 'Please verify the encoding correction.\nDo not change other records. <b>Plain text only</b>';
  const payload = exportMock(data, {
    term: 1,
    exportId: 'mock-permitted-term-1',
    allowed: true,
    note,
    grades: { 'source-1': 88, 'source-2': 89, 'source-3': 90 }
  });
  assert.strictEqual(payload.learners.length, 3, 'a learner without a submitted grade must not receive permission');
  assert.strictEqual(payload.teacher.name, 'Mr. Subject Teacher');
  assert.strictEqual(payload.permissions.adviserMayModifySubmittedGrades, true);
  assert.strictEqual(payload.permissions.adviserModificationNote, note);
  assert.strictEqual(Transfer.validatePayload(payload).isValid, true);

  const imported = importMock(data, payload, 'mock-general-math-term1.json');
  assert.strictEqual(imported.batch.adviserEditAllowed, true);
  assert.strictEqual(imported.batch.adviserModificationNote, note, 'HTML-like note content must remain literal text data');
  const termOne = data.adviserProfile.advisory.grades.filter(item => item.term === '1');
  assert.strictEqual(termOne.length, 3);
  assert(termOne.every(item => item.adviserEditAllowed === true));
  assert(termOne.every(item => item.submittedFinalGrade === item.finalGrade));
  assert(!termOne.some(item => item.learnerLrn === '123456789004'), 'permission must not create a missing learner grade');

  const grade = termOne[0];
  const learner = data.adviserProfile.advisory.learners.find(item => item.id === grade.advisoryLearnerId);
  const original = grade.finalGrade;
  Transfer.saveAdviserGradeAdjustment(data.adviserProfile, data.advisoryClass, learner, data.subject, '1', '95');
  const adjusted = data.adviserProfile.advisory.grades.find(item => item.id === grade.id);
  assert.strictEqual(adjusted.finalGrade, 95);
  assert.strictEqual(adjusted.submittedFinalGrade, original);
  assert.strictEqual(adjusted.adviserModifiedBy, 'Ms. Advisory Teacher');
  assert(adjusted.adviserModifiedAt);
  assert.strictEqual(adjusted.sourceType, 'grade-transfer-file');
  assert.strictEqual(adjusted.sourceTeacherName, 'Mr. Subject Teacher');
  assert.strictEqual(adjusted.importBatchId, imported.batch.id);
  Transfer.saveAdviserGradeAdjustment(data.adviserProfile, data.advisoryClass, learner, data.subject, '1', '96');
  assert.strictEqual(data.adviserProfile.advisory.grades.find(item => item.id === grade.id).submittedFinalGrade, original);
  assert.throws(() => Transfer.saveAdviserGradeAdjustment(data.adviserProfile, data.advisoryClass, learner, data.subject, '1', ''), /cannot be cleared/);

  // A separate read-only term stays locked, even for the same subject and learner.
  const readOnlyPayload = exportMock(data, {
    term: 2,
    exportId: 'mock-readonly-term-2',
    grades: { 'source-1': 91, 'source-2': 92, 'source-3': 93, 'source-4': 94 }
  });
  const readOnlyImport = importMock(data, readOnlyPayload, 'mock-general-math-term2.json');
  assert.strictEqual(readOnlyImport.batch.adviserEditAllowed, false);
  const locked = data.adviserProfile.advisory.grades.find(item => item.term === '2' && item.learnerLrn === learner.lrn);
  assert.strictEqual(locked.adviserEditAllowed, false);
  assert.throws(() => Transfer.saveAdviserGradeAdjustment(data.adviserProfile, data.advisoryClass, learner, data.subject, '2', '97'), /did not allow/);

  // Backup-style JSON round-tripping retains permission, note, baseline, and modification audit fields.
  const restored = JSON.parse(JSON.stringify(data.adviserProfile));
  AdvisoryData.normalizeAdvisoryData(restored);
  const restoredBatch = restored.advisory.importBatches.find(item => item.id === imported.batch.id);
  const restoredGrade = restored.advisory.grades.find(item => item.id === grade.id);
  assert.strictEqual(restoredBatch.adviserModificationNote, note);
  assert.strictEqual(restoredBatch.adviserEditAllowed, true);
  assert.strictEqual(restoredGrade.submittedFinalGrade, original);
  assert.strictEqual(restoredGrade.finalGrade, 96);
  assert.strictEqual(restoredGrade.adviserModifiedBy, 'Ms. Advisory Teacher');
}

// Corrected re-import Keep preserves adviser audit; Replace establishes a new teacher baseline and permission.
{
  const data = setupMockProfiles();
  const initialPayload = exportMock(data, {
    term: 1,
    exportId: 'mock-correction-chain',
    allowed: true,
    note: 'Initial permission note',
    grades: { 'source-1': 85, 'source-2': 86, 'source-3': 87, 'source-4': 88 }
  });
  importMock(data, initialPayload, 'initial.json');
  const grade = data.adviserProfile.advisory.grades.find(item => item.learnerLrn === '123456789001');
  const learner = data.adviserProfile.advisory.learners.find(item => item.id === grade.advisoryLearnerId);
  Transfer.saveAdviserGradeAdjustment(data.adviserProfile, data.advisoryClass, learner, data.subject, '1', '94');

  const keepPayload = exportMock(data, {
    term: 1,
    exportId: 'mock-correction-chain',
    grades: { 'source-1': 90, 'source-2': 91, 'source-3': 92, 'source-4': 93 }
  });
  importMock(data, keepPayload, 'corrected-keep.json', 'keep');
  let current = data.adviserProfile.advisory.grades.find(item => item.id === grade.id);
  assert.strictEqual(current.finalGrade, 94);
  assert.strictEqual(current.submittedFinalGrade, 85);
  assert.strictEqual(current.adviserEditAllowed, true);
  assert(current.adviserModifiedAt);

  const replacePayload = exportMock(data, {
    term: 1,
    exportId: 'mock-correction-chain',
    grades: { 'source-1': 91, 'source-2': 92, 'source-3': 93, 'source-4': 94 }
  });
  importMock(data, replacePayload, 'corrected-replace.json', 'replace');
  current = data.adviserProfile.advisory.grades.find(item => item.id === grade.id);
  assert.strictEqual(current.finalGrade, 91);
  assert.strictEqual(current.submittedFinalGrade, 91);
  assert.strictEqual(current.adviserEditAllowed, false);
  assert.strictEqual(current.adviserModifiedAt, '');
  assert.strictEqual(current.adviserModifiedBy, '');
}

// Legacy and malformed permission metadata fail safely.
{
  const data = setupMockProfiles();
  const legacy = exportMock(data, { term: 3, exportId: 'mock-legacy', grades: { 'source-1': 90 } });
  delete legacy.permissions;
  assert.strictEqual(Transfer.validatePayload(legacy).isValid, true);
  importMock(data, legacy, 'legacy.json');
  const grade = data.adviserProfile.advisory.grades[0];
  const learner = data.adviserProfile.advisory.learners.find(item => item.id === grade.advisoryLearnerId);
  assert.strictEqual(grade.adviserEditAllowed, false);
  assert.throws(() => Transfer.saveAdviserGradeAdjustment(data.adviserProfile, data.advisoryClass, learner, data.subject, '3', '92'), /did not allow/);

  const malformed = exportMock(data, { term: 2, exportId: 'mock-malformed', allowed: true, note: 'Valid note', grades: { 'source-1': 90 } });
  malformed.permissions.adviserModificationNote = 'x'.repeat(501);
  assert(Transfer.validatePayload(malformed).errors.some(message => /500 characters or fewer/.test(message)));
  malformed.permissions = { adviserMayModifySubmittedGrades: false, adviserModificationNote: 'Hidden note' };
  assert(Transfer.validatePayload(malformed).errors.some(message => /only when grade-modification permission/.test(message)));
}

console.log('Mock subject-teacher/adviser permission, notes, editing, correction, legacy, and backup scenarios passed.');
