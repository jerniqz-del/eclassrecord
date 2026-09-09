'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const packs = require('../src/renderer/js/official-ecr-packs');

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
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-engine.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/kinder-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/grading.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/official-ecr-packs.js'), 'utf8'), context);

assert.strictEqual(context.officialComponentTitle('WW'), 'Written / Oral Works');
assert.strictEqual(context.officialComponentTitle('PT'), 'Product / Performance Tasks');
assert.strictEqual(context.officialComponentTitle('EX'), 'Examinations');
assert.strictEqual(context.gmrcDomainHeaderTitle('WW', 'cognitive'), 'Written / Oral Works · Cognitive');
assert.strictEqual(context.gmrcDomainHeaderTitle('PT', 'behavioral'), 'Product / Performance Tasks · Behavioral');

assert.strictEqual(context.officialComponentTabLabel('mapeh', '1', 'music_arts'), 'Term 1 Music & Arts');
assert.strictEqual(context.officialComponentTabLabel('mapeh', '2', 'pe_health'), 'Term 2 PE & Health');
assert.strictEqual(context.officialComponentTabLabel('mapeh', '3', 'consolidated'), 'Term 3 MAPEH');
assert.strictEqual(context.officialComponentTabLabel('tle', '1', 'ict'), 'Term 1 ICT');
assert.strictEqual(context.officialComponentTabLabel('tle', '1', 'afa'), 'Term 1 AFA');
assert.strictEqual(context.officialComponentTabLabel('tle', '2', 'fcs'), 'Term 2 FCS');
assert.strictEqual(context.officialComponentTabLabel('tle', '3', 'ia'), 'Term 3 IA');
assert.strictEqual(typeof context.setMapehSubTab, 'function');
assert.strictEqual(typeof context.setTleSubTab, 'function');

const incomplete = packs.officialFinalStatus(90, 80, '');
assert.strictEqual(incomplete.official, '');
assert.strictEqual(incomplete.running, 85);
assert.strictEqual(incomplete.ready, false);
assert.match(incomplete.hint, /Official final appears after Term 3/);
assert.strictEqual(packs.officialFinalGrade(90, 80, ''), '');

const complete = packs.officialFinalStatus(90, 80, 70);
assert.strictEqual(complete.official, 80);
assert.strictEqual(complete.running, 80);
assert.strictEqual(complete.ready, true);
assert.strictEqual(complete.hint, '');
assert.strictEqual(packs.officialFinalStatus('', '', '').official, '');
assert.strictEqual(packs.officialFinalStatus(90, 0, 80).official, 57);

const school = packs.officialEcrSchoolFromProfile({
  schoolName: 'Sample School',
  schoolId: '123456',
  region: 'V',
  division: 'Sorsogon',
  district: 'Irosin II',
  city: 'Irosin',
  schoolYear: '2026-2027',
  teacherName: 'Maria Teacher',
  schoolHead: 'Pedro Head'
});
assert.strictEqual(school.district, 'Irosin II');
assert.strictEqual(school.city, 'Irosin');
assert.strictEqual(school.schoolId, '123456');

const academic = {
  gradeLevel: '8',
  section: 'Rizal',
  subject: 'English',
  scoringModel: 'pooled-ww-pt',
  tleMode: 'single',
  learners: [
    { id: 'm1', lastName: 'Santos', firstName: 'Juan', sex: 'M', lrn: '123456789012' },
    { id: 'f1', lastName: 'Reyes', firstName: 'Ana', sex: 'F', lrn: '123456789013' }
  ]
};
const wizard = packs.officialEcrWizardState(school, academic);
assert.strictEqual(wizard.pack.id, 'academic');
assert.strictEqual(wizard.pack.available, true);
assert.strictEqual(wizard.males, 1);
assert.strictEqual(wizard.females, 1);
assert.ok(wizard.fillsFromSettings.includes('schoolId'));
assert.ok(wizard.fillsFromSettings.includes('district'));
assert.match(wizard.source, /Settings/);
assert.match(wizard.source, /roster/i);

assert.strictEqual(packs.officialEcrPackForAssignment({ gradeLevel: 'Kindergarten' }).id, 'kinder');
assert.strictEqual(packs.officialEcrPackForAssignment({ gradeLevel: '1', subject: 'Grade 1' }).id, 'grade1');
assert.strictEqual(packs.officialEcrPackForAssignment({
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'single'
}).id, 'tle-single');
assert.strictEqual(packs.officialEcrPackForAssignment({
  gradeLevel: '8',
  subject: 'MAPEH'
}).id, 'mapeh');

const kinderRatings = packs.officialLetterRatingsByTerm(
  [{ id: 'kd-sp-1' }, { id: 'kd-se-1' }],
  (id, term) => (id === 'kd-sp-1' && term === '1' ? 'B' : '')
);
assert.strictEqual(kinderRatings[1]['kd-sp-1'], 'B');
assert.ok(!kinderRatings[1]['kd-se-1']);
assert.ok(!kinderRatings[2]['kd-sp-1']);

const existingGmrc = {
  gradeLevel: '4',
  subject: 'Good Manners and Right Conduct (GMRC)',
  scoringModel: 'pooled-ww-pt',
  assessments: [{ id: 'ww1', component: 'WW', term: '1', maxScore: 10 }],
  scores: { 'learner-1|ww1': 8 }
};
assert.strictEqual(existingGmrc.scoringModel, 'pooled-ww-pt');
assert.strictEqual(existingGmrc.scores['learner-1|ww1'], 8);
assert.ok(!context.usesGmrcDomainScoring(existingGmrc));

const existingTle = {
  gradeLevel: '8',
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'single'
};
assert.ok(!context.usesTleComponentScoring(existingTle));

assert.ok(context.isKinderAssignment({ gradeLevel: 'Kindergarten' }));
assert.ok(!context.isKinderAssignment({ gradeLevel: '1' }));

const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
assert.doesNotMatch(html, /useOfficialColumnHeaders|toggleOfficialColumnHeaders|Official column names/);
assert.match(html, /id="schoolHead"/);
assert.match(html, /setMapehSubTab\('music_arts'\)/);
assert.match(html, /setTleSubTab\('ict'\)/);

const recordSource = fs.readFileSync(path.join(root, 'src/renderer/js/record-table.js'), 'utf8');
assert.match(recordSource, /Official final appears after Term 3/);
assert.match(recordSource, /syncMapehSubTabs/);
assert.match(recordSource, /officialComponentTabLabel/);
assert.match(recordSource, /gmrcDomainHeaderTitle/);
assert.doesNotMatch(recordSource, /componentHeaderTitle/);
assert.match(recordSource, /record-tab--active/);

const componentsCss = fs.readFileSync(path.join(root, 'src/renderer/css/components.css'), 'utf8');
assert.match(componentsCss, /\.record-tabs--sub/);
assert.match(componentsCss, /\.record-tab\.is-active|\.record-tab--active,\s*\.record-tab\.is-active/);

const exportSource = fs.readFileSync(path.join(root, 'src/renderer/js/import-export.js'), 'utf8');
assert.match(exportSource, /officialEcrWizardState|Fills INPUT DATA from Settings/);
assert.match(exportSource, /district/);
assert.match(exportSource, /officialLetterRatingsByTerm|kinderAllItems/);

const paceUi = fs.readFileSync(path.join(root, 'src/renderer/js/pace-ui.js'), 'utf8');
assert.match(paceUi, /isKinderAssignment\(assignment\)\) return true/);
assert.match(paceUi, /A: 'A', B: 'B', C: 'C', D: 'D', E: 'E'/);

const help = fs.readFileSync(path.join(root, 'src/renderer/js/help.js'), 'utf8');
assert.match(help, /Official final appears after Term 3/);
assert.match(help, /Kindergarten/);
assert.match(help, /A–E|A-E/);
assert.doesNotMatch(help, /Official column names/);

const dbSource = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
assert.doesNotMatch(dbSource, /useOfficialColumnHeaders/);
assert.match(dbSource, /getElementById\('schoolHead'\)/);

console.log('k10 phase G tests passed');
