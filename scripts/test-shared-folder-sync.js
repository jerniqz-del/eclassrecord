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

function loadRendererSyncHarness(secure, options) {
  let activeDatabase = clone(options.localProfile);
  let pendingOperation = Promise.resolve();
  const events = [];
  const profile = {
    id: 'profile-local',
    pinEnabled: true,
    backupRecoveryId: options.localRecoveryId === undefined ? options.recoveryId : options.localRecoveryId,
    sharedFolderSync: {
      enabled: false,
      baseRevisionId: '',
      ownRevisionId: '',
      integratedRevisionIds: [],
      lastPublishedDigest: '',
      lastFolderWriteAt: '',
      lastCheckedAt: '',
      lastError: ''
    }
  };
  const root = { activeProfileId: profile.id, profiles: [profile] };
  const scanResult = {
    heads: options.scanEmpty ? [] : [clone(options.remoteMeta)],
    bases: []
  };
  const context = {
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Error,
    Promise,
    navigator: { onLine: true },
    document: {
      body: { appendChild() {} },
      getElementById() { return null; },
      querySelector() { return null; },
      visibilityState: 'visible'
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    SharedSyncCrypto: secure.SharedSyncCrypto,
    SharedSyncMerge: secure.SharedSyncMerge,
    BackupRecoveryId: RecoveryId,
    getRootDatabase: () => root,
    getActiveProfileDatabase: () => activeDatabase,
    getCurrentProfilePin: () => '123456',
    async replaceActiveProfilePin(pin) {
      events.push(`replace-pin:${pin}`);
      return true;
    },
    promptPinVerification(callback) {
      pendingOperation = Promise.resolve().then(callback);
    },
    esc: value => String(value),
    toast() {},
    prepareRestoredDatabase(value) { return value; },
    async applyRestoredProfileDatabase(value) {
      events.push('apply-local');
      activeDatabase = clone(value);
      return true;
    },
    async saveDatabase() { return true; },
    async saveRootDatabase() { return true; },
    electronAPI: {
      async configureSharedSyncFolder() {
        events.push('configure');
        return { canceled: false, configured: true, available: true };
      },
      async configureSelectedSharedSyncFolder(_recoveryId, folderPath) {
        events.push(`configure-selected:${folderPath}`);
        return { canceled: false, configured: true, available: true };
      },
      async inspectSelectedSharedSyncFolder() {
        events.push('inspect-selected');
        return clone(scanResult);
      },
      async selectOneDriveSyncFolder() {
        return { canceled: false, folderPath: options.folderPath || 'C:\\OneDrive\\E-Class Record' };
      },
      async disableSharedSync() {
        events.push('disable-folder');
        return { configured: false };
      },
      async scanSharedSyncFolder() {
        events.push('scan');
        return clone(scanResult);
      },
      async readSharedSyncFile() {
        events.push('read-head');
        return { content: JSON.stringify(options.remoteEnvelope) };
      },
      async getSharedSyncDeviceInfo() {
        return { deviceId: options.localDeviceId, deviceLabel: 'Joining PC' };
      },
      async getVersion() { return 'test'; },
      async getSharedSyncState() {
        events.push('folder-state');
        return { configured: true, available: true };
      },
      async createSharedSyncRestorePoint() {
        events.push('restore-point');
        return { success: true };
      },
      async writeSharedSyncBase() {
        events.push('write-base');
        if (options.failWrite) throw new Error('simulated OneDrive write failure');
        return { success: true };
      },
      async writeSharedSyncHead() {
        events.push('write-head');
        return { success: true };
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'src/renderer/js/shared-folder-sync.js'), 'utf8'), context);
  return {
    context,
    profile,
    events,
    activeDatabase: () => activeDatabase,
    runEnable: async () => {
      context.SharedFolderSync.toggleSync();
      await pendingOperation;
    },
    runConnect: async () => {
      context.SharedFolderSync.connectExisting({
        recoveryId: options.recoveryId,
        folderPath: options.folderPath || 'C:\\OneDrive\\E-Class Record',
        remotePin: options.connectPin || '123456'
      });
      await pendingOperation;
    },
    runPublish: async () => {
      await context.SharedFolderSync.publishNow({ skipCheck: true });
    }
  };
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

  const joinHarness = loadRendererSyncHarness(secure, {
    recoveryId,
    localProfile: canonical,
    localDeviceId: deviceTwo,
    remoteEnvelope: envelope,
    remoteMeta: {
      handle: 'remote-head',
      revisionId: envelope.revisionId,
      baseRevisionId: envelope.baseRevisionId,
      parentRevisionIds: envelope.parentRevisionIds,
      integratedRevisionIds: envelope.integratedRevisionIds,
      deviceId: envelope.deviceId,
      deviceLabel: envelope.deviceLabel,
      createdAt: envelope.createdAt,
      dataDigest: envelope.dataDigest,
      appVersion: envelope.appVersion,
      profileSchemaVersion: envelope.profileSchemaVersion
    }
  });
  await joinHarness.runEnable();
  assert.strictEqual(joinHarness.profile.sharedFolderSync.enabled, true, 'a matching existing profile should join successfully');
  assert.strictEqual(joinHarness.activeDatabase().sharedSyncKey, syncKey, 'the joining PC must adopt the existing encrypted sync key');
  assert(joinHarness.events.indexOf('read-head') < joinHarness.events.indexOf('write-base'), 'the joining PC must read before writing');
  assert(joinHarness.events.indexOf('scan') < joinHarness.events.indexOf('write-head'), 'the joining PC must scan before publishing');
  assert(joinHarness.events.indexOf('restore-point') < joinHarness.events.indexOf('apply-local'), 'a unique local restore point must exist before joined data is applied');
  assert.deepStrictEqual(
    joinHarness.events.filter(event => event.startsWith('write-')),
    ['write-base', 'write-head'],
    'joining must publish one linked checkpoint rather than initialize an unrelated repository'
  );
  joinHarness.activeDatabase().teacherName = 'Teacher Updated Locally';
  joinHarness.events.length = 0;
  await joinHarness.runPublish();
  assert(joinHarness.events.indexOf('scan') < joinHarness.events.indexOf('write-head'), 'autosave publish must scan remote heads before writing');

  const pcTwoHarness = loadRendererSyncHarness(secure, {
    recoveryId,
    localRecoveryId: '',
    folderPath: 'C:\\Users\\Teacher\\OneDrive\\E-Class Records',
    localProfile: canonical,
    localDeviceId: deviceTwo,
    remoteEnvelope: envelope,
    remoteMeta: {
      handle: 'remote-head',
      revisionId: envelope.revisionId,
      baseRevisionId: envelope.baseRevisionId,
      parentRevisionIds: envelope.parentRevisionIds,
      integratedRevisionIds: envelope.integratedRevisionIds,
      deviceId: envelope.deviceId,
      deviceLabel: envelope.deviceLabel,
      createdAt: envelope.createdAt,
      dataDigest: envelope.dataDigest,
      appVersion: envelope.appVersion,
      profileSchemaVersion: envelope.profileSchemaVersion
    }
  });
  await pcTwoHarness.runConnect();
  assert.strictEqual(pcTwoHarness.profile.backupRecoveryId, recoveryId, 'PC2 assigns the ID only after opening the encrypted profile');
  assert.strictEqual(pcTwoHarness.profile.sharedFolderSync.enabled, true);
  assert.strictEqual(pcTwoHarness.activeDatabase().secondaryBackupPath, 'C:\\Users\\Teacher\\OneDrive\\E-Class Records');
  assert(pcTwoHarness.events.indexOf('inspect-selected') < pcTwoHarness.events.indexOf('read-head'));
  assert(pcTwoHarness.events.indexOf('read-head') < pcTwoHarness.events.findIndex(event => event.startsWith('configure-selected:')));
  assert(pcTwoHarness.events.findIndex(event => event.startsWith('configure-selected:')) < pcTwoHarness.events.indexOf('scan'));
  assert(pcTwoHarness.events.indexOf('scan') < pcTwoHarness.events.indexOf('restore-point'));
  assert(pcTwoHarness.events.includes('replace-pin:123456'));

  const wrongPinHarness = loadRendererSyncHarness(secure, {
    recoveryId,
    localRecoveryId: '',
    connectPin: '654321',
    folderPath: 'C:\\Users\\Teacher\\OneDrive\\E-Class Records',
    localProfile: canonical,
    localDeviceId: deviceTwo,
    remoteEnvelope: envelope,
    remoteMeta: {
      handle: 'remote-head',
      revisionId: envelope.revisionId,
      baseRevisionId: envelope.baseRevisionId,
      parentRevisionIds: envelope.parentRevisionIds,
      integratedRevisionIds: envelope.integratedRevisionIds,
      deviceId: envelope.deviceId,
      deviceLabel: envelope.deviceLabel,
      createdAt: envelope.createdAt,
      dataDigest: envelope.dataDigest,
      appVersion: envelope.appVersion,
      profileSchemaVersion: envelope.profileSchemaVersion
    }
  });
  await wrongPinHarness.runConnect();
  assert.strictEqual(wrongPinHarness.profile.backupRecoveryId, '');
  assert.strictEqual(wrongPinHarness.profile.sharedFolderSync.enabled, false);
  assert.strictEqual(
    wrongPinHarness.events.some(event => event.startsWith('configure-selected:')),
    false,
    'wrong PIN must not configure or write a synchronization repository'
  );

  const pcOneHarness = loadRendererSyncHarness(secure, {
    recoveryId,
    localRecoveryId: '',
    scanEmpty: true,
    folderPath: 'C:\\Users\\Teacher\\OneDrive\\E-Class Records',
    localProfile: canonical,
    localDeviceId: deviceOne,
    remoteEnvelope: envelope,
    remoteMeta: null
  });
  await pcOneHarness.runEnable();
  assert.match(pcOneHarness.profile.backupRecoveryId, /^ECR-/);
  assert.strictEqual(pcOneHarness.profile.sharedFolderSync.enabled, true);
  assert(pcOneHarness.events.some(event => event.startsWith('configure-selected:')));
  assert(pcOneHarness.events.indexOf('scan') < pcOneHarness.events.indexOf('write-base'));
  assert.deepStrictEqual(pcOneHarness.events.filter(event => event.startsWith('write-')), ['write-base', 'write-head']);

  const failedSetupHarness = loadRendererSyncHarness(secure, {
    recoveryId,
    localRecoveryId: '',
    scanEmpty: true,
    failWrite: true,
    folderPath: 'C:\\Users\\Teacher\\OneDrive\\E-Class Records',
    localProfile: canonical,
    localDeviceId: deviceOne,
    remoteEnvelope: envelope,
    remoteMeta: null
  });
  await failedSetupHarness.runEnable();
  assert.strictEqual(failedSetupHarness.profile.backupRecoveryId, '', 'failed setup must roll back the generated ID');
  assert.strictEqual(failedSetupHarness.profile.sharedFolderSync.enabled, false);
  assert(failedSetupHarness.events.includes('disable-folder'));

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

  const localFirstJoin = clone(canonical);
  const remoteFirstJoin = clone(canonical);
  localFirstJoin.assignments[0].scores = {
    'learner-1|assessment-1': 88
  };
  remoteFirstJoin.assignments[0].scores = {
    'learner-2|assessment-2': 91
  };
  localFirstJoin.assignments[0].learners.push({ id: 'learner-local', firstName: 'Local Only' });
  remoteFirstJoin.assignments[0].learners.push({ id: 'learner-remote', firstName: 'Remote Only' });
  const firstJoinMerge = secure.SharedSyncMerge.mergeTwoWayConservative(localFirstJoin, remoteFirstJoin);
  assert.strictEqual(firstJoinMerge.conflicts.length, 0, 'records present on only one joining PC must be preserved');
  assert.strictEqual(firstJoinMerge.merged.assignments[0].scores['learner-1|assessment-1'], 88);
  assert.strictEqual(firstJoinMerge.merged.assignments[0].scores['learner-2|assessment-2'], 91);
  assert(firstJoinMerge.merged.assignments[0].learners.some(item => item.id === 'learner-local'));
  assert(firstJoinMerge.merged.assignments[0].learners.some(item => item.id === 'learner-remote'));

  const localFirstJoinConflict = clone(canonical);
  const remoteFirstJoinConflict = clone(canonical);
  localFirstJoinConflict.assignments[0].scores['learner-1|assessment-1'] = 86;
  remoteFirstJoinConflict.assignments[0].scores['learner-1|assessment-1'] = 94;
  const firstJoinConflict = secure.SharedSyncMerge.mergeTwoWayConservative(localFirstJoinConflict, remoteFirstJoinConflict);
  assert.strictEqual(firstJoinConflict.conflicts.length, 1, 'same-path first-join differences must never be overwritten automatically');
  assert.strictEqual(firstJoinConflict.conflicts[0].kind, 'no-common-base');
  const firstJoinConflictPath = firstJoinConflict.conflicts[0].path;
  const firstJoinRemoteChoice = secure.SharedSyncMerge.mergeTwoWayConservative(
    localFirstJoinConflict,
    remoteFirstJoinConflict,
    { [firstJoinConflictPath]: 'remote' }
  );
  assert.strictEqual(firstJoinRemoteChoice.merged.assignments[0].scores['learner-1|assessment-1'], 94);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-shared-sync-'));
  try {
    const repository = loadRepository(tempRoot);
    const oneDriveRoot = path.join(tempRoot, 'OneDrive');
    const selectedFolder = path.join(oneDriveRoot, 'E-Class Record Data');
    fs.mkdirSync(selectedFolder, { recursive: true });
    assert.throws(
      () => repository.validateOneDriveFolder(oneDriveRoot, { oneDriveRoots: [oneDriveRoot] }),
      /inside a detected OneDrive/
    );
    const validation = repository.validateOneDriveFolder(selectedFolder, { oneDriveRoots: [oneDriveRoot] });
    assert.strictEqual(validation.folderPath, fs.realpathSync.native(selectedFolder));
    const configured = repository.configureFolder(recoveryId, selectedFolder, { oneDriveRoots: [oneDriveRoot] });
    assert.strictEqual(configured.configured, true);
    assert.strictEqual(configured.available, true);
    assert.strictEqual(configured.layoutVersion, 2);
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
    const readOnlyInspection = repository.inspectFolder(recoveryId, selectedFolder, { oneDriveRoots: [oneDriveRoot] });
    assert.strictEqual(readOnlyInspection.repositoryFound, true);
    assert.strictEqual(readOnlyInspection.heads.length, 1);

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
    assert(paths.root.includes(path.join('E-Class Record', recoveryId, 'Sync')));
    fs.writeFileSync(path.join(paths.heads, `${deviceTwo}.json`), JSON.stringify(remoteEnvelope));
    const twoDeviceScan = repository.scan(recoveryId);
    assert.strictEqual(twoDeviceScan.heads.length, 2);
    assert(twoDeviceScan.heads.some(item => item.deviceLabel === 'School PC'));

    const corrupted = clone(remoteEnvelope);
    corrupted.dataDigest = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(path.join(paths.heads, '33333333-3333-4333-a333-333333333333.json'), JSON.stringify(corrupted));
    assert.strictEqual(repository.scan(recoveryId).heads.length, 2, 'tampered heads must be ignored');

    fs.mkdirSync(path.join(selectedFolder, 'eclass-record-sync', recoveryId), { recursive: true });
    assert.throws(
      () => repository.inspectFolder(recoveryId, selectedFolder, { oneDriveRoots: [oneDriveRoot] }),
      /Two synchronization repositories/
    );

    const legacyRecoveryId = RecoveryId.generateBackupRecoveryId();
    fs.mkdirSync(path.join(selectedFolder, 'eclass-record-sync', legacyRecoveryId, 'heads'), { recursive: true });
    const legacyConfigured = repository.configureFolder(legacyRecoveryId, selectedFolder, { oneDriveRoots: [oneDriveRoot] });
    assert.strictEqual(legacyConfigured.layoutVersion, 1, 'an existing repository must retain its legacy layout');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const mainSource = fs.readFileSync(path.join(projectRoot, 'src/main/main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(projectRoot, 'src/main/preload.js'), 'utf8');
  const databaseSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/js/database.js'), 'utf8');
  const rendererSyncSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/js/shared-folder-sync.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  assert(mainSource.includes("ipcMain.handle('shared-sync:scan'"));
  assert(mainSource.includes("ipcMain.handle('shared-sync:create-restore-point'"));
  assert(preloadSource.includes('scanSharedSyncFolder'));
  assert(preloadSource.includes('createSharedSyncRestorePoint'));
  assert(preloadSource.includes('inspectSelectedSharedSyncFolder'));
  assert(databaseSource.includes('window.SharedFolderSync?.schedulePublish?.()'));
  assert(rendererSyncSource.includes('Looking for an existing encrypted profile before this PC writes anything.'));
  assert(rendererSyncSource.includes("syncKey: profileDatabase().sharedSyncKey || ''"));
  assert(rendererSyncSource.includes('enrollment.remotePin || globalScope.getCurrentProfilePin()'));
  assert(rendererSyncSource.includes('async function connectExisting(options = {})'));
  assert(rendererSyncSource.includes('mergeTwoWayConservative(localProfile, remote.profile)'));
  assert(rendererSyncSource.includes('await applyResolvedProfile(remote.profile, remoteMeta);'));
  assert(rendererSyncSource.includes('await applyResolvedProfile(merge.merged, remoteMeta);'));
  assert(htmlSource.includes('id="sharedSyncIndicator"'));
  assert(htmlSource.includes('id="btnSharedSyncReview"'));

  console.log('Shared Folder Sync encryption, safe joining, automatic reconciliation, repository isolation, and conflict tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
