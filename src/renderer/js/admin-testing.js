(function initAdminTesting(globalScope) {
  'use strict';

  const TEST_MARKER = 'TEST DATA — NOT FOR OFFICIAL USE';
  const TEST_FILENAME_PREFIX = 'TEST-MOCK-';
  const TEST_SCHOOL_YEAR = '2026-2027';
  const TEST_TIMESTAMP = '2026-07-18T08:00:00.000Z';
  const session = {
    active: false,
    starting: false,
    originalDb: null,
    originalDbSnapshot: null,
    originalView: 'dashboard',
    originalRecordTab: '1',
    originalProfileOverlayDisplay: '',
    observer: null
  };

  const learnerNames = [
    ['ABAD', 'ANA', 'CRUZ', 'F'], ['BAUTISTA', 'BEN', 'REYES', 'M'],
    ['CASTILLO', 'CARLA', 'SANTOS', 'F'], ['DELA ROSA', 'DIEGO', 'MENDOZA', 'M'],
    ['EVANGELISTA', 'ELLA', 'RAMOS', 'F'], ['FLORES', 'FRANCIS', 'GARCIA', 'M'],
    ['GONZALES', 'GRACE', 'AQUINO', 'F'], ['HERNANDEZ', 'HUGO', 'TORRES', 'M'],
    ['IGNACIO', 'IRIS', 'NAVARRO', 'F'], ['JIMENEZ', 'JOEL', 'LIM', 'M'],
    ['LACSON', 'KARA', 'MERCADO', 'F'], ['MABINI', 'LEO', 'PASCUAL', 'M'],
    ['NOLASCO', 'MAYA', 'RIVERA', 'F'], ['ONG', 'NOEL', 'SORIANO', 'M'],
    ['PANGANIBAN', 'OLIVIA', 'TAN', 'F'], ['QUIAMBAO', 'PAOLO', 'UY', 'M'],
    ['RAMIREZ', 'QUEENIE', 'VALDEZ', 'F'], ['SALAZAR', 'RAFAEL', 'YAP', 'M'],
    ['TOLENTINO', 'SOFIA', 'ZAMORA', 'F'], ['URBANO', 'TOMAS', 'ALVAREZ', 'M'],
    ['VILLANUEVA', 'URSULA', 'BONIFACIO', 'F'], ['WENCESLAO', 'VICTOR', 'CO', 'M'],
    ['YAP', 'WENDY', 'DOMINGO', 'F'], ['ZARATE', 'XAVIER', 'ENRIQUEZ', 'M']
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function restoreObjectSnapshot(target, snapshot) {
    if (!target || !snapshot || typeof target !== 'object') return;
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, clone(snapshot));
  }

  function mockLearners(classKey) {
    return learnerNames.map((parts, index) => ({
      id: `mock-${classKey}-learner-${String(index + 1).padStart(2, '0')}`,
      lrn: `99000000${String(index + 1).padStart(4, '0')}`,
      lastName: parts[0],
      firstName: parts[1],
      middleName: parts[2],
      displayName: `${parts[0]}, ${parts[1]} ${parts[2].charAt(0)}.`,
      sex: parts[3],
      birthdate: `20${String(8 + (index % 3)).padStart(2, '0')}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 24) + 1).padStart(2, '0')}`
    }));
  }

  function assessmentDefinitions(assignmentId, isMapeh) {
    const rows = [];
    const components = [
      ['WW', 'Written Work 1', 25],
      ['WW', 'Written Work 2', 25],
      ['PT', 'Performance Task 1', 50],
      ['ST1', 'Summative Test 1', 40],
      ['ST2', 'Summative Test 2', 40],
      ['TE', 'Term Examination', 50]
    ];
    ['1', '2', '3'].forEach(term => {
      const parts = isMapeh ? ['music_arts', 'pe_health'] : [''];
      parts.forEach(part => components.forEach((component, index) => {
        rows.push({
          id: `mock-${assignmentId}-t${term}-${part || 'main'}-${index + 1}`,
          term,
          component: component[0],
          title: component[1],
          maxScore: component[2],
          date: `2026-${String(Number(term) + 6).padStart(2, '0')}-${String(index + 3).padStart(2, '0')}`,
          ...(part ? { mapePart: part } : {})
        });
      }));
    });
    return rows;
  }

  function mockScores(learners, assessments) {
    const scores = {};
    learners.forEach((learner, learnerIndex) => assessments.forEach((assessment, assessmentIndex) => {
      if ((learnerIndex + assessmentIndex) % 17 === 0 || (learnerIndex === 23 && assessment.term === '3')) return;
      const ratio = 0.54 + (((learnerIndex * 7) + (assessmentIndex * 3)) % 45) / 100;
      scores[`${learner.id}|${assessment.id}`] = Math.min(assessment.maxScore, Math.max(0, Math.round(assessment.maxScore * ratio)));
    }));
    return scores;
  }

  function attendanceFixture(learners) {
    return {
      attendanceSessions: [
        { date: '2026-07-06', term: '1' },
        { date: '2026-07-07', term: '1' },
        { date: '2026-07-08', term: '1' },
        { date: '2026-07-09', term: '1' }
      ],
      attendanceNoClassDays: [{ date: '2026-07-10', term: '1', reason: 'Mock school activity' }],
      supportRecords: [
        { id: 'mock-att-absence', category: 'attendance', type: 'absence', learnerId: learners[1].id, date: '2026-07-06', term: '1', note: 'Mock absence', createdAt: TEST_TIMESTAMP },
        { id: 'mock-att-tardy', category: 'attendance', type: 'tardy', learnerId: learners[2].id, date: '2026-07-07', term: '1', note: 'Mock late arrival', createdAt: TEST_TIMESTAMP },
        { id: 'mock-att-excused', category: 'attendance', type: 'excused', learnerId: learners[3].id, date: '2026-07-08', term: '1', note: 'Excused: Mock medical appointment', excuseReason: 'Mock medical appointment', createdAt: TEST_TIMESTAMP }
      ]
    };
  }

  function mockAssignment({ id, gradeLevel, section, subject, subjectGroup, shsSubjectGroup = '', isMapeh = false }) {
    const learners = mockLearners(id);
    const assessments = assessmentDefinitions(id, isMapeh);
    return {
      id: `mock-${id}`,
      gradeLevel: String(gradeLevel),
      section,
      subject,
      subjectGroup,
      ...(shsSubjectGroup ? { shsSubjectGroup } : {}),
      policy: 'DO15_TRANSITION',
      schoolYear: TEST_SCHOOL_YEAR,
      dashboardOrder: 0,
      learners,
      assessments,
      scores: mockScores(learners, assessments),
      ...attendanceFixture(learners)
    };
  }

  function advisoryFixture(sourceAssignment) {
    const advisoryClassId = 'mock-advisory-grade-11-integrity';
    const adviserName = `Admin Test Adviser — ${TEST_MARKER}`;
    const subjects = [
      ['effective-communication', 'Effective Communication', 'in-app-class'],
      ['general-mathematics', 'General Mathematics', 'grade-transfer-file'],
      ['life-career-skills', 'Life and Career Skills', 'manual'],
      ['general-science', 'General Science', 'grade-transfer-file']
    ].map((row, index) => ({
      id: `mock-advisory-subject-${row[0]}`,
      advisoryClassId,
      subjectName: row[1],
      normalizedSubjectKey: row[1].toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
      sourceType: row[2],
      expectedSourceTeacher: row[2] === 'grade-transfer-file' ? 'Mock Subject Teacher' : '',
      expectedSourceClass: row[2] === 'in-app-class' ? 'Grade 11 - Integrity' : '',
      expectedGradeLevel: '11',
      expectedSection: 'Integrity',
      expectedSchoolYear: TEST_SCHOOL_YEAR,
      displayOrder: index,
      includeInGeneralAverage: true,
      createdAt: TEST_TIMESTAMP,
      updatedAt: TEST_TIMESTAMP
    }));
    const learners = sourceAssignment.learners.map((learner, index) => ({
      id: `mock-advisory-learner-${String(index + 1).padStart(2, '0')}`,
      advisoryClassId,
      linkedLearnerId: learner.id,
      lrn: learner.lrn,
      lastName: learner.lastName,
      firstName: learner.firstName,
      middleName: learner.middleName,
      sex: learner.sex,
      birthdate: learner.birthdate,
      enrollmentStatus: 'active',
      source: 'class-load',
      createdAt: TEST_TIMESTAMP,
      updatedAt: TEST_TIMESTAMP
    }));
    const transferSubject = subjects[1];
    const manualSubject = subjects[2];
    const inAppSubject = subjects[0];
    const importBatches = [
      {
        id: 'mock-import-general-math-term-1', advisoryClassId, exportId: 'mock-export-general-math-1',
        filename: 'TEST-MOCK-General-Mathematics-Term-1.json', fileFingerprint: 'mock-fingerprint-term-1', schemaVersion: '1.0',
        schoolYear: TEST_SCHOOL_YEAR, subject: 'General Mathematics', term: '1', sourceTeacher: 'Mock Subject Teacher',
        sourceClass: 'Grade 11 - Integrity', exportedAt: '2026-07-11T08:00:00.000Z', importedAt: '2026-07-12T08:00:00.000Z',
        totalRecords: 24, importedCount: 24, status: 'imported', adviserEditAllowed: true,
        adviserModificationNote: 'Mock note: Adviser may correct verified encoding errors for Term 1 only.',
        createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
      },
      {
        id: 'mock-import-general-math-term-2', advisoryClassId, exportId: 'mock-export-general-math-2',
        filename: 'TEST-MOCK-General-Mathematics-Term-2.json', fileFingerprint: 'mock-fingerprint-term-2', schemaVersion: '1.0',
        schoolYear: TEST_SCHOOL_YEAR, subject: 'General Mathematics', term: '2', sourceTeacher: 'Mock Subject Teacher',
        sourceClass: 'Grade 11 - Integrity', exportedAt: '2026-07-13T08:00:00.000Z', importedAt: '2026-07-14T08:00:00.000Z',
        totalRecords: 24, importedCount: 24, status: 'imported', adviserEditAllowed: false,
        adviserModificationNote: '', createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
      }
    ];
    const grades = [];
    learners.forEach((learner, index) => {
      ['1', '2', '3'].forEach(term => grades.push({
        id: `mock-grade-inapp-${index + 1}-${term}`, advisoryClassId, advisoryLearnerId: learner.id,
        advisorySubjectId: inAppSubject.id, schoolYear: TEST_SCHOOL_YEAR, learnerLrn: learner.lrn,
        subjectName: inAppSubject.subjectName, normalizedSubjectKey: inAppSubject.normalizedSubjectKey,
        gradeLevel: '11', section: 'Integrity', term, finalGrade: 78 + ((index + Number(term) * 3) % 20),
        sourceType: 'in-app-class', sourceClassId: sourceAssignment.id, sourceClassName: 'Grade 11 - Integrity',
        sourceTeacherName: adviserName, validationStatus: 'valid', createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
      }));
      ['1', '2'].forEach(term => {
        const submitted = 76 + ((index * 2 + Number(term) * 4) % 23);
        const adjusted = index === 0 && term === '1';
        grades.push({
          id: `mock-grade-transfer-${index + 1}-${term}`, advisoryClassId, advisoryLearnerId: learner.id,
          advisorySubjectId: transferSubject.id, schoolYear: TEST_SCHOOL_YEAR, learnerLrn: learner.lrn,
          subjectName: transferSubject.subjectName, normalizedSubjectKey: transferSubject.normalizedSubjectKey,
          gradeLevel: '11', section: 'Integrity', term, finalGrade: adjusted ? Math.min(100, submitted + 3) : submitted,
          submittedFinalGrade: submitted, sourceType: 'grade-transfer-file', sourceClassName: 'Grade 11 - Integrity',
          sourceTeacherName: 'Mock Subject Teacher', exportId: `mock-export-general-math-${term}`,
          importBatchId: `mock-import-general-math-term-${term}`, importedAt: TEST_TIMESTAMP,
          adviserEditAllowed: term === '1', adviserModifiedAt: adjusted ? '2026-07-15T09:30:00.000Z' : '',
          adviserModifiedBy: adjusted ? adviserName : '', validationStatus: 'valid', createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
        });
      });
      ['1', '2', '3'].forEach(term => {
        if ((index + Number(term)) % 8 === 0) return;
        grades.push({
          id: `mock-grade-manual-${index + 1}-${term}`, advisoryClassId, advisoryLearnerId: learner.id,
          advisorySubjectId: manualSubject.id, schoolYear: TEST_SCHOOL_YEAR, learnerLrn: learner.lrn,
          subjectName: manualSubject.subjectName, normalizedSubjectKey: manualSubject.normalizedSubjectKey,
          gradeLevel: '11', section: 'Integrity', term, finalGrade: 74 + ((index + Number(term) * 5) % 25),
          sourceType: 'manual', validationStatus: 'valid', createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
        });
      });
    });
    return {
      schemaVersion: 2,
      classes: [{
        id: advisoryClassId, schoolYear: TEST_SCHOOL_YEAR, gradeLevel: '11', section: 'Integrity',
        adviserName, schoolName: `Mock Senior High School — ${TEST_MARKER}`, schoolId: 'TEST-000001',
        district: 'Mock District', division: 'Mock Schools Division', region: 'Mock Region', isActive: true,
        createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
      }],
      learners,
      subjects,
      grades,
      importBatches,
      sourceMappings: [{
        id: 'mock-source-map-general-math', advisoryClassId, importedSubjectName: 'General Mathematics',
        importedNormalizedKey: 'GENERAL MATHEMATICS', advisorySubjectId: transferSubject.id,
        sourceTeacher: 'Mock Subject Teacher', sourceClass: 'Grade 11 - Integrity', schoolYear: TEST_SCHOOL_YEAR,
        createdAt: TEST_TIMESTAMP, updatedAt: TEST_TIMESTAMP
      }]
    };
  }

  function buildCompleteMockProfile() {
    const assignments = [
      mockAssignment({ id: 'g4-math', gradeLevel: 4, section: 'Hope', subject: 'Mathematics', subjectGroup: 'REGULAR' }),
      mockAssignment({ id: 'g8-mapeh', gradeLevel: 8, section: 'Courage', subject: 'MAPEH', subjectGroup: 'MAPEH', isMapeh: true }),
      mockAssignment({ id: 'g11-effective-communication', gradeLevel: 11, section: 'Integrity', subject: 'Effective Communication', subjectGroup: 'SHS_CORE', shsSubjectGroup: 'SHS_CORE' }),
      mockAssignment({ id: 'g12-computer-systems', gradeLevel: 12, section: 'Innovation', subject: 'Computer Systems Servicing', subjectGroup: 'SHS_TECHPRO', shsSubjectGroup: 'SHS_TECHPRO' })
    ];
    assignments.forEach((assignment, index) => { assignment.dashboardOrder = index; });
    return {
      version: 5,
      lastUpdatedAt: TEST_TIMESTAMP,
      isMockTestData: true,
      mockTestLabel: TEST_MARKER,
      teacherName: `Admin Test Adviser — ${TEST_MARKER}`,
      schoolName: `Mock Senior High School — ${TEST_MARKER}`,
      schoolId: 'TEST-000001',
      region: 'Mock Region',
      division: 'Mock Schools Division',
      district: 'Mock District',
      schoolYear: TEST_SCHOOL_YEAR,
      currentAssignmentId: assignments[2].id,
      currentTerm: '1',
      activeView: 'dashboard',
      recordTab: '1',
      autoBlur: false,
      secondaryBackupPath: '',
      assignments,
      advisory: advisoryFixture(assignments[2])
    };
  }

  function isActive() {
    return session.active;
  }

  function shouldSuppressPersistence() {
    return session.active;
  }

  function noteSuppressedSave() {
    if (typeof globalScope.setStatus === 'function') globalScope.setStatus('Test mode — changes are not saved');
    const indicator = globalScope.document?.getElementById('autoSaveIndicator');
    if (indicator) indicator.classList.remove('show');
    return true;
  }

  function markExportFilename(filename) {
    const value = String(filename || 'eclass-record-export').trim() || 'eclass-record-export';
    return value.startsWith(TEST_FILENAME_PREFIX) ? value : `${TEST_FILENAME_PREFIX}${value}`;
  }

  function markCsvContent(csv) {
    if (!session.active) return csv;
    return `"${TEST_MARKER}"\r\n${String(csv || '')}`;
  }

  function blockExternalAction(label) {
    if (!session.active) return false;
    if (typeof globalScope.toast === 'function') {
      globalScope.toast(`${label || 'This external action'} is disabled while Admin Test Mode is active.`, 'warning');
    }
    return true;
  }

  function renderBanner() {
    if (!globalScope.document) return;
    let banner = globalScope.document.getElementById('adminTestModeBanner');
    if (!banner) {
      banner = globalScope.document.createElement('div');
      banner.id = 'adminTestModeBanner';
      banner.className = 'admin-test-mode-banner no-print';
      banner.innerHTML = `<strong>ADMIN TEST MODE — NOT SAVED</strong><span>All data is fictional and exists only in memory.</span><button type="button" class="adm-btn adm-btn--ghost adm-btn--sm">Exit Test Mode</button>`;
      banner.querySelector('button').addEventListener('click', () => showExitConfirmation());
      globalScope.document.body.appendChild(banner);
    }
    globalScope.document.body.classList.add('admin-test-mode');
  }

  function removeBanner() {
    if (!globalScope.document) return;
    globalScope.document.body.classList.remove('admin-test-mode');
    globalScope.document.getElementById('adminTestModeBanner')?.remove();
  }

  function closeAdminPanel() {
    const panel = globalScope.document?.querySelector('.adm-panel');
    const closeButton = panel?.querySelector('.adm-btn--close');
    if (closeButton) closeButton.click();
  }

  async function startCompleteWorkspace() {
    if (session.active || session.starting) {
      if (typeof globalScope.toast === 'function') globalScope.toast('Admin Test Mode is already active.', 'info');
      return session.active;
    }
    session.starting = true;
    try {
      session.originalDb = globalScope.getActiveProfileDatabase();
      session.originalDbSnapshot = clone(session.originalDb);
      const navigation = typeof globalScope.getRuntimeNavigationState === 'function'
        ? globalScope.getRuntimeNavigationState()
        : { currentView: 'dashboard', recordTab: '1' };
      session.originalView = navigation.currentView;
      session.originalRecordTab = navigation.recordTab;
      const profileOverlay = globalScope.document?.getElementById('profileOverlay');
      session.originalProfileOverlayDisplay = profileOverlay?.style.display || '';

      const rootDb = typeof globalScope.getRootDatabase === 'function' ? globalScope.getRootDatabase() : null;
      if (rootDb?.activeProfileId && typeof globalScope.saveDatabase === 'function') {
        const saved = await globalScope.saveDatabase();
        if (!saved) throw new Error('The active profile could not be saved. Test mode was not started.');
      }
      restoreObjectSnapshot(session.originalDb, session.originalDbSnapshot);

      const mockDb = buildCompleteMockProfile();
      globalScope.replaceActiveProfileDatabase(mockDb);
      session.active = true;
      if (typeof globalScope.normalizeDatabase === 'function') globalScope.normalizeDatabase();
      globalScope.replaceRuntimeNavigationState({ currentView: 'dashboard', recordTab: '1' });
      if (profileOverlay) profileOverlay.style.display = 'none';
      if (typeof globalScope.disconnectBleDevice === 'function') globalScope.disconnectBleDevice();
      renderBanner();
      closeAdminPanel();
      if (typeof globalScope.render === 'function') globalScope.render();
      noteSuppressedSave();
      if (typeof globalScope.toast === 'function') globalScope.toast('Complete mock workspace loaded. Nothing in this session will be saved.', 'success');
      return true;
    } catch (error) {
      if (session.originalDb) {
        restoreObjectSnapshot(session.originalDb, session.originalDbSnapshot);
        globalScope.replaceActiveProfileDatabase(session.originalDb);
        globalScope.replaceRuntimeNavigationState({
          currentView: session.originalView,
          recordTab: session.originalRecordTab
        });
        const profileOverlay = globalScope.document?.getElementById('profileOverlay');
        if (profileOverlay) profileOverlay.style.display = session.originalProfileOverlayDisplay;
        if (typeof globalScope.render === 'function') globalScope.render();
        restoreObjectSnapshot(session.originalDb, session.originalDbSnapshot);
      }
      session.active = false;
      session.originalDb = null;
      session.originalDbSnapshot = null;
      removeBanner();
      if (typeof globalScope.toast === 'function') globalScope.toast(error.message || 'Admin Test Mode could not start.', 'error');
      return false;
    } finally {
      session.starting = false;
    }
  }

  function exitTestMode({ renderAfter = true } = {}) {
    if (!session.active) return false;
    const originalDb = session.originalDb;
    const originalDbSnapshot = session.originalDbSnapshot;
    restoreObjectSnapshot(originalDb, originalDbSnapshot);
    globalScope.replaceActiveProfileDatabase(originalDb);
    globalScope.replaceRuntimeNavigationState({ currentView: session.originalView, recordTab: session.originalRecordTab });
    const profileOverlay = globalScope.document?.getElementById('profileOverlay');
    if (profileOverlay) profileOverlay.style.display = session.originalProfileOverlayDisplay;
    session.active = false;
    removeBanner();
    if (renderAfter && typeof globalScope.render === 'function') globalScope.render();
    restoreObjectSnapshot(originalDb, originalDbSnapshot);
    session.originalDb = null;
    session.originalDbSnapshot = null;
    if (typeof globalScope.toast === 'function') globalScope.toast('Admin Test Mode ended. All mock changes were discarded.', 'info');
    return true;
  }

  function showConfirmation({ title, message, confirmLabel, onConfirm }) {
    const documentRef = globalScope.document;
    if (!documentRef) return;
    documentRef.getElementById('adminTestModeConfirm')?.remove();
    const overlay = documentRef.createElement('div');
    overlay.id = 'adminTestModeConfirm';
    overlay.className = 'adm-overlay admin-test-confirm-overlay';
    overlay.innerHTML = `
      <div class="adm-auth-box" role="dialog" aria-modal="true" aria-labelledby="adminTestConfirmTitle">
        <div class="adm-auth-logo" aria-hidden="true">🧪</div>
        <div class="adm-auth-title" id="adminTestConfirmTitle"></div>
        <div class="adm-auth-sub"></div>
        <div style="display:flex;gap:10px;width:100%;margin-top:8px;">
          <button type="button" class="adm-btn adm-btn--ghost" data-cancel>Cancel</button>
          <button type="button" class="adm-btn adm-btn--primary" data-confirm></button>
        </div>
      </div>`;
    overlay.querySelector('.adm-auth-title').textContent = title;
    overlay.querySelector('.adm-auth-sub').textContent = message;
    overlay.querySelector('[data-confirm]').textContent = confirmLabel;
    const close = () => overlay.remove();
    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    overlay.querySelector('[data-confirm]').addEventListener('click', async () => {
      overlay.querySelector('[data-confirm]').disabled = true;
      await onConfirm();
      close();
    });
    documentRef.body.appendChild(overlay);
  }

  function showStartConfirmation() {
    showConfirmation({
      title: 'Start Complete Mock Workspace?',
      message: 'The real profile will be saved first, then replaced on screen by fictional test data. Test changes will never be auto-saved and will be discarded when test mode ends.',
      confirmLabel: 'Start Test Mode',
      onConfirm: startCompleteWorkspace
    });
  }

  function showExitConfirmation() {
    showConfirmation({
      title: 'Exit Admin Test Mode?',
      message: 'Every change made to the mock workspace will be discarded and the previous real workspace will be restored.',
      confirmLabel: 'Discard Mock Changes',
      onConfirm: async () => exitTestMode()
    });
  }

  function renderTestingPane(panel) {
    const body = panel.querySelector('.adm-panel-body');
    if (!body) return;
    panel.querySelectorAll('.adm-tab').forEach(tab => tab.classList.remove('adm-tab--active'));
    panel.querySelector('[data-admin-testing-tab]')?.classList.add('adm-tab--active');
    body.innerHTML = `
      <div class="admin-testing-pane">
        <div class="admin-testing-pane__icon" aria-hidden="true">🧪</div>
        <h2>Temporary Mock Test Workspace</h2>
        <p>Load a complete fictional workspace for testing teaching loads, Senior High subjects, assessment scores, attendance, Advisory Class, grade sources, imports, teacher notes, and adviser editing permissions.</p>
        <div class="admin-testing-safety-list">
          <div><strong>Memory only</strong><span>No profile, database, encryption payload, or backup is updated.</span></div>
          <div><strong>Clearly marked exports</strong><span>Files and printed pages are labeled TEST DATA.</span></div>
          <div><strong>Safe restoration</strong><span>Exit Test Mode returns to the exact previous workspace.</span></div>
        </div>
        <button type="button" class="adm-btn adm-btn--primary admin-testing-start" ${session.active ? 'disabled' : ''}>${session.active ? 'Test Mode Is Active' : 'Start Complete Mock Workspace'}</button>
      </div>`;
    body.querySelector('.admin-testing-start')?.addEventListener('click', showStartConfirmation);
  }

  function installTestingTab(panel) {
    if (!panel || panel.querySelector('[data-admin-testing-tab]')) return;
    const tabs = panel.querySelector('.adm-tabs');
    if (!tabs) return;
    const button = globalScope.document.createElement('button');
    button.type = 'button';
    button.className = 'adm-tab';
    button.dataset.adminTestingTab = 'true';
    button.textContent = 'Testing';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      renderTestingPane(panel);
    });
    tabs.appendChild(button);
  }

  function handleAdminShortcut(event) {
    const isSpace = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
    if (!event.ctrlKey || !event.altKey || !event.shiftKey || !isSpace || event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    if (globalScope.document.querySelector('.adm-overlay, .adm-panel')) return;

    // Preserve the Admin module's private authentication flow. Its existing
    // five-click footer trigger opens the credential prompt; this shortcut
    // simply invokes that trigger and never handles credentials itself.
    const authenticatedAdminTrigger = globalScope.document.getElementById('sidebarBrandIcon');
    if (!authenticatedAdminTrigger) return;
    for (let click = 0; click < 5; click += 1) {
      authenticatedAdminTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }

  function initializeBrowserRuntime() {
    if (!globalScope.document || session.observer) return;
    const scan = () => globalScope.document.querySelectorAll('.adm-panel').forEach(installTestingTab);
    session.observer = new MutationObserver(scan);
    session.observer.observe(globalScope.document.documentElement, { childList: true, subtree: true });
    scan();
    globalScope.addEventListener('keydown', handleAdminShortcut, true);

    if (typeof globalScope.logoutProfile === 'function' && !globalScope.logoutProfile.__adminTestWrapped) {
      const originalLogout = globalScope.logoutProfile;
      const wrapped = async function adminTestAwareLogout() {
        if (session.active) exitTestMode({ renderAfter: false });
        return originalLogout.apply(this, arguments);
      };
      wrapped.__adminTestWrapped = true;
      globalScope.logoutProfile = wrapped;
    }
  }

  const api = {
    TEST_MARKER,
    TEST_FILENAME_PREFIX,
    buildCompleteMockProfile,
    isActive,
    shouldSuppressPersistence,
    noteSuppressedSave,
    markExportFilename,
    markCsvContent,
    blockExternalAction,
    startCompleteWorkspace,
    exitTestMode,
    initializeBrowserRuntime
  };

  globalScope.AdminTestMode = api;
  if (globalScope.document) {
    if (globalScope.document.readyState === 'loading') {
      globalScope.document.addEventListener('DOMContentLoaded', initializeBrowserRuntime, { once: true });
    } else {
      initializeBrowserRuntime();
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
