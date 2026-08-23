const assert = require('assert');

const {
  SchoolCloudService,
  normalizeEndpoint,
  normalizeRelayRequest,
  publicConnection
} = require('../src/main/school-cloud-service');

class MemoryVault {
  constructor() { this.values = new Map(); }
  get(id) { return this.values.get(id) || null; }
  set(id, value) { this.values.set(id, JSON.parse(JSON.stringify(value))); }
  list() { return Array.from(this.values.keys()).sort(); }
  remove(id) { const removed = this.values.delete(id); return { schoolId: id, removed }; }
}

(async () => {
  assert.strictEqual(normalizeEndpoint('https://school.example.workers.dev/'), 'https://school.example.workers.dev');
  assert.throws(() => normalizeEndpoint('http://school.example.com'), /HTTPS/);
  assert.strictEqual(normalizeEndpoint('http://localhost:8787/', true), 'http://localhost:8787');
  assert.throws(() => normalizeEndpoint('https://user:pass@school.example.com'), /credentials/);

  assert.deepStrictEqual(normalizeRelayRequest({ method: 'GET', path: '/v1/notifications/summary' }), {
    method: 'GET', path: '/v1/notifications/summary', body: undefined
  });
  assert.throws(() => normalizeRelayRequest({ method: 'POST', path: '/v1/setup/bootstrap' }), /not allowed/);
  assert.throws(() => normalizeRelayRequest({ method: 'GET', path: 'https://attacker.test/v1/me' }), /invalid/);

  assert.deepStrictEqual(publicConnection({
    endpoint: 'https://school.example', deviceId: 'device-123', sessionToken: 'secret',
    encryptedDevicePrivateKeys: 'wrapped', configuredAt: 'now', user: { role: 'school-head' }
  }), {
    endpoint: 'https://school.example', deviceId: 'device-123', user: { role: 'school-head' },
    configuredAt: 'now', hasSession: true, hasDeviceKeys: true,
    storageMode: 'local-only', lastBackupAt: null
  });

  const vault = new MemoryVault();
  const requests = [];
  const service = new SchoolCloudService({
    vault,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ user: { role: 'school-head' } }) };
    }
  });
  const sessionToken = 'a'.repeat(64);
  const status = service.configure('school_12345', {
    endpoint: 'https://school.example.workers.dev', sessionToken, deviceId: 'device-12345',
    user: { role: 'school-head' }, encryptedDevicePrivateKeys: 'protected-private-key-envelope'
  });
  assert.strictEqual(status.hasSession, true);
  assert.strictEqual(status.sessionToken, undefined, 'public status leaked the session token');
  assert.strictEqual(status.encryptedDevicePrivateKeys, undefined, 'public status leaked wrapped private keys');
  const connections = service.connections();
  assert.strictEqual(connections.length, 1);
  assert.strictEqual(connections[0].schoolId, 'school_12345');
  assert.strictEqual(connections[0].sessionToken, undefined, 'connection listing leaked the session token');

  const result = await service.request('school_12345', { method: 'GET', path: '/v1/me' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(requests[0].options.headers.Authorization, `Bearer ${sessionToken}`);
  assert(!JSON.stringify(result).includes(sessionToken), 'relay response leaked the stored session token');
  assert.deepStrictEqual(service.disconnect('school_12345'), { schoolId: 'school_12345', removed: true });

  console.log('School Cloud protected desktop transport tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
