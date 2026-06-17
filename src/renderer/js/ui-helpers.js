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
function emptyState(title, hint, actionLabel, actionCallback) {
  const btn = actionLabel
    ? `<button class="btn btn-primary" style="margin-top:var(--space-5); padding: 8px 20px; font-size: var(--font-size-md);" onclick="${esc(actionCallback)}">${esc(actionLabel)}</button>`
    : '';
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
        ${btn}
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

const FONT_STEPS = [80, 85, 90, 95, 100, 105, 110, 115, 120];
const FONT_DEFAULT_IDX = 4; // 100%
let fontStepIndex = FONT_DEFAULT_IDX;

/**
 * Initialises font size from localStorage and applies it.
 * Call once on app startup.
 */
function initFontSize() {
  const saved = parseInt(localStorage.getItem('ecr_font_step'), 10);
  fontStepIndex = (!isNaN(saved) && saved >= 0 && saved < FONT_STEPS.length)
    ? saved
    : FONT_DEFAULT_IDX;
  applyFontSize();
}

/**
 * Steps the font size up (+1) or down (-1).
 * @param {number} dir +1 to increase, -1 to decrease.
 */
function adjustFontSize(dir) {
  const next = fontStepIndex + dir;
  if (next < 0 || next >= FONT_STEPS.length) return;
  fontStepIndex = next;
  localStorage.setItem('ecr_font_step', fontStepIndex);
  applyFontSize();
}

/**
 * Applies the current font step to the document root and updates the label/buttons.
 */
function applyFontSize() {
  const pct = FONT_STEPS[fontStepIndex];
  document.documentElement.style.fontSize = pct + '%';

  const label = document.getElementById('fontSizeLabel');
  const btnDec = document.getElementById('fontDecrease');
  const btnInc = document.getElementById('fontIncrease');

  if (label) label.textContent = pct + '%';
  if (btnDec) btnDec.disabled = fontStepIndex === 0;
  if (btnInc) btnInc.disabled = fontStepIndex === FONT_STEPS.length - 1;
  
  if (typeof adjustHpsStickyTop === 'function') {
    setTimeout(adjustHpsStickyTop, 0);
  }
}

/**
 * Modern modal-based alert popup.
 * @param {string} title Header title.
 * @param {string} message Description.
 */
function alertModal(title, message) {
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
function checkWelcomeModal() {
  const dismissedUntil = localStorage.getItem('welcome_modal_dismissed_until');
  const todayString = new Date().toDateString();
  if (dismissedUntil !== todayString) {
    showEl('welcomeModal', true, 'flex');
  }
}

/**
 * Saves preference and closes the welcome modal on click of the Close button.
 */
function closeWelcomeModal() {
  const checkbox = document.getElementById('welcomeDoNotShowCheckbox');
  if (checkbox && checkbox.checked) {
    const todayString = new Date().toDateString();
    localStorage.setItem('welcome_modal_dismissed_until', todayString);
  }
  showEl('welcomeModal', false);

  // If the profile overlay is currently hidden (e.g., during startup when welcome modal is active),
  // we now show the profile overlay / login screen.
  const profileOverlay = document.getElementById('profileOverlay');
  if (profileOverlay && profileOverlay.style.display === 'none') {
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
