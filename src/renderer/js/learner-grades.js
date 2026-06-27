/**
 * E-Class Record — Spectator Blur & Learner Grades Logic Module
 *
 * Implements the spectator mode screen-blur toggle, auto-blur settings,
 * individual student grades pop-up modal, checkbox display controls,
 * and print view overrides.
 */

let gradesBlurred = false;
let currentSelectedLearnerId = '';

/**
 * Toggles the manual blur spectator mode.
 */
function toggleGradesBlur() {
  gradesBlurred = !gradesBlurred;
  updateBlurClass();
}

/**
 * Syncs the spectator blur mode CSS state with DOM nodes and toolbar button icons.
 */
function updateBlurClass() {
  const buttons = [
    {
      btn: document.getElementById('blurToggleBtn'),
      icon: document.getElementById('blurToggleIcon'),
      text: document.getElementById('blurToggleText')
    },
    {
      btn: document.getElementById('blurToggleSummaryBtn'),
      icon: document.getElementById('blurToggleSummaryIcon'),
      text: document.getElementById('blurToggleSummaryText')
    }
  ];
  
  if (gradesBlurred) {
    document.body.classList.add('blur-active');
    buttons.forEach(b => {
      if (b.btn) b.btn.classList.add('btn-primary');
      if (b.text) b.text.textContent = 'Unblur Grades';
      if (b.icon) {
        b.icon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      }
    });
  } else {
    document.body.classList.remove('blur-active');
    buttons.forEach(b => {
      if (b.btn) b.btn.classList.remove('btn-primary');
      if (b.text) b.text.textContent = 'Blur Grades';
      if (b.icon) {
        b.icon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }
}

/**
 * Handles checking/unchecking the auto-blur setting from the UI.
 * @param {boolean} checked Checkbox state.
 */
function toggleAutoBlurSetting(checked) {
  if (typeof db !== 'undefined') {
    db.autoBlur = checked;
    gradesBlurred = checked;
    updateBlurClass();
    saveDatabase();
  }
}

function toggleShowNumericalEquivalentsSetting(checked) {
  if (typeof db !== 'undefined') {
    db.showNumericalEquivalents = checked;
    saveDatabase();
    render();
  }
}

function toggleUseUniversalTrimesterLayoutSetting(checked) {
  if (typeof db !== 'undefined') {
    db.useUniversalTrimesterLayout = checked;
    normalizeDatabase();
    saveDatabase();
    render();
  }
}

/**
 * Displays the individual student report modal and populates learner lists.
 */
function showViewLearnerGradesModal() {
  const select = document.getElementById('viewGradesLearnerSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">Select a learner...</option>';
  
  const a = currentAssignment();
  if (!a) {
    toast('No active class load loaded.', 'warning');
    return;
  }
  
  // Sort learners by Sex (boys first, girls second), then alphabetically
  const sortedLearners = [...a.learners].sort((x, y) => {
    const sx = sexRank(x.sex);
    const sy = sexRank(y.sex);
    if (sx !== sy) return sx - sy;
    return learnerDisplayName(x).toLowerCase().localeCompare(learnerDisplayName(y).toLowerCase(), 'fil');
  });
  
  sortedLearners.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = `${learnerDisplayName(l)} (${l.sex}) - LRN: ${l.lrn || '—'}`;
    select.appendChild(opt);
  });
  
  // Reset fields & options checkboxes
  document.getElementById('viewGradesShowTerm1').checked = true;
  document.getElementById('viewGradesShowTerm2').checked = true;
  document.getElementById('viewGradesShowTerm3').checked = true;
  document.getElementById('viewGradesShowSummary').checked = true;
  
  currentSelectedLearnerId = '';
  updateLearnerGradesDisplay();
  
  showEl('viewLearnerGradesModal', true, 'flex');
}

/**
 * Dismisses the individual grades modal overlay.
 */
function hideViewLearnerGradesModal() {
  showEl('viewLearnerGradesModal', false);
}

/**
 * Triggered on dropdown selection change. Asks confirmation prompt before revealing data.
 */
function onLearnerSelectedForGrades() {
  const select = document.getElementById('viewGradesLearnerSelect');
  const learnerId = select.value;
  if (!learnerId) {
    currentSelectedLearnerId = '';
    updateLearnerGradesDisplay();
    return;
  }
  
  const a = currentAssignment();
  if (!a) return;
  
  const learner = a.learners.find(x => x.id === learnerId);
  if (!learner) return;
  
  confirmModal(
    'Confirm View Grades',
    `Are you sure you want to view the grades for ${learnerDisplayName(learner)}?`,
    () => {
      currentSelectedLearnerId = learnerId;
      select.value = learnerId;
      updateLearnerGradesDisplay();
    }
  );
  
  // Revert the visual selection until confirmed
  select.value = currentSelectedLearnerId;
}

/**
 * Renders the structural layout of learner grades inside the report area.
 */
function updateLearnerGradesDisplay() {
  const reportArea = document.getElementById('learnerGradesReportArea');
  const downloadBtn = document.getElementById('downloadLearnerGradesBtn');
  if (!reportArea) return;
  
  if (!currentSelectedLearnerId) {
    reportArea.innerHTML = `
      <div class="text-muted" style="text-align:center; padding:var(--space-8)">
        Please select a learner to view their grades.
      </div>
    `;
    if (downloadBtn) downloadBtn.style.display = 'none';
    return;
  }
  
  const a = currentAssignment();
  if (!a) return;
  
  const learner = a.learners.find(x => x.id === currentSelectedLearnerId);
  if (!learner) return;
  
  if (downloadBtn) downloadBtn.style.display = 'inline-flex';
  
  const showT1 = document.getElementById('viewGradesShowTerm1').checked;
  const showT2 = document.getElementById('viewGradesShowTerm2').checked;
  const showT3 = document.getElementById('viewGradesShowTerm3').checked;
  const showSummary = document.getElementById('viewGradesShowSummary').checked;
  
  let html = '';
  
  // Header with meta details (perfect for printing)
  html += `
    <div class="learner-report-header">
      <div style="font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); border-bottom: 2px solid var(--border-default); padding-bottom: var(--space-2); margin-bottom: var(--space-4); text-align: center; color: var(--text-primary)">
        INDIVIDUAL LEARNER GRADES REPORT
      </div>
      <div class="print-metadata-grid" style="margin-bottom: var(--space-4); color: var(--text-secondary)">
        <div class="print-metadata-col">
          <div><strong>Learner Name:</strong> <span style="font-size: var(--font-size-md); font-weight: var(--font-weight-bold); color: var(--text-primary)">${esc(learnerDisplayName(learner))}</span></div>
          <div><strong>LRN:</strong> ${esc(learner.lrn || '—')}</div>
          <div><strong>Sex:</strong> ${esc(learner.sex || '—')}</div>
          <div><strong>School Name:</strong> ${esc(db.schoolName || '')}</div>
        </div>
        <div class="print-metadata-col">
          <div><strong>Grade & Section:</strong> Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</div>
          <div><strong>Subject:</strong> ${esc(a.subject)}</div>
          <div><strong>Teacher:</strong> ${esc(db.teacherName || '')}</div>
          <div><strong>School Year:</strong> ${esc(db.schoolYear || '')}</div>
        </div>
      </div>
    </div>
  `;
  
  const termsToShow = [];
  if (showT1) termsToShow.push('1');
  if (showT2) termsToShow.push('2');
  if (showT3) termsToShow.push('3');
  
  const isMapeh = isMapehSubject(a.subject);
  
  // Render each term details
  termsToShow.forEach(term => {
    html += `
      <div class="report-term-section" style="margin-top: var(--space-5); page-break-inside: avoid;">
        <h3 style="border-bottom: 1px solid var(--border-default); padding-bottom: 3px; font-size: var(--font-size-md); color: var(--color-primary-700); margin-bottom: var(--space-3)">
          Term ${term} Grades
        </h3>
    `;
      
    if (isMapeh) {
      html += renderTermMapehDetails(a, learner.id, term);
    } else {
      html += renderTermStandardDetails(a, learner.id, term);
    }
    
    html += `</div>`;
  });
  
  // Render summary section
  if (showSummary) {
    html += `
      <div class="report-summary-section" style="margin-top: var(--space-5); page-break-inside: avoid;">
        <h3 style="border-bottom: 1px solid var(--border-default); padding-bottom: 3px; font-size: var(--font-size-md); color: var(--color-success-700); margin-bottom: var(--space-3)">
          Final Grades Summary
        </h3>
    `;
      
    if (isMapeh) {
      html += renderSummaryMapehDetails(a, learner.id);
    } else {
      html += renderSummaryStandardDetails(a, learner.id);
    }
    
    html += `</div>`;
  }
  
  if (a.policy === 'DO15_DESCRIPTIVE') {
    html += `
      <div class="report-compliance-note" style="margin-top:var(--space-4); text-align:center; font-size:var(--font-size-xs); color:var(--text-secondary); font-style:italic">
        Original basis of grade was descriptive (DO 15, s. 2026).
      </div>
    `;
  }
  
  reportArea.innerHTML = html;
}

/**
 * Builds table rows of term assessments for standard subjects.
 */
function renderTermStandardDetails(a, learnerId, term) {
  const items = termAssessments(a, term);
  const result = computeTerm(a, learnerId, term);
  const w = weightsFor(a.subjectGroup);
  
  let html = `
    <table class="report-grades-table" style="width:100%; border-collapse:collapse; margin-bottom:var(--space-3); border:1px solid var(--border-default)">
      <thead>
        <tr style="background:var(--bg-muted); border-bottom:1px solid var(--border-default); text-align:left">
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Component</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Title</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs); text-align:center">Score</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs); text-align:center">HPS</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs); text-align:center">Percentage (PS)</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs); text-align:center">Weighted (WS)</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Helper to render component block
  const renderBlock = (compKey, label, compResult, weight) => {
    const compItems = items.filter(x => {
      if (compKey === 'EX') return ['SA1', 'SA2', 'ST1', 'ST2', 'TE'].includes(x.component);
      return x.component === compKey;
    });
    
    if (compItems.length === 0) return '';
    
    let blockHtml = '';
    compItems.forEach((ast, idx) => {
      const key = `${learnerId}|${ast.id}`;
      const score = a.scores[key] === undefined ? '—' : a.scores[key];
      const max = ast.maxScore || '—';
      
      blockHtml += `
        <tr style="border-bottom:1px solid var(--border-subtle)">
          <td style="padding:var(--space-2); font-size:var(--font-size-sm); color:var(--text-secondary)">${idx === 0 ? esc(label) : ''}</td>
          <td style="padding:var(--space-2); font-size:var(--font-size-sm)">${esc(ast.title)}</td>
          <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center">${esc(score)}</td>
          <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center">${esc(max)}</td>
          <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center">—</td>
          <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center">—</td>
        </tr>
      `;
    });
    
    // Total row for this component
    const ws = compResult.hasData ? (compResult.ps * weight / 100) : 0;
    blockHtml += `
      <tr style="border-bottom:1px solid var(--border-default); background:var(--bg-surface-raised); font-weight:var(--font-weight-bold)">
        <td style="padding:var(--space-2); font-size:var(--font-size-sm)" colspan="2">Total ${esc(label)} (${weight}%)</td>
        <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center">${compResult.hasData ? fmt(compResult.raw) : '—'}</td>
        <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center">${compResult.hasData ? fmt(compResult.max) : '—'}</td>
        <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center; color:var(--color-primary-700)">${compResult.hasData ? fmt(compResult.ps) + '%' : '—'}</td>
        <td style="padding:var(--space-2); font-size:var(--font-size-sm); text-align:center; color:var(--color-success-700)">${compResult.hasData ? fmt(ws) : '—'}</td>
      </tr>
    `;
    return blockHtml;
  };

  html += renderBlock('WW', 'Written Work', result.ww, w[0]);
  html += renderBlock('PT', 'Performance Tasks', result.pt, w[1]);
  
  const examResult = {
    hasData: result.st1.hasData || result.st2.hasData || result.te.hasData,
    raw: (result.st1.raw || 0) + (result.st2.raw || 0) + (result.te.raw || 0),
    max: (result.st1.max || 0) + (result.st2.max || 0) + (result.te.max || 0),
    ps: result.examPS
  };
  html += renderBlock('EX', 'Exams', examResult, w[2]);

  const remarksBadge = result.termGrade === null
    ? '—'
    : `<span class="badge ${isPassing(result.termGrade) ? 'badge--pass' : 'badge--fail'}">${isPassing(result.termGrade) ? 'Passed' : (a.policy === 'DO15_DESCRIPTIVE' ? 'For Intervention' : 'Failed')}</span>`;

  html += `
      </tbody>
    </table>
    
    <div style="display:flex; justify-content:flex-end; gap:var(--space-5); background:var(--bg-surface-raised); padding:var(--space-3); border-radius:var(--radius-lg); border:1px solid var(--border-default); margin-top:var(--space-2)">
      <div>Initial Grade (IG): <strong>${result.hasData ? fmt(result.initialGrade) : '—'}</strong></div>
      <div>Transmuted Grade (TG): <strong style="color:var(--color-primary-600); font-size:var(--font-size-lg)">${result.termGrade === null ? '—' : formatGradeForDisplay(result.termGrade, a.policy)}</strong></div>
      <div>Remarks: ${remarksBadge}</div>
    </div>
  `;
  
  return html;
}

/**
 * Builds grids of Music & Arts split for MAPEH term details.
 */
function renderTermMapehDetails(a, learnerId, term) {
  const resMusic = computeTerm(a, learnerId, term, 'music_arts');
  const resPE = computeTerm(a, learnerId, term, 'pe_health');
  
  const gMusic = resMusic.termGrade;
  const gPE = resPE.termGrade;
  
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';
  let consolidated = null;
  if (isDescriptive) {
    let sumIg = 0;
    let countIg = 0;
    if (resMusic.hasData) {
      sumIg += resMusic.initialGrade;
      countIg++;
    }
    if (resPE.hasData) {
      sumIg += resPE.initialGrade;
      countIg++;
    }
    consolidated = countIg > 0 ? transmute(a, sumIg / countIg) : null;
  } else {
    consolidated = consolidateMapehGrades(gMusic, gPE);
  }

  const consolidatedBadge = consolidated === null
    ? '—'
    : `<span class="badge ${isPassing(consolidated) ? 'badge--pass' : 'badge--fail'}">${isPassing(consolidated) ? 'Passed' : (a.policy === 'DO15_DESCRIPTIVE' ? 'For Intervention' : 'Failed')}</span>`;
  
  let html = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4); margin-bottom:var(--space-3)">
      <div style="border:1px solid var(--border-default); padding:var(--space-3); border-radius:var(--radius-lg); background:var(--bg-surface)">
        <h4 style="margin-top:0; border-bottom:1px solid var(--border-subtle); padding-bottom:5px; color:var(--color-primary-600)">Music & Arts</h4>
        <div>Written Work PS: <strong>${resMusic.ww.hasData ? fmt(resMusic.ww.ps) + '%' : '—'}</strong></div>
        <div>Performance Tasks PS: <strong>${resMusic.pt.hasData ? fmt(resMusic.pt.ps) + '%' : '—'}</strong></div>
        <div>Exam PS: <strong>${resMusic.hasData ? fmt(resMusic.examPS) + '%' : '—'}</strong></div>
        <div style="margin-top:var(--space-2); padding-top:var(--space-2); border-top:1px dashed var(--border-subtle)">
          Term Grade: <strong style="font-size:var(--font-size-md)">${gMusic === null ? '—' : formatGradeForDisplay(gMusic, a.policy)}</strong>
        </div>
      </div>
      <div style="border:1px solid var(--border-default); padding:var(--space-3); border-radius:var(--radius-lg); background:var(--bg-surface)">
        <h4 style="margin-top:0; border-bottom:1px solid var(--border-subtle); padding-bottom:5px; color:var(--color-primary-600)">PE & Health</h4>
        <div>Written Work PS: <strong>${resPE.ww.hasData ? fmt(resPE.ww.ps) + '%' : '—'}</strong></div>
        <div>Performance Tasks PS: <strong>${resPE.pt.hasData ? fmt(resPE.pt.ps) + '%' : '—'}</strong></div>
        <div>Exam PS: <strong>${resPE.hasData ? fmt(resPE.examPS) + '%' : '—'}</strong></div>
        <div style="margin-top:var(--space-2); padding-top:var(--space-2); border-top:1px dashed var(--border-subtle)">
          Term Grade: <strong style="font-size:var(--font-size-md)">${gPE === null ? '—' : formatGradeForDisplay(gPE, a.policy)}</strong>
        </div>
      </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface-raised); padding:var(--space-3); border-radius:var(--radius-lg); border:1px solid var(--border-default)">
      <div><strong>MAPEH Consolidated Grade:</strong></div>
      <div style="font-size:var(--font-size-lg); font-weight:var(--font-weight-bold); color:var(--color-primary-700)">
        ${consolidated === null ? '—' : formatGradeForDisplay(consolidated, a.policy)}
      </div>
      <div>${consolidatedBadge}</div>
    </div>
  `;
  return html;
}

/**
 * Builds term averages and summary remarks table for standard subjects.
 */
function renderSummaryStandardDetails(a, learnerId) {
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';
  const terms = [];
  let sum = 0;
  let count = 0;
  
  let sumIg = 0;
  let countIg = 0;
  
  for (let t = 1; t <= 3; t++) {
    const res = computeTerm(a, learnerId, String(t));
    terms.push(res.termGrade);
    
    if (isDescriptive) {
      if (res.hasData) {
        sumIg += res.initialGrade;
        countIg++;
      }
    } else {
      if (res.termGrade !== null) {
        sum += res.termGrade;
        count++;
      }
    }
  }
  
  const fg = isDescriptive
    ? (countIg > 0 ? transmute(a, sumIg / countIg) : null)
    : (count > 0 ? Math.round(sum / count) : null);
  const remarks = finalRemark(a, fg);
  
  let html = `
    <table class="report-grades-table" style="width:100%; border-collapse:collapse; border:1px solid var(--border-default)">
      <thead>
        <tr style="background:var(--bg-muted); border-bottom:1px solid var(--border-default); text-align:center">
          <th style="padding:var(--space-2); font-size:var(--font-size-xs); text-align:left">Term</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Grade</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Descriptor</th>
        </tr>
      </thead>
      <tbody>
        <tr style="text-align:center; border-bottom:1px solid var(--border-subtle)">
          <td style="padding:var(--space-2); text-align:left">Term 1</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(terms[0], a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${esc(termDescription(a, terms[0])) || '—'}</td>
        </tr>
        <tr style="text-align:center; border-bottom:1px solid var(--border-subtle)">
          <td style="padding:var(--space-2); text-align:left">Term 2</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(terms[1], a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${esc(termDescription(a, terms[1])) || '—'}</td>
        </tr>
        <tr style="text-align:center; border-bottom:1px solid var(--border-default)">
          <td style="padding:var(--space-2); text-align:left">Term 3</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(terms[2], a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${esc(termDescription(a, terms[2])) || '—'}</td>
        </tr>
        <tr style="text-align:center; background:var(--bg-surface-raised); font-weight:var(--font-weight-bold); font-size:var(--font-size-md)">
          <td style="padding:var(--space-2); text-align:left">Final Grade</td>
          <td style="padding:var(--space-2); color:var(--color-success-700); font-size:var(--font-size-lg)">${blankNull(formatGradeForDisplay(fg, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${remarks}</td>
        </tr>
      </tbody>
    </table>
  `;
  return html;
}

/**
 * Builds averages and summary matrices for MAPEH consolidated grades.
 */
function renderSummaryMapehDetails(a, learnerId) {
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';
  let sumMusic = 0, countMusic = 0;
  let sumPE = 0, countPE = 0;
  const consGrades = [];

  let sumMusicIg = 0, countMusicIg = 0;
  let sumPEIg = 0, countPEIg = 0;

  for (let t = 1; t <= 3; t++) {
    const resMusic = computeTerm(a, learnerId, String(t), 'music_arts');
    const resPE = computeTerm(a, learnerId, String(t), 'pe_health');

    const gm = resMusic.termGrade;
    const gp = resPE.termGrade;

    if (isDescriptive) {
      if (resMusic.hasData) {
        sumMusicIg += resMusic.initialGrade;
        countMusicIg++;
      }
      if (resPE.hasData) {
        sumPEIg += resPE.initialGrade;
        countPEIg++;
      }
      
      let sumTermIg = 0;
      let countTermIg = 0;
      if (resMusic.hasData) {
        sumTermIg += resMusic.initialGrade;
        countTermIg++;
      }
      if (resPE.hasData) {
        sumTermIg += resPE.initialGrade;
        countTermIg++;
      }
      consGrades.push(countTermIg > 0 ? transmute(a, sumTermIg / countTermIg) : null);
    } else {
      if (gm !== null) {
        sumMusic += gm;
        countMusic++;
      }
      if (gp !== null) {
        sumPE += gp;
        countPE++;
      }

      const gc = consolidateMapehGrades(gm, gp);
      consGrades.push(gc);
    }
  }

  const musicFinal = isDescriptive
    ? (countMusicIg > 0 ? transmute(a, sumMusicIg / countMusicIg) : null)
    : (countMusic > 0 ? Math.round(sumMusic / countMusic) : null);
    
  const peFinal = isDescriptive
    ? (countPEIg > 0 ? transmute(a, sumPEIg / countPEIg) : null)
    : (countPE > 0 ? Math.round(sumPE / countPE) : null);

  let finalConsolidated = null;
  if (isDescriptive) {
    let sumFinalIg = 0;
    let countFinalIg = 0;
    if (countMusicIg > 0) {
      sumFinalIg += (sumMusicIg / countMusicIg);
      countFinalIg++;
    }
    if (countPEIg > 0) {
      sumFinalIg += (sumPEIg / countPEIg);
      countFinalIg++;
    }
    finalConsolidated = countFinalIg > 0 ? transmute(a, sumFinalIg / countFinalIg) : null;
  } else {
    finalConsolidated = consolidateMapehGrades(musicFinal, peFinal);
  }

  const remarks = finalRemark(a, finalConsolidated);

  let html = `
    <table class="report-grades-table" style="width:100%; border-collapse:collapse; border:1px solid var(--border-default)">
      <thead>
        <tr style="background:var(--bg-muted); border-bottom:1px solid var(--border-default); text-align:center">
          <th style="padding:var(--space-2); font-size:var(--font-size-xs); text-align:left">Component / Term</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Term 1</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Term 2</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Term 3</th>
          <th style="padding:var(--space-2); font-size:var(--font-size-xs)">Final</th>
        </tr>
      </thead>
      <tbody>
        <tr style="text-align:center; border-bottom:1px solid var(--border-subtle)">
          <td style="padding:var(--space-2); text-align:left">Music & Arts</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(computeTerm(a, learnerId, '1', 'music_arts').termGrade, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(computeTerm(a, learnerId, '2', 'music_arts').termGrade, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(computeTerm(a, learnerId, '3', 'music_arts').termGrade, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2); font-weight:var(--font-weight-semibold)">${blankNull(formatGradeForDisplay(musicFinal, a.policy)) || '—'}</td>
        </tr>
        <tr style="text-align:center; border-bottom:1px solid var(--border-subtle)">
          <td style="padding:var(--space-2); text-align:left">PE & Health</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(computeTerm(a, learnerId, '1', 'pe_health').termGrade, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(computeTerm(a, learnerId, '2', 'pe_health').termGrade, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(computeTerm(a, learnerId, '3', 'pe_health').termGrade, a.policy)) || '—'}</td>
          <td style="padding:var(--space-2); font-weight:var(--font-weight-semibold)">${blankNull(formatGradeForDisplay(peFinal, a.policy)) || '—'}</td>
        </tr>
        <tr style="text-align:center; border-bottom:1px solid var(--border-default); background:var(--bg-surface-raised)">
          <td style="padding:var(--space-2); text-align:left; font-weight:var(--font-weight-semibold)">MAPEH Consolidated</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(consGrades[0], a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(consGrades[1], a.policy)) || '—'}</td>
          <td style="padding:var(--space-2)">${blankNull(formatGradeForDisplay(consGrades[2], a.policy)) || '—'}</td>
          <td style="padding:var(--space-2); color:var(--color-primary-700); font-weight:var(--font-weight-bold)">${blankNull(formatGradeForDisplay(finalConsolidated, a.policy)) || '—'}</td>
        </tr>
        <tr style="background:var(--bg-surface-raised); font-weight:var(--font-weight-bold)">
          <td style="padding:var(--space-2); text-align:left">Final Remarks</td>
          <td style="padding:var(--space-2); text-align:center" colspan="4">${remarks}</td>
        </tr>
      </tbody>
    </table>
  `;
  return html;
}

/**
 * Exports the modal report content as a PDF file with dynamic naming and portrait layout.
 */
async function downloadLearnerGradesPdf() {
  const a = currentAssignment();
  if (!a) return;
  const learner = a.learners.find(x => x.id === currentSelectedLearnerId);
  if (!learner) return;

  toast('Generating PDF document...', 'info');

  // Add print-modal-only class to body so only the modal contents are exported
  document.body.classList.add('print-modal-only');
  
  // Set orientation to portrait dynamically
  let styleEl = document.getElementById('print-orientation-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-orientation-style';
    document.head.appendChild(styleEl);
  }
  styleEl.innerHTML = '@media print { @page { size: portrait; } }';

  const displayName = learnerDisplayName(learner);
  const filename = `${displayName} Grades Report.pdf`;
  
  const metadata = {
    title: `${displayName} Grades Report`,
    region: db.region || '',
    division: db.division || '',
    schoolName: db.schoolName || '',
    schoolId: db.schoolId || '',
    schoolYear: db.schoolYear || '',
    gradeLevel: a.gradeLevel || '',
    section: a.section || '',
    subject: a.subject || '',
    teacherName: db.teacherName || '',
    timestamp: new Date().toLocaleString()
  };

  const options = {
    landscape: false,
    size: 'A4',
    filename: filename,
    metadata: metadata
  };

  try {
    const result = await window.electronAPI.exportPdf(options);
    if (result.success) {
      toast(`Successfully saved PDF to: ${result.path}`, 'success');
    } else if (result.error) {
      const isBusy = result.error.includes('EBUSY');
      const msg = isBusy ? 'ERROR: Please check whether file is in use!' : `PDF export failed: ${result.error}`;
      toast(msg, 'error');
    }
  } catch (err) {
    console.error(err);
    const isBusy = err.message && err.message.includes('EBUSY');
    const msg = isBusy ? 'ERROR: Please check whether file is in use!' : ('PDF export failed: ' + err.message);
    toast(msg, 'error');
  } finally {
    // Restore layout
    document.body.classList.remove('print-modal-only');
  }
}
