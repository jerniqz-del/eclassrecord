const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const managerPath = path.join(root, 'src', 'renderer', 'js', 'update-manager.js');
const updaterPath = path.join(root, 'src', 'main', 'updater.js');
const preloadPath = path.join(root, 'src', 'main', 'preload.js');
const mainPath = path.join(root, 'src', 'main', 'main.js');
const htmlPath = path.join(root, 'src', 'renderer', 'index.html');
const packagePath = path.join(root, 'package.json');

delete require.cache[require.resolve(managerPath)];
const manager = require(managerPath);
const now = Date.UTC(2026, 6, 19, 0, 0, 0);

assert.strictEqual(manager.CHECK_INTERVAL_MS, 24 * 60 * 60 * 1000);
assert.strictEqual(manager.shouldAutoCheck({ now, lastCheck: 0, online: true, autoCheck: true }), true);
assert.strictEqual(manager.shouldAutoCheck({ now, lastCheck: now - manager.CHECK_INTERVAL_MS + 1, online: true, autoCheck: true }), false);
assert.strictEqual(manager.shouldAutoCheck({ now, lastCheck: now - manager.CHECK_INTERVAL_MS, online: true, autoCheck: true }), true);
assert.strictEqual(manager.shouldAutoCheck({ now, lastCheck: 0, online: false, autoCheck: true }), false);
assert.strictEqual(manager.shouldAutoCheck({ now, lastCheck: 0, online: true, autoCheck: false }), false);

const updater = fs.readFileSync(updaterPath, 'utf8');
const preload = fs.readFileSync(preloadPath, 'utf8');
const main = fs.readFileSync(mainPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

assert.match(updater, /autoUpdater\.autoDownload\s*=\s*false/);
assert.match(updater, /autoUpdater\.autoInstallOnAppQuit\s*=\s*true/);
assert.match(updater, /automatic\s*&&\s*!app\.isPackaged/);
assert.match(updater, /net\.isOnline\(\)/);
assert.match(updater, /autoUpdater\.checkForUpdates\(\)/);
assert.doesNotMatch(updater, /checkForUpdatesAndNotify/);
assert.match(updater, /updateDownloaded/);
assert.match(preload, /checkForUpdates:\s*\(options\)/);
assert.match(preload, /quitAndInstall/);
assert.match(main, /if \(result && result\.started\) isConfirmedExit = true/);
assert.match(html, /id="settingAutomaticUpdateChecks"/);
assert.match(html, /id="settingAutomaticUpdateDownloads"/);
assert.match(html, /src="js\/update-manager\.js"/);
assert.match(html, /UpdateManager\.init\(\)/);
assert.strictEqual(pkg.version, '1.6.8');

(async () => {
  const values = new Map();
  global.localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  let checkOptions = null;
  let installCalls = 0;
  global.electronAPI = {
    checkForUpdates: async options => {
      checkOptions = options;
      return { started: true };
    },
    quitAndInstall: async () => {
      installCalls += 1;
      return { started: true };
    }
  };

  assert.deepStrictEqual(manager.readPreferences(), { autoCheck: true, autoDownload: true });
  manager.writePreferences({ autoDownload: false });
  assert.deepStrictEqual(manager.readPreferences(), { autoCheck: true, autoDownload: false });

  const started = await manager.runAutomaticCheck(now);
  assert.deepStrictEqual(started, { started: true });
  assert.deepStrictEqual(checkOptions, { automatic: true, autoDownload: false });
  assert.strictEqual(values.get('eclass_update_last_automatic_check_v1'), String(now));
  assert.deepStrictEqual(await manager.runAutomaticCheck(now + 1000), { started: false, reason: 'not-due' });

  global.saveDatabase = async () => true;
  await manager.restartAndInstall();
  assert.strictEqual(installCalls, 1);

  global.saveDatabase = async () => false;
  await manager.restartAndInstall();
  assert.strictEqual(installCalls, 1, 'A failed save must prevent restart and installation.');

  delete global.localStorage;
  delete global.electronAPI;
  delete global.saveDatabase;
  console.log('Automatic update scheduling, background download, safe restart, settings, and version tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
