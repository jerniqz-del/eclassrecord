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
assert.strictEqual(Transfer.calculateGeneralTermAverage(profile.advisory.grades, learner.id, subjects, '1'), 85.5);
const decimalFixture = ['77', '80', '81'].map((value, index) => ({
  advisoryLearnerId: 'decimal-learner', advisorySubjectId: 'decimal-subject', term: String(index + 1), finalGrade: Number(value)
}));
assert.strictEqual(Transfer.calculateSubjectFinal(decimalFixture, 'decimal-learner', 'decimal-subject'), 79);
assert.strictEqual(Transfer.calculateSubjectFinalExact(decimalFixture, 'decimal-learner', 'decimal-subject'), 79.33);
assert.strictEqual(Transfer.calculateGeneralAverageExact(decimalFixture, 'decimal-learner', [{ id: 'decimal-subject', subjectName: 'Example Subject' }]), 79.33);
Transfer.setAdvisoryDecimalView(false);
assert.strictEqual(Transfer.formatVisibleGrade(86), '86');
Transfer.setAdvisoryDecimalView(true);
assert.strictEqual(Transfer.formatVisibleGrade(86), '86.00');
Transfer.setAdvisoryDecimalView(false);
const mapehDisplayGroups = Transfer.subjectGroupsForGradeRecord([
  { id: 'math', subjectName: 'Mathematics', displayOrder: 0 },
  { id: 'music', subjectName: 'Music & Arts', displayOrder: 1 },
  { id: 'pe', subjectName: 'PE & Health', displayOrder: 2 },
  { id: 'science', subjectName: 'Science', displayOrder: 3 }
]);
assert.deepStrictEqual(
  mapehDisplayGroups.map(subject => subject.subjectName),
  ['Mathematics', 'MAPEH Average', 'Music & Arts', 'PE & Health', 'Science'],
  'Learner Grade Record must place consolidated MAPEH before Music & Arts and PE & Health'
);
global.db = profile;
const finalReport = Report.buildReport(advisoryClass, 'finals');
const termsReport = Report.buildReport(advisoryClass, 'terms');
assert(finalReport.html.includes('Final Grades Only'));
assert(!finalReport.html.includes('<th>T1</th>'));
assert(termsReport.html.includes('Terms 1–3 and Final Grades'));
assert(termsReport.html.includes('<th>T1</th><th>T2</th><th>T3</th><th>Final</th>'));
assert(termsReport.html.includes('<th colspan="4" class="advisory-report__average">General Average</th>'));
assert(termsReport.html.includes('85.50'), 'Detailed report must include the Term 1 General Average');
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
assert(css.includes('.advisory-subject-heading--collapsed .advisory-subject-name--compact'), 'collapsed subjects must show compact acronym labels at every window size');
assert(css.includes('.advisory-manual-grade-cell input'), 'manual Advisory grade inputs must be visibly editable');
assert(css.includes('.advisory-quick-grade-input[type="number"]::-webkit-inner-spin-button'), 'manual grade inputs must hide the number spinner controls');
assert(css.includes('.advisory-quick-grade-modal'), 'Manual Entry quick grading must have a dedicated responsive modal');
assert(css.includes('height: min(92vh, 780px)'), 'the Quick Grade modal must reserve enough fixed space for every grading parameter');
assert(css.includes('.advisory-quick-grade-modal > .modal__body.advisory-quick-grade-layout { display: grid;'), 'the Quick Grade grid must override the shared wide-modal flex layout');
assert(css.includes('.advisory-quick-grade-main { grid-column: 1; grid-row: 1; display: flex; min-width: 0; min-height: 0; flex-direction: column; gap: var(--space-3); overflow: visible;'), 'the Quick Grade parameters must remain fully visible in their own grid column');
assert(css.includes('.advisory-quick-grade-selectors { display: grid; grid-template-columns: minmax(0, 1fr) 120px;'), 'the subject and term selectors must remain visible in a fixed row');
assert(css.includes('.advisory-quick-grade-roster-list { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 4px; margin-top: var(--space-2); overflow-y: auto;'), 'only the Quick Grade learner list should scroll');
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
assert(setup.includes("'10', '11', '12'"), 'Advisory setup must enable Grades 11 and 12');
assert(setup.includes('id="advisorySeniorHighSubjects"'), 'Advisory setup must show a Senior High subject selector');
assert(setup.includes('syncSeniorHighSubjects'), 'Advisory setup must save only the selected Senior High subjects');
assert(setup.includes('id="advisorySectionSelect"'));
assert(setup.includes('value="__custom__"'));
assert(setup.includes("sourceSelect.addEventListener('change'"));
assert(setup.includes('Complete all required fields'));
assert(setup.includes('Import learners from Other Class'));
assert(setup.includes('AdvisoryRoster.startClassImport'));
assert(css.includes('.advisory-shs-subject-groups'), 'Senior High subject groups must have a readable, scrollable layout');
const transferSource = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-grade-transfer.js'), 'utf8');
assert(transferSource.includes('data-advisory-manual-grade'), 'Manual Entry must render editable term-grade controls');
assert(transferSource.includes('saveManualGrade(profileDb'), 'Manual Entry controls must persist adviser-entered grades');
assert(transferSource.includes("record?.sourceType === 'grade-transfer-file' && record.adviserEditAllowed === true"), 'only teacher-permitted imported grades may become editable');
assert(transferSource.includes('saveAdviserGradeAdjustment'), 'permitted imported grades must use an audited adviser adjustment path');
assert(transferSource.includes('data-adviser-edit-permission'), 'Grade Transfer export must offer adviser editing permission');
assert(transferSource.includes('data-adviser-note'), 'Grade Transfer export must offer an optional teacher note');
assert(transferSource.includes('Note from Subject Teacher'), 'the import preview must display the teacher note');
assert(transferSource.includes('data-advisory-quick-grade>Quick Grade Entry'), 'Manual Entry subjects must expose Quick Grade Entry from the Grade Record');
assert(transferSource.includes('data-advisory-quick-grade-input'), 'Quick Grade Entry must provide a focused grade input');
assert(transferSource.includes("if (event.key === 'Enter')"), 'Quick Grade Entry must support Enter-to-save keyboard navigation');
assert(transferSource.includes("navigate(event.shiftKey ? 'previous-cell' : 'next-cell')"), 'inline manual entry must support Tab and Shift+Tab term navigation');
assert(transferSource.includes('const cells = learners.flatMap'), 'Quick Grade Entry must build an editable-cell sequence for Tab navigation');
assert(transferSource.includes("currentIndex + (event.shiftKey ? -1 : 1)"), 'Quick Grade Entry must support Tab and Shift+Tab through permitted cells');
const dashboard = fs.readFileSync(path.join(root, 'src/renderer/js/dashboard.js'), 'utf8');
assert(dashboard.includes('subjectWatermarkMarkup'));
assert(dashboard.includes('subjectCardIconMarkup'));
['language', 'reading-literacy', 'makabansa', 'mathematics', 'gmrc', 'araling-panlipunan', 'english', 'filipino', 'science', 'mapeh', 'epp-tle'].forEach(key => assert(dashboard.includes(key)));
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const layoutCss = fs.readFileSync(path.join(root, 'src/renderer/css/layout.css'), 'utf8');
const designTokensCss = fs.readFileSync(path.join(root, 'src/renderer/css/design-tokens.css'), 'utf8');
const sidebarProfileSource = fs.readFileSync(path.join(root, 'src/renderer/js/sidebar-profile.js'), 'utf8');
assert(html.includes('id="sidebarUserName"'), 'the sidebar must display the active teacher profile name');
assert(html.includes('js/sidebar-profile.js'), 'the sidebar profile updater must load with the renderer');
assert(designTokensCss.includes('--sidebar-scale:'), 'the sidebar must expose a responsive typography scale');
assert(designTokensCss.includes('--sidebar-width:  clamp('), 'the default sidebar width must respond to the viewport');
assert(layoutCss.includes('.sidebar__user-name'), 'the teacher profile label must have dedicated overflow-safe styling');
assert(layoutCss.includes('--font-size-base: calc((0.8125rem * var(--sidebar-scale)) / var(--zoom-ratio));'), 'sidebar typography must account for app zoom');
assert(sidebarProfileSource.includes('getActiveProfileDatabase'), 'the sidebar label must read the active profile database');
assert(sidebarProfileSource.includes('label.textContent = name;'), 'the sidebar label must render the resolved teacher name as text');
[
  'src/renderer/js/changelog.js',
  'docs/implementation-history.md',
  'docs/release-notes-v1.4.0.md',
  'docs/release-notes-v1.4.5.md',
  'docs/release-notes-v1.4.6.md',
  'docs/release-notes-v1.5.0.md',
  'docs/release-notes-v1.8.0.md'
].forEach(relativePath => {
  const publicNotes = fs.readFileSync(path.join(root, relativePath), 'utf8');
  assert(!/\badmin(?:istration|istrator)?\b|mock(?:\s+data|\s+workspace|\s+profile)?|test mode|fictional learners/i.test(publicNotes), `${relativePath} must not expose internal testing or privileged-control details`);
});
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
assert(page.includes('`Grade ${advisoryClass.gradeLevel} — ${advisoryClass.section} · Advisory Class`'), 'Advisory Class must replace the teaching-load title in the app header');
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
assert(!reportUi.includes('adviserModificationNote'), 'teacher permission notes must not appear in official grade reports');
assert(css.includes('.advisory-page__report-actions'));
assert(css.includes('.advisory-report-preview-modal'));
assert(transferUi.includes('data-expand-advisory-subject'));
assert(transferUi.includes('data-toggle-advisory-decimals'));
assert(transferUi.includes('general-term-average'));
assert(transferUi.includes('calculateGeneralTermAverage'));
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
assert(transferUi.includes('gradeSourceClass(subject.sourceType)'), 'Grade Source rows and Grade Record columns must share source color classes');
['advisory-grade-source--transfer', 'advisory-grade-source--class', 'advisory-grade-source--manual'].forEach(className => {
  assert(transferUi.includes(className), `Grade Record renderer must include ${className}`);
  assert(css.includes(className), `Advisory styles must include ${className}`);
});
['#dcfce7', '#dbeafe', '#ffedd5'].forEach(color => assert(css.includes(color), `Advisory source colors must include ${color}`));
assert(css.includes('@media print'), 'Source color tints must have a print override');
assert(css.includes('.advisory-teacher-note'));
assert(css.includes('.advisory-source-explanation[hidden] { display: none !important; }'), 'inactive grade-source help panels must stay hidden');
assert(css.includes('.advisory-permitted-grade-cell'));
assert(transferUi.includes('data-advisory-add-manual'));
assert(transferUi.includes('data-advisory-import-class'));
assert(!transferUi.includes('data-open-advisory-roster-tools'));
assert(!transferUi.includes('data-open-advisory-settings'));
assert(transferUi.includes('MAPEH Submission'));
assert(transferUi.includes('MAPEH Average'));
assert(transferUi.includes("return 'Aral. Pan.'"));
assert(setup.includes("setPanelTab?.('settings'"));

console.log('Advisory page, dynamic navigation, setup workflow, final-grade calculation, modal layering, subject logos, and ZIP reset backup tests passed.');
