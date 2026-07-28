const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const BackupRecoveryId = require('../renderer/js/backup-recovery-id');

const SYNC_FORMAT = 'eclass-record-sync';
const SYNC_VERSION = 1;
const MAX_SYNC_FILE_SIZE = 100 * 1024 * 1024;
const HANDLE_TTL_MS = 10 * 60 * 1000;
const configPath = path.join(app.getPath('appData'), 'EClassRecordPortable', 'shared-sync-device.json');
const handles = new Map();

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

function writeJsonAtomically(targetFile, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  JSON.parse(payload);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const temporaryFile = `${targetFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, payload, 'utf8');
    JSON.parse(fs.readFileSync(temporaryFile, 'utf8'));
    fs.renameSync(temporaryFile, targetFile);
  } finally {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_error) {
    // A new device configuration is created below.
  }
  const deviceId = crypto.randomUUID();
  return {
    version: 1,
    deviceId,
    deviceLabel: `Device ${deviceId.replace(/-/g, '').slice(0, 4).toUpperCase()}`,
    folders: {}
  };
}

let config = loadConfig();

function saveConfig() {
  writeJsonAtomically(configPath, config);
}

function ensureConfig() {
  if (!/^[a-f0-9-]{36}$/i.test(config.deviceId || '')) config.deviceId = crypto.randomUUID();
  if (!String(config.deviceLabel || '').trim()) {
    config.deviceLabel = `Device ${config.deviceId.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
  }
  if (!config.folders || typeof config.folders !== 'object') config.folders = {};
  saveConfig();
  return config;
}

function normalizeRecoveryId(value) {
  const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(value);
  if (!recoveryId) throw new Error('Enter a valid Backup Recovery ID.');
  return recoveryId;
}

function safeRevisionId(value) {
  const revisionId = String(value || '').toLowerCase();
  if (!/^[a-f0-9-]{36}$/.test(revisionId)) throw new Error('Invalid synchronization revision ID.');
  return revisionId;
}

function configuredFolder(recoveryId) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const folder = config.folders[normalizedId];
  if (!folder || typeof folder !== 'string') throw new Error('Shared Folder Sync is not configured on this PC.');
  return folder;
}

function repositoryPaths(recoveryId) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const selectedFolder = configuredFolder(normalizedId);
  const root = path.join(selectedFolder, 'eclass-record-sync', normalizedId);
  return {
    selectedFolder,
    root,
    heads: path.join(root, 'heads'),
    bases: path.join(root, 'bases')
  };
}

function configureFolder(recoveryId, folderPath) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const resolved = path.resolve(String(folderPath || ''));
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error('The selected shared folder is unavailable.');
  ensureConfig();
  config.folders[normalizedId] = resolved;
  saveConfig();
  const paths = repositoryPaths(normalizedId);
  fs.mkdirSync(paths.heads, { recursive: true });
  fs.mkdirSync(paths.bases, { recursive: true });
  return getState(normalizedId);
}

function disableFolder(recoveryId) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  delete config.folders[normalizedId];
  saveConfig();
  return getState(normalizedId);
}

function renameDevice(label) {
  const nextLabel = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!nextLabel) throw new Error('Enter a device name.');
  ensureConfig();
  config.deviceLabel = nextLabel;
  saveConfig();
  return getDeviceInfo();
}

function getDeviceInfo() {
  ensureConfig();
  return { deviceId: config.deviceId, deviceLabel: config.deviceLabel };
}

function getState(recoveryId) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  ensureConfig();
  const folderPath = config.folders[normalizedId] || '';
  let available = false;
  if (folderPath) {
    try {
      available = fs.statSync(folderPath).isDirectory();
    } catch (_error) {
      available = false;
    }
  }
  return {
    configured: Boolean(folderPath),
    available,
    folderPath,
    deviceId: config.deviceId,
    deviceLabel: config.deviceLabel
  };
}

function verifyEnvelope(envelope, expectedRecoveryId = '') {
  if (!envelope || envelope.format !== SYNC_FORMAT || envelope.syncVersion !== SYNC_VERSION) return false;
  const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(envelope.backupRecoveryId);
  if (!recoveryId || (expectedRecoveryId && recoveryId !== normalizeRecoveryId(expectedRecoveryId))) return false;
  if (!/^[a-f0-9-]{36}$/i.test(envelope.revisionId || '') || !/^[a-f0-9-]{36}$/i.test(envelope.deviceId || '')) return false;
  if (envelope.protection !== 'sync-key-aes-256-gcm') return false;
  const descriptor = envelope.integrity;
  if (!descriptor || descriptor.version !== 1 || descriptor.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/i.test(descriptor.digest || '')) {
    return false;
  }
  const core = { ...envelope };
  delete core.integrity;
  const actual = crypto.createHash('sha256').update(stableStringify(core)).digest('hex');
  const expectedBuffer = Buffer.from(descriptor.digest, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function writeEnvelope(kind, recoveryId, envelopeText) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  const envelope = typeof envelopeText === 'string' ? JSON.parse(envelopeText) : envelopeText;
  if (!verifyEnvelope(envelope, normalizedId)) throw new Error('Synchronization envelope validation failed.');
  const paths = repositoryPaths(normalizedId);
  let targetFile;
  if (kind === 'head') {
    if (String(envelope.deviceId).toLowerCase() !== String(config.deviceId).toLowerCase()) {
      throw new Error('A device can only write its own synchronization head.');
    }
    targetFile = path.join(paths.heads, `${config.deviceId.toLowerCase()}.json`);
  } else if (kind === 'base') {
    targetFile = path.join(paths.bases, `${safeRevisionId(envelope.revisionId)}.json`);
    if (fs.existsSync(targetFile)) {
      const existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      if (!verifyEnvelope(existing, normalizedId) || existing.integrity.digest !== envelope.integrity.digest) {
        throw new Error('The synchronization base already exists with different contents.');
      }
      return { success: true, unchanged: true };
    }
  } else {
    throw new Error('Unsupported synchronization file type.');
  }
  writeJsonAtomically(targetFile, envelope);
  return { success: true };
}

function metadataFor(envelope, handle) {
  return {
    handle,
    revisionId: envelope.revisionId,
    baseRevisionId: envelope.baseRevisionId || '',
    parentRevisionIds: Array.isArray(envelope.parentRevisionIds) ? envelope.parentRevisionIds.slice(0, 50) : [],
    integratedRevisionIds: Array.isArray(envelope.integratedRevisionIds) ? envelope.integratedRevisionIds.slice(0, 200) : [],
    deviceId: envelope.deviceId,
    deviceLabel: String(envelope.deviceLabel || '').slice(0, 40),
    createdAt: envelope.createdAt,
    dataDigest: envelope.dataDigest,
    appVersion: String(envelope.appVersion || '').slice(0, 40),
    profileSchemaVersion: Number(envelope.profileSchemaVersion) || 0
  };
}

function pruneHandles() {
  const cutoff = Date.now() - HANDLE_TTL_MS;
  for (const [handle, entry] of handles) {
    if (entry.createdAt < cutoff) handles.delete(handle);
  }
}

function scanDirectory(directory, recoveryId, kind) {
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const filePath = path.join(directory, entry.name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_SYNC_FILE_SIZE) continue;
      const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!verifyEnvelope(envelope, recoveryId)) continue;
      if (kind === 'head' && entry.name.toLowerCase() !== `${String(envelope.deviceId).toLowerCase()}.json`) continue;
      if (kind === 'base' && entry.name.toLowerCase() !== `${String(envelope.revisionId).toLowerCase()}.json`) continue;
      const handle = crypto.randomUUID();
      handles.set(handle, { filePath, recoveryId, createdAt: Date.now() });
      results.push(metadataFor(envelope, handle));
    } catch (_error) {
      // Invalid synchronization files are ignored and never exposed.
    }
  }
  return results;
}

function scan(recoveryId) {
  const normalizedId = normalizeRecoveryId(recoveryId);
  pruneHandles();
  const paths = repositoryPaths(normalizedId);
  return {
    heads: scanDirectory(paths.heads, normalizedId, 'head'),
    bases: scanDirectory(paths.bases, normalizedId, 'base')
  };
}

function read(handle) {
  pruneHandles();
  const key = String(handle || '');
  const entry = handles.get(key);
  if (!entry) throw new Error('This synchronization file selection has expired. Check the shared folder again.');
  handles.delete(key);
  const stat = fs.statSync(entry.filePath);
  if (!stat.isFile() || stat.size > MAX_SYNC_FILE_SIZE) throw new Error('Synchronization file is invalid or too large.');
  const content = fs.readFileSync(entry.filePath, 'utf8');
  const envelope = JSON.parse(content);
  if (!verifyEnvelope(envelope, entry.recoveryId)) throw new Error('Synchronization integrity check failed.');
  return { content };
}

module.exports = {
  SYNC_FORMAT,
  SYNC_VERSION,
  configureFolder,
  disableFolder,
  renameDevice,
  getDeviceInfo,
  getState,
  repositoryPaths,
  verifyEnvelope,
  writeEnvelope,
  scan,
  read
};
