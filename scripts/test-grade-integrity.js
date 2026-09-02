const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = {
  console,
  Math,
  Date,
  Intl,
  db: { schoolYear: '2026-2027' },
  number: value => Number.isFinite(Number(value)) ? Number(value) : 0,
  crypto: { randomUUID: () => 'test-id' }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/grading.js'), 'utf8'), context);

// DO 15, s. 2026 paragraphs 48 and 50: the adjusted table applies in
// SY 2026-2027, including skills-heavy subjects; zero-based starts in 2027-2028.
assert.strictEqual(context.determinePolicy('10', 'Technology and Livelihood Education (TLE)', '2026-2027'), 'DO15_TRANSITION');
assert.strictEqual(context.determinePolicy('11', 'Work Immersion', '2026-2027'), 'DO15_TRANSITION');
assert.strictEqual(context.determinePolicy('10', 'Technology and Livelihood Education (TLE)', '2027-2028'), 'DO15_ZERO');

// Check both ends of every official adjusted-transmutation interval. Computed
// values between printed hundredth boundaries must round before lookup.
const officialTable = [
  [99.50, 100.00, 100], [98.32, 99.49, 99], [97.14, 98.31, 98], [95.96, 97.13, 97],
  [94.78, 95.95, 96], [93.60, 94.77, 95], [92.42, 93.59, 94], [91.24, 92.41, 93],
  [90.06, 91.23, 92], [88.88, 90.05, 91], [87.70, 88.87, 90], [86.52, 87.69, 89],
  [85.34, 86.51, 88], [84.16, 85.33, 87], [82.98, 84.15, 86], [81.80, 82.97, 85],
  [80.62, 81.79, 84], [79.44, 80.61, 83], [78.26, 79.43, 82], [77.08, 78.25, 81],
  [75.90, 77.07, 80], [74.72, 75.89, 79], [73.54, 74.71, 78], [72.36, 73.53, 77],
  [71.18, 72.35, 76], [70.00, 71.17, 75], [65.34, 69.99, 74], [60.67, 65.33, 73],
  [56.01, 60.66, 72], [51.34, 56.00, 71], [46.67, 51.33, 70], [42.01, 46.66, 69],
  [37.34, 42.00, 68], [32.68, 37.33, 67], [28.01, 32.67, 66], [23.35, 28.00, 65],
  [18.68, 23.34, 64], [14.01, 18.67, 63], [9.35, 14.00, 62], [4.68, 9.34, 61],
  [0.00, 4.67, 60]
];
const transitionAssignment = {
  gradeLevel: '10', subject: 'Technology and Livelihood Education (TLE)',
  schoolYear: '2026-2027', policy: 'DO15_ZERO'
};
officialTable.forEach(([lower, upper, expected]) => {
  assert.strictEqual(context.transmute(transitionAssignment, lower), expected, `lower boundary ${lower}`);
  assert.strictEqual(context.transmute(transitionAssignment, upper), expected, `upper boundary ${upper}`);
});
assert.strictEqual(context.transmute(transitionAssignment, 91.235), 93, 'computed IGs must round to the displayed hundredth before table lookup');

// De-identified score rows transcribed from the supplied v1.9.5 Grade 10 TLE
// PDF. Recompute every visible raw total, percentage/weighted score, IG, and TG.
const rows = [
  [[15,10,24,15,20], [100,100,300], [35,40,35], 94.53, 95],
  [[20,10,22,17,20], [95,95,300], [30,24,35], 91.24, 93],
  [[20,10,24,15,20], [100,100,297], [30,36,35], 93.88, 95],
  [[20,10,24,15,20], [95,95,298], [36,38,35], 94.00, 95],
  [[20,10,24,17,20], [90,100,297], [30,31,35], 92.35, 93],
  [[20,10,23,16,20], [100,100,297], [32,39,35], 94.63, 95],
  [[20,10,23,11,20], [90,85,298], [22,24,35], 86.94, 89],
  [[13,10,10,12,20], [90,95,290], [21,20,35], 82.43, 85],
  [[20,10,24,16,20], [100,90,295], [32,28,35], 91.75, 93],
  [[14,10,23,11,20], [95,95,295], [28,21,35], 87.57, 89],
  [[20,10,10,12,20], [95,95,293], [20,26,35], 85.62, 88],
  [[20,10,23,8,20], [95,95,294], [20,13,35], 85.68, 88],
  [[20,10,10,13,20], [95,95,296], [20,20,35], 85.29, 87],
  [[20,10,15,17,20], [100,95,300], [31,40,35], 92.91, 94],
  [[20,10,15,19,20], [100,95,300], [33,33,35], 92.58, 94],
  [[20,10,23,11,20], [95,90,296], [29,27,35], 89.40, 91],
  [[20,10,23,15,20], [95,90,298], [34,35,35], 92.44, 94],
  [[20,10,23,16,20], [95,90,298], [27,29,35], 90.70, 92]
];
const assessments = [
  ...[20,10,25,20,20].map((maxScore, index) => ({ id: `ww-${index}`, term: '1', component: 'WW', maxScore })),
  ...[100,100,300].map((maxScore, index) => ({ id: `pt-${index}`, term: '1', component: 'PT', maxScore })),
  { id: 'st1', term: '1', component: 'ST1', maxScore: 40 },
  { id: 'st2', term: '1', component: 'ST2', maxScore: 40 },
  { id: 'te', term: '1', component: 'TE', maxScore: 50 }
];
const assignment = {
  ...transitionAssignment,
  subjectGroup: 'SKILLS_20_60_20',
  learners: rows.map((_, index) => ({ id: `learner-${index}` })),
  assessments,
  scores: {}
};
rows.forEach(([ww, pt, exam], rowIndex) => {
  const learnerId = `learner-${rowIndex}`;
  [...ww, ...pt, ...exam].forEach((score, scoreIndex) => {
    assignment.scores[`${learnerId}|${assessments[scoreIndex].id}`] = score;
  });
});
rows.forEach(([, , , displayedIg, expectedTg], rowIndex) => {
  const result = context.computeTerm(assignment, `learner-${rowIndex}`, '1');
  assert.strictEqual(Number(result.initialGrade.toFixed(2)), displayedIg, `row ${rowIndex + 1} IG`);
  assert.strictEqual(result.termGrade, expectedTg, `row ${rowIndex + 1} TG`);
});

// Grade 3 does not offer MAPEH as a class load and does not create its split
// Music & Arts / PE & Health subjects in Advisory Class.
assert(!context.getSubjectsForGrade('3').some(subject => /MAPEH|MUSIC|PHYSICAL EDUCATION|PE & HEALTH/i.test(subject)));
const AdvisoryData = require(path.join(root, 'src/renderer/js/advisory-data.js'));
global.AdvisoryData = AdvisoryData;
global.getSubjectsForGrade = grade => Array.from(context.getSubjectsForGrade(grade));
const advisoryTransfer = require(path.join(root, 'src/renderer/js/advisory-grade-transfer.js'));
assert.deepStrictEqual(
  advisoryTransfer.standardSubjectsForGrade('3'),
  ['Filipino', 'English', 'Mathematics', 'Science', 'Makabansa', 'Good Manners and Right Conduct (GMRC)'],
  'Grade 3 Advisory Class must not create MAPEH transfer components'
);

// Existing Grade 3 records are hidden safely by archiving obsolete MAPEH
// subjects while preserving their historical grades.
const grade3Profile = { schoolYear: '2026-2027', assignments: [] };
AdvisoryData.normalizeAdvisoryData(grade3Profile);
const grade3Class = AdvisoryData.createClass(grade3Profile, {
  id: 'grade-3-advisory', schoolYear: '2026-2027', gradeLevel: '3', section: 'A', adviserName: 'Test Adviser', isActive: true
});
const grade3Learner = AdvisoryData.createLearner(grade3Profile, {
  id: 'grade-3-learner', advisoryClassId: grade3Class.id, lrn: '123456789012', lastName: 'Learner', firstName: 'Test'
});
const obsoleteNames = ['MAPEH', 'Music & Arts', 'PE & Health'];
const obsoleteSubjects = obsoleteNames.map((subjectName, index) => AdvisoryData.createSubject(grade3Profile, {
  id: `grade-3-obsolete-${index}`,
  advisoryClassId: grade3Class.id,
  subjectName,
  normalizedSubjectKey: subjectName,
  displayOrder: index
}));
AdvisoryData.createGrade(grade3Profile, {
  id: 'grade-3-historical-grade', advisoryClassId: grade3Class.id,
  advisoryLearnerId: grade3Learner.id, advisorySubjectId: obsoleteSubjects[0].id,
  schoolYear: '2026-2027', learnerLrn: grade3Learner.lrn,
  subjectName: 'MAPEH', normalizedSubjectKey: 'MAPEH', term: '1', finalGrade: 90
});
advisoryTransfer.ensureGradeLevelSubjects(grade3Profile, grade3Class);
const reconciledStore = AdvisoryData.normalizeAdvisoryData(grade3Profile);
assert(obsoleteSubjects.every(({ id }) => reconciledStore.subjects.find(subject => subject.id === id)?.isArchived));
assert.strictEqual(reconciledStore.grades.find(grade => grade.id === 'grade-3-historical-grade')?.finalGrade, 90);
assert(!reconciledStore.subjects.some(subject => subject.advisoryClassId === grade3Class.id
  && !subject.isArchived && /MAPEH|MUSIC ARTS|PE HEALTH/.test(subject.normalizedSubjectKey)));
delete global.getSubjectsForGrade;
delete global.AdvisoryData;

const recordSource = fs.readFileSync(path.join(root, 'src/renderer/js/record-table.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
assert.match(recordSource, /:\s*computeTerm\(a, learner\.id, term, mapePart\)/, 'the grading sheet must render the authoritative calculation');
assert.match(mainSource, /mainWindow\.webContents\.printToPDF\(printOptions\)/, 'PDF export must print the rendered grading sheet rather than recalculate grades');

console.log('Grade 3 subject removal and DO 15 grading-sheet/PDF integrity tests passed.');
