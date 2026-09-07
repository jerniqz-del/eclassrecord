'use strict';

const crypto = require('crypto');

const LEGACY_KDF_ITERATIONS = 100000;
const CURRENT_KDF_ITERATIONS = 310000;
const MAX_ACCEPTED_KDF_ITERATIONS = 2000000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hexToBuf(hexString) {
  if (typeof hexString !== 'string' || hexString.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hexString)) {
    throw new Error('Invalid PIN salt encoding.');
  }
  return Buffer.from(hexString, 'hex');
}

function hashPin(pin, salt, iterations = CURRENT_KDF_ITERATIONS) {
  const derived = crypto.pbkdf2Sync(String(pin), hexToBuf(salt), iterations, 32, 'sha256').toString('hex');
  return `pbkdf2-sha256$${iterations}$${derived}`;
}

function verifyPin(pin, salt, storedHash) {
  if (typeof storedHash !== 'string') return false;
  if (!storedHash.startsWith('pbkdf2-sha256$')) {
    const expected = crypto.createHash('sha256').update(String(pin) + String(salt)).digest('hex');
    return timingSafeEqualText(expected, storedHash);
  }
  const parts = storedHash.split('$');
  const iterations = Number(parts[1]);
  if (parts.length !== 3 || !Number.isInteger(iterations)
    || iterations < LEGACY_KDF_ITERATIONS || iterations > MAX_ACCEPTED_KDF_ITERATIONS) {
    return false;
  }
  try {
    const candidate = crypto.pbkdf2Sync(String(pin), hexToBuf(salt), iterations, 32, 'sha256').toString('hex');
    return timingSafeEqualText(candidate, parts[2]);
  } catch (_error) {
    return false;
  }
}

class ProfileAuth {
  constructor() {
    this.profiles = new Map();
    this.session = null;
    this.failures = new Map();
  }

  ingestDatabase(data) {
    this.profiles.clear();
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    for (const profile of profiles) {
      const profileId = String(profile?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId)) continue;
      this.profiles.set(profileId, {
        profileId,
        pinEnabled: Boolean(profile.pinEnabled),
        salt: String(profile.salt || ''),
        pinHash: String(profile.pinHash || '')
      });
    }
    if (this.session && !this.profiles.has(this.session.profileId)) this.session = null;
  }

  isUnlocked() {
    return Boolean(this.session);
  }

  sessionProfileId() {
    return this.session?.profileId || '';
  }

  lock() {
    this.session = null;
    return { unlocked: false };
  }

  assertNotBlocked(profileId) {
    const record = this.failures.get(profileId);
    if (record?.blockedUntil > Date.now()) {
      throw new Error('Too many incorrect PIN attempts. Try again later.');
    }
  }

  recordFailure(profileId) {
    const record = this.failures.get(profileId) || { count: 0, blockedUntil: 0 };
    record.count += 1;
    if (record.count >= MAX_FAILURES) {
      record.count = 0;
      record.blockedUntil = Date.now() + LOCKOUT_MS;
    }
    this.failures.set(profileId, record);
  }

  unlock(profileId, pin) {
    const id = String(profileId || '');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid profile session identifier.');
    const record = this.profiles.get(id);
    if (!record) throw new Error('Unknown profile.');
    this.assertNotBlocked(id);
    if (!record.pinEnabled) {
      this.session = { profileId: id, establishedAt: Date.now() };
      this.failures.delete(id);
      return { unlocked: true, profileId: id };
    }
    const candidate = String(pin || '');
    if (!/^\d{6}$/.test(candidate) || !verifyPin(candidate, record.salt, record.pinHash)) {
      this.recordFailure(id);
      throw new Error('Incorrect profile PIN.');
    }
    this.session = { profileId: id, establishedAt: Date.now() };
    this.failures.delete(id);
    return { unlocked: true, profileId: id };
  }

  verifyAuthorizationPin(profileId, pin, pairingPin = '') {
    const id = String(profileId || '');
    const record = this.profiles.get(id);
    if (!record) return false;
    try {
      this.assertNotBlocked(id);
    } catch (_error) {
      return false;
    }
    const candidate = String(pin || '');
    if (!/^\d{6}$/.test(candidate)) return false;
    if (!record.pinEnabled) {
      const ok = timingSafeEqualText(candidate, String(pairingPin || ''));
      if (!ok) this.recordFailure(id);
      else this.failures.delete(id);
      return ok;
    }
    const ok = verifyPin(candidate, record.salt, record.pinHash);
    if (!ok) this.recordFailure(id);
    else this.failures.delete(id);
    return ok;
  }

  authorizeChanges(profileId, pin, pairingPin = '') {
    const record = this.profiles.get(String(profileId || ''));
    if (!record) return false;
    if (!record.pinEnabled) return true;
    return this.verifyAuthorizationPin(profileId, pin, pairingPin);
  }
}

module.exports = {
  ProfileAuth,
  hashPin,
  verifyPin,
  LEGACY_KDF_ITERATIONS,
  CURRENT_KDF_ITERATIONS
};
