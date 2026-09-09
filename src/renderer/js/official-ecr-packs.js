'use strict';

function text(value) {
  return String(value == null ? '' : value).trim();
}

function isKinderAssignment(assignment) {
  const grade = text(assignment && assignment.gradeLevel).toLowerCase();
  return grade === '0' || grade === 'k' || grade.includes('kinder');
}

function isGrade1Assignment(assignment) {
  return parseInt(assignment && assignment.gradeLevel, 10) === 1;
}

function isMapehSubject(subject) {
  const value = text(subject).toLowerCase();
  return value === 'mapeh' || value.includes('mapeh') || value.includes('music and arts') || value.includes('physical education and health');
}

function isGmrcOrValuesSubject(subject) {
  const value = text(subject).toLowerCase();
  if (!value) return false;
  if (value.includes('values education')) return true;
  return value.includes('good manners and right conduct') || value.includes('gmrc');
}

function isEppOrTleSubject(subject) {
  const value = text(subject).toLowerCase();
  if (!value) return false;
  if (value.includes('edukasyong pantahanan')) return true;
  if (value.includes('technology and livelihood')) return true;
  if (/\bepp\b/.test(value)) return true;
  return /\btle\b/.test(value);
}

function packRecord(id, available, extra) {
  return Object.assign({
    id,
    available: available !== false,
    title: id,
    warning: ''
  }, extra || {});
}

function officialEcrPackForAssignment(assignment) {
  const a = assignment || {};
  if (isKinderAssignment(a)) {
    return packRecord('kinder', true, {
      title: 'Kindergarten ECR + SF9'
    });
  }
  if (isGrade1Assignment(a)) {
    return packRecord('grade1', true, {
      title: 'Grade 1 PACE + SF9'
    });
  }
  if (isMapehSubject(a.subject)) {
    return packRecord('mapeh', true, { title: 'MAPEH (Music and Arts + PE and Health)' });
  }
  if (isEppOrTleSubject(a.subject)) {
    if (text(a.tleMode) === 'per-component') {
      return packRecord('tle-component', true, {
        title: 'EPP/TLE per-component'
      });
    }
    return packRecord('tle-single', true, { title: 'EPP/TLE single-component' });
  }
  if (isGmrcOrValuesSubject(a.subject)) {
    const pooled = text(a.scoringModel || 'pooled-ww-pt') !== 'gmrc-domains-2026';
    return packRecord('gmrc', true, {
      title: 'GMRC / Values Education',
      warning: pooled
        ? 'This class still uses pooled WW/PT. Official GMRC columns expect domain scores; pooled scores are written into the cognitive columns only.'
        : ''
    });
  }
  return packRecord('academic', true, { title: 'Academic Grades 2–10' });
}

function learnersMissing(assignment, field) {
  const learners = Array.isArray(assignment && assignment.learners) ? assignment.learners : [];
  if (!learners.length) return true;
  return learners.some(learner => {
    if (field === 'sex') {
      const sex = text(learner && learner.sex).toUpperCase();
      return sex !== 'M' && sex !== 'F';
    }
    return !text(learner && learner[field]);
  });
}

function officialEcrExportReadiness(schoolInfo, assignment) {
  const school = schoolInfo || {};
  const items = [
    { field: 'schoolId', label: 'School ID', ok: !!text(school.schoolId) },
    { field: 'region', label: 'Region', ok: !!text(school.region) },
    { field: 'sex', label: 'Sex', ok: !learnersMissing(assignment, 'sex') },
    { field: 'lrn', label: 'LRN', ok: !learnersMissing(assignment, 'lrn') }
  ];
  const pack = officialEcrPackForAssignment(assignment);
  const grade1Hub = pack.id === 'grade1' || pack.id === 'kinder';
  const emptyOfficialCells = [];
  if (!text(school.schoolId)) {
    emptyOfficialCells.push({
      label: 'School ID',
      cell: grade1Hub ? 'INPUT DATA!F15' : 'INPUT DATA!E13'
    });
  }
  if (!text(school.region)) {
    emptyOfficialCells.push({
      label: 'Region',
      cell: grade1Hub ? 'INPUT DATA!F10' : 'INPUT DATA!E10'
    });
  }
  if (!text(school.division)) {
    emptyOfficialCells.push({
      label: 'Division',
      cell: grade1Hub ? 'INPUT DATA!F11' : 'INPUT DATA!E11'
    });
  }
  if (!text(school.schoolName)) {
    emptyOfficialCells.push({
      label: 'School name',
      cell: grade1Hub ? 'INPUT DATA!F16' : 'INPUT DATA!E14'
    });
  }
  if (!text(school.schoolHead)) {
    emptyOfficialCells.push({
      label: 'School head',
      cell: grade1Hub ? 'INPUT DATA!F19' : 'INPUT DATA!E16'
    });
  }
  if (grade1Hub && !text(school.district)) {
    emptyOfficialCells.push({
      label: 'District',
      cell: 'INPUT DATA!F13'
    });
  }
  if (grade1Hub && !text(school.city)) {
    emptyOfficialCells.push({
      label: 'City / Municipality',
      cell: 'INPUT DATA!F12'
    });
  }
  if (learnersMissing(assignment, 'sex')) emptyOfficialCells.push({ label: 'Learner sex', cell: 'Male/Female columns' });
  if (learnersMissing(assignment, 'lrn')) {
    emptyOfficialCells.push({
      label: 'LRN',
      cell: grade1Hub ? 'INPUT DATA!M/R' : 'Stored in the app; Grades 2–10 INPUT DATA has names only'
    });
  }
  if (pack.warning) emptyOfficialCells.push({ label: pack.title, cell: pack.warning });
  return {
    pack,
    items,
    emptyOfficialCells,
    ready: items.every(item => item.ok) && pack.available
  };
}

function officialFinalGrade(term1, term2, term3) {
  const values = [term1, term2, term3];
  if (values.some(value => value === '' || value == null)) return '';
  const grades = values.map(value => Number(value));
  if (grades.some(value => !Number.isFinite(value))) return '';
  return Math.round((grades[0] + grades[1] + grades[2]) / 3);
}

function officialFinalStatus(term1, term2, term3) {
  const official = officialFinalGrade(term1, term2, term3);
  const present = [term1, term2, term3].filter(value => value !== '' && value != null && Number.isFinite(Number(value)));
  const running = present.length
    ? Math.round(present.reduce((sum, value) => sum + Number(value), 0) / present.length)
    : '';
  const ready = official !== '';
  return {
    official: ready ? official : '',
    running,
    ready,
    hint: ready ? '' : 'Official final appears after Term 3'
  };
}

function officialEcrSchoolFromProfile(profile) {
  const db = profile || {};
  return {
    schoolName: text(db.schoolName),
    schoolId: text(db.schoolId),
    region: text(db.region),
    division: text(db.division),
    district: text(db.district),
    city: text(db.city || db.municipality),
    schoolYear: text(db.schoolYear),
    teacherName: text(db.teacherName),
    schoolHead: text(db.schoolHead)
  };
}

function officialLetterRatingsByTerm(items, readLetter) {
  const ratings = { 1: {}, 2: {}, 3: {} };
  (items || []).forEach(item => {
    ['1', '2', '3'].forEach(term => {
      const letter = readLetter ? readLetter(item.id, term) : '';
      if (letter) ratings[term][item.id] = letter;
    });
  });
  return ratings;
}

function officialEcrWizardState(schoolInfo, assignment) {
  const readiness = officialEcrExportReadiness(schoolInfo, assignment);
  const learners = Array.isArray(assignment && assignment.learners) ? assignment.learners : [];
  return Object.assign({}, readiness, {
    source: 'Settings and class roster',
    males: learners.filter(learner => text(learner && learner.sex).toUpperCase() === 'M').length,
    females: learners.filter(learner => text(learner && learner.sex).toUpperCase() === 'F').length,
    fillsFromSettings: [
      'schoolId', 'region', 'division', 'district', 'city',
      'schoolName', 'schoolHead', 'teacherName', 'schoolYear'
    ]
  });
}

const api = {
  officialEcrPackForAssignment,
  officialEcrExportReadiness,
  officialEcrSchoolFromProfile,
  officialEcrWizardState,
  officialLetterRatingsByTerm,
  officialFinalGrade,
  officialFinalStatus,
  isKinderAssignment,
  isEppOrTleSubject
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window === 'object' && window) {
  Object.assign(window, api);
}
