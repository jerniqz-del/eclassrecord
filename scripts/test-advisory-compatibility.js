const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
const AdvisoryBackup = require('../src/renderer/js/advisory-backup.js');

function createClassFixture() {
  const profile = {
    version: 3,
    schoolYear: '2026-2027',
    assignments: [{ id: 'ordinary-class', learners: [{ id: 'ordinary-learner' }], assessments: [], scores: { kept: 99 } }]
  };
  AdvisoryData.normalizeAdvisoryData(profile);
  const classA = AdvisoryData.createClass(profile, {
    id: 'class-a', schoolYear: '2026-2027', gradeLevel: '4', section: 'Molave', adviserName: 'Teacher A', isActive: true
  });
  const classB = AdvisoryData.createClass(profile, {
    id: 'class-b', schoolYear: '2027-2028', gradeLevel: '5', section: 'Narra', adviserName: 'Teacher B', isActive: true
  });
  const learnerA = AdvisoryData.createLearner(profile, {
    id: 'learner-a', advisoryClassId: classA.id, lrn: '123456789001', lastName: 'Cruz', firstName: 'Ana'
  });
  const learnerB = AdvisoryData.createLearner(profile, {
    id: 'learner-b', advisoryClassId: classB.id, lrn: '123456789002', lastName: 'Reyes', firstName: 'Ben'
  });
  const subjectA = AdvisoryData.createSubject(profile, {
    id: 'subject-a', advisoryClassId: classA.id, subjectName: 'Mathematics', normalizedSubjectKey: 'MATHEMATICS'
  });
  const subjectB = AdvisoryData.createSubject(profile, {
    id: 'subject-b', advisoryClassId: classB.id, subjectName: 'Science', normalizedSubjectKey: 'SCIENCE'
  });
  const batchA = AdvisoryData.createImportBatch(profile, {
    id: 'batch-a', advisoryClassId: classA.id, exportId: 'export-a', schoolYear: classA.schoolYear, subject: subjectA.subjectName, term: '1', status: 'complete'
  });
  const gradeA = AdvisoryData.createGrade(profile, {
    id: 'grade-a', advisoryClassId: classA.id, advisoryLearnerId: learnerA.id, advisorySubjectId: subjectA.id,
    schoolYear: classA.schoolYear, learnerLrn: learnerA.lrn, subjectName: subjectA.subjectName,
    normalizedSubjectKey: subjectA.normalizedSubjectKey, term: '1', finalGrade: 88, importBatchId: batchA.id
  });
  const mappingA = AdvisoryData.createSourceMapping(profile, {
    id: 'mapping-a', advisoryClassId: classA.id, importedSubjectName: 'Math', importedNormalizedKey: 'MATH',
    advisorySubjectId: subjectA.id, schoolYear: classA.schoolYear
  });
  return { profile, classA, classB, learnerA, learnerB, subjectA, subjectB, batchA, gradeA, mappingA };
}

// Missing stores migrate without touching ordinary teaching-load data.
{
  const profile = { version: 2, assignments: [{ id: 'legacy', customFutureField: { preserved: true } }] };
  const assignmentsBefore = JSON.stringify(profile.assignments);
  const store = AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(store.schemaVersion, AdvisoryData.ADVISORY_SCHEMA_VERSION);
  assert.strictEqual(JSON.stringify(profile.assignments), assignmentsBefore);
  Object.keys(AdvisoryData.createAdvisoryStore()).filter(key => key !== 'schemaVersion')
    .forEach(collection => assert(Array.isArray(store[collection]), `${collection} must be initialized`));
  const once = JSON.stringify(profile);
  AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(JSON.stringify(profile), once, 'repeated migration must be byte-stable');
}

// Newer schema versions and unknown future fields survive normalization and restore.
{
  const profile = {
    assignments: [],
    advisory: {
      schemaVersion: 9,
      futureSettings: { calculationMode: 'future-safe' },
      futureCollection: [{ id: 'future-1', payload: { nested: true } }],
      classes: [{ id: 'future-class', schoolYear: '2030-2031', gradeLevel: '6', section: 'Future', adviserName: 'Future Teacher', futureClassField: 'keep', isActive: true }],
      learners: [], subjects: [], grades: [], importBatches: [], sourceMappings: []
    }
  };
  const normalized = AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(normalized.schemaVersion, 9, 'an older app must never downgrade a newer Advisory schema');
  assert.deepStrictEqual(normalized.futureSettings, { calculationMode: 'future-safe' });
  assert.deepStrictEqual(normalized.futureCollection, [{ id: 'future-1', payload: { nested: true } }]);
  assert.strictEqual(normalized.classes[0].futureClassField, 'keep');
  const report = AdvisoryData.checkAdvisoryIntegrity(profile);
  assert(report.warnings.some(item => item.code === 'newer-schema-version'));
  const restored = AdvisoryBackup.prepareRestoredDatabase(profile);
  assert.strictEqual(restored.advisory.schemaVersion, 9);
  assert.deepStrictEqual(restored.advisory.futureCollection, normalized.futureCollection);
}

// Malformed collection shapes are rejected without silently replacing data with empty arrays.
{
  const collections = ['classes', 'learners', 'subjects', 'grades', 'importBatches', 'sourceMappings'];
  collections.forEach(collection => {
    const profile = { assignments: [], advisory: AdvisoryData.createAdvisoryStore() };
    profile.advisory[collection] = { malformed: true };
    const before = JSON.stringify(profile);
    assert.throws(() => AdvisoryData.normalizeAdvisoryData(profile), new RegExp(`${collection} collection must be an array`));
    assert.strictEqual(JSON.stringify(profile), before, `${collection} corruption must not be mutated`);
    assert.throws(() => AdvisoryBackup.prepareRestoredDatabase(profile), /must be an array/);
  });
  const invalidStore = { assignments: [], advisory: null };
  const before = JSON.stringify(invalidStore);
  assert.throws(() => AdvisoryData.normalizeAdvisoryData(invalidStore), /must be an object/);
  assert.strictEqual(JSON.stringify(invalidStore), before);
}

// Public write APIs enforce parent ownership, immutable identities, uniqueness, and required data.
{
  const data = createClassFixture();
  assert.throws(() => AdvisoryData.createClass(data.profile, {
    schoolYear: '2028-2029', gradeLevel: '6', section: 'Acacia', adviserName: 'Teacher', isActive: true, isArchived: true
  }), /cannot also be active/);
  assert.throws(() => AdvisoryData.updateClass(data.profile, data.classA.id, { section: '' }), /required/);
  assert.throws(() => AdvisoryData.createLearner(data.profile, {
    advisoryClassId: data.classA.id, lrn: '123', lastName: 'Bad', firstName: 'LRN'
  }), /12 digits/);
  assert.throws(() => AdvisoryData.createLearner(data.profile, {
    advisoryClassId: data.classA.id, lrn: data.learnerA.lrn, lastName: 'Duplicate', firstName: 'LRN'
  }), /already belongs/);
  assert.throws(() => AdvisoryData.createSubject(data.profile, {
    advisoryClassId: data.classA.id, subjectName: 'Mathematics', normalizedSubjectKey: 'mathematics'
  }), /already exists/);
  assert.throws(() => AdvisoryData.createGrade(data.profile, {
    advisoryClassId: data.classA.id, advisoryLearnerId: data.learnerB.id, advisorySubjectId: data.subjectA.id, term: '2', finalGrade: 90
  }), /learner must belong/);
  assert.throws(() => AdvisoryData.createGrade(data.profile, {
    advisoryClassId: data.classA.id, advisoryLearnerId: data.learnerA.id, advisorySubjectId: data.subjectB.id, term: '2', finalGrade: 90
  }), /subject must belong/);
  assert.throws(() => AdvisoryData.createSourceMapping(data.profile, {
    advisoryClassId: data.classA.id, advisorySubjectId: data.subjectB.id, importedSubjectName: 'Science', importedNormalizedKey: 'SCIENCE'
  }), /mapping subject must belong/);
  assert.throws(() => AdvisoryData.updateLearner(data.profile, data.learnerA.id, { advisoryClassId: data.classB.id }), /cannot be moved/);
  assert.throws(() => AdvisoryData.updateGrade(data.profile, data.gradeA.id, { term: '2' }), /identity cannot be changed/);
  assert.throws(() => AdvisoryData.updateGrade(data.profile, data.gradeA.id, { finalGrade: 'not-a-number' }), /finite final grade/);
  assert.strictEqual(AdvisoryData.checkAdvisoryIntegrity(data.profile).isValid, true);
}

// Integrity auditing detects structural, ownership, identity, and duplicate corruption.
{
  const data = createClassFixture();
  data.profile.advisory.classes[0].section = '';
  data.profile.advisory.classes[0].isArchived = true;
  data.profile.advisory.learners[0].lrn = 'invalid';
  data.profile.advisory.subjects.push({ ...data.profile.advisory.subjects[0], id: 'subject-duplicate' });
  data.profile.advisory.grades[0].advisoryClassId = data.classB.id;
  data.profile.advisory.grades[0].term = '';
  data.profile.advisory.grades[0].finalGrade = Number.NaN;
  data.profile.advisory.sourceMappings[0].advisoryClassId = data.classB.id;
  const report = AdvisoryData.checkAdvisoryIntegrity(data.profile);
  const codes = new Set(report.errors.map(item => item.code));
  ['incomplete-class-identity', 'active-archived-class', 'invalid-lrn', 'duplicate-subject',
    'cross-class-learner-reference', 'cross-class-subject-reference', 'cross-class-import-batch-reference',
    'missing-grade-term', 'invalid-final-grade'].forEach(code => assert(codes.has(code), `missing integrity code: ${code}`));
}

// Every persisted relationship is audited, and invalid backups are rejected before replacement.
{
  const cases = [
    ['learners', item => { item.advisoryClassId = 'missing-class'; }, 'orphan-class-reference'],
    ['subjects', item => { item.advisoryClassId = 'missing-class'; }, 'orphan-class-reference'],
    ['grades', item => { item.advisoryClassId = 'missing-class'; }, 'orphan-class-reference'],
    ['grades', item => { item.advisoryLearnerId = 'missing-learner'; }, 'orphan-learner-reference'],
    ['grades', item => { item.advisorySubjectId = 'missing-subject'; }, 'orphan-subject-reference'],
    ['importBatches', item => { item.advisoryClassId = 'missing-class'; }, 'orphan-class-reference'],
    ['sourceMappings', item => { item.advisoryClassId = 'missing-class'; }, 'orphan-class-reference'],
    ['sourceMappings', item => { item.advisorySubjectId = 'missing-subject'; }, 'orphan-subject-reference']
  ];
  cases.forEach(([collection, mutate, expectedCode]) => {
    const data = createClassFixture();
    mutate(data.profile.advisory[collection][0]);
    const report = AdvisoryData.checkAdvisoryIntegrity(data.profile);
    assert(report.errors.some(item => item.code === expectedCode), `${collection} did not report ${expectedCode}`);
    assert.throws(() => AdvisoryBackup.prepareRestoredDatabase(data.profile), /No data was restored/);
  });

  const missingBatch = createClassFixture();
  missingBatch.profile.advisory.grades[0].importBatchId = 'missing-batch';
  const batchReport = AdvisoryData.checkAdvisoryIntegrity(missingBatch.profile);
  assert.strictEqual(batchReport.isValid, true, 'missing audit history is recoverable and should remain a warning');
  assert(batchReport.warnings.some(item => item.code === 'missing-import-batch'));

  ['classes', 'learners', 'subjects', 'grades', 'importBatches', 'sourceMappings'].forEach(collection => {
    const data = createClassFixture();
    data.profile.advisory[collection].push({ ...data.profile.advisory[collection][0] });
    const report = AdvisoryData.checkAdvisoryIntegrity(data.profile);
    assert(report.errors.some(item => item.code === 'duplicate-id' && item.collection === collection), `${collection} duplicate ID was not detected`);
  });
}

// Cascades remove only dependent Advisory records and never touch teaching loads or another Advisory Class.
{
  const learnerDelete = createClassFixture();
  const ordinaryBefore = JSON.stringify(learnerDelete.profile.assignments);
  assert.strictEqual(AdvisoryData.deleteLearner(learnerDelete.profile, learnerDelete.learnerA.id), true);
  assert(!learnerDelete.profile.advisory.grades.some(item => item.advisoryLearnerId === learnerDelete.learnerA.id));
  assert(learnerDelete.profile.advisory.classes.some(item => item.id === learnerDelete.classB.id));
  assert.strictEqual(JSON.stringify(learnerDelete.profile.assignments), ordinaryBefore);

  const batchDelete = createClassFixture();
  assert.strictEqual(AdvisoryData.deleteImportBatch(batchDelete.profile, batchDelete.batchA.id), true);
  assert.strictEqual(batchDelete.profile.advisory.grades[0].importBatchId, '');

  const subjectDelete = createClassFixture();
  assert.strictEqual(AdvisoryData.deleteSubject(subjectDelete.profile, subjectDelete.subjectA.id), true);
  assert(!subjectDelete.profile.advisory.grades.some(item => item.advisorySubjectId === subjectDelete.subjectA.id));
  assert(!subjectDelete.profile.advisory.sourceMappings.some(item => item.advisorySubjectId === subjectDelete.subjectA.id));

  const classDelete = createClassFixture();
  assert.strictEqual(AdvisoryData.deleteClass(classDelete.profile, classDelete.classA.id), true);
  ['learners', 'subjects', 'grades', 'importBatches', 'sourceMappings'].forEach(collection => {
    assert(!classDelete.profile.advisory[collection].some(item => item.advisoryClassId === classDelete.classA.id));
  });
  assert(classDelete.profile.advisory.classes.some(item => item.id === classDelete.classB.id));
}

// Separate teacher profiles remain isolated through mutation, serialization, and restore.
{
  const first = createClassFixture().profile;
  const second = createClassFixture().profile;
  second.advisory.classes[0].id = 'second-profile-class';
  const secondBefore = JSON.stringify(second);
  AdvisoryData.updateClass(first, 'class-a', { section: 'Updated only in first' });
  assert.strictEqual(JSON.stringify(second), secondBefore);
  const root = { version: 3, activeProfileId: 'p1', profiles: [{ id: 'p1', data: first }, { id: 'p2', data: second }] };
  const roundTrip = JSON.parse(JSON.stringify(root));
  assert.strictEqual(roundTrip.profiles[0].data.advisory.classes[0].section, 'Updated only in first');
  assert.strictEqual(roundTrip.profiles[1].data.advisory.classes[0].section, 'Molave');
}

// A realistic large roster/grade matrix normalizes, validates, and round-trips without data loss.
{
  const learnerCount = 300;
  const subjectCount = 10;
  const profile = { assignments: [], advisory: AdvisoryData.createAdvisoryStore() };
  profile.advisory.classes.push({ id: 'scale-class', schoolYear: '2026-2027', gradeLevel: '4', section: 'Scale', adviserName: 'Load Teacher', isActive: true });
  for (let learnerIndex = 0; learnerIndex < learnerCount; learnerIndex += 1) {
    profile.advisory.learners.push({
      id: `scale-learner-${learnerIndex}`, advisoryClassId: 'scale-class', lrn: String(100000000000 + learnerIndex),
      lastName: `Last${learnerIndex}`, firstName: `First${learnerIndex}`
    });
  }
  for (let subjectIndex = 0; subjectIndex < subjectCount; subjectIndex += 1) {
    profile.advisory.subjects.push({
      id: `scale-subject-${subjectIndex}`, advisoryClassId: 'scale-class', subjectName: `Subject ${subjectIndex}`,
      normalizedSubjectKey: `SUBJECT_${subjectIndex}`, displayOrder: subjectIndex
    });
  }
  for (let learnerIndex = 0; learnerIndex < learnerCount; learnerIndex += 1) {
    for (let subjectIndex = 0; subjectIndex < subjectCount; subjectIndex += 1) {
      for (let term = 1; term <= 3; term += 1) {
        profile.advisory.grades.push({
          id: `scale-grade-${learnerIndex}-${subjectIndex}-${term}`, advisoryClassId: 'scale-class',
          advisoryLearnerId: `scale-learner-${learnerIndex}`, advisorySubjectId: `scale-subject-${subjectIndex}`,
          schoolYear: '2026-2027', term: String(term), finalGrade: 75 + ((learnerIndex + subjectIndex + term) % 25)
        });
      }
    }
  }
  AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(profile.advisory.learners.length, learnerCount);
  assert.strictEqual(profile.advisory.subjects.length, subjectCount);
  assert.strictEqual(profile.advisory.grades.length, learnerCount * subjectCount * 3);
  assert.strictEqual(AdvisoryData.checkAdvisoryIntegrity(profile).isValid, true);
  const restored = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(JSON.stringify(profile)));
  assert.deepStrictEqual(restored.advisory, profile.advisory);
}

// Dependency load order and persistence entry points keep Advisory data inside the active profile lifecycle.
{
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const database = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
  const importExport = fs.readFileSync(path.join(root, 'src/renderer/js/import-export.js'), 'utf8');
  const gradeTransfer = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-grade-transfer.js'), 'utf8');
  assert(html.indexOf('js/advisory-data.js') < html.indexOf('js/database.js'));
  assert(html.indexOf('js/advisory-backup.js') < html.indexOf('js/import-export.js'));
  assert(database.includes('normalizeAdvisoryData(db);'));
  assert(importExport.includes('db = prepareRestoredDatabase('));
  assert(!gradeTransfer.includes('latestUndoableBatch(globalScope.db'), 'Advisory operations must use the active profile accessor');
}

console.log('Advisory compatibility, forward-field preservation, corruption rejection, ownership, cascade, profile isolation, scale, and dependency tests passed.');
