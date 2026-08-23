const assert = require('assert');
const { CompanionSyncService } = require('../src/main/companion-sync-service');

(async () => {
  const service = new CompanionSyncService();
  const status = await service.startBluetooth();
  assert.strictEqual(status.running, true);
  assert.strictEqual(status.transport, 'bluetooth');
  assert.strictEqual(status.host, 'bluetooth');
  assert.strictEqual(status.port, 0);
  assert.strictEqual(status.pairingPayload.split('|')[2], 'bluetooth');
  assert.ok(/^\d{6}$/.test(status.pin));
  assert.strictEqual(status.pairingPayload.includes(status.pin), false, 'PIN must be entered separately on Android, not embedded in the QR.');
  assert.strictEqual(service.server, null, 'Bluetooth pairing must not open the WLAN HTTPS listener.');

  const published = service.publish({ format: 'eclass-companion-snapshot', formatVersion: 3 });
  assert.strictEqual(published.revision, 1);
  const stopped = await service.stop();
  assert.deepStrictEqual(stopped, { running: false });
  console.log('Companion Bluetooth session tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
