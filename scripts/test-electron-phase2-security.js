'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  APP_ORIGIN,
  CONTENT_SECURITY_POLICY,
  assertSafeExternalUrl,
  isTrustedAppUrl,
  resolveAppAsset,
  validateIpcPayload
} = require('../src/main/security-boundary');
const computeService = require('../src/main/compute-service');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const builderSource = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

assert.strictEqual(APP_ORIGIN, 'eclass-app://app');
assert(isTrustedAppUrl('eclass-app://app/index.html'));
assert(isTrustedAppUrl('eclass-app://app/js/app.js#ready'));
assert(!isTrustedAppUrl('file:///tmp/index.html'));
assert(!isTrustedAppUrl('https://example.com'));
assert(!isTrustedAppUrl('eclass-app://user:secret@app/index.html'));

const rendererRoot = path.join(root, 'src', 'renderer');
assert.strictEqual(resolveAppAsset(rendererRoot, 'eclass-app://app/'), path.join(rendererRoot, 'index.html'));
assert.strictEqual(resolveAppAsset(rendererRoot, 'eclass-app://app/js/security.js'), path.join(rendererRoot, 'js', 'security.js'));
assert.throws(() => resolveAppAsset(rendererRoot, 'eclass-app://app/%2e%2e%2fmain/main.js'), /escaped|Malformed|Untrusted/);

assert.strictEqual(assertSafeExternalUrl('https://example.com/help'), 'https://example.com/help');
for (const unsafe of [
  'http://example.com',
  'javascript:alert(1)',
  'data:text/html,unsafe',
  'file:///C:/Windows/System32/cmd.exe',
  'ftp://example.com/a',
  'smb://server/share',
  'https://user:password@example.com'
]) {
  assert.throws(() => assertSafeExternalUrl(unsafe));
}

validateIpcPayload('db:save', [{ profiles: [], activeProfileId: '' }]);
validateIpcPayload('bluetooth:auto-scan', ['A1B2C3']);
assert.throws(() => validateIpcPayload('bluetooth:auto-scan', ['bad']));
assert.throws(() => validateIpcPayload('shell:open-external', ['file:///unsafe']));
assert.throws(() => validateIpcPayload('test:pollution', [{ constructor: { prototype: { polluted: true } } }]), /Unsafe IPC property/);
assert.throws(() => validateIpcPayload('test:deep', [Array.from({ length: 26 }).reduce(value => [value], 1)]), /nesting/);
const sharedSession = { classId: 'c1', date: '2026-09-07', term: '1', statuses: [] };
validateIpcPayload('companion:publish-snapshot', [{
  format: 'eclass-companion-snapshot',
  assignments: [{ id: 'c1', attendance: [sharedSession] }],
  attendance: [sharedSession]
}]);
const circular = { format: 'loop' };
circular.self = circular;
assert.throws(() => validateIpcPayload('companion:publish-snapshot', [circular]), /Circular IPC payload/);

assert(CONTENT_SECURITY_POLICY.includes("script-src-elem 'self'"));
assert(CONTENT_SECURITY_POLICY.includes("object-src 'none'"));
assert(CONTENT_SECURITY_POLICY.includes("base-uri 'none'"));
assert(CONTENT_SECURITY_POLICY.includes("frame-src 'self'"));
assert(!CONTENT_SECURITY_POLICY.includes("script-src-elem 'self' 'unsafe-inline'"));

assert(mainSource.includes('app.enableSandbox()'));
assert(mainSource.includes('sandbox: true'));
assert(mainSource.includes('securityBoundary.configureWebContents(mainWindow.webContents)'));
assert(mainSource.includes('securityBoundary.installPermissionPolicy'));
assert(mainSource.includes('securityBoundary.installIpcBoundary'));
assert(mainSource.includes('securityBoundary.assertSafeExternalUrl(url)'));
assert(mainSource.includes('securityBoundary.APP_ORIGIN'));
assert(!mainSource.includes("mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))"));

assert(!preloadSource.includes("require('qrcode')"));
assert(!preloadSource.includes("require('jsqr')"));
assert(!preloadSource.includes("require('sudoku-gen')"));
assert(preloadSource.includes('ipcRenderer.removeListener(channel, listener)'));
assert(preloadSource.includes("ipcRenderer.invoke('compute:generate-companion-qr'"));
assert(preloadSource.includes("ipcRenderer.invoke('security:unlock-profile'"));
assert(!preloadSource.includes("security:set-profile-session"));
assert(mainSource.includes("security:unlock-profile"));
assert(!mainSource.includes("security:set-profile-session"));
assert(preloadSource.includes("ipcRenderer.invoke('compute:decode-recovery-qr'"));

assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(indexSource), 'index.html must not contain inline script elements');
assert(indexSource.includes('src="js/early-startup.js"'));
assert(indexSource.includes('src="js/browser-mock.js"'));
assert(indexSource.includes('src="js/startup.js"'));

for (const setting of [
  'runAsNode: false',
  'enableCookieEncryption: true',
  'enableNodeOptionsEnvironmentVariable: false',
  'enableNodeCliInspectArguments: false',
  'enableEmbeddedAsarIntegrityValidation: true',
  'onlyLoadAppFromAsar: true',
  'grantFileProtocolExtraPrivileges: false'
]) {
  assert(builderSource.includes(setting), `Missing fuse setting: ${setting}`);
}

assert.throws(() => computeService.requireRecoveryPayload('invalid'));
assert.strictEqual(computeService.generateSudoku('invalid').difficulty, 'medium');

console.log('Electron Phase 2 security boundary tests passed.');
