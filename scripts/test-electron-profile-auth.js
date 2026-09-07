'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { ProfileAuth, hashPin } = require('../src/main/profile-auth');
const { installPowerLifecycle } = require('../src/main/power-lifecycle');
const companionIdentity = require('../src/main/companion-identity');

const salt = crypto.randomBytes(16).toString('hex');
const pin = '246810';
const auth = new ProfileAuth();
auth.ingestDatabase({
  profiles: [
    { id: 'teacher-1', pinEnabled: true, salt, pinHash: hashPin(pin, salt) },
    { id: 'open-1', pinEnabled: false, salt: '', pinHash: '' }
  ]
});

assert.throws(() => auth.unlock('teacher-1', true), /Incorrect profile PIN|Invalid/);
assert.throws(() => auth.unlock('teacher-1'), /Incorrect profile PIN/);
auth.unlock('teacher-1', pin);
assert.strictEqual(auth.isUnlocked(), true);
assert.strictEqual(auth.sessionProfileId(), 'teacher-1');
assert.strictEqual(auth.verifyAuthorizationPin('teacher-1', pin), true);
assert.strictEqual(auth.verifyAuthorizationPin('teacher-1', '000000'), false);
auth.lock();
assert.strictEqual(auth.isUnlocked(), false);
auth.unlock('open-1', '');
assert.strictEqual(auth.isUnlocked(), true);
assert.strictEqual(auth.authorizeChanges('open-1', ''), true);
auth.lock();

const limited = new ProfileAuth();
limited.ingestDatabase({
  profiles: [{ id: 'teacher-1', pinEnabled: true, salt, pinHash: hashPin(pin, salt) }]
});
for (let index = 0; index < 5; index += 1) {
  assert.throws(() => limited.unlock('teacher-1', '000000'));
}
assert.throws(() => limited.unlock('teacher-1', pin), /Too many incorrect PIN attempts/);

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.js'), 'utf8');
const sessionBridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'session-bridge.js'), 'utf8');
const markup = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'legacy-markup-runtime.js'), 'utf8');
const companionBridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'mobile-sync-companion.js'), 'utf8');
const startupSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'startup.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const databaseSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'database.js'), 'utf8');
assert.doesNotMatch(mainSource, /security:set-profile-session/);
assert.match(mainSource, /security:unlock-profile/);
assert.match(mainSource, /profileAuth\.verifyAuthorizationPin/);
assert.match(mainSource, /payload\.liveSync/);
assert.match(preloadSource, /unlockProfile:/);
assert.doesNotMatch(preloadSource, /setProfileSession:/);
assert.match(sessionBridge, /api\.unlockProfile\(/);
assert.match(sessionBridge, /restoreTrustedLink/);
assert.match(sessionBridge, /payload\?\.locked/);
assert.match(companionBridge, /canRestoreTrustedLink/);
assert.match(companionBridge, /isProfileSessionActive/);
assert.match(markup, /'electronAPI'/);
assert.match(markup, /BLOCKED_MEMBERS = new Set\(\['__proto__', 'prototype', 'constructor', 'electronAPI'\]\)/);
assert.match(startupSource, /function installProfilePinAutoUnlock\(\)/);
assert.match(startupSource, /pin\.length !== 6 \|\| busy/);
assert.match(startupSource, /submitPasscode\(\)/);
assert.match(htmlSource, /id="passcodeField"[^>]*inputmode="numeric"/);
assert.match(databaseSource, /if \(numeric\.length === 6\) submit\(\);/);

const identityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-identity-'));
const identityPath = path.join(identityDir, 'companion-lan-identity.json');
const storage = companionIdentity.createMemoryStorage();
const plaintext = {
  desktopId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  secret: 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890',
  pin: '123456',
  certificateFingerprint: 'a'.repeat(64),
  privateKey: 'key',
  certificate: 'cert'
};
fs.writeFileSync(identityPath, JSON.stringify(plaintext));
const migrated = companionIdentity.read(identityPath, storage);
assert.strictEqual(migrated.desktopId, plaintext.desktopId);
companionIdentity.write(identityPath, migrated, storage);
const envelope = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
assert.strictEqual(envelope.protection, 'electron-safe-storage');
assert.ok(envelope.ciphertext);
assert.strictEqual(companionIdentity.read(identityPath, storage).sessionId, plaintext.sessionId);

const powerMonitor = new EventEmitter();
const locked = [];
const companion = {
  commandLock: false,
  paused: 0,
  resumed: 0,
  setCommandLock(value) { this.commandLock = Boolean(value); },
  pauseDiscovery() { this.paused += 1; },
  async resumeAfterSleep() { this.resumed += 1; }
};
const apkInstall = { stopped: 0, async stop() { this.stopped += 1; } };
const lifecycleAuth = new ProfileAuth();
lifecycleAuth.ingestDatabase({ profiles: [{ id: 'open-1', pinEnabled: false }] });
lifecycleAuth.unlock('open-1', '');
const lifecycle = installPowerLifecycle({
  powerMonitor,
  profileAuth: lifecycleAuth,
  companionSyncService: companion,
  mobileApkInstallService: apkInstall,
  fileIO: { createLocalRestorePoint() { locked.push('checkpoint'); } },
  getMainWindow: () => ({
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send(channel) { locked.push(channel); } }
  })
});
powerMonitor.emit('lock-screen');
assert.strictEqual(lifecycleAuth.isUnlocked(), false);
assert.strictEqual(companion.commandLock, true);
assert.strictEqual(apkInstall.stopped, 1);
assert.ok(locked.includes('security:profile-locked'));
powerMonitor.emit('unlock-screen');
assert.strictEqual(lifecycleAuth.isUnlocked(), false);
lifecycle.dispose();
fs.rmSync(identityDir, { recursive: true, force: true });

console.log('Electron profile-auth, markup bridge, identity envelope, and lock-lifecycle tests passed.');
