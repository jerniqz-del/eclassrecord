(function () {
  'use strict';

  const SOURCE_LABELS = {
    'grading-sheet': 'Grading sheet',
    'quick-grade': 'Quick Grade',
    'mobile-sync': 'Mobile sync',
    'score-transfer-copy': 'Score transfer (copy)',
    'score-transfer-move': 'Score transfer (move)',
    'clear-column': 'Clear column',
    undo: 'Undo',
    redo: 'Redo',
    'teacher-tools-simulation': 'Teacher Tools simulation',
    'teacher-tools-revert': 'Teacher Tools revert',
    'checklist-publication': 'Checklist publication',
    'checklist-publication-revert': 'Checklist publication revert'
  };

  function valueLabel(value) {
    return value === null || value === undefined || value === '' ? 'Blank' : String(value);
  }

  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
  }

  function ensureModal() {
    let overlay = document.getElementById('scoreHistoryModal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'scoreHistoryModal';
    overlay.className = 'modal-overlay score-history-modal';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="modal score-history-dialog" role="dialog" aria-modal="true" aria-labelledby="scoreHistoryTitle">
        <div class="score-history-header">
          <div>
            <div id="scoreHistoryTitle" class="modal__title">Score history</div>
            <div id="scoreHistorySubtitle" class="score-history-subtitle"></div>
          </div>
          <button type="button" class="score-history-close" aria-label="Close score history">&times;</button>
        </div>
        <div id="scoreHistoryContext" class="score-history-context"></div>
        <div id="scoreHistoryList" class="score-history-list"></div>
        <div class="modal__actions"><button type="button" class="btn btn-primary btn-sm score-history-done">Done</button></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.score-history-close').addEventListener('click', closeScoreHistory);
    overlay.querySelector('.score-history-done').addEventListener('click', closeScoreHistory);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeScoreHistory();
    });
    return overlay;
  }

  function openScoreHistory(learnerId, assessmentId) {
    const assignment = typeof currentAssignment === 'function' ? currentAssignment() : null;
    if (!assignment || !globalThis.ScoreHistory) return;
    const learner = (assignment.learners || []).find(item => String(item.id) === String(learnerId));
    const assessment = (assignment.assessments || []).find(item => String(item.id) === String(assessmentId));
    const entries = ScoreHistory.forCell(assignment, learnerId, assessmentId);
    const overlay = ensureModal();
    const learnerName = learner && typeof learnerDisplayName === 'function' ? learnerDisplayName(learner) : 'Learner';
    const className = [assignment.gradeLevel, assignment.section, assignment.subject].filter(Boolean).join(' · ');
    const assessmentName = assessment?.title || (typeof assessmentHeaderLabel === 'function' ? assessmentHeaderLabel(assessment, assignment.assessments || []) : 'Assessment');
    const component = assessment?.component && typeof componentFullName === 'function' ? componentFullName(assessment.component) : assessment?.component || '';
    const term = assessment?.term || entries[0]?.term || '1';

    overlay.querySelector('#scoreHistorySubtitle').textContent = learnerName;
    overlay.querySelector('#scoreHistoryContext').innerHTML = `
      <div><span>Class</span><strong>${esc(className || 'Current class')}</strong></div>
      <div><span>Term</span><strong>Term ${esc(term)}</strong></div>
      <div><span>Assessment</span><strong>${esc([component, assessmentName].filter(Boolean).join(' · '))}</strong></div>`;
    overlay.querySelector('#scoreHistoryList').innerHTML = entries.length
      ? entries.map(entry => `
          <div class="score-history-entry">
            <div class="score-history-change">
              <span class="score-history-value score-history-value--old">${esc(valueLabel(entry.previousValue))}</span>
              <span class="score-history-arrow">→</span>
              <span class="score-history-value score-history-value--new">${esc(valueLabel(entry.newValue))}</span>
            </div>
            <div class="score-history-meta">
              <time>${esc(dateLabel(entry.changedAt))}</time>
              <span>${esc(SOURCE_LABELS[entry.source] || entry.source || 'Grading sheet')}</span>
            </div>
          </div>`).join('')
      : '<div class="score-history-empty">This score has no recorded changes yet. Its history will begin with the next edit.</div>';
    overlay.style.display = 'flex';
    overlay.querySelector('.score-history-close').focus({ preventScroll: true });
  }

  function closeScoreHistory() {
    const overlay = document.getElementById('scoreHistoryModal');
    if (overlay) overlay.style.display = 'none';
  }

  globalThis.openScoreHistory = openScoreHistory;
  globalThis.closeScoreHistory = closeScoreHistory;
})();
