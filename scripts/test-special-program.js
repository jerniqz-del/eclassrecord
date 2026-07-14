const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/grading.js'), 'utf8'), context);

assert.deepStrictEqual(Array.from(context.normalizeSpecialProgramWeights([0, 70, 30])), [0, 70, 30]);
assert.strictEqual(context.normalizeSpecialProgramWeights([20, 50, 29]), null);
assert.strictEqual(context.normalizeSpecialProgramWeights([20.5, 49.5, 30]), null);
assert.strictEqual(context.normalizeSpecialProgramWeights([-1, 71, 30]), null);
assert.deepStrictEqual(Array.from(context.weightsForAssignment({ subjectGroup: 'KS2_TRIMESTER' })), [20, 50, 30]);
assert.deepStrictEqual(Array.from(context.weightsForAssignment({
  subjectGroup: 'KS2_TRIMESTER', isSpecialProgramSubject: true, specialProgramWeights: [10, 70, 20]
})), [10, 70, 20]);
assert.deepStrictEqual(Array.from(context.weightsForAssignment({
  subjectGroup: 'KS2_TRIMESTER', isSpecialProgramSubject: true, specialProgramWeights: [10, 70, 19]
})), [20, 50, 30], 'invalid custom weights must safely fall back to the subject preset');

const learnerId = 'learner-1';
const components = [
  ['ww', 'WW', 80], ['pt', 'PT', 90], ['st1', 'ST1', 70], ['st2', 'ST2', 80], ['te', 'TE', 90]
];
const assignment = {
  gradeLevel: '4', subject: 'Campus Journalism', subjectGroup: 'KS2_TRIMESTER',
  policy: 'DO15_ZERO', schoolYear: '2026-2027', learners: [{ id: learnerId }],
  assessments: components.map(([id, component]) => ({ id, component, term: '1', maxScore: 100 })),
  scores: Object.fromEntries(components.map(([id, , score]) => [`${learnerId}|${id}`, score]))
};
const standard = context.computeTerm(assignment, learnerId, '1');
assert(Math.abs(standard.initialGrade - 85.3) < 0.0001, `expected 85.3, received ${standard.initialGrade}`);
assignment.isSpecialProgramSubject = true;
assignment.specialProgramWeights = [10, 70, 20];
const special = context.computeTerm(assignment, learnerId, '1');
assert(Math.abs(special.examPS - 81) < 0.0001, 'ST1/ST2/TE must keep the internal 30/30/40 split');
assert(Math.abs(special.initialGrade - 87.2) < 0.0001);
assert.strictEqual(assignment.scores[`${learnerId}|ww`], 80, 'recalculation must not change raw scores');

const databaseSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/database.js'), 'utf8');
const exportSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/import-export.js'), 'utf8');
const recordSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/record-table.js'), 'utf8');
const learnerSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/learner-grades.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/advisory-dashboard.js'), 'utf8');
const transferSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/advisory-grade-transfer.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
assert(databaseSource.includes('a.specialProgramWeights = custom || weightsFor(a.subjectGroup);'));
assert(!/weightsFor\(a\.subjectGroup\)/.test([exportSource, recordSource, learnerSource].join('\n')), 'all assignment views and exports must use the authoritative resolver');
assert(dashboardSource.includes('advisoryIsSpecialClass'));
assert(dashboardSource.includes('advisorySpecialProgramName'));
assert(dashboardSource.includes('advisorySpecialSubject1'));
assert(dashboardSource.includes('Enter the Special Program Name and at least one special subject.'));
assert(transferSource.includes('Manage Special Subjects'));
assert(transferSource.includes('Archived Special Subjects'));
assert(!transferSource.includes('Add Other Subject'));
assert(htmlSource.includes('newSpecialProgramSubject'));
assert(htmlSource.indexOf('js/special-program.js') > htmlSource.indexOf('js/app.js'), 'the unobfuscated form enhancement must load after the legacy bundle');

console.log('Special-program grading weights and persistence tests passed.');
