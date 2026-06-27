/**
 * E-Class Record App — Guided Interactive Tour Controller
 * Manages steps, transitions views, highlights targets, and renders descriptive popovers.
 * Injects realistic mock data during the tour to ensure all components are fully visual.
 */

let currentTourStepIndex = 0;
let originalDbBackup = null;

const TOUR_STEPS = [
  {
    title: 'Sidebar Navigation Drawer',
    selector: '.sidebar',
    view: 'dashboard',
    align: 'right',
    body: 'This is your main navigation panel. Switch between the Dashboard, Teaching Load management, and the active Grading Sheets. You can also access settings and help from here.'
  },
  {
    title: 'Dashboard Overview',
    selector: '.view-section[data-view="dashboard"]',
    view: 'dashboard',
    align: 'bottom',
    body: 'The Dashboard gives you a bird\'s-eye view of all configured teaching loads for the active school year. It displays registered boy/girl counts and general performance statistics.'
  },
  {
    title: 'School Profile & Policy',
    selector: '#currentMeta',
    view: 'dashboard',
    align: 'bottom',
    body: 'Switch the active School Year here. This bar also displays your School Name, School ID, and active DepEd grading rules (e.g. transitional quarterly or trimester systems).'
  },
  {
    title: 'Class Selection Dropdown',
    selector: '#classesClassSelect',
    view: 'classes',
    align: 'bottom',
    body: 'Use this dropdown to switch the active class load section. The Class Roster and other controls below will instantly filter to match your selected section.'
  },
  {
    title: 'Teaching Load Actions',
    selector: '#classesActionsCard',
    view: 'classes',
    align: 'bottom',
    body: 'Manage your active load using these buttons. You can proceed directly to grading, upload official DepEd SF1 Excel spreadsheets, or copy rosters from other class sections.'
  },
  {
    title: 'Roster Manual Entry & Sort',
    selector: '#classesRosterHeader',
    view: 'classes',
    align: 'bottom',
    body: 'Add individual students manually using the "Add Learner" button. Click "Sort Roster" to automatically arrange students alphabetically and group them by gender (boys first, then girls).'
  },
  {
    title: 'Roster Management & Transfers',
    selector: '#classRosterContainer',
    view: 'classes',
    align: 'top',
    body: 'This scrollable list displays your registered students. Click "Manage" on any student to edit profiles, remove records, or perform a direct transfer of the learner (with grades) to another class section.'
  },
  {
    title: 'Term Sheets Selector',
    selector: '#recordTabs',
    view: 'record',
    align: 'bottom',
    body: 'In the Grading Sheet, navigate between Term 1, Term 2, Term 3, and the Final Summary. Dynamic sub-tabs will automatically appear for subjects like MAPEH.'
  },
  {
    title: 'Grading Sheet Grid',
    selector: '#classRecordPanel',
    view: 'record',
    align: 'top',
    body: 'Click directly inside cells to input scores for Written Works, Performance Task, Summative Assessment, and Term Examination. Calculations update weighted averages in real-time.'
  },
  {
    title: 'Grading Sheet Toolbar',
    selector: '#recordActionsCard',
    view: 'record',
    align: 'bottom',
    body: 'Access shortcuts here to reverse mistakes (Undo/Redo), view detailed individual student progress report cards, download PDFs, print grading sheets, or open the sequential Quick Grade Entry wizard.'
  },
  {
    title: 'Privacy Spectator Mode',
    selector: '#blurToggleBtn',
    view: 'record',
    align: 'bottom',
    body: 'Present grading sheets in class securely. Toggle the "Blur Grades" eyeball button to obscure all scores and averages from onlookers. Turn it off to reveal grades again.'
  },
  {
    title: 'App Settings & Backup Preferences',
    selector: '#navSettings',
    view: 'settings',
    align: 'right',
    body: 'Configure your profile details (School ID, region, division), specify cloud-synced auto-backup paths, enable numerical equivalent ranges (Annex C), configure trimester rules, or check for updates.'
  }
];

function checkTourPrompt() {
  const disabled = localStorage.getItem('tour_prompts_disabled') === 'true';
  const dismissedUntil = localStorage.getItem('tour_prompt_dismissed_until');
  const todayString = new Date().toDateString();

  // If the welcome modal is active, wait until it closes
  const welcomeModal = document.getElementById('welcomeModal');
  if (welcomeModal && welcomeModal.style.display !== 'none') {
    return false;
  }

  if (disabled || dismissedUntil === todayString) {
    return false;
  }

  showTourPromptModal(true);
  return true;
}

function showTourPromptModal(show) {
  const modal = document.getElementById('tourPromptModal');
  if (modal) {
    modal.style.display = show ? 'flex' : 'none';
  }
}

function dismissTourPrompt() {
  const checkbox = document.getElementById('tourDoNotShowCheckbox');
  if (checkbox && checkbox.checked) {
    const todayString = new Date().toDateString();
    localStorage.setItem('tour_prompt_dismissed_until', todayString);
  }

  const permanentCheckbox = document.getElementById('tourDisablePermanentCheckbox');
  if (permanentCheckbox && permanentCheckbox.checked) {
    localStorage.setItem('tour_prompts_disabled', 'true');
    // Sync settings checkbox if rendered
    const settingsCheck = document.getElementById('settingEnableTourPrompt');
    if (settingsCheck) {
      settingsCheck.checked = false;
    }
  }

  showTourPromptModal(false);

  // Since we skipped the tour prompt, if user is not logged in, show the profile select/create screen
  const hasActiveProfile = (typeof sessionActive !== 'undefined' && sessionActive);
  if (!hasActiveProfile) {
    if (typeof showProfileOverlayAfterWelcome === 'function') {
      showProfileOverlayAfterWelcome();
    }
  }
}

function toggleTourPromptSetting(checked) {
  localStorage.setItem('tour_prompts_disabled', checked ? 'false' : 'true');
  const settingsCheck = document.getElementById('settingEnableTourPrompt');
  if (settingsCheck) {
    settingsCheck.checked = checked;
  }
}

function acceptTourPrompt() {
  dismissTourPrompt();
  startAppTour();
}

function startAppTour() {
  currentTourStepIndex = 0;

  // Hide profileOverlay if active so mockup views are visible
  const profileOverlay = document.getElementById('profileOverlay');
  if (profileOverlay) {
    profileOverlay.style.display = 'none';
  }

  // 1. Back up original database state in memory
  if (typeof db !== 'undefined' && db) {
    originalDbBackup = JSON.parse(JSON.stringify(db));
    
    // 2. Inject mockup profile, class, and learners data
    db.teacherName = "MOCK TEACHER DELA CRUZ";
    db.schoolName = "Tour Sample Elementary School";
    db.schoolId = "300123";
    db.region = "REGION IV-A";
    db.division = "CAVITE";
    db.schoolYear = "2026-2027";
    
    db.assignments = [
      {
        id: 'tour-mock-class',
        gradeLevel: '4',
        section: 'A-Tour',
        subject: 'Science',
        policy: 'KEY_STAGE_2_TRIMESTER',
        subjectGroup: 'KS2_TRIMESTER',
        schoolYear: '2026-2027',
        learners: [
          { id: 'tour-l-1', lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan', sex: 'M' },
          { id: 'tour-l-2', lrn: '123456789013', lastName: 'Dela Cruz', firstName: 'Maria', sex: 'F' },
          { id: 'tour-l-3', lrn: '123456789014', lastName: 'Santos', firstName: 'Pedro', sex: 'M' },
          { id: 'tour-l-4', lrn: '123456789015', lastName: 'Reyes', firstName: 'Ana', sex: 'F' }
        ],
        assessments: [
          { id: 'tour-a-1', component: 'WW', title: 'WW 1', maxScore: 20, term: '1' },
          { id: 'tour-a-2', component: 'WW', title: 'WW 2', maxScore: 20, term: '1' },
          { id: 'tour-a-3', component: 'PT', title: 'PT 1', maxScore: 50, term: '1' }
        ],
        scores: {
          'tour-l-1|tour-a-1': 18,
          'tour-l-2|tour-a-1': 19,
          'tour-l-3|tour-a-1': 15,
          'tour-l-4|tour-a-1': 20,
          'tour-l-1|tour-a-2': 17,
          'tour-l-2|tour-a-2': 18,
          'tour-l-1|tour-a-3': 45,
          'tour-l-2|tour-a-3': 48
        }
      }
    ];
    db.currentAssignmentId = 'tour-mock-class';
    db.currentTerm = '1';
    db.recordTab = '1';

    // Refresh UI rendering for mock data representation
    if (typeof render === 'function') {
      render();
    }
  }

  // Uncollapse sidebar if collapsed to make sure it's highlightable
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('sidebar--collapsed')) {
    if (typeof toggleSidebarCollapse === 'function') {
      toggleSidebarCollapse();
    }
  }

  // Show blocker & overlay
  const blocker = document.getElementById('tourClickBlocker');
  const overlay = document.getElementById('tourHighlightOverlay');
  if (blocker) blocker.style.display = 'block';
  if (overlay) overlay.style.display = 'block';

  renderTourStep();
}

function renderTourStep() {
  if (currentTourStepIndex < 0 || currentTourStepIndex >= TOUR_STEPS.length) {
    exitTour();
    return;
  }

  const step = TOUR_STEPS[currentTourStepIndex];

  // 1. Switch View if needed
  if (step.view && typeof setView === 'function') {
    setView(step.view);
  }

  // Wait for the view transitions and rendering
  setTimeout(() => {
    // 2. Find target element
    let targetEl = document.querySelector(step.selector);

    // Fallback if element is not found, not visible, or offsetWidth is zero
    if (!targetEl || targetEl.offsetWidth === 0 || targetEl.offsetHeight === 0) {
      // Fallback to the active view section
      targetEl = document.querySelector(`.view-section[data-view="${currentView}"]`);
    }

    if (!targetEl) {
      targetEl = document.querySelector('.sidebar') || document.body;
    }

    // Scroll element into view if needed
    if (typeof targetEl.scrollIntoView === 'function') {
      targetEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }

    // Recalculate position after scroll settles
    setTimeout(() => {
      const rect = targetEl.getBoundingClientRect();

      // 3. Highlight target element
      const overlay = document.getElementById('tourHighlightOverlay');
      if (overlay) {
        // Expand highlight slightly for aesthetics
        const padding = 4;
        overlay.style.top = `${rect.top + window.scrollY - padding}px`;
        overlay.style.left = `${rect.left + window.scrollX - padding}px`;
        overlay.style.width = `${rect.width + padding * 2}px`;
        overlay.style.height = `${rect.height + padding * 2}px`;
      }

      // 4. Update Popover Content
      const titleEl = document.getElementById('tourPopoverTitle');
      const bodyEl = document.getElementById('tourPopoverBody');
      const countEl = document.getElementById('tourPopoverStepCount');
      const dotsEl = document.getElementById('tourPopoverDots');

      if (titleEl) titleEl.textContent = step.title;
      if (bodyEl) bodyEl.textContent = step.body;
      if (countEl) countEl.textContent = `Step ${currentTourStepIndex + 1} of ${TOUR_STEPS.length}`;

      // Render dots
      if (dotsEl) {
        dotsEl.innerHTML = TOUR_STEPS.map((s, idx) => `
          <span class="tour-popover__dot ${idx === currentTourStepIndex ? 'tour-popover__dot--active' : ''}"></span>
        `).join('');
      }

      // 5. Update Navigation Buttons
      const prevBtn = document.getElementById('tourBtnPrev');
      const nextBtn = document.getElementById('tourBtnNext');

      if (prevBtn) {
        prevBtn.style.display = currentTourStepIndex === 0 ? 'none' : 'block';
      }

      if (nextBtn) {
        if (currentTourStepIndex === TOUR_STEPS.length - 1) {
          nextBtn.textContent = 'Finish';
        } else {
          nextBtn.textContent = 'Next \u2192';
        }
      }

      // 6. Position Popover
      positionPopover(targetEl, step.align);
    }, 120);
  }, 250);
}

function positionPopover(targetEl, preferredAlign = 'bottom') {
  const popover = document.getElementById('tourPopover');
  if (!popover || !targetEl) return;

  const rect = targetEl.getBoundingClientRect();
  const popWidth = popover.offsetWidth || 320;
  const popHeight = popover.offsetHeight || 150;

  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  let top = 0;
  let left = 0;
  let align = preferredAlign;

  // Basic boundary checks (if top is not enough space, flip to bottom)
  if (align === 'top' && rect.top - popHeight - 16 < 0) {
    align = 'bottom';
  } else if (align === 'bottom' && rect.bottom + popHeight + 16 > window.innerHeight) {
    align = 'top';
  }

  if (align === 'top') {
    top = rect.top + scrollY - popHeight - 12;
    left = rect.left + scrollX + (rect.width - popWidth) / 2;
  } else if (align === 'bottom') {
    top = rect.bottom + scrollY + 12;
    left = rect.left + scrollX + (rect.width - popWidth) / 2;
  } else if (align === 'left') {
    top = rect.top + scrollY + (rect.height - popHeight) / 2;
    left = rect.left + scrollX - popWidth - 12;
  } else if (align === 'right') {
    top = rect.top + scrollY + (rect.height - popHeight) / 2;
    left = rect.right + scrollX + 12;
  }

  // Make sure popover doesn't overflow screen bounds horizontally
  const padding = 16;
  if (left < padding) {
    left = padding;
  } else if (left + popWidth > window.innerWidth - padding) {
    left = window.innerWidth - popWidth - padding;
  }

  // Make sure popover doesn't overflow screen bounds vertically
  if (top < padding) {
    top = padding;
  }

  popover.className = `tour-popover tour-popover--${align}`;
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.display = 'flex';
}

function nextTourStep() {
  currentTourStepIndex++;
  renderTourStep();
}

function prevTourStep() {
  currentTourStepIndex--;
  renderTourStep();
}

function skipTour() {
  exitTour();
}

function exitTour() {
  const blocker = document.getElementById('tourClickBlocker');
  const overlay = document.getElementById('tourHighlightOverlay');
  const popover = document.getElementById('tourPopover');

  if (blocker) blocker.style.display = 'none';
  if (overlay) overlay.style.display = 'none';
  if (popover) popover.style.display = 'none';

  // 3. Restore original database state
  if (originalDbBackup) {
    db = JSON.parse(JSON.stringify(originalDbBackup));
    originalDbBackup = null;
  }

  const hasActiveProfile = (typeof sessionActive !== 'undefined' && sessionActive);
  if (!hasActiveProfile) {
    if (typeof showProfileOverlayAfterWelcome === 'function') {
      showProfileOverlayAfterWelcome();
    }
  } else {
    // Return to dashboard
    if (typeof setView === 'function') {
      setView('dashboard');
    }

    // Refresh UI to display active user profile records
    if (typeof render === 'function') {
      render();
    }
  }

  toast('App tour completed!', 'success');
}
