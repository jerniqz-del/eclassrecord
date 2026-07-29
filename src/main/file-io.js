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

function backupFilesInDirectory(baseDir, recoveryId = '') {
  const directories = [];
  const pending = [{ directory: path.resolve(baseDir), depth: 0 }];
  const profileFolderName = BackupRecoveryId.normalizeBackupRecoveryId(recoveryId);
  const maximumDepth = profileFolderName ? 6 : 2;
  while (pending.length && directories.length < 200) {
    const current = pending.shift();
    let stat;
    try {
      stat = fs.lstatSync(current.directory);
    } catch (_error) {
      continue;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    directories.push(current.directory);
    if (current.depth >= maximumDepth) continue;
    let children = [];
    try {
      children = fs.readdirSync(current.directory, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (current.depth === 0 && profileFolderName) {
        const allowedTopLevel = new Set([
          'backups',
          'backup',
          'restore points',
          'e-class record',
          profileFolderName.toLowerCase()
        ]);
        if (!allowedTopLevel.has(child.name.toLowerCase())) continue;
      }
      pending.push({ directory: path.join(current.directory, child.name), depth: current.depth + 1 });
    }
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
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json') && files.length < 2000) {
        files.push(path.join(directory, entry.name));
      }
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
  for (const filePath of backupFilesInDirectory(baseDir, recoveryId)) {
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

function selectedOneDriveFolderForFile(oneDriveRoot, filePath) {
  const parts = path.relative(oneDriveRoot, filePath).split(path.sep);
  const canonicalIndex = parts.findIndex(part => part.toLowerCase() === 'e-class record');
  if (canonicalIndex > 0) return path.join(oneDriveRoot, ...parts.slice(0, canonicalIndex));
  const legacySyncIndex = parts.findIndex(part => part.toLowerCase() === 'eclass-record-sync');
  if (legacySyncIndex > 0) return path.join(oneDriveRoot, ...parts.slice(0, legacySyncIndex));
  const directory = path.dirname(filePath);
  return path.basename(directory).toLowerCase() === 'backups' ? path.dirname(directory) : directory;
}

function discoverOneDriveBackups() {
  const roots = sharedFolderSync.detectOneDriveRoots();
  const found = new Map();
  let scannedDirectories = 0;
  let scannedFiles = 0;

  for (const oneDriveRoot of roots) {
    const pending = [{ directory: oneDriveRoot, depth: 0 }];
    while (pending.length && scannedDirectories < 3000 && scannedFiles < 5000) {
      const current = pending.shift();
      let entries = [];
      try {
        const stat = fs.lstatSync(current.directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
        entries = fs.readdirSync(current.directory, { withFileTypes: true });
      } catch (_error) {
        continue;
      }
      scannedDirectories += 1;
      for (const entry of entries) {
        const entryPath = path.join(current.directory, entry.name);
        if (entry.isDirectory()) {
          if (current.depth < 7 && !entry.name.startsWith('.')) {
            pending.push({ directory: entryPath, depth: current.depth + 1 });
          }
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
        const lowerName = entry.name.toLowerCase();
        const inSyncDirectory = ['heads', 'bases'].includes(path.basename(current.directory).toLowerCase());
        if (!inSyncDirectory && !/(backup|restore|latest)/.test(lowerName)) continue;
        scannedFiles += 1;
        try {
          const stat = fs.statSync(entryPath);
          if (!stat.isFile() || stat.size > 100 * 1024 * 1024) continue;
          const parsed = JSON.parse(fs.readFileSync(entryPath, 'utf8'));
          const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(parsed.backupRecoveryId);
          if (!recoveryId) continue;
          const existing = found.get(recoveryId) || {
            recoveryId,
            profileNameHint: '',
            lastBackupAt: '',
            protection: '',
            folderPath: selectedOneDriveFolderForFile(oneDriveRoot, entryPath),
            backupAvailable: false,
            syncAvailable: false
          };
          if (verifyBackupEnvelopeIntegrity(parsed)) {
            existing.backupAvailable = true;
            existing.profileNameHint = String(parsed.profileNameHint || existing.profileNameHint || '').slice(0, 120);
            existing.protection = parsed.protection;
            if (!existing.lastBackupAt || Date.parse(parsed.createdAt) > Date.parse(existing.lastBackupAt)) {
              existing.lastBackupAt = parsed.createdAt;
              existing.folderPath = selectedOneDriveFolderForFile(oneDriveRoot, entryPath);
            }
          } else if (inSyncDirectory && sharedFolderSync.verifyEnvelope(parsed, recoveryId)) {
            existing.syncAvailable = true;
            if (!existing.lastBackupAt || Date.parse(parsed.createdAt) > Date.parse(existing.lastBackupAt)) {
              existing.lastBackupAt = parsed.createdAt;
              existing.folderPath = selectedOneDriveFolderForFile(oneDriveRoot, entryPath);
            }
          } else {
            continue;
          }
          found.set(recoveryId, existing);
        } catch (_error) {
          // Damaged, unavailable, and unrelated files are never listed.
        }
      }
    }
  }

  return {
    roots,
    profiles: Array.from(found.values()).sort((left, right) => (
      Date.parse(right.lastBackupAt || 0) - Date.parse(left.lastBackupAt || 0)
    )),
    limited: scannedDirectories >= 3000 || scannedFiles >= 5000
  };
}

function createRestorePointBackup(payload, restorePointDir, limit = 30, prefix = 'restore') {
  try {
    if (!restorePointDir) return;
    fs.mkdirSync(restorePointDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const targetFile = path.join(restorePointDir, `${prefix}-${date}.json`);
    writeJsonAtomically(targetFile, payload);
    const files = fs.readdirSync(restorePointDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.startsWith(`${prefix}-`) && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort();
    for (const oldName of files.slice(0, Math.max(0, files.length - Math.max(1, Number(limit) || 30)))) {
      fs.unlinkSync(path.join(restorePointDir, oldName));
    }
  } catch (error) {
    console.error('Failed to create organized restore point:', error);
  }
}

/**
 * Creates a unique, immutable local restore point before an operation that can
 * replace many records at once. Unlike daily rolling backups, multiple sync
 * operations on the same day retain separate recovery snapshots.
 */
function createLocalRestorePoint(reason = 'shared-sync', limit = 50) {
  ensureDataFolder();
  if (!fs.existsSync(dbPath)) throw new Error('The local database is unavailable for a restore point.');
  const payload = fs.readFileSync(dbPath, 'utf8');
  JSON.parse(payload);
  const backupFolder = path.join(dbDir, 'backups');
  fs.mkdirSync(backupFolder, { recursive: true });
  const safeReason = sanitizeFilename(reason || 'restore').toLowerCase() || 'restore';
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, '-');
  const unique = crypto.randomBytes(4).toString('hex');
  const filename = `${safeReason}-restore-point-${stamp}-${unique}.json`;
  writeJsonAtomically(path.join(backupFolder, filename), payload);

  const matching = fs.readdirSync(backupFolder, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith(`${safeReason}-restore-point-`) && entry.name.endsWith('.json'))
    .map(entry => ({
      name: entry.name,
      filePath: path.join(backupFolder, entry.name),
      modifiedAt: fs.statSync(path.join(backupFolder, entry.name)).mtimeMs
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const old of matching.slice(Math.max(1, Number(limit) || 50))) {
    fs.unlinkSync(old.filePath);
  }
  return { success: true, createdAt, filename };
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
        const deviceId = sharedFolderSync.getDeviceInfo().deviceId.toLowerCase();
        const deviceSuffix = activeProfile.sharedFolderSync?.enabled ? `-${deviceId}` : '';
        const backupFileKey = backupRecoveryId
          ? `${backupRecoveryId}${deviceSuffix}`
          : sanitizeFilename(activeProfile.name);

        // Use the same versioned/checksummed envelope as manual backups.
        // Older raw secondary backups remain supported by the renderer importer.
        const profilePayload = JSON.stringify(createSecondaryBackupEnvelope(activeProfile), null, 2);
        const organized = backupRecoveryId && activeProfile.sharedFolderSync?.enabled
          ? sharedFolderSync.backupPaths(backupRecoveryId)
          : null;
        if (organized?.layoutVersion === 2) {
          fs.mkdirSync(organized.backupDir, { recursive: true });
          writeJsonAtomically(path.join(organized.backupDir, `latest-${deviceId}.json`), profilePayload);
          createRestorePointBackup(profilePayload, organized.restorePointDir, 30, `restore-${deviceId}`);
        } else {
          const secondaryFile = path.join(activeProfile.secondaryBackupPath, `eclass-record-backup-${backupFileKey}.json`);
          writeJsonAtomically(secondaryFile, profilePayload);
          createRollingBackup(profilePayload, activeProfile.secondaryBackupPath, 30, `backup-${backupFileKey}`);
        }
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
  createLocalRestorePoint,
  writeJsonAtomically,
  verifyBackupEnvelopeIntegrity,
  scanBackupDirectory,
  discoverOneDriveBackups,
  readValidDiscoveredBackup
};
