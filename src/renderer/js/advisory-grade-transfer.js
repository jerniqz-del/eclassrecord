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

  function fileFingerprint(payload) {
    const source = JSON.stringify(payload);
    let hashA = 0x811c9dc5;
    let hashB = 0x9e3779b9;
    for (let index = 0; index < source.length; index++) {
      const code = source.charCodeAt(index);
      hashA ^= code;
      hashA = Math.imul(hashA, 0x01000193);
      hashB ^= code + index;
      hashB = Math.imul(hashB, 0x85ebca6b);
    }
    return `fnv64-${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
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
    const fingerprint = fileFingerprint(payload);
    const sameExportBatches = store.importBatches.filter(item => item.advisoryClassId === advisoryClass.id && item.exportId === text(payload?.exportId) && item.status !== 'undone');
    const exactDuplicate = store.importBatches.find(item => item.advisoryClassId === advisoryClass.id && item.status !== 'undone' && (
      item.fileFingerprint === fingerprint
      || (item.exportId === text(payload?.exportId) && (!item.fileFingerprint || item.fileFingerprint === fingerprint))
    ));
    const correctedReimport = !exactDuplicate && sameExportBatches.length > 0;
    if (exactDuplicate) errors.push('This Grade Transfer File has already been imported.');
    if (correctedReimport) warnings.push('This appears to be a corrected version of a previously imported Grade Transfer File. Existing grades require a decision.');
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
        status = 'conflict';
        warning = `Saved grade ${existingGrade.finalGrade} differs from or duplicates incoming grade ${incoming.finalGrade}. Choose which value to keep.`;
      }
      return { index, incoming, matchedLearner: match.learner, status, warning, existingGrade, conflictDecision: '', accepted: ['matched-lrn', 'matched-name'].includes(status) };
    });
    const matchedLearnerIds = new Set();
    rows.forEach(row => {
      if (!row.matchedLearner || !row.accepted) return;
      if (matchedLearnerIds.has(row.matchedLearner.id)) {
        row.status = 'ambiguous';
        row.accepted = false;
        row.warning = 'Another file row already matches this Advisory learner.';
      } else matchedLearnerIds.add(row.matchedLearner.id);
    });
    const unmatchedCount = rows.filter(row => ['unmatched', 'ambiguous'].includes(row.status)).length;
    if (unmatchedCount) warnings.push(`${unmatchedCount} learner${unmatchedCount === 1 ? '' : 's'} could not be matched safely and will remain unresolved.`);
    const plan = {
      payload,
      filename: text(filename) || 'Grade-Transfer-File.json',
      fileFingerprint: fingerprint,
      correctedReimport,
      advisoryClass,
      subject,
      proposedSubject: subject ? null : { subjectName: text(payload?.subject?.name), normalizedSubjectKey: subjectKey },
      rows,
      errors,
      warnings,
      unmatchedCount,
      conflictCount: rows.filter(row => row.status === 'conflict').length,
      importableCount: 0,
      unresolvedConflictCount: 0,
      canImport: false
    };
    return recalculatePlan(plan);
  }

  function recalculatePlan(plan) {
    plan.importableCount = plan.rows.filter(row => row.accepted).length;
    plan.unmatchedCount = plan.rows.filter(row => ['unmatched', 'ambiguous'].includes(row.status)).length;
    plan.conflictCount = plan.rows.filter(row => row.status === 'conflict').length;
    plan.unresolvedConflictCount = plan.rows.filter(row => row.status === 'conflict' && !['keep', 'replace'].includes(row.conflictDecision)).length;
    const resolvedKeeps = plan.rows.filter(row => row.status === 'conflict' && row.conflictDecision === 'keep').length;
    plan.canImport = plan.errors.length === 0
      && plan.unresolvedConflictCount === 0
      && (plan.importableCount > 0 || resolvedKeeps > 0);
    return plan;
  }

  function setConflictDecision(plan, rowIndex, decision) {
    if (!['keep', 'replace'].includes(decision)) throw new Error('Choose keep or replace for this conflict.');
    const row = plan.rows.find(item => item.index === Number(rowIndex));
    if (!row || row.status !== 'conflict') throw new Error('The selected row is not a grade conflict.');
    row.conflictDecision = decision;
    row.accepted = decision === 'replace';
    return recalculatePlan(plan);
  }

  function applyConflictDecisionToAll(plan, decision) {
    plan.rows.filter(row => row.status === 'conflict').forEach(row => {
      row.conflictDecision = decision;
      row.accepted = decision === 'replace';
    });
    return recalculatePlan(plan);
  }

  function assignUnmatchedLearner(profileDb, plan, rowIndex, learnerId) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const row = plan.rows.find(item => item.index === Number(rowIndex));
    const learner = store.learners.find(item => item.id === learnerId && item.advisoryClassId === plan.advisoryClass.id);
    if (!row || !['unmatched', 'ambiguous'].includes(row.status) || !learner) throw new Error('The unmatched learner assignment is invalid.');
    if (plan.rows.some(item => item !== row && item.accepted && item.matchedLearner?.id === learner.id)) {
      throw new Error('Another incoming row is already matched to this Advisory learner.');
    }
    row.matchedLearner = learner;
    const subject = plan.subject;
    const existingGrade = subject && store.grades.find(item => item.advisoryClassId === plan.advisoryClass.id && item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === text(plan.payload.term.number));
    row.existingGrade = existingGrade || null;
    if (existingGrade) {
      row.status = 'conflict';
      row.conflictDecision = '';
      row.accepted = false;
      row.warning = `Manually matched. Saved grade ${existingGrade.finalGrade} requires a keep/replace decision.`;
    } else {
      row.status = 'matched-manual';
      row.accepted = true;
      row.warning = 'Manually matched by the adviser.';
    }
    return recalculatePlan(plan);
  }

  function applyImportPlan(profileDb, plan) {
    if (!plan?.canImport) throw new Error('This import plan is not ready for confirmation.');
    const snapshot = JSON.parse(JSON.stringify(profileDb.advisory));
    try {
      let subject = plan.subject;
      let createdSubjectId = '';
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
        createdSubjectId = subject.id;
      }
      const acceptedRows = plan.rows.filter(row => row.accepted);
      const conflictDecisions = {};
      plan.rows.filter(row => row.status === 'conflict').forEach(row => {
        conflictDecisions[String(row.index)] = row.conflictDecision;
      });
      const importedAt = new Date().toISOString();
      const batch = globalScope.AdvisoryData.createImportBatch(profileDb, {
        advisoryClassId: plan.advisoryClass.id,
        exportId: text(plan.payload.exportId),
        filename: plan.filename,
        fileFingerprint: plan.fileFingerprint,
        schemaVersion: text(plan.payload.schemaVersion),
        schoolYear: text(plan.payload.schoolYear),
        subject: text(plan.payload.subject?.name),
        term: text(plan.payload.term?.number),
        sourceTeacher: text(plan.payload.teacher?.name),
        sourceClass: text(plan.payload.class?.name),
        exportedAt: text(plan.payload.exportedAt),
        importedAt,
        totalRecords: plan.rows.length,
        importedCount: acceptedRows.length,
        skippedCount: plan.rows.length - acceptedRows.length,
        updatedCount: acceptedRows.filter(row => row.existingGrade).length,
        unmatchedCount: plan.unmatchedCount,
        invalidCount: 0,
        conflictCount: plan.conflictCount,
        status: acceptedRows.length === plan.rows.length ? 'complete' : 'partial',
        conflictDecisions,
        unmatchedRecords: plan.rows.filter(row => ['unmatched', 'ambiguous'].includes(row.status)).map(row => row.incoming),
        undoMetadata: { entries: [], createdSubjectId, createdMappingIds: [] },
        correctedReimport: plan.correctedReimport === true
      });
      acceptedRows.forEach(row => {
        const gradeValues = {
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
          importedAt,
          validationStatus: 'valid',
          conflictStatus: row.existingGrade ? 'resolved' : 'none',
          remarks: text(row.incoming.remarks)
        };
        if (row.existingGrade) {
          const previous = JSON.parse(JSON.stringify(row.existingGrade));
          const updatedGrade = globalScope.AdvisoryData.updateGrade(profileDb, row.existingGrade.id, gradeValues);
          batch.undoMetadata.entries.push({ action: 'updated', gradeId: row.existingGrade.id, previous, appliedFingerprint: fileFingerprint(updatedGrade) });
        } else {
          const createdGrade = globalScope.AdvisoryData.createGrade(profileDb, gradeValues);
          batch.undoMetadata.entries.push({ action: 'created', gradeId: createdGrade.id, appliedFingerprint: fileFingerprint(createdGrade) });
        }
      });
      const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
      if (!store.sourceMappings.some(item => item.advisoryClassId === plan.advisoryClass.id && item.importedNormalizedKey === subject.normalizedSubjectKey)) {
        const mapping = globalScope.AdvisoryData.createSourceMapping(profileDb, {
          advisoryClassId: plan.advisoryClass.id,
          importedSubjectName: text(plan.payload.subject.name),
          importedNormalizedKey: subject.normalizedSubjectKey,
          advisorySubjectId: subject.id,
          sourceTeacher: text(plan.payload.teacher?.name),
          sourceClass: text(plan.payload.class?.name),
          schoolYear: text(plan.payload.schoolYear)
        });
        batch.undoMetadata.createdMappingIds.push(mapping.id);
      }
      globalScope.AdvisoryData.updateImportBatch(profileDb, batch.id, {
        conflictDecisions: batch.conflictDecisions,
        undoMetadata: batch.undoMetadata
      });
      return { batch, subject, importedCount: acceptedRows.length };
    } catch (error) {
      profileDb.advisory = snapshot;
      throw error;
    }
  }

  function undoImportBatch(profileDb, batchId) {
    const snapshot = JSON.parse(JSON.stringify(profileDb.advisory));
    try {
      const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
      const batch = store.importBatches.find(item => item.id === batchId);
      if (!batch || batch.status === 'undone') throw new Error('This import batch cannot be undone.');
      const entries = Array.isArray(batch.undoMetadata?.entries) ? batch.undoMetadata.entries : [];
      if (!entries.length) throw new Error('This import batch has no safe undo information.');
      entries.forEach(entry => {
        const currentStore = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
        const grade = currentStore.grades.find(item => item.id === entry.gradeId);
        if (!grade || grade.importBatchId !== batch.id || (entry.appliedFingerprint && fileFingerprint(grade) !== entry.appliedFingerprint)) {
          throw new Error('A grade from this batch was changed later and cannot be safely undone.');
        }
        if (entry.action === 'created') globalScope.AdvisoryData.deleteGrade(profileDb, entry.gradeId);
        else if (entry.action === 'updated' && entry.previous) {
          const latestStore = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
          const index = latestStore.grades.findIndex(item => item.id === entry.gradeId);
          latestStore.grades[index] = JSON.parse(JSON.stringify(entry.previous));
        }
      });
      const postGradeStore = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
      (batch.undoMetadata.createdMappingIds || []).forEach(mappingId => {
        const mapping = postGradeStore.sourceMappings.find(item => item.id === mappingId);
        if (mapping && !postGradeStore.grades.some(item => item.advisorySubjectId === mapping.advisorySubjectId)) {
          globalScope.AdvisoryData.deleteSourceMapping(profileDb, mappingId);
        }
      });
      const createdSubjectId = text(batch.undoMetadata.createdSubjectId);
      if (createdSubjectId) {
        const latestStore = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
        if (!latestStore.grades.some(item => item.advisorySubjectId === createdSubjectId)) globalScope.AdvisoryData.deleteSubject(profileDb, createdSubjectId);
      }
      const updated = globalScope.AdvisoryData.updateImportBatch(profileDb, batch.id, { status: 'undone', undoneAt: new Date().toISOString() });
      return updated;
    } catch (error) {
      profileDb.advisory = snapshot;
      throw error;
    }
  }

  function latestUndoableBatch(profileDb, advisoryClassId) {
    return globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).importBatches
      .filter(item => item.advisoryClassId === advisoryClassId && item.status !== 'undone' && Array.isArray(item.undoMetadata?.entries) && item.undoMetadata.entries.length)
      .sort((left, right) => text(right.importedAt).localeCompare(text(left.importedAt)))[0] || null;
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
    document.body.appendChild(overlay);
    const renderPreview = () => {
      const statusLabel = { 'matched-lrn': 'Matched by LRN', 'matched-name': 'Matched by name', 'matched-manual': 'Manually matched', unmatched: 'Unmatched', ambiguous: 'Ambiguous', conflict: 'Existing grade conflict' };
      const roster = globalScope.AdvisoryData.normalizeAdvisoryData(globalScope.db).learners.filter(item => item.advisoryClassId === plan.advisoryClass.id && item.enrollmentStatus !== 'inactive');
      overlay.innerHTML = `<div class="modal advisory-preview-modal"><div class="modal__title">Review Grade Import</div><div class="modal__body advisory-scroll-body"><div class="advisory-transfer-summary"><strong>${globalScope.esc(plan.payload?.subject?.name || 'Unknown subject')} · Term ${globalScope.esc(plan.payload?.term?.number || '—')}</strong><span>${globalScope.esc(plan.payload?.class?.name || '')} · SY ${globalScope.esc(plan.payload?.schoolYear || '')} · ${globalScope.esc(plan.filename)}</span></div>${plan.errors.length ? `<div class="advisory-import-messages advisory-import-messages--error">${plan.errors.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}${plan.warnings.length ? `<div class="advisory-import-messages advisory-import-messages--warning">${plan.warnings.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}<div class="advisory-import-summary"><span><strong>${plan.importableCount}</strong> ready</span><span><strong>${plan.unmatchedCount}</strong> unmatched</span><span><strong>${plan.conflictCount}</strong> conflicts</span><span><strong>${plan.unresolvedConflictCount}</strong> decisions needed</span></div>${plan.conflictCount ? '<div class="advisory-conflict-bulk"><span>Apply to all conflicts:</span><button class="btn btn-ghost btn-sm" data-keep-all>Keep Existing</button><button class="btn btn-primary btn-sm" data-replace-all>Replace with Imported</button></div>' : ''}<div class="advisory-preview-list">${plan.rows.map(row => `<div class="advisory-preview-row advisory-preview-row--${row.status}"><span><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(row.incoming))} · Incoming ${globalScope.esc(row.incoming.finalGrade)}</strong><small>${globalScope.esc(row.incoming.lrn || 'No LRN')} · ${globalScope.esc(statusLabel[row.status] || row.status)}${row.warning ? ` · ${globalScope.esc(row.warning)}` : ''}</small>${row.status === 'conflict' ? `<select class="field-select advisory-conflict-select" data-conflict-row="${row.index}"><option value="">Choose a decision</option><option value="keep" ${row.conflictDecision === 'keep' ? 'selected' : ''}>Keep existing grade (${globalScope.esc(row.existingGrade.finalGrade)})</option><option value="replace" ${row.conflictDecision === 'replace' ? 'selected' : ''}>Replace with imported grade (${globalScope.esc(row.incoming.finalGrade)})</option></select>` : ''}${['unmatched','ambiguous'].includes(row.status) ? `<select class="field-select advisory-match-select" data-match-row="${row.index}"><option value="">Leave unmatched</option>${roster.map(learner => `<option value="${globalScope.esc(learner.id)}">${globalScope.esc(learner.lrn || 'No LRN')} · ${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</option>`).join('')}</select>` : ''}</span></div>`).join('')}</div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-confirm ${plan.canImport ? '' : 'disabled'}>Confirm Import</button></div></div>`;
      overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
      overlay.querySelector('[data-keep-all]')?.addEventListener('click', () => { applyConflictDecisionToAll(plan, 'keep'); renderPreview(); });
      overlay.querySelector('[data-replace-all]')?.addEventListener('click', () => { applyConflictDecisionToAll(plan, 'replace'); renderPreview(); });
      overlay.querySelectorAll('[data-conflict-row]').forEach(select => select.addEventListener('change', () => {
        if (select.value) setConflictDecision(plan, Number(select.dataset.conflictRow), select.value);
        renderPreview();
      }));
      overlay.querySelectorAll('[data-match-row]').forEach(select => select.addEventListener('change', () => {
        if (select.value) assignUnmatchedLearner(globalScope.db, plan, Number(select.dataset.matchRow), select.value);
        renderPreview();
      }));
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
    };
    renderPreview();
  }

  function showSubjectModal(subjectId) {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(globalScope.db);
    const existing = subjectId ? store.subjects.find(item => item.id === subjectId && item.advisoryClassId === advisoryClass.id) : null;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    const value = (field, fallback = '') => globalScope.esc(existing?.[field] ?? fallback);
    overlay.innerHTML = `<div class="modal modal--wide"><div class="modal__title">${existing ? 'Edit Subject & Grade Source' : 'Add Advisory Subject'}</div><div class="modal__body advisory-scroll-body"><div class="split-row"><div class="field"><label class="field-label">Subject Name</label><input class="field-input" data-subject-field="subjectName" value="${value('subjectName')}"></div><div class="field"><label class="field-label">Normalized Subject Key</label><input class="field-input" data-subject-field="normalizedSubjectKey" value="${value('normalizedSubjectKey')}"></div></div><div class="split-row"><div class="field"><label class="field-label">Expected Source Teacher</label><input class="field-input" data-subject-field="expectedSourceTeacher" value="${value('expectedSourceTeacher')}"></div><div class="field"><label class="field-label">Expected Source Class</label><input class="field-input" data-subject-field="expectedSourceClass" value="${value('expectedSourceClass')}"></div></div><div class="split-row"><div class="field"><label class="field-label">Expected Grade Level</label><input class="field-input" data-subject-field="expectedGradeLevel" value="${value('expectedGradeLevel', advisoryClass.gradeLevel)}"></div><div class="field"><label class="field-label">Expected Section</label><input class="field-input" data-subject-field="expectedSection" value="${value('expectedSection', advisoryClass.section)}"></div></div><div class="split-row"><div class="field"><label class="field-label">Expected School Year</label><input class="field-input" data-subject-field="expectedSchoolYear" value="${value('expectedSchoolYear', advisoryClass.schoolYear)}"></div><div class="field"><label class="field-label">Expected Term</label><select class="field-select" data-subject-field="expectedTerm"><option value="">Any term</option><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div></div><div class="split-row"><div class="field"><label class="field-label">Source Type</label><select class="field-select" data-subject-field="sourceType"><option value="grade-transfer-file">Grade Transfer File</option><option value="local-subject-class">Existing local subject class</option><option value="manual">Manual entry</option><option value="corrected-grade-transfer-file">Corrected Grade Transfer File</option></select></div><div class="field"><label class="field-label">Display Order</label><input type="number" min="0" class="field-input" data-subject-field="displayOrder" value="${value('displayOrder', store.subjects.filter(item => item.advisoryClassId === advisoryClass.id).length)}"></div></div></div><div class="modal__actions">${existing ? '<button class="btn btn-danger btn-sm" data-delete-subject>Remove Subject</button>' : ''}<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Subject</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-subject-field="expectedTerm"]').value = existing?.expectedTerm || '';
    overlay.querySelector('[data-subject-field="sourceType"]').value = existing?.sourceType || 'grade-transfer-file';
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const values = {};
      overlay.querySelectorAll('[data-subject-field]').forEach(input => { values[input.dataset.subjectField] = input.value; });
      values.subjectName = text(values.subjectName);
      values.normalizedSubjectKey = normalizeSubjectKey(values.normalizedSubjectKey || values.subjectName);
      if (!values.subjectName || !values.normalizedSubjectKey) { globalScope.toast('Subject name is required.', 'warning'); return; }
      const duplicate = globalScope.AdvisoryData.normalizeAdvisoryData(globalScope.db).subjects.some(item => item.advisoryClassId === advisoryClass.id && item.id !== existing?.id && item.normalizedSubjectKey === values.normalizedSubjectKey);
      if (duplicate) { globalScope.toast('This Advisory subject already exists.', 'warning'); return; }
      if (existing) globalScope.AdvisoryData.updateSubject(globalScope.db, existing.id, values);
      else globalScope.AdvisoryData.createSubject(globalScope.db, { ...values, advisoryClassId: advisoryClass.id });
      await globalScope.saveDatabase();
      overlay.remove();
      globalScope.AdvisoryRoster.renderWorkspace();
      globalScope.renderDashboardOverview();
      globalScope.toast('Advisory subject saved.', 'success');
    });
    overlay.querySelector('[data-delete-subject]')?.addEventListener('click', () => {
      const gradeCount = store.grades.filter(item => item.advisorySubjectId === existing.id).length;
      globalScope.confirmModal('Remove Advisory Subject', `Remove ${existing.subjectName}? ${gradeCount ? `This will also remove ${gradeCount} saved final grade record(s).` : 'No saved grades are attached.'}`, async () => {
        globalScope.AdvisoryData.deleteSubject(globalScope.db, existing.id);
        await globalScope.saveDatabase();
        overlay.remove();
        globalScope.AdvisoryRoster.renderWorkspace();
        globalScope.renderDashboardOverview();
        globalScope.toast('Advisory subject removed.', 'success');
      });
    });
  }

  function requestUndoLatest(advisoryClassId) {
    const batch = latestUndoableBatch(globalScope.db, advisoryClassId);
    if (!batch) { globalScope.toast('No safely undoable import batch is available.', 'info'); return; }
    globalScope.confirmModal('Undo Latest Grade Import', `Undo ${batch.filename || batch.subject}? Grades created by this batch will be removed and replaced grades will be restored.`, async () => {
      try {
        undoImportBatch(globalScope.db, batch.id);
        await globalScope.saveDatabase();
        globalScope.AdvisoryRoster.renderWorkspace();
        globalScope.renderDashboardOverview();
        globalScope.toast('Latest grade import undone.', 'success');
      } catch (error) {
        console.error('Grade import undo failed:', error);
        globalScope.toast(error.message || 'This import can no longer be safely undone.', 'error');
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
    const batches = store.importBatches.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => text(b.importedAt).localeCompare(text(a.importedAt)));
    panel.innerHTML = `<div class="advisory-grade-panel__header"><div><h3>Grade Consolidation</h3><p>Final grades by learner, subject, and term. Missing records remain visible.</p></div><div class="advisory-grade-panel__actions"><button class="btn btn-ghost btn-sm" type="button" data-add-advisory-subject>Add Subject</button><button class="btn btn-primary btn-sm" type="button" data-import-subject-grades>Import Subject Grades</button></div></div>${subjects.length ? `<div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table advisory-grade-matrix"><thead><tr><th>Learner</th>${subjects.map(subject => `<th colspan="3">${globalScope.esc(subject.subjectName)}</th>`).join('')}</tr><tr><th>LRN / Official Name</th>${subjects.map(() => '<th>T1</th><th>T2</th><th>T3</th>').join('')}</tr></thead><tbody>${learners.map(learner => `<tr><td><small>${globalScope.esc(learner.lrn || 'No LRN')}</small><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td>${subjects.map(subject => ['1','2','3'].map(term => { const grade = grades.find(item => item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === term); return `<td class="${grade ? (grade.conflictStatus && !['none','resolved'].includes(grade.conflictStatus) ? 'has-conflict' : 'has-grade') : 'is-missing'}" title="${grade ? globalScope.esc(grade.sourceClassName || grade.sourceType) : 'Missing grade'}">${grade ? globalScope.esc(grade.finalGrade) : '—'}</td>`; }).join('')).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="advisory-roster__empty">No subjects have been configured. Import the first Grade Transfer File or add a subject manually.</div>'}<section class="advisory-source-management"><h3>Grade Source Management</h3><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Subject</th><th>Expected Source</th><th>Last Import</th><th>Received</th><th>Missing</th><th>Conflicts</th><th></th></tr></thead><tbody>${subjects.length ? subjects.map(subject => { const subjectGrades = grades.filter(item => item.advisorySubjectId === subject.id); const lastBatch = batches.find(batch => normalizeSubjectKey(batch.subject) === subject.normalizedSubjectKey && batch.status !== 'undone'); const expected = learners.length * 3; const conflicts = subjectGrades.filter(grade => grade.conflictStatus && !['none','resolved'].includes(grade.conflictStatus)).length; return `<tr><td><strong>${globalScope.esc(subject.subjectName)}</strong><small>${globalScope.esc(subject.normalizedSubjectKey)}</small></td><td>${globalScope.esc(subject.expectedSourceTeacher || 'Any teacher')}<small>${globalScope.esc(subject.expectedSourceClass || subject.sourceType)}</small></td><td>${lastBatch ? `${globalScope.esc(lastBatch.filename)}<small>${globalScope.esc(lastBatch.importedAt)}</small>` : 'Not imported'}</td><td>${subjectGrades.length}</td><td>${Math.max(0, expected - subjectGrades.length)}</td><td>${conflicts}</td><td><button class="btn btn-ghost btn-sm" data-edit-advisory-subject="${globalScope.esc(subject.id)}">Edit</button></td></tr>`; }).join('') : '<tr><td colspan="7">No subjects configured.</td></tr>'}</tbody></table></div></section><section class="advisory-import-history"><div class="advisory-grade-panel__header"><div><h3>Import History</h3><p>Audit trail for every confirmed Grade Transfer File.</p></div><button class="btn btn-ghost btn-sm" data-undo-latest-import ${latestUndoableBatch(globalScope.db, advisoryClass.id) ? '' : 'disabled'}>Undo Latest Import</button></div><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Imported</th><th>File / Source</th><th>Subject / Term</th><th>Results</th><th>Status</th></tr></thead><tbody>${batches.length ? batches.map(batch => `<tr><td>${globalScope.esc(batch.importedAt || '—')}</td><td>${globalScope.esc(batch.filename || 'Unknown file')}<small>${globalScope.esc(batch.sourceTeacher || '')} · ${globalScope.esc(batch.sourceClass || '')}</small></td><td>${globalScope.esc(batch.subject)} · Term ${globalScope.esc(batch.term)}</td><td>${batch.importedCount} imported · ${batch.updatedCount} updated · ${batch.skippedCount} skipped · ${batch.conflictCount} conflicts</td><td>${globalScope.esc(batch.status)}</td></tr>`).join('') : '<tr><td colspan="5">No grade imports recorded.</td></tr>'}</tbody></table></div></section>`;
    panel.querySelector('[data-import-subject-grades]').addEventListener('click', selectImportFile);
    panel.querySelector('[data-add-advisory-subject]').addEventListener('click', () => showSubjectModal());
    panel.querySelectorAll('[data-edit-advisory-subject]').forEach(button => button.addEventListener('click', () => showSubjectModal(button.dataset.editAdvisorySubject)));
    panel.querySelector('[data-undo-latest-import]').addEventListener('click', () => requestUndoLatest(advisoryClass.id));
  }

  const api = {
    FORMAT,
    SCHEMA_VERSION,
    normalizeSubjectKey,
    sanitizeFilenamePart,
    gradeTransferFilename,
    fileFingerprint,
    buildExportPayload,
    validatePayload,
    contextValidation,
    matchLearner,
    planImport,
    recalculatePlan,
    setConflictDecision,
    applyConflictDecisionToAll,
    assignUnmatchedLearner,
    applyImportPlan,
    undoImportBatch,
    latestUndoableBatch,
    showExportModal,
    selectImportFile,
    renderWorkspacePanel
  };
  globalScope.AdvisoryGradeTransfer = api;
  globalScope.showGradeTransferExportModal = showExportModal;
  globalScope.importAdvisorySubjectGrades = selectImportFile;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
