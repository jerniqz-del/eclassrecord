/**
 * E-Class Record — versioned local cryptography, backup integrity, and PIN recovery.
 * Legacy SHA-256 PIN hashes and 100,000-iteration encrypted payloads remain readable.
 */

const LEGACY_KDF_ITERATIONS = 100000;
const CURRENT_KDF_ITERATIONS = 310000;
const MAX_ACCEPTED_KDF_ITERATIONS = 2000000;
const BACKUP_FORMAT = 'eclass-record-backup';
const BACKUP_FORMAT_VERSION = 2;

function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hexString) {
  if (typeof hexString !== 'string' || hexString.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hexString)) {
    throw new Error('Invalid encrypted data encoding.');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(hexString.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function generateSalt() {
  return bufToHex(window.crypto.getRandomValues(new Uint8Array(16)));
}

async function sha256(text) {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return bufToHex(hashBuffer);
}

function timingSafeEqualText(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function deriveBits(secret, saltUint8, iterations, length = 256) {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(secret)), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  return window.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltUint8, iterations, hash: 'SHA-256' }, keyMaterial, length
  );
}

/** New hashes are tagged PBKDF2 values; untagged hashes from early releases remain valid. */
async function hashPin(pin, salt) {
  const bits = await deriveBits(pin, hexToBuf(salt), CURRENT_KDF_ITERATIONS);
  return `pbkdf2-sha256$${CURRENT_KDF_ITERATIONS}$${bufToHex(bits)}`;
}

async function verifyPin(pin, salt, storedHash) {
  if (typeof storedHash !== 'string') return false;
  if (!storedHash.startsWith('pbkdf2-sha256$')) {
    return timingSafeEqualText(await sha256(String(pin) + String(salt)), storedHash);
  }
  const parts = storedHash.split('$');
  const iterations = Number(parts[1]);
  if (parts.length !== 3 || !Number.isInteger(iterations) || iterations < LEGACY_KDF_ITERATIONS || iterations > MAX_ACCEPTED_KDF_ITERATIONS) return false;
  const candidate = bufToHex(await deriveBits(pin, hexToBuf(salt), iterations));
  return timingSafeEqualText(candidate, parts[2]);
}

function payloadIterations(encryptedObj) {
  const raw = encryptedObj?.kdf?.iterations ?? encryptedObj?.iterations;
  if (raw === undefined) return LEGACY_KDF_ITERATIONS;
  const iterations = Number(raw);
  if (!Number.isInteger(iterations) || iterations < LEGACY_KDF_ITERATIONS || iterations > MAX_ACCEPTED_KDF_ITERATIONS) {
    throw new Error('Unsupported encrypted data key settings.');
  }
  return iterations;
}

async function deriveKey(secret, saltUint8, iterations = CURRENT_KDF_ITERATIONS) {
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(secret)), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltUint8, iterations, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptPayload(plainText, secret, options = {}) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt, CURRENT_KDF_ITERATIONS);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(plainText)));
  return {
    secureBackup: true,
    format: 'eclass-record-encrypted-payload',
    encryptionVersion: 2,
    purpose: options.purpose || 'profile-or-backup',
    algorithm: 'AES-256-GCM',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: CURRENT_KDF_ITERATIONS },
    salt: bufToHex(salt),
    iv: bufToHex(iv),
    ciphertext: bufToHex(ciphertext)
  };
}

async function decryptPayload(encryptedObj, secret) {
  if (!encryptedObj || typeof encryptedObj !== 'object') throw new Error('Invalid encrypted data descriptor.');
  const salt = hexToBuf(encryptedObj.salt);
  const iv = hexToBuf(encryptedObj.iv);
  const ciphertext = hexToBuf(encryptedObj.ciphertext);
  if (salt.length < 8 || iv.length !== 12 || !ciphertext.length) throw new Error('Invalid encrypted data descriptor.');
  try {
    const key = await deriveKey(secret, salt, payloadIterations(encryptedObj));
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    throw new Error('Incorrect PIN/recovery key or corrupted encrypted data.');
  }
}

function stableStringify(value) {
  const seen = new WeakSet();
  function normalize(item) {
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) throw new Error('Cannot calculate integrity for circular data.');
    seen.add(item);
    if (Array.isArray(item)) return item.map(normalize);
    const output = {};
    Object.keys(item).sort().forEach(key => {
      if (item[key] !== undefined) output[key] = normalize(item[key]);
    });
    return output;
  }
  return JSON.stringify(normalize(value));
}

async function createIntegrityDescriptor(value) {
  return { version: 1, algorithm: 'SHA-256', digest: await sha256(stableStringify(value)) };
}

async function verifyIntegrityDescriptor(value, descriptor) {
  if (!descriptor) return { valid: true, legacy: true };
  if (descriptor.version !== 1 || descriptor.algorithm !== 'SHA-256' || typeof descriptor.digest !== 'string') {
    return { valid: false, unsupported: true };
  }
  const actual = await sha256(stableStringify(value));
  return { valid: timingSafeEqualText(actual, descriptor.digest), legacy: false };
}

async function createBackupEnvelope(profileDb, pin = '', metadata = {}) {
  const serialized = JSON.stringify(profileDb);
  const encrypted = Boolean(pin);
  const payload = encrypted ? await encryptPayload(serialized, pin, { purpose: 'manual-backup' }) : JSON.parse(serialized);
  const core = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: metadata.appVersion || '',
    profileSchemaVersion: Number(profileDb?.version) || 0,
    protection: encrypted ? 'pin-aes-256-gcm' : 'none',
    payload
  };
  return { ...core, integrity: await createIntegrityDescriptor(core) };
}

async function openBackupEnvelope(envelope, pin = '') {
  if (!envelope || envelope.format !== BACKUP_FORMAT) throw new Error('Unsupported backup format.');
  if (!Number.isInteger(envelope.backupVersion) || envelope.backupVersion < 1 || envelope.backupVersion > BACKUP_FORMAT_VERSION) {
    throw new Error('This backup was created by a newer app version and cannot be safely restored here.');
  }
  const core = { ...envelope };
  delete core.integrity;
  const integrity = await verifyIntegrityDescriptor(core, envelope.integrity);
  if (!integrity.valid) throw new Error(integrity.unsupported ? 'Unsupported backup integrity format.' : 'Backup integrity check failed. No data was restored.');
  if (envelope.protection === 'pin-aes-256-gcm') {
    if (!pin) throw new Error('This backup requires its PIN.');
    return JSON.parse(await decryptPayload(envelope.payload, pin));
  }
  if (envelope.protection !== 'none') throw new Error('Unsupported backup protection method.');
  return JSON.parse(JSON.stringify(envelope.payload));
}

function normalizeRecoveryKey(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}

function generateRecoveryKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = window.crypto.getRandomValues(new Uint8Array(20));
  const raw = Array.from(random, byte => alphabet[byte & 31]).join('');
  return raw.match(/.{1,4}/g).join('-');
}

async function createPinRecoveryDescriptor(pin, recoveryKey, previous = {}) {
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (normalizedKey.length < 20) throw new Error('Recovery key is incomplete.');
  return {
    version: 1,
    method: 'offline-recovery-key',
    createdAt: previous.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    keyHint: normalizedKey.slice(-4),
    wrappedPin: await encryptPayload(String(pin), normalizedKey, { purpose: 'pin-recovery' })
  };
}

async function recoverPinFromDescriptor(descriptor, recoveryKey) {
  if (!descriptor || descriptor.version !== 1 || descriptor.method !== 'offline-recovery-key' || !descriptor.wrappedPin) {
    throw new Error('PIN recovery was not set up for this profile.');
  }
  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  if (normalizedKey.length < 20) throw new Error('Recovery key is incomplete.');
  return decryptPayload(descriptor.wrappedPin, normalizedKey);
}
