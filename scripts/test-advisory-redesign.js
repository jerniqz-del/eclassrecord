const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const Transfer = require('../src/renderer/js/advisory-grade-transfer.js');
const Report = require('../src/renderer/js/advisory-grade-report.js');
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
assert.strictEqual(Transfer.calculateGeneralAverage(profile.advisory.grades, learner.id, subjects), 86.5);
assert.strictEqual(Transfer.formatGeneralAverage(Transfer.calculateGeneralAverage(profile.advisory.grades, learner.id, subjects)), '86.50');
global.db = profile;
const finalReport = Report.buildReport(advisoryClass, 'finals');
const termsReport = Report.buildReport(advisoryClass, 'terms');
assert(finalReport.html.includes('Final Grades Only'));
assert(!finalReport.html.includes('<th>T1</th>'));
assert(termsReport.html.includes('Terms 1–3 and Final Grades'));
assert(termsReport.html.includes('<th>T1</th><th>T2</th><th>T3</th><th>Final</th>'));
assert(termsReport.html.includes('123456789012'));
const multiPageProfile = JSON.parse(JSON.stringify(profile));
for (let index = 3; index <= 8; index += 1) multiPageProfile.advisory.subjects.push({
  id: `subject-${index}`, advisoryClassId: advisoryClass.id, subjectName: `Subject ${index}`,
  normalizedSubjectKey: `SUBJECT ${index}`, displayOrder: index, isArchived: false
});
global.db = multiPageProfile;
const multiPageReport = Report.buildReport(advisoryClass, 'finals');
assert.strictEqual((multiPageReport.html.match(/>General Average</g) || []).length, 1, 'General Average should appear once on the single final-only report page');
assert(multiPageReport.html.includes('advisory-report__subject-column'), 'report subjects must use equal-width column definitions');
const reportPages = multiPageReport.html.match(/<section class="advisory-report__sheet">[\s\S]*?<\/section>/g) || [];
assert.strictEqual(reportPages.length, 1, 'final-only reports must place every subject on one page');
assert(reportPages[0].includes('Subject 8'), 'the single final-only page must include the remaining subjects');
const learnerColumnWidths = [...multiPageReport.html.matchAll(/advisory-report__learner-column" style="width:(\d+)px"/g)].map(match => match[1]);
assert(learnerColumnWidths.length === 1, 'the single final-only page must retain its roster-sized learner column');
global.db = profile;

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
const componentCss = fs.readFileSync(path.join(root, 'src/renderer/css/components.css'), 'utf8');
assert(componentCss.includes('.modal-z-donate { z-index: 13000; }'), 'the exit support dialog must appear above Advisory report dialogs');
assert(css.includes('.modal-z-confirm { z-index: 12500; }'));
assert(css.includes('.advisory-roster-modal-overlay { z-index: 11800;'));
assert(css.includes('.advisory-reset-modal-overlay { z-index: 12300; }'));
assert(css.includes('.advisory-page__body'));
assert(css.includes('.advisory-page__reset'));
assert(css.includes('.advisory-grade-matrix .advisory-learner-heading'));
assert(css.includes('.advisory-grade-matrix thead tr:nth-child(2) th { text-align: center; }'));
assert(css.includes('font-size: var(--font-size-sm); text-align: center;'));
assert(css.includes('.advisory-grade-matrix th.advisory-general-average { white-space: normal; overflow-wrap: anywhere;'));
assert(css.includes('.advisory-grade-matrix tbody td:first-child'));
assert(!css.includes('.advisory-grade-matrix th:first-child,'));
assert(css.includes('position: sticky; left: 0;'));
assert(css.includes('.advisory-subject-sort'));
assert(css.includes('[data-advisory-panel][hidden]'));
assert(css.includes('.advisory-subject-end'));
assert(css.includes('col.advisory-term-col'));
assert(css.includes('.advisory-mapeh-average'));
assert(css.includes('.advisory-settings-form'));
assert(css.includes('.advisory-grade-matrix--finals-only { width: calc(100% - 22px); min-width: 0; }'));
assert(css.includes('@media (max-width: 1100px)'));
assert(css.includes('font-family: var(--font-family-sans)'));
assert(/\.btn-cancel,\r?\n\.btn-danger/.test(componentCss), 'Cancel and Delete buttons must share the global red theme');
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
assert(dashboard.includes('subjectWatermarkMarkup'));
assert(dashboard.includes('subjectCardIconMarkup'));
['language', 'reading-literacy', 'makabansa', 'mathematics', 'gmrc', 'araling-panlipunan', 'english', 'filipino', 'science', 'mapeh', 'epp-tle'].forEach(key => assert(dashboard.includes(key)));
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
assert(html.includes('id="schoolDistrict"'));
assert(html.includes('js/advisory-reset.js'));
assert(html.includes('id="navAdvisory"'));
assert(html.includes('data-view="advisory"'));
assert(html.includes('js/advisory-page.js'));
assert(html.includes('js/advisory-grade-report.js'));
assert(html.includes('data-advisory-page-tab="grades"'));
assert(html.includes('data-advisory-page-tab="sources"'));
assert(html.includes('data-advisory-page-tab="roster"'));
assert(html.includes('data-advisory-page-tab="settings"'));
const page = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-page.js'), 'utf8');
assert(page.includes("globalScope.openAdvisoryClassDashboard = openPage"));
assert(page.includes('data-advisory-page-report'));
assert(page.includes("nav.hidden = !configured"));
assert(page.includes('advisory-page__reset'));
assert(page.includes("'ArrowLeft', 'ArrowRight', 'Home', 'End'"));
const transferUi = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-grade-transfer.js'), 'utf8');
assert(!transferUi.includes('<label class="field-label">Normalized Subject Key</label>'));
assert(transferUi.includes('existing?.normalizedSubjectKey || normalizeSubjectKey(values.subjectName)'));
assert(transferUi.includes('ensureGradeLevelSubjects'));
assert(transferUi.includes('Where will the grades come from?'));
assert(transferUi.includes('The app reads the school year, grade and section, subject, and term directly'));
assert(!transferUi.includes('<label class="field-label">Expected Source Class</label>'));
assert(transferUi.includes('data-toggle-advisory-terms'));
const reportUi = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-grade-report.js'), 'utf8');
assert(reportUi.includes('Final Grades Only'));
assert(reportUi.includes('Include Terms 1–3'));
assert(reportUi.includes('Print Preview'));
assert(reportUi.includes('Download PDF'));
assert(reportUi.includes('advisory-report-print-mode'));
assert(reportUi.includes('includeHeader: false'), 'advisory PDF export must use only its own report header');
assert(css.includes('.advisory-page__report-actions'));
assert(css.includes('.advisory-report-preview-modal'));
assert(transferUi.includes('data-expand-advisory-subject'));
assert(transferUi.includes('expandedAdvisorySubjects'));
assert(transferUi.includes('data-advisory-matrix-scrollbar'));
assert(transferUi.includes('press Shift and use the mouse wheel'));
assert(css.includes('.advisory-grade-matrix-scrollbar'));
assert(css.includes('.advisory-scroll-tip::after'));
assert(transferUi.includes('class="advisory-learner-heading"'));
assert(transferUi.includes('data-sort-advisory-subject'));
assert(transferUi.includes('data-advisory-panel="sources"'));
assert(transferUi.includes('data-advisory-panel="roster"'));
assert(transferUi.includes('data-advisory-panel="settings"'));
assert(transferUi.includes('data-advisory-settings-form'));
assert(transferUi.includes('data-advisory-add-manual'));
assert(transferUi.includes('data-advisory-import-class'));
assert(!transferUi.includes('data-open-advisory-roster-tools'));
assert(!transferUi.includes('data-open-advisory-settings'));
assert(transferUi.includes('MAPEH Submission'));
assert(transferUi.includes('MAPEH Average'));
assert(transferUi.includes("return 'Aral. Pan.'"));
assert(setup.includes("setPanelTab?.('settings'"));

console.log('Advisory page, dynamic navigation, setup workflow, final-grade calculation, modal layering, subject logos, and ZIP reset backup tests passed.');
