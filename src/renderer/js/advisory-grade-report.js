/** Print-preview, printing, and PDF export for the Advisory Learner Grade Record. */
(function initAdvisoryGradeReport(globalScope) {
  'use strict';

  const REPORT_ID = 'advisoryGradeReportPrint';
  const OPTIONS_ID = 'advisoryGradeReportOptionsModal';
  const PREVIEW_ID = 'advisoryGradeReportPreviewModal';
  const terms = ['1', '2', '3'];

  function activeDb() { return typeof globalScope.getActiveProfileDatabase === 'function' ? globalScope.getActiveProfileDatabase() : globalScope.db; }
  function esc(value) { return globalScope.esc ? globalScope.esc(value) : String(value ?? ''); }
  function text(value) { return String(value ?? '').trim(); }
  function modeLabel(mode) { return mode === 'terms' ? 'Terms 1–3 and Final Grades' : 'Final Grades Only'; }
  function remove(id) { document.getElementById(id)?.remove(); }

  function groupsOf(items, size) {
    return items.reduce((groups, item, index) => {
      if (index % size === 0) groups.push([]);
      groups[groups.length - 1].push(item);
      return groups;
    }, []);
  }

  function reportSubjects(subjects) {
    return globalScope.AdvisoryGradeTransfer.subjectGroupsForGradeRecord(subjects);
  }

  function learnerName(learner) {
    return globalScope.AdvisoryRoster?.displayName?.(learner) || [learner.lastName, learner.firstName, learner.middleName].filter(Boolean).join(', ');
  }

  function valueCell(value, displayValue = value) {
    return `<td class="${value === null || value === undefined ? 'is-missing' : 'has-grade'}">${value === null || value === undefined ? '&mdash;' : esc(displayValue)}</td>`;
  }

  function learnerColumnWidth(learners) {
    const longestName = learners.reduce((longest, learner) => Math.max(longest, learnerName(learner).length), 0);
    // Keep the identity column identical on every sheet.  The estimate matches the
    // compact report type while allowing an unusually long official name to fit.
    return Math.min(360, Math.max(190, Math.ceil(longestName * 7.2) + 32));
  }

  function groupTable(group, learners, grades, subjects, mode, includeAverage, learnerWidth) {
    const transfer = globalScope.AdvisoryGradeTransfer;
    const includeTerms = mode === 'terms';
    const subjectColumnCount = group.length * (includeTerms ? 4 : 1);
    const averageColumnCount = includeAverage ? (includeTerms ? 4 : 1) : 0;
    const reservedAverageWidth = includeAverage && !includeTerms ? 9 : 0;
    const fluidColumnCount = subjectColumnCount + (includeTerms ? averageColumnCount : 0);
    const subjectWidth = `calc((100% - ${learnerWidth}px - ${reservedAverageWidth}%) / ${Math.max(fluidColumnCount, 1)})`;
    const averageColumns = includeAverage
      ? Array.from({ length: averageColumnCount }, () => `<col class="advisory-report__average-column" style="width:${includeTerms ? subjectWidth : `${reservedAverageWidth}%`}">`).join('')
      : '';
    const columns = `<colgroup><col class="advisory-report__learner-column" style="width:${learnerWidth}px">${Array.from({ length: subjectColumnCount }, () => `<col class="advisory-report__subject-column" style="width:${subjectWidth}">`).join('')}${averageColumns}</colgroup>`;
    const top = group.map(subject => `<th colspan="${includeTerms ? 4 : 1}">${esc(transfer.subjectDisplayName(subject.subjectName))}</th>`).join('');
    const bottom = includeTerms ? `<tr>${group.map(() => '<th>T1</th><th>T2</th><th>T3</th><th>Final</th>').join('')}${includeAverage ? '<th>T1</th><th>T2</th><th>T3</th><th>Final</th>' : ''}</tr>` : '';
    const rows = learners.map(learner => {
      const gradesBySubject = group.map(subject => {
        const termCells = includeTerms ? terms.map(term => {
          const value = subject.derived
            ? transfer.calculateMapehTermAverage(grades, learner.id, subjects, term)
            : grades.find(item => item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === term)?.finalGrade ?? null;
          return valueCell(value);
        }).join('') : '';
        const final = subject.derived ? transfer.calculateMapehFinal(grades, learner.id, subjects) : transfer.calculateSubjectFinal(grades, learner.id, subject.id);
        return `${termCells}${valueCell(final)}`;
      }).join('');
      const generalAverage = transfer.calculateGeneralAverage(grades, learner.id, subjects);
      const averageCell = includeAverage
        ? `${includeTerms ? terms.map(term => { const value = transfer.calculateGeneralTermAverage(grades, learner.id, subjects, term); return valueCell(value, transfer.formatGeneralAverage(value)); }).join('') : ''}${valueCell(generalAverage, transfer.formatGeneralAverage(generalAverage))}`
        : '';
      return `<tr><td class="advisory-report__learner"><small>${esc(learner.lrn || 'No LRN')}</small><strong>${esc(learnerName(learner))}</strong></td>${gradesBySubject}${averageCell}</tr>`;
    }).join('') || `<tr><td colspan="${subjectColumnCount + averageColumnCount + 1}">No active learners are in this Advisory Class.</td></tr>`;
    const averageHeader = includeAverage ? `<th colspan="${averageColumnCount}" class="advisory-report__average">General Average</th>` : '';
    return `<table class="advisory-report__table">${columns}<thead><tr><th rowspan="${includeTerms ? 2 : 1}" class="advisory-report__learner">LRN / Official Name</th>${top}${averageHeader}</tr>${bottom}</thead><tbody>${rows}</tbody></table>`;
  }

  function buildReport(advisoryClass, mode) {
    const profile = activeDb();
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profile);
    const subjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id && !item.isArchived).sort((a, b) => a.displayOrder - b.displayOrder);
    const learners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id && item.enrollmentStatus !== 'inactive');
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    const fixedLearnerWidth = learnerColumnWidth(learners);
    // Final-only reports fit every subject on one landscape page; subject names wrap
    // within their equally sized columns. Detailed term reports remain grouped because
    // each subject expands to four columns.
    const displayedSubjects = reportSubjects(subjects);
    const groups = mode === 'terms' ? groupsOf(displayedSubjects, 3) : (displayedSubjects.length ? [displayedSubjects] : []);
    const meta = `School Year ${esc(advisoryClass.schoolYear || profile.schoolYear || '')} · Grade ${esc(advisoryClass.gradeLevel)} – ${esc(advisoryClass.section)} · Adviser: ${esc(advisoryClass.adviserName || profile.teacherName || 'Not provided')}`;
    const sheets = groups.length ? groups.map((group, index) => `<section class="advisory-report__sheet"><header class="advisory-report__header"><h1>Learner Grade Record</h1><p>${modeLabel(mode)}</p><p>${meta}</p>${index === 0 ? '<p class="advisory-report__privacy">Contains learner information and grades. Keep this report secure.</p>' : ''}</header>${groupTable(group, learners, grades, subjects, mode, index === groups.length - 1, fixedLearnerWidth)}<p class="advisory-report__group-note">Subject group ${index + 1} of ${groups.length}</p></section>`).join('') : `<section class="advisory-report__sheet"><header class="advisory-report__header"><h1>Learner Grade Record</h1><p>${modeLabel(mode)}</p><p>${meta}</p></header><p>No active subjects have been configured for this Advisory Class.</p></section>`;
    return { mode, title: `Advisory Learner Grade Record — ${modeLabel(mode)}`, html: `<div class="advisory-report">${sheets}</div>`, advisoryClass, profile, generatedAt: new Date().toLocaleString() };
  }

  function showOptions(advisoryClass, preferredAction = 'pdf') {
    remove(OPTIONS_ID);
    const modal = document.createElement('div');
    modal.id = OPTIONS_ID;
    modal.className = 'modal-overlay advisory-report-options-modal';
    modal.innerHTML = `<div class="modal modal--sm"><div class="modal__title">Prepare Learner Grade Record</div><div class="modal__body"><p class="u-mt-0">Choose the grade detail to review before ${preferredAction === 'print' ? 'printing' : 'saving a PDF'}.</p><label class="advisory-report-option"><input type="radio" name="advisoryReportMode" value="finals" checked><span><strong>Final Grades Only</strong><small>Subject finals, MAPEH Average, and General Average.</small></span></label><label class="advisory-report-option"><input type="radio" name="advisoryReportMode" value="terms"><span><strong>Include Terms 1–3</strong><small>Every term grade and final grade for each subject.</small></span></label></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" type="button" data-advisory-report-cancel>Cancel</button><button class="btn btn-primary btn-sm" type="button" data-advisory-report-preview>Preview Report</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-advisory-report-cancel]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-advisory-report-preview]').addEventListener('click', () => {
      const mode = modal.querySelector('input[name="advisoryReportMode"]:checked')?.value || 'finals';
      modal.remove(); showPreview(buildReport(advisoryClass, mode), preferredAction);
    });
  }

  function showPreview(report, preferredAction = 'pdf') {
    remove(PREVIEW_ID);
    const modal = document.createElement('div');
    modal.id = PREVIEW_ID;
    modal.className = 'modal-overlay advisory-report-preview-modal';
    modal.innerHTML = `<div class="modal advisory-report-preview-modal__dialog"><div class="modal__title">Print Preview <span>${esc(modeLabel(report.mode))}</span></div><div class="modal__body advisory-report-preview-modal__body">${report.html}</div><div class="modal__actions"><button class="btn btn-cancel btn-sm" type="button" data-advisory-report-back>Back</button><button class="btn btn-primary btn-sm" type="button" data-advisory-report-print><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>Print</button><button class="btn btn-olive btn-sm" type="button" data-advisory-report-pdf><svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>Download PDF</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-advisory-report-back]').addEventListener('click', () => { modal.remove(); showOptions(report.advisoryClass, preferredAction); });
    modal.querySelector('[data-advisory-report-print]').addEventListener('click', () => printReport(report));
    modal.querySelector('[data-advisory-report-pdf]').addEventListener('click', () => downloadPdf(report));
  }

  function mountPrintable(report) {
    remove(REPORT_ID);
    const printable = document.createElement('div');
    printable.id = REPORT_ID;
    printable.innerHTML = report.html;
    document.body.appendChild(printable);
    document.body.classList.add('advisory-report-print-mode');
    return () => { document.body.classList.remove('advisory-report-print-mode', 'advisory-report-pdf-mode'); printable.remove(); };
  }

  function filename(report) {
    const sanitize = globalScope.AdvisoryGradeTransfer?.sanitizeFilenamePart || (value => text(value).replace(/[^a-z0-9]+/gi, '-'));
    return `ECR_Advisory_Grade_Record_SY${sanitize(report.advisoryClass.schoolYear)}_Grade${sanitize(report.advisoryClass.gradeLevel)}-${sanitize(report.advisoryClass.section)}_${report.mode === 'terms' ? 'Terms-1-3-and-Finals' : 'Final-Grades-Only'}.pdf`;
  }

  function printReport(report) {
    const cleanup = mountPrintable(report);
    const restore = () => { cleanup(); window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore, { once: true });
    setTimeout(() => { window.print(); setTimeout(restore, 1000); }, 50);
  }

  async function downloadPdf(report) {
    if (!globalScope.electronAPI?.exportPdf) { globalScope.toast?.('PDF download is available in the desktop app.', 'warning'); return; }
    const cleanup = mountPrintable(report);
    document.body.classList.add('advisory-report-pdf-mode');
    globalScope.toast?.('Generating Advisory Grade Record PDF...', 'info');
    try {
      await new Promise(resolve => setTimeout(resolve, 60));
      const profile = report.profile;
      const requestedFilename = filename(report);
      const exportFilename = globalScope.AdminTestMode?.isActive()
        ? globalScope.AdminTestMode.markExportFilename(requestedFilename)
        : requestedFilename;
      const result = await globalScope.electronAPI.exportPdf({ size: 'A4', landscape: true, includeHeader: false, filename: exportFilename, isMockTestData: globalScope.AdminTestMode?.isActive() === true, metadata: { title: report.title, region: profile.region || profile.schoolRegion || '', division: profile.division || profile.schoolDivision || '', schoolName: profile.schoolName || '', schoolId: profile.schoolId || '', schoolYear: report.advisoryClass.schoolYear || profile.schoolYear || '', gradeLevel: report.advisoryClass.gradeLevel || '', section: report.advisoryClass.section || '', teacherName: report.advisoryClass.adviserName || profile.teacherName || '', timestamp: report.generatedAt } });
      if (result?.success) globalScope.toast?.('Advisory Grade Record PDF saved.', 'success');
      else if (result?.error) globalScope.toast?.(`PDF export failed: ${result.error}`, 'error');
    } catch (error) { globalScope.toast?.(`PDF export failed: ${error.message || error}`, 'error'); }
    finally { cleanup(); }
  }

  const api = { buildReport, showOptions, showPreview, printReport, downloadPdf };
  globalScope.AdvisoryGradeReport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
