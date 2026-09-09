const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = { console, Math };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-engine.js'), 'utf8'), context);

assert.strictEqual(context.paceGrade1SubjectNames().slice(0, 5).join('|'), [
  'Reading and Literacy',
  'Language',
  'Mathematics',
  'Good Manners and Right Conduct (GMRC)',
  'Makabansa'
].join('|'));
assert.ok(context.paceSubjectSortIndex('Reading and Literacy') < context.paceSubjectSortIndex('Language'));
assert.ok(context.paceSubjectSortIndex('Language') < context.paceSubjectSortIndex('Mathematics'));
assert.ok(context.paceSubjectSortIndex('Mathematics') < context.paceSubjectSortIndex('Good Manners and Right Conduct (GMRC)'));
assert.ok(context.paceSubjectSortIndex('Good Manners and Right Conduct (GMRC)') < context.paceSubjectSortIndex('Makabansa'));
assert.strictEqual(context.paceSubjectDisplayName('Reading and Literacy'), 'Reading and Literacy');
assert.strictEqual(context.paceHomeroomSubjectNames().join('|'), [
  'Reading and Literacy',
  'Language',
  'Mathematics',
  'Good Manners and Right Conduct (GMRC)',
  'Makabansa'
].join('|'));
assert.strictEqual(context.isPaceHomeroomAssignment({ gradeLevel: '1', subject: 'Grade 1', paceHomeroom: true }), true);
assert.strictEqual(context.isPaceHomeroomAssignment({ gradeLevel: '1', subject: 'Makabansa' }), false);
const mathT2 = context.paceCompetenciesFor('Mathematics', 2)[0];
assert.strictEqual(context.paceItemAppliesToTerm(mathT2, 1), false);
const blocked = {
  gradeLevel: '1',
  subject: 'Grade 1',
  paceHomeroom: true,
  learners: [{ id: 'l1', name: 'Ana' }]
};
context.paceSetRating(blocked, 'l1', mathT2.id, '1', '', 'A');
assert.strictEqual(context.paceGetRating(blocked, 'l1', mathT2.id, '1', ''), '', 'gray / other-term cells cannot be rated');
context.paceUi = { subject: 'Makabansa' };
assert.strictEqual(context.paceWorkingSubject(blocked), 'Makabansa');
const makabansaItem = context.paceCompetenciesFor('Makabansa', 1)[0];
context.paceSetRating(blocked, 'l1', makabansaItem.id, '1', '', 'B');
assert.strictEqual(context.paceTermResult(blocked, 'l1', '1', 'Makabansa').letter, 'B');
assert.strictEqual(context.paceTermResult(blocked, 'l1', '1', 'Language').letter, null);
assert.strictEqual(context.paceCompetenciesFor('Reading and Literacy', 1).length, 25);
assert.strictEqual(context.paceCompetenciesFor('Reading and Literacy', 3).length, 25);
assert.strictEqual(context.paceCompetenciesFor('Language', 2).length, 20);
assert.strictEqual(context.paceCompetenciesFor('Mathematics', 1).length, 16);
assert.strictEqual(context.paceCompetenciesFor('Mathematics', 2).length, 17);
assert.strictEqual(context.paceCompetenciesFor('Mathematics', 3).length, 14);
assert.strictEqual(context.paceCompetenciesFor('Good Manners and Right Conduct (GMRC)', 1).length, 7);
assert.strictEqual(context.paceCompetenciesFor('Good Manners and Right Conduct (GMRC)', 2).length, 9);
assert.strictEqual(context.paceCompetenciesFor('Good Manners and Right Conduct (GMRC)', 3).length, 8);
assert.strictEqual(context.paceCompetenciesFor('Makabansa', 1).length, 3);
assert.strictEqual(context.paceCompetenciesFor('Makabansa', 2).length, 3);
assert.strictEqual(context.paceCompetenciesFor('Makabansa', 3).length, 7);
assert.strictEqual(context.paceCompetenciesFor('Arts and Physical Education', 1).length, 1);
assert(context.paceIsYearLongSubject('Reading and Literacy'));
assert(!context.paceIsYearLongSubject('Mathematics'));
assert.strictEqual(context.paceCompetenciesFor('Reading and Literacy', 1)[0].skills.join(','), 'listen,speak');
assert.strictEqual(context.paceExpectedCellCount('Makabansa', 1), 3);
assert.strictEqual(context.paceExpectedCellCount('Language', 1), 51);
assert.strictEqual(context.paceExpectedCellCount('Reading and Literacy', 1), 35);
assert.strictEqual(context.paceExpectedCellCount('Mathematics', 1), 17);
assert.strictEqual(context.paceExpectedCellCount('Mathematics', 2), 21);
const mathDetailItem = context.paceCompetenciesFor('Mathematics', 2).find(item => item.number === 3);
assert.strictEqual(context.paceCellSkills(mathDetailItem).join(','), 'a,b,c');
assert.strictEqual(context.paceCellNumber(mathDetailItem, 1), '3.b');
const readingStory = context.paceCompetenciesFor('Reading and Literacy', 1).find(item => item.number === 20);
assert.strictEqual(context.paceCellNumber(readingStory, 0), '20.a');
assert.strictEqual(context.paceCellSkills(readingStory).length, 7);
const readingFirst = context.paceCompetenciesFor('Reading and Literacy', 1)[0];
assert.strictEqual(context.paceCellNumber(readingFirst, 0), '1');
assert.strictEqual(context.paceCellSkills(readingFirst).join(','), '');
assert.strictEqual(context.paceLetterTooltip('A'), 'A — Advancing (Namumukod-tangi)');

assert.strictEqual(context.paceMedianLetter(['A', 'A', 'E']), 'A');
assert.strictEqual(context.paceMedianLetter(['A', 'E']), 'E');
assert.strictEqual(context.paceMedianLetter(['B', 'B', 'C', 'D']), 'C');
assert.strictEqual(context.paceMedianLetter([]), '');
assert.strictEqual(context.paceIncrementLetter('E'), 'D');
assert.strictEqual(context.paceIncrementLetter('D'), 'C');
assert.strictEqual(context.paceIncrementLetter('A'), 'A');
assert.strictEqual(context.paceAnnexCRange('B'), '80-89');
assert.strictEqual(context.paceNormalizeLetter('b'), 'B');

const assignment = {
  gradeLevel: '1',
  subject: 'Makabansa',
  learners: [
    { id: 'l1', name: 'Ana' },
    { id: 'l2', name: 'Ben' },
    { id: 'l3', name: 'Cara' },
    { id: 'l4', name: 'Dan', transferredOutTerm: '1' }
  ]
};
const item = context.paceCompetenciesFor('Makabansa', 1)[0];
context.paceClassSet(assignment, item, '1', '', 'E');
assert.strictEqual(context.paceGetRating(assignment, 'l1', item.id, '1', ''), 'E');
assert.strictEqual(context.paceGetRating(assignment, 'l2', item.id, '1', ''), 'E');
assert.strictEqual(context.paceGetRating(assignment, 'l4', item.id, '1', ''), '');
context.paceSetRating(assignment, 'l2', item.id, '1', '', 'C');
context.paceClassSet(assignment, item, '1', '', 'D');
assert.strictEqual(context.paceGetRating(assignment, 'l1', item.id, '1', ''), 'E', 'class-set fills unrated only');
assert.strictEqual(context.paceGetRating(assignment, 'l2', item.id, '1', ''), 'C', 'existing higher letter is kept');
context.paceClassSet(assignment, item, '1', '', 'D', { replace: true });
assert.strictEqual(context.paceGetRating(assignment, 'l2', item.id, '1', ''), 'D');

context.paceIncrementLearners(assignment, item, '1', '', ['l1', 'l2', 'l3']);
assert.strictEqual(context.paceGetRating(assignment, 'l1', item.id, '1', ''), 'C');
assert.strictEqual(context.paceGetRating(assignment, 'l2', item.id, '1', ''), 'C');
context.paceSetRating(assignment, 'l3', item.id, '1', '', 'A');
context.paceIncrementLearners(assignment, item, '1', '', ['l3']);
assert.strictEqual(context.paceGetRating(assignment, 'l3', item.id, '1', ''), 'A', 'increment stops at A');

context.paceSetRating(assignment, 'l1', item.id, '1', '', 'B');
context.paceIncrementLearners(assignment, item, '1', '', ['l1']);
assert.strictEqual(context.paceGetRating(assignment, 'l1', item.id, '1', ''), 'A');
const undone = context.paceUndoLastBulk(assignment);
assert.strictEqual(undone, 1);
assert.strictEqual(context.paceGetRating(assignment, 'l1', item.id, '1', ''), 'B');
context.paceClearRatings(assignment, item, '1', '', ['l1']);
assert.strictEqual(context.paceGetRating(assignment, 'l1', item.id, '1', ''), '');

context.paceSetRating(assignment, 'l1', item.id, '1', '', 'B');
context.paceSetRating(assignment, 'l1', context.paceCompetenciesFor('Makabansa', 1)[1].id, '1', '', 'B');
context.paceSetRating(assignment, 'l1', context.paceCompetenciesFor('Makabansa', 1)[2].id, '1', '', 'D');
const result = context.paceTermResult(assignment, 'l1', '1');
assert.strictEqual(result.letter, 'B');
assert.strictEqual(result.rated, 3);
assert.strictEqual(result.expected, 3);
context.paceSetTermOverride(assignment, 'l1', '1', 'A');
assert.strictEqual(context.paceTermResult(assignment, 'l1', '1').letter, 'A');

const remaining = {
  gradeLevel: '1',
  subject: 'Makabansa',
  learners: [{ id: 'l1', name: 'Ana' }, { id: 'l2', name: 'Ben' }]
};
const makabansa = context.paceCompetenciesFor('Makabansa', 1);
context.paceClassSetRemaining(remaining, 1, 0, '1', 'E');
assert.strictEqual(context.paceGetRating(remaining, 'l1', makabansa[0].id, '1', ''), '');
assert.strictEqual(context.paceGetRating(remaining, 'l1', makabansa[1].id, '1', ''), 'E');
assert.strictEqual(context.paceGetRating(remaining, 'l1', makabansa[2].id, '1', ''), 'E');
const focus = context.paceFirstUnratedFocus(remaining, '1');
assert.strictEqual(focus.itemIndex, 0);

context.db = { schoolYear: '2026-2027', currentTerm: '1', showNumericalEquivalents: false };
context.number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/grading.js'), 'utf8'), context);
const scored = {
  gradeLevel: '1',
  subject: 'Makabansa',
  schoolYear: '2026-2027',
  policy: 'DO15_DESCRIPTIVE',
  learners: [{ id: 'l1', name: 'Ana' }],
  assessments: [
    { id: 'ww1', term: '1', component: 'WW', maxScore: 20 },
    { id: 'pt1', term: '1', component: 'PT', maxScore: 20 },
    { id: 'st1', term: '1', component: 'ST1', maxScore: 20 },
    { id: 'st2', term: '1', component: 'ST2', maxScore: 20 },
    { id: 'te', term: '1', component: 'TE', maxScore: 20 }
  ],
  scores: { 'l1|ww1': 20, 'l1|pt1': 20, 'l1|st1': 20, 'l1|st2': 20, 'l1|te': 20 }
};
const ignored = context.computeTerm(scored, 'l1', '1');
assert.strictEqual(ignored.hasData, false, 'Grade 1 WW/PT scores must not create a term letter');
assert.strictEqual(ignored.termGrade, null);
assert.strictEqual(ignored.initialGrade, null);
context.paceSetRating(scored, 'l1', makabansa[0].id, '1', '', 'B');
const fromPace = context.computeTerm(scored, 'l1', '1');
assert.strictEqual(fromPace.termGrade, 'B');
assert.strictEqual(fromPace.hasData, true);
assert.strictEqual(fromPace.initialGrade, null);

const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
assert(html.includes('id="paceRatingPanel"'));
assert(html.includes('id="paceBookletPrint"'));
assert(html.includes('id="pacePrintBtn"'));
assert(html.includes('id="paceExportBtn"'));
assert(html.includes('Export Individual PACE Form'));
assert(html.includes('id="paceFormPrint"'));
assert(html.includes('pace-form-export.js'));
assert(html.includes('pace-catalog.js'));
assert(html.includes('css/pace-workspace.css'));
const ui = fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-ui.js'), 'utf8');
assert(ui.includes('printPaceBooklet'));
assert(ui.includes('paceExportBtn'));
assert(ui.includes('Name:'));
assert(ui.includes('T1'));
assert(ui.includes('T2'));
assert(ui.includes('T3'));
assert(ui.includes('paceSetSubject'));
assert(ui.includes('paceRateLearner'));
assert(ui.includes('aria-pressed'));
assert(ui.includes('paceHandleKeydown'));
const css = fs.readFileSync(path.join(__dirname, '../src/renderer/css/components.css'), 'utf8')
  + fs.readFileSync(path.join(__dirname, '../src/renderer/css/pace-workspace.css'), 'utf8');
assert(css.includes('--pace-live-fill: #c6f6d5'));
assert(css.includes('--pace-idle-fill: #e2e8f0'));
assert(css.includes('.pace-letter.is-active'));
assert(css.includes('.pace-letter-row--palette'));
assert(ui.includes('pace-letter-row--palette'));
assert(css.includes('.pace-roster-letters'));
assert(css.includes('text-transform: uppercase;'));
assert(ui.includes('paceCompetenciesFor(subject, term)'));
assert(ui.includes('type="checkbox"'));
assert(ui.includes('paceLetterTooltip'));
assert(!/function paceRateCurrent\(letter\) \{[\s\S]{0,400}paceNextCriterion\(\)/.test(ui));
assert(css.includes('#paceRatingPanel.pace-panel:not([hidden])'));
assert(css.includes('.pace-mode-toggle'));
assert(css.includes('.pace-subject-tab'));
assert(css.includes('[data-pace-subject="reading"]'));
assert(css.includes('.pace-form-preview-modal'));
assert(css.includes('#1e3a8a'));
assert(css.includes('#38bdf8'));
assert(css.includes('#16a34a'));
assert(css.includes('#92400e'));
assert(css.includes('#dc2626'));
assert(html.includes('id="newGrade1HomeroomNote"'));
assert(html.includes('id="newSubjectField"'));
const help = fs.readFileSync(path.join(__dirname, '../src/renderer/js/help.js'), 'utf8');
assert(help.includes("id: 'grade1_pace'"));
assert(help.includes('a. Words that label') || help.includes('subcompetencies'));
assert(help.includes('Listening'));
assert(help.includes('Export Individual PACE Form'));
const transfer = fs.readFileSync(path.join(__dirname, '../src/renderer/js/advisory-grade-transfer.js'), 'utf8');
assert(transfer.includes('isDescriptiveLetter'));
assert(transfer.includes('annexCRange'));
const companion = fs.readFileSync(path.join(__dirname, '../src/renderer/js/mobile-sync-companion.js'), 'utf8');
assert(companion.includes('paceRatings'));
assert(companion.includes("change.type === 'pace'"));
const preload = fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8');
assert(preload.includes('exportPaceForm'));
const androidModel = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/com/example/eclassrecordmobile/data/DataModel.kt'), 'utf8');
assert(androidModel.includes('paceRatings'));
assert(androidModel.includes('PaceCompetency'));
const androidUi = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/com/example/eclassrecordmobile/ui/PaceRatingScreen.kt'), 'utf8');
assert(androidUi.includes('Increment class'));
assert(androidUi.includes('Increment selected'));
assert(androidUi.includes('Individual'));
assert(androidUi.includes('palette = true'));
assert(androidUi.includes('idleFill'));
assert(androidUi.includes('Checkbox('));
assert(androidUi.includes('\"Clear\"'));
assert(androidUi.includes('competenciesForTerm'));
assert(androidUi.includes('subjectColor'));
assert(androidUi.includes('0xFF1E3A8A'));
assert(androidUi.includes('item.details.size > 1'));
assert(!androidUi.includes('item.skills.isNotEmpty()'));

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const homeroom = {
  id: 'class_grade1',
  gradeLevel: '1',
  section: 'A',
  subject: 'Grade 1',
  paceHomeroom: true,
  learners: [{ id: 'l1', lastName: 'Santos', firstName: 'Ana', name: 'SANTOS, ANA' }],
  assessments: [],
  scores: {}
};
const documentMock = {
  els: {},
  getElementById(id) {
    if (!this.els[id]) this.els[id] = { hidden: true, innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
    return this.els[id];
  },
  querySelector() { return null; },
  addEventListener() {}
};
const uiContext = {
  console,
  Math,
  esc: escHtml,
  db: { currentTerm: '1', schoolYear: '2026-2027', assignments: [homeroom], currentAssignmentId: homeroom.id },
  document: documentMock,
  currentAssignment: () => homeroom,
  saveDatabase() {},
  scheduleRecordTableRefresh() {},
  learnerDisplayName(learner) { return learner.name || [learner.lastName, learner.firstName].filter(Boolean).join(', '); }
};
uiContext.window = uiContext;
vm.createContext(uiContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-catalog.js'), 'utf8'), uiContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-engine.js'), 'utf8'), uiContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-form-export.js'), 'utf8'), uiContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-ui.js'), 'utf8'), uiContext);
uiContext.syncPaceWorkspace();
assert.strictEqual(uiContext.document.getElementById('paceExportBtn').hidden, false);
assert.strictEqual(uiContext.document.getElementById('pacePrintBtn').hidden, false);
assert.strictEqual(uiContext.document.getElementById('paceEvidenceBtn').hidden, false);
const paceHtml = uiContext.document.getElementById('paceRatingPanel').innerHTML;
assert(paceHtml.includes('paceRateLearner'), paceHtml.slice(0, 400));
assert(paceHtml.includes('Reading and Literacy'));
assert(paceHtml.includes('pace-letter-row--palette'));
assert(paceHtml.includes('pace-mode-toggle'));
assert(paceHtml.includes('pace-subject-tab'));
assert(paceHtml.includes('pace-shortcuts'));
assert(paceHtml.includes('pace-letter--tile'));
assert(paceHtml.includes('data-pace-subject="reading"'));
assert(paceHtml.includes('1. Chant rhymes'));
assert.strictEqual(
  uiContext.paceLiveSkills(uiContext.paceCompetenciesFor('Reading and Literacy', '1')[0]).join(','),
  'listen,speak'
);
assert(!paceHtml.includes('1.a Listening'));
const paceNav = String((paceHtml.split('aria-label="Criteria"')[1] || '').split('</nav>')[0] || paceHtml);
assert.strictEqual((paceNav.match(/paceJumpAssignment\('[^']+', 'rl-01'/g) || []).length, 1, 'competency 1 must have one jump target, not one per skill');
assert(paceNav.includes('&gt; Listening') || paceNav.includes('> Listening'));
assert(paceNav.includes('Speaking'));
assert(paceNav.includes('12. Identify words with different functions'));
assert(paceNav.includes('a. Words that label persons'));
assert(paceNav.includes('Copying and Guided Writing'));
assert(paceHtml.includes('20.a') || paceNav.includes('a. Note important details'));
uiContext.paceEnsureStore(homeroom).skillRatingMode = 'per-skill';
uiContext.renderPaceUi();
const perNav = String((uiContext.document.getElementById('paceRatingPanel').innerHTML.split('aria-label="Criteria"')[1] || '').split('</nav>')[0]);
assert.strictEqual((perNav.match(/paceJumpAssignment\('[^']+', 'rl-01'/g) || []).length, 2, 'per-skill item 1 has Listening and Speaking only');
assert.strictEqual((perNav.match(/pace-criterion-parent">1\. Chant rhymes/g) || []).length, 1);
uiContext.paceEnsureStore(homeroom).skillRatingMode = 'single-letter';
uiContext.renderPaceUi();
assert(paceHtml.includes('type="checkbox"'));
assert(!paceHtml.includes('is-na'));
uiContext.paceJumpAssignment(homeroom.id, 'rl-20', 0);
const storyHtml = uiContext.document.getElementById('paceRatingPanel').innerHTML;
assert(storyHtml.includes('20.a'));
assert(storyHtml.includes('Comprehend stories'));
assert(storyHtml.includes('Note important details in stories'));
uiContext.paceSetSubject('Mathematics');
const mathHtml = uiContext.document.getElementById('paceRatingPanel').innerHTML;
assert(mathHtml.includes('Count up to 100'), mathHtml.slice(0, 400));
assert(!mathHtml.includes('Order numbers up to 100 from smallest to largest'), 'Term 2 Math must stay hidden in Term 1');
assert(!mathHtml.includes('is-na'));
uiContext.paceSetSubject('Reading and Literacy');
const ratedItem = uiContext.paceCurrentItem(homeroom);
uiContext.paceSetRating(homeroom, 'l1', ratedItem.id, '1', uiContext.paceCurrentSkill(ratedItem), 'C');
uiContext.renderPaceUi();
assert(uiContext.document.getElementById('paceRatingPanel').innerHTML.includes('pace-letter--C is-active'));
uiContext.paceSetMode('individual');
const prevented = [];
uiContext.paceHandleKeydown({
  key: 'A',
  target: { tagName: 'BUTTON' },
  preventDefault() { prevented.push('A'); },
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
});
assert(prevented.includes('A'));
assert(uiContext.document.getElementById('paceRatingPanel').innerHTML.includes('pace-letter--A is-active'));
uiContext.paceSetRating(homeroom, 'l1', 'rl-01', '1', '', 'A');
const filename = uiContext.paceFormExportFilename(homeroom.learners[0], '1');
assert(filename.endsWith('Term 1.docx'));
assert(filename.includes('PACE Form Term '));
const values = uiContext.paceFormReplacements(homeroom, homeroom.learners[0], { schoolName: 'Monbon ES', schoolId: '114239' }, '1');
assert.strictEqual(values.school, 'Monbon ES');
assert.strictEqual(values.schoolID, '114239');
assert.strictEqual(values.term, 'TERM 1');
assert.strictEqual(values['001'], 'A');
assert.strictEqual(values['002'], 'A');
assert.strictEqual(
  uiContext.paceFormReplacements(homeroom, homeroom.learners[0], {}, '1').school,
  '',
  'empty settings stay empty'
);
homeroom.schoolName = 'Assignment School';
assert.strictEqual(
  uiContext.paceFormReplacements(homeroom, homeroom.learners[0], {}, '1').school,
  'Assignment School',
  'class school name fills the Individual PACE Form when Settings is empty'
);
delete homeroom.schoolName;
const preview = uiContext.paceFormPreviewMarkup(homeroom, homeroom.learners[0], { schoolName: 'Monbon ES', schoolId: '114239' }, '1');
assert(preview.includes('SANTOS, ANA'));
assert(preview.includes('Monbon ES'));
assert(preview.includes('<dt>School</dt>'));
assert(preview.includes('pace-form-sq is-listen'));
const second = { id: 'l2', name: 'REYES, BEN' };
homeroom.learners.push(second);
uiContext.paceSetRating(homeroom, 'l2', 'rl-01', '1', '', 'B');
const previewTwo = uiContext.paceFormPreviewMarkup(homeroom, second, { schoolName: 'Monbon ES', schoolId: '114239' }, '1');
assert(previewTwo.includes('REYES, BEN'));
assert.strictEqual(uiContext.paceFormReplacements(homeroom, second, { schoolName: 'Monbon ES' }, '1')['001'], 'B');
assert(uiContext.fillWordXml('<w:p><w:r><w:t>{name}</w:t></w:r></w:p>', { name: 'ANA' }).includes('ANA'));
const { fillPaceFormDocx, templatePath } = require('../src/main/pace-docx');
assert(fs.existsSync(templatePath()));
const filledDocx = fillPaceFormDocx(values);
const extractDir = path.join(__dirname, '../.tmp-pace-form-test');
fs.rmSync(extractDir, { recursive: true, force: true });
fs.mkdirSync(extractDir, { recursive: true });
const filledPath = path.join(extractDir, 'filled.docx');
fs.writeFileSync(filledPath, filledDocx);
require('child_process').execFileSync('tar', ['-xf', filledPath, '-C', extractDir]);
const filledXml = fs.readFileSync(path.join(extractDir, 'word', 'document.xml'), 'utf8');
assert(filledXml.includes('SANTOS, ANA') || filledXml.includes('SANTOS, ANA'.replace(/&/g, '&amp;')));
assert(filledXml.includes('Monbon ES'), 'Term 1 Individual PACE Form must print the school name');
assert(/<w:t[^>]*>School<\/w:t>/.test(filledXml), 'school field must be labeled on the Individual PACE Form');
assert(!filledXml.includes('{name}'));
assert(!filledXml.includes('{school}'));
assert(!filledXml.includes('{001}'));
const templateExtract = path.join(extractDir, 'template');
fs.mkdirSync(templateExtract, { recursive: true });
require('child_process').execFileSync('tar', ['-xf', templatePath(), '-C', templateExtract]);
const templateXml = fs.readFileSync(path.join(templateExtract, 'word', 'document.xml'), 'utf8');
assert(templateXml.includes('{school}'));
assert(/<w:t[^>]*>School<\/w:t>/.test(templateXml), 'Word template must include a School label');
fs.rmSync(extractDir, { recursive: true, force: true });
assert.strictEqual(uiContext.assignmentSubjectLabel(homeroom), 'All learning areas');
JSON.stringify(homeroom);
const emptyHomeroom = { ...homeroom, learners: [] };
uiContext.currentAssignment = () => emptyHomeroom;
uiContext.db.assignments = [emptyHomeroom];
uiContext.syncPaceWorkspace();
assert.doesNotThrow(() => JSON.stringify(emptyHomeroom));

vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/kinder-catalog.js'), 'utf8'), uiContext);
const kinderClass = {
  id: 'kinder-1',
  gradeLevel: 'Kindergarten',
  subject: 'Kindergarten',
  learners: [{ id: 'k1', name: 'Kim' }],
  assessments: [],
  scores: {}
};
uiContext.currentAssignment = () => kinderClass;
uiContext.db.assignments = [kinderClass];
uiContext.syncPaceWorkspace();
assert.strictEqual(uiContext.document.getElementById('paceExportBtn').hidden, true, 'PACE form export is Grade 1 only');
assert.strictEqual(uiContext.document.getElementById('pacePrintBtn').hidden, true, 'PACE booklet print is Grade 1 only');
assert.strictEqual(uiContext.document.getElementById('paceEvidenceBtn').hidden, true, 'PACE evidence toggle is Grade 1 only');
assert.ok(uiContext.isPaceAssignment(kinderClass));
assert.ok(!uiContext.isGrade1PaceAssignment(kinderClass));

const grade8 = {
  id: 'g8-english',
  gradeLevel: '8',
  subject: 'English',
  learners: [{ id: 's1', name: 'Sam' }],
  assessments: [],
  scores: {}
};
uiContext.currentAssignment = () => grade8;
uiContext.db.assignments = [grade8];
uiContext.syncPaceWorkspace();
assert.strictEqual(uiContext.document.getElementById('paceExportBtn').hidden, true, 'PACE form export stays off Grade 8');
assert.strictEqual(uiContext.document.getElementById('pacePrintBtn').hidden, true, 'PACE booklet print stays off Grade 8');
assert.strictEqual(uiContext.document.getElementById('paceEvidenceBtn').hidden, true, 'PACE evidence toggle stays off Grade 8');

const componentsCss = fs.readFileSync(path.join(__dirname, '../src/renderer/css/components.css'), 'utf8');
assert.match(componentsCss, /\.btn\[hidden\]/, 'hidden must beat .btn display so PACE actions stay off non-Grade-1 sheets');

const formExport = fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-form-export.js'), 'utf8');
assert(formExport.includes('getOfficialPaceFormHtml'));
assert(formExport.includes('syncOfficialPaceFormDom'));
assert(preload.includes('getOfficialPaceFormHtml'));
assert(css.includes('official-pace-form'));
assert(help.includes('exact official PACE sheet'));

console.log('PACE catalog, median, class-set, increment, undo, computeTerm, print, advisory, and Android tests passed.');
