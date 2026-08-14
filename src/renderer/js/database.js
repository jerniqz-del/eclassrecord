/**
 * E-Class Record — Local Database Management Script
 *
 * Coordinates reading and writing of teacher assignments, settings,
 * scores, and configuration through Electron IPC bridge.
 */

const DB_VERSION = 7;
const ROOT_DB_VERSION = 7;

function timestampNow() {
  return new Date().toISOString();
}

function normalizeVersion(value, currentVersion) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > currentVersion ? parsed : currentVersion;
}

function createEmptyRootDatabase() {
  return {
    version: ROOT_DB_VERSION,
    lastUpdatedAt: '',
    profiles: [],
    activeProfileId: ''
  };
}

function normalizeProfileRecord(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (profile.pinEnabled === undefined) profile.pinEnabled = false;
  if (profile.secondaryBackupPath === undefined) profile.secondaryBackupPath = '';
  const normalizedRecoveryId = BackupRecoveryId.normalizeBackupRecoveryId(profile.backupRecoveryId);
  profile.backupRecoveryId = normalizedRecoveryId || '';
  profile.backupRecoveryIdHistory = Array.from(new Set(
    (Array.isArray(profile.backupRecoveryIdHistory) ? profile.backupRecoveryIdHistory : [])
      .map(value => BackupRecoveryId.normalizeBackupRecoveryId(value))
      .filter(Boolean)
  )).filter(value => value !== profile.backupRecoveryId);
  if (!profile.sharedFolderSync || typeof profile.sharedFolderSync !== 'object') {
    profile.sharedFolderSync = {
      enabled: false,
      baseRevisionId: '',
      ownRevisionId: '',
      integratedRevisionIds: [],
      lastPublishedDigest: '',
      lastFolderWriteAt: '',
      lastCheckedAt: '',
      lastError: ''
    };
  }
  if (!Array.isArray(profile.sharedFolderSync.integratedRevisionIds)) {
    profile.sharedFolderSync.integratedRevisionIds = [];
  }
  if (profile.createdAt === undefined) profile.createdAt = profile.lastUpdatedAt || '';
  if (profile.lastUpdatedAt === undefined) profile.lastUpdatedAt = profile.createdAt || '';
  if (profile.recovery === undefined) profile.recovery = null;
  return profile;
}

function profileHasRecoveryIdUsage(profile) {
  const sync = profile?.sharedFolderSync || {};
  return Boolean(
    String(profile?.secondaryBackupPath || '').trim()
    || String(profile?.data?.secondaryBackupPath || '').trim()
    || String(profile?.data?.sharedSyncKey || '').trim()
    || sync.enabled
    || sync.baseRevisionId
    || sync.ownRevisionId
    || (Array.isArray(sync.integratedRevisionIds) && sync.integratedRevisionIds.length)
    || sync.lastPublishedDigest
    || sync.lastFolderWriteAt
  );
}

function migrateUnusedRecoveryIds(root, sourceVersion) {
  if (Number(sourceVersion) >= 7 || !Array.isArray(root?.profiles)) return false;
  let changed = false;
  for (const profile of root.profiles) {
    const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(profile.backupRecoveryId);
    if (!recoveryId || profileHasRecoveryIdUsage(profile)) continue;
    profile.backupRecoveryIdHistory = Array.from(new Set([
      ...(Array.isArray(profile.backupRecoveryIdHistory) ? profile.backupRecoveryIdHistory : []),
      recoveryId
    ]));
    profile.backupRecoveryId = '';
    changed = true;
  }
  return changed;
}

function rootIntegrityPayload(root) {
  const payload = JSON.parse(JSON.stringify(root || {}));
  delete payload.integrity;
  return payload;
}

async function verifyRootDatabaseIntegrity(root) {
  if (!root || typeof root !== 'object' || !Array.isArray(root.profiles)) return { valid: true, legacy: true };
  return verifyIntegrityDescriptor(rootIntegrityPayload(root), root.integrity);
}

async function updateRootDatabaseIntegrity(root) {
  root.integrity = await createIntegrityDescriptor(rootIntegrityPayload(root));
  lastRootIntegrityStatus = { valid: true, legacy: false, generated: true };
  return root.integrity;
}

function normalizeRootDatabase(root) {
  const nextRoot = root && typeof root === 'object' ? root : createEmptyRootDatabase();
  const sourceVersion = Number(nextRoot.version) || 0;
  nextRoot.version = normalizeVersion(nextRoot.version, ROOT_DB_VERSION);
  if (!Array.isArray(nextRoot.profiles)) nextRoot.profiles = [];
  nextRoot.profiles = nextRoot.profiles.map(normalizeProfileRecord).filter(Boolean);
  migrateUnusedRecoveryIds(nextRoot, sourceVersion);
  const recoveryIds = new Set();
  for (const profile of nextRoot.profiles) {
    if (!profile.backupRecoveryId) continue;
    while (recoveryIds.has(profile.backupRecoveryId)) {
      profile.backupRecoveryId = BackupRecoveryId.generateBackupRecoveryId();
    }
    recoveryIds.add(profile.backupRecoveryId);
  }
  if (typeof nextRoot.activeProfileId !== 'string') nextRoot.activeProfileId = '';
  if (nextRoot.activeProfileId && !nextRoot.profiles.some(p => p.id === nextRoot.activeProfileId)) {
    nextRoot.activeProfileId = '';
  }
  if (nextRoot.lastUpdatedAt === undefined) {
    nextRoot.lastUpdatedAt = nextRoot.profiles.reduce((latest, profile) => {
      return profile.lastUpdatedAt && profile.lastUpdatedAt > latest ? profile.lastUpdatedAt : latest;
    }, '');
  }
  return nextRoot;
}

// Entire database loaded from file
let dbRoot = createEmptyRootDatabase();

// Global reference for legacy data to migrate
let legacyDataToMigrate = null;
let currentProfilePin = '';
let sessionActive = false;
let lastRootIntegrityStatus = { valid: true, legacy: true };

// In-memory application state copy (active profile)
let db = {
  version: DB_VERSION,
  lastUpdatedAt: '',
  teacherName: '',
  schoolName: '',
  schoolYear: '2026-2027',
  currentAssignmentId: '',
  currentTerm: '1',
  activeView: 'dashboard',
  autoBlur: false,
  assignments: [],
  advisory: createAdvisoryStore(),
  workplace: typeof DashboardWorkplace !== 'undefined' ? DashboardWorkplace.createStore() : { version: 1, tasks: [], preferences: { collapsedPanels: [] }, lastContext: { assignmentId: '', term: '1', action: 'grading' } }
};

// Feature modules run in their own closures, while the legacy active profile
// is a top-level lexical binding. Expose a read accessor instead of copying db
// onto window, which could become stale whenever profile loading replaces it.
function getActiveProfileDatabase() {
  return db;
}

function replaceActiveProfileDatabase(nextDatabase) {
  if (!nextDatabase || typeof nextDatabase !== 'object' || Array.isArray(nextDatabase)) {
    throw new TypeError('An active profile database object is required.');
  }
  db = nextDatabase;
  return db;
}

function getRootDatabase() {
  return dbRoot;
}

function replaceRootDatabase(nextRoot) {
  dbRoot = nextRoot;
  return dbRoot;
}

function getCurrentProfilePin() {
  return currentProfilePin;
}

async function replaceActiveProfilePin(nextPin) {
  const pin = String(nextPin || '');
  if (!/^\d{6}$/.test(pin)) throw new Error('A valid six-digit profile PIN is required.');
  const profile = dbRoot.profiles.find(item => item.id === dbRoot.activeProfileId);
  if (!profile) throw new Error('No active profile is available.');
  profile.pinEnabled = true;
  profile.salt = generateSalt();
  profile.pinHash = await hashPin(pin, profile.salt);
  currentProfilePin = pin;
  return true;
}

function getRootIntegrityStatus() {
  return { ...lastRootIntegrityStatus };
}

let currentView = 'dashboard';
let recordTab = '1';
let importMode = '';

function getRuntimeNavigationState() {
  return { currentView, recordTab };
}

function replaceRuntimeNavigationState(nextState = {}) {
  currentView = typeof nextState.currentView === 'string' ? nextState.currentView : 'dashboard';
  recordTab = typeof nextState.recordTab === 'string' ? nextState.recordTab : '1';
  return getRuntimeNavigationState();
}

/**
 * Ensures structure compatibility across version updates.
 */
function normalizeDatabase() {
  db.version = normalizeVersion(db.version, DB_VERSION);
  if (db.lastUpdatedAt === undefined) db.lastUpdatedAt = '';
  if (!db.assignments) db.assignments = [];
  if (!db.activeView) db.activeView = 'dashboard';
  if (!db.currentTerm) db.currentTerm = '1';
  if (db.schoolId === undefined) db.schoolId = '';
  if (db.region === undefined) db.region = '';
  if (db.division === undefined) db.division = '';
  if (db.district === undefined) db.district = '';
  if (db.autoBlur === undefined) db.autoBlur = false;
  normalizeAdvisoryData(db);
  if (typeof DashboardWorkplace !== 'undefined') DashboardWorkplace.normalize(db);
  if (typeof ToolsData !== 'undefined') ToolsData.normalize(db);
  
  for (let i = 0; i < db.assignments.length; i++) {
    const a = db.assignments[i];
    
    // Normalize split MAPEH subjects into single MAPEH subject
    if (a.subject === 'Music and Arts') {
      if (a.assessments) {
        a.assessments.forEach(ast => {
          if (!ast.mapePart) ast.mapePart = 'music_arts';
        });
      }
      a.subject = 'MAPEH';
    } else if (a.subject === 'Physical Education and Health (PE & Health)') {
      if (a.assessments) {
        a.assessments.forEach(ast => {
          if (!ast.mapePart) ast.mapePart = 'pe_health';
        });
      }
      a.subject = 'MAPEH';
    } else if (isMapehSubject(a.subject) && a.subject !== 'MAPEH') {
      if (a.assessments) {
        a.assessments.forEach(ast => {
          if (!ast.mapePart) ast.mapePart = 'music_arts';
        });
      }
      a.subject = 'MAPEH';
    }
    
    // Legacy migration to default schoolYear
    if (!a.schoolYear) {
      a.schoolYear = db.schoolYear || '2026-2027';
    }
    if (!Number.isFinite(Number(a.dashboardOrder))) {
      a.dashboardOrder = i;
    }

    // Automatically set policy and subjectGroup based on grade, subject, and school year
    a.policy = determinePolicy(a.gradeLevel, a.subject, a.schoolYear);
    a.subjectGroup = determineSubjectGroup(a.gradeLevel, a.subject, a.policy, a.shsSubjectGroup || a.subjectGroup);
    if (parseInt(a.gradeLevel) >= 11) a.shsSubjectGroup = a.subjectGroup;
    else delete a.shsSubjectGroup;
    const isCustomSubject = !getSubjectsForGrade(a.gradeLevel).includes(a.subject);
    a.isSpecialProgramSubject = isCustomSubject && a.isSpecialProgramSubject === true;
    if (a.isSpecialProgramSubject) {
      const custom = normalizeSpecialProgramWeights(a.specialProgramWeights);
      a.specialProgramWeights = custom || weightsFor(a.subjectGroup);
    } else {
      delete a.specialProgramWeights;
    }

    if (!a.assessments) a.assessments = [];
    if (!a.scores) a.scores = {};
    if (!Array.isArray(a.scoreHistory)) a.scoreHistory = [];
    if (!Array.isArray(a.learners)) a.learners = [];
    a.learners = a.learners.filter(learner => learner && typeof learner === 'object').map(learner => {
      learner.birthdate = normalizeLearnerBirthdate(learner.birthdate ?? learner.birthDate ?? learner.dateOfBirth);
      return learner;
    });
    
    normalizeAssessmentComponents(a);
    ensureTemplateAssessments(a);
  }
  if (typeof LearnerAvatars !== 'undefined') {
    LearnerAvatars.assignDatabase(db);
  }
}

function nextDashboardOrderForYear(schoolYear) {
  const activeYear = schoolYear || db.schoolYear || '2026-2027';
  const yearAssignments = (db.assignments || []).filter(a => a.schoolYear === activeYear);
  if (yearAssignments.length === 0) return 0;
  return Math.max(...yearAssignments.map(a => Number.isFinite(Number(a.dashboardOrder)) ? Number(a.dashboardOrder) : 0)) + 1;
}

/**
 * Asynchronously loads the JSON database via the Electron IPC API.
 */
async function loadDatabase() {
  try {
    const localData = await window.electronAPI.loadDatabase();
    if (localData) {
      if (localData.profiles && Array.isArray(localData.profiles)) {
        // This is a profile-based database
        lastRootIntegrityStatus = await verifyRootDatabaseIntegrity(localData);
        if (!lastRootIntegrityStatus.valid) {
          throw new Error(lastRootIntegrityStatus.unsupported
            ? 'The database uses an unsupported integrity format. No data was loaded or changed.'
            : 'The database integrity check failed. No data was loaded or changed. Restore a known-good backup.');
        }
        const sourceRootVersion = Number(localData.version) || 0;
        const needsRootMigration = sourceRootVersion < 7;
        const clearsUnusedRecoveryId = needsRootMigration
          && localData.profiles.some(profile => {
            const recoveryId = BackupRecoveryId.normalizeBackupRecoveryId(profile?.backupRecoveryId);
            return recoveryId && !profileHasRecoveryIdUsage(profile);
          });
        if (needsRootMigration && typeof window.electronAPI.createDatabaseRestorePoint === 'function') {
          await window.electronAPI.createDatabaseRestorePoint(
            clearsUnusedRecoveryId ? 'recovery-id-migration' : 'database-v7-migration'
          );
        }
        dbRoot = normalizeRootDatabase(localData);
        if (needsRootMigration) {
          await updateRootDatabaseIntegrity(dbRoot);
          const migrated = await window.electronAPI.saveDatabase(dbRoot);
          if (!migrated) throw new Error('The database version 7 migration could not be saved.');
        }
      } else if (localData.assignments || localData.teacherName) {
        // This is a legacy database (version 2)
        // Store legacy data for migration
        legacyDataToMigrate = localData;
        dbRoot = createEmptyRootDatabase();
      } else {
        // Brand new database file or empty object
        dbRoot = createEmptyRootDatabase();
      }
    } else {
      // No database exists yet
      dbRoot = createEmptyRootDatabase();
    }
  } catch (error) {
    console.error('Failed to load database:', error);
    toast('Could not load local database: ' + error.message, 'error');
  }
}

/**
 * Saves current application data to file via Electron IPC.
 */
async function saveDatabase() {
  if (typeof window !== 'undefined' && window.AdminTestMode?.shouldSuppressPersistence?.()) {
    return window.AdminTestMode.noteSuppressedSave();
  }
  if (Number(db.version) > DB_VERSION) {
    throw new Error('This profile was created by a newer app version and cannot be safely saved by this version.');
  }
  normalizeDatabase();
  updateProfile();
  db.activeView = currentView;
  db.recordTab = recordTab;
  db.version = normalizeVersion(db.version, DB_VERSION);
  db.lastUpdatedAt = timestampNow();
  
  if (dbRoot && dbRoot.activeProfileId) {
    const p = dbRoot.profiles.find(x => x.id === dbRoot.activeProfileId);
    if (p) {
      normalizeProfileRecord(p);
      p.secondaryBackupPath = db.secondaryBackupPath || '';
      if (p.pinEnabled) {
        if (!currentProfilePin) {
          console.error("Cannot save secure profile: missing PIN in session.");
          return;
        }
        if (typeof p.pinHash === 'string' && !p.pinHash.startsWith('pbkdf2-sha256$')) {
          p.salt = generateSalt();
          p.pinHash = await hashPin(currentProfilePin, p.salt);
        }
        const encryptedObj = await encryptPayload(JSON.stringify(db), currentProfilePin);
        p.data = encryptedObj;
      } else {
        p.data = db;
      }
      p.name = db.teacherName || p.name;
      p.lastUpdatedAt = db.lastUpdatedAt;
    }
  }
  
  const saved = await saveRootDatabase();
  if (saved && typeof window !== 'undefined') {
    window.UsageAnalytics?.scheduleProfileSummary?.(db);
    window.SharedFolderSync?.schedulePublish?.();
  }
  return saved;
}

/**
 * Saves the entire multi-profile root database to file via Electron IPC.
 */
async function saveRootDatabase() {
  if (typeof window !== 'undefined' && window.AdminTestMode?.shouldSuppressPersistence?.()) {
    return window.AdminTestMode.noteSuppressedSave();
  }
  try {
    dbRoot = normalizeRootDatabase(dbRoot);
    if (Number(dbRoot.version) > ROOT_DB_VERSION) {
      throw new Error('This database was created by a newer app version and cannot be safely overwritten by this version.');
    }
    dbRoot.lastUpdatedAt = timestampNow();
    await updateRootDatabaseIntegrity(dbRoot);
    const success = await window.electronAPI.saveDatabase(dbRoot);
    if (success) {
      setStatus('Saved locally at ' + new Date().toLocaleTimeString());
      showAutoSaveIndicator();
      return true;
    }
    throw new Error('The local database file could not be written.');
  } catch (error) {
    console.error('Failed to save database:', error);
    toast('Could not save data: ' + error.message, 'error');
    return false;
  }
}

/**
 * Triggers the UI fade-in/fade-out animation for the auto-save indicator.
 */
function showAutoSaveIndicator() {
  const el = document.getElementById('autoSaveIndicator');
  if (!el) return;

  el.classList.add('show');

  if (window.autoSaveTimeout) {
    clearTimeout(window.autoSaveTimeout);
  }

  window.autoSaveTimeout = setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

/**
 * Updates status text in the bottom header bar.
 */
function setStatus(message) {
  const el = document.getElementById('saveStatus');
  if (el) {
    el.innerHTML = message
      ? `<span class="save-pill"><span class="save-pill__dot"></span>${esc(message)}</span>`
      : '';
  }
}

/**
 * Gets currently selected class teaching load.
 */
function currentAssignment() {
  const activeYear = db.schoolYear || '2026-2027';
  const filtered = db.assignments.filter(a => a.schoolYear === activeYear);

  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i].id === db.currentAssignmentId) {
      return filtered[i];
    }
  }
  if (filtered.length > 0) {
    db.currentAssignmentId = filtered[0].id;
    return filtered[0];
  }
  return null;
}

/**
 * Creates and registers a new class teaching load.
 */
function addAssignment() {
  const gradeLevel = document.getElementById('newGrade').value;
  const section = trim(document.getElementById('newSection').value);
  let subject = trim(document.getElementById('newSubject').value);
  const classSchoolYear = (document.getElementById('newClassSchoolYear') && document.getElementById('newClassSchoolYear').value) || db.schoolYear || '2026-2027';

  const isCustomSubject = subject === 'Custom';
  if (isCustomSubject) {
    subject = trim(document.getElementById('customSubjectInput').value);
  }

  if (!section || !subject) {
    toast('Section and subject fields are required.', 'warning');
    return;
  }

  const policy = determinePolicy(gradeLevel, subject, classSchoolYear);
  const shsSubjectGroup = parseInt(gradeLevel) >= 11
    ? normalizeSeniorHighSubjectGroup(document.getElementById('newSeniorHighSubjectGroup')?.value)
    : '';
  const subjectGroup = determineSubjectGroup(gradeLevel, subject, policy, shsSubjectGroup);
  const isSpecialProgramSubject = parseInt(gradeLevel) < 11 && isCustomSubject && document.getElementById('newSpecialProgramSubject')?.checked === true;
  const specialProgramWeights = isSpecialProgramSubject ? [
    Number(document.getElementById('newSpecialWwWeight')?.value),
    Number(document.getElementById('newSpecialPtWeight')?.value),
    Number(document.getElementById('newSpecialExamWeight')?.value)
  ] : null;
  if (isSpecialProgramSubject && !normalizeSpecialProgramWeights(specialProgramWeights)) {
    toast('Special-program weights must be whole numbers from 0 to 100 and total exactly 100%.', 'warning');
    return;
  }

  const assignment = {
    id: uid('class'),
    gradeLevel,
    section,
    subject,
    subjectGroup,
    ...(shsSubjectGroup ? { shsSubjectGroup } : {}),
    isSpecialProgramSubject,
    ...(isSpecialProgramSubject ? { specialProgramWeights } : {}),
    policy,
    schoolYear: classSchoolYear,
    dashboardOrder: nextDashboardOrderForYear(classSchoolYear),
    learners: [],
    assessments: [],
    scores: {}
  };

  seedTemplateAssessments(assignment, templateForGrade(gradeLevel));
  const populatedWithMockData = window.AdminTestMode?.populateNewAssignment?.(assignment) === true;

  db.assignments.push(assignment);
  db.currentAssignmentId = assignment.id;
  db.schoolYear = classSchoolYear;

  const headerYearEl = document.getElementById('schoolYear');
  if (headerYearEl) {
    headerYearEl.value = classSchoolYear;
  }
  
  // Clean inputs
  document.getElementById('newSection').value = '';
  const customSubInput = document.getElementById('customSubjectInput');
  if (customSubInput) customSubInput.value = '';
  const specialCheckbox = document.getElementById('newSpecialProgramSubject');
  if (specialCheckbox) specialCheckbox.checked = false;
  if (typeof syncNewSpecialProgramWeights === 'function') syncNewSpecialProgramWeights();

  saveDatabase();
  render();
  if (typeof hideAddClassLoadModal === 'function') {
    hideAddClassLoadModal();
  }
  toast(populatedWithMockData
    ? 'Class load added with temporary mock learners, grades, and attendance.'
    : 'Class load added successfully.', 'success');
}

/**
 * Selects a load from the sidebar listing.
 */
function selectAssignment(id) {
  db.currentAssignmentId = id;
  saveDatabase();
  if (typeof setView === 'function') {
    const targetView = (currentView === 'classes') ? 'classes' : 'record';
    setView(targetView);
  }
  render();
}

/**
 * Deletes current load after modal validation.
 */
function removeCurrentAssignment() {
  const a = currentAssignment();
  if (!a) return;

  confirmModal(
    'Delete Teaching Load',
    `Are you sure you want to delete Grade ${a.gradeLevel} - ${a.section} (${a.subject})? All student entries and marks will be permanently lost.`,
    () => {
      db.assignments = db.assignments.filter(item => item.id !== a.id);
      db.currentAssignmentId = db.assignments.length > 0 ? db.assignments[0].id : '';
      saveDatabase();
      render();
      toast('Teaching load deleted.', 'success');
    }
  );
}

/**
 * Fetches input values and updates global profile properties.
 */
function updateProfile() {
  const teacherEl = document.getElementById('teacherName');
  const schoolEl = document.getElementById('schoolName');
  const schoolIdEl = document.getElementById('schoolId');
  const regionEl = document.getElementById('schoolRegion');
  const divisionEl = document.getElementById('schoolDivision');
  const districtEl = document.getElementById('schoolDistrict');
  const yearEl = document.getElementById('schoolYear');
  
  if (teacherEl) db.teacherName = teacherEl.value;
  if (schoolEl) db.schoolName = schoolEl.value;
  if (schoolIdEl) db.schoolId = schoolIdEl.value;
  if (regionEl) db.region = regionEl.value;
  if (divisionEl) db.division = divisionEl.value;
  if (districtEl) db.district = districtEl.value;
  if (yearEl) db.schoolYear = yearEl.value;
  if (typeof updateSidebarUserName === 'function') updateSidebarUserName();
}

function syncDistrictProfileField() {
  const districtEl = document.getElementById('schoolDistrict');
  if (districtEl) districtEl.value = db.district || '';
}

/**
 * Triggers native folder selector and updates the secondary auto-backup directory path.
 */
/**
 * Displays a PIN input modal to verify the user's identity before sensitive actions.
 * @param {function} onSuccess Callback function executed on successful verification.
 */
function promptPinVerification(onSuccess) {
  const activeProfile = dbRoot.profiles.find(p => p.id === dbRoot.activeProfileId);
  if (!activeProfile || !activeProfile.pinEnabled) {
    onSuccess();
    return;
  }

  document.querySelector('[data-pin-verification-modal]')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-z-pin';
  overlay.dataset.pinVerificationModal = 'true';
  overlay.style.zIndex = '13000';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__title">Confirm PIN Code</div>
      <div class="modal__body">
        <p style="margin-top:0">Please enter your 6-digit PIN to authorize this sensitive action.</p>
        <div class="field">
          <label class="field-label">Enter PIN</label>
          <input type="password" id="actionVerifyPin" class="field-input" placeholder="••••••" maxlength="6" inputmode="numeric" autocomplete="off" />
        </div>
        <div id="actionVerifyPinErrorMsg" class="unlock-error-msg" style="color:var(--color-error-600)"></div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-cancel btn-sm" id="btnCancelActionVerify">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnConfirmActionVerify">Verify & Proceed</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  
  const pinInput = overlay.querySelector('#actionVerifyPin');
  const errorEl = overlay.querySelector('#actionVerifyPinErrorMsg');
  pinInput.disabled = false;
  pinInput.readOnly = false;
  
  const submit = async () => {
    const pin = pinInput.value;
    if (!pin || pin.length < 6 || !/^\d+$/.test(pin)) {
      errorEl.innerText = 'Please enter your 6-digit numeric PIN.';
      pinInput.focus();
      return;
    }
    const verified = await verifyPin(pin, activeProfile.salt, activeProfile.pinHash);
    if (verified) {
      close();
      onSuccess();
    } else {
      errorEl.innerText = 'Incorrect PIN. Verification failed.';
      pinInput.value = '';
      pinInput.focus();
    }
  };
  
  overlay.querySelector('#btnCancelActionVerify').addEventListener('click', close);
  overlay.querySelector('#btnConfirmActionVerify').addEventListener('click', submit);
  pinInput.addEventListener('input', () => {
    const numeric = pinInput.value.replace(/\D/g, '').slice(0, 6);
    if (pinInput.value !== numeric) pinInput.value = numeric;
    errorEl.innerText = '';
  });
  pinInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  const focusPin = () => {
    if (!overlay.isConnected) return;
    pinInput.focus({ preventScroll: true });
  };
  focusPin();
  requestAnimationFrame(focusPin);
  setTimeout(focusPin, 80);
}

async function selectSecondaryBackupFolder() {
  promptPinVerification(async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        db.secondaryBackupPath = folderPath;
        await saveDatabase();
        render();
        toast('Secondary auto-backup directory configured successfully.', 'success');
      }
    } catch (error) {
      console.error('Failed to select secondary backup folder:', error);
      toast('Could not configure backup folder: ' + error.message, 'error');
    }
  });
}

/**
 * Resets secondary auto-backup directory configuration.
 */
async function clearSecondaryBackupFolder() {
  promptPinVerification(async () => {
    db.secondaryBackupPath = '';
    await saveDatabase();
    render();
    toast('Secondary auto-backup directory cleared.', 'info');
  });
}

/**
 * Erases local state database completely after confirmation.
 */
function clearLocalData() {
  promptPinVerification(() => {
    confirmModal(
      'Clear All App Data',
      'This will permanently delete all profiles, classes, learners, and grades from this computer. Ensure you have exported a backup JSON if you need to retain this information.',
      async () => {
        dbRoot = {
          version: ROOT_DB_VERSION,
          lastUpdatedAt: timestampNow(),
          profiles: [],
          activeProfileId: ''
        };
        db = {
          version: DB_VERSION,
          lastUpdatedAt: timestampNow(),
          teacherName: '',
          schoolName: '',
          schoolId: '',
          region: '',
          division: '',
          district: '',
          schoolYear: '2026-2027',
          currentAssignmentId: '',
          currentTerm: '1',
          activeView: 'dashboard',
          autoBlur: false,
          assignments: [],
          advisory: createAdvisoryStore(),
          workplace: typeof DashboardWorkplace !== 'undefined' ? DashboardWorkplace.createStore() : { version: 1, tasks: [], preferences: { collapsedPanels: [] }, lastContext: { assignmentId: '', term: '1', action: 'grading' } }
        };
        currentProfilePin = '';
        currentView = 'dashboard';
        recordTab = '1';
        
        await saveRootDatabase();
        
        // Force return to profile screen
        showEl('profileOverlay', true, 'flex');
        showCreateProfileForm();
        
        toast('All database contents and profiles cleared.', 'success');
      }
    );
  });
}

/**
 * Opens an edit modal for an existing teaching load assignment.
 * @param {string} id Assignment ID to edit.
 */
function editAssignmentModal(id) {
  const a = db.assignments.find(x => x.id === id);
  if (!a) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--wide">
      <div class="modal__title">Edit Teaching Load</div>
      <div class="modal__body">
        <div class="split-row">
          <div class="field">
            <label class="field-label">Grade Level</label>
            <select id="editGrade" class="field-input">
              ${[1,2,3,4,5,6,7,8,9,10,11,12].map(g =>
                `<option value="${g}" ${String(g) === String(a.gradeLevel) ? 'selected' : ''}>${g}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field-label">Section</label>
            <input id="editSection" class="field-input" value="${esc(a.section)}" placeholder="Section name" />
          </div>
          <div class="field">
            <label class="field-label">School Year</label>
            <select id="editSchoolYear" class="field-input">
              ${[
                '2025-2026', '2026-2027', '2027-2028',
                '2028-2029', '2029-2030', '2030-2031', '2031-2032',
                '2032-2033', '2033-2034', '2034-2035', '2035-2036'
              ].map(sy =>
                `<option value="${sy}" ${sy === (a.schoolYear || db.schoolYear || '2026-2027') ? 'selected' : ''}>${sy}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Subject</label>
          <select id="editSubject" class="field-input"></select>
        </div>
        <div id="editSeniorHighSubjectGroupField" class="field" hidden>
          <label class="field-label" for="editSeniorHighSubjectGroup">Senior High Subject Type</label>
          <select id="editSeniorHighSubjectGroup" class="field-input">
            ${seniorHighSubjectGroupOptions().map(group => `<option value="${group.value}">${esc(group.label)} — ${group.weights[0]}% Written, ${group.weights[1]}% Performance, ${group.weights[2]}% Assessment</option>`).join('')}
          </select>
          <p class="text-muted u-mb-0">This category determines the official grading percentages.</p>
        </div>
        <div id="editCustomSubjectField" class="field" style="display:none">
          <label class="field-label">Custom Subject Name</label>
          <input id="editCustomSubjectInput" class="field-input" placeholder="e.g. Science Elective" />
        </div>
        <div id="editSpecialProgramSubjectField" class="special-program-weight-panel" hidden>
          <label class="checkbox-row"><input type="checkbox" id="editSpecialProgramSubject"> Treat this as a Special-Program Subject</label>
          <div id="editSpecialProgramWeights" hidden>
            <p class="text-muted u-mt-0">Set whole-number percentages totaling 100%. The Summative Tests and Term Examination category keeps its internal 30% / 30% / 40% split.</p>
            <div class="split-row">
              <div class="field"><label class="field-label">Written Works %</label><input class="field-input" id="editSpecialWwWeight" type="number" min="0" max="100" step="1"></div>
              <div class="field"><label class="field-label">Performance Tasks %</label><input class="field-input" id="editSpecialPtWeight" type="number" min="0" max="100" step="1"></div>
              <div class="field"><label class="field-label">Summative Tests &amp; Term Examination %</label><input class="field-input" id="editSpecialExamWeight" type="number" min="0" max="100" step="1"></div>
            </div>
            <div class="special-program-weight-total" id="editSpecialWeightTotal" aria-live="polite"></div>
          </div>
        </div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-cancel btn-sm" id="editModalCancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="editModalSave">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };

  const editGradeSelect = overlay.querySelector('#editGrade');
  const editSubjectSelect = overlay.querySelector('#editSubject');
  const editCustomField = overlay.querySelector('#editCustomSubjectField');
  const editCustomInput = overlay.querySelector('#editCustomSubjectInput');
  const editSeniorHighGroupField = overlay.querySelector('#editSeniorHighSubjectGroupField');
  const editSeniorHighGroupSelect = overlay.querySelector('#editSeniorHighSubjectGroup');
  const editSpecialField = overlay.querySelector('#editSpecialProgramSubjectField');
  const editSpecialCheckbox = overlay.querySelector('#editSpecialProgramSubject');
  const editSpecialWeights = overlay.querySelector('#editSpecialProgramWeights');
  const editWeightInputs = ['Ww', 'Pt', 'Exam'].map(part => overlay.querySelector(`#editSpecial${part}Weight`));
  const startingWeights = weightsForAssignment(a);
  editWeightInputs.forEach((input, index) => { input.value = String(startingWeights[index]); });
  editSpecialCheckbox.checked = a.isSpecialProgramSubject === true;

  const updateEditWeightTotal = () => {
    const values = editWeightInputs.map(input => Number(input.value));
    const total = values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : 0;
    const output = overlay.querySelector('#editSpecialWeightTotal');
    output.textContent = `Total: ${total}%${total === 100 ? '' : ' — must equal 100%'}`;
    output.classList.toggle('is-invalid', total !== 100);
  };

  const populateEditSubjects = () => {
    const grade = parseInt(editGradeSelect.value);
    const subjects = getSubjectsForGrade(grade);
    
    editSubjectSelect.innerHTML = '';
    subjects.forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub;
      opt.innerText = sub;
      editSubjectSelect.appendChild(opt);
    });
    
    const otherOpt = document.createElement('option');
    otherOpt.value = 'Custom';
    otherOpt.innerText = 'Other / Custom Subject…';
    editSubjectSelect.appendChild(otherOpt);
  };

  const handleEditSubjectChange = () => {
    const isCustom = editSubjectSelect.value === 'Custom';
    const isSeniorHigh = parseInt(editGradeSelect.value) >= 11;
    editCustomField.style.display = isCustom ? 'block' : 'none';
    editSeniorHighGroupField.hidden = !isSeniorHigh;
    editSpecialField.hidden = !isCustom || isSeniorHigh;
    if (!isCustom || isSeniorHigh) editSpecialCheckbox.checked = false;
    editSpecialWeights.hidden = !isCustom || isSeniorHigh || !editSpecialCheckbox.checked;
    if (isSeniorHigh && !isCustom) editSeniorHighGroupSelect.value = determineSubjectGroup(editGradeSelect.value, editSubjectSelect.value);
    updateEditWeightTotal();
  };

  editSubjectSelect.addEventListener('change', handleEditSubjectChange);
  editSpecialCheckbox.addEventListener('change', handleEditSubjectChange);
  editWeightInputs.forEach(input => input.addEventListener('input', updateEditWeightTotal));

  // Populate initial state
  populateEditSubjects();
  const subjectsForInitialGrade = getSubjectsForGrade(a.gradeLevel);
  if (subjectsForInitialGrade.includes(a.subject)) {
    editSubjectSelect.value = a.subject;
    editCustomField.style.display = 'none';
    editCustomInput.value = '';
  } else {
    editSubjectSelect.value = 'Custom';
    editCustomField.style.display = 'block';
    editCustomInput.value = a.subject;
  }
  handleEditSubjectChange();
  if (parseInt(a.gradeLevel) >= 11) {
    editSeniorHighGroupSelect.value = normalizeSeniorHighSubjectGroup(a.shsSubjectGroup || a.subjectGroup) || determineSubjectGroup(a.gradeLevel, a.subject);
  }

  editGradeSelect.addEventListener('change', () => {
    populateEditSubjects();
    handleEditSubjectChange();
  });

  overlay.querySelector('#editModalCancel').addEventListener('click', close);
  overlay.querySelector('#editModalSave').addEventListener('click', () => {
    const newSection = trim(overlay.querySelector('#editSection').value);
    const newSchoolYear = overlay.querySelector('#editSchoolYear').value;
    let newSubject = editSubjectSelect.value;
    if (newSubject === 'Custom') {
      newSubject = trim(editCustomInput.value);
    }
    if (!newSection || !newSubject) {
      toast('Section and subject cannot be empty.', 'warning');
      return;
    }
    const newGrade = editGradeSelect.value;
    const newPolicy = determinePolicy(newGrade, newSubject, newSchoolYear);
    const isCustom = editSubjectSelect.value === 'Custom';
    const shsSubjectGroup = parseInt(newGrade) >= 11 ? normalizeSeniorHighSubjectGroup(editSeniorHighGroupSelect.value) : '';
    const isSpecialProgramSubject = parseInt(newGrade) < 11 && isCustom && editSpecialCheckbox.checked;
    const specialProgramWeights = editWeightInputs.map(input => Number(input.value));
    if (isSpecialProgramSubject && !normalizeSpecialProgramWeights(specialProgramWeights)) {
      toast('Special-program weights must be whole numbers from 0 to 100 and total exactly 100%.', 'warning');
      editWeightInputs[0].focus();
      return;
    }
    const nextGroup = determineSubjectGroup(newGrade, newSubject, newPolicy, shsSubjectGroup);
    const nextWeights = isSpecialProgramSubject ? specialProgramWeights : weightsFor(nextGroup);
    const weightsChanged = JSON.stringify(weightsForAssignment(a)) !== JSON.stringify(nextWeights)
      || a.isSpecialProgramSubject !== isSpecialProgramSubject;
    const hasScores = a.scores && Object.values(a.scores).some(value => value !== '' && value !== null && value !== undefined);
    const commit = () => {
      a.gradeLevel = newGrade;
      a.section = newSection;
      a.subject = newSubject;
      a.schoolYear = newSchoolYear;
      a.policy = newPolicy;
      a.subjectGroup = nextGroup;
      if (shsSubjectGroup) a.shsSubjectGroup = shsSubjectGroup;
      else delete a.shsSubjectGroup;
      a.isSpecialProgramSubject = isSpecialProgramSubject;
      if (isSpecialProgramSubject) a.specialProgramWeights = specialProgramWeights;
      else delete a.specialProgramWeights;

      db.schoolYear = newSchoolYear;
      const headerYearEl = document.getElementById('schoolYear');
      if (headerYearEl) headerYearEl.value = newSchoolYear;
      ensureTemplateAssessments(a);
      close();
      saveDatabase();
      render();
      toast(weightsChanged ? 'Teaching load updated. Grades were recalculated from unchanged raw scores.' : 'Teaching load updated.', 'success');
    };
    if (hasScores && weightsChanged) {
      confirmModal('Recalculate Saved Grades?', 'Changing the grading percentages will recalculate term grades for every learner. Existing raw scores will not be changed.', commit);
    } else commit();
  });

  // Close on backdrop click
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  // Auto-focus section input
  setTimeout(() => overlay.querySelector('#editSection').focus(), 80);
}
