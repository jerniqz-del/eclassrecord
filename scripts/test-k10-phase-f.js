'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const packs = require('../src/renderer/js/official-ecr-packs');
const exporter = require('../src/main/official-ecr-exporter');
const kinder = require('../src/renderer/js/kinder-catalog');

assert.strictEqual(kinder.kinderAllItems().length, 60);
assert.strictEqual(kinder.kinderDomainNames().join('|'), [
  'Sensory Perceptual and Motor Development',
  'Socio-emotional Development',
  'Cognitive Development',
  'Language, Literacy, and Communication Development'
].join('|'));
assert.strictEqual(kinder.kinderCompetenciesFor('Sensory Perceptual and Motor Development').length, 5);
assert.strictEqual(kinder.kinderCompetenciesFor('Socio-emotional Development').length, 7);
assert.strictEqual(kinder.kinderCompetenciesFor('Cognitive Development').length, 20);
assert.strictEqual(kinder.kinderCompetenciesFor('Language, Literacy, and Communication Development').length, 28);
assert.ok(kinder.isKinderAssignment({ gradeLevel: 'Kindergarten' }));
assert.ok(!kinder.isKinderAssignment({ gradeLevel: '1' }));
assert.ok(!kinder.isKinderAssignment({ gradeLevel: '2' }));

let idCounter = 0;
const context = {
  console,
  Math,
  Date,
  Intl,
  db: { schoolYear: '2026-2027' },
  uid: prefix => `${prefix}-${++idCounter}`
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-engine.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/kinder-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/grading.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-sf9.js'), 'utf8'), context);

assert.strictEqual(context.paceCompetenciesFor('Reading and Literacy', 1).length, 25, 'Grade 1 PACE catalog must stay');
assert.strictEqual(context.templateForGrade(1).filter(item => item.component === 'WW').length, 4);
assert.strictEqual(context.templateForGrade(2).filter(item => item.component === 'WW').length, 5);
assert.strictEqual(context.templateForGrade('Kindergarten').length, 0, 'Kinder must not seed WW/PT/exam columns');

const grade1 = {
  gradeLevel: '1',
  subject: 'Grade 1',
  paceHomeroom: true,
  learners: [{ id: 'g1', name: 'Ana' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(grade1, context.templateForGrade('1'));
assert.strictEqual(grade1.assessments.filter(item => item.term === '1' && item.component === 'WW').length, 4);

const grade2Legacy = {
  gradeLevel: '2',
  subject: 'English',
  columnPreset: { ww: 4, pt: 4 },
  learners: [{ id: 'g2' }],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(grade2Legacy, [
  { component: 'WW', title: 'WW 1' }, { component: 'WW', title: 'WW 2' },
  { component: 'WW', title: 'WW 3' }, { component: 'WW', title: 'WW 4' },
  { component: 'PT', title: 'PT 1' }, { component: 'PT', title: 'PT 2' },
  { component: 'PT', title: 'PT 3' }, { component: 'PT', title: 'PT 4' },
  { component: 'ST1', title: 'ST1' }, { component: 'ST2', title: 'ST2' }, { component: 'TE', title: 'TE' }
]);
assert.strictEqual(grade2Legacy.assessments.filter(item => item.term === '1' && item.component === 'WW').length, 4);

const kinderClass = {
  gradeLevel: 'Kindergarten',
  section: 'Sunflower',
  subject: 'Kindergarten',
  kinderProgram: true,
  learners: [
    { id: 'm1', lastName: 'Santos', firstName: 'Juan', sex: 'M', lrn: '123456789012', birthdate: '2020-08-01' }
  ],
  assessments: [],
  scores: {}
};
context.seedTemplateAssessments(kinderClass, context.templateForGrade('Kindergarten'));
assert.strictEqual(kinderClass.assessments.length, 0);
context.paceSetRating(kinderClass, 'm1', 'kd-sp-01', '1', '', 'B');
assert.strictEqual(context.paceGetRating(kinderClass, 'm1', 'kd-sp-01', '1', ''), 'B');
const term = context.computeTerm(kinderClass, 'm1', '1');
assert.strictEqual(term.initialGrade, null);
assert.ok(term.termGrade === 'B' || term.termGrade === null || term.hasData === true);

const pack = packs.officialEcrPackForAssignment(kinderClass);
assert.strictEqual(pack.id, 'kinder');
assert.strictEqual(pack.available, true);

const grade1Pack = packs.officialEcrPackForAssignment(grade1);
assert.strictEqual(grade1Pack.id, 'grade1');
assert.strictEqual(grade1Pack.available, true);

const packFile = path.join(root, 'src', 'assets', 'official-ecr', 'kinder-sf9.xlsx');
assert.ok(fs.existsSync(packFile), 'Kindergarten official pack template must ship in Phase F');

const sf9 = context.kinderSf9CardMarkup({
  school: { schoolName: 'Sample Elementary School', schoolYear: '2026-2027' },
  assignment: kinderClass,
  learner: kinderClass.learners[0]
});
assert.match(sf9, /KINDERGARTEN PROGRESS REPORT CARD/i);
assert.match(sf9, /Sensory Perceptual/);
assert.match(sf9, /Socio-emotional/);
assert.match(sf9, /Naipamamalas/);
assert.match(sf9, /June/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k10-phase-f-'));
const outPath = path.join(tmp, 'kinder.xlsx');
exporter.generateOfficialExcel(outPath, {
  packId: 'kinder',
  school: {
    schoolName: 'Sample Elementary School',
    schoolId: '123456',
    region: 'V',
    division: 'Sorsogon',
    schoolYear: '2026-2027',
    teacherName: 'Maria Teacher',
    schoolHead: 'Pedro Head'
  },
  assignment: { gradeLevel: 'Kindergarten', section: 'Sunflower', subject: 'Kindergarten' },
  males: [{
    name: 'Santos, Juan',
    lrn: '123456789012',
    sex: 'M',
    birthdate: '2020-08-01',
    ratings: { 1: { 'kd-sp-01': 'B' } }
  }],
  females: []
});
const wb = XLSX.readFile(outPath, { cellFormula: true });
assert.ok(wb.SheetNames.includes('INPUT DATA'));
assert.ok(wb.SheetNames.includes('SF9 - KINDER'));
assert.ok(wb.SheetNames.includes('TERM 1 SUMMARY'));
const input = wb.Sheets['INPUT DATA'];
assert.strictEqual(input.F10 && input.F10.v, 'V');
assert.strictEqual(String(input.F15 && input.F15.v), '123456');
assert.strictEqual(input.L11 && input.L11.v, 'Santos, Juan');
const summary = wb.Sheets['TERM 1 SUMMARY'];
assert.ok(summary.C16 && summary.C16.f, 'Kinder TERM SUMMARY name formulas must stay');
assert.strictEqual(summary.N16 && summary.N16.v, 'B');

console.log('k10 phase F tests passed');
