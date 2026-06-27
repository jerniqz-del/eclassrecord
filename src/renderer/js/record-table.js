/**
 * E-Class Record — Record Grid and Table Renderer
 *
 * Implements the dense scrollable grading table, column formatting,
 * spreadsheet-like Arrow/Enter cell keyboard navigation, and the final summary.
 */

let recordRowCount = 0;
let recordColCount = 0;

// Debounced save — batches rapid score entries into one IPC round-trip per 400ms
const debouncedSave = debounce(saveDatabase, 400);

// History Stacks for Undo and Redo
let undoStack = [];
let redoStack = [];

// Trackers to detect changes to sheet or class
let lastAssignmentId = null;
let lastTerm = null;
let lastMapehSubTab = null;

/**
 * Returns a snapshot of current active sheet data (scores and assessments list).
 */
function getSheetSnapshot() {
  const a = currentAssignment();
  if (!a) return null;
  return {
    scores: JSON.parse(JSON.stringify(a.scores || {})),
    assessments: JSON.parse(JSON.stringify(a.assessments || []))
  };
}

/**
 * Captures current sheet state and pushes it to the undo stack.
 * Clears the redo stack.
 */
function pushHistoryState() {
  const snapshot = getSheetSnapshot();
  if (!snapshot) return;
  
  undoStack.push(snapshot);
  if (undoStack.length > 100) {
    undoStack.shift(); // Limit history depth
  }
  
  redoStack = [];
  updateUndoRedoUI();
}

/**
 * Toggles the disabled property of the UI buttons.
 */
function updateUndoRedoUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) {
    undoBtn.disabled = (undoStack.length === 0);
  }
  if (redoBtn) {
    redoBtn.disabled = (redoStack.length === 0);
  }
}

/**
 * Restores the database state from a snapshot.
 */
function restoreSheetSnapshot(snapshot) {
  const a = currentAssignment();
  if (!a) return;
  a.scores = JSON.parse(JSON.stringify(snapshot.scores));
  a.assessments = JSON.parse(JSON.stringify(snapshot.assessments));
  
  debouncedSave();
  render();
}

/**
 * Triggers the Undo action.
 */
function triggerUndo() {
  if (undoStack.length === 0) return;
  
  const currentSnapshot = getSheetSnapshot();
  if (!currentSnapshot) return;
  
  redoStack.push(currentSnapshot);
  const previousSnapshot = undoStack.pop();
  restoreSheetSnapshot(previousSnapshot);
  updateUndoRedoUI();
}

/**
 * Triggers the Redo action.
 */
function triggerRedo() {
  if (redoStack.length === 0) return;
  
  const currentSnapshot = getSheetSnapshot();
  if (!currentSnapshot) return;
  
  undoStack.push(currentSnapshot);
  const nextSnapshot = redoStack.pop();
  restoreSheetSnapshot(nextSnapshot);
  updateUndoRedoUI();
}

/**
 * Detects if the user changed the sheet (term, MAPEH sub-tab) or class load.
 * Autosaves immediately and clears history stacks.
 */
function checkActiveSheetChange() {
  const a = currentAssignment();
  const currentId = a ? a.id : null;
  const currentTerm = db.currentTerm || '1';
  const currentSubTab = (a && isMapehSubject(a.subject)) ? currentMapehSubTab : null;
  
  if (currentId !== lastAssignmentId || currentTerm !== lastTerm || currentSubTab !== lastMapehSubTab) {
    // If a class was previously loaded and there were modifications, autosave immediately
    // to prevent losing any unwritten debounced database edits
    if (lastAssignmentId !== null) {
      debouncedSave.cancel();
      saveDatabase();
    }
    
    // Wipe history
    undoStack = [];
    redoStack = [];
    
    // Update active sheet trackers
    lastAssignmentId = currentId;
    lastTerm = currentTerm;
    lastMapehSubTab = currentSubTab;
    
    updateUndoRedoUI();
  }
}

/**
 * Renders the active term class record grid.
 */
function renderRecordTable() {
  checkActiveSheetChange();
  const a = currentAssignment();
  if (!a) {
    document.getElementById('recordTable').innerHTML = emptyState(
      'No teaching load selected',
      'Select a class load in the Classes sidebar or add one to get started.'
    );
    return;
  }
  
  ensureTemplateAssessments(a);
  
  if (a.learners.length === 0) {
    document.getElementById('recordTable').innerHTML = emptyState(
      'No learners yet',
      'Add student rosters under the Classes tab, upload an SF1, or paste a CSV list.',
      'Upload SF1',
      'proceedToUploadSf1()',
      'Bulk Add Learners',
      'showBulkAddLearnersModal()',
      'Import Roster from Other Class',
      'showImportRosterModal()'
    );
    return;
  }
  
  const isMapeh = isMapehSubject(a.subject);
  if (isMapeh && currentMapehSubTab === 'consolidated') {
    renderConsolidatedMapehTable(a);
    return;
  }
  
  const mapePart = isMapeh ? currentMapehSubTab : undefined;
  const items = termAssessments(a, db.currentTerm, mapePart);
  recordRowCount = a.learners.length;
  recordColCount = items.length;
  const w = weightsFor(a.subjectGroup);
  const cols = recordColGroup(a, items, mapePart);
  
  const isKS2 = isKeyStage2(a);
  let html = `<div class="record-scroll"><table class="record-grid${isMapeh ? ' is-mapeh' : ''}${isKS2 ? ' is-ks2' : ''}">${cols}<thead>`;
  
  if (isKeyStage2(a)) {
    // Key Stage 2 Columns Headers (Trimesters split)
    html += `<tr>
      <th class="c-no">No.</th>
      <th class="c-learner">Learner</th>
      <th class="c-sex">Sex</th>`;
    for (let gi = 0; gi < items.length; gi++) {
      const compClass = `c-comp-${items[gi].component.toLowerCase()}`;
      html += `<th class="c-score ${compClass}" title="${esc(items[gi].title)}">
        ${esc(compactAssessmentLabel(items[gi]))}
        <button class="col-delete-btn no-print" title="Clear all student scores in this column" onclick="clearColumnScores('${esc(items[gi].id)}')">&times;</button>
      </th>`;
      if (gi === 4) html += `<th class="c-calc c-comp-ww" title="Written Work Total">T</th><th class="c-calc c-comp-ww" title="Written Work Percentage">%</th><th class="c-calc c-comp-ww" title="Written Work Weighted Score">WS</th>`;
      if (gi === 7) html += `<th class="c-calc c-comp-pt" title="Performance Task Total">T</th><th class="c-calc c-comp-pt" title="Performance Task Percentage">%</th><th class="c-calc c-comp-pt" title="Performance Task Weighted Score">WS</th>`;
      if (gi === 10) html += `<th class="c-calc c-comp-te" title="Trimester Exam Total">T</th><th class="c-calc c-comp-te" title="Trimester Exam Percentage">%</th><th class="c-calc c-comp-te" title="Trimester Exam Weighted Score">WS</th>`;
    }
    html += `<th class="c-grade" title="Initial Grade">IG</th>
             <th class="c-grade" title="Transmuted Grade">TG</th>
             <th class="c-desc">Desc.</th></tr>`;
  } else {
    // Standard DepEd Term Headers
    html += `<tr>
      <th class="c-no">No.</th>
      <th class="c-learner">Learner</th>
      <th class="c-sex">Sex</th>`;
    for (let i = 0; i < items.length; i++) {
      const compClass = `c-comp-${items[i].component.toLowerCase()}`;
      html += `<th class="c-score ${compClass}" title="${esc(items[i].title)}">
        ${esc(componentLabel(items[i].component))}<br/>
        <span class="text-xs text-muted">${esc(items[i].title)}</span>
        <button class="col-delete-btn no-print" title="Clear all student scores in this column" onclick="clearColumnScores('${esc(items[i].id)}')">&times;</button>
      </th>`;
    }
    html += `
      <th class="c-spacer"></th>
      <th class="c-calc" title="Written Work Percentage Score">WW PS</th>
      <th class="c-calc" title="Performance Task Percentage Score">PT PS</th>
      <th class="c-calc" title="Exam Percentage Score">EX PS</th>
      <th class="c-grade" title="Initial Grade">IG</th>
      <th class="c-grade" title="Transmuted Grade">TG</th>
      <th class="c-desc">Desc.</th>
    </tr>`;
  }
  
  // Highest Possible Score (HPS) Input Row
  html += `<tr class="sheet-row-label">
    <td class="c-no"></td>
    <td class="c-learner learner-cell">HPS</td>
    <td class="c-sex"></td>`;
  for (let h = 0; h < items.length; h++) {
    html += `<td class="c-score">
      <input id="hps-${h}" class="score-input max-input" value="${esc(items[h].maxScore)}" 
        data-assessment-id="${esc(items[h].id)}"
        onkeydown="return maxNav(event, ${h}, '${esc(items[h].id)}')" 
        onchange="updateAssessmentMax('${esc(items[h].id)}', this.value)" />
    </td>`;
    if (isKeyStage2(a) && (h === 4 || h === 7 || h === 10)) {
      const groupMax = groupScoreMax(items, h);
      const wsVal = h === 4 ? w[0] / 100 : h === 7 ? w[1] / 100 : w[2] / 100;
      html += `<td class="c-calc">${blankZero(groupMax)}</td>
               <td class="c-calc">100</td>
               <td class="c-calc">${wsVal}</td>`;
    }
  }
  
  if (!isKeyStage2(a)) {
    html += `<td class="c-spacer"></td>
             <td class="c-calc"></td>
             <td class="c-calc"></td>
             <td class="c-calc"></td>
             <td class="c-grade"></td>
             <td class="c-grade"></td>
             <td class="c-desc"></td>`;
  }
  html += `</tr></thead><tbody>`;
  
  // Roster Student Rows
  for (let r = 0; r < a.learners.length; r++) {
    const learner = a.learners[r];
    const result = computeTerm(a, learner.id, db.currentTerm, mapePart);
    
    const isRowTO = result.isTransferredOut;
    const isRowTI = result.isTransferredIn;
    const isDisabled = isRowTO || isRowTI;
    
    html += `<tr class="${isRowTO ? 'row-transferred-out' : ''} ${isRowTI ? 'row-transferred-in' : ''}" style="${isRowTO ? 'opacity: 0.6; background: rgba(255, 193, 7, 0.03);' : ''} ${isRowTI ? 'background: rgba(46, 125, 50, 0.02);' : ''}">
      <td class="c-no">${r + 1}</td>
      <td class="c-learner learner-cell" title="${esc(learnerDisplayName(learner))}">${esc(learnerDisplayName(learner))}</td>
      <td class="c-sex">${esc(learner.sex)}</td>`;
      
    for (let j = 0; j < items.length; j++) {
      const key = `${learner.id}|${items[j].id}`;
      const val = a.scores[key] === undefined ? '' : a.scores[key];
      const maxNum = number(items[j].maxScore);
      const overMax = maxNum > 0 && val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > maxNum;
      const isPerfect = maxNum > 0 && val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) === maxNum;
      const isSimilar = maxNum > 0 && val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) >= maxNum * 0.9 && parseFloat(val) < maxNum;
      
      const scoreTitle = `${learnerDisplayName(learner)} - ${componentLabel(items[j].component)} ${items[j].title || ''} ${maxNum > 0 ? '(max ' + maxNum + ')' : ''}`;
      
      html += `<td class="c-score">
        <input id="sc-${r}-${j}" class="score-input${overMax ? ' invalid' : ''}${isPerfect ? ' perfect' : ''}${isSimilar ? ' similar' : ''}" title="${esc(scoreTitle)}" value="${isDisabled ? '' : esc(val)}"
          data-learner-index="${r}" data-assessment-id="${esc(items[j].id)}"
          ${isDisabled ? 'disabled style="cursor: not-allowed; opacity: 0.5;"' : ''}
          onkeydown="return scoreNav(event, ${r}, ${j}, '${esc(learner.id)}', '${esc(items[j].id)}')"
          onchange="updateScore('${esc(learner.id)}', '${esc(items[j].id)}', this.value)" />
      </td>`;
      
      if (isKeyStage2(a) && (j === 4 || j === 7 || j === 10)) {
        let block;
        if (j === 4) {
          block = result.ww;
        } else if (j === 7) {
          block = result.pt;
        } else {
          const examRawResult = componentScore(a, learner.id, db.currentTerm, ['SA1', 'SA2', 'ST1', 'ST2', 'TE'], mapePart);
          block = {
            raw: examRawResult.raw,
            max: examRawResult.max,
            ps: result.examPS,
            hasData: examRawResult.hasData
          };
        }
        const weight = j === 4 ? w[0] : j === 7 ? w[1] : w[2];
        html += `<td class="c-calc">${isDisabled ? '' : blankZero(block.raw)}</td>
                 <td class="c-calc">${(!isDisabled && block.hasData) ? fmt(block.ps) : ''}</td>
                 <td class="c-calc">${(!isDisabled && block.hasData) ? fmt(block.ps * weight / 100) : ''}</td>`;
      }
    }
    
    if (!isKeyStage2(a)) {
      html += `<td class="c-spacer"></td>
               <td class="c-calc">${isDisabled ? '' : fmt(result.ww.ps)}</td>
               <td class="c-calc">${isDisabled ? '' : fmt(result.pt.ps)}</td>
               <td class="c-calc">${isDisabled ? '' : fmt(result.examPS)}</td>`;
    }
    
    const igDisplay = isRowTO ? 'T/O' : (isRowTI ? 'T/I' : (result.hasData ? fmt(result.initialGrade) : ''));
    const tgDisplay = result.termGrade === null ? '' : formatGradeForDisplay(result.termGrade, a.policy);
    const descDisplay = esc(termDescription(a, result.termGrade));

    html += `<td class="c-grade">${igDisplay}</td>
             <td class="c-grade" style="${isRowTO ? 'color: #ffb703; font-weight: bold;' : ''} ${isRowTI ? 'color: #81c784; font-weight: bold;' : ''}"><strong>${tgDisplay}</strong></td>
             <td class="c-desc">${descDisplay}</td>
             </tr>`;
  }
  
  html += `</tbody></table></div>`;
  if (a.policy === 'DO15_DESCRIPTIVE') {
    html += `<div class="compliance-footnote" style="margin-top:var(--space-2); font-size:var(--font-size-xs); color:var(--text-secondary); font-style:italic; text-align:center">Original basis of grade was descriptive (DO 15, s. 2026).</div>`;
  }
  document.getElementById('recordTable').innerHTML = html;
  
  // Dynamically align HPS row sticky top position below the header row
  adjustHpsStickyTop();
}

/**
 * Dynamically measures the first row (headers th) height and applies it
 * as the 'top' style offset for sticky HPS row cells.
 */
function adjustHpsStickyTop() {
  const table = document.querySelector('#recordTable .record-grid');
  if (!table) return;
  const firstRow = table.querySelector('thead tr:first-child');
  if (!firstRow) return;
  
  const height = firstRow.getBoundingClientRect().height;
  if (height === 0) return; // Ignore hidden tables to keep CSS fallbacks active
  
  const hpsCells = table.querySelectorAll('.sheet-row-label td');
  hpsCells.forEach(cell => {
    // Round to nearest integer/half-pixel to avoid layout engine rendering offsets
    cell.style.top = `${Math.round(height)}px`;
  });
}

/**
 * Builds colgroup elements based on columns layout configuration.
 */
function recordColGroup(a, items, mapePart) {
  let html = '<colgroup>';
  if (isKeyStage2(a)) {
    html += "<col style='width:3%' /><col style='width:18%' /><col style='width:3%' />";
    for (let i = 0; i < 11; i++) {
      html += "<col style='width:3%' />";
      if (i === 4 || i === 7 || i === 10) {
        html += "<col style='width:3%' /><col style='width:3%' /><col style='width:3%' />";
      }
    }
    html += "<col style='width:4%' /><col style='width:4%' /><col style='width:8%' />";
  } else {
    let refCount = maxTermAssessmentCount(a, mapePart);
    if (refCount < 1) refCount = 1;
    const scoreWidth = 45 / refCount;
    let spacerWidth = 45 - (items.length * scoreWidth);
    if (spacerWidth < 0) spacerWidth = 0;
    
    html += `<col style="width:3%" /><col style="width:18%" /><col style="width:3%" />`;
    for (let j = 0; j < items.length; j++) {
      html += `<col style="width:${scoreWidth}%" />`;
    }
    html += `<col style="width:${spacerWidth}%" />`;
    html += `<col style="width:5%" /><col style="width:5%" /><col style="width:5%" />`;
    html += `<col style="width:4%" /><col style="width:4%" /><col style="width:8%" />`;
  }
  html += '</colgroup>';
  return html;
}

function maxTermAssessmentCount(a, mapePart) {
  let m = 0;
  for (let t = 1; t <= 3; t++) {
    const c = termAssessments(a, String(t), mapePart).length;
    if (c > m) m = c;
  }
  return m;
}

function groupScoreMax(items, endIndex) {
  const start = endIndex === 4 ? 0 : endIndex === 7 ? 5 : 8;
  let total = 0;
  for (let i = start; i <= endIndex; i++) {
    if (items[i]) {
      total += number(items[i].maxScore);
    }
  }
  return total;
}

/**
 * Renders the Final Summary Table displaying averages across all terms.
 */
function renderFinalOnly() {
  const a = currentAssignment();
  if (!a) {
    document.getElementById('finalTable').innerHTML = '';
    return;
  }
  
  if (a.learners.length === 0) {
    document.getElementById('finalTable').innerHTML = emptyState(
      'No learners yet',
      'Final grades will appear once class lists are populated.',
      'Upload SF1',
      'proceedToUploadSf1()',
      'Bulk Add Learners',
      'showBulkAddLearnersModal()',
      'Import Roster from Other Class',
      'showImportRosterModal()'
    );
    return;
  }
  
  const isMapeh = isMapehSubject(a.subject);
  if (isMapeh && currentMapehSubTab === 'consolidated') {
    renderConsolidatedMapehSummary(a);
    return;
  }
  
  const mapePart = isMapeh ? currentMapehSubTab : undefined;
  
  let html = `<table class="summary-table">
    <colgroup>
      <col style="width: 4%" />
      <col style="width: 12%" />
      <col style="width: 28%" />
      <col style="width: 8%" />
      <col style="width: 8%" />
      <col style="width: 8%" />
      <col style="width: 10%" />
      <col style="width: 22%" />
    </colgroup>
    <thead>
      <tr>
        <th>No.</th>
        <th>LRN</th>
        <th>Learner</th>
        <th>Term 1</th>
        <th>Term 2</th>
        <th>Term 3</th>
        <th>Final Grade</th>
        <th>Remarks</th>
      </tr>
    </thead><tbody>`;
  
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';
  for (let r = 0; r < a.learners.length; r++) {
    const learner = a.learners[r];
    const terms = [];
    let sum = 0;
    let count = 0;
    
    let sumIg = 0;
    let countIg = 0;
    
    const isTO = !!learner.transferredOutTerm;
    
    for (let t = 1; t <= 3; t++) {
      if (isTO && t > parseInt(learner.transferredOutTerm)) {
        terms.push('T/O');
      } else {
        const res = computeTerm(a, learner.id, String(t), mapePart);
        terms.push(res.termGrade);
        
        if (isDescriptive) {
          if (res.hasData) {
            sumIg += res.initialGrade;
            countIg++;
          }
        } else {
          if (res.termGrade !== null && typeof res.termGrade === 'number') {
            sum += res.termGrade;
            count++;
          }
        }
      }
    }
    
    let fg = null;
    let remarks = '';
    if (isTO) {
      fg = 'T/O';
      remarks = '<span style="color:#ffb703; font-weight:600;">Transferred Out</span>';
    } else {
      fg = isDescriptive
        ? (countIg > 0 ? transmute(a, sumIg / countIg) : null)
        : (count > 0 ? Math.round(sum / count) : null);
      remarks = finalRemark(a, fg);
    }
    
    const t1Display = terms[0] === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(terms[0], a.policy));
    const t2Display = terms[1] === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(terms[1], a.policy));
    const t3Display = terms[2] === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(terms[2], a.policy));
    const fgDisplay = fg === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(fg, a.policy));

    html += `<tr>
      <td>${r + 1}</td>
      <td>${esc(learner.lrn)}</td>
      <td>${esc(learnerDisplayName(learner))}</td>
      <td>${t1Display}</td>
      <td>${t2Display}</td>
      <td>${t3Display}</td>
      <td><strong>${fgDisplay}</strong></td>
      <td>${remarks}</td>
    </tr>`;
  }
  
  html += '</tbody></table>';
  if (a.policy === 'DO15_DESCRIPTIVE') {
    html += `<div class="compliance-footnote" style="margin-top:var(--space-2); font-size:var(--font-size-xs); color:var(--text-secondary); font-style:italic; text-align:center">Original basis of grade was descriptive (DO 15, s. 2026).</div>`;
  }
  document.getElementById('finalTable').innerHTML = html;
}

function renderConsolidatedMapehTable(a) {
  const term = db.currentTerm || '1';
  let html = `<div class="record-scroll"><table class="record-grid is-mapeh">
    <colgroup>
      <col style="width:5%" />
      <col style="width:25%" />
      <col style="width:5%" />
      <col style="width:15%" />
      <col style="width:15%" />
      <col style="width:15%" />
      <col style="width:20%" />
    </colgroup>
    <thead>
      <tr>
        <th class="c-no">No.</th>
        <th class="c-learner">Learner</th>
        <th class="c-sex">Sex</th>
        <th class="c-grade">Music & Arts Grade</th>
        <th class="c-grade">PE & Health Grade</th>
        <th class="c-grade">Consolidated Grade</th>
        <th class="c-desc">Remarks</th>
      </tr>
    </thead><tbody>`;

  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';
  for (let r = 0; r < a.learners.length; r++) {
    const learner = a.learners[r];
    const resMusic = computeTerm(a, learner.id, term, 'music_arts');
    const resPE = computeTerm(a, learner.id, term, 'pe_health');

    const gMusic = resMusic.termGrade;
    const gPE = resPE.termGrade;
    
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

    html += `<tr>
      <td class="c-no">${r + 1}</td>
      <td class="c-learner learner-cell" title="${esc(learnerDisplayName(learner))}">${esc(learnerDisplayName(learner))}</td>
      <td class="c-sex">${esc(learner.sex)}</td>
      <td class="c-grade">${blankNull(formatGradeForDisplay(gMusic, a.policy))}</td>
      <td class="c-grade">${blankNull(formatGradeForDisplay(gPE, a.policy))}</td>
      <td class="c-grade"><strong>${blankNull(formatGradeForDisplay(consolidated, a.policy))}</strong></td>
      <td class="c-desc">${renderBadge(consolidated)}</td>
    </tr>`;
  }
  
  html += '</tbody></table></div>';
  if (a.policy === 'DO15_DESCRIPTIVE') {
    html += `<div class="compliance-footnote" style="margin-top:var(--space-2); font-size:var(--font-size-xs); color:var(--text-secondary); font-style:italic; text-align:center">Original basis of grade was descriptive (DO 15, s. 2026).</div>`;
  }
  document.getElementById('recordTable').innerHTML = html;
}

function renderConsolidatedMapehSummary(a) {
  let html = `<table class="summary-table">
    <colgroup>
      <col style="width: 4%" />
      <col style="width: 10%" />
      <col style="width: 20%" />
      <col style="width: 10%" />
      <col style="width: 10%" />
      <col style="width: 10%" />
      <col style="width: 10%" />
      <col style="width: 10%" />
      <col style="width: 8%" />
      <col style="width: 8%" />
    </colgroup>
    <thead>
      <tr>
        <th>No.</th>
        <th>LRN</th>
        <th>Learner</th>
        <th>Music & Arts Final</th>
        <th>PE & Health Final</th>
        <th>Term 1 Consolidated</th>
        <th>Term 2 Consolidated</th>
        <th>Term 3 Consolidated</th>
        <th>MAPEH Final</th>
        <th>Remarks</th>
      </tr>
    </thead><tbody>`;
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';
  for (let r = 0; r < a.learners.length; r++) {
    const learner = a.learners[r];
    
    let sumMusic = 0, countMusic = 0;
    let sumPE = 0, countPE = 0;
    const consGrades = [];

    let sumMusicIg = 0, countMusicIg = 0;
    let sumPEIg = 0, countPEIg = 0;

    const isTO = !!learner.transferredOutTerm;

    for (let t = 1; t <= 3; t++) {
      if (isTO && t > parseInt(learner.transferredOutTerm)) {
        consGrades.push('T/O');
      } else {
        const resMusic = computeTerm(a, learner.id, String(t), 'music_arts');
        const resPE = computeTerm(a, learner.id, String(t), 'pe_health');

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
          if (gm !== null && typeof gm === 'number') {
            sumMusic += gm;
            countMusic++;
          }

          if (gp !== null && typeof gp === 'number') {
            sumPE += gp;
            countPE++;
          }

          const gc = consolidateMapehGrades(gm, gp);
          consGrades.push(gc);
        }
      }
    }

    let musicFinal = null, peFinal = null, finalConsolidated = null;
    let remarks = '';
    
    if (isTO) {
      musicFinal = 'T/O';
      peFinal = 'T/O';
      finalConsolidated = 'T/O';
      remarks = '<span style="color:#ffb703; font-weight:600;">Transferred Out</span>';
    } else {
      musicFinal = isDescriptive
        ? (countMusicIg > 0 ? transmute(a, sumMusicIg / countMusicIg) : null)
        : (countMusic > 0 ? Math.round(sumMusic / countMusic) : null);
        
      peFinal = isDescriptive
        ? (countPEIg > 0 ? transmute(a, sumPEIg / countPEIg) : null)
        : (countPE > 0 ? Math.round(sumPE / countPE) : null);

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
      remarks = finalRemark(a, finalConsolidated);
    }
    
    const mfDisplay = musicFinal === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(musicFinal, a.policy));
    const pfDisplay = peFinal === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(peFinal, a.policy));
    const t1Display = consGrades[0] === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(consGrades[0], a.policy));
    const t2Display = consGrades[1] === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(consGrades[1], a.policy));
    const t3Display = consGrades[2] === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(consGrades[2], a.policy));
    const fcDisplay = finalConsolidated === 'T/O' ? '<span style="color:#ffb703; font-weight:600;">T/O</span>' : blankNull(formatGradeForDisplay(finalConsolidated, a.policy));

    html += `<tr>
      <td>${r + 1}</td>
      <td>${esc(learner.lrn)}</td>
      <td>${esc(learnerDisplayName(learner))}</td>
      <td>${mfDisplay}</td>
      <td>${pfDisplay}</td>
      <td>${t1Display}</td>
      <td>${t2Display}</td>
      <td>${t3Display}</td>
      <td><strong>${fcDisplay}</strong></td>
      <td>${remarks}</td>
    </tr>`;
  }
  
  html += '</tbody></table>';
  if (a.policy === 'DO15_DESCRIPTIVE') {
    html += `<div class="compliance-footnote" style="margin-top:var(--space-2); font-size:var(--font-size-xs); color:var(--text-secondary); font-style:italic; text-align:center">Original basis of grade was descriptive (DO 15, s. 2026).</div>`;
  }
  document.getElementById('finalTable').innerHTML = html;
}

/**
 * Handles arrow/enter key navigation inside the scores input matrix.
 */
document.addEventListener('focusin', (e) => {
  if (e.target && e.target.classList.contains('score-input')) {
    const input = e.target;
    
    // Store current focus state for Quick Grade Entry modal auto-targeting
    if (input.dataset.assessmentId) {
      window.lastFocusedAssessmentId = input.dataset.assessmentId;
    }
    if (input.dataset.learnerIndex !== undefined) {
      window.lastFocusedLearnerIndex = parseInt(input.dataset.learnerIndex);
    }
  }
});

function scoreNav(event, r, j, learnerId, assessmentId) {
  const code = event.keyCode || event.which;
  if (code !== 13 && code !== 9) return true; // Enter or Tab
  
  const input = event.target;
  const value = input ? input.value : '';
  let targetId = null;
  
  if (code === 13) {
    // Enter goes down
    const nr = r + 1;
    if (nr < recordRowCount) {
      targetId = `sc-${nr}-${j}`;
    } else if (j + 1 < recordColCount) {
      targetId = `sc-0-${j + 1}`;
    }
  } else {
    // Tab goes right
    const index = r * recordColCount + j;
    const ni = index + (event.shiftKey ? -1 : 1);
    if (ni >= 0 && ni < recordRowCount * recordColCount) {
      targetId = `sc-${Math.floor(ni / recordColCount)}-${ni % recordColCount}`;
    }
  }
  
  if (event.preventDefault) event.preventDefault();
  event.returnValue = false;
  
  updateScore(learnerId, assessmentId, value);
  
  if (targetId) {
    const el = document.getElementById(targetId);
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }
  return false;
}

/**
 * Keyboard navigation inside HPS (Highest Possible Score) row.
 */
function maxNav(event, h, assessmentId) {
  const code = event.keyCode || event.which;
  if (code !== 13 && code !== 9) return true;
  
  const input = event.target;
  const value = input ? input.value : '';
  let targetId = null;
  
  if (code === 13) {
    if (recordRowCount > 0) {
      targetId = `sc-0-${h}`;
    } else if (h + 1 < recordColCount) {
      targetId = `hps-${h + 1}`;
    }
  } else {
    const nh = h + (event.shiftKey ? -1 : 1);
    if (nh >= 0 && nh < recordColCount) {
      targetId = `hps-${nh}`;
    }
  }
  
  if (event.preventDefault) event.preventDefault();
  event.returnValue = false;
  
  updateAssessmentMax(assessmentId, value);
  
  if (targetId) {
    const el = document.getElementById(targetId);
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }
  return false;
}

/**
 * Handles score update from event inputs.
 */
function updateScore(learnerId, assessmentId, value) {
  const a = currentAssignment();
  if (!a) return;
  
  const key = `${learnerId}|${assessmentId}`;
  const clean = trim(value);
  
  const oldValue = a.scores[key] === undefined ? '' : String(a.scores[key]);
  const newValue = clean === '' ? '' : String(parseFloat(clean));
  
  if (oldValue === newValue || (clean !== '' && isNaN(parseFloat(clean)))) {
    return;
  }
  
  pushHistoryState();
  
  if (clean === '') {
    delete a.scores[key];
  } else {
    const n = parseFloat(clean);
    a.scores[key] = n;
  }
  
  debouncedSave();
  renderRecordTable();
  renderFinalOnly();
}

/**
 * Handles maximum assessment points change from event inputs.
 */
function updateAssessmentMax(assessmentId, value) {
  const a = currentAssignment();
  if (!a) return;
  
  const clean = trim(value);
  const newMax = clean === '' ? '' : number(clean);
  
  let targetAssessment = null;
  for (let i = 0; i < a.assessments.length; i++) {
    if (a.assessments[i].id === assessmentId) {
      targetAssessment = a.assessments[i];
      break;
    }
  }
  
  if (!targetAssessment) return;
  
  const oldMax = targetAssessment.maxScore;
  if (oldMax === newMax) {
    return; // No change
  }
  
  pushHistoryState();
  
  targetAssessment.maxScore = newMax;
  
  debouncedSave();
  render();
}

/**
 * Retrieves assessments lists matching a term, sorting KS2 formats.
 */
function termAssessments(a, term, mapePart) {
  const out = [];
  if (!a) return out;
  for (let i = 0; i < a.assessments.length; i++) {
    const ast = a.assessments[i];
    if (String(ast.term) === String(term)) {
      if (mapePart === undefined || ast.mapePart === mapePart) {
        out.push(ast);
      }
    }
  }
  if (isKeyStage2(a)) {
    out.sort((x, y) => assessmentOrder(x) - assessmentOrder(y));
  }
  return out;
}

function assessmentOrder(item) {
  for (let i = 0; i < keyStage2Template.length; i++) {
    if (keyStage2Template[i].component === item.component && keyStage2Template[i].title === item.title) {
      return i;
    }
  }
  return 100;
}

/**
 * Displays status badge depending on pass/fail.
 */
function renderBadge(grade) {
  if (grade === null || grade === undefined || grade === '') return '';
  const isPass = isPassing(grade);
  const badgeClass = isPass ? 'badge badge--pass' : 'badge badge--fail';
  const desc = descriptor(grade);
  const text = isPass ? `Passed - ${desc}` : `For Intervention - ${desc}`;
  return `<span class="${badgeClass}">${esc(text)}</span>`;
}

function finalRemark(a, grade) {
  if (grade === null || grade === undefined || grade === '') return '';
  if (isKeyStage2(a)) return esc(descriptor(grade));
  return renderBadge(grade);
}

function componentLabel(component) {
  if (component === 'WW') return 'WW';
  if (component === 'PT') return 'PT';
  if (component === 'SA1' || component === 'ST1') return 'SA1';
  if (component === 'SA2' || component === 'ST2') return 'SA2';
  if (component === 'TE') return 'TE';
  return component;
}

function compactAssessmentLabel(item) {
  let title = trim(item.title || '');
  if (title) {
    title = title.replace(/\s+/g, '');
    title = title.replace(/^WW/i, 'W');
    title = title.replace(/^PT/i, 'P');
    return title;
  }
  return componentLabel(item.component);
}

function clearColumnScores(assessmentId) {
  const a = currentAssignment();
  if (!a) return;
  
  const activeTerm = db.currentTerm || '1';
  const isMapeh = isMapehSubject(a.subject);
  const mapePart = isMapeh ? currentMapehSubTab : undefined;
  const items = termAssessments(a, activeTerm, mapePart);
  const item = items.find(it => it.id === assessmentId);
  const label = item ? `${componentLabel(item.component)} ${item.title || ''}` : 'Assessment Column';
  
  confirmModal(
    'Clear Column Scores',
    `Are you sure you want to delete all student scores in "${label}"? This action cannot be undone and will not affect the Highest Possible Score (HPS).`,
    () => {
      pushHistoryState();
      a.learners.forEach(learner => {
        const key = `${learner.id}|${assessmentId}`;
        delete a.scores[key];
      });
      saveDatabase();
      render();
      toast('Column scores deleted successfully.', 'success');
    }
  );
}
