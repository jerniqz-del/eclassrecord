/**
 * E-Class Record — Local Database Management Script
 *
 * Coordinates reading and writing of teacher assignments, settings,
 * scores, and configuration through Electron IPC bridge.
 */

const DB_VERSION = 2;

// In-memory application state copy
let db = {
  version: DB_VERSION,
  teacherName: '',
  schoolName: '',
  schoolYear: '2026-2027',
  currentAssignmentId: '',
  currentTerm: '1',
  activeView: 'dashboard',
  assignments: []
};

let currentView = 'dashboard';
let recordTab = '1';
let importMode = '';

/**
 * Ensures structure compatibility across version updates.
 */
function normalizeDatabase() {
  if (!db.assignments) db.assignments = [];
  if (!db.activeView) db.activeView = 'dashboard';
  if (!db.currentTerm) db.currentTerm = '1';
  if (!db.version || db.version < DB_VERSION) db.version = DB_VERSION;
  
  for (let i = 0; i < db.assignments.length; i++) {
    const a = db.assignments[i];
    if (!a.subjectGroup) a.subjectGroup = 'CORE_20_50_30';
    if (!a.policy) a.policy = 'DO15_TRANSITION';
    if (!a.assessments) a.assessments = [];
    if (!a.scores) a.scores = {};
    
    normalizeAssessmentComponents(a);
    if (isKeyStage2(a) && a.assessments.length === 0) {
      seedKeyStage2Assessments(a);
    }
  }
}

/**
 * Asynchronously loads the JSON database via the Electron IPC API.
 */
async function loadDatabase() {
  try {
    const localData = await window.electronAPI.loadDatabase();
    if (localData) {
      db = localData;
      normalizeDatabase();
      currentView = db.activeView || 'dashboard';
      recordTab = db.recordTab || db.currentTerm || '1';
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
  updateProfile();
  db.activeView = currentView;
  db.recordTab = recordTab;
  
  try {
    const success = await window.electronAPI.saveDatabase(db);
    if (success) {
      setStatus('Saved locally at ' + new Date().toLocaleTimeString());
    }
  } catch (error) {
    console.error('Failed to save database:', error);
    toast('Could not save data: ' + error.message, 'error');
  }
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
  for (let i = 0; i < db.assignments.length; i++) {
    if (db.assignments[i].id === db.currentAssignmentId) {
      return db.assignments[i];
    }
  }
  if (db.assignments.length > 0) {
    db.currentAssignmentId = db.assignments[0].id;
    return db.assignments[0];
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
  const subjectGroup = document.getElementById('newSubjectGroup').value;
  const policy = document.getElementById('newPolicy').value;

  if (subject === 'Custom') {
    subject = trim(document.getElementById('customSubjectInput').value);
  }

  if (!section || !subject) {
    toast('Section and subject fields are required.', 'warning');
    return;
  }

  const assignment = {
    id: uid('class'),
    gradeLevel,
    section,
    subject,
    subjectGroup,
    policy,
    learners: [],
    assessments: [],
    scores: {}
  };

  if (isKeyStage2(assignment)) {
    assignment.policy = 'KEY_STAGE_2_TRIMESTER';
    seedKeyStage2Assessments(assignment);
  }

  db.assignments.push(assignment);
  db.currentAssignmentId = assignment.id;
  
  // Clean inputs
  document.getElementById('newSection').value = '';
  const customSubInput = document.getElementById('customSubjectInput');
  if (customSubInput) customSubInput.value = '';

  saveDatabase();
  render();
  toast('Class load added successfully.', 'success');
}

/**
 * Selects a load from the sidebar listing.
 */
function selectAssignment(id) {
  db.currentAssignmentId = id;
  saveDatabase();
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
  const yearEl = document.getElementById('schoolYear');
  
  if (teacherEl) db.teacherName = teacherEl.value;
  if (schoolEl) db.schoolName = schoolEl.value;
  if (yearEl) db.schoolYear = yearEl.value;
}

/**
 * Erases local state database completely after confirmation.
 */
function clearLocalData() {
  confirmModal(
    'Clear All App Data',
    'This will permanently delete all classes, learners, and grades from this computer. Ensure you have exported a backup JSON if you need to retain this information.',
    async () => {
      db = {
        version: DB_VERSION,
        teacherName: '',
        schoolName: '',
        schoolYear: '2026-2027',
        currentAssignmentId: '',
        currentTerm: '1',
        activeView: 'dashboard',
        assignments: []
      };
      currentView = 'dashboard';
      recordTab = '1';
      
      await saveDatabase();
      render();
      toast('All database contents cleared.', 'success');
    }
  );
}
