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
  const schoolIdEl = document.getElementById('schoolId');
  const regionEl = document.getElementById('schoolRegion');
  const divisionEl = document.getElementById('schoolDivision');
  const yearEl = document.getElementById('schoolYear');
  
  if (teacherEl) teacherEl.value = db.teacherName || '';
  if (schoolEl) schoolEl.value = db.schoolName || '';
  if (schoolIdEl) schoolIdEl.value = db.schoolId || '';
  if (regionEl) regionEl.value = db.region || '';
  
  const settingAutoBlur = document.getElementById('settingAutoBlur');
  if (settingAutoBlur) settingAutoBlur.checked = db.autoBlur || false;
  
  const settingShowNumericalEquivalents = document.getElementById('settingShowNumericalEquivalents');
  if (settingShowNumericalEquivalents) settingShowNumericalEquivalents.checked = db.showNumericalEquivalents || false;
  
  const settingUseUniversalTrimesterLayout = document.getElementById('settingUseUniversalTrimesterLayout');
  if (settingUseUniversalTrimesterLayout) settingUseUniversalTrimesterLayout.checked = db.useUniversalTrimesterLayout || false;
  
  // Dynamic population of divisions based on selected region
  populateDivisions();
  if (divisionEl) divisionEl.value = db.division || '';
  
  if (yearEl) {
    const val = db.schoolYear || '2026-2027';
    let found = false;
    for (let i = 0; i < yearEl.options.length; i++) {
      if (yearEl.options[i].value === val) {
        found = true;
        break;
      }
    }
    if (!found) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      let inserted = false;
      for (let i = 0; i < yearEl.options.length; i++) {
        if (yearEl.options[i].value > val) {
          yearEl.insertBefore(opt, yearEl.options[i]);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        yearEl.appendChild(opt);
      }
    }
    yearEl.value = val;
  }

  // Update secondary auto-backup folder settings display
  const backupDescEl = document.getElementById('secondaryBackupPathDesc');
  const clearBackupBtn = document.getElementById('btnClearBackupFolder');
  if (backupDescEl && clearBackupBtn) {
    if (typeof db !== 'undefined' && db.secondaryBackupPath) {
      backupDescEl.innerHTML = `Backup path configured: <code style="font-family:var(--font-family-mono); font-size:12px; color:var(--text-primary); font-weight:var(--font-weight-semibold);">${esc(db.secondaryBackupPath)}</code>.<br><span style="color:var(--text-secondary); font-size:var(--text-xs);">Both your local AppData and secondary folders store a duplicate active database copy and daily rolling backups (up to 30 days).</span>`;
      clearBackupBtn.style.display = 'inline-block';
    } else {
      backupDescEl.innerHTML = `None configured. Select a directory (like your OneDrive or Google Drive folder) to save duplicate database copies and daily rolling backups (up to 30 days) in both directories.`;
      clearBackupBtn.style.display = 'none';
    }
  }

  // Render Sub-components
  renderAssignmentsList();
  renderCurrentHeader();
  renderRecordTable();
  renderFinalOnly();
  renderDashboardOverview();
  renderLearnersRoster();

  const hasClasses = currentAssignment() !== null;
  showEl('classesViewContent', hasClasses);
  showEl('classesViewEmpty', !hasClasses);
  
  if (!hasClasses) {
    const target = document.getElementById('classesViewEmpty');
    if (target) {
      target.innerHTML = emptyState(
        'No Teaching Load',
        'You have no teaching loads registered yet. Setup your profile under Settings and add a class load to get started.',
        'Add Your First Teaching Load',
        "handleAddFirstClassLoad()"
      );
    }
  }

  showView();
  if (typeof updateBlurClass === 'function') {
    updateBlurClass();
  }
}

/**
 * Renders the list of registered classes in the sidebar.
 */
function renderAssignmentsList() {
  const listEl = document.getElementById('assignmentList');
  const statusEl = document.getElementById('assignmentStatus');
  if (!listEl) return;
  
  const activeYear = db.schoolYear || '2026-2027';
  const filtered = db.assignments ? db.assignments.filter(a => a.schoolYear === activeYear) : [];
  
  let html = '';
  for (let i = 0; i < filtered.length; i++) {
    const a = filtered[i];
    const isActive = a.id === db.currentAssignmentId;
    const itemClass = isActive ? 'load-list__item load-list__item--active' : 'load-list__item';
    
    const colorClass = subjectColorClass(a.subject);
    html += `
      <li class="${itemClass} subject--${colorClass}" onclick="selectAssignment('${esc(a.id)}')">
        <div class="load-list__info">
          <div class="load-list__title">Grade ${esc(a.gradeLevel)} — ${esc(a.section)}</div>
          <div class="load-list__subject">${esc(a.subject)}</div>
        </div>
        <button class="load-list__edit-btn" title="Edit details"
          onclick="event.stopPropagation(); editAssignmentModal('${esc(a.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </li>
    `;
  }
  
  if (!html) {
    html = `<li class="load-list__item text-muted text-xs">No teaching loads for ${esc(activeYear)}.</li>`;
  }
  
  listEl.innerHTML = html;
  if (statusEl) {
    statusEl.innerHTML = `${filtered.length} teaching load(s)`;
  }
}

/**
 * Triggers view routing. Toggles block elements matching 'data-view'.
 */
function setView(view) {
  currentView = view;
  db.activeView = view;
  document.body.setAttribute('data-active-view', view);
  showView();
  
  if (view === 'record' && typeof adjustHpsStickyTop === 'function') {
    setTimeout(adjustHpsStickyTop, 50);
  }
  
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
    
    if (visible) {
      if (el.classList.contains('view-section--flex')) {
        el.style.display = 'flex';
      } else {
        el.style.display = 'block';
      }
    } else {
      el.style.display = 'none';
    }
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

function setMapehSubTab(subTab) {
  currentMapehSubTab = subTab;
  render();
}

function applyMapehSubTab() {
  const subTabsContainer = document.getElementById('mapehSubTabs');
  if (!subTabsContainer) return;

  const a = currentAssignment();
  if (currentView === 'record' && a && isMapehSubject(a.subject)) {
    subTabsContainer.style.display = 'flex';
    
    const subTabIds = {
      'music_arts': 'mapehTabMusicArts',
      'pe_health': 'mapehTabPEHealth',
      'consolidated': 'mapehTabConsolidated'
    };
    for (const key in subTabIds) {
      const btn = document.getElementById(subTabIds[key]);
      if (btn) {
        if (key === currentMapehSubTab) {
          btn.classList.add('record-tab--active');
        } else {
          btn.classList.remove('record-tab--active');
        }
      }
    }
  } else {
    subTabsContainer.style.display = 'none';
  }
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
  
  applyMapehSubTab();
  
  if (currentView !== 'record') return;
  const isSummary = recordTab === 'summary';
  
  showEl('classRecordPanel', !isSummary);
  showEl('finalGradesPanel', isSummary);
  
  const activeTerm = db.currentTerm || '1';
  const classRecordTitle = document.getElementById('classRecordTitle');
  const a = currentAssignment();
  if (classRecordTitle) {
    if (a && isMapehSubject(a.subject) && currentMapehSubTab === 'consolidated') {
      classRecordTitle.innerHTML = `Consolidated MAPEH Record - Term ${esc(activeTerm)}`;
    } else {
      classRecordTitle.innerHTML = `Class Record - Term ${esc(activeTerm)}`;
    }
  }

  if (a) {
    const complianceNoteHtml = a.policy === 'DO15_DESCRIPTIVE'
      ? `<div class="print-compliance-note" style="margin-top:var(--space-2); text-align:center; font-size:var(--font-size-xs); font-style:italic; border-top:1px dashed var(--border-subtle); padding-top:var(--space-2)">Original basis of grade was descriptive (DO 15, s. 2026).</div>`
      : '';
    const printHeaderHtml = `
      <div class="print-metadata-grid">
        <div class="print-metadata-col">
          <div><strong>Region:</strong> ${esc(db.region || '')}</div>
          <div><strong>Division:</strong> ${esc(db.division || '')}</div>
          <div><strong>School Name:</strong> ${esc(db.schoolName || '')}</div>
          <div><strong>School ID:</strong> ${esc(db.schoolId || '')}</div>
        </div>
        <div class="print-metadata-col">
          <div><strong>School Year:</strong> ${esc(db.schoolYear || '')}</div>
          <div><strong>Grade & Section:</strong> Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</div>
          <div><strong>Subject:</strong> ${esc(a.subject)}</div>
          <div><strong>Teacher:</strong> ${esc(db.teacherName || '')}</div>
        </div>
      </div>
      ${complianceNoteHtml}
    `;
    const recHeader = document.getElementById('classRecordPrintHeader');
    const finHeader = document.getElementById('finalGradesPrintHeader');
    if (recHeader) recHeader.innerHTML = printHeaderHtml;
    if (finHeader) finHeader.innerHTML = printHeaderHtml;
  }

  // Toggle localized print buttons visibility
  showEl('printTerm1Btn', recordTab === '1', 'inline-flex');
  showEl('printTerm2Btn', recordTab === '2', 'inline-flex');
  showEl('printTerm3Btn', recordTab === '3', 'inline-flex');
  showEl('printSummaryBtn', recordTab === 'summary', 'inline-flex');

  // Toggle localized PDF buttons visibility
  showEl('pdfTerm1Btn', recordTab === '1', 'inline-flex');
  showEl('pdfTerm2Btn', recordTab === '2', 'inline-flex');
  showEl('pdfTerm3Btn', recordTab === '3', 'inline-flex');
  showEl('pdfSummaryBtn', recordTab === 'summary', 'inline-flex');

  // Toggle Quick Grade Entry and View Learner's Grades buttons visibility
  const hasLearners = a && a.learners && a.learners.length > 0;
  showEl('quickGradeBtn', !isSummary && hasLearners, 'inline-flex');
  showEl('viewLearnerGradesBtn', hasLearners, 'inline-flex');
}

async function printClassRecord() {
  updateProfile();
  
  const a = currentAssignment();
  if (!a) {
    toast('No class load selected to print.', 'warning');
    return;
  }
  
  // Determine print page orientation based on active tab and view sub-tab
  const isSummary = recordTab === 'summary';
  const isConsolidated = isMapehSubject(a.subject) && currentMapehSubTab === 'consolidated';
  
  let styleEl = document.getElementById('print-orientation-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-orientation-style';
    document.head.appendChild(styleEl);
  }
  
  if (isSummary || isConsolidated) {
    styleEl.innerHTML = '@media print { @page { size: portrait; } }';
  } else {
    styleEl.innerHTML = '@media print { @page { size: landscape; } }';
  }
  
  // Print Web Layout directly from the app
  currentView = 'record';
  db.activeView = 'record';
  render();
  window.print();
}

async function downloadPdf() {
  updateProfile();
  
  const a = currentAssignment();
  if (!a) {
    toast('No class load selected.', 'warning');
    return;
  }
  
  toast('Generating PDF document...', 'info');
  
  const isSummary = recordTab === 'summary';
  const isConsolidated = isMapehSubject(a.subject) && currentMapehSubTab === 'consolidated';
  
  // Set orientation dynamically before generating PDF
  let styleEl = document.getElementById('print-orientation-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-orientation-style';
    document.head.appendChild(styleEl);
  }
  
  if (isSummary || isConsolidated) {
    styleEl.innerHTML = '@media print { @page { size: portrait; } }';
  } else {
    styleEl.innerHTML = '@media print { @page { size: landscape; } }';
  }
  
  // Render and update view context first with pdf-export-mode class added to body
  document.body.classList.add('pdf-export-mode');
  currentView = 'record';
  db.activeView = 'record';
  render();
  
  // Build a clean, context-aware filename for the PDF export
  const termSuffix = isSummary ? 'Final-Summary' : (isConsolidated ? `Term-${db.currentTerm}-Consolidated` : `Term-${db.currentTerm}`);
  const mapehPartSuffix = (isMapehSubject(a.subject) && !isConsolidated) ? `-${currentMapehSubTab.toUpperCase()}` : '';
  const sanitizedSubject = a.subject.replace(/[^a-zA-Z0-9]/g, '-');
  const sanitizedSection = a.section.replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `Class-Record-Grade-${a.gradeLevel}-${sanitizedSection}-${sanitizedSubject}-${termSuffix}${mapehPartSuffix}.pdf`;
  
  // Formulate dynamic document header title text
  const activeTerm = db.currentTerm || '1';
  let titleText = '';
  if (isSummary) {
    if (isMapehSubject(a.subject) && currentMapehSubTab === 'consolidated') {
      titleText = 'Consolidated MAPEH Summary';
    } else {
      titleText = 'Final Grades Summary';
    }
  } else {
    if (isMapehSubject(a.subject) && currentMapehSubTab === 'consolidated') {
      titleText = `Consolidated MAPEH Record - Term ${activeTerm}`;
    } else if (isMapehSubject(a.subject)) {
      const subName = currentMapehSubTab === 'music_arts' ? 'Music & Arts' : 'PE & Health';
      titleText = `Class Record - Term ${activeTerm} (${subName})`;
    } else {
      titleText = `Class Record - Term ${activeTerm}`;
    }
  }

  const metadata = {
    title: esc(titleText),
    region: esc(db.region || ''),
    division: esc(db.division || ''),
    schoolName: esc(db.schoolName || ''),
    schoolId: esc(db.schoolId || ''),
    schoolYear: esc(db.schoolYear || ''),
    gradeLevel: esc(a.gradeLevel || ''),
    section: esc(a.section || ''),
    subject: esc(a.subject || ''),
    teacherName: esc(db.teacherName || ''),
    timestamp: esc(new Date().toLocaleString())
  };
  
  const options = {
    landscape: !(isSummary || isConsolidated),
    size: 'A4',
    filename: filename,
    metadata: metadata
  };
  
  try {
    const result = await window.electronAPI.exportPdf(options);
    if (result.success) {
      toast(`Successfully saved PDF to: ${result.path}`, 'success');
    } else if (result.error) {
      const isBusy = result.error.includes('EBUSY');
      const msg = isBusy ? 'ERROR: Please check whether file is in use!' : `PDF export failed: ${result.error}`;
      toast(msg, 'error');
    }
  } catch (err) {
    console.error(err);
    const isBusy = err.message && err.message.includes('EBUSY');
    const msg = isBusy ? 'ERROR: Please check whether file is in use!' : ('PDF export failed: ' + err.message);
    toast(msg, 'error');
  } finally {
    document.body.classList.remove('pdf-export-mode');
    render();
  }
}

/**
 * Initialise App on Launch
 */
window.addEventListener('DOMContentLoaded', async () => {
  // Load local file database
  await loadDatabase();
  
  // Set window title
  document.title = 'E-Class Record App v1.0';
  
  // Populate regions select
  populateRegions();

  // Populate subject selections
  populateSubjects();
  
  // Bind enter key for passcode input
  const passcodeEl = document.getElementById('passcodeField');
  if (passcodeEl) {
    passcodeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitPasscode();
      }
    });
  }

  // Bind enter key for profile pin confirmation
  const confirmPinEl = document.getElementById('createProfilePinConfirm');
  if (confirmPinEl) {
    confirmPinEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitCreateProfile();
      }
    });
  }

  // Handle Profile Overlay / Welcome Modal on Startup
  const dismissedUntil = localStorage.getItem('welcome_modal_dismissed_until');
  const todayString = new Date().toDateString();
  const welcomeActive = dismissedUntil !== todayString;

  if (welcomeActive) {
    showEl('profileOverlay', false);
    showEl('welcomeModal', true, 'flex');
  } else {
    showEl('profileOverlay', true, 'flex');
    if (legacyDataToMigrate !== null || dbRoot.profiles.length === 0) {
      showCreateProfileForm();
    } else {
      showProfileSelect();
    }
  }

  // Set up delegation for cell row & column highlights on score input focus
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.classList.contains('score-input')) {
      const input = e.target;
      const td = input.closest('td');
      if (!td) return;
      const tr = td.closest('tr');
      if (!tr) return;
      const table = tr.closest('table');
      if (!table) return;
      
      const cellIndex = td.cellIndex;
      
      // Clean up any existing highlights first to prevent duplicate states
      document.querySelectorAll('.active-row').forEach(el => el.classList.remove('active-row'));
      document.querySelectorAll('.active-col').forEach(el => el.classList.remove('active-col'));
      document.querySelectorAll('.active-cell').forEach(el => el.classList.remove('active-cell'));
      
      // 1. Highlight the current row
      tr.classList.add('active-row');
      
      // 2. Highlight the current intersection cell td
      td.classList.add('active-cell');
      
      // 3. Highlight all matching cell indices vertically (column)
      const rows = table.rows;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const cell = r.cells[cellIndex];
        if (cell) {
          cell.classList.add('active-col');
        }
      }
    }
  });

  document.addEventListener('focusout', (e) => {
    if (e.target && e.target.classList.contains('score-input')) {
      // Remove all highlight classes globally
      document.querySelectorAll('.active-row').forEach(el => el.classList.remove('active-row'));
      document.querySelectorAll('.active-col').forEach(el => el.classList.remove('active-col'));
      document.querySelectorAll('.active-cell').forEach(el => el.classList.remove('active-cell'));
    }
  });
  
  // Connect Electron Main Menu Event Listeners
  window.electronAPI.onMenuSave(saveDatabase);
  window.electronAPI.onMenuExportJson(exportJson);
  window.electronAPI.onMenuImportJson(importJsonBackupFile);
  
  // Connect Window Exit Close Interceptor
  if (window.electronAPI && typeof window.electronAPI.onAppCloseTriggered === 'function') {
    window.electronAPI.onAppCloseTriggered(() => {
      showDonateModal(true);
    });
  }
  
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

// Register global keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
window.addEventListener('keydown', (event) => {
  // Check if active view is record
  if (typeof currentView === 'undefined' || currentView !== 'record') {
    return;
  }
  
  const isCtrl = event.ctrlKey || event.metaKey;
  if (isCtrl) {
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        if (typeof triggerRedo === 'function') triggerRedo();
      } else {
        if (typeof triggerUndo === 'function') triggerUndo();
      }
    } else if (key === 'y') {
      event.preventDefault();
      if (typeof triggerRedo === 'function') triggerRedo();
    }
  }
});

/**
 * Dynamically updates the subjects list based on selected grade level.
 */
function populateSubjects() {
  const gradeSelect = document.getElementById('newGrade');
  const subjectSelect = document.getElementById('newSubject');
  if (!gradeSelect || !subjectSelect) return;
  
  const grade = parseInt(gradeSelect.value);
  
  let subjects = getSubjectsForGrade(grade);
  
  subjectSelect.innerHTML = '';
  subjects.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub;
    opt.innerText = sub;
    subjectSelect.appendChild(opt);
  });
  
  if (isNaN(grade) || grade < 1 || grade > 10) {
    const otherOpt = document.createElement('option');
    otherOpt.value = 'Custom';
    otherOpt.innerText = 'Other / Custom Subject…';
    subjectSelect.appendChild(otherOpt);
  }
  
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

// DepEd official regions and their corresponding school divisions mapping
const DEPED_REGIONS_DIVISIONS = {
  "NCR (National Capital Region)": [
    "Manila", "Quezon City", "Caloocan", "Las Piñas", "Makati", "Malabon", 
    "Mandaluyong", "Marikina", "Muntinlupa", "Navotas", "Parañaque", 
    "Pasay", "Pasig", "San Juan", "Taguig-Pateros", "Valenzuela"
  ],
  "CAR (Cordillera Administrative Region)": [
    "Abra", "Apayao", "Baguio City", "Benguet", "Ifugao", "Kalinga", 
    "Mountain Province", "Tabuk City"
  ],
  "Region I (Ilocos Region)": [
    "Alaminos City", "Batac City", "Candon City", "Dagupan City", "Ilocos Norte", 
    "Ilocos Sur", "La Union", "Laoag City", "Pangasinan I", "Pangasinan II", 
    "San Carlos City", "San Fernando City", "Urdaneta City", "Vigan City"
  ],
  "Region II (Cagayan Valley)": [
    "Batanes", "Cagayan", "Cauayan City", "Ilagan City", "Isabela", 
    "Nueva Vizcaya", "Quirino", "Santiago City", "Tuguegarao City"
  ],
  "Region III (Central Luzon)": [
    "Angeles City", "Aurora", "Balanga City", "Bataan", "Bulacan", 
    "Cabanatuan City", "Gapan City", "Mabalacat City", "Malolos City", 
    "Meycauayan City", "Muñoz Science City", "Nueva Ecija", "Olongapo City", 
    "Pampanga", "San Fernando City", "San Jose City", "San Jose del Monte City", 
    "Tarlac", "Tarlac City", "Zambales"
  ],
  "Region IV-A (CALABARZON)": [
    "Antipolo City", "Bacoor City", "Batangas", "Batangas City", "Biñan City", 
    "Cabuyao City", "Calamba City", "Cavite", "Cavite City", "Dasmariñas City", 
    "General Trias City", "Imus City", "Laguna", "Lipa City", "Lucena City", 
    "Quezon", "Rizal", "San Pablo City", "Santa Rosa City", "Tanauan City", 
    "Tayabas City"
  ],
  "MIMAROPA Region": [
    "Calapan City", "Marinduque", "Occidental Mindoro", "Oriental Mindoro", 
    "Palawan", "Puerto Princesa City", "Romblon"
  ],
  "Region V (Bicol Region)": [
    "Albay", "Camarines Norte", "Camarines Sur", "Catanduanes", "Iriga City", 
    "Legazpi City", "Ligao City", "Masbate", "Masbate City", "Naga City", 
    "Sorsogon", "Sorsogon City", "Tabaco City"
  ],
  "Region VI (Western Visayas)": [
    "Aklan", "Antique", "Bacolod City", "Bago City", "Cadiz City", "Capiz", 
    "Escalante City", "Guimaras", "Himamaylan City", "Iloilo", "Iloilo City", 
    "Kabankalan City", "La Carlota City", "Passi City", "Roxas City", 
    "Sagay City", "San Carlos City", "Silay City", "Sipalay City", "Victorias City"
  ],
  "Region VII (Central Visayas)": [
    "Bais City", "Bayawan City", "Bogo City", "Bohol", "Carcar City", "Cebu", 
    "Cebu City", "City of Naga", "Danao City", "Dumaguete City", "Guihulngan City", 
    "Lapu-Lapu City", "Mandaue City", "Siquijor", "Tagbilaran City", "Talisay City", 
    "Tanjay City", "Toledo City"
  ],
  "Region VIII (Eastern Visayas)": [
    "Baybay City", "Biliran", "Borongan City", "Calbayog City", "Catbalogan City", 
    "Eastern Samar", "Leyte", "Maasin City", "Northern Samar", "Ormoc City", 
    "Samar", "Southern Leyte", "Tacloban City"
  ],
  "Region IX (Zamboanga Peninsula)": [
    "Dapitan City", "Dipolog City", "Isabela City", "Pagadian City", 
    "Zamboanga City", "Zamboanga del Norte", "Zamboanga del Sur", "Zamboanga Sibugay"
  ],
  "Region X (Northern Mindanao)": [
    "Bukidnon", "Cagayan de Oro City", "Camiguin", "El Salvador City", 
    "Gingoog City", "Iligan City", "Lanao del Norte", "Misamis Occidental", 
    "Misamis Oriental", "Oroquieta City", "Ozamiz City", "Tangub City", "Valencia City"
  ],
  "Region XI (Davao Region)": [
    "Davao de Oro", "Davao del Norte", "Davao del Sur", "Davao Occidental", 
    "Davao Oriental", "Davao City", "Digos City", "Mati City", "Panabo City", 
    "Island Garden City of Samal", "Tagum City"
  ],
  "Region XII (SOCCSKSARGEN)": [
    "Cotabato", "General Santos City", "Kidapawan City", "Koronadal City", 
    "Sarangani", "South Cotabato", "Sultan Kudarat", "Tacurong City"
  ],
  "Region XIII (Caraga)": [
    "Agusan del Norte", "Agusan del Sur", "Bayugan City", "Bislig City", 
    "Butuan City", "Cabadbaran City", "Dinagat Islands", "Siargao", 
    "Surigao del Norte", "Surigao del Sur", "Surigao City", "Tandag City"
  ],
  "BARMM (Bangsamoro Autonomous Region in Muslim Mindanao)": [
    "Basilan", "Cotabato City", "Lanao del Sur I", "Lanao del Sur II", 
    "Maguindanao", "Marawi City", "Sulu", "Tawi-Tawi", "Special Geographic Area"
  ]
};

function populateRegions() {
  const regionSelect = document.getElementById('schoolRegion');
  if (!regionSelect) return;
  
  regionSelect.innerHTML = '<option value="">Select Region...</option>';
  for (const r in DEPED_REGIONS_DIVISIONS) {
    const opt = document.createElement('option');
    opt.value = r;
    opt.innerText = r;
    regionSelect.appendChild(opt);
  }
}

function populateDivisions() {
  const regionSelect = document.getElementById('schoolRegion');
  const divisionSelect = document.getElementById('schoolDivision');
  if (!regionSelect || !divisionSelect) return;
  
  const region = regionSelect.value;
  divisionSelect.innerHTML = '<option value="">Select Division...</option>';
  
  if (region && DEPED_REGIONS_DIVISIONS[region]) {
    DEPED_REGIONS_DIVISIONS[region].forEach(div => {
      const opt = document.createElement('option');
      opt.value = div;
      opt.innerText = div;
      divisionSelect.appendChild(opt);
    });
  }
}

function handleRegionChanged() {
  populateDivisions();
  updateProfile();
  saveDatabase();
}

function showAddClassLoadModal() {
  const modal = document.getElementById('addClassLoadModal');
  if (modal) {
    // Reset form inputs to default values
    const gradeSelect = document.getElementById('newGrade');
    if (gradeSelect) gradeSelect.value = '4';
    
    // Repopulate subjects for Grade 4 and set Section to 'A'
    populateSubjects();
    
    const sectionInput = document.getElementById('newSection');
    if (sectionInput) sectionInput.value = 'A';
    
    const customField = document.getElementById('customSubjectField');
    if (customField) customField.style.display = 'none';
    
    const customInput = document.getElementById('customSubjectInput');
    if (customInput) customInput.value = '';

    const classYearSelect = document.getElementById('newClassSchoolYear');
    if (classYearSelect) {
      classYearSelect.value = db.schoolYear || '2026-2027';
    }
    
    modal.style.display = 'flex';
  }
}

function hideAddClassLoadModal() {
  const modal = document.getElementById('addClassLoadModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Handles adding first class load with validation of settings fields.
 */
function handleAddFirstClassLoad() {
  const isFilled =
    db.teacherName && db.teacherName.trim() !== '' &&
    db.schoolName && db.schoolName.trim() !== '' &&
    db.schoolId && db.schoolId.trim() !== '' &&
    db.region && db.region.trim() !== '' &&
    db.division && db.division.trim() !== '' &&
    db.schoolYear && db.schoolYear.trim() !== '';

  if (isFilled) {
    showAddClassLoadModal();
  } else {
    setView('settings');
    alertModal(
      'Setup Required',
      'Please setup the application first by adding your basic user information (Teacher Name, School Name, School ID, Region, Division, and School Year) under Settings.'
    );
  }
}

/**
 * Navigates to the teaching load roster management and triggers the SF1 upload dialog.
 */
function proceedToUploadSf1() {
  setView('classes');
  setTimeout(() => {
    importSf1();
  }, 150);
}

/**
 * Show and hide the support/donation modal
 */
/**
 * Show and hide the support/donation modal
 * @param {boolean} isExitMode If true, show Cancel and Continue to Exit buttons instead of Close.
 */
function showDonateModal(isExitMode = false) {
  const modal = document.getElementById('donateModal');
  if (!modal) return;

  const cancelExitBtn = document.getElementById('donateCancelExitBtn');
  const closeBtn = document.getElementById('donateCloseBtn');
  const confirmExitBtn = document.getElementById('donateConfirmExitBtn');

  if (isExitMode) {
    if (cancelExitBtn) cancelExitBtn.style.display = 'inline-flex';
    if (confirmExitBtn) confirmExitBtn.style.display = 'inline-flex';
    if (closeBtn) closeBtn.style.display = 'none';
  } else {
    if (cancelExitBtn) cancelExitBtn.style.display = 'none';
    if (confirmExitBtn) confirmExitBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'inline-flex';
  }

  modal.style.display = 'flex';
}

function hideDonateModal() {
  const modal = document.getElementById('donateModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function showDonateQrModal() {
  const modal = document.getElementById('donateQrModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function hideDonateQrModal() {
  const modal = document.getElementById('donateQrModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function confirmAppExit() {
  try {
    await saveDatabase();
  } catch (err) {
    console.error('Error saving database on exit:', err);
  }
  if (window.electronAPI && typeof window.electronAPI.confirmExit === 'function') {
    window.electronAPI.confirmExit();
  } else {
    window.close();
  }
}

function openDonateExternal(url) {
  if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(url);
  }
}

function openFeedback() {
  if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal('https://forms.gle/eRoNwh2EG8c52Z1K8');
  }
}


function showImageZoom(src) {
  const modal = document.getElementById('imageZoomModal');
  const img = document.getElementById('zoomedImage');
  if (modal && img) {
    img.src = src;
    modal.style.display = 'flex';
  }
}

function hideImageZoomModal() {
  const modal = document.getElementById('imageZoomModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════
   MULTI-USER PROFILE MANAGEMENT
   ═══════════════════════════════════════════════════════ */

/**
 * Toggles the visibility of PIN passcode fields in the profile creation screen.
 */
function togglePinFields(checked) {
  showEl('pinFieldsWrap', checked);
}

/**
 * Renders the user profile selection cards in the startup screen overlay.
 */
function renderProfiles() {
  const listEl = document.getElementById('profileList');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  dbRoot.profiles.forEach(p => {
    const initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.onclick = () => selectProfileCard(p.id);
    
    let lockBadge = '';
    if (p.pinEnabled) {
      lockBadge = `<div class="profile-lock-badge">🔒 PIN Locked</div>`;
    } else {
      lockBadge = `<div class="profile-lock-badge">🔓 Unsecured</div>`;
    }
    
    card.innerHTML = `
      <div class="profile-avatar">${initial}</div>
      <div class="profile-name" title="${esc(p.name)}">${esc(p.name)}</div>
      ${lockBadge}
    `;
    listEl.appendChild(card);
  });
}

/**
 * Displays the profile creation form panel.
 */
function showCreateProfileForm() {
  showEl('profileSelectPanel', false);
  showEl('profileUnlockPanel', false);
  showEl('profileCreatePanel', true);
  
  // Reset input fields
  document.getElementById('createProfileName').value = '';
  document.getElementById('createProfilePin').value = '';
  document.getElementById('createProfilePinConfirm').value = '';
  document.getElementById('createProfilePinEnabled').checked = true;
  showEl('pinFieldsWrap', true);
  document.getElementById('createProfileErrorMsg').innerText = '';
  
  // Check if profiles list is empty to prevent backing out
  const hasProfiles = dbRoot.profiles && dbRoot.profiles.length > 0;
  showEl('btnCancelCreateProfile', hasProfiles);
  
  // Setup migration message if legacy data exists
  const descEl = document.querySelector('#profileCreatePanel .profile-panel-desc');
  if (legacyDataToMigrate) {
    if (descEl) {
      descEl.innerHTML = `<span style="color:var(--color-accent-600); font-weight:var(--font-weight-bold)">⚠️ Existing records detected.</span> Create a profile to migrate and secure your data.`;
    }
  } else {
    if (descEl) {
      descEl.innerText = 'Add a profile to keep your grading sheets separated and secure.';
    }
  }
}

/**
 * Handles profile card clicks: starts passcode validation or unlocks immediately.
 */
let selectedProfileIdToUnlock = '';
function selectProfileCard(id) {
  const p = dbRoot.profiles.find(x => x.id === id);
  if (!p) return;
  
  if (!p.pinEnabled) {
    unlockProfileAndEnter(p, '');
  } else {
    selectedProfileIdToUnlock = id;
    showEl('profileSelectPanel', false);
    showEl('profileCreatePanel', false);
    showEl('profileUnlockPanel', true);
    
    document.getElementById('passcodeField').value = '';
    document.getElementById('unlockErrorMsg').innerText = '';
    document.getElementById('unlockTitle').innerText = `Unlock ${p.name}`;
    
    setTimeout(() => {
      document.getElementById('passcodeField').focus();
    }, 100);
  }
}

/**
 * Shows the profile selection list dashboard screen.
 */
function showProfileSelect() {
  selectedProfileIdToUnlock = '';
  showEl('profileUnlockPanel', false);
  showEl('profileCreatePanel', false);
  showEl('profileSelectPanel', true);
  renderProfiles();
}

/**
 * Processes PIN verification to unlock a secure profile.
 */
async function submitPasscode() {
  const pin = document.getElementById('passcodeField').value;
  const errorEl = document.getElementById('unlockErrorMsg');
  
  if (!pin || pin.length < 6 || !/^\d+$/.test(pin)) {
    if (errorEl) errorEl.innerText = 'Passcode must be a 6-digit numeric PIN.';
    return;
  }
  
  const p = dbRoot.profiles.find(x => x.id === selectedProfileIdToUnlock);
  if (!p) {
    if (errorEl) errorEl.innerText = 'Profile not found.';
    return;
  }
  
  const verified = await verifyPin(pin, p.salt, p.pinHash);
  if (verified) {
    p.currentPin = pin; // retain pin in session memory for backup encryption
    try {
      await unlockProfileAndEnter(p, pin);
    } catch (e) {
      if (errorEl) errorEl.innerText = e.message;
    }
  } else {
    if (errorEl) errorEl.innerText = 'Incorrect passcode PIN. Please try again.';
    document.getElementById('passcodeField').value = '';
    document.getElementById('passcodeField').focus();
  }
}

/**
 * Validates and registers a new profile.
 */
async function submitCreateProfile() {
  const nameInput = document.getElementById('createProfileName');
  const pinCheckbox = document.getElementById('createProfilePinEnabled');
  const pinInput = document.getElementById('createProfilePin');
  const pinConfirmInput = document.getElementById('createProfilePinConfirm');
  const errorEl = document.getElementById('createProfileErrorMsg');
  
  const name = trim(nameInput.value);
  if (!name) {
    if (errorEl) errorEl.innerText = 'Teacher / Profile Name is required.';
    return;
  }
  
  const pinEnabled = pinCheckbox.checked;
  let salt = '';
  let pinHash = '';
  let pin = '';
  
  if (pinEnabled) {
    pin = pinInput.value;
    const pinConfirm = pinConfirmInput.value;
    
    if (!pin || pin.length < 6 || !/^\d+$/.test(pin)) {
      if (errorEl) errorEl.innerText = 'PIN must be at least 6 numeric digits.';
      return;
    }
    
    if (pin !== pinConfirm) {
      if (errorEl) errorEl.innerText = 'PIN confirmations do not match.';
      return;
    }
    
    salt = generateSalt();
    pinHash = await hashPin(pin, salt);
  }
  
  const profileId = uid('profile');
  let profileData = {};
  
  if (legacyDataToMigrate) {
    profileData = legacyDataToMigrate;
    profileData.teacherName = name;
    legacyDataToMigrate = null;
    toast('Legacy class records successfully migrated to your new profile!', 'success');
  } else {
    profileData = {
      version: DB_VERSION,
      teacherName: name,
      schoolName: '',
      schoolYear: '2026-2027',
      currentAssignmentId: '',
      currentTerm: '1',
      activeView: 'dashboard',
      assignments: []
    };
  }
  
  const newProfile = {
    id: profileId,
    name: name,
    pinEnabled: pinEnabled,
    salt: salt,
    pinHash: pinHash,
    secondaryBackupPath: '',
    data: profileData
  };
  
  if (pinEnabled) {
    newProfile.currentPin = pin;
    const encryptedObj = await encryptPayload(JSON.stringify(profileData), pin);
    newProfile.data = encryptedObj;
  }
  
  dbRoot.profiles.push(newProfile);
  dbRoot.activeProfileId = profileId;
  
  await saveRootDatabase();
  await unlockProfileAndEnter(newProfile, pin);
}

/**
 * Loads profile workspace data and switches user interface view.
 */
async function unlockProfileAndEnter(profile, pin) {
  let decryptedData;
  if (profile.pinEnabled) {
    if (profile.data && (profile.data.secureBackup || profile.data.ciphertext)) {
      try {
        decryptedData = JSON.parse(await decryptPayload(profile.data, pin));
      } catch (err) {
        throw new Error("Incorrect PIN or corrupted profile data.");
      }
    } else {
      // Legacy PIN-enabled profile stored in plain text, migrate it
      decryptedData = profile.data;
    }
  } else {
    decryptedData = profile.data;
  }

  db = decryptedData;
  db.secondaryBackupPath = profile.secondaryBackupPath || '';
  dbRoot.activeProfileId = profile.id;
  currentProfilePin = pin || '';
  
  normalizeDatabase();
  showEl('profileOverlay', false);
  
  currentView = 'dashboard';
  recordTab = db.recordTab || db.currentTerm || '1';
  
  // Initialize spectator grades blur based on settings
  gradesBlurred = db.autoBlur || false;
  
  await saveDatabase();
  
  render();
  // checkWelcomeModal(); // Welcome modal is now shown on startup before profile login
  toast(`Welcome back, ${profile.name}!`, 'success');
}

/**
 * Saves current profile changes, clears authentication session, and returns to profile screen.
 */
async function logoutProfile() {
  await saveDatabase();
  
  currentProfilePin = '';
  dbRoot.activeProfileId = '';
  
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
  
  showEl('profileOverlay', true, 'flex');
  showProfileSelect();
  
  toast('Logged out successfully.', 'info');
}

/**
 * Handles checking for updates, verifying network status first.
 */
function handleCheckUpdatesClick() {
  const updateTextEl = document.getElementById('updateText');
  const indicatorEl = document.getElementById('updateIndicator');

  if (!navigator.onLine) {
    if (updateTextEl) {
      updateTextEl.innerText = 'Offline: Please check your internet connection and try again.';
    }
    if (indicatorEl) {
      indicatorEl.className = 'update-indicator update-indicator--error';
    }
    toast('No internet connection detected.', 'warning');
    return;
  }

  // Update status UI to checking state
  if (updateTextEl) {
    updateTextEl.innerText = 'Checking for updates…';
  }
  if (indicatorEl) {
    indicatorEl.className = 'update-indicator update-indicator--checking';
  }

  window.electronAPI.checkForUpdates();
}
