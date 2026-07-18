const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const AdminTestMode = require(path.join(projectRoot, 'src', 'renderer', 'js', 'admin-testing.js'));

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function testMockFactory() {
  const first = AdminTestMode.buildCompleteMockProfile();
  const second = AdminTestMode.buildCompleteMockProfile();
  assert.deepStrictEqual(first, second, 'mock data must be deterministic');
  assert.strictEqual(first.isMockTestData, true);
  assert.ok(first.teacherName.includes('TEST DATA'));
  assert.ok(first.schoolName.includes('TEST DATA'));
  assert.strictEqual(first.assignments.length, 4);

  const expectedLoads = [
    ['4', 'Mathematics'],
    ['8', 'MAPEH'],
    ['11', 'Effective Communication'],
    ['12', 'Computer Systems Servicing']
  ];
  expectedLoads.forEach(([gradeLevel, subject]) => {
    const assignment = first.assignments.find(item => item.gradeLevel === gradeLevel && item.subject === subject);
    assert.ok(assignment, `missing Grade ${gradeLevel} ${subject}`);
    assert.strictEqual(assignment.learners.length, 24);
    assert.deepStrictEqual([...new Set(assignment.assessments.map(item => item.term))].sort(), ['1', '2', '3']);
    assert.ok(Object.keys(assignment.scores).length > 0);
    assert.ok(Object.keys(assignment.scores).length < assignment.learners.length * assignment.assessments.length, 'mock scores must include incomplete entries');
    assert.ok(assignment.attendanceSessions.length > 0);
    assert.ok(assignment.attendanceNoClassDays.length > 0);
    assert.ok(assignment.supportRecords.length > 0);
  });

  const lrns = first.assignments[0].learners.map(item => item.lrn);
  assert.strictEqual(new Set(lrns).size, 24);
  assert.ok(lrns.every(lrn => /^99000000\d{4}$/.test(lrn)), 'all LRNs must use the reserved fictional range');

  const ratios = first.assignments.flatMap(assignment => Object.entries(assignment.scores).map(([key, score]) => {
    const assessmentId = key.split('|')[1];
    const assessment = assignment.assessments.find(item => item.id === assessmentId);
    return Number(score) / Number(assessment.maxScore);
  }));
  assert.ok(ratios.some(ratio => ratio < 0.6), 'mock scores must include failing examples');
  assert.ok(ratios.some(ratio => ratio >= 0.75), 'mock scores must include passing examples');

  const advisory = first.advisory;
  assert.strictEqual(advisory.classes.length, 1);
  assert.strictEqual(advisory.learners.length, 24);
  assert.deepStrictEqual(new Set(advisory.subjects.map(item => item.sourceType)), new Set(['manual', 'in-app-class', 'grade-transfer-file']));
  assert.strictEqual(advisory.importBatches.length, 2);
  const editableImport = advisory.importBatches.find(item => item.adviserEditAllowed === true);
  const lockedImport = advisory.importBatches.find(item => item.adviserEditAllowed === false);
  assert.ok(editableImport?.adviserModificationNote.includes('Mock note'));
  assert.ok(lockedImport && lockedImport.adviserModificationNote === '');
  const adjusted = advisory.grades.find(item => item.adviserModifiedAt);
  assert.ok(adjusted, 'mock advisory data must include an adviser-adjusted grade');
  assert.notStrictEqual(adjusted.finalGrade, adjusted.submittedFinalGrade);
  assert.ok(adjusted.adviserModifiedBy);
  assert.ok(adjusted.importBatchId);
}

async function testLifecycle() {
  const original = { teacherName: 'REAL PROFILE', assignments: [{ id: 'real-assignment' }] };
  const originalBytes = JSON.stringify(original);
  let activeDb = original;
  let navigation = { currentView: 'attendance', recordTab: '3' };
  let saveCalls = 0;
  let renderCalls = 0;

  global.getRootDatabase = () => ({ activeProfileId: 'real-profile' });
  global.saveDatabase = async () => {
    saveCalls += 1;
    activeDb.updatedAt = 'SAVE-TIME-METADATA';
    activeDb.integrity = { digest: 'save-time-digest' };
    return true;
  };
  global.getActiveProfileDatabase = () => activeDb;
  global.replaceActiveProfileDatabase = next => { activeDb = next; };
  global.getRuntimeNavigationState = () => ({ ...navigation });
  global.replaceRuntimeNavigationState = next => { navigation = { ...next }; };
  global.normalizeDatabase = () => {};
  global.render = () => { renderCalls += 1; };
  global.setStatus = () => {};
  global.toast = () => {};

  assert.strictEqual(await AdminTestMode.startCompleteWorkspace(), true);
  assert.strictEqual(saveCalls, 1, 'real active profile must be saved once before entry');
  assert.strictEqual(AdminTestMode.isActive(), true);
  assert.strictEqual(AdminTestMode.shouldSuppressPersistence(), true);
  assert.strictEqual(activeDb.isMockTestData, true);
  activeDb.teacherName = 'CHANGED MOCK DATA';
  assert.strictEqual(AdminTestMode.exitTestMode(), true);
  assert.strictEqual(activeDb, original, 'exit must restore the exact original object reference');
  assert.strictEqual(JSON.stringify(original), originalBytes, 'real profile must remain byte-for-byte unchanged');
  assert.deepStrictEqual(navigation, { currentView: 'attendance', recordTab: '3' });
  assert.strictEqual(AdminTestMode.isActive(), false);
  assert.ok(renderCalls >= 2);

  global.saveDatabase = async () => {
    activeDb.updatedAt = 'FAILED-SAVE-METADATA';
    return false;
  };
  assert.strictEqual(await AdminTestMode.startCompleteWorkspace(), false);
  assert.strictEqual(AdminTestMode.isActive(), false);
  assert.strictEqual(activeDb, original, 'failed baseline save must not replace the live profile');
  assert.strictEqual(JSON.stringify(original), originalBytes, 'failed baseline saves must also restore in-memory metadata mutations');
}

function testSafetyWiring() {
  const database = read('src/renderer/js/database.js');
  const saveStart = database.indexOf('async function saveDatabase()');
  const saveGuard = database.indexOf('AdminTestMode?.shouldSuppressPersistence', saveStart);
  const normalize = database.indexOf('normalizeDatabase();', saveStart);
  assert.ok(saveStart >= 0 && saveGuard > saveStart && saveGuard < normalize, 'profile save guard must run before normalization');
  const rootStart = database.indexOf('async function saveRootDatabase()');
  const rootGuard = database.indexOf('AdminTestMode?.shouldSuppressPersistence', rootStart);
  const rootTry = database.indexOf('try {', rootStart);
  assert.ok(rootGuard > rootStart && rootGuard < rootTry, 'root save guard must run before root persistence work');

  const index = read('src/renderer/index.html');
  assert.ok(index.includes('js/admin-testing.js'));
  assert.ok(index.indexOf('js/admin-testing.js') > index.indexOf('js/admin.js'), 'testing UI must augment the authenticated admin panel');
  const adminTesting = read('src/renderer/js/admin-testing.js');
  assert.ok(adminTesting.includes("querySelector('.adm-panel')"));
  assert.ok(adminTesting.includes("querySelector('.adm-tabs')"));
  assert.ok(adminTesting.includes('function handleAdminShortcut'));
  assert.ok(index.includes('id="sidebarBrandIcon"'));
  assert.ok(adminTesting.includes("getElementById('sidebarBrandIcon')"));
  assert.ok(adminTesting.includes("addEventListener('keydown', handleAdminShortcut, true)"));
  assert.ok(!adminTesting.includes('localStorage'));

  assert.ok(read('src/renderer/js/record-table.js').includes('AdminTestMode?.blockExternalAction'));
  assert.ok(read('src/renderer/js/mobile-sync.js').includes('AdminTestMode?.blockExternalAction'));
  const main = read('src/main/main.js');
  assert.ok(main.includes('function mockSafeFilename'));
  assert.ok(main.includes('TEST DATA — NOT FOR OFFICIAL USE'));
  const css = read('src/renderer/css/admin.css');
  assert.ok(adminTesting.includes('ADMIN TEST MODE — NOT SAVED'));
  assert.ok(css.includes('.admin-test-mode-banner'));
  assert.ok(css.includes('TEST DATA — NOT FOR OFFICIAL USE'));
  assert.strictEqual(AdminTestMode.markExportFilename('grades.pdf'), 'TEST-MOCK-grades.pdf');
  assert.strictEqual(AdminTestMode.markExportFilename('TEST-MOCK-grades.pdf'), 'TEST-MOCK-grades.pdf');
}

(async () => {
  testMockFactory();
  await testLifecycle();
  testSafetyWiring();
  console.log('Admin temporary mock test workspace tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
