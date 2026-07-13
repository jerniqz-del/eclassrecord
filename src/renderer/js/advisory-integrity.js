/** Adds Advisory Class references to the existing database integrity report. */
(function initAdvisoryIntegrity(globalScope) {
  'use strict';
  const originalRun = globalScope.runDatabaseIntegrityCheck;
  if (typeof originalRun !== 'function') return;

  function appendAdvisoryReport(report) {
    const modal = document.getElementById('integrityResultsModal');
    const body = modal?.querySelector('.modal__body');
    if (!body) return;
    body.querySelector('[data-advisory-integrity-report]')?.remove();
    const section = document.createElement('section');
    section.setAttribute('data-advisory-integrity-report', 'true');
    section.className = `advisory-integrity-report ${report.isValid ? 'is-clean' : 'has-errors'}`;
    section.innerHTML = `<h3>Advisory Class Data</h3><p>${report.isValid ? 'Advisory classes, learners, subjects, grades, source mappings, and import batches have valid references.' : `${report.errors.length} Advisory Class integrity issue(s) require review. No advisory records were changed automatically.`}</p>${report.errors.length ? `<ul>${report.errors.slice(0, 20).map(error => `<li>${globalScope.esc(error.code)} · ${globalScope.esc(error.collection || error.schoolYear || 'advisory data')}</li>`).join('')}</ul>` : ''}${report.warnings.length ? `<p>${report.warnings.length} advisory warning(s) were also found.</p>` : ''}`;
    body.appendChild(section);
  }

  globalScope.runDatabaseIntegrityCheck = function runDatabaseIntegrityCheckWithAdvisory() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
    const advisoryReport = globalScope.AdvisoryData.checkAdvisoryIntegrity(profileDb);
    const existingResult = originalRun.apply(this, arguments);
    setTimeout(() => appendAdvisoryReport(advisoryReport), 0);
    return { existingResult, advisoryReport };
  };
})(typeof window !== 'undefined' ? window : globalThis);
