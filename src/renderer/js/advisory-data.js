/**
 * Advisory Class persistent data model and migration helpers.
 *
 * Advisory records live inside the active profile database so the existing
 * local save, encryption, rolling-backup, and restore paths include them.
 * This module is deliberately UI-independent to keep migrations testable.
 */
(function initAdvisoryData(globalScope) {
  'use strict';

  const ADVISORY_SCHEMA_VERSION = 1;
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
      birthdate: cleanString(item.birthdate),
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

  function normalizeAdvisoryData(profileDb) {
    if (!profileDb || typeof profileDb !== 'object') {
      throw new TypeError('A profile database object is required.');
    }
    const source = profileDb.advisory && typeof profileDb.advisory === 'object'
      ? profileDb.advisory
      : createAdvisoryStore();
    const normalized = { schemaVersion: ADVISORY_SCHEMA_VERSION };
    Object.keys(NORMALIZERS).forEach(collection => {
      const rows = Array.isArray(source[collection]) ? source[collection] : [];
      normalized[collection] = rows.map(NORMALIZERS[collection]);
    });
    profileDb.advisory = normalized;
    return normalized;
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
    if (!candidate.schoolYear || !candidate.gradeLevel || !candidate.section || !candidate.adviserName) {
      throw new Error('School year, grade level, section, and adviser name are required.');
    }
    if (candidate.isActive && store.classes.some(item => item.schoolYear === candidate.schoolYear && item.isActive)) {
      throw new Error('Only one active Advisory Class is allowed for a school year.');
    }
    return createRecord(profileDb, 'classes', candidate);
  }

  function updateClass(profileDb, id, changes) {
    const store = requireStore(profileDb);
    const current = requireClass(store, id);
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
    requireClass(store, cleanString(values?.advisoryClassId));
    return createRecord(profileDb, collection, values || {});
  }

  function createGrade(profileDb, values) {
    const store = requireStore(profileDb);
    requireClass(store, cleanString(values?.advisoryClassId));
    const key = [values?.advisoryClassId, values?.advisoryLearnerId, values?.advisorySubjectId, cleanString(values?.term)].join('|');
    if (store.grades.some(item => [item.advisoryClassId, item.advisoryLearnerId, item.advisorySubjectId, item.term].join('|') === key)) {
      throw new Error('A final grade already exists for this learner, subject, and term.');
    }
    return createRecord(profileDb, 'grades', values || {});
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
    ['learners', 'subjects', 'grades', 'importBatches', 'sourceMappings'].forEach(collection => {
      store[collection].forEach(item => {
        if (!classIds.has(item.advisoryClassId)) errors.push({ code: 'orphan-class-reference', collection, id: item.id });
      });
    });
    store.grades.forEach(item => {
      if (!learnerIds.has(item.advisoryLearnerId)) errors.push({ code: 'orphan-learner-reference', collection: 'grades', id: item.id });
      if (!subjectIds.has(item.advisorySubjectId)) errors.push({ code: 'orphan-subject-reference', collection: 'grades', id: item.id });
      if (item.importBatchId && !batchIds.has(item.importBatchId)) warnings.push({ code: 'missing-import-batch', collection: 'grades', id: item.id });
    });
    store.sourceMappings.forEach(item => {
      if (!subjectIds.has(item.advisorySubjectId)) errors.push({ code: 'orphan-subject-reference', collection: 'sourceMappings', id: item.id });
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
    return { schemaVersion: store.schemaVersion, errors, warnings, isValid: errors.length === 0 };
  }

  const api = {
    ADVISORY_SCHEMA_VERSION,
    createAdvisoryStore,
    normalizeAdvisoryData,
    checkAdvisoryIntegrity,
    createClass,
    updateClass,
    deleteClass,
    createLearner: (db, values) => createChild(db, 'learners', values),
    updateLearner: (db, id, changes) => updateRecord(db, 'learners', id, changes),
    deleteLearner,
    createSubject: (db, values) => createChild(db, 'subjects', values),
    updateSubject: (db, id, changes) => updateRecord(db, 'subjects', id, changes),
    deleteSubject,
    createGrade,
    updateGrade: (db, id, changes) => updateRecord(db, 'grades', id, changes),
    deleteGrade: (db, id) => deleteRecord(db, 'grades', id),
    createImportBatch: (db, values) => createChild(db, 'importBatches', values),
    updateImportBatch: (db, id, changes) => updateRecord(db, 'importBatches', id, changes),
    deleteImportBatch,
    createSourceMapping: (db, values) => createChild(db, 'sourceMappings', values),
    updateSourceMapping: (db, id, changes) => updateRecord(db, 'sourceMappings', id, changes),
    deleteSourceMapping: (db, id) => deleteRecord(db, 'sourceMappings', id)
  };

  globalScope.AdvisoryData = api;
  globalScope.createAdvisoryStore = createAdvisoryStore;
  globalScope.normalizeAdvisoryData = normalizeAdvisoryData;
  globalScope.checkAdvisoryIntegrity = checkAdvisoryIntegrity;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
