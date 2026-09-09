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

function componentCount(template, component) {
  return Array.from(template).filter(item => item.component === component).length;
}

assert.strictEqual(context.descriptor('B'), 'Benchmarking (Naipamamalas)');
assert.strictEqual(context.descriptor('D'), 'Developing (Nagpapaunlad)');
assert.strictEqual(context.descriptor(85), 'Benchmarking (Naipamamalas)');
assert.strictEqual(context.descriptor(70), 'Developing (Nagpapaunlad)');
assert.doesNotMatch(context.descriptor('B'), /Napamamalas/);
assert.doesNotMatch(context.descriptor('D'), /Napauunlad/);

assert.match(context.descriptorLegendText('B'), /Naipamamalas/);
assert.match(context.descriptorLegendText('D'), /Nagpapaunlad/);
assert.match(context.descriptorLegendText('A'), /beyond grade-level|exceed/i);
assert.strictEqual(context.PACE_LETTER_LABELS.B, 'Benchmarking (Naipamamalas)');
assert.strictEqual(context.PACE_LETTER_LABELS.D, 'Developing (Nagpapaunlad)');
assert.match(context.paceLetterTooltip('B'), /Naipamamalas/);

assert.strictEqual(context.officialComponentTitle('WW'), 'Written / Oral Works');
assert.strictEqual(context.officialComponentTitle('PT'), 'Product / Performance Tasks');
assert.strictEqual(context.officialComponentTitle('EX'), 'Examinations');
assert.strictEqual(context.officialComponentTitle('TE'), 'Examinations');

assert.strictEqual(componentCount(context.templateForGrade('1'), 'WW'), 4, 'Grade 1 evidence columns stay 4 WW');
assert.strictEqual(componentCount(context.templateForGrade('1'), 'PT'), 4, 'Grade 1 evidence columns stay 4 PT');
assert.strictEqual(componentCount(context.templateForGrade('2'), 'WW'), 5);
assert.strictEqual(componentCount(context.templateForGrade('2'), 'PT'), 3);
assert.strictEqual(componentCount(context.templateForGrade('3'), 'WW'), 5);
assert.strictEqual(componentCount(context.templateForGrade('3'), 'PT'), 3);

const freshGrade2 = { gradeLevel: '2', subject: 'English', assessments: [], scores: {} };
context.seedTemplateAssessments(freshGrade2, context.templateForGrade('2'));
assert.strictEqual(freshGrade2.assessments.filter(item => item.term === '1' && item.component === 'WW').length, 5);
assert.strictEqual(freshGrade2.assessments.filter(item => item.term === '1' && item.component === 'PT').length, 3);

const legacyGrade2 = { gradeLevel: '2', subject: 'English', assessments: [], scores: {} };
context.seedTemplateAssessments(legacyGrade2, context.templateFromColumnCounts(4, 4));
const pt4 = legacyGrade2.assessments.find(item => item.term === '1' && item.title === 'PT 4');
pt4.maxScore = 20;
legacyGrade2.scores['learner-1|' + pt4.id] = 15;
delete legacyGrade2.columnPreset;
context.ensureTemplateAssessments(legacyGrade2);
assert.strictEqual(legacyGrade2.assessments.some(item => item.id === pt4.id), true, 'existing Grade 2 PT 4 must survive the 5+3 preset');
assert.strictEqual(legacyGrade2.scores['learner-1|' + pt4.id], 15);
assert.strictEqual(Number(legacyGrade2.columnPreset.ww), 4);
assert.strictEqual(Number(legacyGrade2.columnPreset.pt), 4);

const helpSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/help.js'), 'utf8');
assert.match(helpSource, /Naipamamalas/);
assert.match(helpSource, /Nagpapaunlad/);
assert.doesNotMatch(helpSource, /Napamamalas/);
assert.doesNotMatch(helpSource, /Napauunlad/);

const recordSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/record-table.js'), 'utf8');
assert.match(recordSource, /Written \/ Oral Works/);
assert.match(recordSource, /Product \/ Performance Tasks/);

const androidPace = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/com/example/eclassrecordmobile/ui/PaceRatingScreen.kt'), 'utf8');
const androidTable = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/com/example/eclassrecordmobile/ui/TransmutationTable.kt'), 'utf8');
assert.match(androidPace, /Naipamamalas/);
assert.match(androidTable, /Nagpapaunlad/);
assert.doesNotMatch(androidPace, /Napamamalas/);
assert.doesNotMatch(androidTable, /Napauunlad/);

console.log('K to 10 Phase A tests passed.');
