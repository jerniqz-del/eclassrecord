const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AdvisoryData = require('../src/renderer/js/advisory-data.js');

function legacyProfile() {
  return {
    version: 2,
    teacherName: 'Teacher One',
    schoolYear: '2026-2027',
    assignments: [{
      id: 'class-existing',
      subject: 'Mathematics',
      learners: [{ id: 'learner-existing', lrn: '123456789012' }],
      assessments: [{ id: 'assessment-existing' }],
      scores: { 'learner-existing|assessment-existing': 18 }
    }]
  };
}

function createPopulatedProfile() {
  const profile = legacyProfile();
  AdvisoryData.normalizeAdvisoryData(profile);
  const advisoryClass = AdvisoryData.createClass(profile, {
    id: 'advisory-1',
    schoolYear: '2026-2027',
    gradeLevel: '4',
    section: 'Molave',
    adviserName: 'Teacher One',
    isActive: true
  });
  const learner = AdvisoryData.createLearner(profile, {
    id: 'advisory-learner-1',
    advisoryClassId: advisoryClass.id,
    lrn: '123456789012',
    lastName: 'Dela Cruz',
    firstName: 'Juan'
  });
  const subject = AdvisoryData.createSubject(profile, {
    id: 'advisory-subject-1',
    advisoryClassId: advisoryClass.id,
    subjectName: 'Mathematics',
    normalizedSubjectKey: 'mathematics'
  });
  const batch = AdvisoryData.createImportBatch(profile, {
    id: 'grade-import-1',
    advisoryClassId: advisoryClass.id,
    exportId: 'export-1',
    status: 'complete'
  });
  const grade = AdvisoryData.createGrade(profile, {
    id: 'advisory-grade-1',
    advisoryClassId: advisoryClass.id,
    advisoryLearnerId: learner.id,
    advisorySubjectId: subject.id,
    schoolYear: '2026-2027',
    learnerLrn: learner.lrn,
    subjectName: subject.subjectName,
    normalizedSubjectKey: subject.normalizedSubjectKey,
    term: '1',
    finalGrade: 88,
    importBatchId: batch.id
  });
  const mapping = AdvisoryData.createSourceMapping(profile, {
    id: 'source-map-1',
    advisoryClassId: advisoryClass.id,
    importedSubjectName: 'Math',
    importedNormalizedKey: 'math',
    advisorySubjectId: subject.id
  });
  return { profile, advisoryClass, learner, subject, batch, grade, mapping };
}

// Teaching-load roster imports include active learners from non-archived Advisory Classes.
{
  const profile = createPopulatedProfile().profile;
  profile.assignments.push({ id: 'class-target', gradeLevel: '4', section: 'Narra', subject: 'Science', learners: [] });
  AdvisoryData.createLearner(profile, {
    id: 'advisory-learner-inactive', advisoryClassId: 'advisory-1', lrn: '123456789099',
    lastName: 'Inactive', firstName: 'Learner', enrollmentStatus: 'inactive'
  });
  const sources = AdvisoryData.rosterImportSources(profile, 'class-target');
  const advisorySource = sources.find(item => item.id === 'advisory:advisory-1');
  assert(sources.some(item => item.id === 'class-existing'), 'other teaching loads should remain available');
  assert(!sources.some(item => item.id === 'class-target'), 'the target teaching load must not list itself');
  assert(advisorySource, 'the Advisory Class should be available as a roster source');
  assert.deepStrictEqual(advisorySource.learners.map(item => item.id), ['advisory-learner-1'], 'inactive Advisory learners should not be imported');
}

// Migration adds only the advisory store and preserves every legacy record.
{
  const profile = legacyProfile();
  const legacySnapshot = JSON.stringify(profile.assignments);
  const store = AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(store.schemaVersion, AdvisoryData.ADVISORY_SCHEMA_VERSION);
  assert.deepStrictEqual(store.classes, []);
  assert.strictEqual(JSON.stringify(profile.assignments), legacySnapshot);

  const once = JSON.stringify(profile);
  AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(JSON.stringify(profile), once, 'migration must be idempotent');
}

// Schema 1 Advisory stores migrate standard subjects as active and preserve
// former extra subjects as clearly identified legacy records.
{
  const profile = legacyProfile();
  profile.advisory = {
    schemaVersion: 1,
    classes: [{ id: 'legacy-advisory', schoolYear: '2026-2027', gradeLevel: '4', section: 'Molave', adviserName: 'Teacher One', isActive: true }],
    learners: [],
    subjects: [
      { id: 'standard', advisoryClassId: 'legacy-advisory', subjectName: 'Mathematics', normalizedSubjectKey: 'MATHEMATICS' },
      { id: 'extra', advisoryClassId: 'legacy-advisory', subjectName: 'Campus Journalism', normalizedSubjectKey: 'CAMPUS JOURNALISM' }
    ],
    grades: [], importBatches: [], sourceMappings: []
  };
  const store = AdvisoryData.normalizeAdvisoryData(profile);
  assert.strictEqual(store.schemaVersion, 2);
  assert.strictEqual(store.classes[0].isSpecialClass, false);
  assert.strictEqual(store.subjects.find(item => item.id === 'standard').isLegacySubject, false);
  assert.strictEqual(store.subjects.find(item => item.id === 'standard').includeInGeneralAverage, true);
  assert.strictEqual(store.subjects.find(item => item.id === 'extra').isLegacySubject, true);
  assert.strictEqual(store.subjects.find(item => item.id === 'extra').isArchived, false);
}

// All Phase 1 entities support create/read/update and integrity validation.
{
  const data = createPopulatedProfile();
  assert.strictEqual(data.profile.advisory.classes[0].id, data.advisoryClass.id);
  assert.strictEqual(data.profile.advisory.learners[0].lrn, data.learner.lrn);
  assert.strictEqual(data.profile.advisory.subjects[0].normalizedSubjectKey, 'MATHEMATICS');
  assert.strictEqual(data.profile.advisory.grades[0].finalGrade, 88);
  assert.strictEqual(data.profile.advisory.importBatches[0].exportId, 'export-1');
  assert.strictEqual(data.profile.advisory.sourceMappings[0].advisorySubjectId, data.subject.id);

  AdvisoryData.updateClass(data.profile, data.advisoryClass.id, { section: 'Narra' });
  AdvisoryData.updateLearner(data.profile, data.learner.id, { middleName: 'Santos' });
  AdvisoryData.updateSubject(data.profile, data.subject.id, { displayOrder: 2 });
  AdvisoryData.updateGrade(data.profile, data.grade.id, { remarks: 'Verified' });
  AdvisoryData.updateImportBatch(data.profile, data.batch.id, { status: 'undone' });
  AdvisoryData.updateSourceMapping(data.profile, data.mapping.id, { sourceTeacher: 'Teacher Two' });
  assert.strictEqual(data.profile.advisory.classes[0].section, 'Narra');
  assert.strictEqual(data.profile.advisory.learners[0].middleName, 'Santos');
  assert.strictEqual(data.profile.advisory.subjects[0].displayOrder, 2);
  assert.strictEqual(data.profile.advisory.grades[0].remarks, 'Verified');
  assert.strictEqual(data.profile.advisory.importBatches[0].status, 'undone');
  assert.strictEqual(data.profile.advisory.sourceMappings[0].sourceTeacher, 'Teacher Two');
  assert.deepStrictEqual(AdvisoryData.checkAdvisoryIntegrity(data.profile).errors, []);
}

// Active-class and final-grade uniqueness rules prevent ambiguous records.
{
  const data = createPopulatedProfile();
  assert.throws(() => AdvisoryData.createClass(data.profile, {
    schoolYear: '2026-2027', gradeLevel: '4', section: 'Narra', adviserName: 'Teacher One', isActive: true
  }), /Only one active/);
  assert.throws(() => AdvisoryData.createGrade(data.profile, {
    advisoryClassId: data.advisoryClass.id,
    advisoryLearnerId: data.learner.id,
    advisorySubjectId: data.subject.id,
    term: '1',
    finalGrade: 90
  }), /already exists/);
}

// Special Class migration defaults and one-to-two-subject limits are enforced.
{
  const profile = legacyProfile();
  AdvisoryData.normalizeAdvisoryData(profile);
  assert.throws(() => AdvisoryData.createClass(profile, {
    schoolYear: '2026-2027', gradeLevel: '4', section: 'Narra', adviserName: 'Teacher One', isActive: true, isSpecialClass: true
  }), /Special program name/);
  const advisoryClass = AdvisoryData.createClass(profile, {
    schoolYear: '2026-2027', gradeLevel: '4', section: 'Narra', adviserName: 'Teacher One', isActive: true,
    isSpecialClass: true, specialProgramName: 'Journalism'
  });
  const first = AdvisoryData.createSubject(profile, {
    advisoryClassId: advisoryClass.id, subjectName: 'Campus Journalism', normalizedSubjectKey: 'CAMPUS JOURNALISM',
    isSpecialProgramSubject: true, includeInGeneralAverage: false
  });
  AdvisoryData.createSubject(profile, {
    advisoryClassId: advisoryClass.id, subjectName: 'Broadcasting', normalizedSubjectKey: 'BROADCASTING', isSpecialProgramSubject: true
  });
  assert.strictEqual(first.includeInGeneralAverage, false);
  assert.throws(() => AdvisoryData.createSubject(profile, {
    advisoryClassId: advisoryClass.id, subjectName: 'Photojournalism', normalizedSubjectKey: 'PHOTOJOURNALISM', isSpecialProgramSubject: true
  }), /at most two/);
  AdvisoryData.updateSubject(profile, first.id, { isArchived: true });
  assert.doesNotThrow(() => AdvisoryData.createSubject(profile, {
    advisoryClassId: advisoryClass.id, subjectName: 'Photojournalism', normalizedSubjectKey: 'PHOTOJOURNALISM', isSpecialProgramSubject: true
  }));

  const ordinary = legacyProfile();
  AdvisoryData.normalizeAdvisoryData(ordinary);
  const ordinaryClass = AdvisoryData.createClass(ordinary, {
    schoolYear: '2026-2027', gradeLevel: '4', section: 'Molave', adviserName: 'Teacher One', isActive: true
  });
  assert.throws(() => AdvisoryData.createSubject(ordinary, {
    advisoryClassId: ordinaryClass.id, subjectName: 'Special Science', normalizedSubjectKey: 'SPECIAL SCIENCE', isSpecialProgramSubject: true
  }), /require a Special Class/);
}

// Deletes cascade safely and never modify ordinary class data.
{
  const data = createPopulatedProfile();
  const legacySnapshot = JSON.stringify(data.profile.assignments);
  assert.strictEqual(AdvisoryData.deleteSubject(data.profile, data.subject.id), true);
  assert.strictEqual(data.profile.advisory.grades.length, 0);
  assert.strictEqual(data.profile.advisory.sourceMappings.length, 0);
  assert.strictEqual(JSON.stringify(data.profile.assignments), legacySnapshot);

  const second = createPopulatedProfile();
  assert.strictEqual(AdvisoryData.deleteClass(second.profile, second.advisoryClass.id), true);
  Object.keys(second.profile.advisory)
    .filter(key => Array.isArray(second.profile.advisory[key]))
    .forEach(key => assert.strictEqual(second.profile.advisory[key].length, 0, `${key} should be removed`));
}

// Integrity checks report corrupted references without discarding data.
{
  const data = createPopulatedProfile();
  data.profile.advisory.grades[0].advisoryLearnerId = 'missing-learner';
  const report = AdvisoryData.checkAdvisoryIntegrity(data.profile);
  assert.strictEqual(report.isValid, false);
  assert(report.errors.some(error => error.code === 'orphan-learner-reference'));
}

// Renderer startup and both plain/encrypted restore paths invoke migration.
{
  const root = path.join(__dirname, '..');
  const databaseSource = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
  const importSource = fs.readFileSync(path.join(root, 'src/renderer/js/import-export.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert(databaseSource.includes('const DB_VERSION = 7;'), 'profile database version must be migrated');
  assert(databaseSource.includes('normalizeAdvisoryData(db);'), 'database normalization must migrate advisory data');
  assert(databaseSource.indexOf('normalizeDatabase();') < databaseSource.indexOf('updateProfile();'), 'save must normalize before persistence');
  assert(htmlSource.indexOf('js/advisory-data.js') < htmlSource.indexOf('js/database.js'), 'data model must load before database startup');
  assert.strictEqual((importSource.match(/normalizeDatabase\(\);/g) || []).length >= 2, true, 'older plain and encrypted backups must migrate on restore');
}

console.log('Advisory data model and migration tests passed.');
