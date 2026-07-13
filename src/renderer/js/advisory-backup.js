/** Advisory-aware backup restore validation. */
(function initAdvisoryBackup(globalScope) {
  'use strict';

  function prepareRestoredDatabase(incoming) {
    if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.assignments)) {
      throw new Error('Invalid backup file: assignments list is missing.');
    }
    const restored = JSON.parse(JSON.stringify(incoming));
    globalScope.AdvisoryData.normalizeAdvisoryData(restored);
    const report = globalScope.AdvisoryData.checkAdvisoryIntegrity(restored);
    if (!report.isValid) {
      throw new Error(`Backup validation found ${report.errors.length} invalid Advisory Class reference${report.errors.length === 1 ? '' : 's'}. No data was restored.`);
    }
    return restored;
  }

  const api = { prepareRestoredDatabase };
  globalScope.AdvisoryBackup = api;
  globalScope.prepareRestoredDatabase = prepareRestoredDatabase;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
