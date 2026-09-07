const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const channel = require('../src/main/mobile-update-channel');
const apk = Buffer.from('signed test apk bytes');
const manifest = {
  schemaVersion: 1,
  applicationId: 'com.example.eclassrecordmobile',
  versionCode: 99,
  versionName: '9.9.9-test',
  fileName: 'E-Class-Record-Mobile-v9.9.9-test.apk',
  size: apk.length,
  sha256: crypto.createHash('sha256').update(apk).digest('hex'),
  minimumCompanionProtocol: 2,
  releaseNotes: 'Updater channel test',
  downloadUrl: 'https://github.com/jerniqz-del/eclassrecord/releases/download/mobile-v9.9.9-test/E-Class-Record-Mobile-v9.9.9-test.apk'
};

assert.equal(channel.safeManifest(manifest).versionCode, 99);
assert.throws(() => channel.safeManifest({ ...manifest, downloadUrl: 'http://github.com/file.apk' }), /approved GitHub/);
assert.throws(() => channel.safeManifest({ ...manifest, downloadUrl: 'https://example.com/file.apk' }), /approved GitHub/);
assert.throws(() => channel.safeManifest({ ...manifest, applicationId: 'another.app' }), /different Android application/);
assert.throws(() => channel.safeManifest({ ...manifest, minimumCompanionProtocol: 'unknown' }), /minimum companion protocol/);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-mobile-update-'));
const originalFetch = global.fetch;
let calls = 0;
global.fetch = async (url) => {
  calls += 1;
  const bytes = String(url).includes('mobile-update.json') ? Buffer.from(JSON.stringify(manifest)) : apk;
  return {
    status: 200,
    ok: true,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(bytes.length) : '' },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer
  };
};

(async () => {
  try {
    const result = await channel.refresh(temporaryRoot, {
      force: true,
      manifestUrl: 'https://raw.githubusercontent.com/jerniqz-del/eclassrecord/main/mobile-updates/stable/mobile-update.json'
    });
    assert.equal(result.state, 'downloaded');
    assert.equal(calls, 2);
    assert.ok(fs.existsSync(path.join(temporaryRoot, manifest.fileName)));
    const cached = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'mobile-update.json'), 'utf8'));
    assert.equal(cached.versionCode, manifest.versionCode);
    assert.equal(cached.downloadUrl, undefined, 'The public download URL should not be exposed to phones.');
    console.log('GitHub mobile update channel tests passed.');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
