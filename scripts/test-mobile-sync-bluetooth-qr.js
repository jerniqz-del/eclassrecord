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
assert.match(bridge, /electronAPI\.startCompanionBluetooth\(\)/);
assert.match(bridge, /generateCompanionQr\(bluetoothPayload\)/);
assert.match(bridge, /startAutomaticBluetoothDiscovery/);
assert.match(bridge, /pairing will continue automatically/);
assert.match(bridge, /globalScope\.startCompanionBluetoothPairing = startCompanionBluetoothPairing/);
assert.doesNotMatch(html, /id="syncPinInput"/, 'Desktop must not ask the user to type the Bluetooth PIN.');
const bluetoothController = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'mobile-sync.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
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
assert.match(bluetoothController, /Array\.isArray\(payload\?\.changes\) \? 'changes'/);
assert.match(bluetoothController, /writeValueWithoutResponse/);
assert.match(bluetoothController, /lastSentBluetoothSnapshotKey/);
assert.match(bluetoothController, /MobileSyncBridge\?\.flushPublish\?\.\(\)/);
assert.match(bluetoothController, /\}, 250\);/);
assert.match(bridge, /async function flushPublish\(\)/);
assert.match(html, /id="syncLinkQuality"/);
assert.match(bluetoothController, /desktopId: bluetoothDesktopId\(\)/);
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
assert.match(androidSyncScreen, /prepareFirstPairing\(pairing\.pin, pairing\.sessionId\)/);
assert.match(androidBleManager, /pairingDiscoveryTag/);
assert.match(androidBleManager, /adapter\.name = "EC-\$advertisedCode"/);
assert.match(androidBleManager, /override fun onServiceAdded\(/);
assert.match(androidBleManager, /startPreparedAdvertising\(\)/);
assert.match(androidBleManager, /bluetoothGattServer\?\.addService\(service\) == true/);
assert.match(database, /async function verifyActiveProfilePinForMobile\(pin\)/);
assert.match(database, /verifyPin\(candidate, profile\.salt, profile\.pinHash\)/);
assert.match(bridge, /pushPinRequired: Boolean\(globalScope\.activeProfileRequiresPin\?\.\(\)\)/);
assert.match(bridge, /verifyActiveProfilePinForMobile\(String\(request\.authorizationPin \|\| ''\)\)/);
assert.match(androidDataModel, /val authorizationPin: String = ""/);
assert.match(androidSyncScreen, /Authorize grade push/);
assert.match(androidSyncScreen, /PasswordVisualTransformation\(\)/);
assert.match(androidSyncScreen, /syncScoresToDesktop\([\s\S]*if \(pushPinRequired\) pushPin else ""/);
assert.match(androidBleManager, /override fun onMtuChanged\(/);
assert.match(androidBleManager, /override fun onNotificationSent\(/);
assert.match(androidBleManager, /val payloadSize = \(negotiatedMtu - 3\)\.coerceIn\(20, 180\)/);
assert.match(androidBleManager, /pendingTxFrames\.offer\(TxFrame\(label, chunks\)\)/);
assert.match(androidBleManager, /Json \{ encodeDefaults = true \}/);
assert.doesNotMatch(androidBleManager, /val mtu = 200/);
console.log('Mobile Sync Bluetooth QR tests passed.');
