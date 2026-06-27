/**
 * E-Class Record — Class Analysis Module
 *
 * Computes and renders per-assessment statistics (mean, median, mode,
 * performance distribution) and per-learner performance details with
 * graphical CSS charts for the Class Analysis modal.
 */

let classAnalysisAssignmentId = null;
let classAnalysisTerm = '1';

// ── Statistical Helpers ──────────────────────────────────────

function calcMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function calcMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcMode(arr) {
  if (!arr.length) return null;
  const freq = {};
  arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const maxFreq = Math.max(...Object.values(freq));
  if (maxFreq === 1) return null;
  const modes = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);
  return modes.length === arr.length ? null : modes[0];
}

function calcPercentile(arr, value) {
  if (!arr.length) return 0;
  const below = arr.filter(v => v < value).length;
  return Math.round((below / arr.length) * 100);
}

// ── Core Computation ─────────────────────────────────────────

function computeClassAnalysis(a, term, mapePart) {
  const isSummary = term === 'summary';
  const isMapeh = typeof isMapehSubject === 'function' && isMapehSubject(a.subject);
  const activePart = mapePart || (isMapeh ? 'music_arts' : undefined);

  // ── Per-assessment stats ──
  let items;
  if (isSummary) {
    items = [];
    if (typeof termAssessments === 'function') {
      for (let t = 1; t <= 3; t++) {
        items.push(...termAssessments(a, String(t), activePart));
      }
    }
  } else {
    items = typeof termAssessments === 'function' ? termAssessments(a, term, activePart) : [];
  }

  const assessmentStats = items.map(ast => {
    const scores = [];
    const hps = parseFloat(ast.maxScore) || 0;

    a.learners.forEach(l => {
      const key = `${l.id}|${ast.id}`;
      const val = parseFloat(a.scores[key]);
      if (!isNaN(val)) scores.push(val);
    });

    const perf = { advanced: 0, proficient: 0, developing: 0, beginning: 0 };
    const dist = [0, 0, 0, 0, 0];
    scores.forEach(s => {
      const pct = hps > 0 ? (s / hps) * 100 : 0;
      if (pct >= 90) perf.advanced++;
      else if (pct >= 75) perf.proficient++;
      else if (pct >= 50) perf.developing++;
      else perf.beginning++;

      const bin = Math.min(Math.floor(pct / 20), 4);
      dist[bin]++;
    });

    let termDistributions = null;
    if (isSummary) {
      termDistributions = {};
      for (let t = 1; t <= 3; t++) {
        const tDist = [0, 0, 0, 0, 0];
        a.learners.forEach(l => {
          const key = `${l.id}|${ast.id}`;
          const val = parseFloat(a.scores[key]);
          if (!isNaN(val)) {
            const pct = hps > 0 ? (val / hps) * 100 : 0;
            const bin = Math.min(Math.floor(pct / 20), 4);
            tDist[bin]++;
          }
        });
        termDistributions[t] = tDist;
      }
    }

    return {
      assessment: ast,
      scores,
      mean: calcMean(scores),
      median: calcMedian(scores),
      mode: calcMode(scores),
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      passRate: scores.length ? Math.round(scores.filter(s => hps > 0 && s >= hps * 0.75).length / scores.length * 100) : 0,
      performanceLevel: perf,
      distribution: dist,
      termDistributions
    };
  });

  // ── Per-learner stats ──
  const learnerResults = [];
  const allTermGrades = [];
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';

  a.learners.forEach(l => {
    if (typeof computeTerm !== 'function') return;

    if (isSummary) {
      let sum = 0, count = 0, sumIg = 0, countIg = 0;
      let finalTermGrade = null;
      for (let t = 1; t <= 3; t++) {
        const res = computeTerm(a, l.id, String(t), activePart);
        if (isDescriptive) {
          if (res.hasData) { sumIg += res.initialGrade; countIg++; }
        } else {
          if (res.termGrade !== null && typeof res.termGrade === 'number') { sum += res.termGrade; count++; }
        }
      }
      if (isDescriptive) {
        finalTermGrade = countIg > 0 && typeof transmute === 'function' ? transmute(a, sumIg / countIg) : null;
      } else {
        finalTermGrade = count > 0 ? Math.round(sum / count) : null;
      }

      const term1 = computeTerm(a, l.id, '1', activePart);

      const avgIg = countIg > 0 ? sumIg / countIg : null;
      const numericGrade = typeof finalTermGrade === 'number' ? finalTermGrade : (isDescriptive && avgIg !== null ? avgIg : null);
      if (numericGrade !== null) allTermGrades.push(numericGrade);

      let remarks = '—';
      if (finalTermGrade !== null) {
        remarks = (typeof isPassing === 'function' && isPassing(finalTermGrade))
          ? 'Passed'
          : (a.policy === 'DO15_DESCRIPTIVE' ? 'For Intervention' : 'Failed');
      }

      learnerResults.push({
        learner: l,
        termGrade: finalTermGrade,
        initialGrade: numericGrade,
        ww: term1.ww || { raw: 0, max: 0, ps: 0 },
        pt: term1.pt || { raw: 0, max: 0, ps: 0 },
        exam: { raw: 0, max: 0, ps: term1.examPS || 0 },
        remarks
      });
    } else {
      const result = computeTerm(a, l.id, term, activePart);
      const tg = result.termGrade;
      const numericGrade = typeof tg === 'number' ? tg : (isDescriptive && result.hasData ? result.initialGrade : null);
      if (numericGrade !== null) allTermGrades.push(numericGrade);

      let remarks = '—';
      if (tg !== null) {
        remarks = (typeof isPassing === 'function' && isPassing(tg))
          ? 'Passed'
          : (a.policy === 'DO15_DESCRIPTIVE' ? 'For Intervention' : 'Failed');
      }
      if (tg === 'T/O') remarks = 'Transferred Out';
      if (result.isTransferredIn) remarks = 'Transferred In';

      learnerResults.push({
        learner: l,
        termGrade: tg,
        initialGrade: numericGrade,
        ww: result.ww || { raw: 0, max: 0, ps: 0 },
        pt: result.pt || { raw: 0, max: 0, ps: 0 },
        exam: { raw: 0, max: 0, ps: result.examPS || 0 },
        remarks
      });
    }
  });

  // Sort by term grade (or initial grade for descriptive) descending for ranking
  learnerResults.sort((x, y) => {
    const ga = typeof x.termGrade === 'number' ? x.termGrade : (x.initialGrade !== null ? x.initialGrade : -1);
    const gb = typeof y.termGrade === 'number' ? y.termGrade : (y.initialGrade !== null ? y.initialGrade : -1);
    return gb - ga;
  });

  let rank = 0;
  let prevGrade = null;
  learnerResults.forEach((lr, i) => {
    const g = typeof lr.termGrade === 'number' ? lr.termGrade : (lr.initialGrade !== null ? lr.initialGrade : null);
    if (g !== null && g !== prevGrade) {
      rank = i + 1;
      prevGrade = g;
    }
    lr.rank = rank;
    lr.percentile = calcPercentile(allTermGrades, g !== null ? g : 0);
  });

  // ── Class-level stats ──
  const classStats = {
    mean: calcMean(allTermGrades),
    median: calcMedian(allTermGrades),
    mode: calcMode(allTermGrades),
    passRate: allTermGrades.length ? Math.round(allTermGrades.filter(g => typeof isPassing === 'function' && isPassing(g)).length / allTermGrades.length * 100) : 0,
    distribution: { advanced: 0, proficient: 0, developing: 0, beginning: 0 },
    gradeDistribution: [0, 0, 0, 0, 0]
  };

  allTermGrades.forEach(g => {
    if (g >= 90) { classStats.distribution.advanced++; classStats.gradeDistribution[4]++; }
    else if (g >= 85) { classStats.distribution.proficient++; classStats.gradeDistribution[3]++; }
    else if (g >= 80) { classStats.distribution.developing++; classStats.gradeDistribution[2]++; }
    else if (g >= 75) { classStats.distribution.beginning++; classStats.gradeDistribution[1]++; }
    else { classStats.distribution.beginning++; classStats.gradeDistribution[0]++; }
  });

  return { assessments: assessmentStats, learners: learnerResults, classStats };
}

// ── Render: Full Modal ───────────────────────────────────────

function renderClassAnalysisModal(a, term) {
  const analysis = computeClassAnalysis(a, term);
  const isMapeh = typeof isMapehSubject === 'function' && isMapehSubject(a.subject);
  const isSummary = term === 'summary';

  const termLabel = term === 'summary' ? 'Summary' : `Term ${term}`;

  return `
    <div style="margin-bottom:var(--space-4);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--space-3);">
        <div>
          <div style="font-size:var(--font-size-lg);font-weight:var(--font-weight-bold);">Grade ${esc(a.gradeLevel)} - ${esc(a.section)}</div>
          <div class="text-muted text-sm">${esc(a.subject)} &middot; SY ${esc(a.schoolYear)}</div>
        </div>
        <div class="record-tabs" style="margin-bottom:0;">
          <button class="record-tab ${term === '1' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('1')">Term 1</button>
          <button class="record-tab ${term === '2' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('2')">Term 2</button>
          <button class="record-tab ${term === '3' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('3')">Term 3</button>
          <button class="record-tab record-tab--summary ${term === 'summary' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('summary')">Summary</button>
        </div>
      </div>
    </div>

    ${analysis.learners.length === 0 ? `
      <div style="text-align:center;padding:var(--space-8);color:var(--text-secondary);">
        <p style="font-size:var(--font-size-lg);margin:0;">No learner data available for ${termLabel}.</p>
        <p class="text-sm" style="margin-top:var(--space-2);">Add learners and enter scores to see class analysis.</p>
      </div>
    ` : `
      ${renderClassSummary(analysis.classStats)}
      ${renderLearnerGradeDistribution(analysis.classStats)}
      ${analysis.assessments.length > 0 ? `
        ${renderAssessmentAnalysisChart(analysis.assessments)}
        ${renderScoreDistributionChart(analysis.assessments, isSummary)}
        ${renderAssessmentAnalysisTable(analysis.assessments)}
      ` : ''}
      ${renderLearnerPerformanceTable(analysis.learners, a)}
    `}
  `;
}

// ── Render: Class Summary Card ───────────────────────────────

function renderClassSummary(stats) {
  const d = stats.distribution;
  const total = d.advanced + d.proficient + d.developing + d.beginning;

  function pct(n) { return total > 0 ? Math.round(n / total * 100) : 0; }

  return `
    <div class="card" style="margin-bottom:var(--space-4);padding:var(--space-4);">
      <h3 class="card-title" style="margin-top:0;margin-bottom:var(--space-3);">Class Summary</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-4);">
        <div style="text-align:center;padding:var(--space-3);background:var(--bg-neutral);border-radius:var(--radius-lg);">
          <div class="text-xs text-muted">Mean</div>
          <div style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);color:var(--color-primary-600);">${stats.mean ? stats.mean.toFixed(1) : '—'}</div>
        </div>
        <div style="text-align:center;padding:var(--space-3);background:var(--bg-neutral);border-radius:var(--radius-lg);">
          <div class="text-xs text-muted">Median</div>
          <div style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);color:var(--color-primary-600);">${stats.median ? stats.median.toFixed(1) : '—'}</div>
        </div>
        <div style="text-align:center;padding:var(--space-3);background:var(--bg-neutral);border-radius:var(--radius-lg);">
          <div class="text-xs text-muted">Mode</div>
          <div style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);color:var(--color-primary-600);">${stats.mode !== null ? stats.mode : '—'}</div>
        </div>
        <div style="text-align:center;padding:var(--space-3);background:var(--bg-neutral);border-radius:var(--radius-lg);">
          <div class="text-xs text-muted">Pass Rate</div>
          <div style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);color:${stats.passRate >= 75 ? 'var(--color-success-600)' : 'var(--color-error-600)'};">${total > 0 ? stats.passRate + '%' : '—'}</div>
        </div>
      </div>

      ${total > 0 ? `
      <div class="text-xs text-muted" style="margin-bottom:6px;">Performance Distribution (${total} learners)</div>
      <div style="display:flex;height:28px;border-radius:var(--radius-md);overflow:hidden;margin-bottom:var(--space-2);">
        ${d.advanced > 0 ? `<div style="width:${pct(d.advanced)}%;background:var(--color-success-500);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600;">${d.advanced > 1 ? d.advanced : ''}</div>` : ''}
        ${d.proficient > 0 ? `<div style="width:${pct(d.proficient)}%;background:var(--color-primary-500);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600;">${d.proficient > 1 ? d.proficient : ''}</div>` : ''}
        ${d.developing > 0 ? `<div style="width:${pct(d.developing)}%;background:var(--color-warning-500);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600;">${d.developing > 1 ? d.developing : ''}</div>` : ''}
        ${d.beginning > 0 ? `<div style="width:${pct(d.beginning)}%;background:var(--color-error-500);display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:600;">${d.beginning > 1 ? d.beginning : ''}</div>` : ''}
      </div>
      <div style="display:flex;gap:var(--space-4);font-size:var(--font-size-xs);">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-success-500);margin-right:4px;"></span>Advanced (${d.advanced})</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-primary-500);margin-right:4px;"></span>Proficient (${d.proficient})</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-warning-500);margin-right:4px;"></span>Developing (${d.developing})</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-error-500);margin-right:4px;"></span>Beginning (${d.beginning})</span>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Render: Assessment Mean/Median/Mode Chart ────────────────

function renderAssessmentAnalysisChart(assessments) {
  if (!assessments.length) return '';

  const maxHps = Math.max(...assessments.map(a => parseFloat(a.assessment.maxScore) || 0), 1);
  const barHeight = 200;
  const groupWidth = 60;
  const barWidth = 14;
  const chartWidth = assessments.length * groupWidth + 40;

  const ySteps = [0, 0.25, 0.5, 0.75, 1];

  let bars = '';
  assessments.forEach((ast, i) => {
    const x = i * groupWidth + 20;
    const hps = parseFloat(ast.assessment.maxScore) || 1;

    const meanH = (ast.mean / hps) * barHeight;
    const medianH = (ast.median / hps) * barHeight;
    const modeH = ast.mode !== null ? (ast.mode / hps) * barHeight : 0;

    bars += `
      <div style="position:absolute;left:${x}px;bottom:0;width:${groupWidth}px;display:flex;justify-content:center;gap:2px;align-items:flex-end;">
        <div style="width:${barWidth}px;height:${meanH}px;background:var(--color-primary-500);border-radius:3px 3px 0 0;" title="Mean: ${ast.mean.toFixed(1)}"></div>
        <div style="width:${barWidth}px;height:${medianH}px;background:var(--color-accent-500);border-radius:3px 3px 0 0;" title="Median: ${ast.median.toFixed(1)}"></div>
        ${ast.mode !== null ? `<div style="width:${barWidth}px;height:${modeH}px;background:var(--color-neutral-400);border-radius:3px 3px 0 0;" title="Mode: ${ast.mode}"></div>` : ''}
      </div>
      <div style="position:absolute;left:${x}px;bottom:-22px;width:${groupWidth}px;text-align:center;font-size:10px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(ast.assessment.title)}</div>
    `;
  });

  let yLabels = '';
  ySteps.forEach(pct => {
    const y = barHeight - (pct * barHeight);
    const val = (pct * maxHps).toFixed(0);
    yLabels += `<div style="position:absolute;left:0;bottom:${y - 6}px;font-size:10px;color:var(--text-tertiary);width:30px;text-align:right;">${val}</div>`;
  });

  return `
    <div class="card" style="margin-bottom:var(--space-4);padding:var(--space-4);">
      <h3 class="card-title" style="margin-top:0;margin-bottom:var(--space-3);">Assessment Mean / Median / Mode</h3>
      <div style="position:relative;height:${barHeight + 30}px;margin-left:35px;">
        <div style="position:absolute;left:0;top:0;bottom:0;width:1px;background:var(--border-default);"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:1px;background:var(--border-default);"></div>
        ${yLabels}
        ${bars}
      </div>
      <div style="display:flex;gap:var(--space-4);margin-top:var(--space-3);margin-left:35px;font-size:var(--font-size-xs);">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-primary-500);margin-right:4px;"></span>Mean</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-accent-500);margin-right:4px;"></span>Median</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--color-neutral-400);margin-right:4px;"></span>Mode</span>
      </div>
    </div>
  `;
}

// ── Render: Score Distribution Chart ─────────────────────────

function renderScoreDistributionChart(assessments, isSummary) {
  if (!assessments.length) return '';

  const labels = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'];
  const colors = ['var(--color-error-500)', 'var(--color-warning-500)', 'var(--color-accent-500)', 'var(--color-primary-500)', 'var(--color-success-500)'];

  let rows = '';
  assessments.forEach(ast => {
    const hps = parseFloat(ast.assessment.maxScore) || 0;
    if (isSummary && ast.termDistributions) {
      let termCols = '';
      for (let t = 1; t <= 3; t++) {
        const dist = ast.termDistributions[t] || [0, 0, 0, 0, 0];
        const total = dist.reduce((a, b) => a + b, 0);
        const barSegments = dist.map((count, bin) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          if (pct === 0) return '';
          return `<div style="width:${pct}%;background:${colors[bin]};height:100%;" title="Term ${t} - ${labels[bin]}: ${count} (${pct}%)"></div>`;
        }).join('');
        
        termCols += `
          <td style="padding:8px;text-align:center;width:25%;">
            <div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">T${t} (n=${total})</div>
            <div style="display:flex;height:16px;border-radius:3px;overflow:hidden;background:var(--bg-neutral);border:1px solid var(--border-subtle);">
              ${barSegments || '<div style="width:100%;text-align:center;font-size:9px;color:var(--text-tertiary);line-height:14px;">No data</div>'}
            </div>
          </td>
        `;
      }
      rows += `
        <tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:8px;font-weight:500;vertical-align:middle;">${esc(ast.assessment.title)} <span style="font-size:10px;color:var(--text-tertiary);">(${esc(ast.assessment.component)}, HPS: ${hps})</span></td>
          ${termCols}
        </tr>
      `;
    } else {
      const dist = ast.distribution || [0, 0, 0, 0, 0];
      const total = dist.reduce((a, b) => a + b, 0);
      const barSegments = dist.map((count, bin) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        if (pct === 0) return '';
        return `<div style="width:${pct}%;background:${colors[bin]};height:100%;" title="${labels[bin]}: ${count} (${pct}%)"></div>`;
      }).join('');

      const legendSegments = dist.map((count, bin) => {
        if (count === 0) return '';
        return `
          <span style="display:inline-flex;align-items:center;margin-right:8px;font-size:10px;">
            <span style="width:8px;height:8px;border-radius:1px;background:${colors[bin]};margin-right:3px;"></span>
            ${labels[bin]}: ${count}
          </span>
        `;
      }).join('');

      rows += `
        <tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:8px;font-weight:500;width:30%;">${esc(ast.assessment.title)} <span style="font-size:10px;color:var(--text-tertiary);">(${esc(ast.assessment.component)}, HPS: ${hps})</span></td>
          <td style="padding:8px;vertical-align:middle;">
            <div style="display:flex;height:20px;border-radius:4px;overflow:hidden;background:var(--bg-neutral);border:1px solid var(--border-subtle);margin-bottom:4px;">
              ${barSegments || '<div style="width:100%;text-align:center;font-size:10px;color:var(--text-tertiary);line-height:18px;">No scores recorded</div>'}
            </div>
            <div style="display:flex;flex-wrap:wrap;">
              ${legendSegments}
            </div>
          </td>
        </tr>
      `;
    }
  });

  return `
    <div class="card" style="margin-bottom:var(--space-4);padding:0;overflow-x:auto;">
      <div style="padding:var(--space-4) var(--space-4) 0;">
        <h3 class="card-title" style="margin-top:0;">Score Distribution Analysis</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
        <thead>
          <tr style="background:var(--bg-neutral);border-top:1px solid var(--border-default);border-bottom:1px solid var(--border-default);">
            <th style="padding:8px;text-align:left;">Assessment</th>
            ${isSummary ? '<th style="padding:8px;text-align:center;" colspan="3">Term distributions</th>' : '<th style="padding:8px;text-align:left;">Distribution Percentage</th>'}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// ── Render: Grade Distribution Chart ──────────────────────────

function renderLearnerGradeDistribution(stats) {
  const gd = stats.gradeDistribution || [0, 0, 0, 0, 0];
  const total = gd.reduce((x, y) => x + y, 0);
  
  const bins = [
    { label: '90 - 100 (Outstanding)', count: gd[4], color: 'var(--color-success-500)' },
    { label: '85 - 89 (Very Satisfactory)', count: gd[3], color: 'var(--color-primary-500)' },
    { label: '80 - 84 (Satisfactory)', count: gd[2], color: 'var(--color-accent-500)' },
    { label: '75 - 79 (Fairly Satisfactory)', count: gd[1], color: 'var(--color-warning-500)' },
    { label: 'Below 75 (Did Not Meet Expectations)', count: gd[0], color: 'var(--color-error-500)' }
  ];

  const rows = bins.map(bin => {
    const pct = total > 0 ? Math.round((bin.count / total) * 100) : 0;
    return `
      <div style="margin-bottom:var(--space-2);">
        <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);margin-bottom:2px;">
          <span>${bin.label}</span>
          <span style="font-weight:600;">${bin.count} (${pct}%)</span>
        </div>
        <div style="height:8px;background:var(--bg-neutral);border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${bin.color};border-radius:4px;"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom:var(--space-4);padding:var(--space-4);">
      <h3 class="card-title" style="margin-top:0;margin-bottom:var(--space-3);">Grade Distribution</h3>
      ${rows}
    </div>
  `;
}

// ── Render: Assessment Analysis Table ────────────────────────

function renderAssessmentAnalysisTable(assessments) {
  if (!assessments.length) return '';

  const rows = assessments.map(ast => {
    return `
      <tr>
        <td style="padding:8px;font-weight:500;">${esc(ast.assessment.title)}</td>
        <td style="padding:8px;text-align:center;">${esc(ast.assessment.component)}</td>
        <td style="padding:8px;text-align:center;">${esc(ast.assessment.maxScore)}</td>
        <td style="padding:8px;text-align:center;">${ast.scores.length}</td>
        <td style="padding:8px;text-align:center;">${ast.mean ? ast.mean.toFixed(1) : '0.0'}</td>
        <td style="padding:8px;text-align:center;">${ast.median ? ast.median.toFixed(1) : '0.0'}</td>
        <td style="padding:8px;text-align:center;">${ast.mode !== null ? ast.mode : '—'}</td>
        <td style="padding:8px;text-align:center;">${ast.min} / ${ast.max}</td>
        <td style="padding:8px;text-align:center;font-weight:600;color:${ast.passRate >= 75 ? 'var(--color-success-600)' : 'var(--color-error-600)'};">${ast.passRate}%</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom:var(--space-4);padding:0;overflow-x:auto;">
      <div style="padding:var(--space-4) var(--space-4) 0;">
        <h3 class="card-title" style="margin-top:0;">Assessment Detailed Statistics</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
        <thead>
          <tr style="background:var(--bg-neutral);border-top:1px solid var(--border-default);border-bottom:1px solid var(--border-default);">
            <th style="padding:8px;text-align:left;">Assessment</th>
            <th style="padding:8px;text-align:center;">Type</th>
            <th style="padding:8px;text-align:center;">HPS</th>
            <th style="padding:8px;text-align:center;">Takers</th>
            <th style="padding:8px;text-align:center;">Mean</th>
            <th style="padding:8px;text-align:center;">Median</th>
            <th style="padding:8px;text-align:center;">Mode</th>
            <th style="padding:8px;text-align:center;">Min / Max</th>
            <th style="padding:8px;text-align:center;">Pass Rate</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// ── Render: Learner Performance Table ────────────────────────

function renderLearnerPerformanceTable(learners, assignment) {
  if (!learners.length) return '';

  const rows = learners.map((lr, idx) => {
    const rankDisplay = lr.rank === 1 ? '🥇 ' : lr.rank === 2 ? '🥈 ' : lr.rank === 3 ? '🥉 ' : '';
    const rowBg = lr.rank === 1 ? 'background:rgba(255,215,0,0.08);' : lr.rank === 2 ? 'background:rgba(192,192,192,0.08);' : lr.rank === 3 ? 'background:rgba(205,127,50,0.08);' : idx % 2 === 0 ? 'background:var(--bg-neutral);' : '';

    const gradeDisplay = lr.termGrade !== null && lr.termGrade !== undefined
      ? (typeof lr.termGrade === 'number' ? formatGradeForDisplay(lr.termGrade, assignment.policy) : lr.termGrade)
      : '—';

    const remarksClass = lr.remarks === 'Passed' ? 'badge--pass' : lr.remarks === 'Failed' ? 'badge--fail' : lr.remarks === 'For Intervention' ? 'badge--warn' : '';

    return `
      <tr style="${rowBg}">
        <td style="padding:6px 8px;text-align:center;font-weight:600;">${rankDisplay}${lr.rank}</td>
        <td style="padding:6px 8px;font-weight:500;">${esc(lr.learner.lastName + ', ' + lr.learner.firstName + (lr.learner.middleName ? ' ' + lr.learner.middleName : ''))}</td>
        <td style="padding:6px 8px;text-align:center;">${esc(lr.learner.sex)}</td>
        <td style="padding:6px 8px;text-align:center;">${lr.ww.hasData ? lr.ww.ps.toFixed(1) + '%' : '—'}</td>
        <td style="padding:6px 8px;text-align:center;">${lr.pt.hasData ? lr.pt.ps.toFixed(1) + '%' : '—'}</td>
        <td style="padding:6px 8px;text-align:center;">${lr.exam.ps ? lr.exam.ps.toFixed(1) + '%' : '—'}</td>
        <td style="padding:6px 8px;text-align:center;">${lr.initialGrade !== null ? lr.initialGrade.toFixed(1) : '—'}</td>
        <td style="padding:6px 8px;text-align:center;font-weight:600;">${gradeDisplay}</td>
        <td style="padding:6px 8px;text-align:center;"><span class="badge ${remarksClass}" style="font-size:10px;">${esc(lr.remarks)}</span></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom:var(--space-4);padding:0;overflow-x:auto;">
      <div style="padding:var(--space-4) var(--space-4) 0;">
        <h3 class="card-title" style="margin-top:0;">Learner Performance</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
        <thead>
          <tr style="background:var(--bg-neutral);border-top:1px solid var(--border-default);border-bottom:1px solid var(--border-default);">
            <th style="padding:8px;text-align:center;">Rank</th>
            <th style="padding:8px;text-align:left;">Learner</th>
            <th style="padding:8px;text-align:center;">Sex</th>
            <th style="padding:8px;text-align:center;">WW PS</th>
            <th style="padding:8px;text-align:center;">PT PS</th>
            <th style="padding:8px;text-align:center;">Exam PS</th>
            <th style="padding:8px;text-align:center;">IG</th>
            <th style="padding:8px;text-align:center;">TG</th>
            <th style="padding:8px;text-align:center;">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// ── Modal Actions ───────────────────────────────────────────

function showClassAnalysisModal(assignmentId, assignment) {
  const a = assignment || db.assignments.find(x => x.id === assignmentId);
  if (!a) {
    toast('Class not found.', 'warning');
    return;
  }

  classAnalysisAssignmentId = a.id;
  classAnalysisTerm = db.currentTerm || '1';

  renderClassAnalysisContent(a);

  const modal = document.getElementById('classAnalysisModal');
  if (modal) modal.style.display = 'flex';
}

function renderClassAnalysisContent(assignment) {
  const body = document.getElementById('classAnalysisBody');
  if (!body) return;
  const a = assignment || db.assignments.find(x => x.id === classAnalysisAssignmentId);
  if (!a) return;
  body.innerHTML = renderClassAnalysisModal(a, classAnalysisTerm);
}

function switchClassAnalysisTerm(term) {
  classAnalysisTerm = term;
  const a = db.assignments.find(x => x.id === classAnalysisAssignmentId);
  if (a) renderClassAnalysisContent(a);
}

function closeClassAnalysisModal() {
  const modal = document.getElementById('classAnalysisModal');
  if (modal) modal.style.display = 'none';
}