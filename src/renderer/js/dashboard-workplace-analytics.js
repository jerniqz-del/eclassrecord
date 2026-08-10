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

  function mixMarkup(mix) {
    const items = [
      { key: 'written', label: 'Written Work', className: 'written' },
      { key: 'performance', label: 'Performance Tasks', className: 'performance' },
      { key: 'quarterly', label: 'Quarterly Assessment', className: 'quarterly' },
      { key: 'other', label: 'Other', className: 'other' }
    ];
    return items.filter(item => mix[item.key] > 0).map(item => `
      <li><span class="workplace-legend__dot workplace-legend__dot--${item.className}"></span><span>${item.label}</span><strong>${mix[item.key]}</strong></li>`).join('');
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
    const classRows = analytics.byClass.length
      ? analytics.byClass.slice(0, 8).map(classProgressMarkup).join('')
      : '<div class="workplace-chart-empty">Add a teaching load to start seeing class progress.</div>';
    const mixTotal = Object.values(analytics.mix).reduce((sum, value) => sum + value, 0);
    const writtenEnd = mixTotal ? (analytics.mix.written / mixTotal) * 100 : 0;
    const performanceEnd = mixTotal ? writtenEnd + (analytics.mix.performance / mixTotal) * 100 : 0;
    const quarterlyEnd = mixTotal ? performanceEnd + (analytics.mix.quarterly / mixTotal) * 100 : 0;
    const donutStyle = mixTotal
      ? `background:conic-gradient(var(--color-primary-500) 0 ${writtenEnd}%,var(--color-success-500) ${writtenEnd}% ${performanceEnd}%,var(--color-warning-500) ${performanceEnd}% ${quarterlyEnd}%,var(--color-neutral-400) ${quarterlyEnd}% 100%)`
      : '';
    const termMax = Math.max(1, ...Object.values(analytics.termCounts));
    const termBars = ['1', '2', '3'].map(term => {
      const count = analytics.termCounts[term];
      const height = count ? Math.max(10, Math.round((count / termMax) * 100)) : 2;
      return `<div class="workplace-term-bar"><strong>${count}</strong><span class="workplace-term-bar__track"><i style="height:${height}%"></i></span><small>Term ${term}</small></div>`;
    }).join('');

    analyticsAnchor.insertAdjacentHTML('beforebegin', `
      <section class="workplace-analytics" aria-label="Dashboard analytics">

        <div class="workplace-kpis">
          <article class="workplace-kpi workplace-kpi--primary"><span>Score entry</span><strong>${analytics.completionPercent}%</strong><small>${analytics.enteredScores} of ${analytics.expectedScores} cells</small></article>
          <article class="workplace-kpi workplace-kpi--success"><span>HPS ready</span><strong>${analytics.hpsPercent}%</strong><small>${analytics.hpsReady} of ${analytics.assessments} assessments</small></article>
          <article class="workplace-kpi workplace-kpi--warning"><span>Assessments</span><strong>${analytics.assessments}</strong><small>Across ${snapshot.stats.classes} active classes</small></article>
          <article class="workplace-kpi workplace-kpi--neutral"><span>Learners</span><strong>${snapshot.stats.learnerDisplay}</strong><small>${includeDuplicateLearners ? `${snapshot.stats.learnerEntries} class enrollments` : `${snapshot.stats.uniqueLearners} unique learners`}</small><label class="workplace-kpi-toggle" title="Duplicates are matched by LRN, then by normalized learner name and birthdate"><input type="checkbox" ${includeDuplicateLearners ? 'checked' : ''} onchange="toggleDashboardLearnerDuplicates(this.checked)"><span>Include duplicates</span></label></article>
        </div>
        <div class="workplace-insights-grid">
          <article class="workplace-insight-card workplace-insight-card--wide">
            <header><div><h4>Score entry by class</h4><p>Completion of expected score cells for Term ${esc(snapshot.currentTerm)}</p></div><span class="workplace-insight-chip">${analytics.completionPercent}% overall</span></header>
            <div class="workplace-chart-rows">${classRows}</div>
          </article>
          <article class="workplace-insight-card">
            <header><div><h4>Assessment mix</h4><p>Current-term activity balance</p></div></header>
            <div class="workplace-donut-layout">
              <div class="workplace-donut ${mixTotal ? '' : 'workplace-donut--empty'}" style="${donutStyle}" role="img" aria-label="${mixTotal} current-term assessments"><span><strong>${mixTotal}</strong><small>total</small></span></div>
              <ul class="workplace-legend">${mixTotal ? mixMarkup(analytics.mix) : '<li class="workplace-chart-empty">No assessment mix yet.</li>'}</ul>
            </div>
            <div class="workplace-term-chart" role="img" aria-label="Assessment counts by term">${termBars}</div>
          </article>
        </div>
      </section>`);
  }

  globalScope.renderDashboardOverview = function renderDashboardOverviewWithAnalytics() {
    baseRenderDashboardOverview();
    renderAnalytics();
  };
})(window);
