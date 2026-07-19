const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const analyticsPath = path.join(ROOT, 'src', 'renderer', 'js', 'usage-analytics.js');
const htmlPath = path.join(ROOT, 'src', 'renderer', 'index.html');
const databasePath = path.join(ROOT, 'src', 'renderer', 'js', 'database.js');
const workerPath = path.join(ROOT, 'community-relay', 'cloudflare-worker.js');
const importExportPath = path.join(ROOT, 'src', 'renderer', 'js', 'import-export.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

delete require.cache[require.resolve(analyticsPath)];
const Analytics = require(analyticsPath);

const profile = {
  teacherName: 'DELA CRUZ, MARIA',
  schoolName: 'Private School Name',
  schoolId: '300123',
  region: 'Region V (Bicol Region)',
  division: 'Sorsogon Division',
  district: 'Secret District',
  assignments: [
    { id: 'a1', gradeLevel: 4, section: 'A', subject: 'Mathematics' },
    { id: 'a2', gradeLevel: 'Grade 11', section: 'B', subject: 'English' },
    { id: 'a3', gradeLevel: 11, section: 'B', subject: 'Science' }
  ],
  advisory: { classes: [{ id: 'adv1', gradeLevel: 12, section: 'C' }] },
  learners: [{ lrn: '123456789012', birthdate: '2010-01-01', grade: 95 }]
};

const now = new Date('2026-07-18T12:00:00.000Z');
const summary = Analytics.buildUsageSummary(profile, '1.6.3', now);
assert.deepStrictEqual(summary, {
  schemaVersion: '1',
  period: '2026-07',
  region: 'Region V (Bicol Region)',
  division: 'Sorsogon Division',
  gradeLevels: [
    { gradeLevel: 4, classCount: 1 },
    { gradeLevel: 11, classCount: 2 },
    { gradeLevel: 12, classCount: 1 }
  ],
  appVersion: '1.6.3'
});

const serialized = JSON.stringify(summary);
[
  'Secret District', 'DELA CRUZ', 'Private School', '300123', 'Mathematics',
  'English', 'Science', '123456789012', '2010-01-01', 'section', 'district',
  'teacherName', 'schoolName', 'schoolId', 'learners', 'grades'
].forEach(value => assert(!serialized.includes(value), `analytics payload leaked ${value}`));

assert.strictEqual(Analytics.normalizeGradeLevel('Grade 12'), 12);
assert.strictEqual(Analytics.normalizeGradeLevel('Kindergarten'), 0);
assert.strictEqual(Analytics.normalizeGradeLevel(13), 0);
assert.strictEqual(Analytics.buildUsageSummary({ ...profile, isMockTestData: true }, '1.6.3', now), null);
assert.strictEqual(Analytics.buildUsageSummary({ ...profile, region: 'Mock Region' }, '1.6.3', now), null);
assert.strictEqual(Analytics.buildUsageSummary({ ...profile, division: '' }, '1.6.3', now), null);

const storage = memoryStorage();
assert.deepStrictEqual(Analytics.readConsent(storage), {
  enabled: false,
  decided: false,
  version: Analytics.CONSENT_VERSION
});
Analytics.writeConsent(true, storage, now);
assert.strictEqual(Analytics.readConsent(storage).enabled, true);

let fetchCount = 0;
let transmittedBody = null;
const fetchFn = async (_url, options) => {
  fetchCount += 1;
  transmittedBody = JSON.parse(options.body);
  return { ok: true, status: 202, json: async () => ({ success: true, aggregateOnly: true }) };
};

(async () => {
  const sent = await Analytics.maybeSendSummary(profile, {
    storage,
    fetchFn,
    appVersion: '1.6.3',
    now,
    online: true
  });
  assert.strictEqual(sent.sent, true);
  assert.strictEqual(sent.aggregateOnly, true);
  assert.deepStrictEqual(transmittedBody, summary);
  assert.strictEqual(fetchCount, 1);

  const duplicate = await Analytics.maybeSendSummary(profile, {
    storage,
    fetchFn,
    appVersion: '1.6.3',
    now,
    online: true
  });
  assert.strictEqual(duplicate.sent, false);
  assert.strictEqual(duplicate.reason, 'already-reported');
  assert.strictEqual(fetchCount, 1);

  Analytics.writeConsent(false, storage, now);
  const disabled = await Analytics.maybeSendSummary(profile, {
    storage,
    fetchFn,
    appVersion: '1.6.3',
    now,
    online: true,
    force: true
  });
  assert.strictEqual(disabled.reason, 'consent-disabled');
  assert.strictEqual(fetchCount, 1);

  const failureStorage = memoryStorage();
  Analytics.writeConsent(true, failureStorage, now);
  let failureFetchCount = 0;
  const failingFetch = async () => {
    failureFetchCount += 1;
    return { ok: false, status: 503, json: async () => ({ error: 'Unavailable' }) };
  };
  const failed = await Analytics.maybeSendSummary(profile, {
    storage: failureStorage, fetchFn: failingFetch, appVersion: '1.6.3', now, online: true
  });
  assert.strictEqual(failed.reason, 'send-failed');
  const cooledDown = await Analytics.maybeSendSummary(profile, {
    storage: failureStorage,
    fetchFn: failingFetch,
    appVersion: '1.6.3',
    now: new Date(now.getTime() + 60 * 60 * 1000),
    online: true
  });
  assert.strictEqual(cooledDown.reason, 'retry-later');
  assert.strictEqual(failureFetchCount, 1, 'failed summaries must not retry on every save');

  const testModeStorage = memoryStorage();
  global.AdminTestMode = { isActive: () => true };
  Analytics.setConsent(true, { storage: testModeStorage, now, notify: false });
  assert.strictEqual(Analytics.readConsent(testModeStorage).enabled, false, 'test mode must not persist analytics consent changes');
  delete global.AdminTestMode;

  const html = fs.readFileSync(htmlPath, 'utf8');
  const databaseSource = fs.readFileSync(databasePath, 'utf8');
  const importExportSource = fs.readFileSync(importExportPath, 'utf8');
  assert(html.includes('id="welcomeUsageAnalyticsCheckbox"'), 'welcome analytics choice missing');
  assert(html.includes('id="settingUsageAnalytics"'), 'settings analytics choice missing');
  assert(html.includes('Optional Usage Analytics and Privacy'), 'Terms declaration missing');
  assert(html.includes('Controller and contact'), 'privacy notice controller contact channel missing');
  assert(html.includes('id="usagePrivacyModal"'), 'privacy notice missing');
  assert(html.includes('js/usage-analytics.js'), 'analytics module not loaded');
  assert(databaseSource.includes('UsageAnalytics?.scheduleProfileSummary?.(db)'), 'successful-save scheduler missing');
  assert(!databaseSource.includes(Analytics.CONSENT_KEY), 'analytics consent must not enter the database');
  assert(!importExportSource.includes(Analytics.CONSENT_KEY), 'analytics consent must not enter backups');

  const workerSource = fs.readFileSync(workerPath, 'utf8');
  const workerForTest = workerSource.replace(/export default \{[\s\S]*$/, '') +
    '\n;globalThis.__usageTest = { normalizeUsagePayload, usageCutoffPeriod };';
  const context = { console, Date, URL, Response, globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(workerForTest, context, { filename: workerPath });
  const worker = context.__usageTest;
  const normalized = worker.normalizeUsagePayload(summary, now);
  assert.strictEqual(normalized.region, summary.region);
  assert.strictEqual(normalized.gradeLevels.length, 3);
  assert.strictEqual(worker.usageCutoffPeriod(now), '2024-08');
  assert.throws(() => worker.normalizeUsagePayload({ ...summary, district: 'Forbidden' }, now), /prohibited/i);
  assert.throws(() => worker.normalizeUsagePayload({ ...summary, teacherName: 'Forbidden' }, now), /prohibited/i);
  assert.throws(() => worker.normalizeUsagePayload({ ...summary, gradeLevels: [{ gradeLevel: 13, classCount: 1 }] }, now), /1 to 12/i);
  assert.throws(() => worker.normalizeUsagePayload({ ...summary, region: 'Mock Region' }, now), /Test data/i);
  assert.throws(() => worker.normalizeUsagePayload({ ...summary, period: '2026-06' }, now), /current UTC month/i);
  assert(workerSource.includes("url.pathname === '/usage/class-summary'"), 'usage endpoint missing');
  assert(workerSource.includes('CREATE TABLE IF NOT EXISTS usage_monthly'), 'aggregate table missing');
  assert(!workerSource.includes('request.headers.get(\'CF-Connecting-IP\')'), 'worker must not read client IP');

  const localRelaySource = fs.readFileSync(path.join(ROOT, 'community-relay', 'server.js'), 'utf8');
  assert(localRelaySource.includes("'/usage/class-summary'"), 'local usage endpoint missing');
  assert(localRelaySource.includes('const forbiddenFields = ['), 'local relay prohibited-field validation missing');

  const storedPreferences = JSON.stringify(storage.dump());
  assert(!storedPreferences.includes('Secret District'));
  assert(!storedPreferences.includes('123456789012'));
  console.log('Optional usage analytics consent, minimization, aggregation, suppression, and backup-boundary tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
