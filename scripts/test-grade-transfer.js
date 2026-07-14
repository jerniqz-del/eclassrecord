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
  Transfer.ensureGradeLevelSubjects(profile, advisoryClass);
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
  Transfer.ensureGradeLevelSubjects(data.profile, data.advisoryClass);
  const payload = validPayload(data);
  payload.schoolYear = '2025-2026';
  payload.class.gradeLevel = '5';
  payload.class.section = 'Narra';
  const plan = Transfer.planImport(data.profile, data.advisoryClass, payload, 'wrong.json');
  assert.strictEqual(plan.canImport, false);
  assert.strictEqual(plan.errors.length, 3);
}

// Standard Advisory subjects are created from the grade level and the operation is idempotent.
{
  const data = fixture();
  data.profile.advisory.subjects = [];
  const created = Transfer.ensureGradeLevelSubjects(data.profile, data.advisoryClass);
  assert.deepStrictEqual(Transfer.standardSubjectsForGrade('4'), [
    'Filipino', 'English', 'Mathematics', 'Science', 'Araling Panlipunan',
    'Good Manners and Right Conduct (GMRC)', 'Edukasyong Pantahanan at Pangkabuhayan (EPP)', 'Music & Arts', 'PE & Health'
  ]);
  assert.strictEqual(created.length, 9);
  assert(created.every(subject => subject.sourceType === 'grade-transfer-file'));
  assert(created.every(subject => subject.expectedSchoolYear === data.advisoryClass.schoolYear));
  assert.strictEqual(Transfer.ensureGradeLevelSubjects(data.profile, data.advisoryClass).length, 0, 'automatic subject setup must not create duplicates');
  const plan = Transfer.planImport(data.profile, data.advisoryClass, validPayload(data), 'math-t1.json');
  assert.strictEqual(plan.subject?.subjectName, 'Mathematics', 'file metadata should identify the preconfigured subject automatically');
  assert.strictEqual(plan.payload.term.number, 1, 'file metadata should identify the term automatically');
  [['1', 6], ['2', 7], ['3', 8], ['4', 9], ['5', 9], ['6', 9], ['7', 9], ['10', 9]].forEach(([grade, count]) => {
    assert.strictEqual(Transfer.standardSubjectsForGrade(grade).length, count, `Grade ${grade} should have its standard subject list`);
  });
  assert.deepStrictEqual(Transfer.standardSubjectsForGrade('11'), []);
}

// MAPEH exports identify and calculate Music & Arts and PE & Health separately.
{
  const data = fixture();
  data.assignment.subject = 'MAPEH';
  const seenParts = [];
  const payload = Transfer.buildExportPayload({
    assignment: data.assignment,
    profileDb: data.profile,
    term: 2,
    appVersion: '1.5.0',
    subjectName: 'Music & Arts',
    mapePart: 'music_arts',
    getFinalGrade: (_assignment, _learnerId, _term, part) => { seenParts.push(part); return 89; }
  });
  assert.strictEqual(payload.subject.name, 'Music & Arts');
  assert.strictEqual(payload.subject.normalizedKey, 'MUSIC ARTS');
  assert.strictEqual(payload.subject.strand, 'music_arts');
  assert(seenParts.every(part => part === 'music_arts'));
  assert(Transfer.gradeTransferFilename(payload).includes('Music-&-Arts'));
}

// Long subject names have compact display labels, while sorting uses computed finals and keeps missing grades last.
{
  assert.strictEqual(Transfer.subjectDisplayName('Edukasyong Pantahanan at Pangkabuhayan (EPP)'), 'EPP');
  assert.strictEqual(Transfer.subjectDisplayName('Technology and Livelihood Education (TLE)'), 'TLE');
  assert.strictEqual(Transfer.subjectDisplayName('Araling Panlipunan'), 'Aral. Pan.');
  assert.strictEqual(Transfer.subjectDisplayName('Good Manners and Right Conduct (GMRC)'), 'GMRC');
  assert.strictEqual(Transfer.subjectDisplayName('Values Education'), 'Val. Ed.');
  assert.strictEqual(Transfer.subjectCompactName('Filipino'), 'FIL');
  assert.strictEqual(Transfer.subjectCompactName('English'), 'ENG');
  assert.strictEqual(Transfer.subjectCompactName('Mathematics'), 'MATH');
  assert.strictEqual(Transfer.subjectCompactName('Science'), 'SCI');
  assert.strictEqual(Transfer.subjectCompactName('Araling Panlipunan'), 'AP');
  assert.strictEqual(Transfer.subjectCompactName('Music & Arts'), 'M&A');
  assert.strictEqual(Transfer.subjectCompactName('PE & Health'), 'PE&H');
  assert.strictEqual(Transfer.subjectCompactName('Language'), 'LANG');
  assert.strictEqual(Transfer.subjectCompactName('Reading and Literacy'), 'R&L');
  assert.strictEqual(Transfer.subjectCompactName('Makabansa'), 'MKB');
  const learners = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const grades = [
    ...['1', '2', '3'].map(term => ({ advisoryLearnerId: 'a', advisorySubjectId: 'subject', term, finalGrade: 80 })),
    ...['1', '2', '3'].map(term => ({ advisoryLearnerId: 'b', advisorySubjectId: 'subject', term, finalGrade: 90 }))
  ];
  assert.deepStrictEqual(Transfer.sortLearnersBySubject(learners, grades, 'subject', 'desc').map(item => item.id), ['b', 'a', 'c']);
  assert.deepStrictEqual(Transfer.sortLearnersBySubject(learners, grades, 'subject', 'asc').map(item => item.id), ['a', 'b', 'c']);
}

// Music & Arts and PE & Health produce one MAPEH result for every term and count once in the General Average.
{
  const subjects = [
    { id: 'math', subjectName: 'Mathematics' },
    { id: 'science', subjectName: 'Science' },
    { id: 'music-arts', subjectName: 'Music & Arts' },
    { id: 'pe-health', subjectName: 'PE & Health' }
  ];
  const values = {
    math: [89, 90, 91],
    science: [92, 93, 94],
    'music-arts': [80, 82, 84],
    'pe-health': [90, 92, 94]
  };
  const grades = Object.entries(values).flatMap(([subjectId, termGrades]) => termGrades.map((finalGrade, index) => ({
    advisoryLearnerId: 'learner', advisorySubjectId: subjectId, term: String(index + 1), finalGrade
  })));
  assert.strictEqual(Transfer.calculateMapehTermAverage(grades, 'learner', subjects, '1'), 85);
  assert.strictEqual(Transfer.calculateMapehTermAverage(grades, 'learner', subjects, '2'), 87);
  assert.strictEqual(Transfer.calculateMapehTermAverage(grades, 'learner', subjects, '3'), 89);
  assert.strictEqual(Transfer.calculateMapehFinal(grades, 'learner', subjects), 87);
  assert.strictEqual(Transfer.calculateGeneralAverage(grades, 'learner', subjects), 90, 'MAPEH must count once instead of counting its two components separately');
  assert.strictEqual(Transfer.calculateMapehFinal(grades.slice(0, -1), 'learner', subjects), null, 'incomplete components must not produce a MAPEH final');
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
  assert.strictEqual(store.subjects.length, 9);
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
// Special Class subjects are limited, archive safely, control General Average
// inclusion, and require an active matching subject for marked transfer files.
{
  const data = fixture();
  AdvisoryData.updateClass(data.profile, data.advisoryClass.id, { isSpecialClass: true, specialProgramName: 'Journalism' });
  data.advisoryClass = data.profile.advisory.classes.find(item => item.id === data.advisoryClass.id);
  const synced = Transfer.syncSpecialProgramSubjects(data.profile, data.advisoryClass, [
    { subjectName: 'Campus Journalism', includeInGeneralAverage: false },
    { subjectName: 'Broadcasting', includeInGeneralAverage: true }
  ]);
  assert.strictEqual(synced.filter(item => !item.isArchived).length, 2);
  assert(synced.every(item => item.isSpecialProgramSubject));
  assert.throws(() => Transfer.syncSpecialProgramSubjects(data.profile, data.advisoryClass, [{ subjectName: 'Science' }]), /predefined subject/);

  const journalism = data.profile.advisory.subjects.find(item => item.normalizedSubjectKey === 'CAMPUS JOURNALISM');
  const specialAssignment = { ...data.assignment, subject: 'Campus Journalism', isSpecialProgramSubject: true, specialProgramWeights: [10, 70, 20] };
  const payload = Transfer.buildExportPayload({ assignment: specialAssignment, profileDb: data.profile, term: 1, appVersion: '1.5.0', getFinalGrade: () => 88 });
  assert.strictEqual(payload.subject.isSpecialProgramSubject, true);
  assert.deepStrictEqual(payload.subject.specialProgramWeights, [10, 70, 20]);
  assert.strictEqual(Transfer.validatePayload(payload).isValid, true);
  const matchingPlan = Transfer.planImport(data.profile, data.advisoryClass, payload, 'journalism.json');
  assert.strictEqual(matchingPlan.canImport, true);
  const importResult = Transfer.applyImportPlan(data.profile, matchingPlan);
  assert.strictEqual(importResult.batch.isSpecialProgramSubject, true);
  assert.deepStrictEqual(importResult.batch.specialProgramWeights, [10, 70, 20]);
  assert.strictEqual(data.profile.advisory.subjects.find(item => item.id === journalism.id).includeInGeneralAverage, false, 'teacher files must not overwrite the adviser GA choice');

  const mismatched = JSON.parse(JSON.stringify(payload));
  mismatched.exportId = 'different-export';
  mismatched.subject.name = 'Photojournalism';
  mismatched.subject.normalizedKey = 'PHOTOJOURNALISM';
  const mismatchPlan = Transfer.planImport(data.profile, data.advisoryClass, mismatched, 'photojournalism.json');
  assert(mismatchPlan.errors.some(message => /not an active subject|must match an active special subject/.test(message)));

  const legacy = JSON.parse(JSON.stringify(payload));
  legacy.exportId = 'legacy-export';
  delete legacy.subject.isSpecialProgramSubject;
  delete legacy.subject.specialProgramWeights;
  const legacyPlan = Transfer.planImport(data.profile, data.advisoryClass, legacy, 'legacy-journalism.json');
  assert(legacyPlan.warnings.some(message => /older Grade Transfer File/.test(message)));

  const mathematics = data.profile.advisory.subjects.find(item => item.normalizedSubjectKey === 'MATHEMATICS');
  const learnerId = data.learners[0].id;
  ['1', '2', '3'].forEach(term => {
    AdvisoryData.createGrade(data.profile, { advisoryClassId: data.advisoryClass.id, advisoryLearnerId: learnerId, advisorySubjectId: mathematics.id, term, finalGrade: 90 });
    if (term !== '1') AdvisoryData.createGrade(data.profile, { advisoryClassId: data.advisoryClass.id, advisoryLearnerId: learnerId, advisorySubjectId: journalism.id, term, finalGrade: 70 });
  });
  assert.strictEqual(Transfer.calculateGeneralAverage(data.profile.advisory.grades, learnerId, [mathematics, journalism]), 90);
  AdvisoryData.updateSubject(data.profile, journalism.id, { includeInGeneralAverage: true });
  assert.strictEqual(Transfer.calculateGeneralAverage(data.profile.advisory.grades, learnerId, [mathematics, data.profile.advisory.subjects.find(item => item.id === journalism.id)]), 83);

  Transfer.syncSpecialProgramSubjects(data.profile, data.advisoryClass, [{ subjectName: 'Broadcasting' }]);
  assert.strictEqual(data.profile.advisory.subjects.find(item => item.id === journalism.id).isArchived, true);
  assert(data.profile.advisory.grades.some(item => item.advisorySubjectId === journalism.id), 'archiving must preserve grades');
}

// UI wiring uses local file bridges and has no network dependency.
{
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/advisory-grade-transfer.js'), 'utf8');
  assert(source.includes('electronAPI.exportGradeTransfer'));
  assert(source.includes('electronAPI.importGradeTransfer'));
  assert(source.includes('Automatically identified from the file'));
  assert(!source.includes('<label class="field-label">Expected Source Class</label>'));
  assert(!/\bfetch\s*\(/.test(source));
  const dashboard = fs.readFileSync(path.join(__dirname, '../src/renderer/js/dashboard.js'), 'utf8');
  assert(dashboard.includes('showGradeTransferExportModal'));
  const main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  assert(main.includes("title: 'Save Grade Transfer File'"));
  assert(main.includes("title: 'Select Grade Transfer File'"));
}

console.log('Offline Grade Transfer File export, validation, preview, and import tests passed.');
