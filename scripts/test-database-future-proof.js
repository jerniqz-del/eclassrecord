const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');
const os = require('os');
const QRCode = require('qrcode');
const jsQR = require('jsqr');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
const AdvisoryBackup = require('../src/renderer/js/advisory-backup.js');

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

async function legacyEncrypt(plainText, pin) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText));
  return { secureBackup: true, salt: hex(salt), iv: hex(iv), ciphertext: hex(ciphertext) };
}

function fixture(version = 1) {
  return {
    version,
    teacherName: 'Legacy Teacher',
    schoolYear: '2025-2026',
    assignments: [{ id: 'legacy-class', gradeLevel: '4', section: 'A', subject: 'Mathematics', learners: [], assessments: [], scores: {} }]
  };
}

function renderQrPixels(payload) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const margin = 4;
  const scale = 6;
  const width = (qr.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const moduleX = Math.floor(x / scale) - margin;
      const moduleY = Math.floor(y / scale) - margin;
      const dark = moduleX >= 0 && moduleY >= 0 && moduleX < qr.modules.size && moduleY < qr.modules.size && qr.modules.get(moduleY, moduleX);
      const offset = (y * width + x) * 4;
      const value = dark ? 15 : 255;
      pixels[offset] = value;
      pixels[offset + 1] = dark ? 23 : 255;
      pixels[offset + 2] = dark ? 42 : 255;
      pixels[offset + 3] = 255;
    }
  }
  return { data: pixels, width, height: width };
}

(async () => {
  const context = { crypto: webcrypto, console, TextEncoder, TextDecoder, Uint8Array, Date, JSON, WeakSet, Object, Array, String, Number, Error };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/security.js'), 'utf8'), context);

  // PIN hashes from early releases remain valid; new hashes are versioned and stronger.
  const legacySalt = '0011223344556677';
  const legacyHash = await context.sha256('123456' + legacySalt);
  assert.strictEqual(await context.verifyPin('123456', legacySalt, legacyHash), true);
  assert.strictEqual(await context.verifyPin('654321', legacySalt, legacyHash), false);
  const modernSalt = context.generateSalt();
  const modernHash = await context.hashPin('123456', modernSalt);
  assert(modernHash.startsWith('pbkdf2-sha256$310000$'));
  assert.strictEqual(await context.verifyPin('123456', modernSalt, modernHash), true);

  // Encrypted profile/backup descriptors from early releases still decrypt.
  const legacyProfile = fixture(1);
  const legacyEncrypted = await legacyEncrypt(JSON.stringify(legacyProfile), '123456');
  assert.deepStrictEqual(JSON.parse(await context.decryptPayload(legacyEncrypted, '123456')), legacyProfile);

  // New encryption is self-describing, authenticated, and rejects tampering.
  const modernEncrypted = await context.encryptPayload(JSON.stringify(legacyProfile), '123456');
  assert.strictEqual(modernEncrypted.encryptionVersion, 2);
  assert.strictEqual(modernEncrypted.kdf.iterations, 310000);
  assert.deepStrictEqual(JSON.parse(await context.decryptPayload(modernEncrypted, '123456')), legacyProfile);
  const tamperedEncrypted = JSON.parse(JSON.stringify(modernEncrypted));
  tamperedEncrypted.ciphertext = `${tamperedEncrypted.ciphertext.slice(0, -2)}00`;
  await assert.rejects(() => context.decryptPayload(tamperedEncrypted, '123456'), /corrupted encrypted data/);

  // Version-2 backup envelopes detect accidental corruption before restore.
  const plainEnvelope = await context.createBackupEnvelope(legacyProfile, '', { appVersion: 'test' });
  assert.strictEqual(plainEnvelope.format, 'eclass-record-backup');
  assert.deepStrictEqual(await context.openBackupEnvelope(plainEnvelope), legacyProfile);
  const tamperedEnvelope = JSON.parse(JSON.stringify(plainEnvelope));
  tamperedEnvelope.payload.teacherName = 'Changed Outside App';
  await assert.rejects(() => context.openBackupEnvelope(tamperedEnvelope), /integrity check failed/);
  const encryptedEnvelope = await context.createBackupEnvelope(legacyProfile, '123456', { appVersion: 'test' });
  assert.deepStrictEqual(await context.openBackupEnvelope(encryptedEnvelope, '123456'), legacyProfile);
  await assert.rejects(() => context.openBackupEnvelope(encryptedEnvelope, '000000'), /Incorrect PIN/);
  const futureEnvelope = JSON.parse(JSON.stringify(plainEnvelope));
  futureEnvelope.backupVersion = 99;
  await assert.rejects(() => context.openBackupEnvelope(futureEnvelope), /newer app version/);

  // Main-process secondary backups use the same envelope and are readable by the renderer importer.
  const fileIoModule = { exports: {} };
  const fileIoContext = {
    module: fileIoModule,
    exports: fileIoModule.exports,
    console,
    process,
    require(name) {
      if (name === 'electron') return { app: { getPath: () => __dirname, getVersion: () => 'test' } };
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/file-io.js'), 'utf8'), fileIoContext);
  const secondaryPlain = fileIoModule.exports.createSecondaryBackupEnvelope({ pinEnabled: false, data: legacyProfile });
  assert.deepStrictEqual(await context.openBackupEnvelope(secondaryPlain), legacyProfile);
  const secondaryEncrypted = fileIoModule.exports.createSecondaryBackupEnvelope({ pinEnabled: true, data: modernEncrypted });
  assert.deepStrictEqual(await context.openBackupEnvelope(secondaryEncrypted, '123456'), legacyProfile);
  const atomicDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-atomic-'));
  try {
    const atomicFile = path.join(atomicDirectory, 'database.json');
    fileIoModule.exports.writeJsonAtomically(atomicFile, JSON.stringify({ version: 4, value: 'complete' }));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(atomicFile, 'utf8')), { version: 4, value: 'complete' });
    fileIoModule.exports.writeJsonAtomically(atomicFile, JSON.stringify({ version: 4, value: 'replaced' }));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(atomicFile, 'utf8')), { version: 4, value: 'replaced' });
    assert.strictEqual(fs.readdirSync(atomicDirectory).some(name => name.endsWith('.tmp')), false);
    assert.throws(() => fileIoModule.exports.writeJsonAtomically(atomicFile, '{broken'), /JSON/);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(atomicFile, 'utf8')), { version: 4, value: 'replaced' }, 'invalid replacement must not damage the existing file');
  } finally {
    fs.rmSync(atomicDirectory, { recursive: true, force: true });
  }

  // Raw old backups remain accepted by the detached restore validator.
  const migratedLegacy = AdvisoryBackup.prepareRestoredDatabase(fixture(1));
  assert.strictEqual(migratedLegacy.advisory.schemaVersion, 2);
  assert.strictEqual(migratedLegacy.assignments[0].id, 'legacy-class');

  // Recovery unwraps a legacy PIN, validates/decrypts the profile, and atomically builds a modern replacement.
  context.prepareRestoredDatabase = AdvisoryBackup.prepareRestoredDatabase;
  context.AdvisoryData = global.AdvisoryData;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/pin-recovery.js'), 'utf8'), context);
  const recoveryKey = context.generateRecoveryKey();
  const protectedProfile = {
    id: 'legacy-profile', name: 'Legacy Teacher', pinEnabled: true,
    salt: legacySalt, pinHash: legacyHash, data: legacyEncrypted,
    recovery: await context.createPinRecoveryDescriptor('123456', recoveryKey)
  };
  const qrPayload = await context.createRecoveryQrPayload(protectedProfile.recovery, recoveryKey);
  const parsedQr = await context.parseRecoveryQrPayload(qrPayload);
  assert.strictEqual(parsedQr.recoveryId, protectedProfile.recovery.recoveryId);
  assert.strictEqual(parsedQr.recoveryKey, context.normalizeRecoveryKey(recoveryKey));
  const qrPixels = renderQrPixels(qrPayload);
  assert.strictEqual(jsQR(qrPixels.data, qrPixels.width, qrPixels.height, { inversionAttempts: 'attemptBoth' }).data, qrPayload);
  const preloadBridge = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8'), {
    console,
    Uint8ClampedArray,
    require(name) {
      if (name === 'electron') return {
        contextBridge: { exposeInMainWorld: (_name, api) => { preloadBridge.api = api; } },
        ipcRenderer: { invoke: async () => ({ success: false }), on: () => {}, send: () => {} }
      };
      return require(name);
    }
  });
  assert((await preloadBridge.api.generateRecoveryQr(qrPayload)).startsWith('data:image/png;base64,'));
  const qrDataUrl = await preloadBridge.api.generateRecoveryQr(qrPayload);
  const recoveryQrHelpers = require('../src/main/recovery-qr.js');
  assert(recoveryQrHelpers.decodeRecoveryQrPng(qrDataUrl).subarray(1, 4).equals(Buffer.from('PNG')));
  assert.throws(() => recoveryQrHelpers.decodeRecoveryQrPng('data:image/png;base64,bm90LXBuZw=='), /not a valid PNG/);
  const printableQr = recoveryQrHelpers.createRecoveryQrPrintHtml(qrDataUrl, '<Teacher & Profile>');
  assert(printableQr.includes('&lt;Teacher &amp; Profile&gt;'));
  assert(!printableQr.includes('<Teacher & Profile>'));
  assert.strictEqual(preloadBridge.api.decodeRecoveryQrPixels(qrPixels), qrPayload);
  assert.strictEqual(preloadBridge.api.decodeRecoveryQrPixels({ data: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 }), '');
  assert.throws(() => preloadBridge.api.decodeRecoveryQrPixels({ data: [], width: 10, height: 10 }), /dimensions are invalid/);
  assert.strictEqual(await context.PinRecovery.decodeRecoveryQrPayloadForProfile(qrPayload, protectedProfile), context.normalizeRecoveryKey(recoveryKey));
  const tamperedQr = `${qrPayload.slice(0, -1)}${qrPayload.endsWith('0') ? '1' : '0'}`;
  await assert.rejects(() => context.parseRecoveryQrPayload(tamperedQr), /failed its checksum/);
  const otherKey = context.generateRecoveryKey();
  const otherDescriptor = await context.createPinRecoveryDescriptor('123456', otherKey);
  const otherQrPayload = await context.createRecoveryQrPayload(otherDescriptor, otherKey);
  await assert.rejects(() => context.PinRecovery.decodeRecoveryQrPayloadForProfile(otherQrPayload, protectedProfile), /different profile/);
  const replacedDescriptor = await context.createPinRecoveryDescriptor('123456', context.generateRecoveryKey(), protectedProfile.recovery);
  assert.notStrictEqual(replacedDescriptor.recoveryId, protectedProfile.recovery.recoveryId, 'replacing recovery must invalidate older QR identifiers');
  const originalSnapshot = JSON.stringify(protectedProfile);
  const recovered = await context.PinRecovery.buildRecoveredProfile(protectedProfile, recoveryKey, '654321');
  assert.strictEqual(JSON.stringify(protectedProfile), originalSnapshot, 'recovery preparation must not mutate the stored profile');
  assert.strictEqual(await context.verifyPin('654321', recovered.profile.salt, recovered.profile.pinHash), true);
  const recoveredPayload = JSON.parse(await context.decryptPayload(recovered.profile.data, '654321'));
  assert.deepStrictEqual(recoveredPayload.assignments, legacyProfile.assignments);
  assert.strictEqual(recoveredPayload.advisory.schemaVersion, 2);
  assert.strictEqual(await context.recoverPinFromDescriptor(recovered.profile.recovery, recoveryKey), '654321');
  assert.strictEqual(recovered.profile.recovery.recoveryId, protectedProfile.recovery.recoveryId, 'changing a PIN with the same recovery key must keep the QR valid');
  const rootBeforeCommit = { version: 3, activeProfileId: 'other', profiles: [protectedProfile, { id: 'other', data: fixture(2) }] };
  const failedCommitSnapshot = JSON.stringify(rootBeforeCommit);
  await assert.rejects(() => context.PinRecovery.commitRecoveredRoot(rootBeforeCommit, recovered.profile, async () => false), /could not be saved/);
  assert.strictEqual(JSON.stringify(rootBeforeCommit), failedCommitSnapshot, 'failed persistence must leave the root database unchanged');
  const committedRoot = await context.PinRecovery.commitRecoveredRoot(rootBeforeCommit, recovered.profile, async candidate => candidate.profiles[0].id === recovered.profile.id);
  assert.strictEqual(committedRoot.activeProfileId, recovered.profile.id);
  assert.strictEqual(await context.verifyPin('654321', committedRoot.profiles[0].salt, committedRoot.profiles[0].pinHash), true);
  assert.strictEqual(JSON.stringify(rootBeforeCommit), failedCommitSnapshot, 'successful preparation must also leave the source root unchanged');
  await assert.rejects(() => context.PinRecovery.buildRecoveredProfile(protectedProfile, 'WRONG-WRONG-WRONG-WRONG-WRONG', '654321'), /Incorrect PIN\/recovery key/);
  assert.strictEqual(JSON.stringify(protectedProfile), originalSnapshot);
  const corruptProfile = JSON.parse(originalSnapshot);
  corruptProfile.data.ciphertext = `${corruptProfile.data.ciphertext.slice(0, -2)}00`;
  const corruptSnapshot = JSON.stringify(corruptProfile);
  await assert.rejects(() => context.PinRecovery.buildRecoveredProfile(corruptProfile, recoveryKey, '654321'), /corrupted encrypted data/);
  assert.strictEqual(JSON.stringify(corruptProfile), corruptSnapshot);

  // Integration contract: v4 migrations, verify-before-normalize, future-write refusal, and recovery UI are wired in.
  const databaseSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/database.js'), 'utf8');
  const importSource = fs.readFileSync(path.join(__dirname, '../src/renderer/js/import-export.js'), 'utf8');
  const fileIoSource = fs.readFileSync(path.join(__dirname, '../src/main/file-io.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8');
  assert(databaseSource.includes('const DB_VERSION = 5;'));
  assert(databaseSource.includes('const ROOT_DB_VERSION = 5;'));
  assert(databaseSource.indexOf('verifyRootDatabaseIntegrity(localData)') < databaseSource.indexOf('normalizeRootDatabase(localData)'));
  assert(databaseSource.includes('cannot be safely overwritten by this version'));
  assert(databaseSource.includes("!p.pinHash.startsWith('pbkdf2-sha256$')"), 'legacy PIN hashes must be upgraded after a verified unlock and save');
  assert(importSource.includes('createBackupEnvelope(db, pin'));
  assert(importSource.includes('openBackupEnvelope(incoming'));
  assert(importSource.includes('The restored database could not be saved. No changes were kept.'));
  assert(fileIoSource.includes('createSecondaryBackupEnvelope(activeProfile)'));
  assert(fileIoSource.includes("crypto.createHash('sha256')"));
  assert(fileIoSource.includes('writeJsonAtomically(dbPath, payload)'));
  assert(htmlSource.includes('id="profileRecoveryPanel"'));
  assert(htmlSource.includes('id="recoveryQrFile"'));
  assert(preloadSource.includes("require('qrcode')"));
  assert(preloadSource.includes("require('jsqr')"));
  assert(mainSource.includes("ipcMain.handle('dialog:export-recovery-qr'"));
  assert(htmlSource.indexOf('js/app.js') < htmlSource.indexOf('js/pin-recovery.js'));
  assert(mainSource.includes("app.setPath('appData', smokeRoot)"));
  assert(mainSource.indexOf("app.setPath('appData', smokeRoot)") < mainSource.indexOf("require('./file-io')"), 'smoke database path must be isolated before file I/O resolves it');

  console.log('Future-proof database, backup integrity, legacy compatibility, PIN recovery, and offline QR recovery tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
