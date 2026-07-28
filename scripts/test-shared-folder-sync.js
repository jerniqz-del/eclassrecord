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

function securityContext() {
  const context = {
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
    Error,
    BackupRecoveryId: RecoveryId
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'src/renderer/js/security.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'src/renderer/js/shared-sync-crypto.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'src/renderer/js/shared-sync-merge.js'), 'utf8'), context);
  return context;
}

function loadRepository(appDataPath) {
  const syncModule = { exports: {} };
  const context = {
    module: syncModule,
    exports: syncModule.exports,
    console,
    Buffer,
    Date,
    process,
    require(name) {
      if (name === 'electron') return { app: { getPath: () => appDataPath } };
      if (name === '../renderer/js/backup-recovery-id') return RecoveryId;
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'src/main/shared-folder-sync.js'), 'utf8'), context);
  return syncModule.exports;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

(async () => {
  const secure = securityContext();
  const recoveryId = RecoveryId.generateBackupRecoveryId();
  const deviceOne = '11111111-1111-4111-a111-111111111111';
  const deviceTwo = '22222222-2222-4222-a222-222222222222';
  const baseRevision = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const syncKey = secure.SharedSyncCrypto.generateSyncKey();
  const baseProfile = {
    version: 6,
    lastUpdatedAt: 'ignored',
    secondaryBackupPath: 'C:\\Device One\\OneDrive',
    sharedSyncKey: syncKey,
    teacherName: 'Teacher',
    activeView: 'record',
    autoBlur: false,
    assignments: [{
      id: 'class-1',
      section: 'Molave',
      learners: [
        { id: 'learner-1', firstName: 'Ana' },
        { id: 'learner-2', firstName: 'Ben' }
      ],
      assessments: [
        { id: 'assessment-1', title: 'WW 1' },
        { id: 'assessment-2', title: 'WW 2' }
      ],
      scores: {
        'learner-1|assessment-1': 80,
        'learner-2|assessment-2': 75
      }
    }],
    advisory: { schemaVersion: 2, classes: [], learners: [], subjects: [], grades: [], importBatches: [], sourceMappings: [] }
  };

  const canonical = secure.SharedSyncCrypto.canonicalProfile(baseProfile);
  assert.strictEqual(canonical.secondaryBackupPath, undefined);
  assert.strictEqual(canonical.sharedSyncKey, undefined);
  assert.strictEqual(canonical.lastUpdatedAt, undefined);
  assert.strictEqual(canonical.activeView, 'record', 'portable navigation state should synchronize');
  assert.strictEqual(canonical.autoBlur, false, 'portable profile preferences should synchronize');

  const envelope = await secure.SharedSyncCrypto.createSyncEnvelope(baseProfile, syncKey, '123456', {
    appVersion: 'test',
    backupRecoveryId: recoveryId,
    revisionId: baseRevision,
    baseRevisionId: baseRevision,
    deviceId: deviceOne,
    deviceLabel: 'Home Laptop'
  });
  await assert.rejects(() => secure.SharedSyncCrypto.openSyncEnvelope(envelope), /requires its PIN/);
  await assert.rejects(() => secure.SharedSyncCrypto.openSyncEnvelope(envelope, { pin: '654321' }), /Incorrect PIN/);
  const openedByPin = await secure.SharedSyncCrypto.openSyncEnvelope(envelope, { pin: '123456' });
  assert.deepStrictEqual(openedByPin.profile, canonical);
  assert.strictEqual(openedByPin.syncKey, syncKey);
  assert.deepStrictEqual((await secure.SharedSyncCrypto.openSyncEnvelope(envelope, { syncKey })).profile, canonical);

  const tamperedEnvelope = clone(envelope);
  tamperedEnvelope.dataDigest = '0'.repeat(64);
  await assert.rejects(() => secure.SharedSyncCrypto.openSyncEnvelope(tamperedEnvelope, { syncKey }), /integrity/);

  const localSeparate = clone(canonical);
  const remoteSeparate = clone(canonical);
  localSeparate.assignments[0].scores['learner-1|assessment-1'] = 85;
  remoteSeparate.assignments[0].scores['learner-2|assessment-2'] = 79;
  const separateMerge = secure.SharedSyncMerge.mergeThreeWay(canonical, localSeparate, remoteSeparate);
  assert.strictEqual(separateMerge.conflicts.length, 0);
  assert.strictEqual(separateMerge.merged.assignments[0].scores['learner-1|assessment-1'], 85);
  assert.strictEqual(separateMerge.merged.assignments[0].scores['learner-2|assessment-2'], 79);

  const localConflict = clone(canonical);
  const remoteConflict = clone(canonical);
  localConflict.assignments[0].scores['learner-1|assessment-1'] = 86;
  remoteConflict.assignments[0].scores['learner-1|assessment-1'] = 90;
  const conflictMerge = secure.SharedSyncMerge.mergeThreeWay(canonical, localConflict, remoteConflict);
  assert.strictEqual(conflictMerge.conflicts.length, 1);
  const conflictPath = conflictMerge.conflicts[0].path;
  const remoteChoice = secure.SharedSyncMerge.mergeThreeWay(canonical, localConflict, remoteConflict, { [conflictPath]: 'remote' });
  assert.strictEqual(remoteChoice.merged.assignments[0].scores['learner-1|assessment-1'], 90);

  const localDelete = clone(canonical);
  const remoteEdit = clone(canonical);
  localDelete.assignments[0].learners = localDelete.assignments[0].learners.filter(item => item.id !== 'learner-1');
  remoteEdit.assignments[0].learners[0].firstName = 'Ana Marie';
  const deleteMerge = secure.SharedSyncMerge.mergeThreeWay(canonical, localDelete, remoteEdit);
  assert.strictEqual(deleteMerge.conflicts.length, 1);
  assert.strictEqual(deleteMerge.conflicts[0].kind, 'edit-versus-delete');

  const localAdd = clone(canonical);
  const remoteAdd = clone(canonical);
  localAdd.assignments[0].learners.push({ id: 'learner-new', firstName: 'Local' });
  remoteAdd.assignments[0].learners.push({ id: 'learner-new', firstName: 'Remote' });
  const addMerge = secure.SharedSyncMerge.mergeThreeWay(canonical, localAdd, remoteAdd);
  assert.strictEqual(addMerge.conflicts.length, 1);
  assert.strictEqual(addMerge.conflicts[0].kind, 'same-id-added-differently');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-shared-sync-'));
  try {
    const repository = loadRepository(tempRoot);
    const selectedFolder = path.join(tempRoot, 'Shared Folder');
    fs.mkdirSync(selectedFolder, { recursive: true });
    const configured = repository.configureFolder(recoveryId, selectedFolder);
    assert.strictEqual(configured.configured, true);
    assert.strictEqual(configured.available, true);
    const localDevice = repository.getDeviceInfo();

    const localEnvelope = await secure.SharedSyncCrypto.createSyncEnvelope(baseProfile, syncKey, '123456', {
      appVersion: 'test',
      backupRecoveryId: recoveryId,
      revisionId: baseRevision,
      baseRevisionId: baseRevision,
      deviceId: localDevice.deviceId,
      deviceLabel: localDevice.deviceLabel
    });
    repository.writeEnvelope('base', recoveryId, JSON.stringify(localEnvelope));
    repository.writeEnvelope('head', recoveryId, JSON.stringify(localEnvelope));
    const firstScan = repository.scan(recoveryId);
    assert.strictEqual(firstScan.heads.length, 1);
    assert.strictEqual(firstScan.bases.length, 1);
    assert.strictEqual(JSON.parse(repository.read(firstScan.heads[0].handle).content).revisionId, baseRevision);

    const remoteRevision = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
    const remoteEnvelope = await secure.SharedSyncCrypto.createSyncEnvelope(remoteSeparate, syncKey, '123456', {
      appVersion: 'test',
      backupRecoveryId: recoveryId,
      revisionId: remoteRevision,
      baseRevisionId: baseRevision,
      parentRevisionIds: [baseRevision],
      deviceId: deviceTwo,
      deviceLabel: 'School PC'
    });
    await assert.rejects(
      async () => repository.writeEnvelope('head', recoveryId, JSON.stringify(remoteEnvelope)),
      /only write its own/
    );
    const paths = repository.repositoryPaths(recoveryId);
    fs.writeFileSync(path.join(paths.heads, `${deviceTwo}.json`), JSON.stringify(remoteEnvelope));
    const twoDeviceScan = repository.scan(recoveryId);
    assert.strictEqual(twoDeviceScan.heads.length, 2);
    assert(twoDeviceScan.heads.some(item => item.deviceLabel === 'School PC'));

    const corrupted = clone(remoteEnvelope);
    corrupted.dataDigest = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(path.join(paths.heads, '33333333-3333-4333-a333-333333333333.json'), JSON.stringify(corrupted));
    assert.strictEqual(repository.scan(recoveryId).heads.length, 2, 'tampered heads must be ignored');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const mainSource = fs.readFileSync(path.join(projectRoot, 'src/main/main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(projectRoot, 'src/main/preload.js'), 'utf8');
  const databaseSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/js/database.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  assert(mainSource.includes("ipcMain.handle('shared-sync:scan'"));
  assert(preloadSource.includes('scanSharedSyncFolder'));
  assert(databaseSource.includes('window.SharedFolderSync?.schedulePublish?.()'));
  assert(htmlSource.includes('id="sharedSyncIndicator"'));
  assert(htmlSource.includes('id="btnSharedSyncReview"'));

  console.log('Shared Folder Sync encryption, repository isolation, status wiring, and three-way merge tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
