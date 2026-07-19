(function initializePerformanceMode(globalScope) {
  'use strict';

  const STORAGE_KEY = 'eclass_performance_mode_v1';
  const LOW_MODE = 'low';
  const NORMAL_MODE = 'normal';
  let currentMode = NORMAL_MODE;
  let setViewWrapped = false;

  function safeReadMode() {
    try {
      return globalScope.localStorage?.getItem(STORAGE_KEY) === LOW_MODE ? LOW_MODE : NORMAL_MODE;
    } catch (_error) {
      return NORMAL_MODE;
    }
  }

  function safeWriteMode(mode) {
    try {
      globalScope.localStorage?.setItem(STORAGE_KEY, mode);
    } catch (_error) {
      // Performance preference is best-effort and device-local.
    }
  }

  function isLowSpec() {
    return currentMode === LOW_MODE || globalScope.document?.documentElement?.dataset?.performanceMode === LOW_MODE;
  }

  function formatMemory(bytes) {
    const gigabytes = Number(bytes) / (1024 ** 3);
    if (!Number.isFinite(gigabytes) || gigabytes <= 0) return 'Memory unavailable';
    return `${gigabytes.toFixed(gigabytes < 10 ? 1 : 0)} GB RAM`;
  }

  function recommendProfile(profile = {}) {
    const totalMemoryBytes = Number(profile.totalMemoryBytes) || 0;
    const logicalProcessors = Number(profile.logicalProcessors) || 0;
    const reasons = [];

    if (totalMemoryBytes > 0 && totalMemoryBytes <= 5 * 1024 ** 3) reasons.push('limited system memory');
    if (logicalProcessors > 0 && logicalProcessors <= 2) reasons.push('limited processor capacity');

    return {
      recommended: Boolean(profile.recommended) || reasons.length > 0,
      reasons: reasons.length ? reasons : Array.isArray(profile.reasons) ? profile.reasons : [],
      memoryLabel: formatMemory(totalMemoryBytes),
      processorLabel: logicalProcessors > 0
        ? `${logicalProcessors} logical processor${logicalProcessors === 1 ? '' : 's'}`
        : 'Processor information unavailable'
    };
  }

  function updateSettingsUi() {
    const enabled = isLowSpec();
    const checkbox = globalScope.document?.getElementById('settingLowSpecMode');
    const status = globalScope.document?.getElementById('performanceModeStatus');
    if (checkbox) checkbox.checked = enabled;
    if (status) {
      status.textContent = enabled
        ? 'On. Visual effects and optional background activity are reduced on this device.'
        : 'Off. The app uses full visual effects and normal background activity.';
    }
  }

  function notifyFeatureModules(enabled) {
    if (typeof globalScope.setSidebarAdLowSpecMode === 'function') {
      globalScope.setSidebarAdLowSpecMode(enabled);
    }
    if (enabled && typeof globalScope.stopCommunityQuestionPolling === 'function') {
      globalScope.stopCommunityQuestionPolling();
    }
    globalScope.UpdateManager?.scheduleAutomaticCheck?.();
    globalScope.dispatchEvent?.(new globalScope.CustomEvent('performance-mode-changed', {
      detail: { mode: enabled ? LOW_MODE : NORMAL_MODE }
    }));
  }

  function applyMode(mode, options = {}) {
    currentMode = mode === LOW_MODE ? LOW_MODE : NORMAL_MODE;
    const root = globalScope.document?.documentElement;
    const body = globalScope.document?.body;
    if (root) root.dataset.performanceMode = currentMode;
    if (body) body.dataset.performanceMode = currentMode;
    safeWriteMode(currentMode);
    updateSettingsUi();
    if (options.notifyModules !== false) notifyFeatureModules(currentMode === LOW_MODE);

    if (options.notify && typeof globalScope.toast === 'function') {
      globalScope.toast(
        currentMode === LOW_MODE
          ? 'Low-Spec Mode enabled. Restart recommended for the best startup improvement.'
          : 'Low-Spec Mode disabled. Full visual effects are restored.',
        'success'
      );
    }
    return currentMode;
  }

  function setLowSpec(enabled) {
    return applyMode(enabled ? LOW_MODE : NORMAL_MODE, { notify: true });
  }

  async function detectDevice() {
    const summary = globalScope.document?.getElementById('performanceDeviceSummary');
    const recommendation = globalScope.document?.getElementById('performanceRecommendation');
    if (summary) summary.textContent = 'Checking this PC…';
    if (recommendation) recommendation.textContent = '';

    try {
      if (typeof globalScope.electronAPI?.getPerformanceProfile !== 'function') {
        throw new Error('Device information is unavailable.');
      }
      const profile = await globalScope.electronAPI.getPerformanceProfile();
      const result = recommendProfile(profile);
      if (summary) summary.textContent = `${result.memoryLabel} · ${result.processorLabel}`;
      if (recommendation) {
        recommendation.textContent = result.recommended
          ? `Low-Spec Mode is recommended${result.reasons.length ? ` because of ${result.reasons.join(' and ')}` : ''}.`
          : 'Standard mode should work well on this PC. Low-Spec Mode remains optional.';
        recommendation.className = `settings-row__desc u-mt-1 ${result.recommended ? 'u-text-warning u-text-strong' : ''}`.trim();
      }
      return result;
    } catch (error) {
      if (summary) summary.textContent = 'Unable to read this PC’s performance information.';
      if (recommendation) recommendation.textContent = String(error?.message || 'Please try again.');
      return null;
    }
  }

  function installHelpOnDemand() {
    if (setViewWrapped || typeof globalScope.setView !== 'function') return;
    const originalSetView = globalScope.setView;
    globalScope.setView = function performanceAwareSetView(view, ...args) {
      const result = originalSetView.call(this, view, ...args);
      if (view === 'help' && typeof globalScope.ensureHelpCenterInitialized === 'function') {
        globalScope.ensureHelpCenterInitialized();
      }
      return result;
    };
    setViewWrapped = true;
  }

  function init() {
    currentMode = safeReadMode();
    applyMode(currentMode, { notifyModules: false });
    installHelpOnDemand();
    if (globalScope.document?.readyState === 'loading') {
      globalScope.document.addEventListener('DOMContentLoaded', () => {
        updateSettingsUi();
        installHelpOnDemand();
      }, { once: true });
    }
  }

  const api = {
    STORAGE_KEY,
    LOW_MODE,
    NORMAL_MODE,
    readMode: safeReadMode,
    isLowSpec,
    recommendProfile,
    applyMode,
    setLowSpec,
    detectDevice,
    updateSettingsUi,
    init
  };

  globalScope.PerformanceMode = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
