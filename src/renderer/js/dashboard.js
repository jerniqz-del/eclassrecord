/**
 * E-Class Record — Dashboard Overview and Header Controller
 *
 * Populates class dashboard summary grids with modern card elements,
 * updates header metadata, and resolves DepEd policy naming.
 */

/**
 * Resolves appropriate policy label for display.
 */
function gradingLabel(a) {
  if (isKeyStage2(a)) return 'Compliant with DepEd Order No. 15 s. 2026';
  return policyLabel(a.policy);
}

function policyLabel(policy) {
  if (policy === 'KEY_STAGE_2_TRIMESTER') return 'Compliant with DepEd Order No. 15 s. 2026';
  if (policy === 'DO15_ZERO') return 'DO 015, s. 2026 Zero-Based';
  if (policy === 'DO15_DESCRIPTIVE') return 'DO 015, s. 2026 Descriptive Grading';
  return 'DO 015, s. 2026 Transition';
}

let dashboardDragState = null;
const DASHBOARD_VIEW_MODE_KEY = 'dashboard_view_mode';
let dashboardViewNavigationListenerStarted = false;

function getDashboardViewMode() {
  const savedMode = localStorage.getItem(DASHBOARD_VIEW_MODE_KEY);
  return savedMode === 'list' ? 'list' : 'grid';
}

function setDashboardViewMode(mode) {
  const nextMode = mode === 'list' ? 'list' : 'grid';
  localStorage.setItem(DASHBOARD_VIEW_MODE_KEY, nextMode);
  renderDashboardOverview();
}

function syncDashboardViewToggleVisibility() {
  const toggle = document.getElementById('dashboardViewToggle');
  if (!toggle) return;

  const liveView = typeof currentView === 'undefined' ? '' : currentView;
  const bodyView = document.body ? document.body.getAttribute('data-view') : '';
  const activeView = liveView || bodyView;
  const isDashboard = !activeView || activeView === 'dashboard';
  toggle.classList.toggle('dashboard-view-toggle--hidden', !isDashboard);
  toggle.style.display = isDashboard ? 'inline-flex' : 'none';
}

function ensureDashboardViewNavigationListener() {
  if (dashboardViewNavigationListenerStarted) return;
  dashboardViewNavigationListenerStarted = true;
  document.addEventListener('click', event => {
    if (event.target && event.target.closest && event.target.closest('[onclick*="setView("]')) {
      setTimeout(syncDashboardViewToggleVisibility, 0);
    }
  }, true);
}

function renderDashboardViewToggle() {
  const actions = document.querySelector('.app-header__actions');
  if (!actions) return;
  ensureDashboardViewNavigationListener();

  let toggle = document.getElementById('dashboardViewToggle');
  if (!toggle) {
    toggle = document.createElement('div');
    toggle.id = 'dashboardViewToggle';
    toggle.className = 'dashboard-view-toggle';
    toggle.setAttribute('aria-label', 'Dashboard view mode');
    toggle.innerHTML = `
      <button type="button" class="dashboard-view-toggle__btn" data-dashboard-view="grid" onclick="setDashboardViewMode('grid')" title="Grid view">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
        Grid
      </button>
      <button type="button" class="dashboard-view-toggle__btn" data-dashboard-view="list" onclick="setDashboardViewMode('list')" title="List view">
        <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>
        List
      </button>
    `;
    const autoSave = document.getElementById('autoSaveIndicator');
    if (autoSave && autoSave.parentNode === actions) {
      autoSave.insertAdjacentElement('afterend', toggle);
    } else {
      actions.prepend(toggle);
    }
  }

  syncDashboardViewToggleVisibility();
  const mode = getDashboardViewMode();
  toggle.querySelectorAll('[data-dashboard-view]').forEach(button => {
    const active = button.dataset.dashboardView === mode;
    button.classList.toggle('dashboard-view-toggle__btn--active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function dashboardOrderValue(assignment, fallbackIndex) {
  const value = Number(assignment && assignment.dashboardOrder);
  return Number.isFinite(value) ? value : fallbackIndex;
}

function getOrderedDashboardAssignments(activeYear) {
  return (db.assignments || [])
    .map((assignment, index) => ({ assignment, index }))
    .filter(item => item.assignment.schoolYear === activeYear)
    .sort((left, right) => {
      const orderDiff = dashboardOrderValue(left.assignment, left.index) - dashboardOrderValue(right.assignment, right.index);
      return orderDiff || left.index - right.index;
    })
    .map(item => item.assignment);
}

/**
 * Renders high-level overview cards for all registered teaching loads.
 */
function renderDashboardOverview() {
  const target = document.getElementById('dashboardTable');
  if (!target) return;
  renderDashboardViewToggle();

  const activeYear = db.schoolYear || '2026-2027';
  const filtered = getOrderedDashboardAssignments(activeYear);

  const viewMode = getDashboardViewMode();
  let html = `<div class="dashboard-cards-grid dashboard-cards--${viewMode}">`;
  html += AdvisoryDashboard.renderCard(db, activeYear, viewMode, esc);
  for (let i = 0; i < filtered.length; i++) {
    const a = filtered[i];
    const isActive = a.id === db.currentAssignmentId;
    const colorClass = subjectColorClass(a.subject);
    let cardClass = isActive
      ? `dashboard-card dashboard-card--active subject--${colorClass}`
      : `dashboard-card subject--${colorClass}`;
    if (viewMode === 'list') cardClass += ' dashboard-card--list';

    const learners = a.learners || [];
    const males = learners.filter(l => l.sex === 'M').length;
    const females = learners.filter(l => l.sex === 'F').length;
    const total = learners.length;
    const isMapeh = isMapehSubject(a.subject);

    html += `
      <div class="${cardClass}" draggable="true" data-dashboard-draggable="true" data-assignment-id="${esc(a.id)}"
        onclick="handleDashboardCardClick(event, '${esc(a.id)}');"
        ondragstart="handleDashboardCardDragStart(event)"
        ondragover="handleDashboardCardDragOver(event)"
        ondragleave="handleDashboardCardDragLeave(event)"
        ondrop="handleDashboardCardDrop(event)"
        ondragend="handleDashboardCardDragEnd(event)"
        data-active-term="1" ${isMapeh ? 'data-active-part="music_arts"' : ''}>
        
        <div class="dashboard-card__identity">
          <h3 class="dashboard-card__title">Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</h3>
          <div class="dashboard-card__subject">${esc(a.subject)}</div>
        </div>
        
        <div class="dashboard-card__students-details">
          <span><strong>${total}</strong> learners</span>
          <span>M: ${males}</span>
          <span>F: ${females}</span>
        </div>

        <div class="dashboard-card__selectors" onclick="event.stopPropagation();">
          <div class="card-pills-row">
            <span class="text-xs text-muted" style="margin-right:4px;">Term:</span>
            <button type="button" class="card-pill card-pill--term card-pill--active" onclick="switchCardTab(this, 'term', '1')">Term 1</button>
            <button type="button" class="card-pill card-pill--term" onclick="switchCardTab(this, 'term', '2')">Term 2</button>
            <button type="button" class="card-pill card-pill--term" onclick="switchCardTab(this, 'term', '3')">Term 3</button>
          </div>
          ${isMapeh ? `
          <div class="card-pills-row" style="margin-top: 4px;">
            <span class="text-xs text-muted" style="margin-right:4px;">Strand:</span>
            <button type="button" class="card-pill card-pill--part card-pill--active" onclick="switchCardTab(this, 'part', 'music_arts')">Music & Arts</button>
            <button type="button" class="card-pill card-pill--part" onclick="switchCardTab(this, 'part', 'pe_health')">PE & Health</button>
          </div>
          ` : ''}
        </div>

        <div class="dashboard-card__assessments-panel">
          ${[1, 2, 3].map(term => {
            return `
              <div class="term-group-content" data-term="${term}">
                ${isMapeh ? ['music_arts', 'pe_health'].map(part => {
                  return `
                    <div class="part-group-content" data-part="${part}">
                      ${renderDashboardAssessmentSummaryLine(a, String(term), part)}
                    </div>
                  `;
                }).join('') : `
                  ${renderDashboardAssessmentSummaryLine(a, String(term), undefined)}
                `}
              </div>
            `;
          }).join('')}
        </div>

        <div class="dashboard-card__actions" onclick="event.stopPropagation();">
          <button class="btn btn-primary btn-sm dashboard-card__export-btn" type="button" onclick="showGradeTransferExportModal('${esc(a.id)}')">
            Export Final Grades
          </button>
          <button class="btn btn-olive btn-sm dashboard-card__report-btn" type="button" onclick="openDashboardReport(this, '${esc(a.id)}')">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 20V10"></path>
              <path d="M12 20V4"></path>
              <path d="M6 20v-6"></path>
            </svg>
            Reports
          </button>
        </div>
      </div>
    `;
  }
  html += `
      <button class="dashboard-card dashboard-card--add" onclick="showAddClassLoadModal()" type="button">
        <span class="dashboard-card--add__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </span>
        <span class="dashboard-card--add__title">Add Class Load</span>
        <span class="dashboard-card--add__hint">Create another teaching load for this school year.</span>
      </button>
  `;
  html += '</div>';
  target.innerHTML = html;
}

function handleDashboardCardClick(event, assignmentId) {
  if (dashboardDragState && dashboardDragState.moved) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  selectAssignment(assignmentId);
  setView('record');
  syncDashboardViewToggleVisibility();
}

function handleDashboardCardDragStart(event) {
  const card = event.currentTarget;
  if (!card || card.dataset.dashboardFixed === 'true' || !card.dataset.assignmentId) {
    event.preventDefault();
    return;
  }
  if (event.target.closest('button, input, select, textarea, a, .dashboard-view-toggle, .dashboard-card__selectors, .dashboard-card__actions')) {
    event.preventDefault();
    return;
  }

  dashboardDragState = {
    assignmentId: card.dataset.assignmentId,
    moved: false
  };
  card.classList.add('dashboard-card--dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.assignmentId);
}

function handleDashboardCardDragOver(event) {
  const card = event.currentTarget;
  if (!dashboardDragState || !card || card.dataset.assignmentId === dashboardDragState.assignmentId) return;
  event.preventDefault();
  dashboardDragState.moved = true;
  event.dataTransfer.dropEffect = 'move';

  const rect = card.getBoundingClientRect();
  const dropAfter = event.clientY > rect.top + rect.height / 2;
  card.classList.toggle('dashboard-card--drop-before', !dropAfter);
  card.classList.toggle('dashboard-card--drop-after', dropAfter);
}

function handleDashboardCardDragLeave(event) {
  clearDashboardDropClasses(event.currentTarget);
}

function handleDashboardCardDrop(event) {
  const card = event.currentTarget;
  if (!dashboardDragState || !card) return;
  event.preventDefault();
  clearDashboardDropClasses(card);

  const sourceId = event.dataTransfer.getData('text/plain') || dashboardDragState.assignmentId;
  const targetId = card.dataset.assignmentId;
  if (!sourceId || !targetId || sourceId === targetId) return;

  const rect = card.getBoundingClientRect();
  const position = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  reorderDashboardAssignments(sourceId, targetId, position);
  dashboardDragState.moved = true;
}

function handleDashboardCardDragEnd() {
  document.querySelectorAll('.dashboard-card--dragging, .dashboard-card--drop-before, .dashboard-card--drop-after')
    .forEach(clearDashboardDropClasses);
  setTimeout(() => {
    dashboardDragState = null;
  }, 0);
}

function clearDashboardDropClasses(card) {
  if (!card) return;
  card.classList.remove('dashboard-card--dragging', 'dashboard-card--drop-before', 'dashboard-card--drop-after');
}

function reorderDashboardAssignments(sourceId, targetId, position) {
  const activeYear = db.schoolYear || '2026-2027';
  const ordered = getOrderedDashboardAssignments(activeYear);
  const source = ordered.find(item => item.id === sourceId);
  const target = ordered.find(item => item.id === targetId);
  if (!source || !target) return;

  const nextOrder = ordered.filter(item => item.id !== sourceId);
  const targetIndex = nextOrder.findIndex(item => item.id === targetId);
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  nextOrder.splice(insertIndex, 0, source);
  nextOrder.forEach((assignment, index) => {
    assignment.dashboardOrder = index;
  });

  saveDatabase();
  renderDashboardOverview();
  toast('Dashboard class order updated.', 'success');
}

function openDashboardReport(button, assignmentId) {
  const card = button ? button.closest('.dashboard-card') : null;
  const term = card ? (card.getAttribute('data-active-term') || '1') : '1';
  const mapePart = card ? card.getAttribute('data-active-part') : undefined;
  showClassAnalysisModal(assignmentId, null, term, mapePart);
}

/**
 * Handles toggling active states of card pills and updates card attributes.
 */
function switchCardTab(button, type, value) {
  const card = button.closest('.dashboard-card');
  if (!card) return;
  
  const parent = button.parentNode;
  parent.querySelectorAll('.card-pill').forEach(btn => btn.classList.remove('card-pill--active'));
  button.classList.add('card-pill--active');
  
  if (type === 'term') {
    card.setAttribute('data-active-term', value);
  } else if (type === 'part') {
    card.setAttribute('data-active-part', value);
  }
}

/**
 * Renders one compact assessment summary line for the dashboard card.
 */
function renderDashboardAssessmentSummaryLine(a, term, mapePart) {
  const items = termAssessments(a, term, mapePart);
  const strandLabel = mapePart === 'music_arts'
    ? 'Music & Arts'
    : (mapePart === 'pe_health' ? 'PE & Health' : '');

  if (items.length === 0) {
    const emptyText = strandLabel
      ? `${esc(strandLabel)} &middot; No assessments configured`
      : 'No assessments configured';
    return `
      <div class="dashboard-assessment-summary dashboard-assessment-summary--line">
        <div class="dashboard-summary-line">
          <span class="dashboard-summary-line__primary">Term ${esc(term)}</span>
          <span class="dashboard-summary-line__meta">${emptyText}</span>
        </div>
      </div>
    `;
  }

  const learners = a.learners || [];
  const activeLearners = learners.filter(learner => !learner.transferredOutTerm);
  const learnerCount = activeLearners.length;
  const hpsReady = items.filter(item => (parseFloat(item.maxScore) || 0) > 0).length;
  const possibleScores = learnerCount * items.length;
  let scoredCount = 0;

  items.forEach(item => {
    activeLearners.forEach(learner => {
      const value = a.scores ? a.scores[`${learner.id}|${item.id}`] : '';
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        scoredCount++;
      }
    });
  });

  const completionPercent = possibleScores > 0 ? Math.round((scoredCount / possibleScores) * 100) : 0;
  const summaryParts = [
    strandLabel,
    `${items.length} assessment${items.length === 1 ? '' : 's'}`,
    `HPS ${hpsReady}/${items.length} ready`,
    possibleScores > 0 ? `${scoredCount}/${possibleScores} scores` : 'No learners',
    `${completionPercent}% complete`
  ].filter(Boolean);

  return `
    <div class="dashboard-assessment-summary dashboard-assessment-summary--line">
      <div class="dashboard-summary-line">
        <span class="dashboard-summary-line__primary">Term ${esc(term)}</span>
        <span class="dashboard-summary-line__meta">${summaryParts.map(part => esc(part)).join(' &middot; ')}</span>
      </div>
    </div>
  `;
}

/**
 * Renders compact assessment progress grouped by grading component.
 */
function renderDashboardAssessmentSummary(a, term, mapePart) {
  const items = termAssessments(a, term, mapePart);
  if (items.length === 0) {
    return '<div class="card-empty-assessments">No assessments configured for this term.</div>';
  }

  const groups = {
    WW: [],
    PT: [],
    SA: [],
    TE: []
  };
  const labelMap = {
    WW: 'Written Works',
    PT: 'Performance Tasks',
    SA: 'Summative Tests',
    TE: 'Term Examination'
  };

  items.forEach(ast => {
    if (ast.component === 'WW') groups.WW.push(ast);
    else if (ast.component === 'PT') groups.PT.push(ast);
    else if (ast.component === 'SA1' || ast.component === 'SA2' || ast.component === 'ST1' || ast.component === 'ST2') groups.SA.push(ast);
    else if (ast.component === 'TE') groups.TE.push(ast);
  });

  const learners = a.learners || [];
  const activeLearners = learners.filter(learner => !learner.transferredOutTerm);
  const learnerCount = activeLearners.length;
  let rowsHtml = '';

  for (const groupKey of ['WW', 'PT', 'SA', 'TE']) {
    const groupItems = groups[groupKey];
    if (groupItems.length === 0) continue;

    const hpsReady = groupItems.filter(item => (parseFloat(item.maxScore) || 0) > 0).length;
    const possibleScores = learnerCount * groupItems.length;
    let scoredCount = 0;

    groupItems.forEach(item => {
      activeLearners.forEach(learner => {
        const value = a.scores ? a.scores[`${learner.id}|${item.id}`] : '';
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          scoredCount++;
        }
      });
    });

    const completionPercent = possibleScores > 0 ? Math.round((scoredCount / possibleScores) * 100) : 0;
    const hpsText = `${hpsReady}/${groupItems.length} HPS`;
    const scoreText = possibleScores > 0 ? `${scoredCount}/${possibleScores} scored` : 'No learners';

    rowsHtml += `
      <div class="dashboard-progress-row">
        <div class="dashboard-progress-row__main">
          <span class="dashboard-progress-row__label">${labelMap[groupKey]}</span>
          <span class="dashboard-progress-row__meta">${groupItems.length} item${groupItems.length === 1 ? '' : 's'} · ${hpsText}</span>
        </div>
        <div class="dashboard-progress-row__status">
          <span>${scoreText}</span>
          <strong>${completionPercent}%</strong>
        </div>
        <div class="dashboard-progress-row__bar" aria-hidden="true">
          <span style="width:${completionPercent}%"></span>
        </div>
      </div>
    `;
  }

  if (!rowsHtml) {
    return '<div class="card-empty-assessments">No assessments configured for this term.</div>';
  }

  return `
    <div class="dashboard-assessment-summary">
      ${rowsHtml}
    </div>
  `;
}

/**
 * Renders the list of assessments grouped by component.
 */
function renderAssessmentsList(a, term, mapePart) {
  const items = termAssessments(a, term, mapePart);
  if (items.length === 0) {
    return '<div class="card-empty-assessments">No assessments seeded.</div>';
  }
  
  const groups = {
    'WW': [],
    'PT': [],
    'SA': [],
    'TE': []
  };
  
  items.forEach(ast => {
    if (ast.component === 'WW') groups['WW'].push(ast);
    else if (ast.component === 'PT') groups['PT'].push(ast);
    else if (ast.component === 'SA1' || ast.component === 'SA2' || ast.component === 'ST1' || ast.component === 'ST2') groups['SA'].push(ast);
    else if (ast.component === 'TE') groups['TE'].push(ast);
  });
  
  let html = '<div class="assessments-list">';
  
  const labelMap = {
    'WW': 'Written Works',
    'PT': 'Performance Tasks',
    'SA': 'Summative Tests',
    'TE': 'Term Examination'
  };
  
  for (const groupKey in groups) {
    const list = groups[groupKey];
    if (list.length === 0) continue;
    
    html += `
      <div class="assessment-group">
        <div class="assessment-group__title">${labelMap[groupKey]}</div>
        <div class="assessment-group__items">
          ${list.map(ast => {
            const hps = parseFloat(ast.maxScore) || 0;
            const stats = computeAssessmentStats(a, ast);
            
            return `
              <div class="assessment-item">
                <div class="assessment-item__header">
                  <span class="assessment-item__name">${esc(ast.title || componentLabel(ast.component))}</span>
                  <span class="assessment-item__hps">HPS: ${hps > 0 ? hps : '--'}</span>
                </div>
                ${hps > 0 && stats.count > 0 ? `
                  <div class="assessment-item__analytics">
                    <span title="Class Average Score">Avg: <strong>${stats.avg}</strong> (${Math.round((stats.avg / hps) * 100)}%)</span>
                    <span title="Highest & Lowest Scores">Range: <strong>${stats.min}-${stats.max}</strong></span>
                    <span title="Passing Rate (>=75%)">Pass: <strong>${stats.passRate}%</strong></span>
                  </div>
                ` : `
                  <div class="assessment-item__analytics text-muted">No scores recorded</div>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

/**
 * Computes analytics stats for a single assessment.
 */
function computeAssessmentStats(a, ast) {
  let sum = 0;
  let count = 0;
  let max = -Infinity;
  let min = Infinity;
  let passCount = 0;
  
  const hps = parseFloat(ast.maxScore) || 0;
  
  a.learners.forEach(l => {
    const scoreKey = `${l.id}|${ast.id}`;
    const scoreVal = a.scores[scoreKey];
    if (scoreVal !== undefined && scoreVal !== '') {
      const val = parseFloat(scoreVal);
      if (!isNaN(val)) {
        sum += val;
        count++;
        if (val > max) max = val;
        if (val < min) min = val;
        if (hps > 0 && val >= hps * 0.75) {
          passCount++;
        }
      }
    }
  });
  
  return {
    count,
    avg: count > 0 ? (sum / count).toFixed(1) : 0,
    min: count > 0 ? min : 0,
    max: count > 0 ? max : 0,
    passRate: count > 0 ? Math.round((passCount / count) * 100) : 0
  };
}

/**
 * Populates header titles and card figures based on active load.
 */
function renderCurrentHeader() {
  const a = currentAssignment();
  
  const titleEl = document.getElementById('currentTitle');
  const schoolEl = document.getElementById('headerSchoolName');
  const policyEl = document.getElementById('headerPolicy');
  const selectYear = document.getElementById('schoolYear');
  const dots = document.querySelectorAll('#currentMeta .meta-dot');
  
  if (selectYear && typeof db !== 'undefined' && db.schoolYear) {
    selectYear.value = db.schoolYear;
  }
  
  if (!a) {
    if (titleEl) {
      titleEl.innerHTML = 'No Class Selected';
      titleEl.style.color = 'var(--text-tertiary)';
      titleEl.style.fontStyle = 'normal';
    }
    if (schoolEl) {
      schoolEl.innerHTML = esc(db.schoolName || '—');
    }
    if (dots.length >= 2) {
      dots[0].style.display = '';
      dots[1].style.display = 'none';
    } else {
      dots.forEach(d => d.style.display = 'none');
    }
    if (policyEl) policyEl.style.display = 'none';
    if (selectYear) selectYear.style.display = '';
    return;
  }
  
  if (dots.length >= 2) {
    dots[0].style.display = '';
    dots[1].style.display = '';
  } else {
    dots.forEach(d => d.style.display = '');
  }
  if (policyEl) policyEl.style.display = '';
  if (selectYear) selectYear.style.display = '';

  if (titleEl) {
    titleEl.innerHTML = `Grade ${esc(a.gradeLevel)} — ${esc(a.section)} &middot; ${esc(a.subject)}`;
    titleEl.style.color = '';
    titleEl.style.fontStyle = '';
  }
  
  if (schoolEl) schoolEl.innerHTML = esc(db.schoolName || '—');
  if (policyEl) policyEl.innerHTML = esc(gradingLabel(a));
}
