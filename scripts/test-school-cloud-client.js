const assert = require('assert');

const calls = [];
global.electronAPI = {
  getSchoolCloudFeatureStatus: async () => ({ enabled: true }),
  activateSchoolCloud: async (_schoolId, value) => ({ endpoint: value.endpoint, deviceId: 'device-1', hasSession: true, storageMode: value.storageMode, user: { role: 'subject-teacher' } }),
  backupSchoolCloudProfile: async () => ({ success: true }),
  restoreSchoolCloudProfile: async () => ({ database: { version: 1 } }),
  configureSchoolCloud: async (_schoolId, value) => ({ endpoint: value.endpoint, hasSession: true }),
  getSchoolCloudStatus: async schoolId => ({ schoolId, hasSession: true }),
  listSchoolCloudConnections: async () => [{ schoolId: 'school_12345', hasSession: true }],
  disconnectSchoolCloud: async schoolId => ({ schoolId, removed: true }),
  requestSchoolCloud: async (schoolId, request) => {
    calls.push({ schoolId, request });
    if (request.path === '/v1/announcements' && request.method === 'GET') {
      return { ok: true, status: 200, body: { announcements: [{ id: 'announcement-1', envelope: {
        algorithm: 'AES-256-GCM',
        iv: 'iv',
        ciphertext: Buffer.from(JSON.stringify({ title: 'Notice', message: 'Meeting' }), 'utf8').toString('base64')
      } }] } };
    }
    return { ok: true, status: 200, body: { success: true } };
  }
};
global.encryptPayload = async (plaintext, _key, options) => ({
  algorithm: 'AES-256-GCM',
  iv: 'iv',
  ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'),
  purpose: options.purpose
});
global.decryptPayload = async envelope => Buffer.from(envelope.ciphertext, 'base64').toString('utf8');
global.setInterval = () => 1;
global.clearInterval = () => {};

const Client = require('../src/renderer/js/school-cloud-client');

(async () => {
  const schoolId = 'school_12345';
  const contentKey = 'a'.repeat(64);
  assert.deepStrictEqual(await Client.featureStatus(), { enabled: true });
  assert.deepStrictEqual(await Client.connections(), [{ schoolId: 'school_12345', hasSession: true }]);

  await Client.submitPersonnelChange(schoolId, 'school-ict', {
    actionCode: 'personnel-update', targetUserId: 'personnel-1', payload: { teachingLoad: ['Grade 4'] }
  }, contentKey);
  await Client.submitPersonnelChange(schoolId, 'school-ict', {
    actionCode: 'personnel-create',
    payload: { contactReference: 'teacher@deped.gov.ph', displayName: 'Teacher One', role: 'subject-teacher' }
  }, contentKey);
  const inviteCall = calls.find(item => item.request.path === '/v1/personnel-changes'
    && item.request.body.actionCode === 'personnel-create');
  assert.strictEqual(inviteCall.request.body.requestedRole, 'subject-teacher');
  assert(!JSON.stringify(inviteCall.request.body).includes('teacher@deped.gov.ph'), 'contact reference left the encrypted personnel envelope');
  await assert.rejects(() => Client.submitPersonnelChange(schoolId, 'school-admin', {
    actionCode: 'personnel-update', payload: {}
  }, contentKey), /cannot perform/);

  await Client.createAnnouncement(schoolId, 'school-admin', {
    title: 'Faculty meeting', message: 'Friday at 3 PM', priority: 'important', requiresAck: true
  }, contentKey);
  const announcementCall = calls.find(item => item.request.path === '/v1/announcements' && item.request.method === 'POST');
  const serializedRequest = JSON.stringify(announcementCall.request.body);
  assert(!serializedRequest.includes('Faculty meeting'), 'plaintext announcement title left the renderer');
  assert(!serializedRequest.includes('Friday at 3 PM'), 'plaintext announcement message left the renderer');
  assert.strictEqual(announcementCall.request.body.envelope.purpose, 'school-cloud-announcement');

  await assert.rejects(
    () => Client.decideApproval(schoolId, 'school-admin', 'approval-1', 'approved', '', contentKey),
    /cannot perform/
  );
  await Client.decideApproval(schoolId, 'school-head', 'approval-1', 'approved', '', contentKey);
  await Client.createOverrideGrant(schoolId, 'school-head', { scope: 'announcement' });
  await assert.rejects(
    () => Client.applyOverride(schoolId, 'school-admin', 'approval-1', 'CODE', '', contentKey),
    /reason/
  );
  await Client.applyOverride(schoolId, 'school-admin', 'approval-1', 'CODE', 'Urgent safety notice', contentKey);

  const activation = await Client.activate(schoolId, {
    endpoint: 'https://school.example.workers.dev', activationCode: 'ECR-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF', deviceLabel: 'Desktop', storageMode: 'cloud-backup'
  });
  assert.strictEqual(activation.storageMode, 'cloud-backup');
  await Client.backupProfile(schoolId, { version: 1 });
  assert.deepStrictEqual(await Client.restoreProfile(schoolId), { database: { version: 1 } });

  const announcements = await Client.listAnnouncements(schoolId, contentKey);
  assert.deepStrictEqual(announcements[0].content, { title: 'Notice', message: 'Meeting' });

  console.log('School Cloud desktop role, encryption-boundary, approval, and announcement client tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
