const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

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
vm.runInContext(read('src', 'renderer', 'js', 'grading.js'), context);

const assignment = { gradeLevel: '10', subject: 'Mathematics', schoolYear: '2026-2027' };
const model = context.transmutationTableModel(assignment, 91.24);
assert.strictEqual(model.kind, 'adjusted2026');
assert.strictEqual(model.transmutedGrade, 93);
assert.ok(model.matchIndex >= 0);
assert.strictEqual(model.rows[model.matchIndex].tg, 93);
assert.strictEqual(model.rows[model.matchIndex].low, 91.24);
assert.ok(context.canOpenTransmutationTable(91.24, 93));
assert.ok(!context.canOpenTransmutationTable(91.24, 'T/O'));
assert.ok(!context.canOpenTransmutationTable(0, 88, { isTransferredIn: true }));

const descriptive = context.transmutationTableModel({ gradeLevel: '1', subject: 'English', schoolYear: '2026-2027' }, 82);
assert.strictEqual(descriptive.kind, 'descriptive');
assert.strictEqual(descriptive.transmutedGrade, 'B');
assert.strictEqual(descriptive.rows[descriptive.matchIndex].tg, 'B');

const zero = context.transmutationTableModel({ gradeLevel: '10', subject: 'Mathematics', schoolYear: '2027-2028' }, 91.24);
assert.strictEqual(zero.kind, 'zero');
assert.strictEqual(zero.transmutedGrade, 91);

assert.strictEqual(context.formatTransmutationInitialGrade(24), '24.00');
assert.strictEqual(context.formatTransmutationInitialGrade(91.24), '91.24');
assert.strictEqual(context.formatTransmutationInitialGrade(100), '100.00');
assert.strictEqual(context.formatTransmutationGrade(93), '93');
assert.strictEqual(context.formatTransmutationGrade('100'), '100');
assert.strictEqual(context.formatTransmutationGrade('B'), 'B');

const recordTable = read('src', 'renderer', 'js', 'record-table.js');
const grading = read('src', 'renderer', 'js', 'grading.js');
const ui = read('src', 'renderer', 'js', 'transmutation-table-ui.js');
const helpers = read('src', 'renderer', 'js', 'ui-helpers.js');
const css = read('src', 'renderer', 'css', 'transmutation-table.css');
const index = read('src', 'renderer', 'index.html');
assert.match(grading, /tg-lookup-trigger/);
assert.match(recordTable, /transmutationTriggerClass/);
assert.match(recordTable, /transmutationTriggerAttrs/);
assert.match(ui, /openTransmutationTable/);
assert.match(ui, /setModalOpen/);
assert.match(ui, /tr\.is-match/);
assert.match(ui, /formatIg\(/);
assert.match(ui, /formatTg\(/);
assert.match(helpers, /transmutationTableModal: 'closeTransmutationTable'/);
assert.match(css, /\.transmutation-table tr\.is-match/);
assert.match(css, /\.is-ig-match/);
assert.match(css, /\.is-tg-match/);
assert.match(css, /\.transmutation-table-modal\[hidden\]/);
assert.match(css, /display:\s*none\s*!important/);
assert.ok(index.includes('css/transmutation-table.css'));
assert.ok(index.includes('js/transmutation-table-ui.js'));
assert.doesNotMatch(ui, /\sonclick=/);
assert.doesNotMatch(ui, /\sstyle=['"]/);

const androidTable = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'TransmutationTable.kt');
assert.match(androidTable, /fun TransmutationTableDialog/);
assert.match(androidTable, /object TransmutationTables/);
assert.match(androidTable, /formatInitialGrade/);
assert.match(androidTable, /"%.2f"/);
assert.match(androidTable, /formatTransmutedGrade/);
assert.match(androidTable, /dismissOnBackPress = true/);
assert.match(androidTable, /Tap to view transmutation table|matchIndex/);
const classDetail = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'ClassDetailScreen.kt');
assert.match(classDetail, /TransmutationTableDialog/);
assert.match(classDetail, /lookupGrade/);

console.log('Transmutation table lookup, highlight, and popup wiring tests passed.');
