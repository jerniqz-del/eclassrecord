const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'mobile-sync-companion.js'), 'utf8');
const database = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'database.js'), 'utf8');

assert.match(html, /id="btnStartCompanionBluetooth"[^>]+onclick="startCompanionBluetoothPairing\(\)"/);
assert.match(html, /id="companionBluetoothPairingPanel"/);
assert.match(html, /id="companionBluetoothPairingQr"/);
assert.match(html, /id="companionBluetoothPairingPin"/);
assert.match(html, /id="btnScanBle"[^>]+style="display:none"/);
assert.ok(
  html.indexOf('id="btnStartCompanionBluetooth"') < html.indexOf('id="btnScanBle"'),
  'Bluetooth QR creation must be presented before scanning for the phone.',
);

assert.match(bridge, /async function startCompanionBluetoothPairing\(\)/);
assert.match(bridge, /electronAPI\.startCompanionBluetooth\(descriptor\)/);
assert.match(bridge, /generateCompanionQr\(bluetoothPayload\)/);
assert.match(bridge, /startAutomaticBluetoothDiscovery/);
assert.match(bridge, /pairing will continue automatically/);
assert.match(bridge, /globalScope\.startCompanionBluetoothPairing = startCompanionBluetoothPairing/);
assert.doesNotMatch(html, /id="syncPinInput"/, 'Desktop must not ask the user to type the Bluetooth PIN.');
const bluetoothController = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'mobile-sync.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'src', 'main', 'companion-sync-service.js'), 'utf8');
const androidSyncScreen = fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'SyncScreen.kt'),
  'utf8',
);
assert.match(bluetoothController, /getCompanionWlanStatus\(\)/);
assert.match(bluetoothController, /kind: 'pair'/);
assert.match(bluetoothController, /kind: 'reconnect'/);
assert.match(bluetoothController, /reconnectToken/);
assert.match(bluetoothController, /navigator\.bluetooth\.getDevices\(\)/);
assert.match(bluetoothController, /startBluetoothLinkMonitor\(\)/);
assert.match(bluetoothController, /function bluetoothDiscoveryTag\(sessionId\)/);
assert.match(bluetoothController, /async function startAutomaticBluetoothDiscovery\(\)/);
assert.match(bluetoothController, /startAutomaticBluetoothDiscoveryFromDesktopGesture/);
assert.match(bluetoothController, /'QR-matched' : 'Compatible'/);
assert.match(bluetoothController, /automaticBluetoothSelectionPending/);
assert.match(bluetoothController, /scheduleAutomaticBluetoothDiscoveryRetry/);
assert.match(bluetoothController, /Automatic phone detection will retry/);
assert.match(bluetoothController, /B64START:/);
assert.match(bluetoothController, /acceptedChangeIds: result\.acceptedChangeIds \|\| \[\]/);
assert.match(bluetoothController, /writeValueWithoutResponse/);
assert.match(bluetoothController, /lastSentBluetoothSnapshotKey/);
assert.match(bluetoothController, /MobileSyncBridge\?\.flushPublish\?\.\(\)/);
assert.match(bluetoothController, /\}, 250\);/);
assert.match(bridge, /async function flushPublish\(\)/);
assert.match(html, /id="syncLinkQuality"/);
assert.match(bluetoothController, /desktopId: String\(pairing\.desktopId \|\| ''\)/);
assert.match(bluetoothController, /profileId: String\(pairing\.profileId \|\| ''\)/);
assert.match(service, /transportPin: String\(status\.pin \|\| ''\)/);
const { pairingPayloadV2 } = require('../src/main/companion-sync-service');
const { requireCompanionPayload } = require('../src/main/compute-service');
const bluetoothQr = JSON.parse(pairingPayloadV2({
  desktopId: '11111111-1111-4111-8111-111111111111',
  profileId: 'profile-1',
  pairingSessionId: '22222222-2222-4222-8222-222222222222',
  sessionId: '22222222-2222-4222-8222-222222222222',
  secret: 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890',
  pairingExpiresAt: '2099-01-01T00:00:00.000Z',
  transport: 'bluetooth',
  pin: '654321'
}));
assert.strictEqual(bluetoothQr.bluetooth.transportPin, '654321');
assert.strictEqual(requireCompanionPayload(JSON.stringify(bluetoothQr)), JSON.stringify(bluetoothQr));
assert.match(bluetoothController, /if \(isSyncConnecting\) return/);
assert.match(bluetoothController, /setBluetoothScanBusy\(true\)/);
assert.match(bluetoothController, /resetBluetoothScan\(\)/);
assert.match(bluetoothController, /Bluetooth search cancelled\./);
assert.match(preload, /resetBluetoothScan: \(\) => ipcRenderer\.invoke\('bluetooth:reset-scan'\)/);
assert.match(preload, /startAutomaticBluetoothScan: \(discoveryTag\) => ipcRenderer\.invoke\('bluetooth:auto-scan', discoveryTag\)/);
assert.match(main, /function cancelPendingBluetoothSelection\(\)/);
assert.match(main, /ipcMain\.handle\('bluetooth:reset-scan'/);
assert.match(main, /ipcMain\.handle\('bluetooth:auto-scan'/);
assert.match(main, /executeJavaScript\([\s\S]*startAutomaticBluetoothDiscoveryFromDesktopGesture[\s\S]*true/);
assert.match(main, /automaticBluetoothScanPending/);
assert.match(main, /devices\.length === 1 \? devices\[0\] : null/);
assert.match(main, /callback\(candidate\.deviceId\)/);
assert.match(bluetoothController, /deviceList\.filter\(d => d\?\.deviceId\)/);
assert.match(androidSyncScreen, /showBluetoothEnablePrompt/);
assert.match(androidSyncScreen, /Turn on Bluetooth\?/);
assert.match(androidSyncScreen, /BluetoothAdapter\.ACTION_REQUEST_ENABLE/);
assert.match(androidSyncScreen, /if \(isBluetoothEnabled\(context\)\) \{\s*startDesktopQrScan\(\)/);
assert.match(androidSyncScreen, /private fun isBluetoothEnabled\(context: Context\): Boolean/);
const androidBleManager = fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'BleServerManager.kt'),
  'utf8',
);
const androidDataModel = fs.readFileSync(
  path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'DataModel.kt'),
  'utf8',
);
assert.match(androidSyncScreen, /prepareFirstPairing\(context, pairing\)/);
assert.match(androidBleManager, /pairingDiscoveryTag/);
assert.match(androidBleManager, /adapter\.name = "EC-\$advertisedCode"/);
assert.match(androidBleManager, /override fun onServiceAdded\(/);
assert.match(androidBleManager, /startPreparedAdvertising\(\)/);
assert.match(androidBleManager, /bluetoothGattServer\?\.addService\(service\) == true/);
assert.match(database, /async function verifyActiveProfilePinForMobile\(pin\)/);
assert.match(database, /verifyPin\(candidate, profile\.salt, profile\.pinHash\)/);
assert.match(bridge, /pushPinRequired: Boolean\(globalScope\.activeProfileRequiresPin\?\.\(\)\)/);
assert.doesNotMatch(bridge, /verifyActiveProfilePinForMobile\(String\(request\.authorizationPin \|\| ''\)\)/);
assert.match(main, /profileAuth\.verifyAuthorizationPin/);
assert.match(main, /profileAuth\.authorizeChanges/);
assert.match(androidDataModel, /val authorizationPin: String = ""/);
assert.match(androidDataModel, /val liveSync: Boolean = false/);
assert.match(androidBleManager, /fun scheduleLivePush/);
assert.match(androidBleManager, /liveSync: Boolean = false/);
assert.match(androidSyncScreen, /Authorize grade push/);
assert.match(androidSyncScreen, /PasswordVisualTransformation\(\)/);
assert.match(androidSyncScreen, /BleServerManager\.syncScoresToDesktop/);
assert.match(androidBleManager, /override fun onMtuChanged\(/);
assert.match(androidBleManager, /override fun onNotificationSent\(/);
assert.match(androidBleManager, /val payloadSize = \(negotiatedMtu - 3\)\.coerceIn\(20, 180\)/);
assert.match(androidBleManager, /pendingTxFrames\.offer\(TxFrame\(label, chunks\)\)/);
assert.match(androidBleManager, /Json \{ encodeDefaults = true \}/);
assert.doesNotMatch(androidBleManager, /data == pinCode/);
assert.match(androidBleManager, /failedPairAttempts/);
assert.match(androidBleManager, /MobilePinLock\.enroll/);
console.log('Mobile Sync Bluetooth QR tests passed.');
