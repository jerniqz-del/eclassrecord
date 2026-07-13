const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');
const Reset = require('../src/renderer/js/advisory-reset.js');
const Zip = require('../src/main/zip-archive.js');

const profile = { schoolYear: '2026-2027', assignments: [] };
AdvisoryData.normalizeAdvisoryData(profile);
const advisoryClass = AdvisoryData.createClass(profile, { id: 'class-1', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Teacher', isActive: true });
const learner = AdvisoryData.createLearner(profile, { id: 'learner-1', advisoryClassId: advisoryClass.id, lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan' });
const subjects = ['Mathematics', 'Science'].map((name, index) => AdvisoryData.createSubject(profile, { id: `subject-${index + 1}`, advisoryClassId: advisoryClass.id, subjectName: name, normalizedSubjectKey: name.toUpperCase(), displayOrder: index }));
subjects.forEach((subject, subjectIndex) => ['1', '2', '3'].forEach((term, termIndex) => AdvisoryData.createGrade(profile, {
  advisoryClassId: advisoryClass.id,
  advisoryLearnerId: learner.id,
  advisorySubjectId: subject.id,
  schoolYear: profile.schoolYear,
  term,
  finalGrade: 85 + subjectIndex + termIndex
})));

assert.strictEqual(Transfer.calculateSubjectFinal(profile.advisory.grades, learner.id, subjects[0].id), 86);
assert.strictEqual(Transfer.calculateGeneralAverage(profile.advisory.grades, learner.id, subjects), 87);

const files = Reset.buildResetBackupFiles(profile, advisoryClass, '2026-07-13T00:00:00.000Z');
assert.strictEqual(files.length, 11, 'five metadata files plus three term files per subject are required');
subjects.forEach((subject, index) => ['1', '2', '3'].forEach(term => {
  const prefix = `subjects/${String(index + 1).padStart(2, '0')}_${subject.subjectName}/Term_${term}.json`;
  assert(files.some(file => file.name === prefix), `missing ${prefix}`);
}));
const archive = Zip.createZip(files, new Date('2026-07-13T00:00:00.000Z'));
assert.strictEqual(archive.readUInt32LE(0), 0x04034b50);
assert(archive.includes(Buffer.from('subjects/01_Mathematics/Term_1.json')));
assert(archive.includes(Buffer.from('subjects/02_Science/Term_3.json')));
assert.strictEqual(archive.readUInt32LE(archive.length - 22), 0x06054b50);

const resetProfile = JSON.parse(JSON.stringify(profile));
resetProfile.assignments = [{ id: 'subject-class-kept', learners: [{ id: 'subject-learner-kept' }], scores: { kept: 99 } }];
assert.strictEqual(Reset.resetAdvisoryData(resetProfile, advisoryClass.id), true);
assert.strictEqual(resetProfile.advisory.classes.length, 0);
assert.strictEqual(resetProfile.advisory.learners.length, 0);
assert.strictEqual(resetProfile.advisory.subjects.length, 0);
assert.strictEqual(resetProfile.advisory.grades.length, 0);
assert.deepStrictEqual(resetProfile.assignments, [{ id: 'subject-class-kept', learners: [{ id: 'subject-learner-kept' }], scores: { kept: 99 } }]);

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/renderer/css/advisory.css'), 'utf8');
assert(css.includes('.modal-z-confirm { z-index: 12500; }'));
assert(css.includes('.advisory-roster-modal-overlay { z-index: 11800;'));
assert(css.includes('.advisory-reset-modal-overlay { z-index: 12300; }'));
assert(css.includes('.advisory-page__body'));
assert(css.includes('.advisory-page__reset'));
assert(css.includes('.advisory-grade-matrix th:first-child'));
assert(css.includes('position: sticky; left: 0;'));
assert(css.includes('.advisory-subject-sort'));
assert(css.includes('[data-advisory-panel][hidden]'));
assert(css.includes('.advisory-setup-modal__body { flex: 1 1 auto; min-height: 0; overflow: auto;'));
const setup = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-dashboard.js'), 'utf8');
assert(setup.includes('<select class="field-select" id="advisoryGradeLevel"'));
assert(setup.includes('supportedGrades'));
assert(setup.includes('id="advisorySectionSelect"'));
assert(setup.includes('value="__custom__"'));
assert(setup.includes("sourceSelect.addEventListener('change'"));
assert(setup.includes('Complete all required fields'));
assert(setup.includes('Import learners from Other Class'));
assert(setup.includes('AdvisoryRoster.startClassImport'));
const dashboard = fs.readFileSync(path.join(root, 'src/renderer/js/dashboard.js'), 'utf8');
assert(dashboard.includes('subjectLogoMarkup'));
['language', 'reading', 'makabansa', 'mathematics', 'values', 'araling-panlipunan', 'english', 'filipino', 'science', 'mapeh', 'epp-tle'].forEach(key => assert(dashboard.includes(key)));
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
assert(html.includes('id="schoolDistrict"'));
assert(html.includes('js/advisory-reset.js'));
assert(html.includes('id="navAdvisory"'));
assert(html.includes('data-view="advisory"'));
assert(html.includes('js/advisory-page.js'));
assert(html.includes('data-advisory-page-tab="grades"'));
assert(html.includes('data-advisory-page-tab="sources"'));
const page = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-page.js'), 'utf8');
assert(page.includes("globalScope.openAdvisoryClassDashboard = openPage"));
assert(page.includes("nav.hidden = !configured"));
assert(page.includes('advisory-page__reset'));
const transferUi = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-grade-transfer.js'), 'utf8');
assert(!transferUi.includes('<label class="field-label">Normalized Subject Key</label>'));
assert(transferUi.includes('existing?.normalizedSubjectKey || normalizeSubjectKey(values.subjectName)'));
assert(transferUi.includes('ensureGradeLevelSubjects'));
assert(transferUi.includes('Where will the grades come from?'));
assert(transferUi.includes('The app reads the school year, grade and section, subject, and term directly'));
assert(!transferUi.includes('<label class="field-label">Expected Source Class</label>'));
assert(transferUi.includes('data-toggle-advisory-terms'));
assert(transferUi.includes('data-sort-advisory-subject'));
assert(transferUi.includes('data-advisory-panel="sources"'));
assert(transferUi.includes('MAPEH Submission'));
assert(transferUi.includes("return 'Aral. Pan.'"));

console.log('Advisory page, dynamic navigation, setup workflow, final-grade calculation, modal layering, subject logos, and ZIP reset backup tests passed.');
