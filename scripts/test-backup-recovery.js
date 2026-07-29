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

function loadFileIo(appDataPath, sharedSyncStub = {}) {
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
      if (name === './shared-folder-sync') return {
        getDeviceInfo: () => ({ deviceId: '11111111-1111-4111-a111-111111111111' }),
        backupPaths: () => null,
        detectOneDriveRoots: () => [],
        verifyEnvelope: () => false,
        ...sharedSyncStub
      };
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
  assert.strictEqual(legacyProfile.backupRecoveryId, '', 'new and offline profiles must keep an empty Recovery ID');
  databaseContext.normalizeProfileRecord(legacyProfile);
  assert.strictEqual(legacyProfile.backupRecoveryId, '', 'normalization must not generate an ID');
  const stableRecoveryId = RecoveryId.generateBackupRecoveryId();
  const migratedUnused = databaseContext.normalizeRootDatabase({
    version: 6,
    activeProfileId: 'unused',
    profiles: [{ id: 'unused', backupRecoveryId: stableRecoveryId }]
  });
  assert.strictEqual(migratedUnused.version, 7);
  assert.strictEqual(migratedUnused.profiles[0].backupRecoveryId, '');
  assert.deepStrictEqual(Array.from(migratedUnused.profiles[0].backupRecoveryIdHistory), [stableRecoveryId]);
  const migratedUsed = databaseContext.normalizeRootDatabase({
    version: 6,
    activeProfileId: 'used',
    profiles: [{
      id: 'used',
      backupRecoveryId: stableRecoveryId,
      secondaryBackupPath: 'C:\\OneDrive\\E-Class Record'
    }]
  });
  assert.strictEqual(migratedUsed.profiles[0].backupRecoveryId, stableRecoveryId, 'configured backup identities must be preserved');
  const duplicateRoot = databaseContext.normalizeRootDatabase({
    version: 7,
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
    const firstRestorePoint = fileIO.createLocalRestorePoint('shared-sync');
    const secondRestorePoint = fileIO.createLocalRestorePoint('shared-sync');
    const localRestoreFolder = path.join(tempRoot, 'EClassRecordPortable', 'backups');
    assert.strictEqual(firstRestorePoint.success, true);
    assert.strictEqual(secondRestorePoint.success, true);
    assert.notStrictEqual(firstRestorePoint.filename, secondRestorePoint.filename, 'same-day sync operations must retain separate restore points');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(localRestoreFolder, firstRestorePoint.filename), 'utf8')),
      root,
      'the pre-sync restore point must contain the complete validated local root database'
    );
    root.profiles[0].backupRecoveryId = secondId;
    fileIO.saveDatabase(root);
    assert.strictEqual(fs.existsSync(firstFile), true, 'regeneration must not delete backups created with the old ID');
    assert.strictEqual(fs.existsSync(path.join(backupFolder, `eclass-record-backup-${secondId}.json`)), true);

    const organizedRoot = path.join(tempRoot, 'OneDrive', 'Organized');
    const organizedBackupDir = path.join(organizedRoot, 'E-Class Record', secondId, 'Backup');
    const organizedRestoreDir = path.join(organizedRoot, 'E-Class Record', secondId, 'Restore Points', '11111111-1111-4111-a111-111111111111');
    const organizedFileIO = loadFileIo(path.join(tempRoot, 'organized-app-data'), {
      detectOneDriveRoots: () => [path.join(tempRoot, 'OneDrive')],
      backupPaths: () => ({
        layoutVersion: 2,
        backupDir: organizedBackupDir,
        restorePointDir: organizedRestoreDir
      })
    });
    const organizedRootDatabase = {
      version: 7,
      activeProfileId: 'organized-profile',
      profiles: [{
        id: 'organized-profile',
        name: 'Organized Teacher',
        pinEnabled: false,
        backupRecoveryId: secondId,
        secondaryBackupPath: organizedRoot,
        sharedFolderSync: { enabled: true },
        data: profileData
      }]
    };
    organizedFileIO.saveDatabase(organizedRootDatabase);
    const latestDeviceBackup = path.join(organizedBackupDir, 'latest-11111111-1111-4111-a111-111111111111.json');
    assert.strictEqual(fs.existsSync(latestDeviceBackup), true);
    assert.strictEqual(fs.readdirSync(organizedRestoreDir).length, 1);
    assert.strictEqual(organizedFileIO.scanBackupDirectory(organizedRoot, secondId).matchCount, 2);
    const automaticallyDiscovered = organizedFileIO.discoverOneDriveBackups();
    const organizedDiscovery = automaticallyDiscovered.profiles.find(item => item.recoveryId === secondId);
    assert(organizedDiscovery);
    assert.strictEqual(organizedDiscovery.profileNameHint, 'Organized Teacher');
    assert.strictEqual(organizedDiscovery.backupAvailable, true);

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
    assert(preloadSource.includes('createDatabaseRestorePoint'));
    assert(preloadSource.includes('discoverOneDriveBackups'));
    assert(mainSource.includes("ipcMain.handle('backup:discover-onedrive'"));
    assert(htmlSource.includes('id="backupRecoveryIdValue"'));
    assert(htmlSource.includes('id="backupRecoverySearchInput"'));
    assert(htmlSource.includes('id="oneDriveBackupDiscoveryList"'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('Backup Recovery ID generation, discovery, encryption, integrity, compatibility, and regeneration tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
