const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  SchoolCloudVault,
  sanitizeRecord
} = require('../src/main/school-cloud-vault');

function mockSafeStorage() {
  const key = crypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(value) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
}

(() => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-school-cloud-vault-'));
  try {
    const writeJsonAtomically = (target, payload) => {
      JSON.parse(payload);
      const temporary = `${target}.tmp`;
      fs.writeFileSync(temporary, payload, 'utf8');
      fs.renameSync(temporary, target);
    };
    const vault = new SchoolCloudVault({ rootDir, safeStorage: mockSafeStorage(), writeJsonAtomically });
    const record = {
      endpoint: 'https://school.example.workers.dev',
      sessionToken: 'secret-session-token',
      deviceId: 'device-1',
      encryptedDevicePrivateKeys: 'already-wrapped-key-material'
    };
    assert.deepStrictEqual(vault.set('school_12345', record), { schoolId: 'school_12345', stored: true });
    assert.deepStrictEqual(vault.get('school_12345'), record);
    assert.deepStrictEqual(vault.list(), ['school_12345']);

    const fileText = fs.readFileSync(path.join(rootDir, 'school-cloud-vault.json'), 'utf8');
    assert(!fileText.includes('secret-session-token'), 'session token leaked into the vault envelope');
    assert(!fileText.includes('already-wrapped-key-material'), 'device key material leaked into the vault envelope');
    assert(fileText.includes('electron-safe-storage'), 'vault protection metadata is missing');

    assert.throws(() => sanitizeRecord({ schoolRootKey: 'must-not-be-stored' }), /must not be stored/);
    assert.throws(() => new SchoolCloudVault({
      rootDir,
      safeStorage: { isEncryptionAvailable: () => false },
      writeJsonAtomically
    }).readAll(), /unavailable/);
    assert.deepStrictEqual(vault.remove('school_12345'), { schoolId: 'school_12345', removed: true });
    assert.strictEqual(vault.get('school_12345'), null);

    console.log('School Cloud protected desktop credential vault tests passed.');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
})();
