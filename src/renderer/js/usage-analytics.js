(function initUsageAnalyticsModule(globalScope) {
  'use strict';

  const CONSENT_VERSION = '2026-07-18-analytics-v1';
  const CONSENT_KEY = 'eclass_usage_analytics_consent_v1';
  const REPORT_HISTORY_KEY = 'eclass_usage_analytics_reports_v1';
  const FAILURE_HISTORY_KEY = 'eclass_usage_analytics_failures_v1';
  const ENDPOINT = 'https://eclassrecord-community-relay.jerniqz.workers.dev';
  const MAX_REPORT_HISTORY = 48;
  const RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  const pendingReports = new Set();
  let scheduledTimer = null;

  function storageOrDefault(storage) {
    if (storage) return storage;
    try {
      return globalScope.localStorage || null;
    } catch (_err) {
      return null;
    }
  }

  function currentProfile() {
    try {
      return typeof db !== 'undefined' ? db : null;
    } catch (_err) {
      return null;
    }
  }

  function cleanText(value, maxLength) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  function currentPeriod(now = new Date()) {
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function normalizeGradeLevel(value) {
    const match = String(value ?? '').match(/(?:grade\s*)?(\d{1,2})/i);
    if (!match) return 0;
    const gradeLevel = Number(match[1]);
    return Number.isInteger(gradeLevel) && gradeLevel >= 1 && gradeLevel <= 12 ? gradeLevel : 0;
  }

  function isTestProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (profile.isMockTestData === true) return true;
    const markers = [
      profile.mockTestLabel,
      profile.region,
      profile.division,
      profile.schoolName,
      profile.teacherName
    ].map(value => String(value || '').toUpperCase());
    return markers.some(value => value.includes('TEST DATA') || value.includes('MOCK'));
  }

  function collectGradeCounts(profile) {
    const counts = new Map();
    const add = (gradeValue) => {
      const gradeLevel = normalizeGradeLevel(gradeValue);
      if (!gradeLevel) return;
      counts.set(gradeLevel, (counts.get(gradeLevel) || 0) + 1);
    };

    (Array.isArray(profile?.assignments) ? profile.assignments : []).forEach(item => add(item?.gradeLevel));
    const advisoryClasses = Array.isArray(profile?.advisory?.classes) ? profile.advisory.classes : [];
    advisoryClasses.forEach(item => add(item?.gradeLevel));

    return Array.from(counts.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([gradeLevel, classCount]) => ({ gradeLevel, classCount }));
  }

  function buildUsageSummary(profile, appVersion = '', now = new Date()) {
    if (!profile || typeof profile !== 'object' || isTestProfile(profile)) return null;
    const region = cleanText(profile.region, 80);
    const division = cleanText(profile.division, 140);
    const gradeLevels = collectGradeCounts(profile);
    const period = currentPeriod(now);
    const version = cleanText(appVersion, 40);
    if (!region || !division || !gradeLevels.length || !period || !version) return null;

    return {
      schemaVersion: '1',
      period,
      region,
      division,
      gradeLevels,
      appVersion: version
    };
  }

  function readConsent(storage) {
    const target = storageOrDefault(storage);
    if (!target) return { enabled: false, decided: false, version: CONSENT_VERSION };
    try {
      const saved = JSON.parse(target.getItem(CONSENT_KEY) || '{}');
      if (saved.version !== CONSENT_VERSION || typeof saved.enabled !== 'boolean') {
        return { enabled: false, decided: false, version: CONSENT_VERSION };
      }
      return {
        enabled: saved.enabled,
        decided: true,
        version: CONSENT_VERSION,
        decidedAt: cleanText(saved.decidedAt, 40)
      };
    } catch (_err) {
      return { enabled: false, decided: false, version: CONSENT_VERSION };
    }
  }

  function writeConsent(enabled, storage, now = new Date()) {
    const target = storageOrDefault(storage);
    const consent = {
      version: CONSENT_VERSION,
      enabled: Boolean(enabled),
      decidedAt: new Date(now).toISOString()
    };
    if (target) target.setItem(CONSENT_KEY, JSON.stringify(consent));
    return consent;
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function reportKey(payload) {
    return `${payload.period}:${hashText(JSON.stringify(payload))}`;
  }

  function readReportHistory(storage) {
    const target = storageOrDefault(storage);
    if (!target) return [];
    try {
      const history = JSON.parse(target.getItem(REPORT_HISTORY_KEY) || '[]');
      return Array.isArray(history) ? history.filter(item => typeof item === 'string').slice(-MAX_REPORT_HISTORY) : [];
    } catch (_err) {
      return [];
    }
  }

  function markReportSent(key, storage) {
    const target = storageOrDefault(storage);
    if (!target) return;
    const history = readReportHistory(target).filter(item => item !== key);
    history.push(key);
    target.setItem(REPORT_HISTORY_KEY, JSON.stringify(history.slice(-MAX_REPORT_HISTORY)));
  }

  function readFailureHistory(storage) {
    const target = storageOrDefault(storage);
    if (!target) return {};
    try {
      const history = JSON.parse(target.getItem(FAILURE_HISTORY_KEY) || '{}');
      return history && typeof history === 'object' && !Array.isArray(history) ? history : {};
    } catch (_err) {
      return {};
    }
  }

  function markReportFailure(key, storage, now = new Date()) {
    const target = storageOrDefault(storage);
    if (!target) return;
    const history = readFailureHistory(target);
    history[key] = new Date(now).getTime();
    const recent = Object.entries(history)
      .filter(([, timestamp]) => Number.isFinite(Number(timestamp)))
      .sort((left, right) => Number(left[1]) - Number(right[1]))
      .slice(-MAX_REPORT_HISTORY);
    target.setItem(FAILURE_HISTORY_KEY, JSON.stringify(Object.fromEntries(recent)));
  }

  function clearReportFailure(key, storage) {
    const target = storageOrDefault(storage);
    if (!target) return;
    const history = readFailureHistory(target);
    if (!Object.prototype.hasOwnProperty.call(history, key)) return;
    delete history[key];
    target.setItem(FAILURE_HISTORY_KEY, JSON.stringify(history));
  }

  function isAdminTestMode() {
    return Boolean(globalScope.AdminTestMode?.isActive?.());
  }

  async function resolveAppVersion(explicitVersion) {
    if (explicitVersion) return cleanText(explicitVersion, 40);
    try {
      if (typeof globalScope.electronAPI?.getVersion === 'function') {
        return cleanText(await globalScope.electronAPI.getVersion(), 40);
      }
    } catch (_err) {
      // Analytics is best-effort and must never interrupt local work.
    }
    return '';
  }

  async function maybeSendSummary(profile, options = {}) {
    const storage = storageOrDefault(options.storage);
    const consent = readConsent(storage);
    if (!consent.enabled) return { sent: false, reason: 'consent-disabled' };
    if (isAdminTestMode() || isTestProfile(profile)) return { sent: false, reason: 'test-mode' };
    if (options.online === false || (options.online === undefined && globalScope.navigator?.onLine === false)) {
      return { sent: false, reason: 'offline' };
    }

    const attemptTime = options.now || new Date();
    const appVersion = await resolveAppVersion(options.appVersion);
    const payload = buildUsageSummary(profile, appVersion, attemptTime);
    if (!payload) return { sent: false, reason: 'incomplete-summary' };

    const key = reportKey(payload);
    if (!options.force && readReportHistory(storage).includes(key)) {
      return { sent: false, reason: 'already-reported', payload };
    }
    const lastFailure = Number(readFailureHistory(storage)[key] || 0);
    if (!options.force && lastFailure && new Date(attemptTime).getTime() - lastFailure < RETRY_COOLDOWN_MS) {
      return { sent: false, reason: 'retry-later', payload };
    }
    if (pendingReports.has(key)) return { sent: false, reason: 'already-pending', payload };

    const fetchFn = options.fetchFn || globalScope.fetch;
    if (typeof fetchFn !== 'function') return { sent: false, reason: 'network-unavailable', payload };

    pendingReports.add(key);
    try {
      const response = await fetchFn(`${options.endpoint || ENDPOINT}/usage/class-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Usage summary failed: ${response.status}`);
      markReportSent(key, storage);
      clearReportFailure(key, storage);
      updateSettingsUi();
      return { sent: true, payload, aggregateOnly: data.aggregateOnly === true };
    } catch (error) {
      markReportFailure(key, storage, attemptTime);
      return { sent: false, reason: 'send-failed', error: error.message || String(error), payload };
    } finally {
      pendingReports.delete(key);
    }
  }

  function scheduleProfileSummary(profile = currentProfile(), delayMs = 1500) {
    if (!readConsent().enabled || isAdminTestMode() || isTestProfile(profile)) return;
    clearTimeout(scheduledTimer);
    const requestedDelay = Math.max(0, Number(delayMs) || 0);
    const effectiveDelay = globalScope.PerformanceMode?.isLowSpec?.()
      ? Math.max(requestedDelay, 30000)
      : requestedDelay;
    scheduledTimer = setTimeout(() => {
      maybeSendSummary(profile).catch(() => {});
    }, effectiveDelay);
  }

  function updateSettingsUi() {
    if (!globalScope.document) return;
    const consent = readConsent();
    const toggle = globalScope.document.getElementById('settingUsageAnalytics');
    const status = globalScope.document.getElementById('usageAnalyticsStatus');
    const welcome = globalScope.document.getElementById('welcomeUsageAnalyticsCheckbox');
    if (toggle) toggle.checked = consent.enabled;
    if (welcome) welcome.checked = consent.enabled;
    if (status) {
      status.textContent = consent.enabled
        ? 'Enabled. The app may send one minimized aggregate class summary when the monthly summary changes.'
        : 'Disabled. No class usage summary is sent.';
    }
  }

  function setConsent(enabled, options = {}) {
    if (isAdminTestMode()) {
      updateSettingsUi();
      if (options.notify !== false && typeof globalScope.toast === 'function') {
        globalScope.toast('Usage analytics preferences cannot be changed in Admin Test Mode.', 'info');
      }
      return readConsent(options.storage);
    }
    const consent = writeConsent(enabled, options.storage, options.now || new Date());
    updateSettingsUi();
    if (consent.enabled) {
      scheduleProfileSummary(options.profile || currentProfile(), 0);
      if (options.notify !== false && typeof globalScope.toast === 'function') {
        globalScope.toast('Optional usage analytics enabled.', 'success');
      }
    } else if (options.notify !== false && typeof globalScope.toast === 'function') {
      globalScope.toast('Usage analytics disabled. No future summaries will be sent.', 'info');
    }
    return consent;
  }

  function applyWelcomeChoice(enabled) {
    return setConsent(Boolean(enabled), { notify: false });
  }

  function showPrivacyNotice(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (typeof globalScope.showEl === 'function') globalScope.showEl('usagePrivacyModal', true, 'flex');
  }

  function closePrivacyNotice() {
    if (typeof globalScope.showEl === 'function') globalScope.showEl('usagePrivacyModal', false);
  }

  function init() {
    updateSettingsUi();
    if (readConsent().enabled) scheduleProfileSummary(currentProfile(), 2500);
  }

  const api = {
    CONSENT_VERSION,
    CONSENT_KEY,
    REPORT_HISTORY_KEY,
    FAILURE_HISTORY_KEY,
    ENDPOINT,
    normalizeGradeLevel,
    collectGradeCounts,
    buildUsageSummary,
    isTestProfile,
    readConsent,
    writeConsent,
    reportKey,
    readReportHistory,
    maybeSendSummary,
    scheduleProfileSummary,
    setConsent,
    applyWelcomeChoice,
    showPrivacyNotice,
    closePrivacyNotice,
    updateSettingsUi,
    init
  };

  globalScope.UsageAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
