const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let idCounter = 0;
const context = {
  console,
  Math,
  Date,
  Intl,
  db: { schoolYear: '2026-2027' },
  number: value => Number.isFinite(Number(value)) ? Number(value) : 0,
  uid: prefix => `${prefix}-${++idCounter}`,
  crypto: { randomUUID: () => `test-id-${++idCounter}` }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/grading.js'), 'utf8'), context);

assert.deepStrictEqual(Array.from(context.getSubjectsForGrade('11')).slice(0, 5), [
  'Effective Communication',
  'Mabisang Komunikasyon',
  'General Mathematics',
  'General Science',
  'Life and Career Skills'
]);
assert(context.getSubjectsForGrade('11').includes('Pag-aaral ng Kasaysayan at Lipunang Pilipino'));
assert(context.getSubjectsForGrade('11').includes('Computer Programming (Java)'));
assert(context.getSubjectsForGrade('11').includes('Barbering Services'));
assert(context.getSubjectsForGrade('11').includes('Wellness Services (Hilot / Massage)'));
assert.strictEqual(context.resolveShsCurriculum('11', '2026-2027'), 'SSHS');
assert.strictEqual(context.resolveShsCurriculum('12', '2026-2027'), 'K12_2016');
assert.strictEqual(context.resolveShsCurriculum('12', '2026-2027', 'SSHS'), 'SSHS');
assert.strictEqual(context.resolveShsCurriculum('12', '2027-2028'), 'SSHS');
assert(context.getSubjectsForGrade('12').includes('Oral Communication'), 'Grade 12 SY 2026-2027 defaults to the 2016 SHS catalog');
assert(context.getSubjectsForGrade('12').includes('Practical Research 1'));
assert(!context.getSubjectsForGrade('12').includes('Research 2'), 'SSHS-only Grade 12 subjects must not appear in the default 2016 catalog');
assert(context.getSubjectsForGrade('12', { curriculum: 'SSHS' }).includes('Creative Production and Presentation'));
assert(context.getSubjectsForGrade('12', { curriculum: 'SSHS' }).includes('Research 2'));
assert(!context.getSubjectsForGrade('11').includes('Research 2'), 'new Grade 12 subjects must not appear in the Grade 11 list');
assert.strictEqual(context.seniorHighSubjectGroupForSubject('Computer Programming (Java)', 'SSHS'), 'SHS_TECHPRO');
assert.strictEqual(context.seniorHighSubjectGroupForSubject('Creative Production and Presentation', 'SSHS'), 'SHS_FIELD');
assert.strictEqual(context.seniorHighSubjectGroupForSubject('Research 1', 'SSHS'), 'SHS_RESEARCH');
assert.strictEqual(context.seniorHighSubjectGroupForSubject('Oral Communication', 'K12_2016'), 'SHS2016_CORE');
assert.strictEqual(context.seniorHighSubjectGroupForSubject('Practical Research 1', 'K12_2016'), 'SHS2016_ACADEMIC');
assert.strictEqual(context.seniorHighSubjectGroupForSubject('Cookery', 'K12_2016'), 'SHS2016_TVL');
assert.strictEqual(context.determineSubjectGroup('11', 'Computer Programming (Java)'), 'SHS_TECHPRO');
assert.strictEqual(context.determineSubjectGroup('12', 'Creative Production and Presentation', null, null, 'SSHS'), 'SHS_FIELD');
assert.strictEqual(context.determineSubjectGroup('11', 'General Mathematics'), 'SHS_CORE');
assert.strictEqual(context.determineSubjectGroup('12', 'Oral Communication'), 'SHS2016_CORE');
assert.strictEqual(context.determineSubjectGroup('12', 'Practical Research 2'), 'SHS2016_ACADEMIC');
assert.strictEqual(context.determineSubjectGroup('12', 'Inquiries, Investigations and Immersion'), 'SHS2016_WORK_ACADEMIC');
assert.strictEqual(context.determineSubjectGroup('12', 'Work Immersion'), 'SHS2016_WORK_TVL');
assert.strictEqual(context.determineSubjectGroup('12', 'Cookery'), 'SHS2016_TVL');
assert.strictEqual(context.determineSubjectGroup('11', 'Physics 1'), 'SHS_ACADEMIC');
assert.strictEqual(context.determineSubjectGroup('11', 'Human Movement 1'), 'SHS_ARTS');
assert.strictEqual(context.determineSubjectGroup('12', 'Field Experience / Exposure', null, null, 'SSHS'), 'SHS_FIELD');
assert.strictEqual(context.determineSubjectGroup('11', 'Arts Apprenticeship'), 'SHS_FIELD');
assert.strictEqual(context.determineSubjectGroup('11', 'Creative Production and Innovation'), 'SHS_FIELD');
assert.strictEqual(context.determineSubjectGroup('11', 'Research, Design and Innovation'), 'SHS_RESEARCH');
assert.strictEqual(context.determineSubjectGroup('12', 'Work Immersion', null, null, 'SSHS'), 'SHS_WORK');
assert.strictEqual(context.determineSubjectGroup('11', 'Computer Programming NC II'), 'SHS_TECHPRO');
assert.strictEqual(context.determineSubjectGroup('11', 'School-specific elective', null, 'SHS_TECHPRO'), 'SHS_TECHPRO');

assert.strictEqual(
  context.inferShsCurriculum({ gradeLevel: '12', schoolYear: '2026-2027', subject: 'Research 2' }),
  'SSHS',
  'existing unique SSHS Grade 12 subjects must stay on Strengthened SHS'
);
assert.strictEqual(
  context.inferShsCurriculum({ gradeLevel: '12', schoolYear: '2026-2027', subject: 'General Mathematics', subjectGroup: 'SHS_CORE' }),
  'SSHS',
  'existing Grade 12 loads with SSHS groups must keep Strengthened SHS weights'
);
assert.strictEqual(
  context.inferShsCurriculum({ gradeLevel: '12', schoolYear: '2026-2027', subject: 'Oral Communication' }),
  'K12_2016'
);

const expectedWeights = {
  SHS_CORE: [20, 50, 30],
  SHS_ACADEMIC: [20, 50, 30],
  SHS_ARTS: [20, 60, 20],
  SHS_FIELD: [15, 70, 15],
  SHS_RESEARCH: [40, 60, 0],
  SHS_TECHPRO: [15, 65, 20],
  SHS_WORK: [20, 80, 0],
  SHS2016_CORE: [25, 50, 25],
  SHS2016_ACADEMIC: [25, 45, 30],
  SHS2016_TVL: [20, 60, 20],
  SHS2016_WORK_ACADEMIC: [35, 40, 25],
  SHS2016_WORK_TVL: [20, 60, 20]
};
Object.entries(expectedWeights).forEach(([group, weights]) => {
  assert.deepStrictEqual(Array.from(context.weightsFor(group)), weights, `${group} weights must match the strengthened-SHS policy`);
});

const examinationRules = {
  SHS_CORE: ['ST1', 'ST2', 'TE'],
  SHS_ACADEMIC: ['ST1', 'ST2', 'TE'],
  SHS_ARTS: ['ST1', 'ST2', 'TE'],
  SHS_FIELD: ['TE'],
  SHS_RESEARCH: [],
  SHS_TECHPRO: ['ST1', 'ST2', 'TE'],
  SHS_WORK: []
};
Object.entries(examinationRules).forEach(([group, components]) => {
  const assignment = { gradeLevel: '11', subjectGroup: group };
  assert.deepStrictEqual(
    Array.from(context.examinationComponentsForAssignment(assignment)),
    components,
    `${group} must use the mandated examination components`
  );
});
assert.deepStrictEqual(
  Array.from(context.examinationComponentsForAssignment({ gradeLevel: '10', subjectGroup: 'REGULAR' })),
  ['ST1', 'ST2', 'TE'],
  'the special examination rules must remain isolated to Grades 11-12'
);
assert.deepStrictEqual(
  Array.from(context.examinationComponentsForAssignment({
    gradeLevel: '12', schoolYear: '2026-2027', shsCurriculum: 'K12_2016', subjectGroup: 'SHS2016_CORE'
  })),
  ['ST1', 'ST2', 'TE'],
  '2016 Grade 12 classes keep the full examination bucket'
);
assert.deepStrictEqual(
  Array.from(context.seniorHighSubjectGroupOptions('K12_2016').map(item => item.value)),
  ['SHS2016_CORE', 'SHS2016_ACADEMIC', 'SHS2016_TVL', 'SHS2016_WORK_ACADEMIC', 'SHS2016_WORK_TVL']
);

function gradingAssignment(group, scores = {}) {
  return {
    gradeLevel: '11',
    subjectGroup: group,
    policy: 'DO15_ZERO',
    schoolYear: '2026-2027',
    learners: [{ id: 'learner-1' }],
    assessments: [
      { id: 'ww', term: '1', component: 'WW', maxScore: 100 },
      { id: 'pt', term: '1', component: 'PT', maxScore: 100 },
      { id: 'st1', term: '1', component: 'ST1', maxScore: 100 },
      { id: 'st2', term: '1', component: 'ST2', maxScore: 100 },
      { id: 'te', term: '1', component: 'TE', maxScore: 100 }
    ],
    scores: Object.fromEntries(Object.entries(scores).map(([id, value]) => [`learner-1|${id}`, value]))
  };
}

const allScores = { ww: 80, pt: 90, st1: 70, st2: 80, te: 100 };
const regularResult = context.computeTerm(gradingAssignment('SHS_CORE', allScores), 'learner-1', '1');
assert.strictEqual(regularResult.examPS, 85, 'other SHS subjects must combine ST1 30%, ST2 30%, and TE 40%');

const core2016 = context.computeTerm(gradingAssignment('SHS2016_CORE', allScores), 'learner-1', '1');
assert.strictEqual(core2016.examPS, 85);
assert.strictEqual(core2016.initialGrade, 86.25, '2016 core subjects must use 25% WW, 50% PT, and 25% examination');

const fieldResult = context.computeTerm(gradingAssignment('SHS_FIELD', allScores), 'learner-1', '1');
assert.strictEqual(fieldResult.examPS, 100, 'field/apprenticeship/creative subjects must use TE as the whole examination score');
assert.strictEqual(fieldResult.initialGrade, 90, 'field subject IG must apply 15% WW, 70% PT, and 15% TE');

['SHS_RESEARCH', 'SHS_WORK'].forEach(group => {
  const result = context.computeTerm(gradingAssignment(group, allScores), 'learner-1', '1');
  assert.strictEqual(result.examPS, 0, `${group} must have no examination contribution`);
});

const hiddenExamOnly = context.computeTerm(
  gradingAssignment('SHS_RESEARCH', { st1: 90, st2: 90, te: 90 }),
  'learner-1',
  '1'
);
assert.strictEqual(hiddenExamOnly.hasData, false, 'hidden legacy examination scores must not make a no-exam term appear graded');
assert.strictEqual(hiddenExamOnly.termGrade, null);
assert.strictEqual(
  context.isAssessmentIncludedForAssignment({ gradeLevel: '11', subjectGroup: 'SHS_FIELD' }, { component: 'ST1' }),
  false
);
assert.strictEqual(
  context.isAssessmentIncludedForAssignment({ gradeLevel: '11', subjectGroup: 'SHS_FIELD' }, { component: 'TE' }),
  true
);

function componentCount(template, component) {
  return Array.from(template).filter(item => item.component === component).length;
}

['4', '7', '10', '11', '12'].forEach(grade => {
  const template = context.templateForGrade(grade);
  assert.strictEqual(componentCount(template, 'WW'), 5, `Grade ${grade} must provide the DO 15 upper-range preset of 5 WWs`);
  assert.strictEqual(componentCount(template, 'PT'), 3, `Grade ${grade} must provide the DO 15 upper-range preset of 3 PTs`);
});

assert.strictEqual(componentCount(context.templateForGrade('1'), 'WW'), 4, 'Grades 1-3 remain teacher-discretionary');
assert.strictEqual(componentCount(context.templateForGrade('1'), 'PT'), 4, 'Grades 1-3 remain teacher-discretionary');

const freshSeniorHigh = { gradeLevel: '11', subject: 'General Mathematics', assessments: [], scores: {} };
context.seedTemplateAssessments(freshSeniorHigh, context.templateForGrade('11'));
for (let term = 1; term <= 3; term++) {
  const termAssessments = freshSeniorHigh.assessments.filter(item => item.term === String(term));
  assert.strictEqual(termAssessments.filter(item => item.component === 'WW').length, 5);
  assert.strictEqual(termAssessments.filter(item => item.component === 'PT').length, 3);
}

const legacySeniorHigh = {
  gradeLevel: '11',
  subject: 'General Mathematics',
  assessments: [1, 2, 3, 4, 5].map(index => ({
    id: `legacy-pt-${index}`,
    term: '1',
    component: 'PT',
    title: `PT ${index}`,
    maxScore: index === 5 ? 100 : ''
  })),
  scores: { 'learner-1|legacy-pt-5': 88 }
};
context.ensureTemplateAssessments(legacySeniorHigh);
assert.strictEqual(
  legacySeniorHigh.assessments.filter(item => item.term === '1' && item.component === 'PT').length,
  5,
  'populated legacy PT4/PT5 columns must remain visible'
);
assert.strictEqual(legacySeniorHigh.scores['learner-1|legacy-pt-5'], 88, 'legacy scores must not be changed');
assert(legacySeniorHigh.assessments.some(item => item.id === 'legacy-pt-5'), 'the populated legacy assessment must be retained');

const htmlSource = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const helpSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/help.js'), 'utf8');
assert(helpSource.includes("id: 'deped_order_17'"), 'Help must document DepEd Order No. 017 s. 2026');
const databaseSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/database.js'), 'utf8');
const specialProgramSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/special-program.js'), 'utf8');
const printCss = fs.readFileSync(path.join(__dirname, '../src/renderer/css/print.css'), 'utf8');
assert(htmlSource.includes('<option>11</option><option>12</option>'));
assert(htmlSource.includes('id="newSeniorHighSubjectGroup"'));
assert(htmlSource.includes('id="newShsPilotCurriculum"'));
assert(htmlSource.includes('This Grade 12 class uses Strengthened SHS (pilot school)'));
assert(databaseSource.includes('[1,2,3,4,5,6,7,8,9,10,11,12]'));
assert(databaseSource.includes('a.shsCurriculum = inferShsCurriculum(a)'));
assert(specialProgramSource.includes('selectedNewShsCurriculum'));
assert(specialProgramSource.includes("document.createElement('optgroup')"), 'Add Class Load must group the official SHS subject catalog');
assert(specialProgramSource.includes('option.dataset.shsGroup = category.group'), 'subject choices must carry their grading category');
assert(printCss.includes('@page eclass-pdf-with-header'), 'PDF exports must reserve space for the repeating metadata header');
assert(printCss.includes('body.pdf-export-mode'), 'the larger PDF margin must remain scoped to PDF export mode');

console.log('Senior-high class setup and grading preset tests passed.');
