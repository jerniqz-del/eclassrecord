/**
 * E-Class Record App — Guided Interactive Tour Controller
 * Manages steps, transitions views, highlights targets, and renders descriptive popovers.
 * Injects realistic mock data during the tour to ensure all components are fully visual.
 */

let currentTourStepIndex = 0;
let originalDbBackup = null;
let activeTourKind = 'app';
let activeTourSteps = [];

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

function backupSettingsTourSteps() {
  const profile = typeof activeProfile === 'function' ? activeProfile() : null;
  const hasRecoveryId = Boolean(profile?.backupRecoveryId);
  const steps = [
    {
      title: 'OneDrive Backup & Sync',
      selector: '.backup-sync-card',
      view: 'settings',
      align: 'top',
      body: 'This card contains the complete OneDrive backup and multi-PC workflow. The tour only explains these controls and will not create an ID, select a folder, change a profile, or write synchronization files.'
    },
    {
      title: 'Backup and Sync Status',
      selector: '#sharedSyncSettingsStatus',
      view: 'settings',
      align: 'bottom',
      body: 'Check this message first. Local saving remains active even when OneDrive is not configured, unavailable, or waiting for synchronization.'
    },
    {
      title: 'Backup Recovery ID',
      selector: '#backupRecoverySearchInput',
      view: 'settings',
      align: 'bottom',
      body: hasRecoveryId
        ? 'This profile already has a Recovery ID. It identifies the encrypted OneDrive repository used by this profile, but the profile PIN is still required to decrypt records.'
        : 'On another PC, paste the Recovery ID copied from the main PC here. Leave it empty when this is the main PC and you are creating a new synchronization identity.'
    }
  ];

  if (hasRecoveryId) {
    steps.push(
      {
        title: 'Copy the Existing ID',
        selector: '#btnCopyBackupRecoveryId',
        view: 'settings',
        align: 'bottom',
        body: 'Copy this Recovery ID when connecting the same encrypted profile on another PC. Keep the profile PIN separately because the ID alone cannot open the records.'
      },
      {
        title: 'Resume OneDrive Sync',
        selector: '#btnSharedSyncToggle',
        view: 'settings',
        align: 'bottom',
        body: 'If synchronization is disconnected on this PC, use this control to select the corresponding local OneDrive folder and resume only after the existing repository has been scanned.'
      }
    );
  } else {
    steps.push(
      {
        title: 'Create an ID on the Main PC',
        selector: '#btnSharedSyncToggle',
        view: 'settings',
        align: 'bottom',
        body: 'Use Create New ID only on the PC that already contains the records you want to keep. The app verifies the PIN and OneDrive folder before committing the new identity.'
      },
      {
        title: 'Connect an Existing ID',
        selector: '#btnSharedSyncConnect',
        view: 'settings',
        align: 'bottom',
        body: 'On PC2 or PC3, paste the ID from the main PC and select Connect Existing ID. The app scans without writing, requires the original profile PIN, and asks you to review any differences.'
      }
    );
  }

  steps.push(
    {
      title: 'Profiles Found in OneDrive',
      selector: '.backup-found',
      view: 'settings',
      align: 'top',
      body: 'This list automatically discovers valid E-Class Record backups and synchronized profiles in detected OneDrive folders. Match both the profile name and Recovery ID before connecting or restoring.'
    },
    {
      title: 'Advanced Device Controls',
      selector: '.backup-sync-advanced',
      view: 'settings',
      align: 'top',
      body: 'Open this section to check OneDrive now, review incoming changes, rename this device, disconnect this PC, find a backup manually, or manage a separate local backup folder.'
    },
    {
      title: 'Detailed OneDrive Guide',
      selector: '#btnOpenOneDriveTutorial',
      view: 'settings',
      align: 'top',
      body: 'Open the full step-by-step guide whenever you need the main-PC setup, PC2/PC3 connection, Files On-Demand, offline use, troubleshooting, or safety instructions.'
    }
  );

  return steps;
}

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
  activeTourKind = 'app';
  activeTourSteps = TOUR_STEPS;

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

function startBackupSettingsTour() {
  currentTourStepIndex = 0;
  activeTourKind = 'backup-settings';
  activeTourSteps = backupSettingsTourSteps();
  originalDbBackup = null;

  if (typeof setView === 'function') {
    setView('settings');
  }

  const blocker = document.getElementById('tourClickBlocker');
  const overlay = document.getElementById('tourHighlightOverlay');
  if (blocker) blocker.style.display = 'block';
  if (overlay) overlay.style.display = 'block';

  renderTourStep();
}

function renderTourStep() {
  const steps = activeTourSteps.length ? activeTourSteps : TOUR_STEPS;
  if (currentTourStepIndex < 0 || currentTourStepIndex >= steps.length) {
    exitTour();
    return;
  }

  const step = steps[currentTourStepIndex];

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
      if (countEl) countEl.textContent = `Step ${currentTourStepIndex + 1} of ${steps.length}`;

      // Render dots
      if (dotsEl) {
        dotsEl.innerHTML = steps.map((s, idx) => `
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
        if (currentTourStepIndex === steps.length - 1) {
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
  const padding = 16;
  const gap = 12;
  popover.style.maxWidth = `${Math.max(220, window.innerWidth - (padding * 2))}px`;
  popover.style.maxHeight = `${Math.max(180, window.innerHeight - (padding * 2))}px`;
  const popWidth = Math.min(popover.offsetWidth || 320, window.innerWidth - (padding * 2));
  const popHeight = Math.min(popover.offsetHeight || 150, window.innerHeight - (padding * 2));

  let top = 0;
  let left = 0;
  let align = preferredAlign;

  if (align === 'top' && rect.top - popHeight - gap < padding) {
    align = 'bottom';
  } else if (align === 'bottom' && rect.bottom + popHeight + gap > window.innerHeight - padding) {
    align = 'top';
  } else if (align === 'left' && rect.left - popWidth - gap < padding) {
    align = 'right';
  } else if (align === 'right' && rect.right + popWidth + gap > window.innerWidth - padding) {
    align = 'left';
  }

  if (align === 'top') {
    top = rect.top - popHeight - gap;
    left = rect.left + (rect.width - popWidth) / 2;
  } else if (align === 'bottom') {
    top = rect.bottom + gap;
    left = rect.left + (rect.width - popWidth) / 2;
  } else if (align === 'left') {
    top = rect.top + (rect.height - popHeight) / 2;
    left = rect.left - popWidth - gap;
  } else if (align === 'right') {
    top = rect.top + (rect.height - popHeight) / 2;
    left = rect.right + gap;
  }

  left = Math.min(Math.max(left, padding), Math.max(padding, window.innerWidth - popWidth - padding));
  top = Math.min(Math.max(top, padding), Math.max(padding, window.innerHeight - popHeight - padding));

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
  exitTour(false);
}

function exitTour(completed = true) {
  const finishedTourKind = activeTourKind;
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

  if (finishedTourKind === 'backup-settings') {
    if (typeof setView === 'function') {
      setView('settings');
    }
  } else {
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
  }

  activeTourKind = 'app';
  activeTourSteps = [];
  if (completed) {
    toast(finishedTourKind === 'backup-settings' ? 'Backup settings tour completed!' : 'App tour completed!', 'success');
  }
}

window.startBackupSettingsTour = startBackupSettingsTour;
