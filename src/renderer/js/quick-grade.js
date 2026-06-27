/**
 * E-Class Record — Quick Grade Entry Module
 *
 * Implements the sequential grading modal allowing teachers to enter scores
 * student-by-student with instant saving and keyboard navigation.
 */

let quickGradeLearnerIndex = 0;
let quickGradeAssessmentId = '';

/**
 * Shows the Quick Grade Entry modal, initializing select list and active indices.
 */
function showQuickGradeModal() {
  const a = currentAssignment();
  if (!a) {
    toast('No class load selected.', 'warning');
    return;
  }
  
  if (a.learners.length === 0) {
    toast('Please add learners to this class load first.', 'warning');
    return;
  }
  
  const isMapeh = isMapehSubject(a.subject);
  const mapePart = isMapeh ? currentMapehSubTab : undefined;
  const assessments = termAssessments(a, db.currentTerm, mapePart);
  
  if (assessments.length === 0) {
    toast('No assessments found for the current grading sheet.', 'warning');
    return;
  }
  
  // Default to previously focused cell/column details if valid
  let defaultAstId = assessments[0].id;
  if (window.lastFocusedAssessmentId) {
    const found = assessments.find(x => x.id === window.lastFocusedAssessmentId);
    if (found) {
      defaultAstId = found.id;
    }
  }
  quickGradeAssessmentId = defaultAstId;
  
  let defaultLearnerIdx = 0;
  if (window.lastFocusedLearnerIndex !== undefined && window.lastFocusedLearnerIndex >= 0 && window.lastFocusedLearnerIndex < a.learners.length) {
    defaultLearnerIdx = window.lastFocusedLearnerIndex;
  }
  quickGradeLearnerIndex = defaultLearnerIdx;
  
  // Populate the assessment drop-down selector
  const select = document.getElementById('quickGradeAssessmentSelect');
  if (select) {
    select.innerHTML = '';
    assessments.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      
      let compLabel = '';
      const comp = item.component;
      const title = (item.title || '').trim();
      
      let compName = '';
      if (comp === 'WW') {
        compName = 'Written Works';
      } else if (comp === 'PT') {
        compName = 'Performance Task';
      } else if (comp === 'SA1' || comp === 'ST1' || comp === 'SA2' || comp === 'ST2' || comp === 'SA') {
        compName = 'Summative Assessment';
      } else if (comp === 'TE') {
        compName = 'Term Examination';
      } else {
        compName = componentLabel(comp);
      }
      
      const cleanTitle = title.toUpperCase();
      const cleanComp = comp.toUpperCase();
      if (cleanTitle === cleanComp || cleanTitle === 'WW' || cleanTitle === 'PT' || cleanTitle === 'SA' || cleanTitle === 'TE' || cleanTitle === 'SA1' || cleanTitle === 'SA2' || cleanTitle === 'ST1' || cleanTitle === 'ST2') {
        compLabel = compName;
      } else if (title) {
        compLabel = `${compName} ${title}`;
      } else {
        compLabel = compName;
      }
      
      const hps = item.maxScore ? `HPS: ${item.maxScore}` : 'HPS: Not Set';
      opt.textContent = `${compLabel} (${hps})`;
      if (item.id === quickGradeAssessmentId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }
  
  // Open modal overlay
  showEl('quickGradeModal', true, 'flex');
  
  // Initial population of modal fields
  onQuickGradeAssessmentChanged();
}

/**
 * Hides the Quick Grade Entry modal, saving any unsaved scores.
 */
function hideQuickGradeModal() {
  saveActiveScore();
  showEl('quickGradeModal', false);
  
  // Re-focus the cell in the record table if last active indices are known
  if (window.lastFocusedLearnerIndex !== undefined && window.lastFocusedAssessmentId) {
    const a = currentAssignment();
    if (a) {
      const isMapeh = isMapehSubject(a.subject);
      const mapePart = isMapeh ? currentMapehSubTab : undefined;
      const items = termAssessments(a, db.currentTerm, mapePart);
      const colIndex = items.findIndex(it => it.id === window.lastFocusedAssessmentId);
      if (colIndex !== -1) {
        const cellEl = document.getElementById(`sc-${window.lastFocusedLearnerIndex}-${colIndex}`);
        if (cellEl) {
          setTimeout(() => {
            cellEl.focus();
            if (cellEl.select) cellEl.select();
          }, 50);
        }
      }
    }
  }
}

/**
 * Event handler triggered when the selected assessment dropdown option changes.
 */
function onQuickGradeAssessmentChanged() {
  const select = document.getElementById('quickGradeAssessmentSelect');
  if (!select) return;
  quickGradeAssessmentId = select.value;
  
  renderQuickGradeRoster();
  updateQuickGradeActiveLearner();
  updateQuickGradeAssessmentDetails();
}

/**
 * Updates the details box for the currently active assessment.
 */
function updateQuickGradeAssessmentDetails() {
  const a = currentAssignment();
  if (!a) return;
  
  const detailsEl = document.getElementById('quickGradeAssessmentDetails');
  if (!detailsEl) return;
  
  const assessment = a.assessments.find(x => x.id === quickGradeAssessmentId);
  if (!assessment) {
    detailsEl.innerHTML = '';
    return;
  }
  
  const topicText = assessment.topic || 'No topic specified';
  const dateText = assessment.date ? new Date(assessment.date).toLocaleDateString() : 'No date specified';
  const maxScoreText = assessment.maxScore ? `${assessment.maxScore} points` : 'Not set';
  
  let compName = '';
  const comp = assessment.component;
  if (comp === 'WW') {
    compName = 'Written Works';
  } else if (comp === 'PT') {
    compName = 'Performance Task';
  } else if (comp === 'SA1' || comp === 'ST1' || comp === 'SA2' || comp === 'ST2' || comp === 'SA') {
    compName = 'Summative Assessment';
  } else if (comp === 'TE') {
    compName = 'Term Examination';
  } else {
    compName = componentLabel(comp);
  }
  
  detailsEl.innerHTML = `
    <div style="background: var(--bg-surface-hover); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-3); font-size: var(--font-size-xs); line-height: 1.45; color: var(--text-secondary);">
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-2);">
        <div><strong>Component:</strong> ${esc(compName)}</div>
        <div><strong>HPS:</strong> ${esc(maxScoreText)}</div>
        <div><strong>Date:</strong> ${esc(dateText)}</div>
      </div>
      <div style="border-top: 1px dashed var(--border-subtle); padding-top: var(--space-2);">
        <strong>Topic:</strong> ${esc(topicText)}
      </div>
    </div>
  `;
}

/**
 * Renders the sidebar student roster list with real-time score indicators.
 */
function renderQuickGradeRoster() {
  const a = currentAssignment();
  if (!a) return;
  
  const rosterList = document.getElementById('quickGradeRosterList');
  if (!rosterList) return;
  rosterList.innerHTML = '';
  
  let gradedCount = 0;
  a.learners.forEach((learner, index) => {
    const scoreKey = `${learner.id}|${quickGradeAssessmentId}`;
    const score = a.scores[scoreKey];
    const hasScore = score !== undefined && score !== '';
    if (hasScore) gradedCount++;
    
    const item = document.createElement('div');
    item.id = `qg-roster-item-${index}`;
    item.className = 'quick-grade-roster-item' + (index === quickGradeLearnerIndex ? ' quick-grade-roster-item--active' : '');
    item.onclick = () => quickGradeJumpToLearner(index);
    
    const displayName = learnerDisplayName(learner);
    item.innerHTML = `
      <span class="quick-grade-roster-item__name">${index + 1}. ${esc(displayName)}</span>
      <span class="quick-grade-roster-item__score">${hasScore ? esc(score) : '—'}</span>
    `;
    rosterList.appendChild(item);
  });
  
  // Update overall progression label
  const progressEl = document.getElementById('quickGradeProgress');
  if (progressEl) {
    const pct = a.learners.length > 0 ? Math.round((gradedCount / a.learners.length) * 100) : 0;
    progressEl.textContent = `Graded: ${gradedCount} / ${a.learners.length} (${pct}%)`;
  }
}

/**
 * Updates the active student details card in the center panel.
 */
function updateQuickGradeActiveLearner() {
  const a = currentAssignment();
  if (!a) return;
  
  const learner = a.learners[quickGradeLearnerIndex];
  if (!learner) return;
  
  const nameEl = document.getElementById('quickGradeLearnerName');
  if (nameEl) nameEl.textContent = learnerDisplayName(learner);
  
  const metaEl = document.getElementById('quickGradeLearnerMeta');
  if (metaEl) {
    metaEl.textContent = `LRN: ${esc(learner.lrn || '—')} | Sex: ${esc(learner.sex || '—')}`;
  }
  
  const assessment = a.assessments.find(x => x.id === quickGradeAssessmentId);
  const maxScore = assessment ? number(assessment.maxScore) : 0;
  
  const hpsEl = document.getElementById('quickGradeHpsLabel');
  if (hpsEl) {
    hpsEl.textContent = maxScore > 0 ? `/ ${maxScore}` : '/ —';
  }
  
  const scoreKey = `${learner.id}|${quickGradeAssessmentId}`;
  const score = a.scores[scoreKey];
  
  const input = document.getElementById('quickGradeScoreInput');
  if (input) {
    input.value = score !== undefined ? score : '';
  }
  
  // Highlight active row in roster list
  a.learners.forEach((_, index) => {
    const item = document.getElementById(`qg-roster-item-${index}`);
    if (item) {
      if (index === quickGradeLearnerIndex) {
        item.classList.add('quick-grade-roster-item--active');
      } else {
        item.classList.remove('quick-grade-roster-item--active');
      }
    }
  });
  
  // Custom container auto-scroll
  const listContainer = document.getElementById('quickGradeRosterList');
  const activeItem = document.getElementById(`qg-roster-item-${quickGradeLearnerIndex}`);
  if (listContainer && activeItem) {
    const containerHeight = listContainer.clientHeight;
    const itemTop = activeItem.offsetTop;
    const itemHeight = activeItem.offsetHeight;
    
    if (itemTop < listContainer.scrollTop) {
      listContainer.scrollTo({ top: itemTop, behavior: 'smooth' });
    } else if (itemTop + itemHeight > listContainer.scrollTop + containerHeight) {
      listContainer.scrollTo({ top: itemTop + itemHeight - containerHeight, behavior: 'smooth' });
    }
  }
  
  // Refresh validation messages
  validateScoreInput(input ? input.value : '', maxScore);
  
  // Focus input
  if (input) {
    input.focus();
    if (input.value !== '') {
      input.select();
    }
  }
}

/**
 * Performs real-time verification of scores against boundaries.
 */
function validateScoreInput(val, maxScore) {
  const msgEl = document.getElementById('quickGradeValidationMsg');
  const inputWrap = document.getElementById('quickGradeInputWrap');
  if (!msgEl || !inputWrap) return;
  
  msgEl.innerHTML = '';
  inputWrap.classList.remove('invalid');
  
  const clean = trim(val);
  if (clean !== '') {
    const numVal = parseFloat(clean);
    if (isNaN(numVal)) {
      msgEl.innerHTML = '<span class="badge badge--fail">Invalid number format</span>';
      inputWrap.classList.add('invalid');
    } else if (maxScore > 0 && numVal > maxScore) {
      msgEl.innerHTML = `<span class="badge badge--warning">Warning: Score exceeds HPS of ${maxScore}</span>`;
      inputWrap.classList.add('invalid');
    }
  }
}

/**
 * Saves the score entered in the input field to database storage memory.
 */
function saveActiveScore() {
  const a = currentAssignment();
  if (!a) return;
  
  const learner = a.learners[quickGradeLearnerIndex];
  if (!learner) return;
  
  const input = document.getElementById('quickGradeScoreInput');
  if (!input) return;
  
  const val = trim(input.value);
  const key = `${learner.id}|${quickGradeAssessmentId}`;
  
  const oldValue = a.scores[key] === undefined ? '' : String(a.scores[key]);
  const newValue = val === '' ? '' : String(parseFloat(val));
  
  // Return if identical or invalid non-empty string
  if (oldValue === newValue || (val !== '' && isNaN(parseFloat(val)))) {
    return;
  }
  
  // Invoke central updateScore (handles history pushes, autosave debouncing, grid updates)
  updateScore(learner.id, quickGradeAssessmentId, val);
  
  // Update sidebar list score indicator directly
  const scoreDisplay = document.querySelector(`#qg-roster-item-${quickGradeLearnerIndex} .quick-grade-roster-item__score`);
  if (scoreDisplay) {
    scoreDisplay.textContent = val !== '' ? val : '—';
  }
}

/**
 * Selects the next learner in sequence.
 */
function quickGradeNext() {
  const a = currentAssignment();
  if (!a) return;
  
  saveActiveScore();
  
  if (quickGradeLearnerIndex < a.learners.length - 1) {
    quickGradeLearnerIndex++;
    updateQuickGradeActiveLearner();
  } else {
    toast('Roster completed for this assessment!', 'success');
    // Stay on current and ensure focused/selected
    const input = document.getElementById('quickGradeScoreInput');
    if (input) {
      input.focus();
      if (input.value !== '') {
        input.select();
      }
    }
  }
}

/**
 * Selects the previous learner in sequence.
 */
function quickGradePrev() {
  const a = currentAssignment();
  if (!a) return;
  
  saveActiveScore();
  
  if (quickGradeLearnerIndex > 0) {
    quickGradeLearnerIndex--;
    updateQuickGradeActiveLearner();
  } else {
    toast('Already at the first learner.', 'info');
    const input = document.getElementById('quickGradeScoreInput');
    if (input) {
      input.focus();
      if (input.value !== '') {
        input.select();
      }
    }
  }
}

/**
 * Jumps selection to the learner index selected.
 */
function quickGradeJumpToLearner(index) {
  const a = currentAssignment();
  if (!a || index < 0 || index >= a.learners.length) return;
  
  saveActiveScore();
  quickGradeLearnerIndex = index;
  updateQuickGradeActiveLearner();
}

/**
 * Setup keyboard inputs event listeners.
 */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('quickGradeScoreInput');
  if (input) {
    input.addEventListener('input', (e) => {
      const a = currentAssignment();
      const assessment = a ? a.assessments.find(x => x.id === quickGradeAssessmentId) : null;
      const maxScore = assessment ? number(assessment.maxScore) : 0;
      validateScoreInput(e.target.value, maxScore);
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        quickGradeNext();
      }
    });
  }
  
  // Handle escape/arrows across window context when modal is active
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('quickGradeModal');
    if (!modal || modal.style.display === 'none') return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      hideQuickGradeModal();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      quickGradePrev();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      quickGradeNext();
    }
  });
});
