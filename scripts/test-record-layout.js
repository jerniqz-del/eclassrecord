const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/record-table.js'), 'utf8');
const learnerGradesSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/learner-grades.js'), 'utf8');
const quickGradeSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/quick-grade.js'), 'utf8');
let domReady = null;
const assignment = { gradeLevel: '7', subject: 'Mathematics', learners: [] };
const context = {
  console,
  window: null,
  document: {
    readyState: 'loading',
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') domReady = callback; }
  },
  currentView: 'dashboard',
  currentMapehSubTab: 'music_arts',
  currentAssignment: () => assignment,
  isMapehSubject: () => false,
  isKeyStage2: value => {
    const grade = Number(value?.gradeLevel);
    return grade >= 4 && grade <= 6;
  },
  isAssessmentIncludedForAssignment: (value, assessment) => {
    if (value?.subjectGroup !== 'SHS_FIELD') return true;
    return !['ST1', 'ST2'].includes(assessment.component);
  },
  showEl() {},
  setView(view) { context.currentView = view; },
  requestAnimationFrame(callback) { callback(); },
  debounce(fn) { const wrapped = (...args) => fn(...args); wrapped.cancel = () => {}; return wrapped; },
  saveDatabase() {},
  number: value => Number.isFinite(Number(value)) ? Number(value) : 0,
  setTimeout,
  clearTimeout
};
context.window = context;

vm.createContext(context);
vm.runInContext(source, context, { filename: 'record-table.js' });

assert.strictEqual(context.usesExpandedRecordLayout({ gradeLevel: '1' }), false);
assert.strictEqual(context.usesExpandedRecordLayout({ gradeLevel: '4' }), true);
assert.strictEqual(context.usesExpandedRecordLayout({ gradeLevel: '7' }), true);
assert.strictEqual(context.usesExpandedRecordLayout({ gradeLevel: '12' }), true);
assert.strictEqual(context.assessmentHpsLimit({ assessments: [{ id: 'blank', maxScore: '' }] }, 'blank'), null,
  'blank HPS must leave score entry unrestricted');
assert.strictEqual(context.assessmentHpsLimit({ assessments: [{ id: 'limited', maxScore: '25' }] }, 'limited'), 25,
  'a populated HPS must become the score-entry ceiling');

const standardItems = [
  ...Array.from({ length: 5 }, (_, index) => ({ component: 'WW', maxScore: index + 10 })),
  ...Array.from({ length: 3 }, (_, index) => ({ component: 'PT', maxScore: index + 20 })),
  { component: 'ST1', maxScore: 30 },
  { component: 'ST2', maxScore: 30 },
  { component: 'TE', maxScore: 40 }
];
const standardGroups = Array.from(context.expandedAssessmentGroups(standardItems));
assert.deepStrictEqual(standardGroups.map(group => group.key), ['WW', 'PT', 'EX']);
assert.deepStrictEqual(standardGroups.map(group => group.endIndex), [4, 7, 10]);
assert.strictEqual(context.groupScoreMax(standardItems, standardGroups[2]), 100);

const legacyItems = [
  ...standardItems.slice(0, 5),
  ...Array.from({ length: 5 }, () => ({ component: 'PT', maxScore: 25 })),
  ...standardItems.slice(8)
];
const legacyGroups = Array.from(context.expandedAssessmentGroups(legacyItems));
assert.deepStrictEqual(legacyGroups.map(group => group.endIndex), [4, 9, 12], 'calculation columns must follow populated legacy PT4/PT5 columns');

const noExamGroups = Array.from(context.expandedAssessmentGroups(standardItems.slice(0, 8)));
assert.deepStrictEqual(noExamGroups.map(group => group.key), ['WW', 'PT']);

const fieldAssignment = {
  gradeLevel: '11',
  subjectGroup: 'SHS_FIELD',
  assessments: standardItems.map((item, index) => ({ ...item, id: `assessment-${index}`, term: '1' }))
};
const visibleFieldItems = Array.from(context.termAssessments(fieldAssignment, '1'));
assert.deepStrictEqual(
  visibleFieldItems.filter(item => ['ST1', 'ST2', 'TE'].includes(item.component)).map(item => item.component),
  ['TE'],
  'the record table must apply the central SHS examination-column filter'
);

const colGroup = context.recordColGroup({ gradeLevel: '11' }, standardItems);
assert.strictEqual((colGroup.match(/<col\b/g) || []).length, 26, 'expanded Grade 11 layout must include assessment, T/%/WS, identity, and grade columns');

assert.match(source, /function scheduleRecordTableRefresh\(\)[\s\S]*?requestAnimationFrame\(refresh\)/,
  'score updates must defer grid rebuilding until mouse focus has moved');
assert(source.includes('data-learner-id="${esc(learner.id)}"'),
  'score inputs must expose a stable learner key for focus restoration');
assert.match(source, /function updateScore\([\s\S]*?scheduleRecordTableRefresh\(\);[\s\S]*?renderFinalOnly\(\);/,
  'score updates must use the focus- and scroll-preserving grid refresh');
assert(source.includes('hpsLimit !== null && parseFloat(clean) > hpsLimit'),
  'the central score update must reject scores above a populated HPS');
assert(quickGradeSource.includes('if (!saveActiveScore()) return;'),
  'Quick Grade must not navigate away from a rejected score');
assert.match(
  quickGradeSource,
  /SA1.*ST1.*Summative Test 1[\s\S]*SA2.*ST2.*Summative Test 2/,
  'Quick Grade must distinguish Summative Test 1 from Summative Test 2');

assert.match(
  learnerGradesSource,
  /const options = \{[\s\S]*?includeHeader:\s*false,[\s\S]*?landscape:\s*false,/,
  'the individual learner PDF must disable the shared header because the report renders its own complete header'
);

console.log('Grades 4-12 expanded grading-sheet layout tests passed.');
