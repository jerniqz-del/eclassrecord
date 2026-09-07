const assert = require('assert');
const fs = require('fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const navigation = read('android/app/src/main/java/com/example/eclassrecordmobile/Navigation.kt');
const controller = read('android/app/src/main/java/com/example/eclassrecordmobile/data/DesktopRemoteController.kt');
const lan = read('android/app/src/main/java/com/example/eclassrecordmobile/data/LanSyncManager.kt');
const tools = read('android/app/src/main/java/com/example/eclassrecordmobile/ui/main/PremiumMainScreen.kt');
const featureScreen = read('android/app/src/main/java/com/example/eclassrecordmobile/ui/DesktopFeatureScreen.kt');
const service = read('src/main/companion-sync-service.js');
const bridge = read('src/renderer/js/mobile-sync-companion.js');

assert.match(navigation, /LaunchedEffect\(selectedDock, activeRoute, remoteAvailable\)/);
assert.match(navigation, /DesktopRemoteController\.openPage\("record", route\.assignmentId\)/);
assert.match(controller, /if \(LanSyncManager\.isPaired\) return LanSyncManager\.sendDesktopCommand/);
assert.match(controller, /fun send[\s\S]*if \(LanSyncManager\.isConnected\)[\s\S]*if \(BleServerManager\.isAuthorized\)/);
assert.match(controller, /Bluetooth fallback connected/);
assert.match(lan, /request\("POST", "\/v1\/tool-command"/);
assert.match(lan, /Sending desktop control through Wi-Fi \/ hotspot/);
assert.match(service, /remote command belongs to another desktop profile/i);
assert.match(bridge, /const allowedViews = new Set/);
assert.match(bridge, /const allowedTools = new Set/);
assert.match(bridge, /'timer-start'/);
assert.match(bridge, /'randomize-seating'/);
assert.match(bridge, /'noise-calibrate'/);
assert.match(tools, /Commands use Wi-Fi or your phone hotspot first/);
assert.match(featureScreen, /Wi-Fi \/ hotspot primary/);
for (const id of ['picker', 'groups', 'simulator', 'games', 'timer', 'participation', 'noise', 'duels', 'seating', 'exit', 'notes', 'race']) {
  assert(tools.includes(`"${id}"`), `Missing mobile remote entry for ${id}`);
}

console.log('Mobile page mirroring and WLAN-first desktop Teacher Tools controls passed.');
