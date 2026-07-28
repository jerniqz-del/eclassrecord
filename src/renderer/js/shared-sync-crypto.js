(function (globalScope) {
  'use strict';

  const SYNC_FORMAT = 'eclass-record-sync';
  const SYNC_VERSION = 1;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalProfile(profile) {
    const output = clone(profile || {});
    delete output.lastUpdatedAt;
    delete output.secondaryBackupPath;
    delete output.sharedSyncKey;
    delete output.sharedSyncRuntime;
    return output;
  }

  function generateSyncKey() {
    return Array.from(globalScope.crypto.getRandomValues(new Uint8Array(32)))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function generateRevisionId() {
    if (typeof globalScope.crypto.randomUUID === 'function') return globalScope.crypto.randomUUID();
    const hex = Array.from(globalScope.crypto.getRandomValues(new Uint8Array(16)))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
  }

  async function profileDigest(profile) {
    return globalScope.sha256(globalScope.stableStringify(canonicalProfile(profile)));
  }

  async function createSyncEnvelope(profile, syncKey, pin, metadata = {}) {
    if (!/^[a-f0-9]{64}$/i.test(String(syncKey || ''))) throw new Error('Shared Folder Sync key is invalid.');
    if (!/^\d{6}$/.test(String(pin || ''))) throw new Error('A valid profile PIN is required for Shared Folder Sync.');
    const canonical = canonicalProfile(profile);
    const revisionId = String(metadata.revisionId || generateRevisionId()).toLowerCase();
    const core = {
      format: SYNC_FORMAT,
      syncVersion: SYNC_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: metadata.appVersion || '',
      profileSchemaVersion: Number(profile?.version) || 0,
      backupRecoveryId: globalScope.BackupRecoveryId.normalizeBackupRecoveryId(metadata.backupRecoveryId),
      revisionId,
      baseRevisionId: String(metadata.baseRevisionId || revisionId).toLowerCase(),
      parentRevisionIds: Array.from(new Set((metadata.parentRevisionIds || []).map(value => String(value).toLowerCase()))).slice(0, 50),
      integratedRevisionIds: Array.from(new Set((metadata.integratedRevisionIds || []).map(value => String(value).toLowerCase()))).slice(0, 200),
      deviceId: String(metadata.deviceId || '').toLowerCase(),
      deviceLabel: String(metadata.deviceLabel || '').trim().slice(0, 40),
      dataDigest: await profileDigest(canonical),
      protection: 'sync-key-aes-256-gcm',
      wrappedSyncKey: await globalScope.encryptPayload(syncKey, pin, { purpose: 'shared-sync-key' }),
      payload: await globalScope.encryptPayload(JSON.stringify(canonical), syncKey, { purpose: 'shared-sync-profile' })
    };
    if (!core.backupRecoveryId || !/^[a-f0-9-]{36}$/i.test(core.revisionId) || !/^[a-f0-9-]{36}$/i.test(core.deviceId)) {
      throw new Error('Shared Folder Sync metadata is incomplete.');
    }
    return { ...core, integrity: await globalScope.createIntegrityDescriptor(core) };
  }

  async function openSyncEnvelope(envelope, options = {}) {
    if (!envelope || envelope.format !== SYNC_FORMAT || envelope.syncVersion !== SYNC_VERSION) {
      throw new Error('Unsupported synchronization format.');
    }
    const core = { ...envelope };
    delete core.integrity;
    const integrity = await globalScope.verifyIntegrityDescriptor(core, envelope.integrity);
    if (!integrity.valid) throw new Error('Synchronization integrity check failed.');
    let syncKey = String(options.syncKey || '');
    if (!syncKey) {
      if (!options.pin) throw new Error('This synchronized profile requires its PIN.');
      syncKey = await globalScope.decryptPayload(envelope.wrappedSyncKey, options.pin);
    }
    if (!/^[a-f0-9]{64}$/i.test(syncKey)) throw new Error('The synchronization key could not be verified.');
    const profile = JSON.parse(await globalScope.decryptPayload(envelope.payload, syncKey));
    const digest = await profileDigest(profile);
    if (!globalScope.timingSafeEqualText(digest, envelope.dataDigest)) {
      throw new Error('Synchronized profile content failed validation.');
    }
    return { profile: canonicalProfile(profile), syncKey };
  }

  const api = {
    SYNC_FORMAT,
    SYNC_VERSION,
    canonicalProfile,
    generateSyncKey,
    generateRevisionId,
    profileDigest,
    createSyncEnvelope,
    openSyncEnvelope
  };
  globalScope.SharedSyncCrypto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
