const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
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

(async () => {
  const received = [];
  const commands = [];
  const service = new CompanionSyncService({
    onChanges: async (payload) => { received.push(payload); return { accepted: payload.changes.length }; },
    onToolCommand: async (payload) => { commands.push(payload); return { accepted: true }; }
  });
  const status = await service.start();
  try {
    assert(status.running);
    assert(/^\d{6}$/.test(status.pin));
    assert(/^[a-f0-9]{64}$/.test(status.certificateFingerprint));
    assert(status.pairingPayload.startsWith('ECLASS-COMPANION|1|wlan|'));
    service.publish({ format: 'eclass-companion-snapshot', formatVersion: 3, marker: 'desktop-truth' });

    const snapshotPath = `/v1/snapshot?session=${encodeURIComponent(status.sessionId)}&revision=0`;
    const snapshotResponse = await requestJson(status.port, 'GET', snapshotPath, signedHeaders(status.secret, 'GET', snapshotPath));
    assert.strictEqual(snapshotResponse.status, 200);
    assert.strictEqual(snapshotResponse.fingerprint, status.certificateFingerprint);
    assert.strictEqual(decryptJson(status.secret, snapshotResponse.body.payload).marker, 'desktop-truth');

    const changePath = `/v1/changes?session=${encodeURIComponent(status.sessionId)}`;
    const changeBody = JSON.stringify({ payload: encryptJson(status.secret, {
      pin: status.pin,
      baseRevision: 1,
      changes: [{ type: 'score', classId: 'class-1', learnerId: 'learner-1', assessmentId: 'a-1', value: 8 }]
    }) });
    const changeResponse = await requestJson(status.port, 'POST', changePath, signedHeaders(status.secret, 'POST', changePath, changeBody), changeBody);
    assert.strictEqual(changeResponse.status, 200);
    assert.strictEqual(received.length, 1);

    const commandPath = `/v1/tool-command?session=${encodeURIComponent(status.sessionId)}`;
    const commandBody = JSON.stringify({ payload: encryptJson(status.secret, { command: 'pick-learner', args: {} }) });
    const commandResponse = await requestJson(status.port, 'POST', commandPath, signedHeaders(status.secret, 'POST', commandPath, commandBody), commandBody);
    assert.strictEqual(commandResponse.status, 200);
    assert.strictEqual(commands[0].command, 'pick-learner');

    console.log('Companion HTTPS sync service tests passed.');
  } finally {
    await service.stop();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
