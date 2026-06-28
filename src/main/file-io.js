/**
 * E-Class Record — Electron File I/O Module
 *
 * Implements persistent JSON database storage in %APPDATA%/EClassRecordPortable/data.json.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

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
    fs.writeFileSync(targetFile, payload, 'utf8');

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

    fs.writeFileSync(dbPath, payload, 'utf8');

    // Local daily rolling backup in AppData backups folder
    createRollingBackup(payload, dbDir, 30, 'backup');

    // Secondary auto-backup if secondaryBackupPath is set on the active profile
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const activeProfile = parsed.profiles && parsed.profiles.find(p => p.id === parsed.activeProfileId);
      if (activeProfile && activeProfile.secondaryBackupPath) {
        const userNameClean = sanitizeFilename(activeProfile.name);
        const secondaryFile = path.join(activeProfile.secondaryBackupPath, `eclass-record-backup-${userNameClean}.json`);
        
        // Serialize only the active profile's data
        const profilePayload = typeof activeProfile.data === 'string' ? activeProfile.data : JSON.stringify(activeProfile.data, null, 2);
        fs.writeFileSync(secondaryFile, profilePayload, 'utf8');

        // Secondary daily rolling backup (rolling limit of 30 days)
        createRollingBackup(profilePayload, activeProfile.secondaryBackupPath, 30, `backup-${userNameClean}`);
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
  writeFile
};
