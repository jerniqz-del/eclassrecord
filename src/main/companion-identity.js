'use strict';

const fs = require('fs');
const path = require('path');

const IDENTITY_VERSION = 1;

function isPlainIdentity(value) {
  return Boolean(value && typeof value === 'object' && value.sessionId && value.secret);
}

function readRawFile(identityPath) {
  if (!identityPath || !fs.existsSync(identityPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function decryptEnvelope(parsed, storage) {
  if (!parsed || parsed.protection !== 'electron-safe-storage' || typeof parsed.ciphertext !== 'string') return null;
  if (!storage?.isEncryptionAvailable?.()) return null;
  const plaintext = storage.decryptString(Buffer.from(parsed.ciphertext, 'base64'));
  const identity = JSON.parse(plaintext);
  return isPlainIdentity(identity) ? identity : null;
}

function read(identityPath, storage) {
  const parsed = readRawFile(identityPath);
  if (!parsed) return null;
  if (parsed.protection === 'electron-safe-storage') return decryptEnvelope(parsed, storage);
  return isPlainIdentity(parsed) ? parsed : null;
}

function write(identityPath, identity, storage) {
  if (!identityPath || !isPlainIdentity(identity)) return { persisted: false };
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  if (!storage?.isEncryptionAvailable?.()) return { persisted: false, reason: 'safe-storage-unavailable' };
  const encrypted = storage.encryptString(JSON.stringify(identity));
  const envelope = {
    version: IDENTITY_VERSION,
    protection: 'electron-safe-storage',
    ciphertext: Buffer.from(encrypted).toString('base64')
  };
  const temporaryPath = `${identityPath}.incoming`;
  fs.writeFileSync(temporaryPath, JSON.stringify(envelope), { mode: 0o600 });
  fs.renameSync(temporaryPath, identityPath);
  return { persisted: true };
}

function createMemoryStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(String(value), 'utf8'),
    decryptString: (buffer) => Buffer.from(buffer).toString('utf8')
  };
}

module.exports = {
  IDENTITY_VERSION,
  read,
  write,
  isPlainIdentity,
  createMemoryStorage
};
