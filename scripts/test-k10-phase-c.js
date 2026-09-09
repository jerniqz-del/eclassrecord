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

assert.strictEqual(context.isGmrcOrValuesSubject('Good Manners and Right Conduct (GMRC)'), true);
assert.strictEqual(context.isGmrcOrValuesSubject('Values Education'), true);
assert.strictEqual(context.isGmrcOrValuesSubject('Mathematics'), false);
assert.strictEqual(context.officialGmrcTleLayoutsDefaultOn('2026-2027'), false);
assert.strictEqual(context.officialGmrcTleLayoutsDefaultOn('2027-2028'), true);
assert.strictEqual(context.defaultScoringModelForNewAssignment('8', 'Values Education', '2026-2027'), 'pooled-ww-pt');
assert.strictEqual(context.defaultScoringModelForNewAssignment('8', 'Values Education', '2027-2028'), 'gmrc-domains-2026');
assert.strictEqual(context.defaultScoringModelForNewAssignment('8', 'English', '2027-2028'), 'pooled-ww-pt');
assert.strictEqual(context.defaultScoringModelForNewAssignment('1', 'Good Manners and Right Conduct (GMRC)', '2027-2028'), 'pooled-ww-pt');

const domainTemplate = context.gmrcDomainTemplate();
const ww = domainTemplate.filter(item => item.component === 'WW');
const pt = domainTemplate.filter(item => item.component === 'PT');
assert.strictEqual(ww.filter(item => item.domain === 'cognitive').length, 5);
assert.strictEqual(ww.filter(item => item.domain === 'affective').length, 5);
assert.strictEqual(pt.filter(item => item.domain === 'cognitive').length, 3);
assert.strictEqual(pt.filter(item => item.domain === 'affective').length, 3);
assert.strictEqual(pt.filter(item => item.domain === 'behavioral').length, 3);

const fresh = {
  gradeLevel: '8',
  subject: 'Values Education',
  subjectGroup: 'CORE_20_50_30',
  policy: 'DO15_TRANSITION',
  schoolYear: '2026-2027',
  scoringModel: 'gmrc-domains-2026',
  learners: [{ id: 'learner-1', name: 'Sample' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(fresh, context.gmrcDomainTemplate());
assert.strictEqual(fresh.scoringModel, 'gmrc-domains-2026');
const term1 = fresh.assessments.filter(item => item.term === '1');
assert.strictEqual(term1.filter(item => item.component === 'WW' && item.domain === 'cognitive').length, 5);
assert.strictEqual(term1.filter(item => item.component === 'PT' && item.domain === 'behavioral').length, 3);

function fillDomain(assignment, learnerId, domain, component, score, maxScore) {
  assignment.assessments.filter(item => item.term === '1' && item.component === component && item.domain === domain).forEach(item => {
    item.maxScore = maxScore;
    assignment.scores[`${learnerId}|${item.id}`] = score;
  });
}
function fillExams(assignment, learnerId, score, maxScore) {
  ['ST1', 'ST2', 'TE'].forEach(component => {
    const item = assignment.assessments.find(entry => entry.term === '1' && entry.component === component);
    item.maxScore = maxScore;
    assignment.scores[`${learnerId}|${item.id}`] = score;
  });
}

fillDomain(fresh, 'learner-1', 'cognitive', 'WW', 10, 10);
fillDomain(fresh, 'learner-1', 'affective', 'WW', 10, 10);
fillDomain(fresh, 'learner-1', 'cognitive', 'PT', 10, 10);
fillDomain(fresh, 'learner-1', 'affective', 'PT', 10, 10);
fillDomain(fresh, 'learner-1', 'behavioral', 'PT', 0, 10);
fillExams(fresh, 'learner-1', 10, 10);

const domainResult = context.computeTerm(fresh, 'learner-1', '1');
assert.ok(Math.abs(domainResult.initialGrade - 70) < 0.01, `domain IG should be 70, got ${domainResult.initialGrade}`);
assert.strictEqual(domainResult.termGrade, context.transmute(fresh, 70));
assert.ok(domainResult.gmrcDomains);
assert.strictEqual(domainResult.gmrcDomains.PT_behavioral.ps, 0);
assert.strictEqual(domainResult.gmrcDomains.PT_cognitive.ps, 100);

const pooledTwin = {
  ...fresh,
  scoringModel: 'pooled-ww-pt',
  id: 'pooled'
};
const pooledResult = context.computeTerm(pooledTwin, 'learner-1', '1');
assert.ok(pooledResult.initialGrade > 80, `pooled IG should stay near the 20/50/30 average, got ${pooledResult.initialGrade}`);
assert.notStrictEqual(Math.round(pooledResult.initialGrade), Math.round(domainResult.initialGrade));

const legacy = {
  gradeLevel: '8',
  subject: 'Good Manners and Right Conduct (GMRC)',
  subjectGroup: 'CORE_20_50_30',
  policy: 'DO15_TRANSITION',
  schoolYear: '2026-2027',
  learners: [{ id: 'learner-1', name: 'Sample' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(legacy, context.templateForGrade('8'));
assert.strictEqual(legacy.scoringModel, 'pooled-ww-pt', 'existing/default seed without an explicit model stays pooled');
assert.ok(!legacy.assessments.some(item => item.domain), 'pooled GMRC must not grow domain columns');
legacy.assessments.filter(item => item.term === '1' && item.component === 'WW').forEach((item, index) => {
  item.maxScore = 10;
  legacy.scores[`learner-1|${item.id}`] = index === 0 ? 10 : 0;
});
legacy.assessments.filter(item => item.term === '1' && item.component === 'PT').forEach(item => {
  item.maxScore = 10;
  legacy.scores[`learner-1|${item.id}`] = 10;
});
['ST1', 'ST2', 'TE'].forEach(component => {
  const item = legacy.assessments.find(entry => entry.term === '1' && entry.component === component);
  item.maxScore = 10;
  legacy.scores[`learner-1|${item.id}`] = 10;
});
const before = context.computeTerm(legacy, 'learner-1', '1').initialGrade;
context.ensureTemplateAssessments(legacy);
assert.strictEqual(legacy.scoringModel, 'pooled-ww-pt');
assert.strictEqual(context.computeTerm(legacy, 'learner-1', '1').initialGrade, before);
assert.ok(!context.usesGmrcDomainScoring(legacy));
assert.ok(context.usesGmrcDomainScoring(fresh));

const english = {
  gradeLevel: '8',
  subject: 'English',
  scoringModel: 'pooled-ww-pt',
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(english, context.templateForGrade('8'));
assert.ok(!english.assessments.some(item => item.domain));

const databaseSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/database.js'), 'utf8');
assert.match(databaseSource, /defaultScoringModelForNewAssignment/);
assert.match(databaseSource, /gmrcDomainTemplate/);
assert.match(databaseSource, /newGmrcDomains/);

const recordSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/record-table.js'), 'utf8');
assert.match(recordSource, /usesGmrcDomainScoring/);
assert.match(recordSource, /Cognitive/);
assert.match(recordSource, /Affective/);
assert.match(recordSource, /Behavioral/);

const helpSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/help.js'), 'utf8');
assert.match(helpSource, /Cognitive 10%/);
assert.match(helpSource, /Behavioral 30%/);
assert.match(helpSource, /2027-2028/);

const indexSource = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
assert.match(indexSource, /newGmrcDomains/);

console.log('K to 10 Phase C tests passed.');
