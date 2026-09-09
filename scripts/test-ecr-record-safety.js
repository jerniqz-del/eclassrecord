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

function assertColumnPreset(assignment, ww, pt, message) {
  assert.strictEqual(Number(assignment.columnPreset && assignment.columnPreset.ww), ww, message);
  assert.strictEqual(Number(assignment.columnPreset && assignment.columnPreset.pt), pt, message);
}

function grade2LegacyClass() {
  const assignment = {
    gradeLevel: '2',
    subject: 'English',
    learners: [{ id: 'learner-1', name: 'Sample' }],
    assessments: [],
    scores: {}
  };
  context.seedTemplateAssessments(assignment, context.templateFromColumnCounts(4, 4));
  const pt4 = assignment.assessments.find(item => item.term === '1' && item.title === 'PT 4');
  pt4.maxScore = 20;
  assignment.scores['learner-1|' + pt4.id] = 18;
  return { assignment, pt4Id: pt4.id };
}

const newGrade2 = {
  gradeLevel: '2',
  subject: 'English',
  learners: [{ id: 'learner-1', name: 'Sample' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(newGrade2, context.templateForGrade('2'));
assertColumnPreset(newGrade2, 5, 3, 'new Grade 2 classes must freeze the official 5+3 layout');

const seeded = grade2LegacyClass();
assertColumnPreset(seeded.assignment, 4, 4, 'legacy Grade 2 classes must freeze the 4+4 layout they were created with');
assert.strictEqual(seeded.assignment.scoringModel, 'pooled-ww-pt');
assert.strictEqual(seeded.assignment.tleMode, 'single');

const existing = grade2LegacyClass();
delete existing.assignment.columnPreset;
delete existing.assignment.scoringModel;
delete existing.assignment.tleMode;
context.ensureTemplateAssessments(existing.assignment);
assertColumnPreset(existing.assignment, 4, 4, 'opening a legacy Grade 2 class must freeze 4 WW + 4 PT');
assert.strictEqual(existing.assignment.assessments.some(item => item.id === existing.pt4Id), true);
assert.strictEqual(existing.assignment.scores['learner-1|' + existing.pt4Id], 18, 'raw scores must not be rewritten');

const futureDefault = grade2LegacyClass();
futureDefault.assignment.columnPreset = { ww: 5, pt: 3 };
context.ensureTemplateAssessments(futureDefault.assignment);
assert.strictEqual(
  futureDefault.assignment.assessments.some(item => item.id === futureDefault.pt4Id),
  true,
  'a later 5+3 Grade 2 preset must not drop a stored PT 4 column'
);
assert.strictEqual(futureDefault.assignment.scores['learner-1|' + futureDefault.pt4Id], 18);
assert.ok(futureDefault.assignment.columnPreset.pt >= 4, 'frozen preset must grow to keep existing PT columns');

const before = context.computeTerm(existing.assignment, 'learner-1', '1');
context.ensureTemplateAssessments(existing.assignment);
const after = context.computeTerm(existing.assignment, 'learner-1', '1');
assert.strictEqual(after.initialGrade, before.initialGrade, 'compatibility flags must not change Initial Grade');
assert.strictEqual(after.termGrade, before.termGrade, 'compatibility flags must not change Term Grade');

const gmrc = {
  gradeLevel: '8',
  subject: 'Good Manners and Right Conduct (GMRC)',
  subjectGroup: 'CORE_20_50_30',
  policy: 'DO15_TRANSITION',
  schoolYear: '2026-2027',
  learners: [{ id: 'learner-1', name: 'Sample' }],
  assessments: [
    { id: 'ww-1', term: '1', component: 'WW', title: 'WW 1', maxScore: 20 },
    { id: 'pt-1', term: '1', component: 'PT', title: 'PT 1', maxScore: 100 },
    { id: 'st1', term: '1', component: 'ST1', title: 'ST1', maxScore: 40 },
    { id: 'st2', term: '1', component: 'ST2', title: 'ST2', maxScore: 40 },
    { id: 'te', term: '1', component: 'TE', title: 'TE', maxScore: 50 }
  ],
  scores: {
    'learner-1|ww-1': 16,
    'learner-1|pt-1': 80,
    'learner-1|st1': 30,
    'learner-1|st2': 30,
    'learner-1|te': 40
  }
};
const gmrcBefore = context.computeTerm(gmrc, 'learner-1', '1');
context.freezeRecordCompatibility(gmrc);
context.ensureTemplateAssessments(gmrc);
const gmrcAfter = context.computeTerm(gmrc, 'learner-1', '1');
assert.strictEqual(gmrc.scoringModel, 'pooled-ww-pt');
assert.strictEqual(gmrcAfter.initialGrade, gmrcBefore.initialGrade, 'existing GMRC classes must keep pooled WW/PT math');
assert.strictEqual(gmrcAfter.termGrade, gmrcBefore.termGrade);

const tle = {
  gradeLevel: '10',
  subject: 'Technology and Livelihood Education (TLE)',
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(tle, context.templateForGrade('10'));
assert.strictEqual(tle.tleMode, 'single', 'existing TLE classes must stay on the single-component layout');
assert.ok(!tle.assessments.some(item => item.tlePart), 'TLE component sheets must not be created for existing records');

const pace = {
  gradeLevel: '1',
  subject: 'Grade 1',
  learners: [{ id: 'l1', name: 'Ana' }]
};
context.paceEnsureStore(pace);
pace.pace.ratings['l1|reading-1|1|'] = 'B';
assert.strictEqual(pace.pace.skillRatingMode, 'single-letter');
assert.strictEqual(context.paceGetRating(pace, 'l1', 'reading-1', '1', ''), 'B');
assert.strictEqual(
  context.paceGetRating(pace, 'l1', 'reading-1', '1', 'listen'),
  'B',
  'per-skill L/S/R/C reads must fall back to the one stored letter'
);
assert.strictEqual(pace.pace.ratings['l1|reading-1|1|'], 'B', 'stored PACE keys must not be rewritten');

const databaseSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/database.js'), 'utf8');
assert.strictEqual((databaseSource.match(/const DB_VERSION = 7;/) || []).length, 1, 'record safety must stay additive without a database version bump');

console.log('ECR existing-record safety tests passed.');
