const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'mobile-sync-companion.js'), 'utf8');

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
assert.match(bridge, /globalScope\.startCompanionBluetoothPairing = startCompanionBluetoothPairing/);
assert.doesNotMatch(html, /id="syncPinInput"/, 'Desktop must not ask the user to type the Bluetooth PIN.');
const bluetoothController = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'mobile-sync.js'), 'utf8');
assert.match(bluetoothController, /getCompanionWlanStatus\(\)/);
assert.match(bluetoothController, /handshakeChar\.writeValue\(new TextEncoder\(\)\.encode\(pin\)\)/);
assert.match(bluetoothController, /Re-enter the desktop PIN on Android/);
console.log('Mobile Sync Bluetooth QR tests passed.');
