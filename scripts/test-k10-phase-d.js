'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
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
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-engine.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/grading.js'), 'utf8'), context);

assert.strictEqual(context.defaultTleModeForNewAssignment('8', 'Technology and Livelihood Education (TLE)', '2026-2027'), 'single');
assert.strictEqual(context.defaultTleModeForNewAssignment('8', 'Technology and Livelihood Education (TLE)', '2027-2028'), 'per-component');
assert.strictEqual(context.defaultTleModeForNewAssignment('5', 'Edukasyong Pantahanan at Pangkabuhayan (EPP)', '2026-2027'), 'single');
assert.strictEqual(context.defaultTleModeForNewAssignment('5', 'Edukasyong Pantahanan at Pangkabuhayan (EPP)', '2027-2028'), 'per-component');
assert.strictEqual(context.defaultTleModeForNewAssignment('8', 'English', '2027-2028'), 'single');
assert.strictEqual(context.tlePartsForTerm('1').join(','), 'ict,afa');
assert.strictEqual(context.tlePartsForTerm('2').join(','), 'ict,fcs');
assert.strictEqual(context.tlePartsForTerm('3').join(','), 'ict,ia');
assert.strictEqual(context.consolidateTleTermGrade(80, 100), 95);
assert.strictEqual(context.consolidateTleTermGrade(100, 60), 70);

const legacy = {
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  subjectGroup: 'SKILLS_20_60_20',
  policy: 'DO15_TRANSITION',
  tleMode: 'single',
  learners: [{ id: 'learner-1', name: 'Sample' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(legacy, context.templateForGrade('8'));
assert.strictEqual(legacy.tleMode, 'single');
assert.ok(!legacy.assessments.some(item => item.mapePart === 'ict' || item.mapePart === 'afa'));
const wwCount = legacy.assessments.filter(item => item.term === '1' && item.component === 'WW').length;
assert.ok(wwCount <= 5);

const namedTle = {
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  subjectGroup: 'SKILLS_20_60_20',
  policy: 'DO15_TRANSITION',
  learners: [{ id: 'learner-1' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(namedTle, context.templateForGrade('8'));
assert.strictEqual(namedTle.tleMode, 'single', 'subject name must not opt TLE into per-component');
assert.ok(!context.usesTleComponentScoring(namedTle));

const per = {
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  subjectGroup: 'SKILLS_20_60_20',
  policy: 'DO15_TRANSITION',
  tleMode: 'per-component',
  learners: [{ id: 'learner-1' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(per, context.templateForGrade('8'));
assert.ok(context.usesTleComponentScoring(per));
['1', '2', '3'].forEach(term => {
  const parts = context.tlePartsForTerm(term);
  parts.forEach(part => {
    assert.strictEqual(per.assessments.filter(item => item.term === term && item.mapePart === part && item.component === 'WW').length, 5);
    assert.strictEqual(per.assessments.filter(item => item.term === term && item.mapePart === part && item.component === 'PT').length, 3);
  });
});
assert.ok(per.assessments.some(item => item.term === '1' && item.mapePart === 'afa'));
assert.ok(per.assessments.some(item => item.term === '2' && item.mapePart === 'fcs'));
assert.ok(per.assessments.some(item => item.term === '3' && item.mapePart === 'ia'));
assert.ok(!per.assessments.some(item => item.term === '1' && item.mapePart === 'fcs'));

function fillPart(assignment, learnerId, term, part, score, maxScore) {
  assignment.assessments.filter(item => String(item.term) === String(term) && item.mapePart === part).forEach(item => {
    item.maxScore = maxScore;
    assignment.scores[`${learnerId}|${item.id}`] = score;
  });
}
fillPart(per, 'learner-1', '1', 'ict', 10, 10);
fillPart(per, 'learner-1', '1', 'afa', 0, 10);
const ict = context.computeTerm(per, 'learner-1', '1', 'ict');
const afa = context.computeTerm(per, 'learner-1', '1', 'afa');
assert.strictEqual(ict.termGrade, 100);
assert.strictEqual(afa.termGrade, 60);
const combined = context.computeTleConsolidatedTerm(per, 'learner-1', '1');
assert.strictEqual(combined.termGrade, 70);
assert.strictEqual(combined.ictTermGrade, 100);
assert.strictEqual(combined.specTermGrade, 60);

legacy.assessments.filter(item => item.term === '1' && item.component === 'WW').forEach((item, index) => {
  item.maxScore = 10;
  legacy.scores[`learner-1|${item.id}`] = index === 0 ? 9 : 8;
});
const firstWw = legacy.assessments.find(item => item.term === '1' && item.component === 'WW');
const savedScore = legacy.scores[`learner-1|${firstWw.id}`];
const legacyIg = context.computeTerm(legacy, 'learner-1', '1').initialGrade;
context.ensureTemplateAssessments(legacy);
assert.strictEqual(legacy.tleMode, 'single');
assert.ok(!context.usesTleComponentScoring(legacy));
assert.strictEqual(context.computeTerm(legacy, 'learner-1', '1').initialGrade, legacyIg);
assert.strictEqual(legacy.scores[`learner-1|${firstWw.id}`], savedScore);

const packs = require('../src/renderer/js/official-ecr-packs');
const tlePack = packs.officialEcrPackForAssignment({
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'per-component'
});
assert.strictEqual(tlePack.id, 'tle-component');
assert.strictEqual(tlePack.available, true);

const singlePack = packs.officialEcrPackForAssignment({
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'single'
});
assert.strictEqual(singlePack.id, 'tle-single');
assert.strictEqual(singlePack.available, true);

const exporter = require('../src/main/official-ecr-exporter');
assert.ok(fs.existsSync(path.join(root, 'src/assets/official-ecr/epp-tle-component.xlsx')));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k10-phase-d-'));
const out = path.join(tmp, 'tle-component.xlsx');
exporter.generateOfficialExcel(out, {
  packId: 'tle-component',
  school: { region: 'V', schoolId: '123456', schoolName: 'Sample', schoolYear: '2026-2027', teacherName: 'Teacher' },
  assignment: { gradeLevel: '8', section: 'Rizal', subject: 'Technology and Livelihood Education (TLE)', tleMode: 'per-component' },
  males: [{ name: 'Santos, Juan', lrn: '123456789012', sex: 'M' }],
  females: [],
  ict: {
    males: [{ name: 'Santos, Juan', terms: { 1: { ww: [10, 9, 8, 7, 6], pt: [20, 19, 18], sa1: 30, sa2: 29, te: 40 } } }],
    females: [],
    terms: { 1: { wwHps: [10, 10, 10, 10, 10], ptHps: [20, 20, 20], sa1Hps: 30, sa2Hps: 30, teHps: 40 } }
  },
  afa: {
    males: [{ name: 'Santos, Juan', terms: { 1: { ww: [5, 5, 5, 5, 5], pt: [10, 10, 10], sa1: 15, sa2: 15, te: 20 } } }],
    females: [],
    terms: { 1: { wwHps: [10, 10, 10, 10, 10], ptHps: [20, 20, 20], sa1Hps: 30, sa2Hps: 30, teHps: 40 } }
  }
});
const wb = XLSX.readFile(out);
assert.ok(wb.SheetNames.includes('TERM 1 ICT'));
assert.ok(wb.SheetNames.includes('TERM 1 AFA'));
assert.strictEqual(Number(wb.Sheets['TERM 1 ICT'].F18.v), 10);
assert.strictEqual(Number(wb.Sheets['TERM 1 AFA'].F18.v), 5);

const indexSource = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
assert.match(indexSource, /newTlePerComponent/);
assert.match(indexSource, /newGmrcDomains/);
assert.match(indexSource, /2027-2028/);
assert.match(indexSource, /tleSubTabs|setTleSubTab/);
const recordSource = fs.readFileSync(path.join(root, 'src/renderer/js/record-table.js'), 'utf8');
assert.match(recordSource, /usesTleComponentScoring/);
const dbSource = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
assert.match(dbSource, /newTlePerComponent/);
assert.match(dbSource, /per-component/);
const helpSource = fs.readFileSync(path.join(root, 'src/renderer/js/help.js'), 'utf8');
assert.match(helpSource, /ICT/);
assert.match(helpSource, /25%/);
assert.match(helpSource, /per-component|per component/i);

console.log('K to 10 Phase D TLE component tests passed.');
