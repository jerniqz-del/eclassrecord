const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const helper = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'DatabaseHelper.kt');
const model = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'data', 'DataModel.kt');
const premium = read('android', 'app', 'src', 'main', 'java', 'com', 'example', 'eclassrecordmobile', 'ui', 'main', 'PremiumMainScreen.kt');
const companion = read('src', 'renderer', 'js', 'mobile-sync-companion.js');

assert.match(model, /data class ProfilePatch/);
assert.match(model, /val schoolId: String = ""/);
assert.match(helper, /UNSYNCED_EXTRAS_FILE_NAME/);
assert.match(helper, /fun updateProfile/);
assert.match(helper, /fun upsertCalendarEvent/);
assert.match(helper, /fun deleteCalendarEvent/);
assert.match(helper, /type = "profile"/);
assert.match(helper, /type = "calendar"/);
assert.match(premium, /Save profile for desktop sync/);
assert.match(premium, /School calendar shared with the desktop/);
assert.match(companion, /function profileChange/);
assert.match(companion, /function calendarChange/);
assert.match(companion, /change\.type === 'profile'/);
assert.match(companion, /change\.type === 'calendar'/);
assert.match(companion, /Official calendar events cannot be changed from the phone/);

const database = {
  schoolYear: '2026-2027',
  teacherName: 'Old Teacher',
  schoolName: 'Old School',
  schoolId: '111',
  region: 'V',
  division: 'Sorsogon',
  district: 'Old District',
  assignments: [{
    id: 'class-1',
    learners: [{ id: 'learner-1', name: 'Ana' }],
    assessments: [{ id: 'a-1', title: 'WW1', maxScore: 10 }],
    scores: {},
  }],
  calendarEvents: [
    { id: 'local-1', title: 'Old event', startDate: '2026-09-10', endDate: '2026-09-10', date: '2026-09-10' },
    { id: 'official-deped-x', title: 'Official', startDate: '2026-09-11', endDate: '2026-09-11', immutable: true },
  ],
  mobileSync: { appliedChangeIds: [] },
};
const rootDb = {
  activeProfileId: 'profile-1',
  profiles: [{ id: 'profile-1', name: 'Old Teacher' }],
};
const window = {
  electronAPI: {
    getCompanionWlanStatus: async () => ({ revision: 4 }),
    createDatabaseRestorePoint: async () => true,
  },
  addEventListener() {},
  saveDatabase: async () => {},
  render() {},
  renderRecordTable() {},
  scheduleRecordTableRefresh() {},
  renderFinalOnly() {},
  refreshCalendarView() {},
  toast() {},
};
const context = {
  window,
  document: { title: 'E-Class Record v1.10.0', getElementById: () => null },
  console,
  setTimeout: () => 0,
  clearTimeout() {},
  getActiveProfileDatabase: () => database,
  getRootDatabase: () => rootDb,
};

vm.runInNewContext(companion, context);

(async () => {
  const snapshot = window.MobileSyncBridge.buildCompanionSnapshot();
  assert.strictEqual(snapshot.schoolId, '111');
  assert.strictEqual(snapshot.district, 'Old District');

  const applied = await window.MobileSyncBridge.applyChanges({
    profileId: 'profile-1',
    baseRevision: 4,
    batchId: 'batch-1',
    changes: [
      {
        changeId: 'profile-change-1',
        type: 'profile',
        value: JSON.stringify({
          teacherName: 'DELA CRUZ, MARIA',
          schoolName: 'Monbon ES',
          schoolId: '300123',
          region: 'V',
          division: 'Sorsogon',
          district: 'Irosin II',
        }),
      },
      {
        changeId: 'calendar-change-1',
        type: 'calendar',
        action: 'upsert',
        eventId: 'mobile-event-1',
        title: 'PTA meeting',
        value: 'PTA meeting',
        date: '2026-09-20',
        endDate: '2026-09-20',
        status: 'local',
        details: 'Gym',
      },
    ],
  });
  assert.strictEqual(applied.success, true);
  assert.strictEqual(database.teacherName, 'DELA CRUZ, MARIA');
  assert.strictEqual(database.schoolName, 'Monbon ES');
  assert.strictEqual(database.schoolId, '300123');
  assert.strictEqual(database.district, 'Irosin II');
  assert.strictEqual(rootDb.profiles[0].name, 'DELA CRUZ, MARIA');
  const created = database.calendarEvents.find((event) => event.id === 'mobile-event-1');
  assert.strictEqual(created.title, 'PTA meeting');
  assert.strictEqual(created.source, 'android-companion');

  const appliedScore = await window.MobileSyncBridge.applyChanges({
    profileId: 'profile-1',
    baseRevision: 3,
    batchId: 'batch-score-1',
    changes: [{
      changeId: 'score-change-1',
      type: 'score',
      classId: 'class-1',
      learnerId: 'learner-1',
      assessmentId: 'a-1',
      value: '9',
    }],
  });
  assert.strictEqual(appliedScore.success, true);
  assert.strictEqual(database.assignments[0].scores['learner-1|a-1'], 9);

  await assert.rejects(
    () => window.MobileSyncBridge.applyChanges({
      profileId: 'profile-1',
      baseRevision: 9,
      changes: [{ changeId: 'score-change-future', type: 'score', classId: 'class-1', learnerId: 'learner-1', assessmentId: 'a-1', value: '8' }],
    }),
    /ahead of this desktop snapshot/,
  );

  await assert.rejects(
    () => window.MobileSyncBridge.applyChanges({
      profileId: 'profile-1',
      baseRevision: 4,
      changes: [{ changeId: 'bad-official', type: 'calendar', action: 'delete', eventId: 'official-deped-x' }],
    }),
    /Official calendar events cannot be changed/,
  );

  console.log('Mobile profile and calendar desktop sync tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
