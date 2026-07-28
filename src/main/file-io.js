/**
 * E-Class Record — Electron File I/O Module
 *
 * Implements persistent JSON database storage in %APPDATA%/EClassRecordPortable/data.json.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BackupRecoveryId = require('../renderer/js/backup-recovery-id');
const sharedFolderSync = require('./shared-folder-sync');

// Target directory and database file path
const dbDir = path.join(app.getPath('appData'), 'EClassRecordPortable');
const dbPath = path.join(dbDir, 'data.json');

/**
 * Ensures that the EClassRecordPortable folder exists.
 */
function ensureDataFolder() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

/**
 * Loads the database from disk.
 * @returns {object|null} The parsed database JSON, or null if it does not exist.
 */
function loadDatabase() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load database:', error);
    throw new Error('Database loading failed: ' + error.message);
  }
  return null;
}

/**
 * Creates a daily rolling backup in the specified base directory, keeping up to `limit` files.
 * @param {string} payload JSON string.
 * @param {string} baseDir Base directory where backups/ folder should be created.
 * @param {number} limit Maximum number of daily backup files to retain.
 */
function sanitizeFilename(name) {
  return name ? name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'default';
}

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

function createSecondaryBackupEnvelope(activeProfile) {
  const encrypted = Boolean(activeProfile.pinEnabled && (activeProfile.data?.secureBackup || activeProfile.data?.ciphertext));
  const backupRecoveryId = BackupRecoveryId.normalizeBackupRecoveryId(activeProfile.backupRecoveryId);
  const core = {
    format: 'eclass-record-backup',
    backupVersion: 2,
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    profileSchemaVersion: encrypted ? 0 : Number(activeProfile.data?.version) || 0,
    protection: encrypted ? 'pin-aes-256-gcm' : 'none',
    backupRecoveryId,
    profileNameHint: String(activeProfile.name || '').trim().slice(0, 120),
    payload: activeProfile.data
  };
  return {
    ...core,
    integrity: {
      version: 1,
      algorithm: 'SHA-256',
      digest: crypto.createHash('sha256').update(stableStringify(core)).digest('hex')
    }
  };
}

function verifyBackupEnvelopeIntegrity(envelope) {
  if (!envelope || envelope.format !== 'eclass-record-backup' || envelope.backupVersion !== 2) return false;
  if (envelope.protection !== 'none' && envelope.protection !== 'pin-aes-256-gcm') return false;
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

function backupFilesInDirectory(baseDir) {
  const directories = [baseDir];
  const rollingDir = path.join(baseDir, 'backups');
  try {
    const rollingStat = fs.lstatSync(rollingDir);
    if (rollingStat.isDirectory() && !rollingStat.isSymbolicLink()) directories.push(rollingDir);
  } catch (_error) {
    // The rolling backup folder is optional.
  }
  const files = [];
  for (const directory of directories) {
    let entries = [];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function readValidDiscoveredBackup(filePath, expectedRecoveryId) {
  const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(expectedRecoveryId);
  if (!recoveryId) throw new Error('Enter a valid Backup Recovery ID.');
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw new Error('Backup file is invalid or too large.');
  const content = fs.readFileSync(filePath, 'utf8');
  const envelope = JSON.parse(content);
  if (BackupRecoveryId.normalizeBackupRecoveryId(envelope.backupRecoveryId) !== recoveryId || !verifyBackupEnvelopeIntegrity(envelope)) {
    throw new Error('Backup integrity check failed.');
  }
  const createdTime = Date.parse(envelope.createdAt);
  if (!Number.isFinite(createdTime)) throw new Error('Backup timestamp is invalid.');
  return {
    content,
    envelope,
    metadata: {
      backupRecoveryId: recoveryId,
      profileNameHint: String(envelope.profileNameHint || '').slice(0, 120),
      createdAt: envelope.createdAt,
      appVersion: String(envelope.appVersion || '').slice(0, 40),
      backupVersion: envelope.backupVersion,
      protection: envelope.protection,
      integrityDigest: envelope.integrity.digest
    }
  };
}

function scanBackupDirectory(baseDir, expectedRecoveryId) {
  const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(expectedRecoveryId);
  if (!recoveryId) throw new Error('Enter a valid Backup Recovery ID.');
  const matches = [];
  let invalidMatchingFiles = 0;
  for (const filePath of backupFilesInDirectory(baseDir)) {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > 100 * 1024 * 1024) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (BackupRecoveryId.normalizeBackupRecoveryId(parsed.backupRecoveryId) !== recoveryId) continue;
      try {
        const valid = readValidDiscoveredBackup(filePath, recoveryId);
        matches.push({ filePath, ...valid.metadata });
      } catch (_error) {
        invalidMatchingFiles += 1;
      }
    } catch (_error) {
      // Unrelated or malformed JSON files are ignored.
    }
  }
  matches.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return { latest: matches[0] || null, matchCount: matches.length, invalidMatchingFiles };
}

function writeJsonAtomically(targetFile, payload) {
  JSON.parse(payload);
  const temporaryFile = `${targetFile}.${process.pid}.${Date.now()}.tmp`;
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryFile, 'w');
    fs.writeFileSync(descriptor, payload, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    JSON.parse(fs.readFileSync(temporaryFile, 'utf8'));
    fs.renameSync(temporaryFile, targetFile);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
  }
}

/**
 * Creates a daily rolling backup in the specified base directory, keeping up to `limit` files.
 * @param {string} payload JSON string.
 * @param {string} baseDir Base directory where backups/ folder should be created.
 * @param {number} limit Maximum number of daily backup files to retain.
 * @param {string} prefix File name prefix.
 */
function createRollingBackup(payload, baseDir, limit = 30, prefix = 'backup') {
  try {
    if (!baseDir) return;
    const backupFolder = path.join(baseDir, 'backups');
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder, { recursive: true });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const filename = `${prefix}-${dateStr}.json`;
    const targetFile = path.join(backupFolder, filename);

    // Save today's backup file (overwrites if saved again today)
    writeJsonAtomically(targetFile, payload);

    // Prune backups exceeding the retention limit
    const files = fs.readdirSync(backupFolder);
    const backupFiles = files
      .filter(f => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
      .map(f => ({
        name: f,
        filePath: path.join(backupFolder, f)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (backupFiles.length > limit) {
      const toDelete = backupFiles.slice(0, backupFiles.length - limit);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.filePath);
        } catch (delError) {
          console.error(`Failed to delete old backup file ${item.name}:`, delError);
        }
      }
    }
  } catch (error) {
    console.error('Failed to create daily rolling backup:', error);
  }
}

/**
 * Saves the database to disk.
 * @param {object|string} data The database contents.
 * @returns {boolean} True if successful.
 */
function saveDatabase(data) {
  try {
    ensureDataFolder();
    const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    JSON.parse(payload);

    if (fs.existsSync(dbPath)) {
      try {
        const previousPayload = fs.readFileSync(dbPath, 'utf8');
        JSON.parse(previousPayload);
        createRollingBackup(previousPayload, dbDir, 30, 'pre-save');
      } catch (backupError) {
        console.error('Pre-save backup skipped:', backupError);
      }
    }

    writeJsonAtomically(dbPath, payload);

    // Local daily rolling backup in AppData backups folder
    createRollingBackup(payload, dbDir, 30, 'backup');

    // Secondary auto-backup if secondaryBackupPath is set on the active profile
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const activeProfile = parsed.profiles && parsed.profiles.find(p => p.id === parsed.activeProfileId);
      if (activeProfile && activeProfile.secondaryBackupPath) {
        const backupRecoveryId = BackupRecoveryId.normalizeBackupRecoveryId(activeProfile.backupRecoveryId);
        const deviceSuffix = activeProfile.sharedFolderSync?.enabled
          ? `-${sharedFolderSync.getDeviceInfo().deviceId.toLowerCase()}`
          : '';
        const backupFileKey = backupRecoveryId
          ? `${backupRecoveryId}${deviceSuffix}`
          : sanitizeFilename(activeProfile.name);
        const secondaryFile = path.join(activeProfile.secondaryBackupPath, `eclass-record-backup-${backupFileKey}.json`);
        
        // Use the same versioned/checksummed envelope as manual backups.
        // Older raw secondary backups remain supported by the renderer importer.
        const profilePayload = JSON.stringify(createSecondaryBackupEnvelope(activeProfile), null, 2);
        writeJsonAtomically(secondaryFile, profilePayload);

        // Secondary daily rolling backup (rolling limit of 30 days)
        createRollingBackup(profilePayload, activeProfile.secondaryBackupPath, 30, `backup-${backupFileKey}`);
      }
    } catch (secError) {
      console.error('Secondary auto-backup failed (non-fatal):', secError);
    }

    return true;
  } catch (error) {
    console.error('Failed to save database:', error);
    throw new Error('Database save failed: ' + error.message);
  }
}

/**
 * Helper to read a text file.
 * @param {string} filePath Absolute path to file.
 * @returns {string} File content.
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Helper to write a text file.
 * @param {string} filePath Absolute path to file.
 * @param {string} content Content to write.
 */
function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = {
  loadDatabase,
  saveDatabase,
  readFile,
  writeFile,
  createSecondaryBackupEnvelope,
  writeJsonAtomically,
  verifyBackupEnvelopeIntegrity,
  scanBackupDirectory,
  readValidDiscoveredBackup
};
