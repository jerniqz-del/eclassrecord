const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/record-table.js'), 'utf8');
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

console.log('Grades 4-12 expanded grading-sheet layout tests passed.');
