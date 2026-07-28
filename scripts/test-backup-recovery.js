const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { TextDecoder, TextEncoder } = require('util');
const { webcrypto } = require('crypto');

const projectRoot = path.join(__dirname, '..');
const RecoveryId = require('../src/renderer/js/backup-recovery-id');

function stableStringify(value) {
  function normalize(item) {
    if (!item || typeof item !== 'object') return item;
    if (Array.isArray(item)) return item.map(normalize);
    return Object.keys(item).sort().reduce((output, key) => {
      if (item[key] !== undefined) output[key] = normalize(item[key]);
      return output;
    }, {});
  }
  return JSON.stringify(normalize(value));
}

function loadFileIo(appDataPath) {
  const fileIoModule = { exports: {} };
  const context = {
    module: fileIoModule,
    exports: fileIoModule.exports,
    console,
    Buffer,
    Date,
    process,
    require(name) {
      if (name === 'electron') return { app: { getPath: () => appDataPath, getVersion: () => '1.6.8-test' } };
      if (name === '../renderer/js/backup-recovery-id') return RecoveryId;
      if (name === './shared-folder-sync') return { getDeviceInfo: () => ({ deviceId: '11111111-1111-4111-a111-111111111111' }) };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'src/main/file-io.js'), 'utf8'), context);
  return fileIoModule.exports;
}

function resignEnvelope(envelope) {
  const core = { ...envelope };
  delete core.integrity;
  envelope.integrity = {
    version: 1,
    algorithm: 'SHA-256',
    digest: crypto.createHash('sha256').update(stableStringify(core)).digest('hex')
  };
  return envelope;
}

(async () => {
  const generated = RecoveryId.generateBackupRecoveryId();
  assert.match(generated, /^ECR-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/);
  assert.strictEqual(RecoveryId.normalizeBackupRecoveryId(generated.toLowerCase().replace(/-/g, ' ')), generated);
  assert.strictEqual(RecoveryId.normalizeBackupRecoveryId('teacher@example.com'), '');

  const databaseContext = {
    BackupRecoveryId: RecoveryId,
    createAdvisoryStore: () => ({}),
    console,
    Date,
    JSON,
    Number,
    Object,
    Array,
    String,
    Error
  };
  databaseContext.window = databaseContext;
  vm.createContext(databaseContext);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'src/renderer/js/database.js'), 'utf8'), databaseContext);
  const legacyProfile = { id: 'legacy-profile', data: { assignments: [] } };
  databaseContext.normalizeProfileRecord(legacyProfile);
  const stableRecoveryId = legacyProfile.backupRecoveryId;
  databaseContext.normalizeProfileRecord(legacyProfile);
  assert.strictEqual(legacyProfile.backupRecoveryId, stableRecoveryId, 'normalization must not replace an existing Recovery ID');
  const duplicateRoot = databaseContext.normalizeRootDatabase({
    version: 5,
    activeProfileId: 'one',
    profiles: [
      { id: 'one', backupRecoveryId: stableRecoveryId },
      { id: 'two', backupRecoveryId: stableRecoveryId }
    ]
  });
  assert.notStrictEqual(duplicateRoot.profiles[0].backupRecoveryId, duplicateRoot.profiles[1].backupRecoveryId);

  const securityContext = {
    crypto: webcrypto,
    console,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Date,
    JSON,
    WeakSet,
    Object,
    Array,
    String,
    Number,
    Error
  };
  securityContext.window = securityContext;
  securityContext.globalThis = securityContext;
  vm.createContext(securityContext);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'src/renderer/js/security.js'), 'utf8'), securityContext);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-backup-discovery-'));
  try {
    const fileIO = loadFileIo(tempRoot);
    const backupFolder = path.join(tempRoot, 'OneDrive', 'E-Class Record');
    const rollingFolder = path.join(backupFolder, 'backups');
    fs.mkdirSync(rollingFolder, { recursive: true });

    const profileData = { version: 5, teacherName: 'Recovery Teacher', assignments: [] };
    const encryptedPayload = await securityContext.encryptPayload(JSON.stringify(profileData), '123456');
    const activeProfile = {
      id: 'profile-one',
      name: 'Recovery Teacher',
      pinEnabled: true,
      backupRecoveryId: stableRecoveryId,
      data: encryptedPayload
    };
    const older = fileIO.createSecondaryBackupEnvelope(activeProfile);
    older.createdAt = '2026-07-20T08:00:00.000Z';
    resignEnvelope(older);
    const newer = fileIO.createSecondaryBackupEnvelope(activeProfile);
    newer.createdAt = '2026-07-21T08:00:00.000Z';
    resignEnvelope(newer);

    assert.strictEqual(newer.backupRecoveryId, stableRecoveryId);
    assert.strictEqual(newer.profileNameHint, 'Recovery Teacher');
    assert.strictEqual(newer.protection, 'pin-aes-256-gcm');
    assert.strictEqual(fileIO.verifyBackupEnvelopeIntegrity(newer), true);

    fs.writeFileSync(path.join(backupFolder, `eclass-record-backup-${stableRecoveryId}.json`), JSON.stringify(older));
    fs.writeFileSync(path.join(rollingFolder, `backup-${stableRecoveryId}-2026-07-21.json`), JSON.stringify(newer));
    fs.writeFileSync(path.join(backupFolder, 'unrelated.json'), '{malformed');

    const wrongId = RecoveryId.generateBackupRecoveryId();
    assert.strictEqual(fileIO.scanBackupDirectory(backupFolder, wrongId).latest, null);

    const found = fileIO.scanBackupDirectory(backupFolder, stableRecoveryId);
    assert.strictEqual(found.matchCount, 2);
    assert.strictEqual(found.latest.createdAt, newer.createdAt);
    assert.strictEqual(found.latest.protection, 'pin-aes-256-gcm');
    await assert.rejects(() => securityContext.openBackupEnvelope(newer), /requires its PIN/);
    assert.deepStrictEqual(await securityContext.openBackupEnvelope(newer, '123456'), profileData);

    const tampered = JSON.parse(JSON.stringify(newer));
    tampered.payload.ciphertext = `${tampered.payload.ciphertext.slice(0, -2)}00`;
    fs.writeFileSync(path.join(rollingFolder, `backup-${stableRecoveryId}-2026-07-22.json`), JSON.stringify(tampered));
    const afterTamper = fileIO.scanBackupDirectory(backupFolder, stableRecoveryId);
    assert.strictEqual(afterTamper.latest.createdAt, newer.createdAt);
    assert.strictEqual(afterTamper.invalidMatchingFiles, 1);
    assert.throws(
      () => fileIO.readValidDiscoveredBackup(path.join(rollingFolder, `backup-${stableRecoveryId}-2026-07-22.json`), stableRecoveryId),
      /integrity/
    );

    const firstId = RecoveryId.generateBackupRecoveryId();
    const secondId = RecoveryId.generateBackupRecoveryId();
    const root = {
      version: 5,
      activeProfileId: 'profile-save',
      profiles: [{
        id: 'profile-save',
        name: 'Filename Teacher',
        pinEnabled: false,
        backupRecoveryId: firstId,
        secondaryBackupPath: backupFolder,
        data: profileData
      }]
    };
    fileIO.saveDatabase(root);
    const firstFile = path.join(backupFolder, `eclass-record-backup-${firstId}.json`);
    assert.strictEqual(fs.existsSync(firstFile), true);
    root.profiles[0].backupRecoveryId = secondId;
    fileIO.saveDatabase(root);
    assert.strictEqual(fs.existsSync(firstFile), true, 'regeneration must not delete backups created with the old ID');
    assert.strictEqual(fs.existsSync(path.join(backupFolder, `eclass-record-backup-${secondId}.json`)), true);

    const AdvisoryBackup = require('../src/renderer/js/advisory-backup');
    global.AdvisoryData = require('../src/renderer/js/advisory-data');
    const legacyRawBackup = { version: 1, assignments: [] };
    assert.doesNotThrow(() => AdvisoryBackup.prepareRestoredDatabase(legacyRawBackup));

    const mainSource = fs.readFileSync(path.join(projectRoot, 'src/main/main.js'), 'utf8');
    const preloadSource = fs.readFileSync(path.join(projectRoot, 'src/main/preload.js'), 'utf8');
    const htmlSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
    assert(mainSource.includes("ipcMain.handle('backup:select-and-scan'"));
    assert(mainSource.includes("ipcMain.handle('backup:read-discovered'"));
    assert(preloadSource.includes('selectAndScanBackupFolder'));
    assert(htmlSource.includes('id="backupRecoveryIdValue"'));
    assert(htmlSource.includes('id="backupRecoverySearchInput"'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('Backup Recovery ID generation, discovery, encryption, integrity, compatibility, and regeneration tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
