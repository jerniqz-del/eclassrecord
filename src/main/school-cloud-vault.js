const fs = require('fs');
const path = require('path');

const VAULT_VERSION = 1;
const VAULT_FILE_NAME = 'school-cloud-vault.json';

function assertSafeStorage(storage) {
  if (!storage || typeof storage.isEncryptionAvailable !== 'function'
    || typeof storage.encryptString !== 'function' || typeof storage.decryptString !== 'function'
    || !storage.isEncryptionAvailable()) {
    throw new Error('Operating-system protected storage is unavailable. School Cloud cannot store credentials safely.');
  }
}

function normalizeSchoolId(value) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error('A valid school cloud ID is required.');
  return id;
}

function sanitizeRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Vault record must be an object.');
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > 512 * 1024) throw new Error('School Cloud credential record is too large.');
  const parsed = JSON.parse(serialized);
  for (const forbidden of ['schoolRootKey', 'recoveryShare', 'overrideKey', 'installToken']) {
    if (Object.prototype.hasOwnProperty.call(parsed, forbidden)) {
      throw new Error(`${forbidden} must not be stored in the desktop credential vault.`);
    }
  }
  return parsed;
}

class SchoolCloudVault {
  constructor(options = {}) {
    this.safeStorage = options.safeStorage;
    this.rootDir = options.rootDir;
    this.writeJsonAtomically = options.writeJsonAtomically || require('./file-io').writeJsonAtomically;
    if (!this.rootDir) throw new Error('School Cloud vault directory is required.');
    this.filePath = path.join(this.rootDir, VAULT_FILE_NAME);
  }

  readAll() {
    assertSafeStorage(this.safeStorage);
    if (!fs.existsSync(this.filePath)) return { version: VAULT_VERSION, schools: {} };
    const envelope = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (envelope.version !== VAULT_VERSION || typeof envelope.ciphertext !== 'string') {
      throw new Error('School Cloud credential vault has an unsupported format.');
    }
    const plaintext = this.safeStorage.decryptString(Buffer.from(envelope.ciphertext, 'base64'));
    const state = JSON.parse(plaintext);
    if (!state || state.version !== VAULT_VERSION || !state.schools || typeof state.schools !== 'object') {
      throw new Error('School Cloud credential vault is damaged.');
    }
    return state;
  }

  writeAll(state) {
    assertSafeStorage(this.safeStorage);
    const canonical = { version: VAULT_VERSION, schools: state.schools || {} };
    const encrypted = this.safeStorage.encryptString(JSON.stringify(canonical));
    fs.mkdirSync(this.rootDir, { recursive: true });
    this.writeJsonAtomically(this.filePath, JSON.stringify({
      version: VAULT_VERSION,
      protection: 'electron-safe-storage',
      ciphertext: encrypted.toString('base64')
    }));
  }

  get(schoolId) {
    return this.readAll().schools[normalizeSchoolId(schoolId)] || null;
  }

  set(schoolId, record) {
    const id = normalizeSchoolId(schoolId);
    const state = this.readAll();
    state.schools[id] = sanitizeRecord(record);
    this.writeAll(state);
    return { schoolId: id, stored: true };
  }

  remove(schoolId) {
    const id = normalizeSchoolId(schoolId);
    const state = this.readAll();
    const existed = Object.prototype.hasOwnProperty.call(state.schools, id);
    delete state.schools[id];
    this.writeAll(state);
    return { schoolId: id, removed: existed };
  }

  list() {
    return Object.keys(this.readAll().schools).sort();
  }
}

module.exports = {
  SchoolCloudVault,
  VAULT_FILE_NAME,
  VAULT_VERSION,
  assertSafeStorage,
  normalizeSchoolId,
  sanitizeRecord
};
