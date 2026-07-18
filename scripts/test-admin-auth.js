const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { verifyAdminPassphrase } = require('../src/main/admin-auth');

const expectedPassphrase = ['114', '@Juan', '@239'].join('');
assert.strictEqual(verifyAdminPassphrase(expectedPassphrase), true, 'the reset Admin passphrase must authenticate');
assert.strictEqual(verifyAdminPassphrase(`${expectedPassphrase}!`), false, 'an incorrect Admin passphrase must be rejected');
assert.strictEqual(verifyAdminPassphrase(''), false, 'an empty Admin passphrase must be rejected');

const projectRoot = path.join(__dirname, '..');
const authSource = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'admin-auth.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'preload.js'), 'utf8');
assert.ok(!authSource.includes(expectedPassphrase), 'plaintext Admin passphrase must not be stored in the verifier');
assert.ok(mainSource.includes("ipcMain.handle('admin:authenticate'"));
assert.ok(mainSource.includes('adminSession.checkCooldown()'));
assert.ok(preloadSource.includes("adminAuth: (passphrase) => ipcRenderer.invoke('admin:authenticate', passphrase)"));
console.log('Admin passphrase hashing, verification, session, and preload bridge tests passed.');
