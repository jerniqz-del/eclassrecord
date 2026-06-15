/**
 * E-Class Record — Main Renderer Script
 *
 * Coordinates initialization, routing views, adding/removing assessments,
 * printing, and listening to Electron IPC events (menu items, OTA updater).
 */

/**
 * Main application render loop.
 * Updates UI outputs across views based on memory state.
 */
function render() {
  // Update Profile Fields
  const teacherEl = document.getElementById('teacherName');
  const schoolEl = document.getElementById('schoolName');
  const yearEl = document.getElementById('schoolYear');
  
  if (teacherEl) teacherEl.value = db.teacherName || '';
  if (schoolEl) schoolEl.value = db.schoolName || '';
  if (yearEl) yearEl.value = db.schoolYear || '2026-2027';

  // Render Sub-components
  renderAssignmentsList();
  renderCurrentHeader();
  renderRecordTable();
  renderFinalOnly();
  renderDashboardOverview();
  showView();
}

/**
 * Renders the list of registered classes in the sidebar.
 */
function renderAssignmentsList() {
  const listEl = document.getElementById('assignmentList');
  const statusEl = document.getElementById('assignmentStatus');
  if (!listEl) return;
  
  let html = '';
  for (let i = 0; i < db.assignments.length; i++) {
    const a = db.assignments[i];
    const isActive = a.id === db.currentAssignmentId;
    const itemClass = isActive ? 'load-list__item load-list__item--active' : 'load-list__item';
    
    html += `
      <li class="${itemClass}" onclick="selectAssignment('${esc(a.id)}')">
        <div>Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</div>
        <div class="load-list__subject">${esc(a.subject)}</div>
      </li>
    `;
  }
  
  if (!html) {
    html = '<li class="load-list__item text-muted text-xs">No teaching loads yet.</li>';
  }
  
  listEl.innerHTML = html;
  if (statusEl) {
    statusEl.innerHTML = `${db.assignments.length} teaching load(s)`;
  }
}

/**
 * Triggers view routing. Toggles block elements matching 'data-view'.
 */
function setView(view) {
  currentView = view;
  db.activeView = view;
  showView();
  // Smooth content fade-in on the scrollable area only (not the header)
  const contentEl = document.querySelector('.content');
  if (contentEl) {
    contentEl.classList.remove('content--view-transition');
    void contentEl.offsetWidth; // force reflow so animation restarts
    contentEl.classList.add('content--view-transition');
    setTimeout(() => contentEl.classList.remove('content--view-transition'), 220);
  }
}

/**
 * Displays components belonging to active view. Updates sidebar highlights.
 */
function showView() {
  const allViews = document.querySelectorAll('[data-view]');
  allViews.forEach(el => {
    const views = el.getAttribute('data-view').split(',');
    let visible = views.includes(currentView);
    
    // Custom check for paste import box
    if (el.id === 'importPanel' && !importMode) {
      visible = false;
    }
    
    el.style.display = visible ? 'block' : 'none';
  });

  // Highlight Sidebar Menu
  const navKeys = {
    dashboard: 'navDashboard',
    classes: 'navClasses',
    record: 'navRecord',
    settings: 'navSettings'
  };
  
  for (const key in navKeys) {
    const btn = document.getElementById(navKeys[key]);
    if (btn) {
      if (key === currentView) {
        btn.classList.add('nav-btn--active');
      } else {
        btn.classList.remove('nav-btn--active');
      }
    }
  }

  applyRecordTab();
}

/**
 * Handles tab view switching inside record screen.
 */
function setRecordTab(tab) {
  recordTab = tab;
  if (['1', '2', '3'].includes(tab)) {
    db.currentTerm = tab;
  }
  db.recordTab = tab;
  saveDatabase();
  render();
}

/**
 * Switches between Term grids and Final Grades layout.
 */
function applyRecordTab() {
  const tabIds = { '1': 'recTab1', '2': 'recTab2', '3': 'recTab3', 'summary': 'recTabSummary' };
  for (const k in tabIds) {
    const btn = document.getElementById(tabIds[k]);
    if (btn) {
      if (k === recordTab) {
        btn.classList.add('record-tab--active');
      } else {
        btn.classList.remove('record-tab--active');
      }
    }
  }
  
  if (currentView !== 'record') return;
  const isSummary = recordTab === 'summary';
  
  showEl('termInputsPanel', !isSummary);
  showEl('classRecordPanel', !isSummary);
  showEl('finalGradesPanel', isSummary);
  
  const activeTerm = db.currentTerm || '1';
  const classRecordTitle = document.getElementById('classRecordTitle');
  if (classRecordTitle) {
    classRecordTitle.innerHTML = `Class Record - Term ${esc(activeTerm)}`;
  }
  
  const termInputsTitle = document.getElementById('termInputsTitle');
  if (termInputsTitle) {
    termInputsTitle.innerHTML = `Add Assessment - Term ${esc(activeTerm)}`;
  }
}

/**
 * Registers a new assessment activity.
 */
function addAssessment() {
  const a = currentAssignment();
  if (!a) {
    toast('Add a teaching load first.', 'warning');
    return;
  }
  
  const scoreInput = document.getElementById('assessmentMax');
  const compInput = document.getElementById('assessmentComponent');
  const titleInput = document.getElementById('assessmentTitle');
  const dateInput = document.getElementById('assessmentDate');
  
  const max = parseFloat(scoreInput.value);
  if (isNaN(max) || max <= 0) {
    toast('Highest score must be a positive number.', 'warning');
    return;
  }
  
  const assessment = {
    id: uid('assessment'),
    term: db.currentTerm,
    component: compInput.value,
    title: trim(titleInput.value) || 'Assessment',
    maxScore: max,
    date: trim(dateInput.value)
  };
  
  a.assessments.push(assessment);
  
  // Clear inputs
  scoreInput.value = '';
  titleInput.value = '';
  dateInput.value = '';
  
  saveDatabase();
  render();
  toast('Assessment added.', 'success');
}

/**
 * Deletes the last assessment in active term with confirmation.
 */
function removeLastAssessment() {
  const a = currentAssignment();
  if (!a) return;
  
  let idx = -1;
  for (let i = a.assessments.length - 1; i >= 0; i--) {
    if (a.assessments[i].term === db.currentTerm) {
      idx = i;
      break;
    }
  }
  
  if (idx < 0) {
    toast('No assessments to remove in active term.', 'warning');
    return;
  }
  
  confirmModal(
    'Remove Last Assessment',
    'Are you sure you want to remove the last assessment for the active term? All entered scores for this assessment will be lost.',
    () => {
      const assessment = a.assessments.splice(idx, 1)[0];
      for (const key in a.scores) {
        if (key.includes('|' + assessment.id)) {
          delete a.scores[key];
        }
      }
      saveDatabase();
      render();
      toast('Assessment removed.', 'success');
    }
  );
}

/**
 * Converts selected class to Key Stage 2 Trimester template.
 */
function applyKeyStage2Template() {
  const a = currentAssignment();
  if (!a) {
    toast('Add a teaching load first.', 'warning');
    return;
  }
  
  confirmModal(
    'Convert to Key Stage 2',
    'Convert this class load to Key Stage 2 Trimester? This will seed fixed trimesters and assessments structures.',
    () => {
      a.subjectGroup = 'KS2_TRIMESTER';
      a.policy = 'KEY_STAGE_2_TRIMESTER';
      normalizeAssessmentComponents(a);
      ensureKeyStage2Assessments(a);
      saveDatabase();
      render();
      toast('Class load converted to KS2.', 'success');
    }
  );
}

/**
 * Initiates print mode view adjustments and triggers window.print().
 */
function printClassRecord() {
  updateProfile();
  currentView = 'record';
  db.activeView = 'record';
  render();
  window.print();
}

/**
 * Initialise App on Launch
 */
window.addEventListener('DOMContentLoaded', async () => {
  // Load local file database
  await loadDatabase();
  
  // Set version numbers in footer
  try {
    const version = await window.electronAPI.getVersion();
    const verEl = document.getElementById('appVersionLabel');
    if (verEl) verEl.innerText = 'v' + version;
  } catch (error) {
    console.error(error);
  }
  
  // Populate subject selections
  populateSubjects();
  
  // Initial draw
  recordTab = db.recordTab ? db.recordTab : (db.currentTerm || '1');
  render();
  
  // Connect Electron Main Menu Event Listeners
  window.electronAPI.onMenuSave(saveDatabase);
  window.electronAPI.onMenuExportJson(exportJson);
  window.electronAPI.onMenuImportJson(importJsonBackupFile);
  
  // Connect OTA Auto-Updater Updates
  window.electronAPI.onUpdateStatus((status, details) => {
    const indicatorEl = document.getElementById('updateIndicator');
    const updateTextEl = document.getElementById('updateText');
    
    if (updateTextEl) {
      updateTextEl.innerText = details.message;
    }
    
    if (indicatorEl) {
      indicatorEl.className = 'update-indicator'; // Reset base
      if (status === 'checking') indicatorEl.classList.add('update-indicator--checking');
      else if (status === 'available') indicatorEl.classList.add('update-indicator--available');
      else if (status === 'not-available') indicatorEl.classList.add('update-indicator--uptodate');
      else if (status === 'downloading') indicatorEl.classList.add('update-indicator--downloading');
      else if (status === 'downloaded') indicatorEl.classList.add('update-indicator--downloaded');
      else if (status === 'error') indicatorEl.classList.add('update-indicator--error');
    }
    
    if (status === 'downloaded') {
      confirmModal(
        'Relaunch to Update',
        `An update to version v${details.version} is ready. Would you like to restart E-Class Record and apply the update now?`,
        () => {
          // autoUpdater will install on close, so we notify and can close window
          toast('Application will update on relaunch.', 'success');
        }
      );
    }
  });
});

/**
 * Dynamically updates the subjects list based on selected grade level.
 */
function populateSubjects() {
  const gradeSelect = document.getElementById('newGrade');
  const subjectSelect = document.getElementById('newSubject');
  if (!gradeSelect || !subjectSelect) return;
  
  const grade = parseInt(gradeSelect.value);
  
  let subjects = [];
  if (grade <= 3) {
    subjects = [
      'English',
      'Mathematics',
      'Filipino',
      'Araling Panlipunan (AP)',
      'MAPEH',
      'GMRC / Good Manners and Right Conduct'
    ];
  } else if (grade <= 6) {
    subjects = [
      'English',
      'Mathematics',
      'Science',
      'Filipino',
      'Araling Panlipunan (AP)',
      'EPP (Edukasyong Pantahanan at Pangkabuhayan)',
      'MAPEH',
      'GMRC / Good Manners and Right Conduct'
    ];
  } else if (grade <= 10) {
    subjects = [
      'English',
      'Mathematics',
      'Science',
      'Filipino',
      'Araling Panlipunan (AP)',
      'TLE (Technology and Livelihood Education)',
      'MAPEH',
      'Values Education / EsP'
    ];
  } else {
    // Grade 11-12
    subjects = [
      'Oral Communication',
      'Reading and Writing',
      'Komunikasyon at Pananaliksik',
      'Pagbasa at Pagsusuri',
      'General Mathematics',
      'Statistics and Probability',
      'Earth and Life Science',
      'Physical Science',
      'Introduction to the Philosophy of the Human Person',
      'Physical Education and Health',
      'Empowerment Technologies',
      'Practical Research 1',
      'Practical Research 2',
      'Inquiries, Investigations, and Immersion',
      'English for Academic and Professional Purposes',
      'Media and Information Literacy',
      'Discipline and Ideas in the Social Sciences'
    ];
  }
  
  subjectSelect.innerHTML = '';
  subjects.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.innerText = sub;
    subjectSelect.appendChild(opt);
  });
  
  const otherOpt = document.createElement('option');
  otherOpt.value = 'Custom';
  otherOpt.innerText = 'Other / Custom Subject…';
  subjectSelect.appendChild(otherOpt);
  
  handleSubjectChanged();
}

/**
 * Shows/hides custom subject text box.
 */
function handleSubjectChanged() {
  const subjectSelect = document.getElementById('newSubject');
  const customField = document.getElementById('customSubjectField');
  if (!subjectSelect || !customField) return;
  
  if (subjectSelect.value === 'Custom') {
    customField.style.display = 'block';
  } else {
    customField.style.display = 'none';
  }
}
