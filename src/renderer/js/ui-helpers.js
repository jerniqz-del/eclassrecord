/**
 * E-Class Record — UI Helper Functions
 *
 * Implements HTML escaping, clean toast notifications matching design tokens,
 * number formatting, and an overlay-based confirmation dialog.
 */

/**
 * Escapes HTML characters to prevent rendering bugs and raw XSS.
 * @param {*} value Any value to escape.
 * @returns {string} Safe HTML string.
 */
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns a subject color class suffix for a given subject name.
 * Matches common DepEd subject names case-insensitively.
 * @param {string} subject Subject name.
 * @returns {string} One of: english|filipino|math|science|ap|epp|mapeh|gmrc|default
 */
function subjectColorClass(subject) {
  if (!subject) return 'default';
  const s = subject.toLowerCase();
  if (/english/.test(s))                                            return 'english';
  if (/filipin|wika|komunikasyon/.test(s))                         return 'filipino';
  if (/math|matematika|numero/.test(s))                            return 'math';
  if (/science|siyensya|agham/.test(s))                            return 'science';
  if (/araling|panlipunan|\bap\b|hekasi|sibika/.test(s))           return 'ap';
  if (/\bepp\b|tle|technology|livelihood|edukasyong pantahanan/.test(s)) return 'epp';
  if (/mapeh|music|arts|physical|health/.test(s))                  return 'mapeh';
  if (/gmrc|good manners|values|edukasyon sa pagpapakatao|\besp\b/.test(s)) return 'gmrc';
  return 'default';
}

/**
 * Strips outer whitespace.
 */
function trim(s) {
  return String(s || '').trim();
}

/**
 * Parses values to floating point numbers, defaulting to 0.
 */
function number(value) {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

/**
 * Formats a decimal number up to 2 decimal places.
 */
function fmt(value) {
  if (isNaN(value) || value === null || value === undefined) return '';
  return Math.round(value * 100) / 100;
}

/**
 * Returns blank string instead of null/undefined.
 */
function blankNull(value) {
  return value === null || value === undefined ? '' : value;
}

/**
 * Returns blank string instead of numeric zero.
 */
function blankZero(value) {
  return value === 0 ? '' : value;
}

/**
 * Toggles element display.
 */
function showEl(id, on, displayType = 'block') {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = on ? displayType : 'none';
  }
}

/**
 * Returns a unique element ID.
 */
function uid(prefix = 'id') {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

/**
 * Returns empty state card markup.
 * @param {string} title
 * @param {string} hint
 * @param {string=} actionLabel Optional CTA button label.
 * @param {string=} actionCallback Optional JS expression to call on click.
 */
function emptyState(title, hint, actionLabel, actionCallback, secondActionLabel, secondActionCallback) {
  let buttonsHtml = '';
  if (actionLabel) {
    buttonsHtml += `<button class="btn btn-primary" style="padding: 8px 20px; font-size: var(--font-size-md);" onclick="${esc(actionCallback)}">${esc(actionLabel)}</button>`;
  }
  if (secondActionLabel) {
    buttonsHtml += `<button class="btn btn-olive" style="padding: 8px 20px; font-size: var(--font-size-md);" onclick="${esc(secondActionCallback)}">${esc(secondActionLabel)}</button>`;
  }
  
  const container = buttonsHtml ? `<div style="display:flex; justify-content:center; align-items:center; gap:var(--space-3); margin-top:var(--space-5);">${buttonsHtml}</div>` : '';

  return `
    <div class="empty-state animate-fade-in">
      <div class="empty-state__bg-glow-1"></div>
      <div class="empty-state__bg-glow-2"></div>
      <div class="empty-state__card">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div class="empty-state__title">${esc(title)}</div>
        <div class="empty-state__hint">${esc(hint)}</div>
        ${container}
      </div>
    </div>
  `;
}


/**
 * Creates and appends a floating toast message.
 * @param {string} message Text to display.
 * @param {string} kind Theme modifier (success, error, warning).
 */
function toast(message, kind = '') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) {
    alert(message);
    return;
  }
  
  const node = document.createElement('div');
  node.className = 'toast' + (kind ? ` toast--${kind}` : '');
  node.innerHTML = esc(message);
  wrap.appendChild(node);
  
  // Clean dismissal
  setTimeout(() => {
    node.classList.add('toast--exit');
    setTimeout(() => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 200);
  }, 3000);
}

/**
 * Modern confirm dialog wrapper using modal layouts.
 * @param {string} title Header title.
 * @param {string} message Description.
 * @param {function} onConfirm Callback function on confirmation.
 */
function confirmModal(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__title">${esc(title)}</div>
      <div class="modal__body">${esc(message)}</div>
      <div class="modal__actions">
        <button class="btn btn-ghost btn-sm" id="confirmModalCancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="confirmModalConfirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const cancelBtn = overlay.querySelector('#confirmModalCancel');
  const confirmBtn = overlay.querySelector('#confirmModalConfirm');
  
  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  
  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', () => {
    close();
    onConfirm();
  });
}

/**
 * Returns a debounced version of a function that delays invoking fn
 * until after waitMs milliseconds have elapsed since the last invocation.
 * @param {Function} fn Function to debounce.
 * @param {number} waitMs Delay in milliseconds.
 * @returns {Function} Debounced function.
 */
function debounce(fn, waitMs) {
  let timer = null;
  const debounced = function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), waitMs);
  };
  debounced.cancel = function () {
    clearTimeout(timer);
  };
  return debounced;
}

// ── Font Size Rocker ──────────────────────────────────────────────────────────

// MS Word-like Zoom Control Sizing
let zoomPercentage = 100;

/**
 * Initialises font size from localStorage and applies it.
 * Call once on app startup.
 */
function initFontSize() {
  const saved = parseInt(localStorage.getItem('ecr_zoom_pct'), 10);
  if (!isNaN(saved) && saved >= 50 && saved <= 200) {
    zoomPercentage = saved;
  } else {
    // Check legacy setting
    const savedStep = parseInt(localStorage.getItem('ecr_font_step'), 10);
    const FONT_STEPS = [80, 85, 90, 95, 100, 105, 110, 115, 120];
    if (!isNaN(savedStep) && savedStep >= 0 && savedStep < FONT_STEPS.length) {
      zoomPercentage = FONT_STEPS[savedStep];
    } else {
      zoomPercentage = 100;
    }
  }
  applyZoom();
  
  // Close zoom dropdown on click outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('zoomDropdownMenu');
    const labelBtn = document.getElementById('zoomLabel');
    if (dropdown && dropdown.style.display === 'block') {
      if (!dropdown.contains(e.target) && e.target !== labelBtn) {
        dropdown.style.display = 'none';
      }
    }
  });
}

/**
 * Adjusts zoom percentage by a delta.
 * @param {number} delta Amount to change (e.g. +5 or -5)
 */
function changeZoom(delta) {
  let next = zoomPercentage + delta;
  if (next < 50) next = 50;
  if (next > 200) next = 200;
  zoomPercentage = next;
  localStorage.setItem('ecr_zoom_pct', zoomPercentage);
  applyZoom();
}

/**
 * Set zoom percentage directly (for slider or dropdown options).
 * @param {number} pct Percentage (50-200)
 */
function setZoomPct(pct) {
  let val = parseInt(pct, 10);
  if (isNaN(val)) val = 100;
  if (val < 50) val = 50;
  if (val > 200) val = 200;
  zoomPercentage = val;
  localStorage.setItem('ecr_zoom_pct', zoomPercentage);
  applyZoom();
  
  const dropdown = document.getElementById('zoomDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
}

/**
 * Handles slider range inputs.
 */
function onZoomSliderInput(val) {
  setZoomPct(val);
}

/**
 * Toggles visibility of zoom presets dropdown menu.
 */
function toggleZoomMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('zoomDropdownMenu');
  if (dropdown) {
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
  }
}

/**
 * Applies current zoom percentage to document root.
 */
function applyZoom() {
  document.documentElement.style.fontSize = zoomPercentage + '%';
  document.documentElement.style.setProperty('--zoom-pct', zoomPercentage);
  
  const label = document.getElementById('zoomLabel');
  const slider = document.getElementById('zoomSlider');
  const btnDec = document.getElementById('zoomOutBtn');
  const btnInc = document.getElementById('zoomInBtn');
  
  if (label) label.textContent = zoomPercentage + '%';
  if (slider) slider.value = zoomPercentage;
  if (btnDec) btnDec.disabled = zoomPercentage <= 50;
  if (btnInc) btnInc.disabled = zoomPercentage >= 200;
  
  if (typeof adjustHpsStickyTop === 'function') {
    setTimeout(adjustHpsStickyTop, 0);
  }
}

// Legacy compatibility wrapper
function adjustFontSize(dir) {
  changeZoom(dir * 5);
}


/**
 * Modern modal-based alert popup.
 * @param {string} title Header title.
 * @param {string} message Description.
 * @param {function=} onOk Optional callback function executed on confirmation.
 */
function alertModal(title, message, onOk) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__title">${esc(title)}</div>
      <div class="modal__body">${esc(message)}</div>
      <div class="modal__actions">
        <button class="btn btn-primary btn-sm" id="alertModalOk">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const okBtn = overlay.querySelector('#alertModalOk');
  
  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (typeof onOk === 'function') onOk();
  };
  
  okBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

/**
 * Checks if the welcome modal should be shown on startup.
 * Called during DOMContentLoaded.
 */
async function checkWelcomeModal() {
  // 1. Get current version and populate title version badge
  let currentVersion = '1.0.0';
  if (window.electronAPI && window.electronAPI.getVersion) {
    currentVersion = await window.electronAPI.getVersion();
  }
  const currentVerEl = document.getElementById('welcomeCurrentVersion');
  if (currentVerEl) {
    currentVerEl.textContent = 'v' + currentVersion.replace(/^v/, '');
  }

  // 2. Populate dynamically if changelog exists
  if (typeof APP_CHANGELOG !== 'undefined' && APP_CHANGELOG && APP_CHANGELOG.points && APP_CHANGELOG.points.length > 0) {
    const versionEl = document.getElementById('whatsNewVersion');
    const listEl = document.getElementById('whatsNewList');
    const sectionEl = document.getElementById('welcomeWhatsNew');
    
    if (versionEl) versionEl.textContent = APP_CHANGELOG.version;
    if (listEl) {
      listEl.innerHTML = APP_CHANGELOG.points.map(p => `<li>${esc(p)}</li>`).join('');
    }
    if (sectionEl) sectionEl.style.display = 'block';
  }

  // 3. Determine whether to force show due to new version
  let forceShow = false;
  if (typeof APP_CHANGELOG !== 'undefined' && APP_CHANGELOG && APP_CHANGELOG.version) {
    const lastSeenVersion = localStorage.getItem('welcome_last_seen_version');
    if (lastSeenVersion !== APP_CHANGELOG.version) {
      forceShow = true;
      // Reset dismissed settings to allow daily display rules for the new version
      localStorage.removeItem('welcome_modal_dismissed_until');
    }
  }

  // 4. Check for updates on GitHub (if online)
  if (navigator.onLine) {
    fetchLatestGitHubVersion(currentVersion);
  }

  const dismissedUntil = localStorage.getItem('welcome_modal_dismissed_until');
  const todayString = new Date().toDateString();
  const shouldShow = forceShow || dismissedUntil !== todayString;

  if (shouldShow) {
    showEl('profileOverlay', false);
    showEl('welcomeModal', true, 'flex');
  } else {
    // Show login screen overlay directly if welcome modal is skipped
    showEl('welcomeModal', false);
    if (typeof checkTourPrompt === 'function') {
      const promptShown = checkTourPrompt();
      if (!promptShown) {
        showProfileOverlayAfterWelcome();
      }
    } else {
      showProfileOverlayAfterWelcome();
    }
  }
}

/**
 * Semver comparison helper. Returns true if latest > current.
 */
function isNewerVersion(latest, current) {
  const parse = v => v.replace(/^v/, '').split('.').map(Number);
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lVal = l[i] || 0;
    const cVal = c[i] || 0;
    if (lVal > cVal) return true;
    if (lVal < cVal) return false;
  }
  return false;
}

/**
 * Queries GitHub API for the latest release tag.
 */
function fetchLatestGitHubVersion(currentVersion) {
  fetch('https://api.github.com/repos/jerniqz-del/eclassrecord/releases/latest')
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch latest release metadata.');
      return res.json();
    })
    .then(data => {
      if (data && data.tag_name) {
        const latestVersion = data.tag_name.replace(/^v/, '');
        const currentClean = currentVersion.replace(/^v/, '');
        if (isNewerVersion(latestVersion, currentClean)) {
          const latestVerEl = document.getElementById('welcomeLatestVersion');
          if (latestVerEl) latestVerEl.textContent = latestVersion;
          showEl('welcomeUpdateBanner', true, 'flex');
        }
      }
    })
    .catch(err => {
      console.warn('Silent fallback: Welcome modal update check failed:', err);
    });
}

/**
 * Hides the welcome update banner.
 */
function dismissWelcomeUpdate() {
  showEl('welcomeUpdateBanner', false);
}

/**
 * Triggers the update downloader, closes welcome modal, and redirects to settings.
 */
function triggerWelcomeUpdate() {
  toast('Checking and downloading update… Go to Settings to view progress.', 'info');
  if (window.electronAPI && window.electronAPI.checkForUpdates) {
    window.electronAPI.checkForUpdates();
  }
  closeWelcomeModal();
  if (typeof setView === 'function') {
    setView('settings');
  }
}

/**
 * Saves preference and closes the welcome modal on click of the Close button.
 */
function closeWelcomeModal() {
  console.log("closeWelcomeModal called");
  const checkbox = document.getElementById('welcomeDoNotShowCheckbox');
  if (checkbox && checkbox.checked) {
    const todayString = new Date().toDateString();
    localStorage.setItem('welcome_modal_dismissed_until', todayString);
  }
  
  // Record that user has seen this version's welcome modal
  if (typeof APP_CHANGELOG !== 'undefined' && APP_CHANGELOG && APP_CHANGELOG.version) {
    localStorage.setItem('welcome_last_seen_version', APP_CHANGELOG.version);
  }

  showEl('welcomeModal', false);

  if (typeof checkTourPrompt === 'function') {
    const promptShown = checkTourPrompt();
    if (!promptShown) {
      showProfileOverlayAfterWelcome();
    }
  } else {
    showProfileOverlayAfterWelcome();
  }
}

function showProfileOverlayAfterWelcome() {
  const profileOverlay = document.getElementById('profileOverlay');
  if (profileOverlay && (profileOverlay.style.display === 'none' || profileOverlay.style.display === '')) {
    showEl('profileOverlay', true, 'flex');
    if (typeof showProfileSelect === 'function' && typeof showCreateProfileForm === 'function') {
      const hasProfiles = (typeof dbRoot !== 'undefined' && dbRoot.profiles && dbRoot.profiles.length > 0);
      const hasLegacy = (typeof legacyDataToMigrate !== 'undefined' && legacyDataToMigrate !== null);
      if (hasLegacy || !hasProfiles) {
        showCreateProfileForm();
      } else {
        showProfileSelect();
      }
    }
  }
}

// ── Sidebar Resizing and Collapse ──────────────────────────────────────────

/**
 * Initializes resizable and collapsible sidebar logic.
 * Reads saved state from localStorage and attaches drag listeners.
 */
function initSidebarResizer() {
  const isCollapsed = localStorage.getItem('ecr_sidebar_collapsed') === 'true';
  const savedWidth = parseInt(localStorage.getItem('ecr_sidebar_width'), 10) || 262;

  if (isCollapsed) {
    document.body.classList.add('sidebar--collapsed');
    document.documentElement.style.setProperty('--sidebar-width', '64px');
  } else {
    document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
  }

  updateSidebarToggleIcon(isCollapsed);

  const resizer = document.getElementById('sidebarResizer');
  if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
      // Ignore if not primary click
      if (e.button !== 0) return;
      e.preventDefault();
      document.body.classList.add('is-resizing-sidebar');

      const onMouseMove = (moveEvent) => {
        let newWidth = moveEvent.clientX;
        if (newWidth < 150) {
          // Snap to collapsed
          document.body.classList.add('sidebar--collapsed');
          document.documentElement.style.setProperty('--sidebar-width', '64px');
          localStorage.setItem('ecr_sidebar_collapsed', 'true');
          updateSidebarToggleIcon(true);
        } else {
          // Expand and resize
          if (newWidth < 180) newWidth = 180;
          if (newWidth > 450) newWidth = 450;
          document.body.classList.remove('sidebar--collapsed');
          document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
          localStorage.setItem('ecr_sidebar_width', newWidth);
          localStorage.setItem('ecr_sidebar_collapsed', 'false');
          updateSidebarToggleIcon(false);
        }
      };

      const onMouseUp = () => {
        document.body.classList.remove('is-resizing-sidebar');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Double-click to toggle collapse state
    resizer.addEventListener('dblclick', () => {
      toggleSidebarCollapse();
    });
  }
}

/**
 * Toggles the sidebar collapse state.
 */
function toggleSidebarCollapse() {
  const isCollapsed = document.body.classList.contains('sidebar--collapsed');
  if (isCollapsed) {
    // Expand
    document.body.classList.remove('sidebar--collapsed');
    const savedWidth = parseInt(localStorage.getItem('ecr_sidebar_width'), 10) || 262;
    document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
    localStorage.setItem('ecr_sidebar_collapsed', 'false');
    updateSidebarToggleIcon(false);
  } else {
    // Collapse
    document.body.classList.add('sidebar--collapsed');
    document.documentElement.style.setProperty('--sidebar-width', '64px');
    localStorage.setItem('ecr_sidebar_collapsed', 'true');
    updateSidebarToggleIcon(true);
  }
}

/**
 * Updates the toggle button icon and title based on state.
 */
function updateSidebarToggleIcon(collapsed) {
  const icon = document.getElementById('sidebarToggleIcon');
  if (icon) {
    if (collapsed) {
      // chevron-right
      icon.innerHTML = `<polyline points="9 18 15 12 9 6"></polyline>`;
    } else {
      // chevron-left
      icon.innerHTML = `<polyline points="15 18 9 12 15 6"></polyline>`;
    }
  }
  const toggleBtn = document.getElementById('sidebarToggle');
  if (toggleBtn) {
    toggleBtn.title = collapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
  }
}

