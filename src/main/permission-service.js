'use strict';

const fs = require('fs');
const path = require('path');

const CAPABILITIES = Object.freeze(['bluetooth', 'microphone']);

class PermissionService {
  constructor(filePath, now = () => Date.now()) {
    this.filePath = path.resolve(filePath);
    this.now = now;
    this.intents = new Map();
  }

  read() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        bluetooth: value.bluetooth !== false,
        microphone: value.microphone !== false
      };
    } catch (_error) {
      return { bluetooth: true, microphone: true };
    }
  }

  write(value) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  set(capability, enabled) {
    if (!CAPABILITIES.includes(capability)) throw new Error('Unsupported app capability.');
    const preferences = this.read();
    preferences[capability] = enabled === true;
    this.write(preferences);
    if (!preferences[capability]) this.intents.delete(capability);
    return preferences;
  }

  begin(capability) {
    const preferences = this.read();
    if (!CAPABILITIES.includes(capability) || !preferences[capability]) throw new Error('This capability is disabled in Settings.');
    this.intents.set(capability, this.now() + 30_000);
    return { allowed: true, capability, expiresInMs: 30_000 };
  }

  consume(capability) {
    const expiresAt = this.intents.get(capability) || 0;
    this.intents.delete(capability);
    return expiresAt >= this.now();
  }

  allows(capability) {
    return this.read()[capability] === true;
  }
}

module.exports = { CAPABILITIES, PermissionService };
