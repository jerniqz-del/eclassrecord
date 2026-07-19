const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const performanceMode = require(path.join(root, 'src/renderer/js/performance-mode.js'));

const lowMemory = performanceMode.recommendProfile({
  totalMemoryBytes: 4 * 1024 ** 3,
  logicalProcessors: 4
});
assert.strictEqual(lowMemory.recommended, true, '4 GB device should receive a Low-Spec recommendation');
assert(lowMemory.reasons.includes('limited system memory'));

const lowCpu = performanceMode.recommendProfile({
  totalMemoryBytes: 8 * 1024 ** 3,
  logicalProcessors: 2
});
assert.strictEqual(lowCpu.recommended, true, 'dual logical-processor device should receive a recommendation');

const standardPc = performanceMode.recommendProfile({
  totalMemoryBytes: 8 * 1024 ** 3,
  logicalProcessors: 4
});
assert.strictEqual(standardPc.recommended, false, '8 GB / four-thread device should remain standard');

const mainSource = read('src/main/main.js');
const preloadSource = read('src/main/preload.js');
const html = read('src/renderer/index.html');
const css = read('src/renderer/css/performance.css');
const ads = read('src/renderer/js/ad-manager.js');
const analytics = read('src/renderer/js/usage-analytics.js');
const updater = read('src/renderer/js/update-manager.js');
const help = read('src/renderer/js/help.js');

assert(mainSource.includes("ipcMain.handle('system:performance-profile'"), 'system profile IPC is missing');
assert(preloadSource.includes('getPerformanceProfile:'), 'system profile preload bridge is missing');
assert(html.includes('id="settingLowSpecMode"'), 'Low-Spec Mode toggle is missing');
assert(html.includes('id="performanceDeviceSummary"'), 'device recommendation UI is missing');
assert(html.includes('css/performance.css'), 'performance stylesheet is not loaded');
assert(html.includes('js/performance-mode.js'), 'performance module is not loaded');
assert(html.includes('PerformanceMode.init();'), 'performance module is not initialized before optional services');
assert(css.includes('data-performance-mode="low"'), 'low-spec CSS state is missing');
assert(css.includes('backdrop-filter: none'), 'expensive backdrop effects are not disabled');
assert(ads.includes('isSidebarAdLowSpecMode()'), 'sidebar ad rotation is not performance-aware');
assert(ads.includes('normalizedAds.slice(0, 1)'), 'low-spec sidebar does not use static content');
assert(ads.includes('clearSidebarAdRemoteRefresh()'), 'remote sidebar refresh cannot be stopped');
assert(analytics.includes('Math.max(requestedDelay, 30000)'), 'optional analytics work is not delayed');
assert(updater.includes('LOW_SPEC_STARTUP_DELAY_MS = 30000'), 'automatic updates are not delayed in low-spec mode');
assert(help.includes('helpCenterInitialized'), 'Help Center lacks one-time initialization');
assert(help.includes('window.ensureHelpCenterInitialized'), 'Help Center cannot be initialized on demand');

const storageKey = performanceMode.STORAGE_KEY;
assert.strictEqual(storageKey, 'eclass_performance_mode_v1');
assert(!read('src/renderer/js/database.js').includes(storageKey), 'performance setting must not enter profile data');
assert(!read('src/renderer/js/advisory-backup.js').includes(storageKey), 'performance setting must not enter backups');

console.log('Low-Spec Mode tests passed.');
