const assert = require('assert');
const crypto = require('crypto');
const dgram = require('dgram');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CompanionSyncService,
  decryptJson,
  encryptJson,
  sha256
} = require('../src/main/companion-sync-service');

function signedHeaders(secret, method, path, body = '') {
  const timestamp = String(Date.now());
  const canonical = [method, path, timestamp, sha256(body)].join('\n');
  return {
    'Content-Type': 'application/json',
    'X-Eclass-Client': 'test-android',
    'X-Eclass-Timestamp': timestamp,
    'X-Eclass-Signature': crypto.createHmac('sha256', secret).update(canonical).digest('hex')
  };
}

function requestJson(port, method, path, headers, body = '') {
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: '127.0.0.1', port, method, path, headers, rejectUnauthorized: false }, (response) => {
      const chunks = [];
      const fingerprint = response.socket.getPeerCertificate().fingerprint256.replaceAll(':', '').toLowerCase();
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        fingerprint
      }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function discoverLan(status) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const nonce = crypto.randomBytes(12).toString('hex');
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('LAN discovery timed out.'));
    }, 2000);

    socket.on('message', (buffer) => {
      clearTimeout(timer);
      socket.close();
      const response = JSON.parse(buffer.toString('utf8'));
      const canonical = [nonce, status.sessionId, response.port, response.hosts.join(','), response.certificateFingerprint].join('|');
      const expected = crypto.createHmac('sha256', status.secret).update(canonical).digest('hex');
      assert.strictEqual(response.signature, expected);
      resolve(response);
    });

    const request = Buffer.from(JSON.stringify({
      kind: 'eclass-discover',
      version: 1,
      sessionId: status.sessionId,
      nonce
    }));
    socket.send(request, status.discoveryPort, '127.0.0.1');
  });
}

(async () => {
  const received = [];
  const commands = [];
  const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eclass-mobile-update-'));
  const updatePath = path.join(updateDir, 'mobile.apk');
  const identityPath = path.join(updateDir, 'lan-identity.json');
  fs.writeFileSync(updatePath, 'signed-mobile-apk-test');
  const service = new CompanionSyncService({
    identityPath,
    discoveryPort: 39472,
    onChanges: async (payload) => { received.push(payload); return { accepted: payload.changes.length }; },
    onToolCommand: async (payload) => { commands.push(payload); return { accepted: true }; },
    getMobileUpdate: async () => ({
      path: updatePath,
      fileName: 'E-Class-Record-Mobile-v1.9.6.apk',
      packageName: 'com.example.eclassrecordmobile',
      versionName: '1.9.6', versionCode: 4,
      size: fs.statSync(updatePath).size,
      sha256: sha256(fs.readFileSync(updatePath))
    })
  });
  const status = await service.start();
  try {
    assert(status.running);
    assert(/^\d{6}$/.test(status.pin));
    assert(/^[a-f0-9]{64}$/.test(status.certificateFingerprint));
    assert(status.pairingPayload.startsWith('ECLASS-COMPANION|1|wlan|'));
    assert.strictEqual(status.pairingPayload.split('|').at(-1), status.pin);
    const discovery = await discoverLan(status);
    assert(discovery.hosts.includes(status.host));
    assert(discovery.interfaces.some((item) => item.address === status.host));
    service.publish({ format: 'eclass-companion-snapshot', formatVersion: 3, marker: 'desktop-truth' });

    const snapshotPath = `/v1/snapshot?session=${encodeURIComponent(status.sessionId)}&revision=0`;
    const snapshotResponse = await requestJson(status.port, 'GET', snapshotPath, signedHeaders(status.secret, 'GET', snapshotPath));
    assert.strictEqual(snapshotResponse.status, 200);
    assert.strictEqual(snapshotResponse.fingerprint, status.certificateFingerprint);
    assert.strictEqual(decryptJson(status.secret, snapshotResponse.body.payload).marker, 'desktop-truth');

    const eventsPath = `/v1/events?session=${encodeURIComponent(status.sessionId)}&revision=1`;
    const pendingEvent = requestJson(status.port, 'GET', eventsPath, signedHeaders(status.secret, 'GET', eventsPath));
    setTimeout(() => service.publish({ format: 'eclass-companion-snapshot', formatVersion: 3, marker: 'live-update' }), 30);
    const eventResponse = await pendingEvent;
    assert.strictEqual(eventResponse.status, 200);
    assert.strictEqual(eventResponse.body.unchanged, false);
    assert.strictEqual(decryptJson(status.secret, eventResponse.body.payload).marker, 'live-update');

    const changePath = `/v1/changes?session=${encodeURIComponent(status.sessionId)}`;
    const changeBody = JSON.stringify({ payload: encryptJson(status.secret, {
      authorizationPin: '123456',
      baseRevision: 2,
      changes: [{ type: 'score', classId: 'class-1', learnerId: 'learner-1', assessmentId: 'a-1', value: 8 }]
    }) });
    const changeResponse = await requestJson(status.port, 'POST', changePath, signedHeaders(status.secret, 'POST', changePath, changeBody), changeBody);
    assert.strictEqual(changeResponse.status, 200);
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].authorizationPin, '123456');

    const commandPath = `/v1/tool-command?session=${encodeURIComponent(status.sessionId)}`;
    const commandBody = JSON.stringify({ payload: encryptJson(status.secret, { command: 'pick-learner', args: {} }) });
    const commandResponse = await requestJson(status.port, 'POST', commandPath, signedHeaders(status.secret, 'POST', commandPath, commandBody), commandBody);
    assert.strictEqual(commandResponse.status, 200);
    assert.strictEqual(commands[0].command, 'pick-learner');

    const updateManifestPath = `/v1/mobile-update?session=${encodeURIComponent(status.sessionId)}`;
    const updateResponse = await requestJson(status.port, 'GET', updateManifestPath, signedHeaders(status.secret, 'GET', updateManifestPath));
    assert.strictEqual(updateResponse.status, 200);
    assert.strictEqual(updateResponse.body.update.versionCode, 4);
    assert.strictEqual(updateResponse.body.update.path, undefined);

    const persistentIdentity = {
      sessionId: status.sessionId,
      secret: status.secret,
      certificateFingerprint: status.certificateFingerprint,
      port: status.port
    };
    await service.stop();
    const restartedService = new CompanionSyncService({ identityPath, discoveryPort: 39472 });
    const restartedStatus = await restartedService.start();
    assert.strictEqual(restartedStatus.sessionId, persistentIdentity.sessionId);
    assert.strictEqual(restartedStatus.secret, persistentIdentity.secret);
    assert.strictEqual(restartedStatus.certificateFingerprint, persistentIdentity.certificateFingerprint);
    assert.strictEqual(restartedStatus.port, persistentIdentity.port);
    await restartedService.stop();

    console.log('Companion HTTPS sync service tests passed.');
  } finally {
    await service.stop();
    fs.rmSync(updateDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
