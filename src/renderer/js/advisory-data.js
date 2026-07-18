/**
 * Advisory Class persistent data model and migration helpers.
 *
 * Advisory records live inside the active profile database so the existing
 * local save, encryption, rolling-backup, and restore paths include them.
 * This module is deliberately UI-independent to keep migrations testable.
 */
(function initAdvisoryData(globalScope) {
  'use strict';

  const ADVISORY_SCHEMA_VERSION = 2;
  const COLLECTIONS = Object.freeze({
    classes: 'advisory-class',
    learners: 'advisory-learner',
    subjects: 'advisory-subject',
    grades: 'advisory-grade',
    importBatches: 'grade-import',
    sourceMappings: 'subject-source'
  });

  function nowIso() {
    return new Date().toISOString();
  }

  function cleanString(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function createId(prefix) {
    const cryptoApi = globalScope && globalScope.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return `${prefix}-${cryptoApi.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createAdvisoryStore() {
    return {
      schemaVersion: ADVISORY_SCHEMA_VERSION,
      classes: [],
      learners: [],
      subjects: [],
      grades: [],
      importBatches: [],
      sourceMappings: []
    };
  }

  function normalizeTimestamp(value) {
    return cleanString(value);
  }

  function normalizeClass(record) {
    const item = record && typeof record === 'object' ? record : {};
    const createdAt = normalizeTimestamp(item.createdAt);
    return {
      ...item,
      id: cleanString(item.id) || createId(COLLECTIONS.classes),
      schoolYear: cleanString(item.schoolYear),
      gradeLevel: cleanString(item.gradeLevel),
      section: cleanString(item.section),
      adviserName: cleanString(item.adviserName),
      schoolName: cleanString(item.schoolName),
      schoolId: cleanString(item.schoolId),
      district: cleanString(item.district),
      division: cleanString(item.division),
      region: cleanString(item.region),
      isSpecialClass: item.isSpecialClass === true,
      specialProgramName: cleanString(item.specialProgramName),
      isActive: item.isActive === true,
      isArchived: item.isArchived === true,
      createdAt,
      updatedAt: normalizeTimestamp(item.updatedAt) || createdAt
    };
  }

  function normalizeLearner(record) {
    const item = record && typeof record === 'object' ? record : {};
    const createdAt = normalizeTimestamp(item.createdAt);
    return {
      ...item,
      id: cleanString(item.id) || createId(COLLECTIONS.learners),
      advisoryClassId: cleanString(item.advisoryClassId),
      linkedLearnerId: cleanString(item.linkedLearnerId),
      lrn: cleanString(item.lrn),
      lastName: cleanString(item.lastName),
      firstName: cleanString(item.firstName),
      middleName: cleanString(item.middleName),
      extensionName: cleanString(item.extensionName),
      sex: cleanString(item.sex).toUpperCase(),
      birthdate: typeof globalScope.normalizeLearnerBirthdate === 'function'
        ? globalScope.normalizeLearnerBirthdate(item.birthdate ?? item.birthDate ?? item.dateOfBirth)
        : cleanString(item.birthdate),
      enrollmentStatus: cleanString(item.enrollmentStatus) || 'active',
      source: cleanString(item.source) || 'manual',
      createdAt,
      updatedAt: normalizeTimestamp(item.updatedAt) || createdAt
    };
  }

  function normalizeSubject(record) {
    const item = record && typeof record === 'object' ? record : {};
    const createdAt = normalizeTimestamp(item.createdAt);
    return {
      ...item,
      id: cleanString(item.id) || createId(COLLECTIONS.subjects),
      advisoryClassId: cleanString(item.advisoryClassId),
      subjectName: cleanString(item.subjectName),
      normalizedSubjectKey: cleanString(item.normalizedSubjectKey).toUpperCase(),
      expectedSourceTeacher: cleanString(item.expectedSourceTeacher),
      expectedSourceClass: cleanString(item.expectedSourceClass),
      expectedGradeLevel: cleanString(item.expectedGradeLevel),
      expectedSection: cleanString(item.expectedSection),
      expectedSchoolYear: cleanString(item.expectedSchoolYear),
      expectedTerm: cleanString(item.expectedTerm),
      sourceType: cleanString(item.sourceType) || 'grade-transfer-file',
      displayOrder: Number.isFinite(Number(item.displayOrder)) ? Number(item.displayOrder) : 0,
      isSpecialProgramSubject: item.isSpecialProgramSubject === true,
      includeInGeneralAverage: item.includeInGeneralAverage !== false,
      isArchived: item.isArchived === true,
      isLegacySubject: item.isLegacySubject === true,
      createdAt,
      updatedAt: normalizeTimestamp(item.updatedAt) || createdAt
    };
  }

  function normalizeGrade(record) {
    const item = record && typeof record === 'object' ? record : {};
    const createdAt = normalizeTimestamp(item.createdAt);
    return {
      ...item,
      id: cleanString(item.id) || createId(COLLECTIONS.grades),
      advisoryClassId: cleanString(item.advisoryClassId),
      advisoryLearnerId: cleanString(item.advisoryLearnerId),
      advisorySubjectId: cleanString(item.advisorySubjectId),
      schoolYear: cleanString(item.schoolYear),
      learnerLrn: cleanString(item.learnerLrn),
      subjectName: cleanString(item.subjectName),
      normalizedSubjectKey: cleanString(item.normalizedSubjectKey).toUpperCase(),
      gradeLevel: cleanString(item.gradeLevel),
      section: cleanString(item.section),
      term: cleanString(item.term),
      finalGrade: item.finalGrade === '' || item.finalGrade === null || item.finalGrade === undefined
        ? null
        : Number(item.finalGrade),
      gradeStatus: cleanString(item.gradeStatus) || 'final',
      sourceType: cleanString(item.sourceType) || 'manual',
      sourceClassId: cleanString(item.sourceClassId),
      sourceClassName: cleanString(item.sourceClassName),
      sourceTeacherName: cleanString(item.sourceTeacherName),
      exportId: cleanString(item.exportId),
      importBatchId: cleanString(item.importBatchId),
      exportedAt: normalizeTimestamp(item.exportedAt),
      importedAt: normalizeTimestamp(item.importedAt),
      validationStatus: cleanString(item.validationStatus) || 'valid',
      conflictStatus: cleanString(item.conflictStatus) || 'none',
      remarks: cleanString(item.remarks),
      adviserEditAllowed: item.adviserEditAllowed === true,
      submittedFinalGrade: item.submittedFinalGrade === '' || item.submittedFinalGrade === null || item.submittedFinalGrade === undefined
        ? (item.finalGrade === '' || item.finalGrade === null || item.finalGrade === undefined ? null : Number(item.finalGrade))
        : Number(item.submittedFinalGrade),
      adviserModifiedAt: normalizeTimestamp(item.adviserModifiedAt),
      adviserModifiedBy: cleanString(item.adviserModifiedBy),
      createdAt,
      updatedAt: normalizeTimestamp(item.updatedAt) || createdAt
    };
  }

  function normalizeImportBatch(record) {
    const item = record && typeof record === 'object' ? record : {};
    const createdAt = normalizeTimestamp(item.createdAt || item.importedAt);
    return {
      ...item,
      id: cleanString(item.id) || createId(COLLECTIONS.importBatches),
      advisoryClassId: cleanString(item.advisoryClassId),
      exportId: cleanString(item.exportId),
      filename: cleanString(item.filename),
      fileFingerprint: cleanString(item.fileFingerprint),
      schemaVersion: cleanString(item.schemaVersion),
      schoolYear: cleanString(item.schoolYear),
      subject: cleanString(item.subject),
      term: cleanString(item.term),
      sourceTeacher: cleanString(item.sourceTeacher),
      sourceClass: cleanString(item.sourceClass),
      exportedAt: normalizeTimestamp(item.exportedAt),
      importedAt: normalizeTimestamp(item.importedAt),
      totalRecords: Number(item.totalRecords) || 0,
      importedCount: Number(item.importedCount) || 0,
      skippedCount: Number(item.skippedCount) || 0,
      updatedCount: Number(item.updatedCount) || 0,
      unmatchedCount: Number(item.unmatchedCount) || 0,
      invalidCount: Number(item.invalidCount) || 0,
      conflictCount: Number(item.conflictCount) || 0,
      status: cleanString(item.status) || 'pending',
      conflictDecisions: item.conflictDecisions && typeof item.conflictDecisions === 'object'
        ? item.conflictDecisions
        : {},
      undoMetadata: item.undoMetadata && typeof item.undoMetadata === 'object'
        ? item.undoMetadata
        : {},
      adviserEditAllowed: item.adviserEditAllowed === true,
      adviserModificationNote: cleanString(item.adviserModificationNote).slice(0, 500),
      createdAt,
      updatedAt: normalizeTimestamp(item.updatedAt) || createdAt
    };
  }

  function normalizeSourceMapping(record) {
    const item = record && typeof record === 'object' ? record : {};
    const createdAt = normalizeTimestamp(item.createdAt);
    return {
      ...item,
      id: cleanString(item.id) || createId(COLLECTIONS.sourceMappings),
      advisoryClassId: cleanString(item.advisoryClassId),
      importedSubjectName: cleanString(item.importedSubjectName),
      importedNormalizedKey: cleanString(item.importedNormalizedKey).toUpperCase(),
      advisorySubjectId: cleanString(item.advisorySubjectId),
      sourceTeacher: cleanString(item.sourceTeacher),
      sourceClass: cleanString(item.sourceClass),
      schoolYear: cleanString(item.schoolYear),
      createdAt,
      updatedAt: normalizeTimestamp(item.updatedAt) || createdAt
    };
  }

  const NORMALIZERS = {
    classes: normalizeClass,
    learners: normalizeLearner,
    subjects: normalizeSubject,
    grades: normalizeGrade,
    importBatches: normalizeImportBatch,
    sourceMappings: normalizeSourceMapping
  };

  function migrationSubjectKeysForGrade(gradeLevel) {
    const grade = Number.parseInt(gradeLevel, 10);
    const common = ['FILIPINO', 'ENGLISH', 'MATHEMATICS', 'SCIENCE', 'ARALING PANLIPUNAN', 'MUSIC ARTS', 'PE HEALTH', 'MAPEH'];
    if (grade === 1) return new Set(['LANGUAGE', 'READING AND LITERACY', 'MATHEMATICS', 'MAKABANSA', 'GOOD MANNERS AND RIGHT CONDUCT GMRC', 'ARTS AND PHYSICAL EDUCATION']);
    if (grade === 2) return new Set([...common, 'MAKABANSA', 'GOOD MANNERS AND RIGHT CONDUCT GMRC']);
    if (grade === 3) return new Set([...common, 'MAKABANSA', 'GOOD MANNERS AND RIGHT CONDUCT GMRC']);
    if (grade >= 4 && grade <= 5) return new Set([...common, 'GOOD MANNERS AND RIGHT CONDUCT GMRC', 'EDUKASYONG PANTAHANAN AT PANGKABUHAYAN EPP']);
    if (grade === 6) return new Set([...common, 'GOOD MANNERS AND RIGHT CONDUCT GMRC', 'TECHNOLOGY AND LIVELIHOOD EDUCATION TLE']);
    if (grade >= 7 && grade <= 10) return new Set([...common, 'VALUES EDUCATION', 'TECHNOLOGY AND LIVELIHOOD EDUCATION TLE']);
    return new Set();
  }

  function normalizeAdvisoryData(profileDb) {
    if (!profileDb || typeof profileDb !== 'object') {
      throw new TypeError('A profile database object is required.');
    }
    const hasAdvisoryStore = Object.prototype.hasOwnProperty.call(profileDb, 'advisory');
    if (hasAdvisoryStore && (!profileDb.advisory || typeof profileDb.advisory !== 'object' || Array.isArray(profileDb.advisory))) {
      throw new TypeError('The Advisory Class database must be an object. No data was changed.');
    }
    const source = hasAdvisoryStore ? profileDb.advisory : createAdvisoryStore();
    const sourceVersion = Number(source.schemaVersion);
    const normalized = {
      ...source,
      schemaVersion: Number.isFinite(sourceVersion) && sourceVersion > ADVISORY_SCHEMA_VERSION
        ? sourceVersion
        : ADVISORY_SCHEMA_VERSION
    };
    Object.keys(NORMALIZERS).forEach(collection => {
      const hasCollection = Object.prototype.hasOwnProperty.call(source, collection);
      if (hasCollection && !Array.isArray(source[collection])) {
        throw new TypeError(`The Advisory Class ${collection} collection must be an array. No data was changed.`);
      }
      const rows = hasCollection ? source[collection] : [];
      normalized[collection] = rows.map(NORMALIZERS[collection]);
    });
    if (Number.isFinite(sourceVersion) && sourceVersion < 2) {
      const classesById = new Map(normalized.classes.map(item => [item.id, item]));
      normalized.subjects.forEach(subject => {
        const advisoryClass = classesById.get(subject.advisoryClassId);
        const standardKeys = migrationSubjectKeysForGrade(advisoryClass?.gradeLevel);
        if (!standardKeys.has(subject.normalizedSubjectKey)) subject.isLegacySubject = true;
      });
    }
    profileDb.advisory = normalized;
    return normalized;
  }

  function rosterImportSources(profileDb, currentAssignmentId = '') {
    if (!profileDb || typeof profileDb !== 'object') return [];
    const assignmentSources = (profileDb.assignments || [])
      .filter(item => item.id !== currentAssignmentId)
      .map(item => ({
        ...item,
        sourceType: 'class-load',
        learners: Array.isArray(item.learners) ? item.learners : []
      }));
    const store = normalizeAdvisoryData(profileDb);
    const advisorySources = store.classes
      .filter(item => !item.isArchived)
      .map(item => ({
        id: `advisory:${item.id}`,
        sourceRecordId: item.id,
        sourceType: 'advisory-class',
        schoolYear: item.schoolYear,
        gradeLevel: item.gradeLevel,
        section: item.section,
        subject: 'Advisory Class',
        learners: store.learners.filter(learner => learner.advisoryClassId === item.id && learner.enrollmentStatus !== 'inactive')
      }));
    return [...assignmentSources, ...advisorySources];
  }

  function requireStore(profileDb) {
    return normalizeAdvisoryData(profileDb);
  }

  function requireClass(store, advisoryClassId) {
    const item = store.classes.find(row => row.id === advisoryClassId);
    if (!item) throw new Error('Advisory Class was not found.');
    return item;
  }

  function createRecord(profileDb, collection, values) {
    const store = requireStore(profileDb);
    const timestamp = nowIso();
    const record = NORMALIZERS[collection]({ ...values, createdAt: values?.createdAt || timestamp, updatedAt: timestamp });
    if (store[collection].some(item => item.id === record.id)) {
      throw new Error(`Duplicate ${collection} record ID.`);
    }
    store[collection].push(record);
    return record;
  }

  function updateRecord(profileDb, collection, id, changes) {
    const store = requireStore(profileDb);
    const index = store[collection].findIndex(item => item.id === id);
    if (index < 0) throw new Error(`${collection} record was not found.`);
    const current = store[collection][index];
    const updated = NORMALIZERS[collection]({ ...current, ...changes, id: current.id, createdAt: current.createdAt, updatedAt: nowIso() });
    store[collection][index] = updated;
    return updated;
  }

  function deleteRecord(profileDb, collection, id) {
    const store = requireStore(profileDb);
    const index = store[collection].findIndex(item => item.id === id);
    if (index < 0) return false;
    store[collection].splice(index, 1);
    return true;
  }

  function deleteLearner(profileDb, id) {
    const store = requireStore(profileDb);
    const index = store.learners.findIndex(item => item.id === id);
    if (index < 0) return false;
    store.learners.splice(index, 1);
    store.grades = store.grades.filter(item => item.advisoryLearnerId !== id);
    return true;
  }

  function deleteSubject(profileDb, id) {
    const store = requireStore(profileDb);
    const index = store.subjects.findIndex(item => item.id === id);
    if (index < 0) return false;
    store.subjects.splice(index, 1);
    store.grades = store.grades.filter(item => item.advisorySubjectId !== id);
    store.sourceMappings = store.sourceMappings.filter(item => item.advisorySubjectId !== id);
    return true;
  }

  function deleteImportBatch(profileDb, id) {
    const store = requireStore(profileDb);
    const index = store.importBatches.findIndex(item => item.id === id);
    if (index < 0) return false;
    store.importBatches.splice(index, 1);
    store.grades.forEach(item => {
      if (item.importBatchId === id) item.importBatchId = '';
    });
    return true;
  }

  function createClass(profileDb, values) {
    const store = requireStore(profileDb);
    const candidate = normalizeClass(values || {});
    validateClassIdentity(candidate);
    if (candidate.isActive && store.classes.some(item => item.schoolYear === candidate.schoolYear && item.isActive)) {
      throw new Error('Only one active Advisory Class is allowed for a school year.');
    }
    return createRecord(profileDb, 'classes', candidate);
  }

  function validateClassIdentity(candidate) {
    if (!candidate.schoolYear || !candidate.gradeLevel || !candidate.section || !candidate.adviserName) {
      throw new Error('School year, grade level, section, and adviser name are required.');
    }
    if (candidate.isActive && candidate.isArchived) {
      throw new Error('An archived Advisory Class cannot also be active.');
    }
    if (candidate.isSpecialClass && !candidate.specialProgramName) {
      throw new Error('Special program name is required for a Special Class.');
    }
  }

  function updateClass(profileDb, id, changes) {
    const store = requireStore(profileDb);
    const current = requireClass(store, id);
    const candidate = normalizeClass({ ...current, ...(changes || {}), id: current.id, createdAt: current.createdAt });
    validateClassIdentity(candidate);
    const nextYear = cleanString(changes?.schoolYear ?? current.schoolYear);
    const nextActive = changes?.isActive === undefined ? current.isActive : changes.isActive === true;
    if (nextActive && store.classes.some(item => item.id !== id && item.schoolYear === nextYear && item.isActive)) {
      throw new Error('Only one active Advisory Class is allowed for a school year.');
    }
    return updateRecord(profileDb, 'classes', id, changes || {});
  }

  function deleteClass(profileDb, id) {
    const store = requireStore(profileDb);
    if (!store.classes.some(item => item.id === id)) return false;
    const subjectIds = new Set(store.subjects.filter(item => item.advisoryClassId === id).map(item => item.id));
    store.classes = store.classes.filter(item => item.id !== id);
    store.learners = store.learners.filter(item => item.advisoryClassId !== id);
    store.subjects = store.subjects.filter(item => item.advisoryClassId !== id);
    store.grades = store.grades.filter(item => item.advisoryClassId !== id);
    store.importBatches = store.importBatches.filter(item => item.advisoryClassId !== id);
    store.sourceMappings = store.sourceMappings.filter(item => item.advisoryClassId !== id && !subjectIds.has(item.advisorySubjectId));
    return true;
  }

  function createChild(profileDb, collection, values) {
    const store = requireStore(profileDb);
    const candidate = NORMALIZERS[collection](values || {});
    validateChildRecord(store, collection, candidate);
    return createRecord(profileDb, collection, candidate);
  }

  function validateChildRecord(store, collection, candidate, currentId = '') {
    requireClass(store, candidate.advisoryClassId);
    if (collection === 'learners') {
      if (!candidate.lastName || !candidate.firstName) throw new Error('Learner first name and last name are required.');
      if (candidate.lrn && !/^\d{12}$/.test(candidate.lrn)) throw new Error('LRN must contain exactly 12 digits.');
      if (candidate.birthdate && typeof globalScope.validateLearnerBirthdate === 'function' && globalScope.validateLearnerBirthdate(candidate.birthdate)) {
        throw new Error(globalScope.validateLearnerBirthdate(candidate.birthdate));
      }
      if (candidate.lrn && store.learners.some(item => item.id !== currentId && item.advisoryClassId === candidate.advisoryClassId && item.lrn === candidate.lrn)) {
        throw new Error('This LRN already belongs to another Advisory learner.');
      }
    }
    if (collection === 'subjects') {
      if (!candidate.subjectName || !candidate.normalizedSubjectKey) throw new Error('Subject name and normalized subject key are required.');
      if (store.subjects.some(item => item.id !== currentId && item.advisoryClassId === candidate.advisoryClassId && item.normalizedSubjectKey === candidate.normalizedSubjectKey)) {
        throw new Error('This subject already exists in the Advisory Class.');
      }
      const advisoryClass = store.classes.find(item => item.id === candidate.advisoryClassId);
      if (candidate.isSpecialProgramSubject && !advisoryClass?.isSpecialClass) {
        throw new Error('Special-program subjects require a Special Class.');
      }
      if (candidate.isSpecialProgramSubject && !candidate.isArchived) {
        const activeSpecialCount = store.subjects.filter(item => item.id !== currentId
          && item.advisoryClassId === candidate.advisoryClassId
          && item.isSpecialProgramSubject
          && !item.isArchived).length;
        if (activeSpecialCount >= 2) throw new Error('A Special Class can have at most two active special-program subjects.');
      }
    }
    if (collection === 'sourceMappings') {
      const subject = store.subjects.find(item => item.id === candidate.advisorySubjectId);
      if (!subject || subject.advisoryClassId !== candidate.advisoryClassId) {
        throw new Error('The source mapping subject must belong to the selected Advisory Class.');
      }
    }
  }

  function updateChild(profileDb, collection, id, changes) {
    const store = requireStore(profileDb);
    const current = store[collection].find(item => item.id === id);
    if (!current) throw new Error(`${collection} record was not found.`);
    const candidate = NORMALIZERS[collection]({ ...current, ...(changes || {}), id: current.id, createdAt: current.createdAt });
    if (candidate.advisoryClassId !== current.advisoryClassId) throw new Error('An Advisory child record cannot be moved to another class.');
    validateChildRecord(store, collection, candidate, id);
    return updateRecord(profileDb, collection, id, changes || {});
  }

  function validateGradeRecord(store, candidate, currentId = '') {
    requireClass(store, candidate.advisoryClassId);
    const learner = store.learners.find(item => item.id === candidate.advisoryLearnerId);
    const subject = store.subjects.find(item => item.id === candidate.advisorySubjectId);
    if (!learner || learner.advisoryClassId !== candidate.advisoryClassId) throw new Error('The grade learner must belong to the selected Advisory Class.');
    if (!subject || subject.advisoryClassId !== candidate.advisoryClassId) throw new Error('The grade subject must belong to the selected Advisory Class.');
    if (candidate.importBatchId) {
      const batch = store.importBatches.find(item => item.id === candidate.importBatchId);
      if (!batch || batch.advisoryClassId !== candidate.advisoryClassId) throw new Error('The grade import batch must belong to the selected Advisory Class.');
    }
    if (!candidate.term) throw new Error('A grading term is required.');
    if (candidate.finalGrade === null || !Number.isFinite(candidate.finalGrade)) throw new Error('A finite final grade is required.');
    const key = [candidate.advisoryClassId, candidate.advisoryLearnerId, candidate.advisorySubjectId, candidate.term].join('|');
    if (store.grades.some(item => item.id !== currentId && [item.advisoryClassId, item.advisoryLearnerId, item.advisorySubjectId, item.term].join('|') === key)) {
      throw new Error('A final grade already exists for this learner, subject, and term.');
    }
  }

  function createGrade(profileDb, values) {
    const store = requireStore(profileDb);
    const candidate = normalizeGrade(values || {});
    validateGradeRecord(store, candidate);
    return createRecord(profileDb, 'grades', candidate);
  }

  function updateGrade(profileDb, id, changes) {
    const store = requireStore(profileDb);
    const current = store.grades.find(item => item.id === id);
    if (!current) throw new Error('grades record was not found.');
    const candidate = normalizeGrade({ ...current, ...(changes || {}), id: current.id, createdAt: current.createdAt });
    const identityFields = ['advisoryClassId', 'advisoryLearnerId', 'advisorySubjectId', 'term'];
    if (identityFields.some(field => candidate[field] !== current[field])) throw new Error('A grade identity cannot be changed after creation.');
    validateGradeRecord(store, candidate, id);
    return updateRecord(profileDb, 'grades', id, changes || {});
  }

  function checkAdvisoryIntegrity(profileDb) {
    const store = requireStore(profileDb);
    const errors = [];
    const warnings = [];
    const ids = {};
    Object.keys(NORMALIZERS).forEach(collection => {
      ids[collection] = new Set();
      store[collection].forEach(item => {
        if (ids[collection].has(item.id)) errors.push({ code: 'duplicate-id', collection, id: item.id });
        ids[collection].add(item.id);
      });
    });

    const classIds = ids.classes;
    const learnerIds = ids.learners;
    const subjectIds = ids.subjects;
    const batchIds = ids.importBatches;
    const learnersById = new Map(store.learners.map(item => [item.id, item]));
    const subjectsById = new Map(store.subjects.map(item => [item.id, item]));
    const batchesById = new Map(store.importBatches.map(item => [item.id, item]));
    if (store.schemaVersion > ADVISORY_SCHEMA_VERSION) {
      warnings.push({ code: 'newer-schema-version', schemaVersion: store.schemaVersion, supportedVersion: ADVISORY_SCHEMA_VERSION });
    }
    ['learners', 'subjects', 'grades', 'importBatches', 'sourceMappings'].forEach(collection => {
      store[collection].forEach(item => {
        if (!classIds.has(item.advisoryClassId)) errors.push({ code: 'orphan-class-reference', collection, id: item.id });
      });
    });
    store.grades.forEach(item => {
      if (!learnerIds.has(item.advisoryLearnerId)) errors.push({ code: 'orphan-learner-reference', collection: 'grades', id: item.id });
      if (!subjectIds.has(item.advisorySubjectId)) errors.push({ code: 'orphan-subject-reference', collection: 'grades', id: item.id });
      if (item.importBatchId && !batchIds.has(item.importBatchId)) warnings.push({ code: 'missing-import-batch', collection: 'grades', id: item.id });
      const learner = learnersById.get(item.advisoryLearnerId);
      const subject = subjectsById.get(item.advisorySubjectId);
      const batch = batchesById.get(item.importBatchId);
      if (learner && learner.advisoryClassId !== item.advisoryClassId) errors.push({ code: 'cross-class-learner-reference', collection: 'grades', id: item.id });
      if (subject && subject.advisoryClassId !== item.advisoryClassId) errors.push({ code: 'cross-class-subject-reference', collection: 'grades', id: item.id });
      if (batch && batch.advisoryClassId !== item.advisoryClassId) errors.push({ code: 'cross-class-import-batch-reference', collection: 'grades', id: item.id });
      if (!item.term) errors.push({ code: 'missing-grade-term', collection: 'grades', id: item.id });
      if (item.finalGrade !== null && !Number.isFinite(item.finalGrade)) errors.push({ code: 'invalid-final-grade', collection: 'grades', id: item.id });
    });
    store.sourceMappings.forEach(item => {
      if (!subjectIds.has(item.advisorySubjectId)) errors.push({ code: 'orphan-subject-reference', collection: 'sourceMappings', id: item.id });
      const subject = subjectsById.get(item.advisorySubjectId);
      if (subject && subject.advisoryClassId !== item.advisoryClassId) errors.push({ code: 'cross-class-subject-reference', collection: 'sourceMappings', id: item.id });
    });

    store.classes.forEach(item => {
      if (!item.schoolYear || !item.gradeLevel || !item.section || !item.adviserName) errors.push({ code: 'incomplete-class-identity', collection: 'classes', id: item.id });
      if (item.isActive && item.isArchived) errors.push({ code: 'active-archived-class', collection: 'classes', id: item.id });
    });
    store.learners.forEach(item => {
      if (!item.lastName || !item.firstName) errors.push({ code: 'incomplete-learner-name', collection: 'learners', id: item.id });
      if (item.lrn && !/^\d{12}$/.test(item.lrn)) errors.push({ code: 'invalid-lrn', collection: 'learners', id: item.id });
    });
    store.subjects.forEach(item => {
      if (!item.subjectName || !item.normalizedSubjectKey) errors.push({ code: 'incomplete-subject-identity', collection: 'subjects', id: item.id });
    });

    const activeYears = new Set();
    store.classes.filter(item => item.isActive).forEach(item => {
      if (activeYears.has(item.schoolYear)) errors.push({ code: 'multiple-active-classes', schoolYear: item.schoolYear });
      activeYears.add(item.schoolYear);
    });

    const learnerKeys = new Set();
    store.learners.forEach(item => {
      if (!item.lrn) return;
      const key = `${item.advisoryClassId}|${item.lrn}`;
      if (learnerKeys.has(key)) errors.push({ code: 'duplicate-lrn', advisoryClassId: item.advisoryClassId, lrn: item.lrn });
      learnerKeys.add(key);
    });
    const gradeKeys = new Set();
    store.grades.forEach(item => {
      const key = `${item.advisoryClassId}|${item.advisoryLearnerId}|${item.advisorySubjectId}|${item.term}`;
      if (gradeKeys.has(key)) errors.push({ code: 'duplicate-grade', id: item.id });
      gradeKeys.add(key);
    });
    const subjectKeys = new Set();
    store.subjects.forEach(item => {
      const key = `${item.advisoryClassId}|${item.normalizedSubjectKey}`;
      if (subjectKeys.has(key)) errors.push({ code: 'duplicate-subject', advisoryClassId: item.advisoryClassId, normalizedSubjectKey: item.normalizedSubjectKey });
      subjectKeys.add(key);
    });
    return { schemaVersion: store.schemaVersion, errors, warnings, isValid: errors.length === 0 };
  }

  const api = {
    ADVISORY_SCHEMA_VERSION,
    createAdvisoryStore,
    normalizeAdvisoryData,
    rosterImportSources,
    checkAdvisoryIntegrity,
    createClass,
    updateClass,
    deleteClass,
    createLearner: (db, values) => createChild(db, 'learners', values),
    updateLearner: (db, id, changes) => updateChild(db, 'learners', id, changes),
    deleteLearner,
    createSubject: (db, values) => createChild(db, 'subjects', values),
    updateSubject: (db, id, changes) => updateChild(db, 'subjects', id, changes),
    deleteSubject,
    createGrade,
    updateGrade,
    deleteGrade: (db, id) => deleteRecord(db, 'grades', id),
    createImportBatch: (db, values) => createChild(db, 'importBatches', values),
    updateImportBatch: (db, id, changes) => updateChild(db, 'importBatches', id, changes),
    deleteImportBatch,
    createSourceMapping: (db, values) => createChild(db, 'sourceMappings', values),
    updateSourceMapping: (db, id, changes) => updateChild(db, 'sourceMappings', id, changes),
    deleteSourceMapping: (db, id) => deleteRecord(db, 'sourceMappings', id)
  };

  globalScope.AdvisoryData = api;
  globalScope.createAdvisoryStore = createAdvisoryStore;
  globalScope.normalizeAdvisoryData = normalizeAdvisoryData;
  globalScope.checkAdvisoryIntegrity = checkAdvisoryIntegrity;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
