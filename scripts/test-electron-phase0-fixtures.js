const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Fixtures = require('./electron-phase0-fixtures');
const BackupRecoveryId = require('../src/renderer/js/backup-recovery-id');
const AdvisoryData = require('../src/renderer/js/advisory-data');
const AdvisoryBackup = require('../src/renderer/js/advisory-backup');

const root = path.resolve(__dirname, '..');
const all = Fixtures.fixtures();
const required = [
  'empty', 'singleProfile', 'multiProfile', 'encryptedProfile', 'unprotectedProfile',
  'pairedMobile', 'sharedFolder', 'advisory', 'largeClass', 'corrupted', 'legacyBackup',
];
assert.deepStrictEqual(Object.keys(all), required);

const context = {
  BackupRecoveryId,
  createAdvisoryStore: AdvisoryData.createAdvisoryStore,
  console,
  Date,
  JSON,
  Number,
  Object,
  Array,
  String,
  Error,
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'database.js'), 'utf8'), context);

for (const name of ['empty', 'singleProfile', 'multiProfile', 'encryptedProfile', 'unprotectedProfile', 'sharedFolder', 'advisory', 'largeClass']) {
  const normalized = context.normalizeRootDatabase(JSON.parse(JSON.stringify(all[name])));
  assert(normalized.version >= 7, `${name} did not normalize to root schema 7.`);
  assert(Array.isArray(normalized.profiles), `${name} did not retain a profiles array.`);
  if (normalized.activeProfileId) {
    assert(normalized.profiles.some(profile => profile.id === normalized.activeProfileId), `${name} has an invalid active profile.`);
  }
}

assert.strictEqual(all.multiProfile.profiles.length, 2);
assert.strictEqual(all.encryptedProfile.profiles[0].data.encryptionVersion, 2);
assert.strictEqual(all.unprotectedProfile.profiles[0].pinEnabled, false);
assert.strictEqual(all.pairedMobile.pairing.schemaVersion, 2);
assert.match(all.pairedMobile.pairing.certificateFingerprint, /^[a-f0-9]{64}$/);
assert.strictEqual(all.sharedFolder.profiles[0].sharedFolderSync.enabled, true);
assert.strictEqual(all.advisory.profiles[0].data.advisory.schemaVersion, 2);
assert.strictEqual(all.largeClass.profiles[0].data.assignments[0].learners.length, 250);
assert.throws(() => JSON.parse(all.corrupted), SyntaxError);

const migratedLegacy = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(JSON.stringify(all.legacyBackup)));
assert.strictEqual(migratedLegacy.advisory.schemaVersion, 2);
assert.strictEqual(migratedLegacy.assignments[0].id, 'synthetic-legacy-class-001');

const serialized = JSON.stringify(all);
for (const forbidden of ['Juan', 'Dela Cruz', 'Maria', 'Santos', '@deped', 'teacher@example']) {
  assert(!serialized.includes(forbidden), `Fixture contains prohibited real-looking marker: ${forbidden}`);
}
assert(serialized.includes('Synthetic Teacher'));
assert(serialized.includes('TestFirst'));

const source = fs.readFileSync(path.join(root, 'scripts', 'electron-phase0-fixtures.js'), 'utf8');
assert(!/OneDrive - Department of Education|PrimePC|Monbon|Diamond/.test(source), 'Fixture source contains an environment or production marker.');

console.log('All 11 sanitized Phase 0 compatibility fixtures passed normalization, migration, corruption, scale, and privacy checks.');
