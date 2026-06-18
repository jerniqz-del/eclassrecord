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

/**
 * Renders high-level overview cards for all registered teaching loads.
 */
function renderDashboardOverview() {
  const target = document.getElementById('dashboardTable');
  if (!target) return;
  
  if (!db.assignments || db.assignments.length === 0) {
    target.innerHTML = emptyState(
      'Welcome to E-Class Record',
      'Start by adding a teaching load — set your grade level, section, and subject in the sidebar.',
      'Add Your First Teaching Load',
      "handleAddFirstClassLoad()"
    );
    return;
  }

  const activeYear = db.schoolYear || '2026-2027';
  const filtered = db.assignments.filter(a => a.schoolYear === activeYear);

  if (filtered.length === 0) {
    target.innerHTML = emptyState(
      'No Teaching Load',
      `You have no teaching loads registered for school year ${esc(activeYear)}. Setup a new class load to get started.`,
      'Add a Teaching Load',
      "showAddClassLoadModal()"
    );
    return;
  }

  let html = '<div class="dashboard-cards-grid">';
  for (let i = 0; i < filtered.length; i++) {
    const a = filtered[i];
    const isActive = a.id === db.currentAssignmentId;
    const colorClass = subjectColorClass(a.subject);
    const cardClass = isActive
      ? `dashboard-card dashboard-card--active subject--${colorClass}`
      : `dashboard-card subject--${colorClass}`;

    const males = a.learners.filter(l => l.sex === 'M').length;
    const females = a.learners.filter(l => l.sex === 'F').length;
    const total = a.learners.length;
    const isMapeh = isMapehSubject(a.subject);

    html += `
      <div class="${cardClass}" onclick="selectAssignment('${esc(a.id)}'); setView('record');" 
        data-active-term="1" ${isMapeh ? 'data-active-part="music_arts"' : ''}>
        
        <h3 class="dashboard-card__title">Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</h3>
        <div class="dashboard-card__subject">${esc(a.subject)}</div>
        
        <div class="dashboard-card__students-details">
          <strong>Learners:</strong> ${total} &nbsp;(M: ${males} &middot; F: ${females})
        </div>

        <div class="dashboard-card__selectors" onclick="event.stopPropagation();">
          <div class="card-pills-row">
            <span class="text-xs text-muted" style="margin-right:4px;">Term:</span>
            <button class="card-pill card-pill--term card-pill--active" onclick="switchCardTab(this, 'term', '1')">Term 1</button>
            <button class="card-pill card-pill--term" onclick="switchCardTab(this, 'term', '2')">Term 2</button>
            <button class="card-pill card-pill--term" onclick="switchCardTab(this, 'term', '3')">Term 3</button>
          </div>
          ${isMapeh ? `
          <div class="card-pills-row" style="margin-top: 4px;">
            <span class="text-xs text-muted" style="margin-right:4px;">Strand:</span>
            <button class="card-pill card-pill--part card-pill--active" onclick="switchCardTab(this, 'part', 'music_arts')">Music & Arts</button>
            <button class="card-pill card-pill--part" onclick="switchCardTab(this, 'part', 'pe_health')">PE & Health</button>
          </div>
          ` : ''}
        </div>

        <div class="dashboard-card__assessments-panel" onclick="event.stopPropagation();">
          ${[1, 2, 3].map(term => {
            return `
              <div class="term-group-content" data-term="${term}">
                ${isMapeh ? ['music_arts', 'pe_health'].map(part => {
                  return `
                    <div class="part-group-content" data-part="${part}">
                      ${renderAssessmentsList(a, String(term), part)}
                    </div>
                  `;
                }).join('') : `
                  ${renderAssessmentsList(a, String(term), undefined)}
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  html += '</div>';
  target.innerHTML = html;
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
