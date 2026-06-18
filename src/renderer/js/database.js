/**
 * E-Class Record — Local Database Management Script
 *
 * Coordinates reading and writing of teacher assignments, settings,
 * scores, and configuration through Electron IPC bridge.
 */

const DB_VERSION = 2;
const ROOT_DB_VERSION = 3;

// Entire database loaded from file
let dbRoot = {
  version: ROOT_DB_VERSION,
  profiles: [],
  activeProfileId: ''
};

// Global reference for legacy data to migrate
let legacyDataToMigrate = null;
let currentProfilePin = '';

// In-memory application state copy (active profile)
let db = {
  version: DB_VERSION,
  teacherName: '',
  schoolName: '',
  schoolYear: '2026-2027',
  currentAssignmentId: '',
  currentTerm: '1',
  activeView: 'dashboard',
  autoBlur: false,
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
  if (db.schoolId === undefined) db.schoolId = '';
  if (db.region === undefined) db.region = '';
  if (db.division === undefined) db.division = '';
  if (db.autoBlur === undefined) db.autoBlur = false;
  if (!db.version || db.version < DB_VERSION) db.version = DB_VERSION;
  
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

    // Automatically set policy and subjectGroup based on grade, subject, and school year
    a.policy = determinePolicy(a.gradeLevel, a.subject, a.schoolYear);
    a.subjectGroup = determineSubjectGroup(a.gradeLevel, a.subject, a.policy);

    if (!a.assessments) a.assessments = [];
    if (!a.scores) a.scores = {};
    
    normalizeAssessmentComponents(a);
    ensureTemplateAssessments(a);
  }
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
        dbRoot = localData;
        if (dbRoot.version < ROOT_DB_VERSION) {
          dbRoot.version = ROOT_DB_VERSION;
        }
      } else if (localData.assignments || localData.teacherName) {
        // This is a legacy database (version 2)
        // Store legacy data for migration
        legacyDataToMigrate = localData;
        dbRoot = {
          version: ROOT_DB_VERSION,
          profiles: [],
          activeProfileId: ''
        };
      } else {
        // Brand new database file or empty object
        dbRoot = {
          version: ROOT_DB_VERSION,
          profiles: [],
          activeProfileId: ''
        };
      }
    } else {
      // No database exists yet
      dbRoot = {
        version: ROOT_DB_VERSION,
        profiles: [],
        activeProfileId: ''
      };
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
  
  if (dbRoot && dbRoot.activeProfileId) {
    const p = dbRoot.profiles.find(x => x.id === dbRoot.activeProfileId);
    if (p) {
      p.data = db;
      p.name = db.teacherName || p.name;
    }
  }
  
  await saveRootDatabase();
}

/**
 * Saves the entire multi-profile root database to file via Electron IPC.
 */
async function saveRootDatabase() {
  try {
    const success = await window.electronAPI.saveDatabase(dbRoot);
    if (success) {
      setStatus('Saved locally at ' + new Date().toLocaleTimeString());
      showAutoSaveIndicator();
    }
  } catch (error) {
    console.error('Failed to save database:', error);
    toast('Could not save data: ' + error.message, 'error');
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

  if (subject === 'Custom') {
    subject = trim(document.getElementById('customSubjectInput').value);
  }

  if (!section || !subject) {
    toast('Section and subject fields are required.', 'warning');
    return;
  }

  const policy = determinePolicy(gradeLevel, subject, classSchoolYear);
  const subjectGroup = determineSubjectGroup(gradeLevel, subject, policy);

  const assignment = {
    id: uid('class'),
    gradeLevel,
    section,
    subject,
    subjectGroup,
    policy,
    schoolYear: classSchoolYear,
    learners: [],
    assessments: [],
    scores: {}
  };

  seedTemplateAssessments(assignment, templateForGrade(gradeLevel));

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

  saveDatabase();
  render();
  if (typeof hideAddClassLoadModal === 'function') {
    hideAddClassLoadModal();
  }
  toast('Class load added successfully.', 'success');
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
  const yearEl = document.getElementById('schoolYear');
  
  if (teacherEl) db.teacherName = teacherEl.value;
  if (schoolEl) db.schoolName = schoolEl.value;
  if (schoolIdEl) db.schoolId = schoolIdEl.value;
  if (regionEl) db.region = regionEl.value;
  if (divisionEl) db.division = divisionEl.value;
  if (yearEl) db.schoolYear = yearEl.value;
}

/**
 * Triggers native folder selector and updates the secondary auto-backup directory path.
 */
async function selectSecondaryBackupFolder() {
  try {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      dbRoot.secondaryBackupPath = folderPath;
      await saveRootDatabase();
      render();
      toast('Secondary auto-backup directory configured successfully.', 'success');
    }
  } catch (error) {
    console.error('Failed to select secondary backup folder:', error);
    toast('Could not configure backup folder: ' + error.message, 'error');
  }
}

/**
 * Resets secondary auto-backup directory configuration.
 */
async function clearSecondaryBackupFolder() {
  dbRoot.secondaryBackupPath = '';
  await saveRootDatabase();
  render();
  toast('Secondary auto-backup directory cleared.', 'info');
}

/**
 * Erases local state database completely after confirmation.
 */
function clearLocalData() {
  confirmModal(
    'Clear All App Data',
    'This will permanently delete all profiles, classes, learners, and grades from this computer. Ensure you have exported a backup JSON if you need to retain this information.',
    async () => {
      dbRoot = {
        version: ROOT_DB_VERSION,
        profiles: [],
        activeProfileId: ''
      };
      db = {
        version: DB_VERSION,
        teacherName: '',
        schoolName: '',
        schoolId: '',
        region: '',
        division: '',
        schoolYear: '2026-2027',
        currentAssignmentId: '',
        currentTerm: '1',
        activeView: 'dashboard',
        autoBlur: false,
        assignments: []
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
              ${[1,2,3,4,5,6,7,8,9,10].map(g =>
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
        <div id="editCustomSubjectField" class="field" style="display:none">
          <label class="field-label">Custom Subject Name</label>
          <input id="editCustomSubjectInput" class="field-input" placeholder="e.g. Science Elective" />
        </div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-ghost btn-sm" id="editModalCancel">Cancel</button>
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
    
    if (isNaN(grade) || grade < 1 || grade > 10) {
      const otherOpt = document.createElement('option');
      otherOpt.value = 'Custom';
      otherOpt.innerText = 'Other / Custom Subject…';
      editSubjectSelect.appendChild(otherOpt);
    }
  };

  const handleEditSubjectChange = () => {
    if (editSubjectSelect.value === 'Custom') {
      editCustomField.style.display = 'block';
    } else {
      editCustomField.style.display = 'none';
    }
  };

  editSubjectSelect.addEventListener('change', handleEditSubjectChange);

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

    a.gradeLevel   = newGrade;
    a.section      = newSection;
    a.subject      = newSubject;
    a.schoolYear   = newSchoolYear;
    a.policy       = newPolicy;
    a.subjectGroup = determineSubjectGroup(a.gradeLevel, a.subject, a.policy);

    db.schoolYear = newSchoolYear;
    const headerYearEl = document.getElementById('schoolYear');
    if (headerYearEl) {
      headerYearEl.value = newSchoolYear;
    }

    // Apply template assessments for new grade level
    ensureTemplateAssessments(a);

    close();
    saveDatabase();
    render();
    toast('Teaching load updated.', 'success');
  });

  // Close on backdrop click
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  // Auto-focus section input
  setTimeout(() => overlay.querySelector('#editSection').focus(), 80);
}
