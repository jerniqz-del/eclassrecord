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
 * Toggles element display block/none.
 */
function showEl(id, on) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = on ? 'block' : 'none';
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
    ? `<button class="btn btn-primary btn-sm" style="margin-top:var(--space-4)" onclick="${esc(actionCallback)}">${esc(actionLabel)}</button>`
    : '';
  return `
    <div class="empty-state animate-slide-up">
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
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), waitMs);
  };
}
