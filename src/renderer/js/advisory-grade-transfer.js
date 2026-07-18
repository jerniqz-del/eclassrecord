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
  const ADVISER_NOTE_MAX_LENGTH = 500;
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

  function normalizeGradeLevel(value) {
    const normalized = text(value).toUpperCase().replace(/^GRADE\s*/, '').replace(/\s+/g, ' ');
    if (/^\d+$/.test(normalized)) return String(Number.parseInt(normalized, 10));
    if (['K', 'KINDER', 'KINDERGARTEN'].includes(normalized)) return 'KINDERGARTEN';
    return normalized;
  }

  function matchingLocalClasses(profileDb, advisoryClass) {
    if (!profileDb || !advisoryClass) return [];
    const schoolYear = text(advisoryClass.schoolYear || profileDb.schoolYear);
    const gradeLevel = normalizeGradeLevel(advisoryClass.gradeLevel);
    const section = globalScope.AdvisoryRoster.normalizeMatchText(advisoryClass.section);
    return (profileDb.assignments || [])
      .filter(item => text(item.schoolYear || profileDb.schoolYear) === schoolYear
        && normalizeGradeLevel(item.gradeLevel) === gradeLevel
        && globalScope.AdvisoryRoster.normalizeMatchText(item.section) === section)
      .sort((left, right) => text(left.subject || left.name).localeCompare(text(right.subject || right.name), 'fil'));
  }

  function splitMapehSubjects(subjects) {
    return (subjects || []).flatMap(subjectName => /mapeh|music, arts, physical education, and health/i.test(subjectName)
      ? ['Music & Arts', 'PE & Health']
      : [subjectName]);
  }

  function standardSubjectsForGrade(gradeLevel) {
    const grade = Number.parseInt(gradeLevel, 10);
    if (grade >= 11 && grade <= 12) return [];
    if (typeof globalScope.getSubjectsForGrade === 'function') {
      return splitMapehSubjects(globalScope.getSubjectsForGrade(gradeLevel));
    }
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
    if (key === 'MUSIC ARTS' || key === 'MUSIC AND ARTS') return 'M&A';
    if (key === 'PE HEALTH' || key === 'PE AND HEALTH' || key.includes('ARTS AND PHYSICAL EDUCATION')) return 'PE&H';
    if (key === 'LANGUAGE') return 'LANG';
    if (key.includes('READING') && key.includes('LITERACY')) return 'R&L';
    if (key === 'MAKABANSA') return 'MKB';
    if (key.includes('EDUKASYONG PANTAHANAN AT PANGKABUHAYAN') || /(^| )EPP($| )/.test(key)) return 'EPP';
    if (key.includes('TECHNOLOGY AND LIVELIHOOD EDUCATION') || /(^| )TLE($| )/.test(key)) return 'TLE';
    if (key.includes('GOOD MANNERS AND RIGHT CONDUCT') || key.includes('GOOD MORAL AND RIGHT CONDUCT') || key === 'GMRC') return 'GMRC';
    if (key === 'VALUES EDUCATION') return 'Val.Ed';
    if (key === 'MAPEH AVERAGE') return 'MAPEH';
    const displayName = subjectDisplayName(subjectName);
    if (displayName.length <= 12) return displayName;
    const ignoredWords = new Set(['AND', 'AT', 'OF', 'THE', 'IN', 'ON', 'FOR', 'TO', 'WITH', 'FROM', 'SA', 'NG', 'ANG', 'MGA', 'TUNGO']);
    const significantWords = (text(subjectName).match(/\d+(?:ST|ND|RD|TH)?|[A-ZÀ-ÖØ-Ý]+/gi) || [])
      .filter(word => !ignoredWords.has(word.toLocaleUpperCase()));
    if (significantWords.length === 1) return significantWords[0].slice(0, 4).toLocaleUpperCase();
    const acronym = significantWords.map(word => /^\d/.test(word) ? word.toLocaleUpperCase() : word[0].toLocaleUpperCase()).join('');
    return acronym.length >= 2 ? acronym : displayName;
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

  function isSeniorHighGrade(gradeLevel) {
    const grade = Number.parseInt(gradeLevel, 10);
    return grade >= 11 && grade <= 12;
  }

  function seniorHighCatalogForGrade(gradeLevel) {
    return typeof globalScope.seniorHighSubjectCatalog === 'function'
      ? globalScope.seniorHighSubjectCatalog(gradeLevel)
      : [];
  }

  function seniorHighSubjectPickerMarkup(gradeLevel, selectedSubjects = []) {
    const selectedKeys = new Set(selectedSubjects.map(normalizeSubjectKey));
    const catalog = seniorHighCatalogForGrade(gradeLevel);
    const catalogKeys = new Set(catalog.flatMap(category => category.subjects).map(normalizeSubjectKey));
    const customSubjects = selectedSubjects.filter(subject => !catalogKeys.has(normalizeSubjectKey(subject)));
    return `
      <div class="advisory-shs-subject-groups">
        ${catalog.map(category => `<fieldset class="advisory-shs-subject-group"><legend>${globalScope.esc(category.label)}</legend><div class="advisory-shs-subject-options">${category.subjects.map(subject => `<label class="checkbox-row"><input type="checkbox" data-advisory-shs-subject value="${globalScope.esc(subject)}" ${selectedKeys.has(normalizeSubjectKey(subject)) ? 'checked' : ''}> <span>${globalScope.esc(subject)}</span></label>`).join('')}</div></fieldset>`).join('')}
      </div>
      <div class="field advisory-shs-custom-subjects"><label class="field-label">Other / Custom Subjects</label><textarea class="field-input" rows="3" data-advisory-shs-custom placeholder="Enter one subject per line">${globalScope.esc(customSubjects.join('\n'))}</textarea><p class="text-muted">Add locally offered subjects that are not in the catalog, one per line.</p></div>`;
  }

  function collectSeniorHighSubjects(container) {
    if (!container) return [];
    const values = Array.from(container.querySelectorAll('[data-advisory-shs-subject]:checked')).map(input => text(input.value));
    const custom = text(container.querySelector('[data-advisory-shs-custom]')?.value).split(/\r?\n/).map(text).filter(Boolean);
    const seen = new Set();
    return [...values, ...custom].filter(subject => {
      const key = normalizeSubjectKey(subject);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function syncSeniorHighSubjects(profileDb, advisoryClass, requestedSubjects) {
    if (!profileDb || !advisoryClass || !isSeniorHighGrade(advisoryClass.gradeLevel)) return [];
    const requested = (requestedSubjects || []).map(text).filter(Boolean);
    if (!requested.length) throw new Error('Select at least one Senior High subject.');
    const requestedKeys = new Set();
    requested.forEach(subject => {
      const key = normalizeSubjectKey(subject);
      if (requestedKeys.has(key)) throw new Error('Senior High subject names must be unique.');
      requestedKeys.add(key);
    });
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const existing = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id && !item.isSpecialProgramSubject);
    const usedIds = new Set();
    requested.forEach((subjectName, index) => {
      const normalizedSubjectKey = normalizeSubjectKey(subjectName);
      let subject = existing.find(item => item.normalizedSubjectKey === normalizedSubjectKey);
      if (subject) {
        globalScope.AdvisoryData.updateSubject(profileDb, subject.id, {
          subjectName,
          normalizedSubjectKey,
          expectedGradeLevel: advisoryClass.gradeLevel,
          expectedSection: advisoryClass.section,
          expectedSchoolYear: advisoryClass.schoolYear,
          displayOrder: index,
          isSeniorHighSubject: true,
          isLegacySubject: false,
          isArchived: false
        });
      } else {
        subject = globalScope.AdvisoryData.createSubject(profileDb, {
          advisoryClassId: advisoryClass.id,
          subjectName,
          normalizedSubjectKey,
          expectedGradeLevel: advisoryClass.gradeLevel,
          expectedSection: advisoryClass.section,
          expectedSchoolYear: advisoryClass.schoolYear,
          expectedTerm: '',
          sourceType: 'grade-transfer-file',
          displayOrder: index,
          isSeniorHighSubject: true,
          isArchived: false
        });
      }
      usedIds.add(subject.id);
    });
    existing.filter(subject => !usedIds.has(subject.id)).forEach(subject => {
      globalScope.AdvisoryData.updateSubject(profileDb, subject.id, { isSeniorHighSubject: true, isArchived: true });
    });
    return globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).subjects
      .filter(item => item.advisoryClassId === advisoryClass.id && item.isSeniorHighSubject && !item.isArchived);
  }

  function archiveSeniorHighSubjects(profileDb, advisoryClassId, includeAllRegularSubjects = false) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    store.subjects.filter(item => item.advisoryClassId === advisoryClassId
      && !item.isSpecialProgramSubject
      && (includeAllRegularSubjects || item.isSeniorHighSubject)
      && !item.isArchived)
      .forEach(item => globalScope.AdvisoryData.updateSubject(profileDb, item.id, { isArchived: true }));
  }

  function ensureGradeLevelSubjects(profileDb, advisoryClass) {
    if (!profileDb || !advisoryClass) return [];
    if (isSeniorHighGrade(advisoryClass.gradeLevel)) return [];
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
      if (!normalizedSubjectKey) return;
      const matchingSubject = existing.find(item => item.normalizedSubjectKey === normalizedSubjectKey && !item.isSpecialProgramSubject);
      if (matchingSubject) {
        globalScope.AdvisoryData.updateSubject(profileDb, matchingSubject.id, {
          subjectName,
          expectedGradeLevel: advisoryClass.gradeLevel,
          expectedSection: advisoryClass.section,
          expectedSchoolYear: advisoryClass.schoolYear,
          isSeniorHighSubject: false,
          isLegacySubject: false,
          isArchived: false
        });
        return;
      }
      if (existingKeys.has(normalizedSubjectKey)) return;
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
    const adviserEditAllowed = options.adviserMayModifySubmittedGrades === true;
    const adviserModificationNote = adviserEditAllowed ? text(options.adviserModificationNote) : '';
    if (!assignment || !assignment.id) throw new Error('A subject class is required.');
    if (![1, 2, 3].includes(termNumber)) throw new Error('Select a valid term.');
    if (typeof options.getFinalGrade !== 'function') throw new Error('The final-grade reader is unavailable.');
    if (adviserModificationNote.length > ADVISER_NOTE_MAX_LENGTH) throw new Error(`The note to the adviser must be ${ADVISER_NOTE_MAX_LENGTH} characters or fewer.`);
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
      permissions: {
        adviserMayModifySubmittedGrades: adviserEditAllowed,
        adviserModificationNote
      },
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
    if (payload.permissions !== undefined && (!payload.permissions || typeof payload.permissions !== 'object' || Array.isArray(payload.permissions))) {
      errors.push('The Grade Transfer File contains invalid adviser permission information.');
    } else if (payload.permissions) {
      if (typeof payload.permissions.adviserMayModifySubmittedGrades !== 'boolean') errors.push('The adviser grade-modification permission must be true or false.');
      if (payload.permissions.adviserModificationNote !== undefined && typeof payload.permissions.adviserModificationNote !== 'string') errors.push('The note to the adviser must be plain text.');
      const adviserNote = typeof payload.permissions.adviserModificationNote === 'string' ? payload.permissions.adviserModificationNote.trim() : '';
      if (adviserNote.length > ADVISER_NOTE_MAX_LENGTH) errors.push(`The note to the adviser must be ${ADVISER_NOTE_MAX_LENGTH} characters or fewer.`);
      if (adviserNote && payload.permissions.adviserMayModifySubmittedGrades !== true) errors.push('A note to the adviser is allowed only when grade-modification permission is granted.');
    }
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
        correctedReimport: plan.correctedReimport === true,
        adviserEditAllowed: plan.payload.permissions?.adviserMayModifySubmittedGrades === true,
        adviserModificationNote: plan.payload.permissions?.adviserMayModifySubmittedGrades === true
          ? text(plan.payload.permissions?.adviserModificationNote).slice(0, ADVISER_NOTE_MAX_LENGTH)
          : ''
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
          remarks: text(row.incoming.remarks),
          adviserEditAllowed: plan.payload.permissions?.adviserMayModifySubmittedGrades === true,
          submittedFinalGrade: Number(row.incoming.finalGrade),
          adviserModifiedAt: '',
          adviserModifiedBy: ''
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

  async function exportAssignment(assignmentId, term, mapePart = '', adviserMayModifySubmittedGrades = false, adviserModificationNote = '') {
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
      adviserMayModifySubmittedGrades,
      adviserModificationNote,
      getFinalGrade: (source, learnerId, selectedTerm, selectedPart) => selectedPart
        ? globalScope.computeTerm(source, learnerId, selectedTerm, selectedPart).termGrade
        : globalScope.getLearnerTermGradeForExport(source, learnerId, selectedTerm)
    });
    if (!payload.learners.length) throw new Error('No saved final grades were found for the selected term.');
    const requestedFilename = gradeTransferFilename(payload);
    const exportFilename = globalScope.AdminTestMode?.isActive?.()
      ? globalScope.AdminTestMode.markExportFilename(requestedFilename)
      : requestedFilename;
    const result = await globalScope.electronAPI.exportGradeTransfer(JSON.stringify(payload, null, 2), exportFilename);
    return { payload, result };
  }

  function showExportModal(assignmentId) {
    const profileDb = activeDb();
    const assignment = (profileDb.assignments || []).find(item => item.id === assignmentId);
    if (!assignment) { globalScope.toast('The selected subject class was not found.', 'error'); return; }
    const overlay = document.createElement('div');
    const isMapeh = /mapeh|music, arts, physical education, and health/i.test(text(assignment.subject));
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal"><div class="modal__title">Export Final Grades</div><div class="modal__body"><div class="advisory-transfer-summary"><strong>Grade ${globalScope.esc(assignment.gradeLevel)} - ${globalScope.esc(assignment.section)}</strong><span>${globalScope.esc(assignment.subject)} · SY ${globalScope.esc(assignment.schoolYear || profileDb.schoolYear)}</span></div><div class="field"><label class="field-label">Term</label><select class="field-select" data-export-term><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></select></div><label class="advisory-permission-option"><input type="checkbox" data-adviser-edit-permission><span><strong>Allow the adviser to modify grades submitted in this file</strong><small>This applies only to the saved grades in the selected subject and term.</small></span></label><div class="field advisory-permission-note" data-adviser-note-field hidden><label class="field-label" for="adviserModificationNote">Note to Adviser <span>(Optional)</span></label><textarea class="field-input" id="adviserModificationNote" rows="4" maxlength="${ADVISER_NOTE_MAX_LENGTH}" data-adviser-note placeholder="Add instructions or context for the adviser."></textarea><p class="field-help"><span data-adviser-note-count>0</span> / ${ADVISER_NOTE_MAX_LENGTH} characters</p></div><label class="advisory-privacy-notice"><input type="checkbox" data-privacy-confirm><span><strong>Privacy reminder</strong>This Grade Transfer File contains learner names, LRNs, and final grades. Store and share it securely.</span></label></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-export disabled>Continue &amp; Save File</button></div></div>`;
    document.body.appendChild(overlay);
    if (isMapeh) {
      const termField = overlay.querySelector('[data-export-term]')?.closest('.field');
      termField?.insertAdjacentHTML('afterend', '<div class="field"><label class="field-label">MAPEH Submission</label><select class="field-select" data-export-mape-part><option value="music_arts">Music &amp; Arts</option><option value="pe_health">PE &amp; Health</option></select><p class="field-help">Save and send each MAPEH component as a separate Grade Transfer File.</p></div>');
    }
    const privacy = overlay.querySelector('[data-privacy-confirm]');
    const editPermission = overlay.querySelector('[data-adviser-edit-permission]');
    const noteField = overlay.querySelector('[data-adviser-note-field]');
    const noteInput = overlay.querySelector('[data-adviser-note]');
    const noteCount = overlay.querySelector('[data-adviser-note-count]');
    const exportButton = overlay.querySelector('[data-export]');
    privacy.addEventListener('change', () => { exportButton.disabled = !privacy.checked; });
    editPermission.addEventListener('change', () => {
      noteField.hidden = !editPermission.checked;
      if (!editPermission.checked) {
        noteInput.value = '';
        noteCount.textContent = '0';
      }
    });
    noteInput.addEventListener('input', () => { noteCount.textContent = String(noteInput.value.length); });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      try {
        const { result } = await exportAssignment(
          assignmentId,
          overlay.querySelector('[data-export-term]').value,
          overlay.querySelector('[data-export-mape-part]')?.value || '',
          editPermission.checked,
          editPermission.checked ? noteInput.value : ''
        );
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
      const adviserEditAllowed = plan.payload?.permissions?.adviserMayModifySubmittedGrades === true;
      const adviserNote = adviserEditAllowed ? text(plan.payload?.permissions?.adviserModificationNote) : '';
      const permissionPanel = `<div class="advisory-import-permission ${adviserEditAllowed ? 'is-allowed' : 'is-readonly'}"><strong>${adviserEditAllowed ? 'Adviser editing allowed' : 'Submitted grades are read-only'}</strong><span>${adviserEditAllowed ? 'The subject teacher allows the adviser to modify the grades contained in this file.' : 'The subject teacher did not grant modification permission for this file.'}</span></div>`;
      const notePanel = adviserNote ? `<div class="advisory-teacher-note"><strong>Note from Subject Teacher</strong><p>${globalScope.esc(adviserNote)}</p></div>` : '';
      overlay.innerHTML = `<div class="modal advisory-preview-modal"><div class="modal__title">Review Grade Import</div><div class="modal__body advisory-scroll-body"><div class="advisory-transfer-summary"><strong>${globalScope.esc(plan.payload?.subject?.name || 'Unknown subject')} · Term ${globalScope.esc(plan.payload?.term?.number || '—')}</strong><span>${globalScope.esc(plan.payload?.class?.name || '')} · SY ${globalScope.esc(plan.payload?.schoolYear || '')} · ${globalScope.esc(plan.filename)}</span></div>${permissionPanel}${notePanel}${plan.errors.length ? `<div class="advisory-import-messages advisory-import-messages--error">${plan.errors.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}${plan.warnings.length ? `<div class="advisory-import-messages advisory-import-messages--warning">${plan.warnings.map(message => `<div>${globalScope.esc(message)}</div>`).join('')}</div>` : ''}<div class="advisory-import-summary"><span><strong>${plan.importableCount}</strong> ready</span><span><strong>${plan.unmatchedCount}</strong> unmatched</span><span><strong>${plan.conflictCount}</strong> conflicts</span><span><strong>${plan.unresolvedConflictCount}</strong> decisions needed</span></div>${plan.conflictCount ? '<div class="advisory-conflict-bulk"><span>Apply to all conflicts:</span><button class="btn btn-ghost btn-sm" data-keep-all>Keep Existing</button><button class="btn btn-primary btn-sm" data-replace-all>Replace with Imported</button></div>' : ''}<div class="advisory-preview-list">${plan.rows.map(row => `<div class="advisory-preview-row advisory-preview-row--${row.status}"><span><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(row.incoming))} · Incoming ${globalScope.esc(row.incoming.finalGrade)}</strong><small>${globalScope.esc(row.incoming.lrn || 'No LRN')} · ${globalScope.esc(statusLabel[row.status] || row.status)}${row.warning ? ` · ${globalScope.esc(row.warning)}` : ''}</small>${row.status === 'conflict' ? `<select class="field-select advisory-conflict-select" data-conflict-row="${row.index}"><option value="">Choose a decision</option><option value="keep" ${row.conflictDecision === 'keep' ? 'selected' : ''}>Keep existing grade (${globalScope.esc(row.existingGrade.finalGrade)})</option><option value="replace" ${row.conflictDecision === 'replace' ? 'selected' : ''}>Replace with imported grade (${globalScope.esc(row.incoming.finalGrade)})</option></select>` : ''}${['unmatched','ambiguous'].includes(row.status) ? `<select class="field-select advisory-match-select" data-match-row="${row.index}"><option value="">Leave unmatched</option>${roster.map(learner => `<option value="${globalScope.esc(learner.id)}">${globalScope.esc(learner.lrn || 'No LRN')} · ${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</option>`).join('')}</select>` : ''}</span></div>`).join('')}</div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-confirm ${plan.canImport ? '' : 'disabled'}>Confirm Import</button></div></div>`;
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
    const localClasses = matchingLocalClasses(activeDb(), advisoryClass);
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
          <div class="advisory-source-explanation" data-source-help="manual" hidden><strong>Manual source selected.</strong><span>In the Grade Record, click the + beside this subject, then enter each learner&apos;s Term 1–3 final grades.</span></div>
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

  function showManualQuickGradeModal(initialSubjectId = '', initialTerm = '1') {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    const profileDb = activeDb();
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const quickSubjects = store.subjects
      .filter(item => item.advisoryClassId === advisoryClass?.id && !item.isArchived && (item.sourceType === 'manual'
        || store.grades.some(grade => grade.advisorySubjectId === item.id && grade.adviserEditAllowed === true)))
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const learners = store.learners.filter(item => item.advisoryClassId === advisoryClass?.id && item.enrollmentStatus !== 'inactive');
    if (!quickSubjects.length) { globalScope.toast('No Manual Entry or teacher-permitted grades are available.', 'warning'); return; }
    if (!learners.length) { globalScope.toast('Add learners to the Advisory Class before entering grades.', 'warning'); return; }

    const termsForSubject = subject => subject?.sourceType === 'manual' ? ['1', '2', '3'] : ['1', '2', '3'].filter(candidate => store.grades.some(grade => grade.advisorySubjectId === subject?.id && grade.term === candidate && grade.adviserEditAllowed === true));
    let subjectId = quickSubjects.some(item => item.id === initialSubjectId) ? initialSubjectId : quickSubjects[0].id;
    let term = termsForSubject(quickSubjects.find(item => item.id === subjectId)).includes(text(initialTerm)) ? text(initialTerm) : termsForSubject(quickSubjects.find(item => item.id === subjectId))[0];
    let learnerId = learners[0].id;
    let searchQuery = '';
    let saving = false;
    const workspace = document.querySelector('.advisory-page');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal advisory-quick-grade-overlay';
    document.body.appendChild(overlay);

    const currentSubject = () => quickSubjects.find(item => item.id === subjectId) || quickSubjects[0];
    const currentLearner = () => learners.find(item => item.id === learnerId) || learners[0];
    const currentGrade = () => globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).grades.find(item => item.advisoryClassId === advisoryClass.id
      && item.advisoryLearnerId === learnerId && item.advisorySubjectId === subjectId && item.term === term);
    const matchesSearch = learner => {
      const haystack = `${globalScope.AdvisoryRoster.displayName(learner)} ${learner.lrn || ''}`.toLocaleLowerCase();
      return !searchQuery || haystack.includes(searchQuery.toLocaleLowerCase());
    };
    const canEditLearner = learner => currentSubject()?.sourceType === 'manual' || Boolean(globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).grades.find(grade => grade.advisoryLearnerId === learner.id
      && grade.advisorySubjectId === subjectId && grade.term === term && grade.adviserEditAllowed === true));
    const eligibleLearners = () => learners.filter(canEditLearner);
    const visibleLearners = () => eligibleLearners().filter(matchesSearch);
    const ensureEditableSelection = () => {
      const availableTerms = termsForSubject(currentSubject());
      if (!availableTerms.includes(term)) term = availableTerms[0];
      const eligible = eligibleLearners();
      if (!eligible.some(item => item.id === learnerId)) learnerId = eligible[0]?.id || learners[0].id;
    };
    ensureEditableSelection();

    const persistCurrent = async () => {
      const input = overlay.querySelector('[data-advisory-quick-grade-input]');
      if (!input || input.value === input.dataset.savedValue) return true;
      if (saving) return false;
      const snapshot = JSON.parse(JSON.stringify(profileDb.advisory));
      saving = true;
      input.disabled = true;
      input.classList.remove('is-invalid');
      try {
        if (currentSubject().sourceType === 'manual') saveManualGrade(profileDb, advisoryClass, currentLearner(), currentSubject(), term, input.value);
        else saveAdviserGradeAdjustment(profileDb, advisoryClass, currentLearner(), currentSubject(), term, input.value);
        await globalScope.saveDatabase();
        input.dataset.savedValue = input.value;
        globalScope.renderDashboardOverview?.();
        return true;
      } catch (error) {
        profileDb.advisory = snapshot;
        input.disabled = false;
        input.classList.add('is-invalid');
        input.focus();
        input.select();
        globalScope.toast(error.message || 'The manual grade could not be saved.', 'error');
        return false;
      } finally {
        saving = false;
      }
    };

    const close = async () => {
      if (!(await persistCurrent())) return;
      overlay.remove();
      if (workspace) renderWorkspacePanel(workspace, advisoryClass);
    };

    const render = (focusGrade = true) => {
      const latestGrades = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).grades;
      const subject = currentSubject();
      const learner = currentLearner();
      const grade = currentGrade();
      const availableTerms = termsForSubject(subject);
      const editableRoster = eligibleLearners();
      const visible = visibleLearners();
      const navigationIndex = visible.findIndex(item => item.id === learner.id);
      const completed = editableRoster.filter(item => latestGrades.some(gradeItem => gradeItem.advisoryLearnerId === item.id && gradeItem.advisorySubjectId === subject.id && gradeItem.term === term)).length;
      const subjectFinal = calculateSubjectFinal(latestGrades, learner.id, subject.id);
      overlay.innerHTML = `
        <div class="modal modal--wide advisory-quick-grade-modal" role="dialog" aria-modal="true" aria-labelledby="advisoryQuickGradeTitle">
          <div class="modal__title" id="advisoryQuickGradeTitle">Quick Grade Entry</div>
          <div class="modal__body advisory-quick-grade-layout">
            <main class="advisory-quick-grade-main">
              <div class="split-row advisory-quick-grade-selectors">
                <div class="field"><label class="field-label" for="advisoryQuickGradeSubject">Grade Entry Subject</label><select class="field-select" id="advisoryQuickGradeSubject">${quickSubjects.map(item => `<option value="${globalScope.esc(item.id)}" ${item.id === subject.id ? 'selected' : ''}>${globalScope.esc(item.subjectName)}${item.sourceType === 'manual' ? '' : ' · Teacher permitted'}</option>`).join('')}</select></div>
                <div class="field"><label class="field-label" for="advisoryQuickGradeTerm">Term</label><select class="field-select" id="advisoryQuickGradeTerm">${availableTerms.map(item => `<option value="${item}" ${item === term ? 'selected' : ''}>Term ${item}</option>`).join('')}</select></div>
              </div>
              <div class="advisory-quick-grade-progress"><span>${globalScope.esc(subject.subjectName)} · Term ${term}</span><strong>${completed} / ${editableRoster.length} editable grades</strong></div>
              <section class="advisory-quick-grade-card">
                <span class="advisory-quick-grade-position">Learner ${editableRoster.findIndex(item => item.id === learner.id) + 1} of ${editableRoster.length}</span>
                <h3>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</h3>
                <p>${globalScope.esc(learner.lrn || 'No LRN')} · ${globalScope.esc(subject.subjectName)} · Term ${term}</p>
                <label class="field-label" for="advisoryQuickGradeInput">Final Grade</label>
                <input class="advisory-quick-grade-input" id="advisoryQuickGradeInput" type="number" min="60" max="100" step="1" inputmode="decimal" value="${globalScope.esc(grade?.finalGrade ?? '')}" data-saved-value="${globalScope.esc(grade?.finalGrade ?? '')}" data-advisory-quick-grade-input aria-describedby="advisoryQuickGradeHint">
                <div class="advisory-quick-grade-summary"><span>Allowed: 60–100</span>${subject.sourceType === 'manual' ? '' : `<span>Original: <strong>${globalScope.esc(grade?.submittedFinalGrade ?? grade?.finalGrade ?? '—')}</strong></span>`}<span>Subject Final: <strong>${subjectFinal === null ? '—' : subjectFinal}</strong></span></div>
                <p id="advisoryQuickGradeHint">Press Enter to save and continue to the next learner. ${subject.sourceType === 'manual' ? 'Leave blank to clear the grade.' : 'Teacher-submitted grades cannot be cleared.'}</p>
              </section>
              <div class="advisory-quick-grade-navigation"><button class="btn btn-ghost" type="button" data-advisory-quick-prev ${navigationIndex <= 0 ? 'disabled' : ''}>Previous</button><button class="btn btn-primary" type="button" data-advisory-quick-next>${navigationIndex >= 0 && navigationIndex < visible.length - 1 ? 'Save & Next' : 'Save Grade'}</button></div>
            </main>
            <aside class="advisory-quick-grade-roster">
              <label class="field-label" for="advisoryQuickGradeSearch">Find Learner</label>
              <input class="field-input" id="advisoryQuickGradeSearch" type="search" value="${globalScope.esc(searchQuery)}" placeholder="Search name or LRN">
              <div class="advisory-quick-grade-roster-list">${editableRoster.map((item, index) => {
                const itemGrade = latestGrades.find(gradeItem => gradeItem.advisoryLearnerId === item.id && gradeItem.advisorySubjectId === subject.id && gradeItem.term === term);
                return `<button type="button" class="advisory-quick-grade-roster-item ${item.id === learner.id ? 'is-active' : ''} ${itemGrade ? 'is-complete' : ''}" data-advisory-quick-learner="${globalScope.esc(item.id)}" data-search-text="${globalScope.esc(`${globalScope.AdvisoryRoster.displayName(item)} ${item.lrn || ''}`.toLocaleLowerCase())}" ${matchesSearch(item) ? '' : 'hidden'}><span><strong>${index + 1}. ${globalScope.esc(globalScope.AdvisoryRoster.displayName(item))}</strong><small>${globalScope.esc(item.lrn || 'No LRN')}</small></span><b>${itemGrade ? globalScope.esc(itemGrade.finalGrade) : '—'}</b></button>`;
              }).join('')}</div>
              <p class="advisory-quick-grade-no-results" data-advisory-quick-no-results ${visible.length ? 'hidden' : ''}>No learners match your search.</p>
            </aside>
          </div>
          <div class="modal__actions"><button class="btn btn-primary btn-sm" type="button" data-advisory-quick-done>Done</button></div>
        </div>`;

      const input = overlay.querySelector('[data-advisory-quick-grade-input]');
      overlay.querySelector('#advisoryQuickGradeSubject').addEventListener('change', async event => {
        if (!(await persistCurrent())) { event.target.value = subjectId; return; }
        subjectId = event.target.value;
        ensureEditableSelection();
        render();
      });
      overlay.querySelector('#advisoryQuickGradeTerm').addEventListener('change', async event => {
        if (!(await persistCurrent())) { event.target.value = term; return; }
        term = event.target.value;
        ensureEditableSelection();
        render();
      });
      overlay.querySelector('#advisoryQuickGradeSearch').addEventListener('input', event => {
        searchQuery = event.target.value.trim();
        let shown = 0;
        overlay.querySelectorAll('[data-advisory-quick-learner]').forEach(button => {
          button.hidden = Boolean(searchQuery) && !button.dataset.searchText.includes(searchQuery.toLocaleLowerCase());
          if (!button.hidden) shown += 1;
        });
        overlay.querySelector('[data-advisory-quick-no-results]').hidden = shown > 0;
      });
      overlay.querySelectorAll('[data-advisory-quick-learner]').forEach(button => button.addEventListener('click', async () => {
        if (!(await persistCurrent())) return;
        learnerId = button.dataset.advisoryQuickLearner;
        render();
      }));
      const move = async direction => {
        if (!(await persistCurrent())) return;
        const roster = visibleLearners();
        const index = roster.findIndex(item => item.id === learnerId);
        const target = roster[index + direction];
        if (target) learnerId = target.id;
        else if (direction > 0) globalScope.toast(`Term ${term} quick entry reached the end of the visible roster.`, 'success');
        render();
      };
      overlay.querySelector('[data-advisory-quick-prev]').addEventListener('click', () => move(-1));
      overlay.querySelector('[data-advisory-quick-next]').addEventListener('click', () => move(1));
      overlay.querySelector('[data-advisory-quick-done]').addEventListener('click', close);
      input.addEventListener('input', () => input.classList.remove('is-invalid'));
      input.addEventListener('keydown', async event => {
        if (event.key === 'Enter') { event.preventDefault(); move(1); }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (!(await persistCurrent())) return;
          const visibleIds = new Set(learners.filter(matchesSearch).map(item => item.id));
          const cells = learners.flatMap(item => termsForSubject(currentSubject()).map(candidateTerm => ({ learnerId: item.id, term: candidateTerm })))
            .filter(cell => visibleIds.has(cell.learnerId) && (currentSubject().sourceType === 'manual' || globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).grades.some(gradeItem => gradeItem.advisoryLearnerId === cell.learnerId && gradeItem.advisorySubjectId === subjectId && gradeItem.term === cell.term && gradeItem.adviserEditAllowed === true)));
          const currentIndex = cells.findIndex(cell => cell.learnerId === learnerId && cell.term === term);
          const target = cells[currentIndex + (event.shiftKey ? -1 : 1)];
          if (target) ({ learnerId, term } = target);
          else globalScope.toast(event.shiftKey ? 'This is the first visible editable grade cell.' : 'This is the last visible editable grade cell.', 'info');
          render();
        }
      });
      if (focusGrade) setTimeout(() => { input.focus(); input.select(); }, 0);
    };

    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    render();
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
      ? Number((finals.reduce((sum, value) => sum + value, 0) / finals.length).toFixed(2))
      : null;
  }

  function formatGeneralAverage(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';
  }

  function gradeSourceClass(sourceType) {
    if (sourceType === 'local-subject-class') return 'advisory-grade-source--class';
    if (sourceType === 'manual') return 'advisory-grade-source--manual';
    return 'advisory-grade-source--transfer';
  }

  function moveSubject(profileDb, advisoryClassId, subjectId, direction) {
    const activeSubjects = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).subjects
      .filter(subject => subject.advisoryClassId === advisoryClassId && !subject.isArchived)
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const currentIndex = activeSubjects.findIndex(subject => subject.id === subjectId);
    const targetIndex = currentIndex + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeSubjects.length || targetIndex === currentIndex) return false;
    [activeSubjects[currentIndex], activeSubjects[targetIndex]] = [activeSubjects[targetIndex], activeSubjects[currentIndex]];
    activeSubjects.forEach((subject, index) => globalScope.AdvisoryData.updateSubject(profileDb, subject.id, { displayOrder: index }));
    return true;
  }

  function saveManualGrade(profileDb, advisoryClass, learner, subject, term, rawValue) {
    if (!profileDb || !advisoryClass || !learner || !subject) throw new Error('The manual grade context is incomplete.');
    if (subject.advisoryClassId !== advisoryClass.id || learner.advisoryClassId !== advisoryClass.id) throw new Error('The learner and subject must belong to this Advisory Class.');
    if (subject.sourceType !== 'manual') throw new Error('Choose Manual Entry as the grade source before entering grades.');
    const normalizedTerm = text(term);
    if (!['1', '2', '3'].includes(normalizedTerm)) throw new Error('Choose Term 1, 2, or 3.');
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const existing = store.grades.find(item => item.advisoryClassId === advisoryClass.id
      && item.advisoryLearnerId === learner.id
      && item.advisorySubjectId === subject.id
      && item.term === normalizedTerm);
    const value = text(rawValue);
    if (!value) {
      if (!existing) return { action: 'unchanged', grade: null };
      globalScope.AdvisoryData.deleteGrade(profileDb, existing.id);
      return { action: 'deleted', grade: null };
    }
    const finalGrade = Number(value);
    if (!Number.isFinite(finalGrade) || finalGrade < 60 || finalGrade > 100) throw new Error('Enter a final grade from 60 to 100, or leave it blank.');
    const gradeValues = {
      advisoryClassId: advisoryClass.id,
      advisoryLearnerId: learner.id,
      advisorySubjectId: subject.id,
      schoolYear: advisoryClass.schoolYear,
      learnerLrn: learner.lrn,
      subjectName: subject.subjectName,
      normalizedSubjectKey: subject.normalizedSubjectKey,
      gradeLevel: advisoryClass.gradeLevel,
      section: advisoryClass.section,
      term: normalizedTerm,
      finalGrade,
      gradeStatus: 'final',
      sourceType: 'manual',
      sourceClassId: '',
      sourceClassName: 'Manual entry by adviser',
      sourceTeacherName: advisoryClass.adviserName,
      exportId: '',
      importBatchId: '',
      exportedAt: '',
      importedAt: '',
      validationStatus: 'valid',
      conflictStatus: 'none',
      remarks: ''
    };
    if (existing) return { action: 'updated', grade: globalScope.AdvisoryData.updateGrade(profileDb, existing.id, gradeValues) };
    return { action: 'created', grade: globalScope.AdvisoryData.createGrade(profileDb, gradeValues) };
  }

  function saveAdviserGradeAdjustment(profileDb, advisoryClass, learner, subject, term, rawValue) {
    if (!profileDb || !advisoryClass || !learner || !subject) throw new Error('The adviser grade context is incomplete.');
    const normalizedTerm = text(term);
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const existing = store.grades.find(item => item.advisoryClassId === advisoryClass.id
      && item.advisoryLearnerId === learner.id
      && item.advisorySubjectId === subject.id
      && item.term === normalizedTerm);
    if (!existing || existing.sourceType !== 'grade-transfer-file' || existing.adviserEditAllowed !== true) {
      throw new Error('The subject teacher did not allow this submitted grade to be modified.');
    }
    const value = text(rawValue);
    if (!value) throw new Error('A submitted grade cannot be cleared. Enter a grade from 60 to 100.');
    const finalGrade = Number(value);
    if (!Number.isFinite(finalGrade) || finalGrade < 60 || finalGrade > 100) throw new Error('Enter a final grade from 60 to 100.');
    if (Number(existing.finalGrade) === finalGrade) return { action: 'unchanged', grade: existing };
    return {
      action: 'updated',
      grade: globalScope.AdvisoryData.updateGrade(profileDb, existing.id, {
        finalGrade,
        submittedFinalGrade: Number.isFinite(Number(existing.submittedFinalGrade)) ? Number(existing.submittedFinalGrade) : Number(existing.finalGrade),
        adviserModifiedAt: new Date().toISOString(),
        adviserModifiedBy: text(advisoryClass.adviserName || profileDb.teacherName)
      })
    };
  }

  function manualGradeNavigationTarget(learners, learnerId, term, direction) {
    const roster = Array.isArray(learners) ? learners : [];
    const learnerIndex = roster.findIndex(item => item.id === learnerId);
    const termNumber = Number.parseInt(term, 10);
    if (learnerIndex < 0 || ![1, 2, 3].includes(termNumber)) return null;
    if (direction === 'next-learner') {
      const learner = roster[learnerIndex + 1];
      return learner ? { learnerId: learner.id, term: String(termNumber) } : null;
    }
    if (direction === 'previous-learner') {
      const learner = roster[learnerIndex - 1];
      return learner ? { learnerId: learner.id, term: String(termNumber) } : null;
    }
    if (direction === 'next-cell') {
      if (termNumber < 3) return { learnerId, term: String(termNumber + 1) };
      const learner = roster[learnerIndex + 1];
      return learner ? { learnerId: learner.id, term: '1' } : null;
    }
    if (direction === 'previous-cell') {
      if (termNumber > 1) return { learnerId, term: String(termNumber - 1) };
      const learner = roster[learnerIndex - 1];
      return learner ? { learnerId: learner.id, term: '3' } : null;
    }
    return null;
  }

  function gradeCell(record, extraClass = '') {
    if (!record) return `<td class="is-missing ${extraClass}" title="Missing grade">&mdash;</td>`;
    const conflict = record.conflictStatus && !['none', 'resolved'].includes(record.conflictStatus);
    return `<td class="${conflict ? 'has-conflict' : 'has-grade'} ${extraClass}" title="${globalScope.esc(record.sourceClassName || record.sourceType)}">${globalScope.esc(record.finalGrade)}</td>`;
  }

  function editableGradeCell(record, learner, subject, term, extraClass = '', entryMode = 'manual') {
    const value = record && Number.isFinite(Number(record.finalGrade)) ? Number(record.finalGrade) : '';
    const label = `${subject.subjectName}, Term ${term}, ${globalScope.AdvisoryRoster.displayName(learner)}`;
    const isTeacherSubmission = entryMode === 'adviser-adjustment';
    const original = isTeacherSubmission && Number.isFinite(Number(record?.submittedFinalGrade)) ? Number(record.submittedFinalGrade) : null;
    const title = isTeacherSubmission
      ? `Subject teacher allowed editing. Original submitted grade: ${original ?? value}. Enter 60 to 100; clearing is not allowed.`
      : 'Enter a final grade from 60 to 100. Leave blank to clear.';
    return `<td class="advisory-manual-grade-cell ${value === '' ? 'is-missing' : 'has-grade'} ${isTeacherSubmission ? 'advisory-permitted-grade-cell' : ''} ${record?.adviserModifiedAt ? 'is-adviser-modified' : ''} ${extraClass}"><input type="number" min="60" max="100" step="1" inputmode="decimal" value="${globalScope.esc(value)}" data-advisory-grade-entry data-entry-mode="${entryMode}" ${entryMode === 'manual' ? 'data-advisory-manual-grade' : 'data-advisory-permitted-grade'} data-learner-id="${globalScope.esc(learner.id)}" data-subject-id="${globalScope.esc(subject.id)}" data-term="${globalScope.esc(term)}" data-saved-value="${globalScope.esc(value)}" aria-label="${globalScope.esc(label)}" title="${globalScope.esc(title)}"></td>`;
  }

  function manualGradeCell(record, learner, subject, term, extraClass = '') {
    return editableGradeCell(record, learner, subject, term, extraClass, 'manual');
  }

  function permittedTransferGradeCell(record, learner, subject, term, extraClass = '') {
    return editableGradeCell(record, learner, subject, term, extraClass, 'adviser-adjustment');
  }

  function calculatedGradeCell(value, title, extraClass = '', attributes = '') {
    return `<td class="${value === null ? 'is-missing' : 'has-grade'} ${extraClass}" title="${globalScope.esc(title)}" ${attributes}>${value === null ? '&mdash;' : value}</td>`;
  }

  function refreshManualGradeCalculations(panel, learners, subjects) {
    const grades = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb()).grades;
    panel.querySelectorAll('[data-advisory-calculation]').forEach(cell => {
      const learnerId = cell.dataset.learnerId;
      let value = null;
      if (cell.dataset.advisoryCalculation === 'subject-final') value = calculateSubjectFinal(grades, learnerId, cell.dataset.subjectId);
      if (cell.dataset.advisoryCalculation === 'mapeh-term') value = calculateMapehTermAverage(grades, learnerId, subjects, cell.dataset.term);
      if (cell.dataset.advisoryCalculation === 'mapeh-final') value = calculateMapehFinal(grades, learnerId, subjects);
      if (cell.dataset.advisoryCalculation === 'general-average') value = calculateGeneralAverage(grades, learnerId, subjects);
      cell.classList.toggle('is-missing', value === null);
      cell.classList.toggle('has-grade', value !== null);
      cell.innerHTML = value === null ? '&mdash;' : (cell.dataset.advisoryCalculation === 'general-average' ? formatGeneralAverage(value) : globalScope.esc(value));
    });
    panel.querySelectorAll('[data-advisory-received-subject]').forEach(cell => {
      const received = grades.filter(grade => grade.advisorySubjectId === cell.dataset.advisoryReceivedSubject).length;
      cell.textContent = received;
      const missingCell = Array.from(panel.querySelectorAll('[data-advisory-missing-subject]'))
        .find(candidate => candidate.dataset.advisoryMissingSubject === cell.dataset.advisoryReceivedSubject);
      if (missingCell) missingCell.textContent = Math.max(0, learners.length * 3 - received);
    });
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
    const activeRegularSubjects = subjects.filter(item => !item.isSpecialProgramSubject);
    const archivedSpecialSubjects = allSubjects.filter(item => item.isSpecialProgramSubject && item.isArchived);
    const rosterLearners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id);
    const learners = rosterLearners.filter(item => item.enrollmentStatus !== 'inactive');
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    const quickGradeSubjects = subjects.filter(subject => subject.sourceType === 'manual'
      || grades.some(grade => grade.advisorySubjectId === subject.id && grade.adviserEditAllowed === true));
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
                const sourceClass = subject.derived ? '' : gradeSourceClass(subject.sourceType);
                return `<th colspan="${expanded ? 4 : 1}" class="advisory-subject-heading advisory-subject-end ${expanded ? '' : 'advisory-subject-heading--collapsed'} ${subject.derived ? 'advisory-mapeh-average' : sourceClass}"><div class="advisory-subject-heading__controls"><button type="button" class="advisory-subject-sort" data-sort-advisory-subject="${globalScope.esc(subject.id)}" aria-label="Sort learners by ${globalScope.esc(subject.subjectName)} final grade" aria-pressed="${activeSort ? 'true' : 'false'}" title="${globalScope.esc(subject.subjectName)} — sort by final grade"><span class="advisory-subject-name--full">${globalScope.esc(subjectDisplayName(subject.subjectName))}</span><span class="advisory-subject-name--compact">${globalScope.esc(subjectCompactName(subject.subjectName))}</span><small aria-hidden="true">${sortLabel}</small></button><button type="button" class="advisory-subject-expand" data-expand-advisory-subject="${globalScope.esc(subject.id)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Hide' : 'Show'} term grades for ${globalScope.esc(subject.subjectName)}" title="${expanded ? 'Hide Terms 1–3' : 'Show Terms 1–3'}"><span aria-hidden="true">${expanded ? '−' : '+'}</span></button></div></th>`;
              }).join('')}
              <th rowspan="2" class="advisory-general-average">General Average</th>
            </tr>
            <tr>${subjectGroups.map(subject => {
              const sourceClass = subject.derived ? 'advisory-mapeh-average' : gradeSourceClass(subject.sourceType);
              return expandedAdvisorySubjects.has(subject.id)
                ? `<th class="${sourceClass}">T1</th><th class="${sourceClass}">T2</th><th class="${sourceClass}">T3</th><th class="advisory-final-column advisory-subject-end ${sourceClass}">Final</th>`
                : `<th class="advisory-final-column advisory-subject-end ${sourceClass}">Final</th>`;
            }).join('')}</tr>
          </thead>
          <tbody>${sortedLearners.length ? sortedLearners.map(learner => {
            const subjectCells = subjectGroups.map(subject => {
              if (subject.derived) {
                const termCells = expandedAdvisorySubjects.has(subject.id) ? ['1', '2', '3'].map(term => calculatedGradeCell(calculateMapehTermAverage(grades, learner.id, subjects, term), `MAPEH Term ${term} average`, 'advisory-mapeh-average', `data-advisory-calculation="mapeh-term" data-learner-id="${globalScope.esc(learner.id)}" data-term="${term}"`)).join('') : '';
                return `${termCells}${calculatedGradeCell(calculateMapehFinal(grades, learner.id, subjects), 'Average of the three MAPEH term averages', 'advisory-final-column advisory-subject-end advisory-mapeh-average', `data-advisory-calculation="mapeh-final" data-learner-id="${globalScope.esc(learner.id)}"`)}`;
              }
              const sourceClass = gradeSourceClass(subject.sourceType);
              const termCells = expandedAdvisorySubjects.has(subject.id) ? ['1', '2', '3'].map(term => {
                const record = grades.find(item => item.advisoryLearnerId === learner.id && item.advisorySubjectId === subject.id && item.term === term);
                if (subject.sourceType === 'manual') return manualGradeCell(record, learner, subject, term, sourceClass);
                if (record?.sourceType === 'grade-transfer-file' && record.adviserEditAllowed === true) return permittedTransferGradeCell(record, learner, subject, term, sourceClass);
                return gradeCell(record, sourceClass);
              }).join('') : '';
              const finalGrade = calculateSubjectFinal(grades, learner.id, subject.id);
              return `${termCells}${calculatedGradeCell(finalGrade, 'Average of Terms 1–3', `advisory-final-column advisory-subject-end ${sourceClass}`, `data-advisory-calculation="subject-final" data-learner-id="${globalScope.esc(learner.id)}" data-subject-id="${globalScope.esc(subject.id)}"`)}`;
            }).join('');
            const generalAverage = calculateGeneralAverage(grades, learner.id, subjects);
            return `<tr><td><small>${globalScope.esc(learner.lrn || 'No LRN')}</small><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td>${subjectCells}<td class="advisory-general-average ${generalAverage === null ? 'is-missing' : 'has-grade'}" data-advisory-calculation="general-average" data-learner-id="${globalScope.esc(learner.id)}" title="Available when every subject has all three term grades">${generalAverage === null ? '&mdash;' : formatGeneralAverage(generalAverage)}</td></tr>`;
          }).join('') : `<tr><td colspan="${totalSubjectColumns + 2}"><div class="advisory-roster__empty">No learners are in the official roster. Use Manage Roster to import or add learners.</div></td></tr>`}</tbody>
        </table>
      </div>` : '<div class="advisory-roster__empty">No subjects have been configured. Import the first Grade Transfer File or add a subject manually.</div>';

    const sourceRows = subjects.length ? subjects.map((subject, index) => {
      const subjectGrades = grades.filter(item => item.advisorySubjectId === subject.id);
      const lastBatch = batches.find(batch => normalizeSubjectKey(batch.subject) === subject.normalizedSubjectKey && batch.status !== 'undone');
      const expected = learners.length * 3;
      const conflicts = subjectGrades.filter(grade => grade.conflictStatus && !['none', 'resolved'].includes(grade.conflictStatus)).length;
      const importPermission = lastBatch ? `<small class="advisory-permission-status ${lastBatch.adviserEditAllowed ? 'is-allowed' : ''}">${lastBatch.adviserEditAllowed ? `Term ${globalScope.esc(lastBatch.term)} · Adviser editing allowed` : `Term ${globalScope.esc(lastBatch.term)} · Read-only`}</small>` : '';
      const latestNote = lastBatch?.adviserModificationNote ? `<small class="advisory-source-note"><strong>Teacher note:</strong> ${globalScope.esc(lastBatch.adviserModificationNote)}</small>` : '';
      return `<tr class="advisory-grade-source-row ${gradeSourceClass(subject.sourceType)}"><td><strong>${globalScope.esc(subject.subjectName)}</strong></td><td>${sourceSummary(subject)}</td><td>${lastBatch ? `${globalScope.esc(lastBatch.filename)}<small>${globalScope.esc(lastBatch.importedAt)}</small>${importPermission}${latestNote}` : 'Not imported'}</td><td data-advisory-received-subject="${globalScope.esc(subject.id)}">${subjectGrades.length}</td><td data-advisory-missing-subject="${globalScope.esc(subject.id)}">${Math.max(0, expected - subjectGrades.length)}</td><td>${conflicts}</td><td class="advisory-subject-order"><button class="btn btn-ghost btn-sm" type="button" data-move-advisory-subject="${globalScope.esc(subject.id)}" data-move-direction="up" aria-label="Move ${globalScope.esc(subject.subjectName)} up" title="Move up" ${index === 0 ? 'disabled' : ''}>&uarr;</button><button class="btn btn-ghost btn-sm" type="button" data-move-advisory-subject="${globalScope.esc(subject.id)}" data-move-direction="down" aria-label="Move ${globalScope.esc(subject.subjectName)} down" title="Move down" ${index === subjects.length - 1 ? 'disabled' : ''}>&darr;</button></td><td><button class="btn btn-ghost btn-sm" data-edit-advisory-subject="${globalScope.esc(subject.id)}">Assign Source</button></td></tr>`;
    }).join('') : '<tr><td colspan="7">No subjects configured.</td></tr>';

    const historyRows = batches.length ? batches.map(batch => `<tr><td>${globalScope.esc(batch.importedAt || '—')}</td><td>${globalScope.esc(batch.filename || 'Unknown file')}<small>${globalScope.esc(batch.sourceTeacher || '')} · ${globalScope.esc(batch.sourceClass || '')}</small>${batch.adviserModificationNote ? `<small class="advisory-source-note"><strong>Teacher note:</strong> ${globalScope.esc(batch.adviserModificationNote)}</small>` : ''}</td><td>${globalScope.esc(batch.subject)} · Term ${globalScope.esc(batch.term)}<small class="advisory-permission-status ${batch.adviserEditAllowed ? 'is-allowed' : ''}">${batch.adviserEditAllowed ? 'Adviser editing allowed' : 'Read-only'}</small></td><td>${batch.importedCount} imported · ${batch.updatedCount} updated · ${batch.skippedCount} skipped · ${batch.conflictCount} conflicts</td><td>${globalScope.esc(batch.status)}</td></tr>`).join('') : '<tr><td colspan="5">No grade imports recorded.</td></tr>';

    const rosterRows = rosterLearners.length ? rosterLearners.map((learner, index) => `<tr><td>${index + 1}</td><td class="advisory-roster__lrn">${globalScope.esc(learner.lrn || '—')}</td><td><strong>${globalScope.esc(globalScope.AdvisoryRoster.displayName(learner))}</strong></td><td>${globalScope.esc(learner.sex || '—')}</td><td>${globalScope.esc(learner.enrollmentStatus || 'active')}</td><td>${globalScope.esc(learner.source || 'manual')}</td><td><div class="advisory-roster-row-actions"><button class="btn btn-ghost btn-sm" type="button" data-edit-advisory-learner="${globalScope.esc(learner.id)}">Edit</button><button class="btn btn-danger btn-sm" type="button" data-remove-advisory-learner="${globalScope.esc(learner.id)}">Remove</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="advisory-roster__empty">No learners yet. Use the roster actions above to import or add learners.</div></td></tr>';
    const availableSections = classSections(profileDb, advisoryClass);
    const hasListedSection = availableSections.some(section => section.toLocaleUpperCase() === text(advisoryClass.section).toLocaleUpperCase());
    const sectionOptions = availableSections.map(section => `<option value="${globalScope.esc(section)}" ${hasListedSection && section.toLocaleUpperCase() === text(advisoryClass.section).toLocaleUpperCase() ? 'selected' : ''}>${globalScope.esc(section)}</option>`).join('');

    panel.innerHTML = `
      <section id="advisoryGradeRecordPanel" role="tabpanel" data-advisory-panel="grades">
        <div class="advisory-grade-panel__header"><div><h3>Learner Grade Record</h3><p>Final grades are shown by default. Show every term at once or use the + beside an individual subject.</p></div><div class="advisory-grade-panel__actions"><button class="btn btn-ghost btn-sm" type="button" data-toggle-advisory-terms aria-pressed="${allTermsExpanded}">${allTermsExpanded ? 'Hide Terms 1–3' : 'Show Terms 1–3'}</button>${quickGradeSubjects.length ? '<button class="btn btn-primary btn-sm" type="button" data-advisory-quick-grade>Quick Grade Entry</button>' : ''}${advisoryClass.isSpecialClass ? '<button class="btn btn-ghost btn-sm" type="button" data-manage-special-subjects>Manage Special Subjects</button>' : ''}<button class="btn btn-primary btn-sm" type="button" data-import-subject-grades>Import Grade Transfer File</button></div></div>
        ${matrix}
      </section>
      <section id="advisoryGradeSourcesPanel" role="tabpanel" data-advisory-panel="sources" hidden>
        <div class="advisory-source-management"><div class="advisory-source-heading"><h3>Grade Sources</h3><p>Subjects are based on Grade ${globalScope.esc(advisoryClass.gradeLevel)}. Choose how each subject's grades will arrive, or use the arrows to set their display order. Grade Transfer Files identify their own school year, subject, and term.</p></div><div class="advisory-grade-matrix-wrap"><table class="advisory-roster-table"><thead><tr><th>Subject</th><th>Grade Source</th><th>Last Import</th><th>Received</th><th>Missing</th><th>Conflicts</th><th>Order</th><th></th></tr></thead><tbody>${sourceRows}</tbody></table></div></div>
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
            <div class="field"><label class="field-label" for="advisoryInlineGrade">Grade Level</label><select class="field-select" id="advisoryInlineGrade" required>${Array.from({ length: 12 }, (_, index) => index + 1).map(level => `<option value="${level}" ${String(level) === String(advisoryClass.gradeLevel) ? 'selected' : ''}>Grade ${level}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label" for="advisoryInlineSection">Section</label><select class="field-select" id="advisoryInlineSection" required><option value="">Select a section</option>${sectionOptions}<option value="__custom__" ${hasListedSection ? '' : 'selected'}>Add a different section...</option></select><input class="field-input advisory-custom-section" id="advisoryInlineCustomSection" value="${globalScope.esc(hasListedSection ? '' : advisoryClass.section)}" placeholder="Enter the section name" ${hasListedSection ? 'hidden' : ''}></div>
          </div>
          <section class="advisory-shs-subject-picker" data-advisory-inline-shs ${isSeniorHighGrade(advisoryClass.gradeLevel) ? '' : 'hidden'}>
            <div><strong>Senior High Subjects</strong><p>Select only the subjects handled by this adviser. Removing a subject archives it, preserving grades and import history.</p></div>
            <div data-advisory-inline-shs-picker>${isSeniorHighGrade(advisoryClass.gradeLevel) ? seniorHighSubjectPickerMarkup(advisoryClass.gradeLevel, activeRegularSubjects.map(item => item.subjectName)) : ''}</div>
          </section>
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
    panel.querySelector('[data-advisory-quick-grade]')?.addEventListener('click', () => showManualQuickGradeModal());
    panel.querySelectorAll('[data-advisory-grade-entry]').forEach(input => {
      const persist = async () => {
        if (input.dataset.saving === 'true') return false;
        if (input.value === input.dataset.savedValue) return true;
        const learner = learners.find(item => item.id === input.dataset.learnerId);
        const subject = subjects.find(item => item.id === input.dataset.subjectId);
        const snapshot = JSON.parse(JSON.stringify(profileDb.advisory));
        input.dataset.saving = 'true';
        input.classList.remove('is-invalid', 'is-saved');
        try {
          const result = input.dataset.entryMode === 'adviser-adjustment'
            ? saveAdviserGradeAdjustment(profileDb, advisoryClass, learner, subject, input.dataset.term, input.value)
            : saveManualGrade(profileDb, advisoryClass, learner, subject, input.dataset.term, input.value);
          if (result.action !== 'unchanged') await globalScope.saveDatabase();
          input.dataset.savedValue = input.value;
          input.closest('td')?.classList.toggle('is-missing', !input.value);
          input.closest('td')?.classList.toggle('has-grade', Boolean(input.value));
          if (input.dataset.entryMode === 'adviser-adjustment' && result.action === 'updated') input.closest('td')?.classList.add('is-adviser-modified');
          input.classList.add('is-saved');
          refreshManualGradeCalculations(panel, learners, subjects);
          globalScope.renderDashboardOverview?.();
          return true;
        } catch (error) {
          profileDb.advisory = snapshot;
          input.value = input.dataset.savedValue;
          input.classList.add('is-invalid');
          globalScope.toast(error.message || 'The grade could not be saved.', 'error');
          return false;
        } finally {
          input.dataset.saving = 'false';
        }
      };
      const navigate = async direction => {
        if (!(await persist())) return;
        const subjectInputs = Array.from(panel.querySelectorAll('[data-advisory-grade-entry]')).filter(candidate => candidate.dataset.subjectId === input.dataset.subjectId);
        const candidates = direction === 'next-learner' || direction === 'previous-learner'
          ? subjectInputs.filter(candidate => candidate.dataset.term === input.dataset.term)
          : subjectInputs;
        const currentIndex = candidates.indexOf(input);
        const targetInput = candidates[currentIndex + (direction === 'previous-learner' || direction === 'previous-cell' ? -1 : 1)];
        if (!targetInput) {
          globalScope.toast(direction.includes('previous') ? 'This is the first editable grade cell.' : 'This is the last editable grade cell.', 'info');
          input.focus();
          input.select();
          return;
        }
        targetInput.focus();
        targetInput.select();
      };
      input.addEventListener('input', () => input.classList.remove('is-invalid', 'is-saved'));
      input.addEventListener('change', persist);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); navigate('next-learner'); }
        if (event.key === 'Tab') { event.preventDefault(); navigate(event.shiftKey ? 'previous-cell' : 'next-cell'); }
        if (event.key === 'Escape') { input.value = input.dataset.savedValue; input.classList.remove('is-invalid', 'is-saved'); input.blur(); }
      });
    });
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
    panel.querySelectorAll('[data-move-advisory-subject]').forEach(button => button.addEventListener('click', async () => {
      if (!moveSubject(profileDb, advisoryClass.id, button.dataset.moveAdvisorySubject, button.dataset.moveDirection)) return;
      await globalScope.saveDatabase();
      globalScope.renderAdvisoryClassPage?.();
    }));
    panel.querySelector('[data-undo-latest-import]')?.addEventListener('click', () => requestUndoLatest(advisoryClass.id));
    panel.querySelector('[data-advisory-import-class]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.showClassImportChooser?.());
    panel.querySelector('[data-advisory-import-sf1]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.importSf1Roster?.());
    panel.querySelector('[data-advisory-add-bulk]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.showBulkModal?.());
    panel.querySelector('[data-advisory-add-manual]')?.addEventListener('click', () => globalScope.AdvisoryRoster?.showLearnerForm?.());
    panel.querySelectorAll('[data-edit-advisory-learner]').forEach(button => button.addEventListener('click', () => globalScope.AdvisoryRoster?.showLearnerForm?.(button.dataset.editAdvisoryLearner)));
    panel.querySelectorAll('[data-remove-advisory-learner]').forEach(button => button.addEventListener('click', () => globalScope.AdvisoryRoster?.removeLearner?.(button.dataset.removeAdvisoryLearner)));
    const settingsForm = panel.querySelector('[data-advisory-settings-form]');
    const inlineGradeInput = settingsForm?.querySelector('#advisoryInlineGrade');
    const sectionSelect = settingsForm?.querySelector('#advisoryInlineSection');
    const customSection = settingsForm?.querySelector('#advisoryInlineCustomSection');
    const inlineSeniorHighSection = settingsForm?.querySelector('[data-advisory-inline-shs]');
    const inlineSeniorHighPicker = settingsForm?.querySelector('[data-advisory-inline-shs-picker]');
    let selectedSeniorHighSubjects = isSeniorHighGrade(advisoryClass.gradeLevel)
      ? activeRegularSubjects.map(item => item.subjectName)
      : [];
    const syncInlineSeniorHighPicker = () => {
      if (!inlineGradeInput || !inlineSeniorHighSection || !inlineSeniorHighPicker) return;
      if (!inlineSeniorHighSection.hidden) selectedSeniorHighSubjects = collectSeniorHighSubjects(inlineSeniorHighPicker);
      const seniorHigh = isSeniorHighGrade(inlineGradeInput.value);
      inlineSeniorHighSection.hidden = !seniorHigh;
      inlineSeniorHighPicker.innerHTML = seniorHigh
        ? seniorHighSubjectPickerMarkup(inlineGradeInput.value, selectedSeniorHighSubjects)
        : '';
    };
    inlineGradeInput?.addEventListener('change', syncInlineSeniorHighPicker);
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
      const seniorHigh = isSeniorHighGrade(gradeLevel);
      const requestedSeniorHighSubjects = seniorHigh ? collectSeniorHighSubjects(inlineSeniorHighPicker) : [];
      if (seniorHigh && !requestedSeniorHighSubjects.length) {
        globalScope.toast('Select at least one Senior High subject.', 'warning');
        inlineSeniorHighPicker.querySelector('input, textarea')?.focus();
        return;
      }
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
      const requestedSeniorHighKeys = new Set(requestedSeniorHighSubjects.map(normalizeSubjectKey));
      const leavingSeniorHigh = isSeniorHighGrade(advisoryClass.gradeLevel) && !seniorHigh;
      const willArchiveRegularSubjects = activeRegularSubjects.some(subject => leavingSeniorHigh || (seniorHigh && !requestedSeniorHighKeys.has(subject.normalizedSubjectKey)));
      const archivedSubjectsHaveGrades = (willArchiveSpecialSubjects && activeSpecialSubjects.some(subject => grades.some(grade => grade.advisorySubjectId === subject.id)))
        || (willArchiveRegularSubjects && activeRegularSubjects.some(subject => grades.some(grade => grade.advisorySubjectId === subject.id)
          && (leavingSeniorHigh || !requestedSeniorHighKeys.has(subject.normalizedSubjectKey))));
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
          if (seniorHigh) syncSeniorHighSubjects(profileDb, savedClass, requestedSeniorHighSubjects);
          else {
            if (leavingSeniorHigh) archiveSeniorHighSubjects(profileDb, savedClass.id, true);
            ensureGradeLevelSubjects(profileDb, savedClass);
          }
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
      if (archivedSubjectsHaveGrades) globalScope.confirmModal('Archive Subject Grades?', 'This change archives one or more subjects. Their grades, source mappings, and import history will be preserved but excluded from the active record and General Average.', commit);
      else await commit();
    });
    bindAdvisoryMatrixScroller(panel);
    setPanelTab(advisoryPanelTab, workspace);
  }

  const api = {
    FORMAT,
    SCHEMA_VERSION,
    ADVISER_NOTE_MAX_LENGTH,
    normalizeSubjectKey,
    matchingLocalClasses,
    standardSubjectsForGrade,
    isSeniorHighGrade,
    seniorHighSubjectPickerMarkup,
    collectSeniorHighSubjects,
    syncSeniorHighSubjects,
    archiveSeniorHighSubjects,
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
    formatGeneralAverage,
    moveSubject,
    saveManualGrade,
    saveAdviserGradeAdjustment,
    manualGradeNavigationTarget,
    subjectDisplayName,
    subjectCompactName,
    sortLearnersBySubject,
    setPanelTab,
    showExportModal,
    showSubjectModal,
    showManualQuickGradeModal,
    selectImportFile,
    renderWorkspacePanel
  };
  globalScope.AdvisoryGradeTransfer = api;
  globalScope.showGradeTransferExportModal = showExportModal;
  globalScope.importAdvisorySubjectGrades = selectImportFile;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
