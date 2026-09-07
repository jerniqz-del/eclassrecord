const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pairingPayloadV2 } = require('../src/main/companion-sync-service');
const computeService = require('../src/main/compute-service');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const status = {
  desktopId: '11111111-1111-4111-8111-111111111111',
  desktopName: 'Faculty Laptop',
  profileId: 'profile-1',
  profileName: 'Teacher One',
  schoolYear: '2026-2027',
  sessionId: '22222222-2222-4222-8222-222222222222',
  secret: 'abcdefghijklmnopqrstuvwxyzABCDEFG_1234567890',
  pairingExpiresAt: '2099-01-01T00:00:00.000Z',
  transport: 'wlan',
  availableHosts: ['192.168.43.20'],
  port: 38473,
  certificateFingerprint: 'a'.repeat(64),
  pin: '654321'
};

const qr = JSON.parse(pairingPayloadV2(status));
assert.strictEqual(qr.version, 2);
assert.strictEqual(qr.desktopId, status.desktopId);
assert.strictEqual(qr.profileId, status.profileId);
assert.deepStrictEqual(qr.lan.hosts, ['192.168.43.20']);
assert.strictEqual(qr.lan.port, 38473);
assert.strictEqual(qr.pin, undefined, 'The desktop profile PIN must not be embedded in a LAN QR.');
const bluetoothQr = JSON.parse(pairingPayloadV2({ ...status, transport: 'bluetooth' }));
assert.strictEqual(bluetoothQr.bluetooth.transportPin, status.pin);
assert.match(bluetoothQr.bluetooth.discoveryTag, /^[A-F0-9]{6}$/);

const pairingStore = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'LanPairingStore.kt');
const database = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'DatabaseHelper.kt');
const lan = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'LanSyncManager.kt');
const bluetooth = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'BleServerManager.kt');
const bluetoothStore = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'BluetoothPairingStore.kt');
const desktopBridge = read('src', 'renderer', 'js', 'mobile-sync-companion.js');
const service = read('src', 'main', 'companion-sync-service.js');
const preload = read('src', 'main', 'preload.js');
const computeServiceSource = read('src', 'main', 'compute-service.js');
const databaseSource = read('src', 'renderer', 'js', 'database.js');
const mainSource = read('src', 'main', 'main.js');
const desktopHtml = read('src', 'renderer', 'index.html');
const screen = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'SyncScreen.kt');

assert.match(pairingStore, /LanPairingRegistry/);
assert.match(pairingStore, /fun list\(context: Context\)/);
assert.match(pairingStore, /fun select\(context: Context, profileKey: String\)/);
assert.match(pairingStore, /fun remove\(context: Context, profileKey: String\)/);
assert.match(pairingStore, /it != profileKey && remaining\.any/);
assert.match(pairingStore, /This pairing QR has expired/);
assert.match(database, /companion_profiles/);
assert.match(database, /fun selectProfile/);
assert.match(database, /fun deleteProfile\(context: Context, profileKey: String\): Boolean/);
assert.match(database, /profileDirectory\(context, profileKey\)[\s\S]*deleteRecursively/);
assert.match(database, /fun acknowledgeChanges/);
assert.match(database, /UUID\.nameUUIDFromBytes/);
assert.match(lan, /put\("profileId"/);
assert.match(lan, /acceptedChangeIds/);
assert.match(lan, /This pairing QR is outdated/);
assert.match(lan, /protocolVersion >= 2/);
assert.match(lan, /fun deleteProfile\(context: Context, profileKey: String\): Boolean/);
assert.match(lan, /DatabaseHelper\.deleteProfile\(context, profileKey\)/);
assert.match(lan, /MobilePinLock\.remove\(context, profileKey\)/);
assert.match(lan, /BleServerManager\.forgetDesktop\(context, profileKey\)/);
assert.match(lan, /Wi-Fi or hotspot/);
assert.match(lan, /fun pushChanges[\s\S]*if \(pairing == null\)/);
assert.doesNotMatch(lan, /if \(!isConnected \|\| pairing == null\)/);
assert.match(bluetooth, /validateSnapshotProfile/);
assert.match(bluetooth, /acceptedChangeIds/);
assert.match(bluetoothStore, /it != profileKey && remaining\.any/);
assert.match(desktopBridge, /Open the matching desktop profile/);
assert.match(desktopBridge, /appliedChangeIds/);
assert.match(desktopBridge, /authorizePairing/);
assert.match(service, /url\.pathname === '\/v2\/pair'/);
assert.match(service, /pairingExpiresAt/);
assert.match(computeServiceSource, /value\?\.type === 'eclass-companion-pairing'/);
assert.match(computeServiceSource, /value\.version === 2/);
assert.match(computeServiceSource, /\['wlan', 'bluetooth'\]\.includes\(value\.transport\)/);
assert.match(preload, /compute:generate-companion-qr/);
assert.match(preload, /configureCompanionFirewall/);
assert.match(databaseSource, /window\.getCurrentProfilePin = getCurrentProfilePin/);
assert.match(desktopBridge, /function renderWlanPairingPin/);
assert.match(desktopBridge, /getRootDatabase\(\)/);
assert.doesNotMatch(desktopBridge, /globalScope\.dbRoot\?\.activeProfileId/);
assert.doesNotMatch(desktopBridge, /globalScope\.getCurrentProfilePin/);
assert.match(desktopBridge, /setCompanionDisplay\(display, !usesProfilePin, 'companion-js-flex'\)/);
assert.match(desktopBridge, /return \{\s*success: true,\s*authorized: true,/);
assert.match(mainSource, /windowsdefender:\/\/NetworkSettings/);
assert.match(desktopHtml, /enter your usual profile login PIN/);
assert.match(desktopHtml, /class="companion-pairing companion-js-hidden" id="companionPairingPanel"/);
assert.match(desktopHtml, /companion-pin-display companion-js-hidden" id="companionPairingPinDisplay"/);
assert.doesNotMatch(desktopHtml, /id="companionPairingPanel"[^>]*data-eclass-style/);
assert.match(lan, /allow E-Class Record on Private networks/);
assert.match(screen, /Authorize desktop profile/);
assert.match(screen, /Push via Wi-Fi \/ Hotspot/);
assert.match(screen, /Push via Bluetooth \(Fallback\)/);
assert.match(screen, /val accepted = if \(pushTransport == "lan"\)/);
assert.match(screen, /beginPushReview\("bluetooth"\)/);
assert.match(screen, /Delete permanently/);
assert.match(screen, /downloaded class records, and pending mobile changes/);
assert.match(screen, /The desktop profile is not deleted/);
assert.match(screen, /Icons\.Default\.Delete/);

let exposedApi;
vm.runInNewContext(preload, {
  require(name) {
    if (name === 'electron') return {
      contextBridge: { exposeInMainWorld: (_name, api) => { exposedApi = api; } },
      ipcRenderer: {
        invoke(channel, payload) {
          if (channel === 'compute:generate-companion-qr') return Promise.resolve(payload);
          return Promise.resolve(undefined);
        },
        on() {},
        removeListener() {},
        send() {},
      },
    };
    if (name === 'qrcode') return { toDataURL: (value) => value };
    if (name === 'jsqr') return () => null;
    if (name === 'sudoku-gen') return { getSudoku: () => ({}) };
    throw new Error(`Unexpected preload dependency: ${name}`);
  },
});
void (async () => {
  const rawV2Qr = pairingPayloadV2(status);
  assert.strictEqual(computeService.requireCompanionPayload(rawV2Qr), rawV2Qr);
  const image = await computeService.generateCompanionQr(rawV2Qr);
  assert.match(image, /^data:image\/png;base64,/);
  const rawBluetoothQr = pairingPayloadV2({ ...status, transport: 'bluetooth' });
  assert.strictEqual(computeService.requireCompanionPayload(rawBluetoothQr), rawBluetoothQr);
  assert.match(await computeService.generateCompanionQr(rawBluetoothQr), /^data:image\/png;base64,/);
  const missingPin = JSON.parse(rawBluetoothQr);
  delete missingPin.bluetooth.transportPin;
  assert.throws(() => computeService.requireCompanionPayload(JSON.stringify(missingPin)));
  const legacyQr = 'ECLASS-COMPANION|1|wlan|session|secret|127.0.0.1|38473|fingerprint|123456';
  assert.strictEqual(computeService.requireCompanionPayload(legacyQr), legacyQr);
  assert.strictEqual(await exposedApi.generateCompanionQr(rawV2Qr), rawV2Qr);

  console.log('Mobile multi-profile, hotspot, idempotency, and profile-isolation tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
