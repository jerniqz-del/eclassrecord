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
 * Saves the database to disk.
 * @param {object|string} data The database contents.
 * @returns {boolean} True if successful.
 */
function saveDatabase(data) {
  try {
    ensureDataFolder();
    const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(dbPath, payload, 'utf8');
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
