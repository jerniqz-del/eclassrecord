const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

global.getActiveProfileDatabase = () => global.__pilotProfile;
global.saveDatabase = async () => ({ success: true });
global.__pilotProfile = {};

const Pilot = require('../src/renderer/js/cloud-grade-pilot.js');

(async () => {
  assert.strictEqual(Pilot.normalizeEndpoint('https://school.example.workers.dev/'), 'https://school.example.workers.dev');
  assert.strictEqual(Pilot.normalizeEndpoint('http://localhost:8787/'), 'http://localhost:8787');
  assert.throws(() => Pilot.normalizeEndpoint('http://school.example.com'), /secure HTTPS/);

  const adviserKeys = await Pilot.createDeviceKeys();
  global.__pilotProfile.cloudGradePilot = {
    endpoint: 'https://school.example.workers.dev',
    token: 'test-token',
    user: { role: 'adviser' },
    privateKey: adviserKeys.privateKey,
    publicKey: adviserKeys.publicKey
  };
  const gradePayload = {
    format: 'eclass-record-grade-export',
    schemaVersion: '1.0',
    exportId: 'pilot-test',
    learners: [{ lrn: '123456789012', finalGrade: 91 }]
  };
  const envelope = await Pilot.encryptPayload(gradePayload, adviserKeys.publicKey);
  assert.strictEqual(envelope.algorithm, Pilot.ENVELOPE_ALGORITHM);
  assert.deepStrictEqual(await Pilot.decryptPayload(envelope), gradePayload);

  const otherKeys = await Pilot.createDeviceKeys();
  global.__pilotProfile.cloudGradePilot.privateKey = otherKeys.privateKey;
  await assert.rejects(() => Pilot.decryptPayload(envelope), /could not be decrypted/);

  const schema = fs.readFileSync(path.join(__dirname, '../cloud-grade-pilot/schema.sql'), 'utf8');
  assert(schema.includes('UNIQUE (school_id, export_id)'), 'duplicate submission protection is missing');
  assert(schema.includes('idx_submissions_retention'), 'retention index is missing');

  const workerSource = fs.readFileSync(path.join(__dirname, '../cloud-grade-pilot/worker.js'), 'utf8');
  assert(workerSource.includes('/activation-code'), 'replacement activation endpoint is missing');
  assert(workerSource.includes('/status'), 'user disable endpoint is missing');
  assert(workerSource.includes("DELETE FROM sessions WHERE user_id = ?"), 'session revocation is missing');

  const workerPath = path.join(__dirname, '../cloud-grade-pilot/worker.js');
  const Worker = await import(pathToFileURL(workerPath).href);
  const normalized = Worker.normalizeSubmission({
    recipientUserId: 'adviser', exportId: 'export-1', schoolYear: '2026-2027',
    gradeLevel: '7', section: 'Rizal', subjectName: 'Mathematics', subjectKey: 'mathematics',
    term: 1, learnerCount: 30,
    envelope: { algorithm: Pilot.ENVELOPE_ALGORITHM, ephemeralPublicKey: adviserKeys.publicKey, iv: 'a', ciphertext: 'b' }
  });
  assert.strictEqual(normalized.subjectKey, 'MATHEMATICS');
  assert(normalized.payloadBytes < 1500000);
  assert.throws(() => Worker.normalizeSubmission({}), /metadata/);
  assert.deepStrictEqual(Worker.normalizeAssignments([
    { schoolYear: '2026-2027', gradeLevel: '7', section: 'Rizal' }
  ], 'adviser')[0].subjectKey, '*');

  console.log('Cloud Grade Submission client encryption and D1 Worker validation tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
