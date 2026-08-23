const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const relayDir = path.join(__dirname, '../school-cloud-relay');
  const Relay = await import(pathToFileURL(path.join(relayDir, 'worker.js')).href);

  assert.strictEqual(Relay.normalizeRole(' SCHOOL-ICT '), 'school-ict');
  assert.strictEqual(Relay.can('school-ict', 'personnel.manage'), true);
  assert.strictEqual(Relay.can('school-admin', 'personnel.manage'), false);
  assert.strictEqual(Relay.can('school-head', 'deployment.manage'), true);
  assert.throws(() => Relay.normalizeRole('super-admin'), /not supported/);

  const activeLease = { session_id: 'old', device_id: 'old-device', expires_at: '2026-08-15T12:10:00.000Z' };
  assert.deepStrictEqual(
    Relay.adminLeaseDecision(activeLease, { session_id: 'new', device_id: 'new-device' }, true, '2026-08-15T12:00:00.000Z'),
    { allowed: true, takeover: true, previousDeviceId: 'old-device' }
  );
  const envelope = { algorithm: 'AES-256-GCM', iv: 'dGVzdA==', ciphertext: 'ZW5jcnlwdGVk' };
  assert.strictEqual(JSON.parse(Relay.validateEnvelope(envelope)).algorithm, 'AES-256-GCM');
  assert.throws(() => Relay.validateEnvelope({ title: 'plaintext' }), /invalid/);
  assert.strictEqual(Relay.approvalScopeMatches({ scope: 'personnel-management' }, { request_type: 'personnel-management' }), true);

  const schema = fs.readFileSync(path.join(relayDir, 'schema.sql'), 'utf8');
  for (const table of ['activation_attempts', 'active_admin_leases', 'approval_requests', 'devices', 'snapshots', 'audit_logs']) {
    assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} is missing from the relay schema`);
  }
  assert(schema.includes('personnel_code_hash TEXT NOT NULL'), 'permanent personnel-code storage is missing');
  assert(schema.includes('UNIQUE (user_id, platform, platform_slot)'), 'two-device platform slots are missing');
  assert(!schema.includes('google_auth_challenges'), 'Google authentication schema remains');
  assert(!schema.includes('teacher_invites'), 'legacy teacher invite schema remains');
  assert(!/\\bemail\\s+TEXT/i.test(schema), 'plaintext email storage must not be added');

  const worker = fs.readFileSync(path.join(relayDir, 'worker.js'), 'utf8');
  assert(worker.includes('/v1/auth/activate'), 'personnel activation route is missing');
  assert(worker.includes('/v1/personnel-changes'), 'personnel change route is missing');
  assert(worker.includes('deviceLimits: { desktop: 2, android: 2 }'), 'device limit declaration is missing');
  assert(worker.includes('verifyDeviceSignature'), 'signed backup verification is missing');
  assert(worker.includes('/v1/profile-backups'), 'encrypted profile backup routes are missing');
  assert(!worker.includes('/v1/auth/google'), 'Google authentication route remains');
  assert(!fs.existsSync(path.join(relayDir, 'google-identity.js')), 'Google identity helper remains');
  assert(!worker.includes('body.title'), 'the relay must not accept plaintext announcement titles');

  console.log('School Cloud personnel-code, device-limit, privacy, and signed-backup relay tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
