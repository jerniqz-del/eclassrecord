/**
 * E-Class Record - Class Progress Reports
 *
 * Computes and renders class progress reports with assessment statistics,
 * total-score item analysis, visual charts, and printable/downloadable output.
 */

let classAnalysisAssignmentId = null;
let classAnalysisTerm = '1';
let classAnalysisMapePart = undefined;

function reportMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
}

function reportMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function reportMode(arr) {
  if (!arr.length) return null;
  const counts = {};
  arr.forEach(value => { counts[value] = (counts[value] || 0) + 1; });
  const max = Math.max(...Object.values(counts));
  if (max <= 1) return null;
  return Number(Object.keys(counts).find(key => counts[key] === max));
}

function reportStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = reportMean(arr);
  const variance = arr.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function reportPct(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : '--';
}

function reportNum(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function reportFullName(component) {
  return typeof componentFullName === 'function' ? componentFullName(component) : component;
}

function performanceBucket(percent) {
  if (percent >= 90) return 'advanced';
  if (percent >= 75) return 'proficient';
  if (percent >= 50) return 'developing';
  return 'beginning';
}

function masteryLabel(mps) {
  if (mps >= 85) return 'High mastery';
  if (mps >= 75) return 'Generally mastered';
  if (mps >= 50) return 'Needs reinforcement';
  return 'Difficult / reteaching needed';
}

function computeDiscrimination(scores, hps) {
  if (scores.length < 6 || hps <= 0) {
    return { label: 'Insufficient data', value: null, narrative: 'At least six scored learners are needed to compare upper and lower performance groups.' };
  }
  const sorted = [...scores].sort((a, b) => b - a);
  const groupSize = Math.max(1, Math.round(sorted.length * 0.27));
  const upper = sorted.slice(0, groupSize);
  const lower = sorted.slice(sorted.length - groupSize);
  const upperMps = reportMean(upper) / hps * 100;
  const lowerMps = reportMean(lower) / hps * 100;
  const gap = upperMps - lowerMps;

  let label = 'Weak separation';
  if (gap >= 30) label = 'Strong separation';
  else if (gap >= 15) label = 'Moderate separation';

  return {
    label,
    value: gap,
    narrative: `${label}: upper-group MPS is ${reportPct(upperMps)} and lower-group MPS is ${reportPct(lowerMps)}.`
  };
}

function computeClassAnalysis(a, term, mapePart) {
  const isSummary = term === 'summary';
  const isMapeh = typeof isMapehSubject === 'function' && isMapehSubject(a.subject);
  const activePart = mapePart || (isMapeh ? 'music_arts' : undefined);
  const assessmentItems = [];

  if (isSummary) {
    for (let t = 1; t <= 3; t++) {
      assessmentItems.push(...termAssessments(a, String(t), activePart));
    }
  } else {
    assessmentItems.push(...termAssessments(a, term, activePart));
  }

  const assessments = assessmentItems.map(assessment => {
    const hps = number(assessment.maxScore);
    const scores = [];
    a.learners.forEach(learner => {
      const value = parseFloat(a.scores[`${learner.id}|${assessment.id}`]);
      if (!isNaN(value)) scores.push(value);
    });

    const mean = reportMean(scores);
    const median = reportMedian(scores);
    const mode = reportMode(scores);
    const stdDev = reportStdDev(scores);
    const mps = hps > 0 ? mean / hps * 100 : 0;
    const distribution = [0, 0, 0, 0, 0];
    const performanceLevel = { advanced: 0, proficient: 0, developing: 0, beginning: 0 };

    scores.forEach(score => {
      const pct = hps > 0 ? score / hps * 100 : 0;
      const bin = Math.min(4, Math.floor(pct / 20));
      distribution[bin]++;
      performanceLevel[performanceBucket(pct)]++;
    });

    const discrimination = computeDiscrimination(scores, hps);
    const mastery = masteryLabel(mps);
    const variability = stdDev <= hps * 0.10 ? 'consistent' : (stdDev <= hps * 0.20 ? 'moderately varied' : 'highly varied');

    return {
      assessment,
      scores,
      hps,
      mean,
      median,
      mode,
      stdDev,
      mps,
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      passRate: scores.length ? scores.filter(score => hps > 0 && score >= hps * 0.75).length / scores.length * 100 : 0,
      performanceLevel,
      distribution,
      itemAnalysis: {
        mastery,
        variability,
        discrimination,
        narrative: `${assessment.title || reportFullName(assessment.component)} is ${mastery.toLowerCase()} with ${reportPct(mps)} MPS and ${variability} scores. ${discrimination.narrative}`
      }
    };
  });

  const learners = [];
  const termGrades = [];
  const isDescriptive = a.policy === 'DO15_DESCRIPTIVE';

  a.learners.forEach(learner => {
    if (typeof computeTerm !== 'function') return;
    let result;
    if (isSummary) {
      let total = 0;
      let count = 0;
      for (let t = 1; t <= 3; t++) {
        const termResult = computeTerm(a, learner.id, String(t), activePart);
        const grade = typeof termResult.termGrade === 'number'
          ? termResult.termGrade
          : (isDescriptive && termResult.hasData ? termResult.initialGrade : null);
        if (typeof grade === 'number') {
          total += grade;
          count++;
        }
      }
      const finalGrade = count ? Math.round(total / count) : null;
      result = { termGrade: finalGrade, initialGrade: finalGrade, ww: {}, pt: {}, examPS: 0, hasData: count > 0 };
    } else {
      result = computeTerm(a, learner.id, term, activePart);
    }

    const grade = typeof result.termGrade === 'number'
      ? result.termGrade
      : (isDescriptive && result.hasData ? result.initialGrade : null);
    if (typeof grade === 'number') termGrades.push(grade);

    learners.push({
      learner,
      termGrade: result.termGrade,
      initialGrade: typeof grade === 'number' ? grade : null,
      ww: result.ww || { ps: 0, hasData: false },
      pt: result.pt || { ps: 0, hasData: false },
      exam: { ps: result.examPS || 0 },
      remarks: result.termGrade === 'T/O'
        ? 'Transferred Out'
        : (grade === null ? '--' : (isPassing(grade) ? 'Passed' : (a.policy === 'DO15_DESCRIPTIVE' ? 'For Intervention' : 'Failed')))
    });
  });

  learners.sort((left, right) => (right.initialGrade || -1) - (left.initialGrade || -1));
  learners.forEach((learner, index) => { learner.rank = learner.initialGrade === null ? '' : index + 1; });

  const averageMps = assessments.length ? reportMean(assessments.map(item => item.mps)) : 0;
  const classStats = {
    mean: reportMean(termGrades),
    median: reportMedian(termGrades),
    mode: reportMode(termGrades),
    stdDev: reportStdDev(termGrades),
    mps: averageMps,
    passRate: termGrades.length ? termGrades.filter(grade => isPassing(grade)).length / termGrades.length * 100 : 0,
    distribution: { advanced: 0, proficient: 0, developing: 0, beginning: 0 },
    gradeDistribution: [0, 0, 0, 0, 0]
  };

  termGrades.forEach(grade => {
    classStats.distribution[performanceBucket(grade)]++;
    if (grade >= 90) classStats.gradeDistribution[4]++;
    else if (grade >= 85) classStats.gradeDistribution[3]++;
    else if (grade >= 80) classStats.gradeDistribution[2]++;
    else if (grade >= 75) classStats.gradeDistribution[1]++;
    else classStats.gradeDistribution[0]++;
  });

  return { assessments, learners, classStats, activePart };
}

function renderClassAnalysisModal(a, term, mapePart) {
  const analysis = computeClassAnalysis(a, term, mapePart);
  const termLabel = term === 'summary' ? 'Summary' : `Term ${term}`;
  const strandLabel = analysis.activePart === 'music_arts' ? 'Music & Arts' : (analysis.activePart === 'pe_health' ? 'PE & Health' : '');

  return `
    <div id="classReportPrintable" class="class-report">
      <div class="class-report-header">
        <div>
          <h2>Class Progress Report</h2>
          <p>Grade ${esc(a.gradeLevel)} - ${esc(a.section)} &middot; ${esc(a.subject)} &middot; SY ${esc(a.schoolYear)}${strandLabel ? ' &middot; ' + esc(strandLabel) : ''}</p>
        </div>
        <div class="record-tabs no-print-modal">
          <button class="record-tab ${term === '1' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('1')">Term 1</button>
          <button class="record-tab ${term === '2' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('2')">Term 2</button>
          <button class="record-tab ${term === '3' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('3')">Term 3</button>
          <button class="record-tab record-tab--summary ${term === 'summary' ? 'record-tab--active' : ''}" onclick="switchClassAnalysisTerm('summary')">Summary</button>
        </div>
      </div>

      ${analysis.learners.length === 0 ? `
        <div class="report-empty-state">
          <strong>No learner data available for ${esc(termLabel)}.</strong>
          <span>Add learners and enter scores to see class progress reports.</span>
        </div>
      ` : `
        ${renderReportSummary(analysis.classStats, analysis.learners.length)}
        ${renderMpsChart(analysis.assessments)}
        ${renderVariabilityChart(analysis.assessments)}
        ${renderPerformanceChart(analysis.assessments)}
        ${renderScoreDistributionChart(analysis.assessments)}
        ${renderAssessmentAnalysisTable(analysis.assessments)}
        ${renderLearnerPerformanceTable(analysis.learners, a)}
      `}
    </div>
  `;
}

function renderReportSummary(stats, learnerCount) {
  const narrative = `The class report covers ${learnerCount} learner${learnerCount === 1 ? '' : 's'}. Current class mean is ${reportNum(stats.mean)}, median is ${reportNum(stats.median)}, standard deviation is ${reportNum(stats.stdDev)}, and average assessment MPS is ${reportPct(stats.mps)}.`;
  return `
    <section class="report-section">
      <h3>Class Summary</h3>
      <div class="report-stat-grid">
        ${reportStat('Mean', reportNum(stats.mean))}
        ${reportStat('Median', reportNum(stats.median))}
        ${reportStat('Mode', stats.mode === null ? '--' : stats.mode)}
        ${reportStat('Standard Deviation', reportNum(stats.stdDev))}
        ${reportStat('MPS', reportPct(stats.mps))}
        ${reportStat('Pass Rate', reportPct(stats.passRate))}
      </div>
      <p class="report-narrative">${esc(narrative)}</p>
    </section>
  `;
}

function reportStat(label, value) {
  return `<div class="report-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function renderMpsChart(assessments) {
  const bars = assessments.map(item => reportBar(item.assessment.title || reportFullName(item.assessment.component), item.mps, masteryLabel(item.mps))).join('');
  const weak = assessments.filter(item => item.mps < 75).length;
  return `
    <section class="report-section">
      <h3>Assessment MPS</h3>
      <div class="report-bars">${bars || '<div class="text-muted">No assessment scores available.</div>'}</div>
      <p class="report-narrative">${weak ? `${weak} assessment${weak === 1 ? '' : 's'} need reinforcement based on MPS below 75%.` : 'All scored assessments are generally mastered or better based on MPS.'}</p>
    </section>
  `;
}

function renderVariabilityChart(assessments) {
  const maxStd = Math.max(...assessments.map(item => item.stdDev), 1);
  const bars = assessments.map(item => {
    const pct = item.stdDev / maxStd * 100;
    return reportBar(item.assessment.title || reportFullName(item.assessment.component), pct, `SD ${reportNum(item.stdDev)}`, reportNum(item.stdDev));
  }).join('');
  return `
    <section class="report-section">
      <h3>Assessment Variability</h3>
      <div class="report-bars">${bars || '<div class="text-muted">No variability data available.</div>'}</div>
      <p class="report-narrative">Higher standard deviation means learner scores are more spread out and may need targeted remediation groups.</p>
    </section>
  `;
}

function reportBar(label, pct, caption, valueLabel) {
  const width = Math.max(2, Math.min(100, pct || 0));
  return `
    <div class="report-bar-row">
      <span>${esc(label)}</span>
      <div class="report-bar-track"><div class="report-bar-fill" style="width:${width}%"></div></div>
      <strong>${esc(valueLabel || reportPct(pct))}</strong>
      <em>${esc(caption || '')}</em>
    </div>
  `;
}

function renderPerformanceChart(assessments) {
  const rows = assessments.map(item => {
    const total = item.scores.length || 0;
    const level = item.performanceLevel;
    const segment = key => total ? Math.round(level[key] / total * 100) : 0;
    return `
      <div class="report-performance-row">
        <span>${esc(item.assessment.title || reportFullName(item.assessment.component))}</span>
        <div class="report-stack">
          ${stackSegment('advanced', segment('advanced'), level.advanced)}
          ${stackSegment('proficient', segment('proficient'), level.proficient)}
          ${stackSegment('developing', segment('developing'), level.developing)}
          ${stackSegment('beginning', segment('beginning'), level.beginning)}
        </div>
      </div>
    `;
  }).join('');
  return `
    <section class="report-section">
      <h3>Performance Levels by Assessment</h3>
      <div class="report-performance">${rows || '<div class="text-muted">No performance data available.</div>'}</div>
      <p class="report-narrative">Performance levels are based on each learner score as a percentage of the assessment HPS.</p>
    </section>
  `;
}

function stackSegment(key, width, count) {
  if (!width) return '';
  return `<div class="report-stack-segment report-stack-${key}" style="width:${width}%" title="${key}: ${count}">${count > 0 ? count : ''}</div>`;
}

function reportTableHeader(label, tooltip) {
  return `<th title="${esc(tooltip || label)}">${esc(label)}</th>`;
}

function renderScoreDistributionChart(assessments) {
  const labels = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'];
  const rows = assessments.map(item => `
    <div class="report-histogram-row">
      <span>${esc(item.assessment.title || reportFullName(item.assessment.component))}</span>
      <div class="report-histogram-bars">
        ${item.distribution.map((count, idx) => {
          const max = Math.max(...item.distribution, 1);
          return `<div class="report-histogram-bin" title="${labels[idx]}: ${count}"><i style="height:${Math.max(4, count / max * 70)}px"></i><small>${esc(labels[idx])}</small><b>${count}</b></div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
  return `
    <section class="report-section">
      <h3>Score Distribution</h3>
      ${rows || '<div class="text-muted">No score distribution data available.</div>'}
      <p class="report-narrative">Histograms show how learner scores cluster across percentage ranges for each assessment.</p>
    </section>
  `;
}

function renderAssessmentAnalysisTable(assessments) {
  const rows = assessments.map(item => `
    <tr>
      <td>${esc(item.assessment.title || reportFullName(item.assessment.component))}</td>
      <td>${esc(reportFullName(item.assessment.component))}</td>
      <td>${esc(item.hps || '--')}</td>
      <td>${item.scores.length}</td>
      <td>${reportNum(item.mean)}</td>
      <td>${reportNum(item.median)}</td>
      <td>${item.mode === null ? '--' : esc(item.mode)}</td>
      <td>${reportNum(item.stdDev)}</td>
      <td>${reportPct(item.mps)}</td>
      <td>${esc(item.itemAnalysis.mastery)}</td>
      <td>${esc(item.itemAnalysis.discrimination.label)}</td>
    </tr>
    <tr class="report-table-narrative"><td colspan="11">${esc(item.itemAnalysis.narrative)}</td></tr>
  `).join('');

  return `
    <section class="report-section">
      <h3 title="Item Analysis and Assessment Details">Item Analysis and Assessment Details</h3>
      <div class="report-table-wrap">
        <table class="report-table report-table--analysis">
          <thead>
            <tr>
              ${reportTableHeader('Assessment', 'Assessment title or generated assessment label')}
              ${reportTableHeader('Component', 'Grading component for the assessment')}
              ${reportTableHeader('HPS', 'Highest possible score')}
              ${reportTableHeader('Takers', 'Number of learners with scores')}
              ${reportTableHeader('Mean', 'Average raw score')}
              ${reportTableHeader('Median', 'Middle raw score')}
              ${reportTableHeader('Mode', 'Most common raw score')}
              ${reportTableHeader('SD', 'Standard deviation of raw scores')}
              ${reportTableHeader('MPS', 'Mean percentage score')}
              ${reportTableHeader('Interpretation', 'Mastery interpretation based on MPS')}
              ${reportTableHeader('Discrimination', 'Upper and lower group separation')}
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="11">No assessment data available.</td></tr>'}</tbody>
        </table>
      </div>
      <p class="report-narrative">Item analysis uses total scores per assessment. For true per-item difficulty, item-level learner responses would need a separate data entry model.</p>
    </section>
  `;
}

function renderLearnerPerformanceTable(learners, assignment) {
  const rows = learners.map(item => `
    <tr>
      <td>${esc(item.rank)}</td>
      <td>${esc(learnerDisplayName(item.learner))}</td>
      <td>${esc(item.learner.sex)}</td>
      <td>${item.ww.hasData ? reportPct(item.ww.ps) : '--'}</td>
      <td>${item.pt.hasData ? reportPct(item.pt.ps) : '--'}</td>
      <td>${item.exam.ps ? reportPct(item.exam.ps) : '--'}</td>
      <td>${item.initialGrade === null ? '--' : reportNum(item.initialGrade)}</td>
      <td>${item.termGrade === null ? '--' : esc(formatGradeForDisplay(item.termGrade, assignment.policy))}</td>
      <td>${esc(item.remarks)}</td>
    </tr>
  `).join('');
  return `
    <section class="report-section">
      <h3 title="Learner Progress">Learner Progress</h3>
      <div class="report-table-wrap">
        <table class="report-table report-table--learner">
          <thead><tr>
            ${reportTableHeader('Rank', 'Learner rank for the selected report period')}
            ${reportTableHeader('Learner', 'Learner full name')}
            ${reportTableHeader('Sex', 'Learner sex')}
            ${reportTableHeader('Written Works Percentage Score', 'Written Works percentage score')}
            ${reportTableHeader('Performance Task Percentage Score', 'Performance Task percentage score')}
            ${reportTableHeader('Term Examination Percentage Score', 'Term Examination percentage score')}
            ${reportTableHeader('Initial Grade', 'Computed initial grade before transmutation or policy display')}
            ${reportTableHeader('Term Grade', 'Displayed term grade')}
            ${reportTableHeader('Remarks', 'Learner status or performance remark')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function showClassAnalysisModal(assignmentId, assignment, term, mapePart) {
  const a = assignment || db.assignments.find(item => item.id === assignmentId);
  if (!a) {
    toast('Class not found.', 'warning');
    return;
  }

  classAnalysisAssignmentId = a.id;
  classAnalysisTerm = term || db.currentTerm || '1';
  classAnalysisMapePart = mapePart;
  renderClassAnalysisContent(a);
  showEl('classAnalysisModal', true, 'flex');
}

function renderClassAnalysisContent(assignment) {
  const body = document.getElementById('classAnalysisBody');
  const a = assignment || db.assignments.find(item => item.id === classAnalysisAssignmentId);
  if (!body || !a) return;
  body.innerHTML = renderClassAnalysisModal(a, classAnalysisTerm, classAnalysisMapePart);
}

function switchClassAnalysisTerm(term) {
  classAnalysisTerm = term;
  renderClassAnalysisContent();
}

function closeClassAnalysisModal() {
  showEl('classAnalysisModal', false);
}

function reportFilename(a) {
  const safe = value => String(value || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const term = classAnalysisTerm === 'summary' ? 'Summary' : `Term-${classAnalysisTerm}`;
  return `Class-Progress-Report-Grade-${safe(a.gradeLevel)}-${safe(a.section)}-${safe(a.subject)}-${term}.pdf`;
}

function setReportPrintMode(enabled) {
  document.body.classList.toggle('report-print-mode', !!enabled);
}

function printClassReport() {
  setReportPrintMode(true);
  setTimeout(() => {
    window.print();
    setTimeout(() => setReportPrintMode(false), 500);
  }, 50);
}

async function downloadClassReportPdf() {
  const a = db.assignments.find(item => item.id === classAnalysisAssignmentId);
  if (!a || !window.electronAPI || !window.electronAPI.exportPdf) return;
  setReportPrintMode(true);
  await new Promise(resolve => setTimeout(resolve, 80));
  const filename = reportFilename(a);
  try {
    const result = await window.electronAPI.exportPdf({
      size: 'A4',
      landscape: false,
      filename,
      metadata: {
        title: 'Class Progress Report',
        region: db.region || db.schoolRegion || '',
        division: db.division || db.schoolDivision || '',
        schoolName: db.schoolName || '',
        schoolId: db.schoolId || '',
        schoolYear: a.schoolYear || db.schoolYear || '',
        gradeLevel: a.gradeLevel || '',
        section: a.section || '',
        subject: a.subject || '',
        teacherName: db.teacherName || '',
        timestamp: new Date().toLocaleString()
      }
    });
    if (result && result.success) toast('Class progress report downloaded.', 'success');
    else if (result && result.error) toast('Report download failed: ' + result.error, 'error');
  } finally {
    setReportPrintMode(false);
  }
}
