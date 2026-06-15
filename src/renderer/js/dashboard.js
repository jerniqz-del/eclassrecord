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
  if (isKeyStage2(a)) return 'Key Stage 2 Trimester E-Class Record';
  return policyLabel(a.policy);
}

function policyLabel(policy) {
  if (policy === 'KEY_STAGE_2_TRIMESTER') return 'Key Stage 2 Trimester E-Class Record';
  if (policy === 'DO15_ZERO') return 'DO 015, s. 2026 Zero-Based';
  if (policy === 'DO8_2015') return 'DO 8, s. 2015 Legacy';
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
      "setView('classes')"
    );
    return;
  }

  let html = '<div class="dashboard-cards-grid">';
  for (let i = 0; i < db.assignments.length; i++) {
    const a = db.assignments[i];
    const w = weightsFor(a.subjectGroup);
    const isActive = a.id === db.currentAssignmentId;
    const cardClass = isActive ? 'dashboard-card dashboard-card--active' : 'dashboard-card';
    
    html += `
      <div class="${cardClass}" onclick="selectAssignment('${esc(a.id)}')">
        <div class="dashboard-card__badge">${esc(gradingLabel(a))}</div>
        <h3 class="dashboard-card__title">Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</h3>
        <div class="dashboard-card__subject">${esc(a.subject)}</div>
        
        <div class="dashboard-card__stats">
          <div class="dashboard-card__stat-item">
            <span class="dashboard-card__stat-label">Students</span>
            <span class="dashboard-card__stat-value">${a.learners.length}</span>
          </div>
          <div class="dashboard-card__stat-item">
            <span class="dashboard-card__stat-label">Assessments</span>
            <span class="dashboard-card__stat-value">${a.assessments.length}</span>
          </div>
          <div class="dashboard-card__stat-item">
            <span class="dashboard-card__stat-label">Weights</span>
            <span class="dashboard-card__stat-value">${w[0]}-${w[1]}-${w[2]}</span>
          </div>
        </div>
        
        <div class="dashboard-card__actions">
          <button
            class="btn btn-primary btn-sm"
            onclick="event.stopPropagation(); selectAssignment('${esc(a.id)}'); setView('record');">
            Enter Grades
          </button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  target.innerHTML = html;
}

/**
 * Populates header titles and card figures based on active load.
 */
function renderCurrentHeader() {
  const a = currentAssignment();
  
  const titleEl = document.getElementById('currentTitle');
  const metaEl = document.getElementById('currentMeta');
  
  if (!a) {
    if (titleEl) {
      titleEl.innerHTML = 'No Class Selected';
      titleEl.style.color = 'var(--text-tertiary)';
      titleEl.style.fontStyle = 'normal';
    }
    if (metaEl) metaEl.innerHTML = 'Select a class from the Teaching Load list, or add one in Classes ↗';
    return;
  }
  
  if (titleEl) {
    titleEl.innerHTML = `Grade ${esc(a.gradeLevel)} — ${esc(a.section)} &middot; ${esc(a.subject)}`;
    titleEl.style.color = '';
    titleEl.style.fontStyle = '';
  }
  if (metaEl) metaEl.innerHTML = `${esc(db.schoolName || '—')} &nbsp;|&nbsp; ${esc(db.schoolYear || '—')} &nbsp;|&nbsp; ${esc(gradingLabel(a))}`;
}

