/** Dedicated Advisory Class application page and dynamic sidebar navigation. */
(function initAdvisoryPage(globalScope) {
  'use strict';

  function activeDb() {
    return typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
  }

  function currentClass() {
    return globalScope.AdvisoryDashboard?.currentClass?.() || null;
  }

  function rosterCount(advisoryClass) {
    if (!advisoryClass) return 0;
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb());
    return store.learners.filter(item => item.advisoryClassId === advisoryClass.id && item.enrollmentStatus !== 'inactive').length;
  }

  function isPageVisible() {
    const view = document.querySelector('.advisory-page-view');
    return Boolean(view && view.style.display !== 'none');
  }

  function syncActiveNavigation() {
    const nav = document.getElementById('navAdvisory');
    if (!nav) return;
    nav.classList.toggle('nav-btn--active', isPageVisible());
  }

  function syncSidebarButton() {
    const nav = document.getElementById('navAdvisory');
    if (!nav) return false;
    const configured = Boolean(currentClass());
    nav.hidden = !configured;
    nav.style.display = configured ? '' : 'none';
    nav.setAttribute('aria-hidden', configured ? 'false' : 'true');
    if (!configured) nav.classList.remove('nav-btn--active');
    return configured;
  }

  function renderPage() {
    const page = document.querySelector('.advisory-page');
    if (!page) return;
    const advisoryClass = currentClass();
    if (!advisoryClass) {
      syncSidebarButton();
      if (isPageVisible()) globalScope.setView?.('dashboard');
      return;
    }
    const addedSubjects = globalScope.AdvisoryGradeTransfer?.ensureGradeLevelSubjects?.(activeDb(), advisoryClass) || [];
    if (addedSubjects.length) globalScope.queueMicrotask?.(() => globalScope.saveDatabase?.());
    const escHtml = globalScope.esc || (value => String(value ?? ''));
    const count = rosterCount(advisoryClass);
    const header = page.querySelector('[data-advisory-page-header]');
    header.innerHTML = `
      <div>
        <span class="advisory-card__eyebrow">School Year ${escHtml(advisoryClass.schoolYear)}</span>
        <h1>Advisory Class</h1>
        <p>Grade ${escHtml(advisoryClass.gradeLevel)} - ${escHtml(advisoryClass.section)} <span aria-hidden="true">&middot;</span> ${escHtml(advisoryClass.adviserName)}${advisoryClass.isSpecialClass ? ` <span aria-hidden="true">&middot;</span> ${escHtml(advisoryClass.specialProgramName)} Special Class` : ''}</p>
      </div>
      <button class="btn btn-danger btn-sm advisory-page__reset" type="button" data-advisory-page-reset>Reset Advisory Class</button>`;
    header.querySelector('[data-advisory-page-reset]')?.addEventListener('click', () => globalScope.showAdvisoryResetModal?.());
    page.querySelector('[data-advisory-page-roster-count]').textContent = `${count} learner${count === 1 ? '' : 's'}`;
    globalScope.AdvisoryGradeTransfer?.renderWorkspacePanel?.(page, advisoryClass);
    syncSidebarButton();
    syncActiveNavigation();
  }

  function openPage(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (!currentClass()) {
      globalScope.showAdvisoryClassSetupModal?.();
      return;
    }
    globalScope.setView?.('advisory');
    renderPage();
  }

  function bindPageActions() {
    const page = document.querySelector('.advisory-page');
    if (!page || page.dataset.bound === 'true') return;
    page.dataset.bound = 'true';
    const tabs = Array.from(page.querySelectorAll('[data-advisory-page-tab]'));
    tabs.forEach(button => button.addEventListener('click', () => globalScope.AdvisoryGradeTransfer?.setPanelTab?.(button.dataset.advisoryPageTab, page)));
    page.querySelector('.advisory-page__toolbar')?.addEventListener('keydown', event => {
      const currentIndex = tabs.indexOf(event.target.closest?.('[data-advisory-page-tab]'));
      if (currentIndex < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    });
  }

  function initialize() {
    bindPageActions();
    syncSidebarButton();
    syncActiveNavigation();
    const view = document.querySelector('.advisory-page-view');
    const observer = new MutationObserver(() => {
      syncActiveNavigation();
      if (isPageVisible()) renderPage();
    });
    if (view) observer.observe(view, { attributes: true, attributeFilter: ['style'] });
  }

  const api = { openPage, renderPage, syncSidebarButton };
  globalScope.AdvisoryPage = api;
  globalScope.openAdvisoryClassPage = openPage;
  globalScope.openAdvisoryClassDashboard = openPage;
  globalScope.renderAdvisoryClassPage = renderPage;
  globalScope.syncAdvisorySidebarButton = syncSidebarButton;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
