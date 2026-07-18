const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const XLSX = require('xlsx');
const { readSf1Table } = require('../src/main/sf1-reader.js');

const root = path.join(__dirname, '..');
const learnerSource = fs.readFileSync(path.join(root, 'src/renderer/js/learners.js'), 'utf8');
const context = {
  console,
  Date,
  Intl,
  Object,
  Number,
  String,
  Array,
  RegExp,
  Math,
  JSON,
  trim: value => value === undefined || value === null ? '' : String(value).trim()
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(learnerSource, context, { filename: 'learners.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/import-export.js'), 'utf8'), context, { filename: 'import-export.js' });

assert.strictEqual(context.normalizeLearnerBirthdate('2010-07-18'), '2010-07-18');
assert.strictEqual(context.normalizeLearnerBirthdate('7/18/2010'), '2010-07-18');
assert.strictEqual(context.normalizeLearnerBirthdate('7/18/10'), '2010-07-18');
assert.strictEqual(context.normalizeLearnerBirthdate(40377), '2010-07-18');
assert.strictEqual(context.normalizeLearnerBirthdate('2010-02-30'), '');
assert.strictEqual(context.normalizeLearnerBirthdate('2099-01-01'), '');
assert.match(context.formatLearnerBirthdate('2010-07-18'), /Jul 18, 2010/);
assert(learnerSource.includes('id="modalLearnerBirthdate"'), 'Add Learner must include a birthdate field');
assert(learnerSource.includes('id="editLearnerBirthdate"'), 'Edit Learner must include a birthdate field');
assert(learnerSource.includes('>Birthdate</th>'), 'Class Roster must display a birthdate column');

const sf1Rows = context.extractSf1Learners([
  ['LRN', 'Last Name', 'First Name', 'Middle Name', 'Sex', 'Date of Birth'],
  ['123456789012', 'Dela Cruz', 'Juan', 'Abad', 'M', '7/18/2010'],
  ['123456789013', 'Reyes', 'Maria', '', 'F', '2099-01-01']
]);
assert.strictEqual(sf1Rows.length, 2);
assert.strictEqual(sf1Rows[0].birthdate, '2010-07-18');
assert.strictEqual(sf1Rows[0].birthdateImportError, undefined);
assert.match(sf1Rows[1].birthdateImportError, /valid date/);

const sf1Directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-birthdate-sf1-'));
try {
  const sf1Path = path.join(sf1Directory, 'mock-sf1.xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['LRN', 'Last Name', 'First Name', 'Middle Name', 'Sex', 'Birth Date'],
    ['123456789014', 'Santos', 'Ana', 'Reyes', 'F', new Date(Date.UTC(2011, 0, 9))]
  ], { cellDates: true });
  worksheet.F2.z = 'm/d/yyyy';
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'SF1');
  XLSX.writeFile(workbook, sf1Path);
  const physicalRows = context.extractSf1Learners(readSf1Table(sf1Path));
  assert.strictEqual(physicalRows.length, 1);
  assert.strictEqual(physicalRows[0].birthdate, '2011-01-09');
} finally {
  fs.rmSync(sf1Directory, { recursive: true, force: true });
}

global.normalizeLearnerBirthdate = context.normalizeLearnerBirthdate;
global.validateLearnerBirthdate = context.validateLearnerBirthdate;
const AdvisoryData = require('../src/renderer/js/advisory-data.js');
global.AdvisoryData = AdvisoryData;
const AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');
const profile = { schoolYear: '2026-2027', assignments: [] };
AdvisoryData.normalizeAdvisoryData(profile);
const advisoryClass = AdvisoryData.createClass(profile, {
  id: 'advisory-birthdate', schoolYear: profile.schoolYear, gradeLevel: '11', section: 'Integrity', adviserName: 'Teacher', isActive: true
});
const review = AdvisoryRoster.reviewLearners(profile, advisoryClass.id, [sf1Rows[0]], 'sf1');
const created = AdvisoryRoster.commitReviewedLearners(profile, advisoryClass.id, review, new Set([0]));
assert.strictEqual(created[0].birthdate, '2010-07-18');
assert.strictEqual(AdvisoryRoster.reviewLearners(profile, advisoryClass.id, [sf1Rows[1]], 'sf1')[0].status, 'invalid');

const databaseSource = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
const importExportSource = fs.readFileSync(path.join(root, 'src/renderer/js/import-export.js'), 'utf8');
const advisoryRosterSource = fs.readFileSync(path.join(root, 'src/renderer/js/advisory-roster.js'), 'utf8');
assert(databaseSource.includes('learner.birthdate = normalizeLearnerBirthdate'), 'database normalization must canonicalize class learner birthdates');
assert(importExportSource.includes('birthdate: normalizeLearnerBirthdate(learner.birthdate)'), 'transfer files must retain learner birthdates');
assert(importExportSource.includes('birthdate: normalizeLearnerBirthdate(sourceLearner.birthdate)'), 'cross-class roster copies must retain learner birthdates');
assert(advisoryRosterSource.includes('<th>Birthdate</th>'), 'Advisory rosters must display the birthdate column');

console.log('Learner birthdate normalization, SF1 parsing, Advisory import, transfer, and database wiring tests passed.');
