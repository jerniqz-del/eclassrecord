/**
 * Offline, versioned Grade Transfer File export/import workflow.
 */
(function initAdvisoryGradeTransfer(globalScope) {
  'use strict';

  function activeDb() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
    if (!profileDb) throw new Error('The active profile database is unavailable.');
    return profileDb;
  }

  const FORMAT = 'eclass-record-grade-export';
  const SCHEMA_VERSION = '1.0';
  const MAPEH_AVERAGE_ID = '__mapeh_average__';
  let advisoryPanelTab = 'grades';
  const expandedAdvisorySubjects = new Set();
  let advisorySubjectSort = { subjectId: '', direction: '' };

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

  function splitMapehSubjects(subjects) {
    return (subjects || []).flatMap(subjectName => /mapeh|music, arts, physical education, and health/i.test(subjectName)
      ? ['Music & Arts', 'PE & Health']
      : [subjectName]);
  }

  function standardSubjectsForGrade(gradeLevel) {
    if (typeof globalScope.getSubjectsForGrade === 'function') {
      return splitMapehSubjects(globalScope.getSubjectsForGrade(gradeLevel));
    }
    const grade = Number.parseInt(gradeLevel, 10);
    if (grade === 1) return ['Language', 'Reading and Literacy', 'Mathematics', 'Makabansa', 'Good Manners and Right Conduct (GMRC)', 'Arts and Physical Education'];
    if (grade === 2) return ['Filipino', 'English', 'Mathematics', 'Makabansa', 'Good Manners and Right Conduct (GMRC)', 'Music & Arts', 'PE & Health'];
    if (grade === 3) return ['Filipino', 'English', 'Mathematics', 'Science', 'Makabansa', 'Good Manners and Right Conduct (GMRC)', 'Music & Arts', 'PE & Health'];
    if (grade >= 4 && grade <= 5) return ['Filipino', 'English', 'Mathematics', 'Science', 'Araling Panlipunan', 'Good Manners and Right Conduct (GMRC)', 'Edukasyong Pantahanan at Pangkabuhayan (EPP)', 'Music & Arts', 'PE & Health'];
    if (grade === 6) return ['Filipino', 'English', 'Mathematics', 'Science', 'Araling Panlipunan', 'Good Manners and Right Conduct (GMRC)', 'Technology and Livelihood Education (TLE)', 'Music & Arts', 'PE & Health'];
    if (grade >= 7 && grade <= 10) return ['Filipino', 'English', 'Mathematics', 'Science', 'Araling Panlipunan', 'Values Education', 'Technology and Livelihood Education (TLE)', 'Music & Arts', 'PE & Health'];
    return [];
  }

  function subjectDisplayName(subjectName) {
    const key = normalizeSubjectKey(subjectName);
    if (key.includes('EDUKASYONG PANTAHANAN AT PANGKABUHAYAN') || /(^| )EPP($| )/.test(key)) return 'EPP';
    if (key.includes('TECHNOLOGY AND LIVELIHOOD EDUCATION') || /(^| )TLE($| )/.test(key)) return 'TLE';
    if (key === 'ARALING PANLIPUNAN') return 'Aral. Pan.';
    if (key.includes('GOOD MANNERS AND RIGHT CONDUCT') || key.includes('GOOD MORAL AND RIGHT CONDUCT') || key === 'GMRC') return 'GMRC';
    if (key === 'VALUES EDUCATION') return 'Val. Ed.';
    return text(subjectName);
  }

  function subjectCompactName(subjectName) {
    const key = normalizeSubjectKey(subjectName);
    if (key === 'FILIPINO') return 'FIL';
    if (key === 'ENGLISH') return 'ENG';
    if (key === 'MATHEMATICS') return 'MATH';
    if (key === 'SCIENCE') return 'SCI';
    if (key === 'ARALING PANLIPUNAN') return 'AP';
    if (key === 'MUSIC ARTS') return 'M&A';
    if (key === 'PE HEALTH' || key.includes('ARTS AND PHYSICAL EDUCATION')) return 'PE&H';
    if (key === 'LANGUAGE') return 'LANG';
    if (key.includes('READING') && key.includes('LITERACY')) return 'R&L';
    if (key === 'MAKABANSA') return 'MKB';
    if (key.includes('EDUKASYONG PANTAHANAN AT PANGKABUHAYAN') || /(^| )EPP($| )/.test(key)) return 'EPP';
    if (key.includes('TECHNOLOGY AND LIVELIHOOD EDUCATION') || /(^| )TLE($| )/.test(key)) return 'TLE';
    if (key.includes('GOOD MANNERS AND RIGHT CONDUCT') || key.includes('GOOD MORAL AND RIGHT CONDUCT') || key === 'GMRC') return 'GMRC';
    if (key === 'VALUES EDUCATION') return 'Val.Ed';
    if (key === 'MAPEH AVERAGE') return 'MAPEH';
    return subjectDisplayName(subjectName);
  }

  function classSections(profileDb, advisoryClass) {
    const seen = new Set();
    return (profileDb.assignments || [])
      .filter(item => item.schoolYear === advisoryClass.schoolYear)
      .map(item => text(item.section))
      .filter(section => {
        const key = section.toLocaleUpperCase();
        if (!section || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => left.localeCompare(right, 'fil'));
  }

  function ensureGradeLevelSubjects(profileDb, advisoryClass) {
    if (!profileDb || !advisoryClass) return [];
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    let existing = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id);
    const legacyMapeh = existing.find(item => item.normalizedSubjectKey === 'MAPEH' || /MUSIC ARTS PHYSICAL EDUCATION AND HEALTH/.test(item.normalizedSubjectKey));
    if (legacyMapeh && !store.grades.some(grade => grade.advisorySubjectId === legacyMapeh.id)) {
      globalScope.AdvisoryData.updateSubject(profileDb, legacyMapeh.id, {
        subjectName: 'Music & Arts',
        normalizedSubjectKey: normalizeSubjectKey('Music & Arts')
      });
      existing = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).subjects.filter(item => item.advisoryClassId === advisoryClass.id);
    }
    const existingKeys = new Set(existing.map(item => item.normalizedSubjectKey));
    const standardKeys = new Set(standardSubjectsForGrade(advisoryClass.gradeLevel).map(normalizeSubjectKey));
    existing.forEach(subject => {
      if (!standardKeys.has(subject.normalizedSubjectKey)
        && !subject.isSpecialProgramSubject
        && !subject.isLegacySubject) {
        globalScope.AdvisoryData.updateSubject(profileDb, subject.id, { isLegacySubject: true });
      }
    });
    const created = [];
    standardSubjectsForGrade(advisoryClass.gradeLevel).forEach(subjectName => {
      const normalizedSubjectKey = normalizeSubjectKey(subjectName);
      if (!normalizedSubjectKey || existingKeys.has(normalizedSubjectKey)) return;
      created.push(globalScope.AdvisoryData.createSubject(profileDb, {
        advisoryClassId: advisoryClass.id,
        subjectName,
        normalizedSubjectKey,
        expectedGradeLevel: advisoryClass.gradeLevel,
        expectedSection: advisoryClass.section,
        expectedSchoolYear: advisoryClass.schoolYear,
        expectedTerm: '',
        sourceType: 'grade-transfer-file',
        displayOrder: existing.length + created.length
      }));
      existingKeys.add(normalizedSubjectKey);
    });
    return created;
  }

  function syncSpecialProgramSubjects(profileDb, advisoryClass, requestedSubjects) {
    const requested = (requestedSubjects || []).map(item => ({
      subjectName: text(item.subjectName),
      normalizedSubjectKey: normalizeSubjectKey(item.subjectName),
      includeInGeneralAverage: item.includeInGeneralAverage !== false
    })).filter(item => item.subjectName);
    if (!advisoryClass.isSpecialClass && requested.length) throw new Error('Enable Special Class before adding special-program subjects.');
    if (requested.length > 2) throw new Error('A Special Class can have at most two active special-program subjects.');
    const requestedKeys = new Set();
    const standardKeys = new Set(standardSubjectsForGrade(advisoryClass.gradeLevel).map(normalizeSubjectKey));
    requested.forEach(item => {
      if (requestedKeys.has(item.normalizedSubjectKey)) throw new Error('Special-program subject names must be different.');
      if (standardKeys.has(item.normalizedSubjectKey)) throw new Error(`${item.subjectName} is already a predefined subject for this grade level.`);
      requestedKeys.add(item.normalizedSubjectKey);
    });

    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const existing = store.subjects
      .filter(item => item.advisoryClassId === advisoryClass.id && item.isSpecialProgramSubject)
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const usedIds = new Set();
    requested.forEach((item, index) => {
      let subject = existing.find(candidate => candidate.normalizedSubjectKey === item.normalizedSubjectKey && !usedIds.has(candidate.id));
      if (!subject) subject = existing.find(candidate => !usedIds.has(candidate.id));
      if (subject) {
        const oldKey = subject.normalizedSubjectKey;
        globalScope.AdvisoryData.updateSubject(profileDb, subject.id, {
          subjectName: item.subjectName,
          normalizedSubjectKey: item.normalizedSubjectKey,
          includeInGeneralAverage: item.includeInGeneralAverage,
          isArchived: false,
          isLegacySubject: false
        });
        profileDb.advisory.grades.filter(grade => grade.advisorySubjectId === subject.id).forEach(grade => {
          grade.subjectName = item.subjectName;
          grade.normalizedSubjectKey = item.normalizedSubjectKey;
          grade.updatedAt = new Date().toISOString();
        });
        profileDb.advisory.sourceMappings.filter(mapping => mapping.advisorySubjectId === subject.id && mapping.importedNormalizedKey === oldKey).forEach(mapping => {
          mapping.importedSubjectName = item.subjectName;
          mapping.importedNormalizedKey = item.normalizedSubjectKey;
          mapping.updatedAt = new Date().toISOString();
        });
      } else {
        subject = globalScope.AdvisoryData.createSubject(profileDb, {
          advisoryClassId: advisoryClass.id,
          subjectName: item.subjectName,
          normalizedSubjectKey: item.normalizedSubjectKey,
          expectedGradeLevel: advisoryClass.gradeLevel,
          expectedSection: advisoryClass.section,
          expectedSchoolYear: advisoryClass.schoolYear,
          sourceType: 'grade-transfer-file',
          displayOrder: profileDb.advisory.subjects.filter(row => row.advisoryClassId === advisoryClass.id).length,
          isSpecialProgramSubject: true,
          includeInGeneralAverage: item.includeInGeneralAverage,
          isArchived: false
        });
      }
      usedIds.add(subject.id);
    });
    existing.filter(subject => !usedIds.has(subject.id)).forEach(subject => {
      globalScope.AdvisoryData.updateSubject(profileDb, subject.id, { isArchived: true });
    });
    return globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).subjects
      .filter(item => item.advisoryClassId === advisoryClass.id && item.isSpecialProgramSubject);
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
    const subjectName = text(options.subjectName || assignment?.subject);
    if (!assignment || !assignment.id) throw new Error('A subject class is required.');
    if (![1, 2, 3].includes(termNumber)) throw new Error('Select a valid term.');
    if (typeof options.getFinalGrade !== 'function') throw new Error('The final-grade reader is unavailable.');
    const learners = (assignment.learners || []).map(learner => {
      const grade = options.getFinalGrade(assignment, learner.id, String(termNumber), text(options.mapePart));
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
        id: text(assignment.subjectId) ? `${text(assignment.subjectId)}${options.mapePart ? `-${text(options.mapePart)}` : ''}` : normalizeSubjectKey(subjectName).toLowerCase().replace(/\s+/g, '-'),
        name: subjectName,
        normalizedKey: normalizeSubjectKey(subjectName),
        strand: text(options.mapePart),
        isSpecialProgramSubject: assignment.isSpecialProgramSubject === true,
        ...(assignment.isSpecialProgramSubject === true ? { specialProgramWeights: Array.isArray(assignment.specialProgramWeights) ? assignment.specialProgramWeights.map(Number) : [] } : {})
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
    if (payload.subject?.isSpecialProgramSubject === true) {
      const weights = payload.subject.specialProgramWeights;
      if (!Array.isArray(weights) || weights.length !== 3 || weights.some(weight => !Number.isInteger(Number(weight)) || Number(weight) < 0 || Number(weight) > 100) || weights.reduce((sum, weight) => sum + Number(weight), 0) !== 100) {
        errors.push('The Grade Transfer File contains invalid special-program grading percentages.');
      }
    }
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
    const subject = store.subjects.find(item => item.advisoryClassId === advisoryClass.id && !item.isArchived && item.normalizedSubjectKey === subjectKey) || null;
    const incomingIsSpecial = payload?.subject?.isSpecialProgramSubject === true;
    if (!subject) errors.push('The subject in this Grade Transfer File is not an active subject in the Advisory Class. Configure or restore it before importing.');
    if (incomingIsSpecial && (!advisoryClass.isSpecialClass || !subject?.isSpecialProgramSubject)) {
      errors.push('This special-program Grade Transfer File must match an active special subject in a Special Class.');
    }
    if (!incomingIsSpecial && subject?.isSpecialProgramSubject) {
      warnings.push('This older Grade Transfer File does not identify the subject as special-program, but its subject name matches an active special subject. Review the grading percentages before importing.');
    }
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
      proposedSubject: null,
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
        isSpecialProgramSubject: plan.payload.subject?.isSpecialProgramSubject === true,
        specialProgramWeights: Array.isArray(plan.payload.subject?.specialProgramWeights) ? plan.payload.subject.specialProgramWeights.map(Number) : [],
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
    return globalScope.AdvisoryData.normalizeAdvisoryData(profileDb || activeDb()).importBatches
      .filter(item => item.advisoryClassId === advisoryClassId && item.status !== 'undone' && Array.isArray(item.undoMetadata?.entries) && item.undoMetadata.entries.length)
      .sort((left, right) => text(right.importedAt).localeCompare(text(left.importedAt)))[0] || null;
  }

  async function exportAssignment(assignmentId, term, mapePart = '') {
    const profileDb = activeDb();
    const assignment = (profileDb.assignments || []).find(item => item.id === assignmentId);
    if (!assignment) throw new Error('The selected subject class was not found.');
    const strand = mapePart === 'music_arts'
      ? { name: 'Music & Arts', key: 'music_arts' }
      : mapePart === 'pe_health'
        ? { name: 'PE & Health', key: 'pe_health' }
        : null;
    const appVersion = await globalScope.electronAPI.getVersion();
    const payload = buildExportPayload({
      assignment,
      profileDb,
      term,
      appVersion,
      subjectName: strand?.name,
      mapePart: strand?.key,
      getFinalGrade: (source, learnerId, selectedTerm, selectedPart) => selectedPart
        ? globalScope.computeTerm(source, learnerId, selectedTerm, selectedPart).termGrade
        : globalScope.getLearnerTermGradeForExport(source, learnerId, selectedTerm)
    });
    if (!payload.learners.length) throw new Error('No saved final grades were found for the selected term.');
    const result = await globalScope.electronAPI.exportGradeTransfer(JSON.stringify(payload, null, 2), gradeTransferFilename(payload));
    return { payload, result };
  }

  function showExportModal(assignmentId) {
    const profileDb = activeDb();
    const assignment = (profileDb.assignments || []).find(item => item.id === assignmentId);
    if (!assignment) { globalScope.toast('The selected subject class was not found.', 'error'); return; }
    const overlay = document.createElement('div');
    const isMapeh = /mapeh|music, arts, physical education, and health/i.test(text(assignment.subject));
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal"><div class="modal__title">Export Final Grades</div><div class="modal__body"><div class="advisory-transfer-summary"><strong>Grade ${globalScope.esc(assignment.gradeLevel)} - ${globalScope.esc(assignment.section)}</strong><span>${globalScope.esc(assignment.subject)} · SY ${globalScope.esc(assignment.schoolYear || profileDb.schoolYear)}</span></div><div class="field"><label class="field-label">Term</label><select class="field-select" data-export-term><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div><label class="advisory-privacy-notice"><input type="checkbox" data-privacy-confirm><span><strong>Privacy reminder</strong>This Grade Transfer File contains learner names, LRNs, and final grades. Store and share it securely.</span></label></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-export disabled>Continue &amp; Save File</button></div></div>`;
    document.body.appendChild(overlay);
    if (isMapeh) {
      const termField = overlay.querySelector('[data-export-term]')?.closest('.field');
      termField?.insertAdjacentHTML('afterend', '<div class="field"><label class="field-label">MAPEH Submission</label><select class="field-select" data-export-mape-part><option value="music_arts">Music &amp; Arts</option><option value="pe_health">PE &amp; Health</option></select><p class="field-help">Save and send each MAPEH component as a separate Grade Transfer File.</p></div>');
    }
    const privacy = overlay.querySelector('[data-privacy-confirm]');
    const exportButton = overlay.querySelector('[data-export]');
    privacy.addEventListener('change', () => { exportButton.disabled = !privacy.checked; });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      try {
        const { result } = await exportAssignment(assignmentId, overlay.querySelector('[data-export-term]').value, overlay.querySelector('[data-export-mape-part]')?.value || '');
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
      showImportPreview(planImport(activeDb(), advisoryClass, payload, result.name));
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
      const roster = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb()).learners.filter(item => item.advisoryClassId === plan.advisoryClass.id && item.enrollmentStatus !== 'inactive');
      overlay.innerHTML = `<div class="modal advisory-preview-modal"><div class="modal__title">Review Grade Import</div><div class="modal__body advisory-scroll-body"><div class="advisory-transfer-summary"><strong>${globalScope.esc(plan.payload?.subject?.name || 'Unknown subject')} · Term ${globalScope.esc(plan.payload?.term?.number || '—')}</strong><span>${globalScope.esc(plan.payload?.class?.name || '')} · SY ${globalScope.esc(plan.payload?.schoolYear || '')} · ${globalScope.esc(plan.filename)}</span></div>${plan.errors.length ? `<div class="advisory-import-messages advisory-import-messages--error">${plan.errors.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}${plan.warnings.length ? `<div class="advisory-import-messages advisory-import-messages--warning">${plan.warnings.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}<div class="advisory-import-summary"><span><strong>${plan.importableCount}</strong> ready</span><span><strong>${plan.unmatchedCount}</strong> unmatched</span><span><strong>${plan.conflictCount}</strong> conflicts</span><span><strong>${plan.unresolvedConflictCount}</strong> decisions needed</span></div>${plan.conflictCount ? '<div class="advisory-conflict-bulk"><span>Apply to all conflicts:</span><button class="btn btn-ghost btn-sm" data-keep-all>Keep Existing</button><button class="btn btn-primary btn-sm" data-replace-all>Replace with Imported</button></div>' : ''}<div class="advisory-preview-list">${plan.rows.map(row => `<div class="advisory-preview-row advisory-preview-row--${row.status}"><span><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(row.incoming))} · Incoming ${globalScope.esc(row.incoming.finalGrade)}</strong><small>${globalScope.esc(row.incoming.lrn || 'No LRN')} · ${globalScope.esc(statusLabel[row.status] || row.status)}${row.warning ? ` · ${globalScope.esc(row.warning)}` : ''}</small>${row.status === 'conflict' ? `<select class="field-select advisory-conflict-select" data-conflict-row="${row.index}"><option value="">Choose a decision</option><option value="keep" ${row.conflictDecision === 'keep' ? 'selected' : ''}>Keep existing grade (${globalScope.esc(row.existingGrade.finalGrade)})</option><option value="replace" ${row.conflictDecision === 'replace' ? 'selected' : ''}>Replace with imported grade (${globalScope.esc(row.incoming.finalGrade)})</option></select>` : ''}${['unmatched','ambiguous'].includes(row.status) ? `<select class="field-select advisory-match-select" data-match-row="${row.index}"><option value="">Leave unmatched</option>${roster.map(learner => `<option value="${globalScope.esc(learner.id)}">${globalScope.esc(learner.lrn || 'No LRN')} · ${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</option>`).join('')}</select>` : ''}</span></div>`).join('')}</div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-confirm ${plan.canImport ? '' : 'disabled'}>Confirm Import</button></div></div>`;
      overlay.querySelector('.advisory-transfer-summary')?.insertAdjacentHTML('afterbegin', '<span class="advisory-auto-detected">Automatically identified from the file</span>');
      overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
      overlay.querySelector('[data-keep-all]')?.addEventListener('click', () => { applyConflictDecisionToAll(plan, 'keep'); renderPreview(); });
      overlay.querySelector('[data-replace-all]')?.addEventListener('click', () => { applyConflictDecisionToAll(plan, 'replace'); renderPreview(); });
      overlay.querySelectorAll('[data-conflict-row]').forEach(select => select.addEventListener('change', () => {
        if (select.value) setConflictDecision(plan, Number(select.dataset.conflictRow), select.value);
        renderPreview();
      }));
      overlay.querySelectorAll('[data-match-row]').forEach(select => select.addEventListener('change', () => {
        if (select.value) assignUnmatchedLearner(activeDb(), plan, Number(select.dataset.matchRow), select.value);
        renderPreview();
      }));
      overlay.querySelector('[data-confirm]').addEventListener('click', async () => {
        try {
          const result = applyImportPlan(activeDb(), plan);
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
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb());
    const existing = subjectId ? store.subjects.find(item => item.id === subjectId && item.advisoryClassId === advisoryClass.id) : null;
    if (!existing) {
      if (advisoryClass.isSpecialClass) {
        setPanelTab('settings', document.querySelector('.advisory-page'));
        globalScope.toast('Add special subjects in Advisory Settings.', 'info');
      } else globalScope.toast('Additional subjects are available only for a Special Class.', 'warning');
      return;
    }
    const localClasses = (activeDb().assignments || []).filter(item => text(item.schoolYear || activeDb().schoolYear) === text(advisoryClass.schoolYear)
      && text(item.gradeLevel) === text(advisoryClass.gradeLevel)
      && globalScope.AdvisoryRoster.normalizeMatchText(item.section) === globalScope.AdvisoryRoster.normalizeMatchText(advisoryClass.section)
      && (!existing || normalizeSubjectKey(item.subject) === existing.normalizedSubjectKey));
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    const value = (field, fallback = '') => globalScope.esc(existing?.[field] ?? fallback);
    overlay.innerHTML = `
      <div class="modal modal--wide">
        <div class="modal__title">Assign Grade Source</div>
        <div class="modal__body advisory-scroll-body">
          <div class="field"><label class="field-label">Subject</label><input class="field-input" data-subject-field="subjectName" value="${value('subjectName')}" ${existing ? 'readonly' : ''} required><p class="field-help">Subjects are filled in automatically from Grade ${globalScope.esc(advisoryClass.gradeLevel)}. Add another subject only when it is not on the standard list.</p></div>
          <fieldset class="advisory-source-choice"><legend>Where will the grades come from?</legend>
            <label class="advisory-source-option"><input type="radio" name="advisorySourceType" value="grade-transfer-file"><span><strong>Grade Transfer File</strong><small>Recommended when another subject teacher sends the final grades.</small></span></label>
            <label class="advisory-source-option"><input type="radio" name="advisorySourceType" value="local-subject-class"><span><strong>A class in this app</strong><small>Choose a matching class already available on this device.</small></span></label>
            <label class="advisory-source-option"><input type="radio" name="advisorySourceType" value="manual"><span><strong>Manual entry</strong><small>Use when grades will be entered by the adviser.</small></span></label>
          </fieldset>
          <div class="advisory-source-explanation" data-source-help="grade-transfer-file"><strong>No additional setup needed.</strong><span>The app reads the school year, grade and section, subject, and term directly from the Grade Transfer File, then checks them before showing the import preview.</span></div>
          <div class="field" data-source-help="local-subject-class" hidden><label class="field-label">Choose the class</label><select class="field-select" data-local-source-class><option value="">Select a class</option>${localClasses.map(item => `<option value="${globalScope.esc(item.id)}">${globalScope.esc(item.subject)} · Grade ${globalScope.esc(item.gradeLevel)} - ${globalScope.esc(item.section)}</option>`).join('')}</select><p class="field-help">Only classes matching this Advisory Class school year, grade level, and section are listed.</p></div>
          <div class="advisory-source-explanation" data-source-help="manual" hidden><strong>Manual source selected.</strong><span>The subject remains ready for grades entered by the adviser.</span></div>
        </div>
        <div class="modal__actions">${existing.isSpecialProgramSubject ? '<button class="btn btn-danger btn-sm" data-delete-subject>Archive Subject</button>' : ''}<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Source</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const selectedSourceType = existing?.sourceType === 'local-subject-class' || existing?.sourceType === 'manual' ? existing.sourceType : 'grade-transfer-file';
    const sourceRadios = Array.from(overlay.querySelectorAll('input[name="advisorySourceType"]'));
    const localSourceSelect = overlay.querySelector('[data-local-source-class]');
    const matchingLocalClass = localClasses.find(item => item.id === existing?.expectedSourceClassId || text(item.name) === text(existing?.expectedSourceClass));
    if (matchingLocalClass) localSourceSelect.value = matchingLocalClass.id;
    const syncSourceHelp = () => {
      const sourceType = sourceRadios.find(input => input.checked)?.value || 'grade-transfer-file';
      overlay.querySelectorAll('[data-source-help]').forEach(section => { section.hidden = section.dataset.sourceHelp !== sourceType; });
      localSourceSelect.required = sourceType === 'local-subject-class';
    };
    sourceRadios.forEach(input => {
      input.checked = input.value === selectedSourceType;
      input.addEventListener('change', syncSourceHelp);
    });
    syncSourceHelp();
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const subjectName = text(overlay.querySelector('[data-subject-field="subjectName"]').value);
      const sourceType = sourceRadios.find(input => input.checked)?.value || 'grade-transfer-file';
      const selectedLocalClass = localClasses.find(item => item.id === localSourceSelect.value);
      if (sourceType === 'local-subject-class' && !selectedLocalClass) { globalScope.toast('Choose the class that will provide these grades.', 'warning'); localSourceSelect.focus(); return; }
      const values = {
        subjectName,
        sourceType,
        expectedSourceTeacher: sourceType === 'local-subject-class' ? text(selectedLocalClass?.teacherName || activeDb().teacherName) : '',
        expectedSourceClass: sourceType === 'local-subject-class' ? text(selectedLocalClass?.name || `${selectedLocalClass?.subject} · Grade ${selectedLocalClass?.gradeLevel} - ${selectedLocalClass?.section}`) : '',
        expectedSourceClassId: sourceType === 'local-subject-class' ? text(selectedLocalClass?.id) : '',
        expectedGradeLevel: advisoryClass.gradeLevel,
        expectedSection: advisoryClass.section,
        expectedSchoolYear: advisoryClass.schoolYear,
        expectedTerm: '',
        displayOrder: existing?.displayOrder ?? store.subjects.filter(item => item.advisoryClassId === advisoryClass.id).length
      };
      values.normalizedSubjectKey = existing?.normalizedSubjectKey || normalizeSubjectKey(values.subjectName);
      if (!values.subjectName || !values.normalizedSubjectKey) { globalScope.toast('Subject name is required.', 'warning'); return; }
      const duplicate = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb()).subjects.some(item => item.advisoryClassId === advisoryClass.id && item.id !== existing?.id && item.normalizedSubjectKey === values.normalizedSubjectKey);
      if (duplicate) { globalScope.toast('This Advisory subject already exists.', 'warning'); return; }
      globalScope.AdvisoryData.updateSubject(activeDb(), existing.id, values);
      await globalScope.saveDatabase();
      overlay.remove();
      globalScope.AdvisoryRoster.renderWorkspace();
      globalScope.renderDashboardOverview();
      globalScope.toast('Advisory subject saved.', 'success');
    });
    overlay.querySelector('[data-delete-subject]')?.addEventListener('click', () => {
      const gradeCount = store.grades.filter(item => item.advisorySubjectId === existing.id).length;
      globalScope.confirmModal('Archive Special Subject', `Archive ${existing.subjectName}? ${gradeCount ? `${gradeCount} saved final grade record(s) and their source history will be preserved.` : 'No saved grades are attached.'}`, async () => {
        globalScope.AdvisoryData.updateSubject(activeDb(), existing.id, { isArchived: true });
        await globalScope.saveDatabase();
        overlay.remove();
        globalScope.AdvisoryRoster.renderWorkspace();
        globalScope.renderDashboardOverview();
        globalScope.toast('Special subject archived.', 'success');
      });
    });
  }

  function requestUndoLatest(advisoryClassId) {
    const batch = latestUndoableBatch(activeDb(), advisoryClassId);
    if (!batch) { globalScope.toast('No safely undoable import batch is available.', 'info'); return; }
    globalScope.confirmModal('Undo Latest Grade Import', `Undo ${batch.filename || batch.subject}? Grades created by this batch will be removed and replaced grades will be restored.`, async () => {
      try {
        undoImportBatch(activeDb(), batch.id);
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

  function renderWorkspacePanelLegacy(workspace, advisoryClass) {
    const panel = workspace?.querySelector('[data-advisory-grade-panel]');
    if (!panel) return;
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb());
    const allSubjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => a.displayOrder - b.displayOrder);
    const subjects = allSubjects.filter(item => !item.isArchived);
    const activeSpecialSubjects = subjects.filter(item => item.isSpecialProgramSubject);
    const archivedSpecialSubjects = allSubjects.filter(item => item.isSpecialProgramSubject && item.isArchived);
    const learners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id && item.enrollmentStatus !== 'inactive');
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    const batches = store.importBatches.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => text(b.importedAt).localeCompare(text(a.importedAt)));
    panel.innerHTML = `<div class="advisory-grade-panel__header"><div><h3>Grade Consolidation</h3><p>Final grades by learner, subject, and term. Missing records remain visible.</p></div><div class="advisory-grade-panel__actions"><button class="btn btn-ghost btn-sm" type="button" data-add-advisory-subject>Add Subject</button><button class="btn btn-primary btn-sm" type="button" data-import-subject-grades>Import Subject Grades</button></div></div>${subjects.length ? `<div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table advisory-grade-matrix"><thead><tr><th>Learner</th>${subjects.map(subject => `<th colspan="3">${globalScope.esc(subject.subjectName)}</th>`).join('')}</tr><tr><th>LRN / Official Name</th>${subjects.map(() => '<th>T1</th><th>T2</th><th>T3</th>').join('')}</tr></thead><tbody>${learners.map(learner => `<tr><td><small>${globalScope.esc(learner.lrn || 'No LRN')}</small><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td>${subjects.map(subject => ['1','2','3'].map(term => { const grade = grades.find(item => item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === term); return `<td class="${grade ? (grade.conflictStatus && !['none','resolved'].includes(grade.conflictStatus) ? 'has-conflict' : 'has-grade') : 'is-missing'}" title="${grade ? globalScope.esc(grade.sourceClassName || grade.sourceType) : 'Missing grade'}">${grade ? globalScope.esc(grade.finalGrade) : '—'}</td>`; }).join('')).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="advisory-roster__empty">No subjects have been configured. Import the first Grade Transfer File or add a subject manually.</div>'}<section class="advisory-source-management"><h3>Grade Source Management</h3><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Subject</th><th>Expected Source</th><th>Last Import</th><th>Received</th><th>Missing</th><th>Conflicts</th><th></th></tr></thead><tbody>${subjects.length ? subjects.map(subject => { const subjectGrades = grades.filter(item => item.advisorySubjectId === subject.id); const lastBatch = batches.find(batch => normalizeSubjectKey(batch.subject) === subject.normalizedSubjectKey && batch.status !== 'undone'); const expected = learners.length * 3; const conflicts = subjectGrades.filter(grade => grade.conflictStatus && !['none','resolved'].includes(grade.conflictStatus)).length; return `<tr><td><strong>${globalScope.esc(subject.subjectName)}</strong><small>${globalScope.esc(subject.normalizedSubjectKey)}</small></td><td>${globalScope.esc(subject.expectedSourceTeacher || 'Any teacher')}<small>${globalScope.esc(subject.expectedSourceClass || subject.sourceType)}</small></td><td>${lastBatch ? `${globalScope.esc(lastBatch.filename)}<small>${globalScope.esc(lastBatch.importedAt)}</small>` : 'Not imported'}</td><td>${subjectGrades.length}</td><td>${Math.max(0, expected - subjectGrades.length)}</td><td>${conflicts}</td><td><button class="btn btn-ghost btn-sm" data-edit-advisory-subject="${globalScope.esc(subject.id)}">Edit</button></td></tr>`; }).join('') : '<tr><td colspan="7">No subjects configured.</td></tr>'}</tbody></table></div></section><section class="advisory-import-history"><div class="advisory-grade-panel__header"><div><h3>Import History</h3><p>Audit trail for every confirmed Grade Transfer File.</p></div><button class="btn btn-ghost btn-sm" data-undo-latest-import ${latestUndoableBatch(activeDb(), advisoryClass.id) ? '' : 'disabled'}>Undo Latest Import</button></div><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Imported</th><th>File / Source</th><th>Subject / Term</th><th>Results</th><th>Status</th></tr></thead><tbody>${batches.length ? batches.map(batch => `<tr><td>${globalScope.esc(batch.importedAt || '—')}</td><td>${globalScope.esc(batch.filename || 'Unknown file')}<small>${globalScope.esc(batch.sourceTeacher || '')} · ${globalScope.esc(batch.sourceClass || '')}</small></td><td>${globalScope.esc(batch.subject)} · Term ${globalScope.esc(batch.term)}</td><td>${batch.importedCount} imported · ${batch.updatedCount} updated · ${batch.skippedCount} skipped · ${batch.conflictCount} conflicts</td><td>${globalScope.esc(batch.status)}</td></tr>`).join('') : '<tr><td colspan="5">No grade imports recorded.</td></tr>'}</tbody></table></div></section>`;
    panel.querySelector('[data-import-subject-grades]').addEventListener('click', selectImportFile);
    panel.querySelector('[data-add-advisory-subject]').addEventListener('click', () => showSubjectModal());
    panel.querySelectorAll('[data-edit-advisory-subject]').forEach(button => button.addEventListener('click', () => showSubjectModal(button.dataset.editAdvisorySubject)));
    panel.querySelector('[data-undo-latest-import]').addEventListener('click', () => requestUndoLatest(advisoryClass.id));
  }

  function calculateSubjectFinal(grades, learnerId, subjectId) {
    const values = ['1', '2', '3'].map(term => {
      const record = grades.find(item => item.advisoryLearnerId === learnerId && item.advisorySubjectId === subjectId && item.term === term);
      return record && Number.isFinite(Number(record.finalGrade)) ? Number(record.finalGrade) : null;
    });
    return values.every(value => value !== null)
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }

  function mapehComponents(subjects) {
    const musicArts = (subjects || []).find(subject => normalizeSubjectKey(subject.subjectName) === 'MUSIC ARTS');
    const peHealth = (subjects || []).find(subject => normalizeSubjectKey(subject.subjectName) === 'PE HEALTH');
    return musicArts && peHealth ? { musicArts, peHealth } : null;
  }

  function calculateMapehTermAverage(grades, learnerId, subjects, term) {
    const components = mapehComponents(subjects);
    if (!components) return null;
    const values = [components.musicArts, components.peHealth].map(subject => {
      const record = grades.find(item => item.advisoryLearnerId === learnerId && item.advisorySubjectId === subject.id && item.term === String(term));
      return record && Number.isFinite(Number(record.finalGrade)) ? Number(record.finalGrade) : null;
    });
    return values.every(value => value !== null)
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }

  function calculateMapehFinal(grades, learnerId, subjects) {
    const values = ['1', '2', '3'].map(term => calculateMapehTermAverage(grades, learnerId, subjects, term));
    return values.every(value => value !== null)
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  }

  function calculateGeneralAverage(grades, learnerId, subjects) {
    const includedSubjects = (subjects || []).filter(subject => !subject.isArchived && subject.includeInGeneralAverage !== false);
    if (!includedSubjects.length) return null;
    const components = mapehComponents(includedSubjects);
    const regularSubjects = components
      ? includedSubjects.filter(subject => ![components.musicArts.id, components.peHealth.id].includes(subject.id))
      : includedSubjects;
    const finals = regularSubjects.map(subject => calculateSubjectFinal(grades, learnerId, subject.id));
    if (components) finals.push(calculateMapehFinal(grades, learnerId, includedSubjects));
    return finals.every(value => value !== null)
      ? Math.round(finals.reduce((sum, value) => sum + value, 0) / finals.length)
      : null;
  }

  function gradeCell(record, extraClass = '') {
    if (!record) return `<td class="is-missing ${extraClass}" title="Missing grade">&mdash;</td>`;
    const conflict = record.conflictStatus && !['none', 'resolved'].includes(record.conflictStatus);
    return `<td class="${conflict ? 'has-conflict' : 'has-grade'} ${extraClass}" title="${globalScope.esc(record.sourceClassName || record.sourceType)}">${globalScope.esc(record.finalGrade)}</td>`;
  }

  function calculatedGradeCell(value, title, extraClass = '') {
    return `<td class="${value === null ? 'is-missing' : 'has-grade'} ${extraClass}" title="${globalScope.esc(title)}">${value === null ? '&mdash;' : value}</td>`;
  }

  function sourceSummary(subject) {
    if (subject.sourceType === 'local-subject-class') {
      return `<strong>Class in this app</strong><small>${globalScope.esc(subject.expectedSourceClass || 'Source class not selected')}</small>`;
    }
    if (subject.sourceType === 'manual') {
      return '<strong>Manual entry</strong><small>The adviser will enter the grades.</small>';
    }
    return '<strong>Grade Transfer File</strong><small>School year, subject, and term are identified automatically.</small>';
  }

  function setPanelTab(tab, workspace = document) {
    advisoryPanelTab = ['grades', 'sources', 'roster', 'settings'].includes(tab) ? tab : 'grades';
    workspace?.querySelectorAll?.('[data-advisory-panel]').forEach(section => {
      section.hidden = section.dataset.advisoryPanel !== advisoryPanelTab;
    });
    workspace?.querySelectorAll?.('[data-advisory-page-tab]').forEach(button => {
      const active = button.dataset.advisoryPageTab === advisoryPanelTab;
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('tabindex', active ? '0' : '-1');
      button.classList.toggle('btn-primary', active);
      button.classList.toggle('btn-ghost', !active);
    });
  }

  function sortLearnersBySubject(learners, grades, subjectId, direction, subjects = []) {
    if (!subjectId || !['asc', 'desc'].includes(direction)) return learners.slice();
    return learners.map((learner, index) => ({
      learner,
      index,
      grade: subjectId === MAPEH_AVERAGE_ID
        ? calculateMapehFinal(grades, learner.id, subjects)
        : calculateSubjectFinal(grades, learner.id, subjectId)
    }))
      .sort((left, right) => {
        if (left.grade === null && right.grade === null) return left.index - right.index;
        if (left.grade === null) return 1;
        if (right.grade === null) return -1;
        const gradeOrder = direction === 'asc' ? left.grade - right.grade : right.grade - left.grade;
        return gradeOrder || left.index - right.index;
      }).map(item => item.learner);
  }

  function cycleSubjectSort(subjectId) {
    if (advisorySubjectSort.subjectId !== subjectId) advisorySubjectSort = { subjectId, direction: 'desc' };
    else if (advisorySubjectSort.direction === 'desc') advisorySubjectSort = { subjectId, direction: 'asc' };
    else advisorySubjectSort = { subjectId: '', direction: '' };
  }

  function bindAdvisoryMatrixScroller(panel) {
    panel._advisoryMatrixResizeObserver?.disconnect?.();
    const wrap = panel.querySelector('[data-advisory-matrix-scroll-target]');
    const topScroller = panel.querySelector('[data-advisory-matrix-scrollbar]');
    const spacer = topScroller?.querySelector('[data-advisory-matrix-scrollbar-spacer]');
    const matrix = wrap?.querySelector('.advisory-grade-matrix');
    if (!wrap || !topScroller || !spacer || !matrix) return;
    let syncing = false;
    const update = () => {
      spacer.style.width = `${matrix.scrollWidth}px`;
      topScroller.hidden = matrix.scrollWidth <= wrap.clientWidth + 2;
      topScroller.scrollLeft = wrap.scrollLeft;
    };
    topScroller.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      wrap.scrollLeft = topScroller.scrollLeft;
      syncing = false;
    });
    wrap.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      topScroller.scrollLeft = wrap.scrollLeft;
      syncing = false;
    });
    wrap.addEventListener('wheel', event => {
      if (!event.shiftKey || !event.deltaY) return;
      wrap.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    update();
    if (typeof globalScope.ResizeObserver === 'function') {
      panel._advisoryMatrixResizeObserver = new globalScope.ResizeObserver(update);
      panel._advisoryMatrixResizeObserver.observe(wrap);
      panel._advisoryMatrixResizeObserver.observe(matrix);
    }
  }

  function renderWorkspacePanel(workspace, advisoryClass) {
    const panel = workspace?.querySelector('[data-advisory-grade-panel]');
    if (!panel) return;
    const profileDb = activeDb();
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const allSubjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => a.displayOrder - b.displayOrder);
    const subjects = allSubjects.filter(item => !item.isArchived);
    const activeSpecialSubjects = subjects.filter(item => item.isSpecialProgramSubject);
    const archivedSpecialSubjects = allSubjects.filter(item => item.isSpecialProgramSubject && item.isArchived);
    const rosterLearners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id);
    const learners = rosterLearners.filter(item => item.enrollmentStatus !== 'inactive');
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    const batches = store.importBatches.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => text(b.importedAt).localeCompare(text(a.importedAt)));
    const components = mapehComponents(subjects);
    const subjectGroups = subjects.flatMap(subject => [
      { ...subject, derived: false },
      ...(components && subject.id === components.peHealth.id
        ? [{ id: MAPEH_AVERAGE_ID, subjectName: 'MAPEH Average', derived: true }]
        : [])
    ]);
    const sortedLearners = sortLearnersBySubject(learners, grades, advisorySubjectSort.subjectId, advisorySubjectSort.direction, subjects);
    const hasExpandedSubject = subjectGroups.some(subject => expandedAdvisorySubjects.has(subject.id));
    const allTermsExpanded = subjectGroups.length > 0 && subjectGroups.every(subject => expandedAdvisorySubjects.has(subject.id));
    const totalSubjectColumns = subjectGroups.reduce((total, subject) => total + (expandedAdvisorySubjects.has(subject.id) ? 4 : 1), 0);
    const colgroup = `<colgroup><col class="advisory-learner-col">${subjectGroups.map(subject => expandedAdvisorySubjects.has(subject.id)
      ? '<col class="advisory-term-col"><col class="advisory-term-col"><col class="advisory-term-col"><col class="advisory-final-col">'
      : '<col class="advisory-final-col">').join('')}<col class="advisory-general-col"></colgroup>`;

    const matrix = subjects.length ? `
      <div class="advisory-grade-scroll-tools">
        <div class="advisory-grade-matrix-scrollbar" data-advisory-matrix-scrollbar aria-label="Horizontal grade table scrollbar" tabindex="0"><div data-advisory-matrix-scrollbar-spacer></div></div>
        <button type="button" class="advisory-scroll-tip" aria-label="Horizontal scrolling help" data-tooltip="To scroll from left to right, press Shift and use the mouse wheel.">Scroll help</button>
      </div>
      <div class="advisory-grade-matrix-wrap" data-advisory-matrix-scroll-target>
        <table class="advisory-roster-table advisory-grade-matrix ${hasExpandedSubject ? '' : 'advisory-grade-matrix--finals-only'}">
          ${colgroup}
          <thead>
            <tr>
              <th rowspan="2" class="advisory-learner-heading">LRN / Official Name</th>
              ${subjectGroups.map(subject => {
                const activeSort = advisorySubjectSort.subjectId === subject.id ? advisorySubjectSort.direction : '';
                const sortLabel = activeSort === 'desc' ? '&darr;' : activeSort === 'asc' ? '&uarr;' : '&#8597;';
                const expanded = expandedAdvisorySubjects.has(subject.id);
                return `<th colspan="${expanded ? 4 : 1}" class="advisory-subject-heading advisory-subject-end ${subject.derived ? 'advisory-mapeh-average' : ''}"><div class="advisory-subject-heading__controls"><button type="button" class="advisory-subject-sort" data-sort-advisory-subject="${globalScope.esc(subject.id)}" aria-label="Sort learners by ${globalScope.esc(subject.subjectName)} final grade" aria-pressed="${activeSort ? 'true' : 'false'}" title="${globalScope.esc(subject.subjectName)} — sort by final grade"><span class="advisory-subject-name--full">${globalScope.esc(subjectDisplayName(subject.subjectName))}</span><span class="advisory-subject-name--compact">${globalScope.esc(subjectCompactName(subject.subjectName))}</span><small aria-hidden="true">${sortLabel}</small></button><button type="button" class="advisory-subject-expand" data-expand-advisory-subject="${globalScope.esc(subject.id)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Hide' : 'Show'} term grades for ${globalScope.esc(subject.subjectName)}" title="${expanded ? 'Hide Terms 1–3' : 'Show Terms 1–3'}"><span aria-hidden="true">${expanded ? '−' : '+'}</span></button></div></th>`;
              }).join('')}
              <th rowspan="2" class="advisory-general-average">General Average</th>
            </tr>
            <tr>${subjectGroups.map(subject => expandedAdvisorySubjects.has(subject.id)
              ? `<th class="${subject.derived ? 'advisory-mapeh-average' : ''}">T1</th><th class="${subject.derived ? 'advisory-mapeh-average' : ''}">T2</th><th class="${subject.derived ? 'advisory-mapeh-average' : ''}">T3</th><th class="advisory-final-column advisory-subject-end ${subject.derived ? 'advisory-mapeh-average' : ''}">Final</th>`
              : `<th class="advisory-final-column advisory-subject-end ${subject.derived ? 'advisory-mapeh-average' : ''}">Final</th>`).join('')}</tr>
          </thead>
          <tbody>${sortedLearners.length ? sortedLearners.map(learner => {
            const subjectCells = subjectGroups.map(subject => {
              if (subject.derived) {
                const termCells = expandedAdvisorySubjects.has(subject.id) ? ['1', '2', '3'].map(term => calculatedGradeCell(calculateMapehTermAverage(grades, learner.id, subjects, term), `MAPEH Term ${term} average`, 'advisory-mapeh-average')).join('') : '';
                return `${termCells}${calculatedGradeCell(calculateMapehFinal(grades, learner.id, subjects), 'Average of the three MAPEH term averages', 'advisory-final-column advisory-subject-end advisory-mapeh-average')}`;
              }
              const termCells = expandedAdvisorySubjects.has(subject.id) ? ['1', '2', '3'].map(term => gradeCell(grades.find(item => item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === term))).join('') : '';
              const finalGrade = calculateSubjectFinal(grades, learner.id, subject.id);
              return `${termCells}${calculatedGradeCell(finalGrade, 'Average of Terms 1–3', 'advisory-final-column advisory-subject-end')}`;
            }).join('');
            const generalAverage = calculateGeneralAverage(grades, learner.id, subjects);
            return `<tr><td><small>${globalScope.esc(learner.lrn || 'No LRN')}</small><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td>${subjectCells}<td class="advisory-general-average ${generalAverage === null ? 'is-missing' : 'has-grade'}" title="Available when every subject has all three term grades">${generalAverage === null ? '&mdash;' : generalAverage}</td></tr>`;
          }).join('') : `<tr><td colspan="${totalSubjectColumns + 2}"><div class="advisory-roster__empty">No learners are in the official roster. Use Manage Roster to import or add learners.</div></td></tr>`}</tbody>
        </table>
      </div>` : '<div class="advisory-roster__empty">No subjects have been configured. Import the first Grade Transfer File or add a subject manually.</div>';

    const sourceRows = subjects.length ? subjects.map(subject => {
      const subjectGrades = grades.filter(item => item.advisorySubjectId === subject.id);
      const lastBatch = batches.find(batch => normalizeSubjectKey(batch.subject) === subject.normalizedSubjectKey && batch.status !== 'undone');
      const expected = learners.length * 3;
      const conflicts = subjectGrades.filter(grade => grade.conflictStatus && !['none', 'resolved'].includes(grade.conflictStatus)).length;
      return `<tr><td><strong>${globalScope.esc(subject.subjectName)}</strong></td><td>${sourceSummary(subject)}</td><td>${lastBatch ? `${globalScope.esc(lastBatch.filename)}<small>${globalScope.esc(lastBatch.importedAt)}</small>` : 'Not imported'}</td><td>${subjectGrades.length}</td><td>${Math.max(0, expected - subjectGrades.length)}</td><td>${conflicts}</td><td><button class="btn btn-ghost btn-sm" data-edit-advisory-subject="${globalScope.esc(subject.id)}">Assign Source</button></td></tr>`;
    }).join('') : '<tr><td colspan="7">No subjects configured.</td></tr>';

    const historyRows = batches.length ? batches.map(batch => `<tr><td>${globalScope.esc(batch.importedAt || '—')}</td><td>${globalScope.esc(batch.filename || 'Unknown file')}<small>${globalScope.esc(batch.sourceTeacher || '')} · ${globalScope.esc(batch.sourceClass || '')}</small></td><td>${globalScope.esc(batch.subject)} · Term ${globalScope.esc(batch.term)}</td><td>${batch.importedCount} imported · ${batch.updatedCount} updated · ${batch.skippedCount} skipped · ${batch.conflictCount} conflicts</td><td>${globalScope.esc(batch.status)}</td></tr>`).join('') : '<tr><td colspan="5">No grade imports recorded.</td></tr>';

    const rosterRows = rosterLearners.length ? rosterLearners.map((learner, index) => `<tr><td>${index + 1}</td><td class="advisory-roster__lrn">${globalScope.esc(learner.lrn || '—')}</td><td><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td><td>${globalScope.esc(learner.sex || '—')}</td><td>${globalScope.esc(learner.enrollmentStatus || 'active')}</td><td>${globalScope.esc(learner.source || 'manual')}</td><td><div class="advisory-roster-row-actions"><button class="btn btn-ghost btn-sm" type="button" data-edit-advisory-learner="${globalScope.esc(learner.id)}">Edit</button><button class="btn btn-danger btn-sm" type="button" data-remove-advisory-learner="${globalScope.esc(learner.id)}">Remove</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="advisory-roster__empty">No learners yet. Use the roster actions above to import or add learners.</div></td></tr>';
    const availableSections = classSections(profileDb, advisoryClass);
    const hasListedSection = availableSections.some(section => section.toLocaleUpperCase() === text(advisoryClass.section).toLocaleUpperCase());
    const sectionOptions = availableSections.map(section => `<option value="${globalScope.esc(section)}" ${hasListedSection && section.toLocaleUpperCase() === text(advisoryClass.section).toLocaleUpperCase() ? 'selected' : ''}>${globalScope.esc(section)}</option>`).join('');

    panel.innerHTML = `
      <section id="advisoryGradeRecordPanel" role="tabpanel" data-advisory-panel="grades">
        <div class="advisory-grade-panel__header"><div><h3>Learner Grade Record</h3><p>Final grades are shown by default. Show every term at once or use the + beside an individual subject.</p></div><div class="advisory-grade-panel__actions"><button class="btn btn-ghost btn-sm" type="button" data-toggle-advisory-terms aria-pressed="${allTermsExpanded}">${allTermsExpanded ? 'Hide Terms 1–3' : 'Show Terms 1–3'}</button>${advisoryClass.isSpecialClass ? '<button class="btn btn-ghost btn-sm" type="button" data-manage-special-subjects>Manage Special Subjects</button>' : ''}<button class="btn btn-primary btn-sm" type="button" data-import-subject-grades>Import Grade Transfer File</button></div></div>
        ${matrix}
      </section>
      <section id="advisoryGradeSourcesPanel" role="tabpanel" data-advisory-panel="sources" hidden>
        <div class="advisory-source-management"><div class="advisory-source-heading"><h3>Grade Sources</h3><p>Subjects are based on Grade ${globalScope.esc(advisoryClass.gradeLevel)}. Choose how each subject's grades will arrive. Grade Transfer Files identify their own school year, subject, and term.</p></div><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Subject</th><th>Grade Source</th><th>Last Import</th><th>Received</th><th>Missing</th><th>Conflicts</th><th></th></tr></thead><tbody>${sourceRows}</tbody></table></div></div>
        <div class="advisory-import-history"><div class="advisory-grade-panel__header"><div><h3>Import History</h3><p>Audit trail for every confirmed Grade Transfer File.</p></div><button class="btn btn-ghost btn-sm" data-undo-latest-import ${latestUndoableBatch(profileDb, advisoryClass.id) ? '' : 'disabled'}>Undo Latest Import</button></div><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Imported</th><th>File / Source</th><th>Subject / Term</th><th>Results</th><th>Status</th></tr></thead><tbody>${historyRows}</tbody></table></div></div>
      </section>
      <section id="advisoryRosterPanel" role="tabpanel" data-advisory-panel="roster" hidden>
        <div class="advisory-grade-panel__header"><div><h3>Manage Roster</h3><p>Import, add, edit, or remove learners directly from this tab.</p></div><div class="advisory-grade-panel__actions"><button class="btn btn-ghost btn-sm" type="button" data-advisory-import-class>Import from Class</button><button class="btn btn-ghost btn-sm" type="button" data-advisory-import-sf1>Import SF1</button><button class="btn btn-ghost btn-sm" type="button" data-advisory-add-bulk>Bulk Add</button><button class="btn btn-primary btn-sm" type="button" data-advisory-add-manual>Add Learner</button></div></div>
        <div class="advisory-roster-table-wrap advisory-page-roster-table"><table class="advisory-roster-table"><thead><tr><th>#</th><th>LRN</th><th>Official Name</th><th>Sex</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>${rosterRows}</tbody></table></div>
      </section>
      <section id="advisorySettingsPanel" role="tabpanel" data-advisory-panel="settings" hidden>
        <div class="advisory-grade-panel__header"><div><h3>Advisory Settings</h3><p>Edit details that belong specifically to this Advisory Class.</p></div></div>
        <form class="advisory-settings-form" data-advisory-settings-form>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisoryInlineGrade">Grade Level</label><select class="field-select" id="advisoryInlineGrade" required>${Array.from({ length: 10 }, (_, index) => index + 1).map(level => `<option value="${level}" ${String(level) === String(advisoryClass.gradeLevel) ? 'selected' : ''}>Grade ${level}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label" for="advisoryInlineSection">Section</label><select class="field-select" id="advisoryInlineSection" required><option value="">Select a section</option>${sectionOptions}<option value="__custom__" ${hasListedSection ? '' : 'selected'}>Add a different section...</option></select><input class="field-input advisory-custom-section" id="advisoryInlineCustomSection" value="${globalScope.esc(hasListedSection ? '' : advisoryClass.section)}" placeholder="Enter the section name" ${hasListedSection ? 'hidden' : ''}></div>
          </div>
          <div class="special-program-weight-panel">
            <label class="checkbox-row"><input type="checkbox" id="advisoryInlineSpecialClass" ${advisoryClass.isSpecialClass ? 'checked' : ''}> This is a Special Class</label>
            <div data-advisory-inline-special-fields ${advisoryClass.isSpecialClass ? '' : 'hidden'}>
              <div class="field"><label class="field-label" for="advisoryInlineProgramName">Special Program Name</label><input class="field-input" id="advisoryInlineProgramName" value="${globalScope.esc(advisoryClass.specialProgramName || '')}" placeholder="e.g. Journalism or Science"></div>
              ${[0, 1].map(index => { const subject = activeSpecialSubjects[index]; return `<div class="split-row advisory-special-subject-row"><div class="field"><label class="field-label" for="advisoryInlineSpecialSubject${index + 1}">Special Subject ${index + 1}${index ? ' (Optional)' : ''}</label><input class="field-input" id="advisoryInlineSpecialSubject${index + 1}" value="${globalScope.esc(subject?.subjectName || '')}" placeholder="Enter the subject name"></div><label class="checkbox-row"><input type="checkbox" id="advisoryInlineSpecialSubject${index + 1}Ga" ${subject?.includeInGeneralAverage === false ? '' : 'checked'}> Include in General Average</label></div>`; }).join('')}
              <p class="text-muted">Removing a subject or turning off Special Class archives its records. Saved grades and import history are preserved.</p>
              ${archivedSpecialSubjects.length ? `<div class="advisory-archived-special-subjects"><strong>Archived Special Subjects</strong>${archivedSpecialSubjects.map(subject => `<div><span>${globalScope.esc(subject.subjectName)}</span><button class="btn btn-ghost btn-sm" type="button" data-restore-special-subject="${globalScope.esc(subject.id)}">Restore</button></div>`).join('')}</div>` : ''}
            </div>
          </div>
          <label class="checkbox-row"><input type="checkbox" id="advisoryInlineArchived" ${advisoryClass.isArchived ? 'checked' : ''}> Archive this Advisory Class</label>
          <div class="advisory-settings-managed"><strong>Managed in Global Settings</strong><span>School Year: ${globalScope.esc(profileDb.schoolYear || advisoryClass.schoolYear)} · Adviser: ${globalScope.esc(profileDb.teacherName || advisoryClass.adviserName || 'Not provided')} · School: ${globalScope.esc(profileDb.schoolName || advisoryClass.schoolName || 'Not provided')}</span><span>School ID, district, division, and region also come from your global teacher profile.</span></div>
          <div class="advisory-settings-form__actions"><button class="btn btn-primary btn-sm" type="submit">Save Advisory Settings</button></div>
        </form>
      </section>`;
    panel.querySelector('[data-import-subject-grades]')?.addEventListener('click', selectImportFile);
    panel.querySelector('[data-manage-special-subjects]')?.addEventListener('click', () => setPanelTab('settings', workspace));
    panel.querySelector('[data-toggle-advisory-terms]')?.addEventListener('click', () => {
      if (allTermsExpanded) subjectGroups.forEach(subject => expandedAdvisorySubjects.delete(subject.id));
      else subjectGroups.forEach(subject => expandedAdvisorySubjects.add(subject.id));
      renderWorkspacePanel(workspace, advisoryClass);
    });
    panel.querySelectorAll('[data-expand-advisory-subject]').forEach(button => button.addEventListener('click', () => {
      const subjectId = button.dataset.expandAdvisorySubject;
      if (expandedAdvisorySubjects.has(subjectId)) expandedAdvisorySubjects.delete(subjectId);
      else expandedAdvisorySubjects.add(subjectId);
      renderWorkspacePanel(workspace, advisoryClass);
    }));
    panel.querySelectorAll('[data-sort-advisory-subject]').forEach(button => button.addEventListener('click', () => {
      cycleSubjectSort(button.dataset.sortAdvisorySubject);
      renderWorkspacePanel(workspace, advisoryClass);
    }));
    panel.querySelectorAll('[data-edit-advisory-subject]').forEach(button => button.addEventListener('click', () => showSubjectModal(button.dataset.editAdvisorySubject)));
    panel.querySelector('[data-undo-latest-import]')?.addEventListener('click', () => requestUndoLatest(advisoryClass.id));
    panel.querySelector('[data-advisory-import-class]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.showClassImportChooser?.());
    panel.querySelector('[data-advisory-import-sf1]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.importSf1Roster?.());
    panel.querySelector('[data-advisory-add-bulk]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.showBulkModal?.());
    panel.querySelector('[data-advisory-add-manual]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.showLearnerForm?.());
    panel.querySelectorAll('[data-edit-advisory-learner]').forEach(button => button.addEventListener('click', () => globalScope.AdvisoryRoster?.showLearnerForm?.(button.dataset.editAdvisoryLearner)));
    panel.querySelectorAll('[data-remove-advisory-learner]').forEach(button => button.addEventListener('click', () => globalScope.AdvisoryRoster?.removeLearner?.(button.dataset.removeAdvisoryLearner)));
    const settingsForm = panel.querySelector('[data-advisory-settings-form]');
    const sectionSelect = settingsForm?.querySelector('#advisoryInlineSection');
    const customSection = settingsForm?.querySelector('#advisoryInlineCustomSection');
    const syncCustomSection = () => {
      const isCustom = sectionSelect?.value === '__custom__';
      if (!customSection) return;
      customSection.hidden = !isCustom;
      customSection.required = isCustom;
    };
    sectionSelect?.addEventListener('change', syncCustomSection);
    syncCustomSection();
    const specialClassInput = settingsForm?.querySelector('#advisoryInlineSpecialClass');
    const specialFields = settingsForm?.querySelector('[data-advisory-inline-special-fields]');
    const syncInlineSpecialFields = () => {
      if (specialFields) specialFields.hidden = !specialClassInput?.checked;
    };
    specialClassInput?.addEventListener('change', syncInlineSpecialFields);
    syncInlineSpecialFields();
    panel.querySelectorAll('[data-restore-special-subject]').forEach(button => button.addEventListener('click', async () => {
      const subject = archivedSpecialSubjects.find(item => item.id === button.dataset.restoreSpecialSubject);
      if (!subject) return;
      if (!advisoryClass.isSpecialClass) { globalScope.toast('Enable Special Class before restoring a special subject.', 'warning'); return; }
      if (activeSpecialSubjects.length >= 2) { globalScope.toast('Archive or remove an active special subject before restoring another.', 'warning'); return; }
      try {
        syncSpecialProgramSubjects(profileDb, advisoryClass, [...activeSpecialSubjects, subject].map(item => ({
          subjectName: item.subjectName,
          includeInGeneralAverage: item.includeInGeneralAverage
        })));
        await globalScope.saveDatabase();
        globalScope.renderAdvisoryClassPage?.();
        globalScope.AdvisoryGradeTransfer?.setPanelTab?.('settings', document.querySelector('.advisory-page'));
        globalScope.toast(`${subject.subjectName} restored.`, 'success');
      } catch (error) {
        globalScope.toast(error.message || 'The subject could not be restored.', 'error');
      }
    }));
    settingsForm?.addEventListener('submit', async event => {
      event.preventDefault();
      const gradeLevel = settingsForm.querySelector('#advisoryInlineGrade').value.trim();
      const section = sectionSelect.value === '__custom__' ? customSection.value.trim() : sectionSelect.value.trim();
      if (!gradeLevel || !section) {
        globalScope.toast('Grade level and section are required.', 'warning');
        (!gradeLevel ? settingsForm.querySelector('#advisoryInlineGrade') : (sectionSelect.value === '__custom__' ? customSection : sectionSelect)).focus();
        return;
      }
      const archived = settingsForm.querySelector('#advisoryInlineArchived').checked;
      const isSpecialClass = specialClassInput.checked;
      const specialProgramName = settingsForm.querySelector('#advisoryInlineProgramName').value.trim();
      const requestedSpecialSubjects = [1, 2].map(index => ({
        subjectName: settingsForm.querySelector(`#advisoryInlineSpecialSubject${index}`).value.trim(),
        includeInGeneralAverage: settingsForm.querySelector(`#advisoryInlineSpecialSubject${index}Ga`).checked
      })).filter(item => item.subjectName);
      if (isSpecialClass && (!specialProgramName || !requestedSpecialSubjects.length)) {
        globalScope.toast('Enter the Special Program Name and at least one special subject.', 'warning');
        (!specialProgramName ? settingsForm.querySelector('#advisoryInlineProgramName') : settingsForm.querySelector('#advisoryInlineSpecialSubject1')).focus();
        return;
      }
      const willArchiveSpecialSubjects = activeSpecialSubjects.length > (isSpecialClass ? requestedSpecialSubjects.length : 0);
      const archivedSubjectsHaveGrades = willArchiveSpecialSubjects && activeSpecialSubjects.some(subject => grades.some(grade => grade.advisorySubjectId === subject.id));
      const commit = async () => {
        const snapshot = JSON.parse(JSON.stringify(profileDb.advisory));
        try {
          const savedClass = globalScope.AdvisoryData.updateClass(profileDb, advisoryClass.id, {
            schoolYear: profileDb.schoolYear || advisoryClass.schoolYear,
            gradeLevel,
            section,
            adviserName: profileDb.teacherName || advisoryClass.adviserName,
            schoolName: profileDb.schoolName || advisoryClass.schoolName,
            schoolId: profileDb.schoolId || advisoryClass.schoolId,
            district: profileDb.district || advisoryClass.district,
            division: profileDb.division || advisoryClass.division,
            region: profileDb.region || advisoryClass.region,
            isSpecialClass,
            specialProgramName: isSpecialClass ? specialProgramName : '',
            isActive: !archived,
            isArchived: archived
          });
          ensureGradeLevelSubjects(profileDb, savedClass);
          syncSpecialProgramSubjects(profileDb, savedClass, isSpecialClass ? requestedSpecialSubjects : []);
          await globalScope.saveDatabase();
          globalScope.renderDashboardOverview();
          globalScope.syncAdvisorySidebarButton?.();
          globalScope.toast('Advisory settings saved.', 'success');
          if (archived) globalScope.showView?.('dashboard');
          else globalScope.renderAdvisoryClassPage?.();
        } catch (error) {
          profileDb.advisory = snapshot;
          globalScope.toast(error.message || 'Advisory settings could not be saved.', 'error');
        }
      };
      if (archivedSubjectsHaveGrades) globalScope.confirmModal('Archive Special Subject Grades?', 'This change archives one or more special subjects. Their grades, source mappings, and import history will be preserved but excluded from the active record and General Average.', commit);
      else await commit();
    });
    bindAdvisoryMatrixScroller(panel);
    setPanelTab(advisoryPanelTab, workspace);
  }

  const api = {
    FORMAT,
    SCHEMA_VERSION,
    normalizeSubjectKey,
    standardSubjectsForGrade,
    ensureGradeLevelSubjects,
    syncSpecialProgramSubjects,
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
    calculateSubjectFinal,
    calculateMapehTermAverage,
    calculateMapehFinal,
    calculateGeneralAverage,
    subjectDisplayName,
    subjectCompactName,
    sortLearnersBySubject,
    setPanelTab,
    showExportModal,
    showSubjectModal,
    selectImportFile,
    renderWorkspacePanel
  };
  globalScope.AdvisoryGradeTransfer = api;
  globalScope.showGradeTransferExportModal = showExportModal;
  globalScope.importAdvisorySubjectGrades = selectImportFile;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
