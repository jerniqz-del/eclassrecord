(function initDashboardGradeInsights(globalScope) {
  'use strict';

  const baseRenderDashboardOverview = globalScope.renderDashboardOverview;
  const selectedLearnerByClass = new Map();

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function activeLearners(assignment, term) {
    return (Array.isArray(assignment?.learners) ? assignment.learners : []).filter(learner => {
      if (!learner || learner.enrollmentStatus === 'inactive') return false;
      const transferredOutTerm = Number(learner.transferredOutTerm);
      return !Number.isFinite(transferredOutTerm) || transferredOutTerm > Number(term || 1);
    });
  }

  function learnerName(learner) {
    const familyName = String(learner?.lastName || '').trim();
    const givenNames = [learner?.firstName, learner?.middleName].map(value => String(value || '').trim()).filter(Boolean).join(' ');
    return [familyName, givenNames].filter(Boolean).join(', ') || String(learner?.name || learner?.lrn || 'Unnamed learner');
  }

  function numericGrade(assignment, learner, term) {
    let result = null;
    try {
      result = typeof isMapehSubject === 'function' && isMapehSubject(assignment.subject) && typeof getMapehConsolidatedTermResult === 'function'
        ? getMapehConsolidatedTermResult(assignment, learner, term)
        : (typeof computeTerm === 'function' ? computeTerm(assignment, learner.id, term) : null);
    } catch (error) {
      return { value: null, usesInitialGrade: false };
    }
    if (typeof result?.termGrade === 'number' && Number.isFinite(result.termGrade)) {
      return { value: result.termGrade, usesInitialGrade: false };
    }
    if (result?.hasData && !result.isTransferredIn && Number.isFinite(Number(result.initialGrade))) {
      return { value: Number(result.initialGrade), usesInitialGrade: true };
    }
    return { value: null, usesInitialGrade: false };
  }

  function performanceFor(snapshot, requestedLearnerId) {
    const assignment = snapshot.currentAssignment;
    const learners = assignment ? activeLearners(assignment, snapshot.currentTerm) : [];
    const rememberedId = selectedLearnerByClass.get(String(assignment?.id || ''));
    const selectedId = String(requestedLearnerId || rememberedId || learners[0]?.id || '');
    const learner = learners.find(item => String(item.id) === selectedId) || learners[0] || null;
    if (assignment && learner) selectedLearnerByClass.set(String(assignment.id), String(learner.id));

    let usesInitialGrade = false;
    const terms = ['1', '2', '3'].map(term => {
      const learnerResult = learner ? numericGrade(assignment, learner, term) : { value: null, usesInitialGrade: false };
      usesInitialGrade = usesInitialGrade || learnerResult.usesInitialGrade;
      const classGrades = activeLearners(assignment, term)
        .map(item => numericGrade(assignment, item, term).value)
        .filter(value => value !== null);
      return {
        term,
        grade: learnerResult.value,
        classAverage: classGrades.length ? classGrades.reduce((sum, value) => sum + value, 0) / classGrades.length : null
      };
    });
    const recorded = terms.map(item => item.grade).filter(value => value !== null);
    return {
      assignment,
      learners,
      learner,
      terms,
      average: recorded.length ? recorded.reduce((sum, value) => sum + value, 0) / recorded.length : null,
      usesInitialGrade
    };
  }

  function gradeDisplay(value) {
    return value === null ? '—' : String(Math.round(value * 10) / 10);
  }

  function performanceMarkup(data) {
    const classLabel = data.assignment
      ? `Grade ${data.assignment.gradeLevel || ''} - ${data.assignment.section || ''} · ${data.assignment.subject || ''}`
      : 'No working class selected';
    const options = data.learners.map(learner => `<option value="${escapeHtml(learner.id)}" ${learner === data.learner ? 'selected' : ''}>${escapeHtml(learnerName(learner))}</option>`).join('');
    const rows = data.terms.map(item => {
      const learnerWidth = item.grade === null ? 0 : Math.max(3, Math.min(100, item.grade));
      const averageWidth = item.classAverage === null ? 0 : Math.max(3, Math.min(100, item.classAverage));
      return `<div class="workplace-student-term">
        <div class="workplace-student-term__label"><strong>Term ${item.term}</strong><span>${gradeDisplay(item.grade)}</span></div>
        <div class="workplace-student-term__plot">
          <span class="workplace-student-term__track" aria-label="Learner grade ${gradeDisplay(item.grade)}"><i style="width:${learnerWidth}%"></i></span>
          <span class="workplace-student-term__track workplace-student-term__track--average" aria-label="Class average ${gradeDisplay(item.classAverage)}"><i style="width:${averageWidth}%"></i></span>
        </div>
        <div class="workplace-student-term__values"><strong>${gradeDisplay(item.grade)}</strong><span>${gradeDisplay(item.classAverage)} class</span></div>
      </div>`;
    }).join('');
    const note = data.usesInitialGrade
      ? 'Descriptive grading uses the computed initial-grade percentage.'
      : 'Term grade compared with the class average.';

    return `<article class="workplace-insight-card workplace-grade-insight workplace-performance-card">
      <header class="workplace-performance-header">
        <div><h4>Student performance</h4><p>${escapeHtml(classLabel)}</p></div>
        <label class="workplace-learner-selector"><span>Learner</span><select class="field-select" data-performance-learner ${options ? '' : 'disabled'}>${options || '<option>No learners in this class</option>'}</select></label>
      </header>
      <div class="workplace-performance-summary">
        <div><span>Three-term average</span><strong>${gradeDisplay(data.average)}</strong></div>
        <div class="workplace-performance-legend"><span><i></i>Learner</span><span><i></i>Class average</span></div>
        <p>${escapeHtml(note)}</p>
      </div>
      <div class="workplace-student-chart">${rows}</div>
    </article>`;
  }

  function missingRowMarkup(item, index) {
    const names = item.missingLearners.map(learner => learner.name).filter(Boolean);
    let status = '<span class="workplace-missing-status workplace-missing-status--complete">Complete</span>';
    if (!item.totalLearners) status = '<span class="workplace-missing-status">No learners</span>';
    else if (item.missing) status = `<span class="workplace-missing-status workplace-missing-status--warning">${item.missing} of ${item.totalLearners}</span>`;
    const learnerList = item.missing
      ? `<details class="workplace-missing-learners"><summary>View ${item.missing} learner${item.missing === 1 ? '' : 's'}</summary><div>${names.map(escapeHtml).join('<br>')}</div></details>`
      : '<span class="workplace-missing-none">—</span>';
    const component = [item.component, item.mapePart].filter(Boolean).join(' · ');
    const entryState = !item.totalLearners ? 'empty' : (item.missing ? 'missing' : 'complete');
    return `<tr class="workplace-missing-row workplace-missing-row--term-${escapeHtml(item.term)} workplace-missing-row--${entryState}">
      <td><strong>${escapeHtml(item.assessment)}</strong>${component ? `<span>${escapeHtml(component)}</span>` : ''}</td>
      <td>${status}</td>
      <td>${learnerList}</td>
      <td><button class="btn btn-ghost btn-sm workplace-missing-open" type="button" data-missing-index="${index}">Open</button></td>
    </tr>`;
  }

  function missingMarkup(snapshot, scopedItems) {
    const assignment = snapshot.currentAssignment;
    const classLabel = assignment ? `Grade ${assignment.gradeLevel || ''} - ${assignment.section || ''} · ${assignment.subject || ''}` : 'No working class selected';
    const totalMissing = scopedItems.reduce((sum, item) => sum + Number(item.missing || 0), 0);
    const groupedRows = scopedItems.length
      ? `<tr class="workplace-term-separator workplace-term-separator--${escapeHtml(snapshot.currentTerm)}"><th colspan="4"><span></span>Term ${escapeHtml(snapshot.currentTerm)}<small>${scopedItems.length} assessment${scopedItems.length === 1 ? '' : 's'}</small></th></tr>${scopedItems.map((item, index) => missingRowMarkup(item, index)).join('')}`
      : '';
    const body = scopedItems.length
      ? `<div class="workplace-missing-table-wrap"><table class="workplace-missing-table">
          <thead><tr><th>Assessment</th><th>Missing</th><th>Learners</th><th></th></tr></thead>
          <tbody>${groupedRows}</tbody>
        </table></div>`
      : '<div class="workplace-chart-empty">No assessments are available for this class.</div>';
    return `<article class="workplace-insight-card workplace-grade-insight workplace-missing-card">
      <header><div><h4>Learners with missing grades</h4><p>${escapeHtml(classLabel)} · Term ${escapeHtml(snapshot.currentTerm)}</p></div><span class="workplace-insight-chip workplace-insight-chip--warning">${totalMissing} missing</span></header>
      ${body}
    </article>`;
  }

  function bindInsightEvents(analyticsSection, snapshot, scopedItems) {
    analyticsSection.querySelector('[data-performance-learner]')?.addEventListener('change', event => {
      const card = analyticsSection.querySelector('.workplace-performance-card');
      if (!card) return;
      const updated = performanceFor(snapshot, event.target.value);
      const replacement = document.createElement('div');
      replacement.innerHTML = performanceMarkup(updated).trim();
      card.replaceWith(replacement.firstElementChild);
      bindInsightEvents(analyticsSection, snapshot, scopedItems);
    });
    analyticsSection.querySelectorAll('.workplace-missing-open').forEach(button => {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        const item = scopedItems[Number(button.dataset.missingIndex)];
        if (item) globalScope.openDashboardWorkplaceAction('grading', item.assignmentId, item.term);
      });
    });
  }

  function renderGradeInsights() {
    const analyticsSection = document.querySelector('#dashboardWorkplace .workplace-analytics');
    if (!analyticsSection || analyticsSection.querySelector('.workplace-grade-insight')) return;
    const snapshot = DashboardWorkplace.snapshot(db, { schoolYear: db.schoolYear || '2026-2027' });
    const assignmentId = String(snapshot.currentAssignment?.id || '');
    const scopedItems = (snapshot.analytics.missingByAssessment || []).filter(item => String(item.assignmentId) === assignmentId && String(item.term) === String(snapshot.currentTerm) && item.hasHps);
    analyticsSection.insertAdjacentHTML('beforeend', missingMarkup(snapshot, scopedItems));
    bindInsightEvents(analyticsSection, snapshot, scopedItems);
  }

  globalScope.renderDashboardOverview = function renderDashboardOverviewWithGradeInsights() {
    baseRenderDashboardOverview();
    renderGradeInsights();
  };
})(window);
