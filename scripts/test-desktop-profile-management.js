const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'js', 'profile-management.js'), 'utf8');
const html = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'src', 'renderer', 'css', 'components.css'), 'utf8');

let root = {
  version: 7,
  activeProfileId: '',
  profiles: [{
    id: 'profile-one',
    name: 'Teacher One',
    pinEnabled: true,
    salt: 'salt',
    pinHash: 'hash',
    currentPin: '654321',
    data: { secureBackup: true, ciphertext: 'encrypted-profile-data' },
    sharedFolderSync: { enabled: true },
  }],
};
let exportResult = { success: true, path: 'D:/Backups/profile.json' };
let importedContent = '';
let exportedRootProfileCount = -1;
let restorePointCreated = false;
let renderCount = 0;
let saveSucceeds = true;
const storage = new Map([
  ['eclass.bluetooth.pairings.v2', JSON.stringify([{ profileId: 'profile-one' }])],
]);

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = {
  console,
  JSON,
  Date,
  setTimeout,
  clearTimeout,
  currentProfilePin: '',
  sessionActive: false,
  selectedProfileIdToUnlock: '',
  getRootDatabase: () => root,
  replaceRootDatabase: next => { root = next; return root; },
  normalizeProfileRecord: profile => profile,
  createIntegrityDescriptor: async value => ({ version: 1, algorithm: 'SHA-256', digest: digest(value) }),
  verifyIntegrityDescriptor: async (value, descriptor) => descriptor?.digest === digest(value),
  saveRootDatabase: async () => saveSucceeds,
  renderProfiles: () => { renderCount += 1; },
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  document: {},
};
context.window = context;
context.electronAPI = {
  getVersion: async () => '1.9.6',
  exportJson: async () => {
    exportedRootProfileCount = root.profiles.length;
    return exportResult;
  },
  importJson: async () => ({ success: true, content: importedContent }),
  createDatabaseRestorePoint: async reason => { restorePointCreated = reason === 'profile-delete'; },
  stopCompanionWlan: async () => ({ running: false }),
};
context.toast = () => {};

vm.runInNewContext(source, context, { filename: 'profile-management.js' });
const manager = context.DesktopProfileManager;
assert(manager, 'Desktop profile manager should be exposed.');

(async () => {
  const envelope = await manager.buildProfileBackupEnvelope(root.profiles[0]);
  assert.strictEqual(envelope.format, 'eclass-record-profile-backup');
  assert.strictEqual(envelope.backupVersion, 1);
  assert.strictEqual(envelope.profile.data.ciphertext, 'encrypted-profile-data');
  assert.strictEqual(envelope.profile.currentPin, undefined, 'Transient plaintext PINs must never enter a profile backup.');
  assert(await manager.validateProfileBackupEnvelope(envelope));

  const corrupt = JSON.parse(JSON.stringify(envelope));
  corrupt.profile.name = 'Modified';
  await assert.rejects(() => manager.validateProfileBackupEnvelope(corrupt), /integrity check failed/);

  importedContent = JSON.stringify(envelope);
  const deleted = await manager.deleteProfileWithBackup('profile-one');
  assert.strictEqual(deleted.success, true);
  assert.strictEqual(exportedRootProfileCount, 1, 'The backup must be exported before the profile is removed.');
  assert.strictEqual(restorePointCreated, true);
  assert.strictEqual(root.profiles.length, 0);
  assert.deepStrictEqual(JSON.parse(storage.get('eclass.bluetooth.pairings.v2')), []);

  const restored = await manager.restoreProfileBackup();
  assert.strictEqual(restored.success, true);
  assert.strictEqual(root.profiles.length, 1);
  assert.strictEqual(root.profiles[0].id, 'profile-one');
  assert.strictEqual(root.profiles[0].currentPin, undefined);

  root.profiles.push({ id: 'profile-two', name: 'Teacher Two', data: {} });
  exportResult = { success: false };
  const canceled = await manager.deleteProfileWithBackup('profile-two');
  assert.strictEqual(canceled.canceled, true);
  assert(root.profiles.some(profile => profile.id === 'profile-two'), 'Canceling backup export must cancel deletion.');

  saveSucceeds = false;
  exportResult = { success: true, path: 'D:/Backups/profile.json' };
  await assert.rejects(() => manager.deleteProfileWithBackup('profile-two'), /left unchanged/);
  assert(root.profiles.some(profile => profile.id === 'profile-two'), 'A failed database save must roll profile deletion back.');

  assert.match(html, /Restore Profile Backup/);
  assert.match(html, /DesktopProfileManager\.open\(\)/);
  assert.match(html, /js\/profile-management\.js/);
  assert.match(css, /\.profile-delete-warning/);
  assert.match(source, /Save Backup &amp; Delete/);
  assert.match(source, /createDatabaseRestorePoint\?\.\('profile-delete'\)/);
  assert.match(source, /All classes, learners, grades, attendance, calendar data, settings, and sync metadata/);
  console.log('Desktop profile backup, deletion, rollback, and restore tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
