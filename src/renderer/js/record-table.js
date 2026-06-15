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

/**
 * Renders the active term class record grid.
 */
function renderRecordTable() {
  const a = currentAssignment();
  if (!a) {
    document.getElementById('recordTable').innerHTML = emptyState(
      'No teaching load selected',
      'Select a class load in the Classes sidebar or add one to get started.'
    );
    return;
  }
  
  if (isKeyStage2(a)) {
    ensureKeyStage2Assessments(a);
  }
  
  if (a.learners.length === 0) {
    document.getElementById('recordTable').innerHTML = emptyState(
      'No learners yet',
      'Add student rosters under the Classes tab, upload an SF1, or paste a CSV list.'
    );
    return;
  }
  
  const items = termAssessments(a, db.currentTerm);
  recordRowCount = a.learners.length;
  recordColCount = items.length;
  const w = weightsFor(a.subjectGroup);
  const cols = recordColGroup(a, items);
  
  let html = `<div class="record-scroll"><table class="record-grid">${cols}<thead>`;
  
  if (isKeyStage2(a)) {
    // Key Stage 2 Columns Headers (Trimesters split)
    html += `<tr>
      <th class="c-no">No.</th>
      <th class="c-learner">Learner</th>
      <th class="c-sex">Sex</th>`;
    for (let gi = 0; gi < items.length; gi++) {
      html += `<th class="c-score" title="${esc(items[gi].title)}">${esc(compactAssessmentLabel(items[gi]))}</th>`;
      if (gi === 4) html += `<th class="c-calc" title="Written Work Total">T</th><th class="c-calc" title="Written Work Percentage">%</th><th class="c-calc" title="Written Work Weighted Score">WS</th>`;
      if (gi === 7) html += `<th class="c-calc" title="Performance Task Total">T</th><th class="c-calc" title="Performance Task Percentage">%</th><th class="c-calc" title="Performance Task Weighted Score">WS</th>`;
      if (gi === 10) html += `<th class="c-calc" title="Trimester Exam Total">T</th><th class="c-calc" title="Trimester Exam Percentage">%</th><th class="c-calc" title="Trimester Exam Weighted Score">WS</th>`;
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
      html += `<th class="c-score ${compClass}" title="${esc(items[i].title)}">${esc(componentLabel(items[i].component))}<br/><span class="text-xs text-muted">${esc(items[i].title)}</span></th>`;
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
    const result = computeTerm(a, learner.id, db.currentTerm);
    
    html += `<tr>
      <td class="c-no">${r + 1}</td>
      <td class="c-learner learner-cell" title="${esc(learnerDisplayName(learner))}">${esc(learnerDisplayName(learner))}</td>
      <td class="c-sex">${esc(learner.sex)}</td>`;
      
    for (let j = 0; j < items.length; j++) {
      const key = `${learner.id}|${items[j].id}`;
      const val = a.scores[key] === undefined ? '' : a.scores[key];
      const maxNum = number(items[j].maxScore);
      const overMax = maxNum > 0 && val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) > maxNum;
      
      const scoreTitle = `${learnerDisplayName(learner)} - ${componentLabel(items[j].component)} ${items[j].title || ''} ${maxNum > 0 ? '(max ' + maxNum + ')' : ''}`;
      
      html += `<td class="c-score">
        <input id="sc-${r}-${j}" class="score-input${overMax ? ' invalid' : ''}" title="${esc(scoreTitle)}" value="${esc(val)}"
          onkeydown="return scoreNav(event, ${r}, ${j}, '${esc(learner.id)}', '${esc(items[j].id)}')"
          onchange="updateScore('${esc(learner.id)}', '${esc(items[j].id)}', this.value)" />
      </td>`;
      
      if (isKeyStage2(a) && (j === 4 || j === 7 || j === 10)) {
        const block = j === 4 ? result.ww : j === 7 ? result.pt : componentScore(a, learner.id, db.currentTerm, ['SA1', 'SA2', 'ST1', 'ST2', 'TE']);
        const weight = j === 4 ? w[0] : j === 7 ? w[1] : w[2];
        html += `<td class="c-calc">${blankZero(block.raw)}</td>
                 <td class="c-calc">${block.hasData ? fmt(block.ps) : ''}</td>
                 <td class="c-calc">${block.hasData ? fmt(block.ps * weight / 100) : ''}</td>`;
      }
    }
    
    if (!isKeyStage2(a)) {
      html += `<td class="c-spacer"></td>
               <td class="c-calc">${fmt(result.ww.ps)}</td>
               <td class="c-calc">${fmt(result.pt.ps)}</td>
               <td class="c-calc">${fmt(result.examPS)}</td>`;
    }
    
    html += `<td class="c-grade">${result.hasData ? fmt(result.initialGrade) : ''}</td>
             <td class="c-grade">${result.termGrade === null ? '' : result.termGrade}</td>
             <td class="c-desc">${esc(termDescription(a, result.termGrade))}</td>
             </tr>`;
  }
  
  html += `</tbody></table></div>`;
  document.getElementById('recordTable').innerHTML = html;
}

/**
 * Builds colgroup elements based on columns layout configuration.
 */
function recordColGroup(a, items) {
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
    let refCount = maxTermAssessmentCount(a);
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

function maxTermAssessmentCount(a) {
  let m = 0;
  for (let t = 1; t <= 3; t++) {
    const c = termAssessments(a, String(t)).length;
    if (c > m) m = c;
  }
  return m;
}

function groupScoreMax(items, endIndex) {
  const start = endIndex === 4 ? 0 : endIndex === 7 ? 5 : 8;
  let total = 0;
  for (let i = start; i <= endIndex; i++) {
    total += number(items[i].maxScore);
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
      'Final grades will appear once class lists are populated.'
    );
    return;
  }
  
  let html = `<table><thead>
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
  
  for (let r = 0; r < a.learners.length; r++) {
    const learner = a.learners[r];
    const terms = [];
    let sum = 0;
    let count = 0;
    
    for (let t = 1; t <= 3; t++) {
      const res = computeTerm(a, learner.id, String(t));
      terms.push(res.termGrade);
      if (res.termGrade !== null) {
        sum += res.termGrade;
        count++;
      }
    }
    
    const fg = count > 0 ? Math.round(sum / count) : null;
    
    html += `<tr>
      <td>${r + 1}</td>
      <td>${esc(learner.lrn)}</td>
      <td>${esc(learnerDisplayName(learner))}</td>
      <td>${blankNull(terms[0])}</td>
      <td>${blankNull(terms[1])}</td>
      <td>${blankNull(terms[2])}</td>
      <td><strong>${blankNull(fg)}</strong></td>
      <td>${finalRemark(a, fg)}</td>
    </tr>`;
  }
  
  html += '</tbody></table>';
  document.getElementById('finalTable').innerHTML = html;
}

/**
 * Handles arrow/enter key navigation inside the scores input matrix.
 */
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
  
  if (clean === '') {
    delete a.scores[key];
  } else {
    const n = parseFloat(clean);
    if (!isNaN(n)) {
      a.scores[key] = n;
    }
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
  
  for (let i = 0; i < a.assessments.length; i++) {
    if (a.assessments[i].id === assessmentId) {
      const clean = trim(value);
      a.assessments[i].maxScore = clean === '' ? '' : number(clean);
      break;
    }
  }
  
  debouncedSave();
  render();
}

/**
 * Retrieves assessments lists matching a term, sorting KS2 formats.
 */
function termAssessments(a, term) {
  const out = [];
  if (!a) return out;
  for (let i = 0; i < a.assessments.length; i++) {
    if (a.assessments[i].term === term) {
      out.push(a.assessments[i]);
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
  const isPass = grade >= 75;
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
