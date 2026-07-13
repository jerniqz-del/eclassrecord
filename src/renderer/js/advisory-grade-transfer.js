/**
 * Offline, versioned Grade Transfer File export/import workflow.
 */
(function initAdvisoryGradeTransfer(globalScope) {
  'use strict';

  const FORMAT = 'eclass-record-grade-export';
  const SCHEMA_VERSION = '1.0';

  function text(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function createId(prefix) {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function') return `${prefix}-${globalScope.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function normalizeSubjectKey(value) {
    return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
  }

  function sanitizeFilenamePart(value) {
    return text(value)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.\- ]+|[.\- ]+$/g, '')
      .slice(0, 80) || 'Unknown';
  }

  function gradeTransferFilename(payload) {
    const classLabel = `Grade${payload.class.gradeLevel}-${payload.class.section}`;
    return [
      'ECR_Grades',
      `SY${sanitizeFilenamePart(payload.schoolYear)}`,
      sanitizeFilenamePart(classLabel),
      sanitizeFilenamePart(payload.subject.name),
      `Term${payload.term.number}`
    ].join('_') + '.json';
  }

  function officialFullName(learner) {
    const lastName = text(learner.lastName);
    const given = [text(learner.firstName), text(learner.middleName), text(learner.extensionName)].filter(Boolean).join(' ');
    return lastName && given ? `${lastName}, ${given}` : (lastName || given);
  }

  function buildExportPayload(options) {
    const assignment = options.assignment;
    const profileDb = options.profileDb || {};
    const termNumber = Number(options.term);
    if (!assignment || !assignment.id) throw new Error('A subject class is required.');
    if (![1, 2, 3].includes(termNumber)) throw new Error('Select a valid term.');
    if (typeof options.getFinalGrade !== 'function') throw new Error('The final-grade reader is unavailable.');
    const learners = (assignment.learners || []).map(learner => {
      const grade = options.getFinalGrade(assignment, learner.id, String(termNumber));
      if (grade === null || grade === undefined || grade === '' || grade === 'T/O' || !Number.isFinite(Number(grade))) return null;
      return {
        learnerId: text(learner.id),
        lrn: text(learner.lrn),
        lastName: text(learner.lastName),
        firstName: text(learner.firstName),
        middleName: text(learner.middleName),
        extensionName: text(learner.extensionName),
        fullName: officialFullName(learner),
        finalGrade: Number(grade),
        gradeStatus: 'final',
        remarks: text(learner.gradeRemarks?.[String(termNumber)] || '')
      };
    }).filter(Boolean);
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: text(options.appVersion) || 'unknown',
      exportId: text(options.exportId) || createId('grade-export'),
      exportedAt: text(options.exportedAt) || new Date().toISOString(),
      schoolYear: text(assignment.schoolYear || profileDb.schoolYear),
      school: {
        name: text(profileDb.schoolName),
        schoolId: text(profileDb.schoolId),
        district: text(profileDb.district),
        division: text(profileDb.division),
        region: text(profileDb.region)
      },
      teacher: { name: text(profileDb.teacherName) },
      class: {
        id: text(assignment.id),
        name: text(assignment.name) || `${assignment.subject} ${assignment.gradeLevel} - ${assignment.section}`,
        gradeLevel: text(assignment.gradeLevel),
        section: text(assignment.section)
      },
      subject: {
        id: text(assignment.subjectId) || normalizeSubjectKey(assignment.subject).toLowerCase().replace(/\s+/g, '-'),
        name: text(assignment.subject),
        normalizedKey: normalizeSubjectKey(assignment.subject)
      },
      term: { number: termNumber, label: `Term ${termNumber}` },
      learners
    };
  }

  function validatePayload(payload) {
    const errors = [];
    const warnings = [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { isValid: false, errors: ['This file is not a valid E-Class Record Grade Transfer File.'], warnings };
    if (payload.format !== FORMAT) errors.push('This file is not a valid E-Class Record Grade Transfer File.');
    if (text(payload.schemaVersion) !== SCHEMA_VERSION) errors.push('The selected file uses an unsupported schema version.');
    if (!text(payload.exportId)) errors.push('The Grade Transfer File is missing its export ID.');
    if (!text(payload.schoolYear)) errors.push('The Grade Transfer File is missing its school year.');
    if (!payload.class || !text(payload.class.gradeLevel) || !text(payload.class.section)) errors.push('The Grade Transfer File is missing class grade-level or section information.');
    if (!payload.subject || !text(payload.subject.name) || !normalizeSubjectKey(payload.subject.normalizedKey || payload.subject.name)) errors.push('The Grade Transfer File is missing subject information.');
    const term = Number(payload.term?.number);
    if (![1, 2, 3].includes(term)) errors.push('The Grade Transfer File is missing a supported term.');
    if (!Array.isArray(payload.learners)) errors.push('The Grade Transfer File is missing learner grades.');
    else if (!payload.learners.length) errors.push('No valid learner grades were found in this file.');

    const seenLrns = new Set();
    (Array.isArray(payload.learners) ? payload.learners : []).forEach((learner, index) => {
      const label = `Learner row ${index + 1}`;
      const lrn = text(learner?.lrn);
      if (lrn && !/^\d{12}$/.test(lrn)) errors.push(`${label} has an invalid LRN.`);
      if (lrn && seenLrns.has(lrn)) errors.push(`Two learner records use the same LRN (${lrn}).`);
      if (lrn) seenLrns.add(lrn);
      if (!text(learner?.lastName) || !text(learner?.firstName)) errors.push(`${label} is missing the learner's official name.`);
      const grade = Number(learner?.finalGrade);
      if (!Number.isFinite(grade) || grade < 60 || grade > 100) errors.push(`${label} contains an invalid final grade.`);
      if (text(learner?.gradeStatus) && text(learner.gradeStatus) !== 'final') warnings.push(`${label} is not marked final.`);
    });
    return { isValid: errors.length === 0, errors, warnings };
  }

  function contextValidation(payload, advisoryClass) {
    const errors = [];
    if (text(payload.schoolYear) !== text(advisoryClass.schoolYear)) errors.push(`The selected file is for School Year ${text(payload.schoolYear)}, but the active Advisory Class is for School Year ${text(advisoryClass.schoolYear)}.`);
    if (text(payload.class?.gradeLevel) !== text(advisoryClass.gradeLevel)) errors.push('The selected file grade level does not match the active Advisory Class.');
    if (globalScope.AdvisoryRoster.normalizeMatchText(payload.class?.section) !== globalScope.AdvisoryRoster.normalizeMatchText(advisoryClass.section)) errors.push('The selected file section does not match the active Advisory Class.');
    return errors;
  }

  function matchLearner(store, advisoryClassId, incoming) {
    const roster = store.learners.filter(item => item.advisoryClassId === advisoryClassId && item.enrollmentStatus !== 'inactive');
    const lrn = text(incoming.lrn);
    if (lrn) {
      const matches = roster.filter(item => item.lrn === lrn);
      if (matches.length === 1) return { status: 'matched-lrn', learner: matches[0], warning: '' };
      if (matches.length > 1) return { status: 'ambiguous', learner: null, warning: 'More than one Advisory learner uses this LRN.' };
    }
    const incomingKey = globalScope.AdvisoryRoster.nameKey(incoming);
    const nameMatches = roster.filter(item => globalScope.AdvisoryRoster.nameKey(item) === incomingKey);
    if (nameMatches.length === 1) return { status: 'matched-name', learner: nameMatches[0], warning: 'Matched by normalized official name. Review this fallback match.' };
    if (nameMatches.length > 1) return { status: 'ambiguous', learner: null, warning: 'This official name matches more than one Advisory learner.' };
    return { status: 'unmatched', learner: null, warning: 'This learner could not be matched safely.' };
  }

  function planImport(profileDb, advisoryClass, payload, filename) {
    const validation = validatePayload(payload);
    const errors = [...validation.errors, ...(validation.errors.length ? [] : contextValidation(payload, advisoryClass))];
    const warnings = [...validation.warnings];
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const subjectKey = normalizeSubjectKey(payload?.subject?.normalizedKey || payload?.subject?.name);
    const subject = store.subjects.find(item => item.advisoryClassId === advisoryClass.id && item.normalizedSubjectKey === subjectKey) || null;
    const term = text(payload?.term?.number);
    const rows = validation.errors.length ? [] : payload.learners.map((incoming, index) => {
      const match = matchLearner(store, advisoryClass.id, incoming);
      const existingGrade = match.learner && subject
        ? store.grades.find(item => item.advisoryClassId === advisoryClass.id && item.advisoryLearnerId === match.learner.id && item.advisorySubjectId === subject.id && item.term === term)
        : null;
      let status = match.status;
      let warning = match.warning;
      if (existingGrade) {
        status = 'existing-grade';
        warning = 'A grade already exists. It will not be overwritten without conflict resolution.';
      }
      return { index, incoming, matchedLearner: match.learner, status, warning, existingGrade, accepted: ['matched-lrn', 'matched-name'].includes(status) };
    });
    const importableCount = rows.filter(row => row.accepted).length;
    const unmatchedCount = rows.filter(row => ['unmatched', 'ambiguous'].includes(row.status)).length;
    if (unmatchedCount) warnings.push(`${unmatchedCount} learner${unmatchedCount === 1 ? '' : 's'} could not be matched safely and will remain unresolved.`);
    return {
      payload,
      filename: text(filename) || 'Grade-Transfer-File.json',
      advisoryClass,
      subject,
      proposedSubject: subject ? null : { subjectName: text(payload?.subject?.name), normalizedSubjectKey: subjectKey },
      rows,
      errors,
      warnings,
      importableCount,
      unmatchedCount,
      conflictCount: rows.filter(row => row.status === 'existing-grade').length,
      canImport: errors.length === 0 && importableCount > 0
    };
  }

  function applyImportPlan(profileDb, plan) {
    if (!plan?.canImport) throw new Error('This import plan is not ready for confirmation.');
    const snapshot = JSON.parse(JSON.stringify(profileDb.advisory));
    try {
      let subject = plan.subject;
      if (!subject) {
        subject = globalScope.AdvisoryData.createSubject(profileDb, {
          advisoryClassId: plan.advisoryClass.id,
          subjectName: plan.proposedSubject.subjectName,
          normalizedSubjectKey: plan.proposedSubject.normalizedSubjectKey,
          expectedSourceTeacher: text(plan.payload.teacher?.name),
          expectedSourceClass: text(plan.payload.class?.name),
          expectedGradeLevel: text(plan.payload.class?.gradeLevel),
          expectedSection: text(plan.payload.class?.section),
          expectedSchoolYear: text(plan.payload.schoolYear),
          expectedTerm: text(plan.payload.term?.number),
          sourceType: 'grade-transfer-file',
          displayOrder: globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).subjects.filter(item => item.advisoryClassId === plan.advisoryClass.id).length
        });
      }
      const acceptedRows = plan.rows.filter(row => row.accepted);
      const batch = globalScope.AdvisoryData.createImportBatch(profileDb, {
        advisoryClassId: plan.advisoryClass.id,
        exportId: text(plan.payload.exportId),
        filename: plan.filename,
        schemaVersion: text(plan.payload.schemaVersion),
        schoolYear: text(plan.payload.schoolYear),
        subject: text(plan.payload.subject?.name),
        term: text(plan.payload.term?.number),
        sourceTeacher: text(plan.payload.teacher?.name),
        sourceClass: text(plan.payload.class?.name),
        exportedAt: text(plan.payload.exportedAt),
        importedAt: new Date().toISOString(),
        totalRecords: plan.rows.length,
        importedCount: acceptedRows.length,
        skippedCount: plan.rows.length - acceptedRows.length,
        unmatchedCount: plan.unmatchedCount,
        invalidCount: 0,
        conflictCount: plan.conflictCount,
        status: acceptedRows.length === plan.rows.length ? 'complete' : 'partial',
        unmatchedRecords: plan.rows.filter(row => ['unmatched', 'ambiguous'].includes(row.status)).map(row => row.incoming)
      });
      acceptedRows.forEach(row => {
        globalScope.AdvisoryData.createGrade(profileDb, {
          advisoryClassId: plan.advisoryClass.id,
          advisoryLearnerId: row.matchedLearner.id,
          advisorySubjectId: subject.id,
          schoolYear: text(plan.payload.schoolYear),
          learnerLrn: text(row.incoming.lrn || row.matchedLearner.lrn),
          subjectName: text(plan.payload.subject.name),
          normalizedSubjectKey: subject.normalizedSubjectKey,
          gradeLevel: text(plan.payload.class.gradeLevel),
          section: text(plan.payload.class.section),
          term: text(plan.payload.term.number),
          finalGrade: Number(row.incoming.finalGrade),
          gradeStatus: 'final',
          sourceType: 'grade-transfer-file',
          sourceClassId: text(plan.payload.class.id),
          sourceClassName: text(plan.payload.class.name),
          sourceTeacherName: text(plan.payload.teacher?.name),
          exportId: text(plan.payload.exportId),
          importBatchId: batch.id,
          exportedAt: text(plan.payload.exportedAt),
          importedAt: batch.importedAt,
          validationStatus: 'valid',
          conflictStatus: 'none',
          remarks: text(row.incoming.remarks)
        });
      });
      const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
      if (!store.sourceMappings.some(item => item.advisoryClassId === plan.advisoryClass.id && item.importedNormalizedKey === subject.normalizedSubjectKey)) {
        globalScope.AdvisoryData.createSourceMapping(profileDb, {
          advisoryClassId: plan.advisoryClass.id,
          importedSubjectName: text(plan.payload.subject.name),
          importedNormalizedKey: subject.normalizedSubjectKey,
          advisorySubjectId: subject.id,
          sourceTeacher: text(plan.payload.teacher?.name),
          sourceClass: text(plan.payload.class?.name),
          schoolYear: text(plan.payload.schoolYear)
        });
      }
      return { batch, subject, importedCount: acceptedRows.length };
    } catch (error) {
      profileDb.advisory = snapshot;
      throw error;
    }
  }

  async function exportAssignment(assignmentId, term) {
    const assignment = (globalScope.db.assignments || []).find(item => item.id === assignmentId);
    if (!assignment) throw new Error('The selected subject class was not found.');
    const appVersion = await globalScope.electronAPI.getVersion();
    const payload = buildExportPayload({
      assignment,
      profileDb: globalScope.db,
      term,
      appVersion,
      getFinalGrade: globalScope.getLearnerTermGradeForExport
    });
    if (!payload.learners.length) throw new Error('No saved final grades were found for the selected term.');
    const result = await globalScope.electronAPI.exportGradeTransfer(JSON.stringify(payload, null, 2), gradeTransferFilename(payload));
    return { payload, result };
  }

  function showExportModal(assignmentId) {
    const assignment = (globalScope.db.assignments || []).find(item => item.id === assignmentId);
    if (!assignment) { globalScope.toast('The selected subject class was not found.', 'error'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal"><div class="modal__title">Export Final Grades</div><div class="modal__body"><div class="advisory-transfer-summary"><strong>Grade ${globalScope.esc(assignment.gradeLevel)} - ${globalScope.esc(assignment.section)}</strong><span>${globalScope.esc(assignment.subject)} · SY ${globalScope.esc(assignment.schoolYear || globalScope.db.schoolYear)}</span></div><div class="field"><label class="field-label">Term</label><select class="field-select" data-export-term><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div><label class="advisory-privacy-notice"><input type="checkbox" data-privacy-confirm><span><strong>Privacy reminder</strong>This Grade Transfer File contains learner names, LRNs, and final grades. Store and share it securely.</span></label></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-export disabled>Continue &amp; Save File</button></div></div>`;
    document.body.appendChild(overlay);
    const privacy = overlay.querySelector('[data-privacy-confirm]');
    const exportButton = overlay.querySelector('[data-export]');
    privacy.addEventListener('change', () => { exportButton.disabled = !privacy.checked; });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      try {
        const { result } = await exportAssignment(assignmentId, overlay.querySelector('[data-export-term]').value);
        if (result?.success) { overlay.remove(); globalScope.toast('Grade Transfer File saved successfully.', 'success'); }
      } catch (error) {
        console.error('Grade export failed:', error);
        globalScope.toast(error.message || 'Grade Transfer File could not be created.', 'error');
      } finally { if (overlay.isConnected) exportButton.disabled = !privacy.checked; }
    });
  }

  async function selectImportFile() {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) { globalScope.showAdvisoryClassSetupModal(); return; }
    try {
      const result = await globalScope.electronAPI.importGradeTransfer();
      if (!result?.success || !result.content) return;
      let payload;
      try { payload = JSON.parse(result.content); }
      catch (_error) { globalScope.toast('This file is not valid JSON.', 'error'); return; }
      showImportPreview(planImport(globalScope.db, advisoryClass, payload, result.name));
    } catch (error) {
      console.error('Grade import selection failed:', error);
      globalScope.toast(error.message || 'The Grade Transfer File could not be opened.', 'error');
    }
  }

  function showImportPreview(plan) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    const statusLabel = { 'matched-lrn': 'Matched by LRN', 'matched-name': 'Matched by name', unmatched: 'Unmatched', ambiguous: 'Ambiguous', 'existing-grade': 'Existing grade conflict' };
    overlay.innerHTML = `<div class="modal advisory-preview-modal"><div class="modal__title">Review Grade Import</div><div class="modal__body advisory-scroll-body"><div class="advisory-transfer-summary"><strong>${globalScope.esc(plan.payload?.subject?.name || 'Unknown subject')} · Term ${globalScope.esc(plan.payload?.term?.number || '—')}</strong><span>${globalScope.esc(plan.payload?.class?.name || '')} · SY ${globalScope.esc(plan.payload?.schoolYear || '')} · ${globalScope.esc(plan.filename)}</span></div>${plan.errors.length ? `<div class="advisory-import-messages advisory-import-messages--error">${plan.errors.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}${plan.warnings.length ? `<div class="advisory-import-messages advisory-import-messages--warning">${plan.warnings.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}<div class="advisory-import-summary"><span><strong>${plan.importableCount}</strong> ready</span><span><strong>${plan.unmatchedCount}</strong> unmatched</span><span><strong>${plan.conflictCount}</strong> conflicts</span></div><div class="advisory-preview-list">${plan.rows.map(row => `<div class="advisory-preview-row advisory-preview-row--${row.status}"><span><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(row.incoming))} · ${globalScope.esc(row.incoming.finalGrade)}</strong><small>${globalScope.esc(row.incoming.lrn || 'No LRN')} · ${globalScope.esc(statusLabel[row.status] || row.status)}${row.warning ? ` · ${globalScope.esc(row.warning)}` : ''}</small></span></div>`).join('')}</div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-confirm ${plan.canImport ? '' : 'disabled'}>Confirm Import</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-confirm]').addEventListener('click', async () => {
      try {
        const result = applyImportPlan(globalScope.db, plan);
        await globalScope.saveDatabase();
        overlay.remove();
        if (globalScope.AdvisoryRoster.renderWorkspace) globalScope.AdvisoryRoster.renderWorkspace();
        globalScope.renderDashboardOverview();
        globalScope.toast(`Imported ${result.importedCount} final grade${result.importedCount === 1 ? '' : 's'}.`, 'success');
      } catch (error) {
        console.error('Grade import failed:', error);
        globalScope.toast('The import could not be completed. Previous data was restored.', 'error');
      }
    });
  }

  function renderWorkspacePanel(workspace, advisoryClass) {
    const panel = workspace?.querySelector('[data-advisory-grade-panel]');
    if (!panel) return;
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(globalScope.db);
    const subjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => a.displayOrder - b.displayOrder);
    const learners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id && item.enrollmentStatus !== 'inactive');
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    panel.innerHTML = `<div class="advisory-grade-panel__header"><div><h3>Grade Consolidation</h3><p>Final grades by learner, subject, and term. Missing records remain visible.</p></div><button class="btn btn-primary btn-sm" type="button" data-import-subject-grades>Import Subject Grades</button></div>${subjects.length ? `<div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table advisory-grade-matrix"><thead><tr><th>Learner</th>${subjects.map(subject => `<th colspan="3">${globalScope.esc(subject.subjectName)}</th>`).join('')}</tr><tr><th>LRN / Official Name</th>${subjects.map(() => '<th>T1</th><th>T2</th><th>T3</th>').join('')}</tr></thead><tbody>${learners.map(learner => `<tr><td><small>${globalScope.esc(learner.lrn || 'No LRN')}</small><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td>${subjects.map(subject => ['1','2','3'].map(term => { const grade = grades.find(item => item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === term); return `<td class="${grade ? 'has-grade' : 'is-missing'}" title="${grade ? globalScope.esc(grade.sourceClassName || grade.sourceType) : 'Missing grade'}">${grade ? globalScope.esc(grade.finalGrade) : '—'}</td>`; }).join('')).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="advisory-roster__empty">No subjects have been configured. Import the first Grade Transfer File to create its subject and grade columns.</div>'}`;
    panel.querySelector('[data-import-subject-grades]').addEventListener('click', selectImportFile);
  }

  const api = {
    FORMAT,
    SCHEMA_VERSION,
    normalizeSubjectKey,
    sanitizeFilenamePart,
    gradeTransferFilename,
    buildExportPayload,
    validatePayload,
    contextValidation,
    matchLearner,
    planImport,
    applyImportPlan,
    showExportModal,
    selectImportFile,
    renderWorkspacePanel
  };
  globalScope.AdvisoryGradeTransfer = api;
  globalScope.showGradeTransferExportModal = showExportModal;
  globalScope.importAdvisorySubjectGrades = selectImportFile;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
