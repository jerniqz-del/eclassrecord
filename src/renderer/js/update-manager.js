(function initUpdateManagerModule(globalScope) {
  'use strict';

  const PREFERENCES_KEY = 'eclass_update_preferences_v1';
  const LAST_CHECK_KEY = 'eclass_update_last_automatic_check_v1';
  const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const STARTUP_DELAY_MS = 8000;
  const LOW_SPEC_STARTUP_DELAY_MS = 30000;
  let initialized = false;
  let startupTimer = null;
  let downloadedVersion = '';

  function storage() {
    try {
      return globalScope.localStorage || null;
    } catch (_error) {
      return null;
    }
  }

  function readPreferences() {
    try {
      const parsed = JSON.parse(storage()?.getItem(PREFERENCES_KEY) || '{}');
      return {
        autoCheck: parsed.autoCheck !== false,
        autoDownload: parsed.autoDownload !== false
      };
    } catch (_error) {
      return { autoCheck: true, autoDownload: true };
    }
  }

  function writePreferences(next) {
    const current = readPreferences();
    const normalized = {
      autoCheck: next.autoCheck === undefined ? current.autoCheck : Boolean(next.autoCheck),
      autoDownload: next.autoDownload === undefined ? current.autoDownload : Boolean(next.autoDownload)
    };
    storage()?.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
    updateSettingsUi(normalized);
    return normalized;
  }

  function lastAutomaticCheckAt() {
    const value = Number(storage()?.getItem(LAST_CHECK_KEY) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function shouldAutoCheck(options = {}) {
    const now = Number(options.now === undefined ? Date.now() : options.now);
    const lastCheck = Number(options.lastCheck === undefined ? lastAutomaticCheckAt() : options.lastCheck);
    const online = options.online === undefined ? globalScope.navigator?.onLine !== false : Boolean(options.online);
    const autoCheck = options.autoCheck === undefined ? readPreferences().autoCheck : Boolean(options.autoCheck);
    return autoCheck && online && (!lastCheck || now - lastCheck >= CHECK_INTERVAL_MS);
  }

  function setStatus(message, state = '') {
    const text = globalScope.document?.getElementById('updateText');
    const indicator = globalScope.document?.getElementById('updateIndicator');
    if (text) text.textContent = message;
    if (indicator) indicator.className = `update-indicator${state ? ` update-indicator--${state}` : ''}`;
  }

  function updateSettingsUi(preferences = readPreferences()) {
    const autoCheck = globalScope.document?.getElementById('settingAutomaticUpdateChecks');
    const autoDownload = globalScope.document?.getElementById('settingAutomaticUpdateDownloads');
    if (autoCheck) autoCheck.checked = preferences.autoCheck;
    if (autoDownload) autoDownload.checked = preferences.autoDownload;
    const schedule = globalScope.document?.getElementById('automaticUpdateScheduleStatus');
    if (schedule) {
      schedule.textContent = preferences.autoCheck
        ? 'Enabled. The app checks at most once every 24 hours while online.'
        : 'Disabled. You can still check manually.';
    }
  }

  function closePrompt() {
    globalScope.document?.getElementById('automaticUpdatePrompt')?.remove();
  }

  function safeVersion(value) {
    return String(value || '').replace(/[^0-9A-Za-z._-]/g, '');
  }

  function promptShell(title, body, primaryLabel, primaryAction) {
    closePrompt();
    if (!globalScope.document?.body) return;
    const overlay = globalScope.document.createElement('div');
    overlay.id = 'automaticUpdatePrompt';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="automaticUpdatePromptTitle">
        <div class="modal__title" id="automaticUpdatePromptTitle">${title}</div>
        <div class="modal__body"><p>${body}</p></div>
        <div class="modal__actions">
          <button type="button" class="btn btn-ghost btn-sm automatic-update-later">Later</button>
          <button type="button" class="btn btn-primary btn-sm automatic-update-primary">${primaryLabel}</button>
        </div>
      </div>`;
    globalScope.document.body.appendChild(overlay);
    overlay.querySelector('.automatic-update-later')?.addEventListener('click', closePrompt);
    overlay.querySelector('.automatic-update-primary')?.addEventListener('click', primaryAction);
  }

  function showDownloadPrompt(version) {
    promptShell(
      'Update Available',
      `Version ${safeVersion(version)} is available. Download it in the background while you continue working.`,
      'Download Update',
      async () => {
        closePrompt();
        await globalScope.electronAPI?.downloadUpdate?.({ automatic: false });
      }
    );
  }

  function showRestartPrompt(version) {
    promptShell(
      'Update Ready',
      `Version ${safeVersion(version)} has been downloaded. Your current records will be saved before the app briefly restarts and applies the update.`,
      'Restart and Update',
      restartAndInstall
    );
  }

  async function restartAndInstall() {
    const button = globalScope.document?.querySelector('.automatic-update-primary');
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }
    try {
      if (typeof globalScope.saveDatabase === 'function') {
        const saved = await globalScope.saveDatabase();
        if (saved !== true) throw new Error('The active profile could not be saved.');
      }
      setStatus('Restarting to apply the update…', 'downloading');
      const result = await globalScope.electronAPI?.quitAndInstall?.();
      if (!result || result.started === false) throw new Error('The downloaded update is no longer available.');
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = 'Restart and Update';
      }
      const message = `Update was not installed: ${error.message || error}`;
      setStatus(message, 'error');
      globalScope.toast?.(message, 'error');
    }
  }

  function handleStatus(status, details = {}) {
    const message = details.message || 'Update status changed.';
    if (status === 'checking') setStatus(message, 'checking');
    if (status === 'available') {
      setStatus(details.autoDownload ? 'Update found. Downloading in the background…' : message, 'available');
      if (!details.autoDownload) showDownloadPrompt(details.version);
    }
    if (status === 'downloading') setStatus(message, 'downloading');
    if (status === 'downloaded') {
      downloadedVersion = details.version || '';
      setStatus(`Version ${downloadedVersion} is ready. Restart to update.`, 'downloaded');
      showRestartPrompt(downloadedVersion);
    }
    if (status === 'not-available') setStatus(message, 'uptodate');
    if (status === 'offline') setStatus(message);
    if (status === 'error') {
      setStatus(message, 'error');
      if (!details.automatic) globalScope.toast?.(message, 'error');
    }
  }

  async function runAutomaticCheck(now = Date.now()) {
    const preferences = readPreferences();
    if (!shouldAutoCheck({ now, autoCheck: preferences.autoCheck })) {
      return { started: false, reason: 'not-due' };
    }
    const result = await globalScope.electronAPI?.checkForUpdates?.({
      automatic: true,
      autoDownload: preferences.autoDownload
    }) || { started: false, reason: 'unavailable' };
    if (result.started) storage()?.setItem(LAST_CHECK_KEY, String(now));
    return result;
  }

  function startupDelay() {
    return globalScope.PerformanceMode?.isLowSpec?.() ? LOW_SPEC_STARTUP_DELAY_MS : STARTUP_DELAY_MS;
  }

  function scheduleAutomaticCheck(delay) {
    if (startupTimer) globalScope.clearTimeout?.(startupTimer);
    if (!readPreferences().autoCheck) return;
    const effectiveDelay = delay === undefined ? startupDelay() : delay;
    startupTimer = globalScope.setTimeout?.(() => runAutomaticCheck(), effectiveDelay);
  }

  function setAutoCheck(enabled) {
    const preferences = writePreferences({ autoCheck: enabled });
    if (preferences.autoCheck) scheduleAutomaticCheck(1000);
    else if (startupTimer) globalScope.clearTimeout?.(startupTimer);
  }

  function setAutoDownload(enabled) {
    writePreferences({ autoDownload: enabled });
  }

  function checkNow() {
    if (globalScope.navigator?.onLine === false) {
      setStatus('No internet connection. Update check skipped.');
      return { started: false, reason: 'offline' };
    }
    const preferences = readPreferences();
    return globalScope.electronAPI?.checkForUpdates?.({
      automatic: false,
      autoDownload: preferences.autoDownload
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    globalScope.handleCheckUpdatesClick = checkNow;
    globalScope.triggerWelcomeUpdate = () => {
      globalScope.toast?.('Checking for an update…', 'info');
      return checkNow();
    };
    updateSettingsUi();
    globalScope.electronAPI?.onUpdateStatus?.(handleStatus);
    globalScope.addEventListener?.('online', () => scheduleAutomaticCheck(1500));
    scheduleAutomaticCheck();
  }

  const api = {
    CHECK_INTERVAL_MS,
    STARTUP_DELAY_MS,
    LOW_SPEC_STARTUP_DELAY_MS,
    startupDelay,
    readPreferences,
    writePreferences,
    shouldAutoCheck,
    runAutomaticCheck,
    scheduleAutomaticCheck,
    setAutoCheck,
    setAutoDownload,
    checkNow,
    restartAndInstall,
    handleStatus,
    updateSettingsUi,
    init
  };

  globalScope.UpdateManager = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
