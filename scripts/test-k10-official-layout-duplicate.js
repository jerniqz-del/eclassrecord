'use strict';

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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pace-engine.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/grading.js'), 'utf8'), context);

function fillPooledTerm(assignment, learnerId, term) {
  assignment.assessments.filter(item => String(item.term) === String(term) && item.component === 'WW').forEach((item, index) => {
    item.maxScore = 10;
    assignment.scores[`${learnerId}|${item.id}`] = index === 0 ? 10 : 8;
  });
  assignment.assessments.filter(item => String(item.term) === String(term) && item.component === 'PT').forEach(item => {
    item.maxScore = 10;
    assignment.scores[`${learnerId}|${item.id}`] = 9;
  });
  ['ST1', 'ST2', 'TE'].forEach(component => {
    const item = assignment.assessments.find(entry => String(entry.term) === String(term) && entry.component === component);
    item.maxScore = 10;
    assignment.scores[`${learnerId}|${item.id}`] = 8;
  });
}

function fillDomainTerm(assignment, learnerId, term, behavioralScore) {
  assignment.assessments.filter(item => String(item.term) === String(term) && item.component === 'WW').forEach(item => {
    item.maxScore = 10;
    assignment.scores[`${learnerId}|${item.id}`] = 10;
  });
  assignment.assessments.filter(item => String(item.term) === String(term) && item.component === 'PT').forEach(item => {
    item.maxScore = 10;
    assignment.scores[`${learnerId}|${item.id}`] = item.domain === 'behavioral' ? behavioralScore : 10;
  });
  ['ST1', 'ST2', 'TE'].forEach(component => {
    const item = assignment.assessments.find(entry => String(entry.term) === String(term) && entry.component === component);
    item.maxScore = 10;
    assignment.scores[`${learnerId}|${item.id}`] = 10;
  });
}

function fillTlePart(assignment, learnerId, term, part, score, maxScore) {
  assignment.assessments.filter(item => String(item.term) === String(term) && item.mapePart === part).forEach(item => {
    item.maxScore = maxScore;
    assignment.scores[`${learnerId}|${item.id}`] = score;
  });
}

const gmrc = {
  id: 'gmrc-old',
  gradeLevel: '8',
  section: 'Ruby',
  subject: 'Good Manners and Right Conduct (GMRC)',
  subjectGroup: 'CORE_20_50_30',
  policy: 'DO15_TRANSITION',
  schoolYear: '2026-2027',
  scoringModel: 'pooled-ww-pt',
  learners: [{ id: 'learner-1', name: 'Santos, Ana', lastName: 'Santos', firstName: 'Ana', sex: 'F' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(gmrc, context.templateForGrade('8'));
fillPooledTerm(gmrc, 'learner-1', '1');
const gmrcTerm1 = context.computeTerm(gmrc, 'learner-1', '1');
assert.ok(gmrcTerm1.hasData);
assert.strictEqual(typeof gmrcTerm1.termGrade, 'number');
const gmrcSourceScores = JSON.stringify(gmrc.scores);
const gmrcSourceAssessmentCount = gmrc.assessments.length;

assert.strictEqual(context.canDuplicateToOfficialSheet(gmrc), true);
assert.strictEqual(context.canDuplicateToOfficialSheet({ gradeLevel: '8', subject: 'English', scoringModel: 'pooled-ww-pt' }), false);
assert.strictEqual(context.canDuplicateToOfficialSheet({
  gradeLevel: '8',
  subject: 'Values Education',
  scoringModel: 'gmrc-domains-2026'
}), false);
assert.strictEqual(context.canDuplicateToOfficialSheet({
  gradeLevel: '1',
  subject: 'Good Manners and Right Conduct (GMRC)',
  scoringModel: 'pooled-ww-pt'
}), false);

const gmrcCopy = context.duplicateAssignmentToOfficialSheet(gmrc);
assert.ok(gmrcCopy);
assert.notStrictEqual(gmrcCopy.id, gmrc.id);
assert.strictEqual(gmrcCopy.section, 'Ruby');
assert.strictEqual(gmrcCopy.subject, gmrc.subject);
assert.strictEqual(gmrcCopy.term1GradeOnly, true);
assert.strictEqual(gmrcCopy.scoringModel, 'gmrc-domains-2026');
assert.ok(context.usesGmrcDomainScoring(gmrcCopy));
assert.ok(context.usesTermGradeOnly(gmrcCopy, '1'));
assert.ok(!context.usesTermGradeOnly(gmrcCopy, '2'));
assert.strictEqual(gmrcCopy.learners.length, 1);
assert.notStrictEqual(gmrcCopy.learners[0].id, 'learner-1');
assert.strictEqual(gmrcCopy.learners[0].firstName, 'Ana');
assert.strictEqual(gmrcCopy.learners[0].transferredInGrades['1'], gmrcTerm1.termGrade);
assert.strictEqual(Object.keys(gmrcCopy.scores || {}).length, 0);
assert.ok(gmrcCopy.assessments.some(item => item.term === '2' && item.domain === 'behavioral'));
assert.ok(gmrcCopy.assessments.some(item => item.term === '1' && item.domain === 'cognitive'));

assert.strictEqual(JSON.stringify(gmrc.scores), gmrcSourceScores, 'original GMRC scores must stay');
assert.strictEqual(gmrc.assessments.length, gmrcSourceAssessmentCount);
assert.strictEqual(gmrc.scoringModel, 'pooled-ww-pt');
assert.strictEqual(gmrc.learners[0].id, 'learner-1');

const copiedTerm1 = context.computeTerm(gmrcCopy, gmrcCopy.learners[0].id, '1');
assert.strictEqual(copiedTerm1.termGrade, gmrcTerm1.termGrade);
assert.strictEqual(copiedTerm1.isTransferredIn, true);
assert.strictEqual(copiedTerm1.hasData, true);

fillDomainTerm(gmrcCopy, gmrcCopy.learners[0].id, '2', 0);
const copiedTerm2 = context.computeTerm(gmrcCopy, gmrcCopy.learners[0].id, '2');
assert.ok(copiedTerm2.hasData);
assert.ok(Math.abs(copiedTerm2.initialGrade - 70) < 0.01);
assert.notStrictEqual(copiedTerm2.termGrade, copiedTerm1.termGrade);
assert.strictEqual(context.computeTerm(gmrcCopy, gmrcCopy.learners[0].id, '1').termGrade, gmrcTerm1.termGrade);
assert.ok(!context.canDuplicateToOfficialSheet(gmrcCopy));

const tle = {
  id: 'tle-old',
  gradeLevel: '8',
  section: 'Jade',
  subject: 'Technology and Livelihood Education (TLE)',
  subjectGroup: 'SKILLS_20_60_20',
  policy: 'DO15_TRANSITION',
  schoolYear: '2026-2027',
  tleMode: 'single',
  learners: [{ id: 'learner-tle', name: 'Cruz, Ben', lastName: 'Cruz', firstName: 'Ben', sex: 'M' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(tle, context.templateForGrade('8'));
fillPooledTerm(tle, 'learner-tle', '1');
const tleTerm1 = context.computeTerm(tle, 'learner-tle', '1');
const tleSourceScores = JSON.stringify(tle.scores);
assert.strictEqual(context.canDuplicateToOfficialSheet(tle), true);
assert.strictEqual(context.canDuplicateToOfficialSheet({
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'per-component'
}), false);

const tleCopy = context.duplicateAssignmentToOfficialSheet(tle);
assert.ok(tleCopy);
assert.strictEqual(tleCopy.term1GradeOnly, true);
assert.strictEqual(tleCopy.tleMode, 'per-component');
assert.ok(context.usesTleComponentScoring(tleCopy));
assert.ok(tleCopy.assessments.some(item => item.term === '2' && item.mapePart === 'fcs'));
assert.ok(tleCopy.assessments.some(item => item.term === '1' && item.mapePart === 'ict'));
assert.strictEqual(tleCopy.learners[0].transferredInGrades['1'], tleTerm1.termGrade);
assert.strictEqual(JSON.stringify(tle.scores), tleSourceScores);
assert.strictEqual(tle.tleMode, 'single');

const tleCopiedTerm1 = context.computeTerm(tleCopy, tleCopy.learners[0].id, '1');
assert.strictEqual(tleCopiedTerm1.termGrade, tleTerm1.termGrade);
assert.strictEqual(context.computeTleConsolidatedTerm(tleCopy, tleCopy.learners[0].id, '1').termGrade, tleTerm1.termGrade);

fillTlePart(tleCopy, tleCopy.learners[0].id, '2', 'ict', 10, 10);
fillTlePart(tleCopy, tleCopy.learners[0].id, '2', 'fcs', 0, 10);
const tleTerm2 = context.computeTleConsolidatedTerm(tleCopy, tleCopy.learners[0].id, '2');
assert.strictEqual(tleTerm2.termGrade, 70);
assert.strictEqual(context.computeTerm(tleCopy, tleCopy.learners[0].id, '1').termGrade, tleTerm1.termGrade);

const epp = {
  gradeLevel: '5',
  subject: 'Edukasyong Pantahanan at Pangkabuhayan (EPP)',
  tleMode: 'single',
  learners: [{ id: 'learner-epp', name: 'Lee' }],
  assessments: [],
  scores: {}
};
assert.strictEqual(context.canDuplicateToOfficialSheet(epp), true);

context.setLearnerCopiedTermGrade(gmrcCopy, gmrcCopy.learners[0].id, '88');
assert.strictEqual(context.computeTerm(gmrcCopy, gmrcCopy.learners[0].id, '1').termGrade, 88);

const indexSource = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
assert.match(indexSource, /duplicateOfficialSheet/);
const dbSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/database.js'), 'utf8');
assert.match(dbSource, /duplicateAssignmentToOfficialSheet/);
const recordSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/record-table.js'), 'utf8');
assert.match(recordSource, /usesTermGradeOnly/);
const helpSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/help.js'), 'utf8');
assert.match(helpSource, /Duplicate to official sheet|official sheet/i);
assert.match(helpSource, /Term 1/);

console.log('K to 10 official-layout duplicate tests passed.');
