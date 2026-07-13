const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
const AdvisoryRoster = require('../src/renderer/js/advisory-roster.js');

function profileWithClass() {
  const profile = { schoolYear: '2026-2027', assignments: [] };
  AdvisoryData.normalizeAdvisoryData(profile);
  const advisoryClass = AdvisoryData.createClass(profile, {
    id: 'advisory-1', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Teacher', isActive: true
  });
  return { profile, advisoryClass };
}

// Manual validation covers required names, LRN format, and official-name characters.
{
  assert.deepStrictEqual(AdvisoryRoster.validateLearner(AdvisoryRoster.normalizeIncoming({ lastName: 'Dela Cruz', firstName: 'Juan', lrn: '123456789012' })), []);
  assert(AdvisoryRoster.validateLearner(AdvisoryRoster.normalizeIncoming({ lastName: '', firstName: 'Juan', lrn: '123' })).length >= 2);
  assert(AdvisoryRoster.validateLearner(AdvisoryRoster.normalizeIncoming({ lastName: 'Cruz<script>', firstName: 'Juan' })).some(error => /unsupported/.test(error)));
}

// Existing-class imports preserve the source and prioritize exact LRN matches.
{
  const { profile, advisoryClass } = profileWithClass();
  const sourceClass = {
    id: 'class-source',
    learners: [
      { id: 'source-1', lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', sex: 'M', birthdate: '2015-01-02' },
      { id: 'source-2', lrn: '123456789013', lastName: 'Reyes', firstName: 'Maria', sex: 'F' }
    ]
  };
  const sourceSnapshot = JSON.stringify(sourceClass);
  AdvisoryData.createLearner(profile, { id: 'existing-1', advisoryClassId: advisoryClass.id, lrn: '123456789012', lastName: 'Different', firstName: 'Name' });
  const review = AdvisoryRoster.reviewLearners(profile, advisoryClass.id, sourceClass.learners, `existing-class:${sourceClass.id}`);
  assert.strictEqual(review[0].status, 'existing-lrn');
  assert.strictEqual(review[1].status, 'add');
  const created = AdvisoryRoster.commitReviewedLearners(profile, advisoryClass.id, review, new Set([1]));
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].linkedLearnerId, 'source-2');
  assert.strictEqual(created[0].source, 'existing-class:class-source');
  assert.strictEqual(JSON.stringify(sourceClass), sourceSnapshot, 'source subject class must remain unchanged');
}

// Safe normalized-name fallback is used only when unambiguous.
{
  const { profile, advisoryClass } = profileWithClass();
  AdvisoryData.createLearner(profile, { id: 'existing-1', advisoryClassId: advisoryClass.id, lrn: '', lastName: 'Dela-Cruz', firstName: 'Juán', middleName: 'S.' });
  let review = AdvisoryRoster.reviewLearners(profile, advisoryClass.id, [{ lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'S' }], 'sf1');
  assert.strictEqual(review[0].status, 'existing-name');

  AdvisoryData.createLearner(profile, { id: 'existing-2', advisoryClassId: advisoryClass.id, lrn: '', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'S' });
  review = AdvisoryRoster.reviewLearners(profile, advisoryClass.id, [{ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'S' }], 'sf1');
  assert.strictEqual(review[0].status, 'ambiguous');
  assert.strictEqual(review[0].selected, false);
}

// Incoming duplicates and conflicting LRNs are held for review.
{
  const { profile, advisoryClass } = profileWithClass();
  AdvisoryData.createLearner(profile, { id: 'existing-1', advisoryClassId: advisoryClass.id, lrn: '999999999999', lastName: 'Cruz', firstName: 'Juan' });
  const review = AdvisoryRoster.reviewLearners(profile, advisoryClass.id, [
    { lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan' },
    { lrn: '123456789012', lastName: 'Reyes', firstName: 'Maria' },
    { lrn: '123456789014', lastName: 'Reyes', firstName: 'Maria' }
  ], 'bulk-entry');
  assert.strictEqual(review[0].status, 'ambiguous');
  assert.strictEqual(review[1].status, 'duplicate-incoming');
  assert.strictEqual(review[2].status, 'duplicate-incoming');
}

// Bulk input accepts tabular and teacher-friendly name formats, retaining invalid rows for review.
{
  const learners = AdvisoryRoster.parseBulkText('LRN\tLast Name\tFirst Name\tSex\n123456789012\tDela Cruz\tJuan\tM\nReyes, Maria Santos\n123\tInvalid\tLRN\tF');
  assert.strictEqual(learners.length, 3);
  assert.strictEqual(learners[0].lrn, '123456789012');
  assert.strictEqual(learners[0].sex, 'M');
  assert.strictEqual(learners[1].lastName, 'Reyes');
  const { profile, advisoryClass } = profileWithClass();
  const review = AdvisoryRoster.reviewLearners(profile, advisoryClass.id, learners, 'bulk-entry');
  assert.strictEqual(review[2].status, 'invalid');
  assert.strictEqual(review.filter(row => row.status === 'add').length, 2);
}

// Removing an advisory learner never removes the linked subject-class learner.
{
  const { profile, advisoryClass } = profileWithClass();
  profile.assignments.push({ id: 'source', learners: [{ id: 'source-1', lrn: '123456789012' }] });
  const linked = AdvisoryData.createLearner(profile, { id: 'advisory-learner', advisoryClassId: advisoryClass.id, linkedLearnerId: 'source-1', lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan' });
  AdvisoryData.deleteLearner(profile, linked.id);
  assert.strictEqual(profile.assignments[0].learners.length, 1);
}

// The SF1 UI reuses the supported parser and always enters the shared preview path.
{
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/advisory-roster.js'), 'utf8');
  const sf1Function = source.slice(source.indexOf('async function importSf1Roster'), source.indexOf('function removeLearner'));
  assert(sf1Function.includes('electronAPI.importSf1()'));
  assert(sf1Function.includes('extractSf1Learners(result.table)'));
  assert(sf1Function.includes("showImportPreview(learners, 'sf1'"));
  assert(!sf1Function.includes('createLearner('), 'SF1 rows must not bypass preview');
}

console.log('Advisory roster validation, matching, and import tests passed.');
