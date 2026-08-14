(function initDashboardWorkplaceAnalytics(globalScope) {
  'use strict';

  const baseRenderDashboardOverview = globalScope.renderDashboardOverview;

  function classProgressMarkup(item) {
    const detail = item.expected ? `${item.entered} of ${item.expected} scores entered` : 'No assessments in this term';
    return `
      <div class="workplace-chart-row">
        <div class="workplace-chart-row__label"><strong>${esc(item.label)}</strong><span>${esc(item.subject)}</span></div>
        <div class="workplace-chart-row__plot" role="img" aria-label="${esc(item.label)} ${item.percent} percent complete">
          <span style="width:${Math.max(0, Math.min(100, item.percent))}%"></span>
        </div>
        <div class="workplace-chart-row__value"><strong>${item.percent}%</strong><span>${esc(detail)}</span></div>
      </div>`;
  }


  globalScope.toggleDashboardLearnerDuplicates = function toggleDashboardLearnerDuplicates(includeDuplicates) {
    const scrollTop = document.querySelector('#dashboardWorkplace .workplace-scroll-content')?.scrollTop || 0;
    const store = DashboardWorkplace.normalize(db);
    store.preferences.includeDuplicateLearners = Boolean(includeDuplicates);
    saveDatabase();
    globalScope.renderDashboardOverview();
    requestAnimationFrame(() => {
      const scrollArea = document.querySelector('#dashboardWorkplace .workplace-scroll-content');
      if (scrollArea) scrollArea.scrollTop = scrollTop;
    });
  };

  function renderAnalytics() {
    const workplace = document.getElementById('dashboardWorkplace');
    const analyticsAnchor = workplace?.querySelector('.workplace-grid');
    if (!analyticsAnchor || workplace.querySelector('.workplace-analytics')) return;
    const snapshot = DashboardWorkplace.snapshot(db, { schoolYear: db.schoolYear || '2026-2027' });
    const analytics = snapshot.analytics;
    const includeDuplicateLearners = snapshot.preferences.includeDuplicateLearners !== false;
    const coverage = analytics.scoreCoverage;
    const classRows = coverage.byClass.length
      ? coverage.byClass.map(classProgressMarkup).join('')
      : '<div class="workplace-chart-empty">Add a teaching load to start seeing class progress.</div>';

    analyticsAnchor.insertAdjacentHTML('beforebegin', `
      <section class="workplace-analytics" aria-label="Dashboard analytics">

        <div class="workplace-kpis">
          <article class="workplace-kpi workplace-kpi--primary"><span>Score entry</span><strong>${coverage.percent}%</strong><small>${coverage.entered} of ${coverage.expected} cells · all terms</small></article>
          <article class="workplace-kpi workplace-kpi--success"><span>HPS ready</span><strong>${analytics.hpsPercent}%</strong><small>${analytics.hpsReady} of ${analytics.assessments} assessments</small></article>
          <article class="workplace-kpi workplace-kpi--warning"><span>Assessments</span><strong>${analytics.assessments}</strong><small>Across ${snapshot.stats.classes} active classes</small></article>
          <article class="workplace-kpi workplace-kpi--neutral"><span>Learners</span><strong>${snapshot.stats.learnerDisplay}</strong><small>${includeDuplicateLearners ? `${snapshot.stats.learnerEntries} class enrollments` : `${snapshot.stats.uniqueLearners} unique learners`}</small><label class="workplace-kpi-toggle" title="Duplicates are matched by LRN, then by normalized learner name and birthdate"><input type="checkbox" ${includeDuplicateLearners ? 'checked' : ''} onchange="toggleDashboardLearnerDuplicates(this.checked)"><span>Include duplicates</span></label></article>
        </div>
        <div class="workplace-insights-grid">
          <article class="workplace-insight-card workplace-insight-card--wide">
            <header><div><h4>Score entry by class</h4><p>All active classes · Term ${esc(snapshot.currentTerm)}</p></div><span class="workplace-insight-chip">${coverage.percent}% overall</span></header>
            <div class="workplace-chart-rows workplace-chart-rows--all">${classRows}</div>
          </article>
          <article class="workplace-insight-card workplace-component-card">
            <header><div><h4>Overall class performance</h4><p>Working class component results · Term ${esc(snapshot.currentTerm)}</p></div></header>
            <div class="workplace-component-chart" data-component-performance></div>
          </article>
        </div>
      </section>`);
  }

  globalScope.renderDashboardOverview = function renderDashboardOverviewWithAnalytics() {
    baseRenderDashboardOverview();
    renderAnalytics();
  };
})(window);
