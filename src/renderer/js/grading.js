/**
 * E-Class Record — Grading Calculation Engine
 *
 * Implements standard DepEd Department Order (DO) grading rules,
 * including DO 15 s.2026, DO 017 s.2026 Strengthened SHS curriculum
 * selection, and DO 8 s.2015 weights for non-pilot Grade 12.
 */

let currentMapehSubTab = 'music_arts';
let currentTleSubTab = 'ict';

function setTleSubTab(part) {
  currentTleSubTab = part || 'ict';
  if (typeof renderRecordTable === 'function') renderRecordTable();
}

function setMapehSubTab(part) {
  currentMapehSubTab = part || 'music_arts';
  if (typeof renderRecordTable === 'function') renderRecordTable();
}

function currentTlePartForTerm(assignment, term) {
  if (!usesTleComponentScoring(assignment)) return undefined;
  if (currentTleSubTab === 'consolidated') return 'consolidated';
  if (currentTleSubTab === 'spec') return tleSpecializationForTerm(term);
  return 'ict';
}

function isMapehSubject(subject) {
  const s = (subject || '').toLowerCase();
  return s === 'mapeh' || s.includes('mapeh') || s.includes('music and arts') || s.includes('physical education and health');
}

// Transmutation table: DO 015, s. 2026 Transition
const adjusted2026 = [
  [99.50, 100.00, 100], [98.32, 99.49, 99], [97.14, 98.31, 98], [95.96, 97.13, 97],
  [94.78, 95.95, 96], [93.60, 94.77, 95], [92.42, 93.59, 94], [91.24, 92.41, 93],
  [90.06, 91.23, 92], [88.88, 90.05, 91], [87.70, 88.87, 90], [86.52, 87.69, 89],
  [85.34, 86.51, 88], [84.16, 85.33, 87], [82.98, 84.15, 86], [81.80, 82.97, 85],
  [80.62, 81.79, 84], [79.44, 80.61, 83], [78.26, 79.43, 82], [77.08, 78.25, 81],
  [75.90, 77.07, 80], [74.72, 75.89, 79], [73.54, 74.71, 78], [72.36, 73.53, 77],
  [71.18, 72.35, 76], [70.00, 71.17, 75], [65.34, 69.99, 74], [60.67, 65.33, 73],
  [56.01, 60.66, 72], [51.34, 56.00, 71], [46.67, 51.33, 70], [42.01, 46.66, 69],
  [37.34, 42.00, 68], [32.68, 37.33, 67], [28.01, 32.67, 66], [23.35, 28.00, 65],
  [18.68, 23.34, 64], [14.01, 18.67, 63], [9.35, 14.00, 62], [4.68, 9.34, 61],
  [0.00, 4.67, 60]
];


// Transmutation table: Key Stage 2 Trimester
const keyStage2Transmutation = [
  [99.50, 100], [98.32, 99], [97.14, 98], [95.96, 97], [94.78, 96], [93.60, 95], [92.42, 94], [91.24, 93],
  [90.06, 92], [88.88, 91], [87.70, 90], [86.52, 89], [85.34, 88], [84.16, 87], [82.98, 86], [81.80, 85],
  [80.62, 84], [79.44, 83], [78.26, 82], [77.08, 81], [75.90, 80], [74.72, 79], [73.54, 78], [72.36, 77],
  [71.18, 76], [70.00, 75], [65.34, 74], [60.67, 73], [56.01, 72], [51.34, 71], [46.67, 70], [42.01, 69],
  [37.34, 68], [32.68, 67], [28.01, 66], [23.35, 65], [18.68, 64], [14.01, 63], [9.35, 62], [4.68, 61],
  [0.00, 60]
];

// Key Stage 1 Template (Grades 1-3)
const keyStage1Template = [
  { component: 'WW', title: 'WW 1' },
  { component: 'WW', title: 'WW 2' },
  { component: 'WW', title: 'WW 3' },
  { component: 'WW', title: 'WW 4' },
  { component: 'PT', title: 'PT 1' },
  { component: 'PT', title: 'PT 2' },
  { component: 'PT', title: 'PT 3' },
  { component: 'PT', title: 'PT 4' },
  { component: 'ST1', title: 'ST1' },
  { component: 'ST2', title: 'ST2' },
  { component: 'TE', title: 'TE' }
];

// Key Stage 2 Preset Template for Trimesters (Grades 4-6)
const keyStage2Template = [
  { component: 'WW', title: 'WW 1' },
  { component: 'WW', title: 'WW 2' },
  { component: 'WW', title: 'WW 3' },
  { component: 'WW', title: 'WW 4' },
  { component: 'WW', title: 'WW 5' },
  { component: 'PT', title: 'PT 1' },
  { component: 'PT', title: 'PT 2' },
  { component: 'PT', title: 'PT 3' },
  { component: 'ST1', title: 'ST1' },
  { component: 'ST2', title: 'ST2' },
  { component: 'TE', title: 'TE' }
];

// DO 015, s. 2026 Table 3 recommends 3-5 WWs and 2-3 PTs per
// learning area, per term, for Grades 4-12. Presets use the upper end
// of those flexible ranges so teachers have the full recommended capacity.
// Junior High Template (Grades 7-10)
const juniorHighTemplate = [
  { component: 'WW', title: 'WW 1' },
  { component: 'WW', title: 'WW 2' },
  { component: 'WW', title: 'WW 3' },
  { component: 'WW', title: 'WW 4' },
  { component: 'WW', title: 'WW 5' },
  { component: 'PT', title: 'PT 1' },
  { component: 'PT', title: 'PT 2' },
  { component: 'PT', title: 'PT 3' },
  { component: 'ST1', title: 'ST1' },
  { component: 'ST2', title: 'ST2' },
  { component: 'TE', title: 'TE' }
];

// Senior High Template (Grades 11-12)
const seniorHighTemplate = [
  { component: 'WW', title: 'WW 1' },
  { component: 'WW', title: 'WW 2' },
  { component: 'WW', title: 'WW 3' },
  { component: 'WW', title: 'WW 4' },
  { component: 'WW', title: 'WW 5' },
  { component: 'PT', title: 'PT 1' },
  { component: 'PT', title: 'PT 2' },
  { component: 'PT', title: 'PT 3' },
  { component: 'ST1', title: 'ST1' },
  { component: 'ST2', title: 'ST2' },
  { component: 'TE', title: 'TE' }
];

/**
 * Returns the assessment template matching the given grade level.
 * @param {string|number} gradeLevel
 */
function templateForGrade(gradeLevel) {
  if (typeof isKinderGradeLevel === 'function' && isKinderGradeLevel(gradeLevel)) return [];
  if (typeof isKinderAssignment === 'function' && isKinderAssignment({ gradeLevel })) return [];
  if (typeof db !== 'undefined' && db.useUniversalTrimesterLayout) {
    return keyStage2Template;
  }
  const grade = parseInt(gradeLevel);
  if (grade === 1) return keyStage1Template;
  if (grade <= 3) return keyStage2Template;
  if (grade <= 6) return keyStage2Template;
  if (grade <= 10) return juniorHighTemplate;
  return seniorHighTemplate;
}

const DESCRIPTOR_LEGEND = Object.freeze({
  A: {
    english: 'Advancing',
    filipino: 'Namumukod-tangi',
    range: '90–100',
    description: 'The learner demonstrates knowledge and skills beyond grade-level expectations.'
  },
  B: {
    english: 'Benchmarking',
    filipino: 'Naipamamalas',
    range: '80–89',
    description: 'The learner consistently demonstrates the knowledge and skills expected at grade level.'
  },
  C: {
    english: 'Connecting',
    filipino: 'Natutungo',
    range: '75–79',
    description: 'The learner is approaching the knowledge and skills expected at grade level.'
  },
  D: {
    english: 'Developing',
    filipino: 'Nagpapaunlad',
    range: '65–74',
    description: 'The learner is developing the knowledge and skills expected at grade level and needs support.'
  },
  E: {
    english: 'Emerging',
    filipino: 'Nagsisimula',
    range: '0–64',
    description: 'The learner is beginning to demonstrate the knowledge and skills expected at grade level.'
  }
});

function descriptorLabel(letter) {
  const item = DESCRIPTOR_LEGEND[String(letter || '').toUpperCase()];
  return item ? `${item.english} (${item.filipino})` : '';
}

function descriptorLegendText(letter) {
  const code = String(letter || '').toUpperCase();
  const item = DESCRIPTOR_LEGEND[code];
  if (!item) return '';
  return `${code} — ${item.english} (${item.filipino}), ${item.range}. ${item.description}`;
}

function officialComponentTitle(componentOrGroup) {
  const key = String(componentOrGroup || '').toUpperCase();
  if (key === 'WW') return 'Written / Oral Works';
  if (key === 'PT') return 'Product / Performance Tasks';
  if (key === 'EX' || key === 'TE' || key === 'ST1' || key === 'ST2' || key === 'SA1' || key === 'SA2') {
    return 'Examinations';
  }
  if (key === 'IG') return 'Initial Grade';
  if (key === 'TG') return 'Term Grade';
  return '';
}

function gmrcDomainHeaderTitle(component, domain) {
  const base = officialComponentTitle(component) || String(component || '');
  const label = {
    cognitive: 'Cognitive',
    affective: 'Affective',
    behavioral: 'Behavioral'
  }[String(domain || '').toLowerCase()] || '';
  return label ? `${base} · ${label}` : base;
}

function officialComponentTabLabel(kind, term, part) {
  const termLabel = `Term ${term || '1'}`;
  const which = String(part || '');
  if (kind === 'mapeh') {
    if (which === 'music_arts') return `${termLabel} Music & Arts`;
    if (which === 'pe_health') return `${termLabel} PE & Health`;
    if (which === 'consolidated') return `${termLabel} MAPEH`;
  }
  if (kind === 'tle') {
    if (which === 'ict') return `${termLabel} ICT`;
    if (which === 'afa') return `${termLabel} AFA`;
    if (which === 'fcs') return `${termLabel} FCS`;
    if (which === 'ia') return `${termLabel} IA`;
    if (which === 'spec') {
      const spec = typeof tleSpecializationForTerm === 'function'
        ? tleSpecializationForTerm(term)
        : 'afa';
      return officialComponentTabLabel('tle', term, spec);
    }
    if (which === 'consolidated') return `${termLabel} TLE`;
  }
  return termLabel;
}

/** Existing classes keep pooled WW/PT averages. Official GMRC domains are opt-in later. */
const SCORING_MODEL_POOLED = 'pooled-ww-pt';
const SCORING_MODEL_GMRC_DOMAINS = 'gmrc-domains-2026';
/** Existing TLE/EPP classes stay one component. Per-component ICT+specialization is opt-in. */
const TLE_MODE_SINGLE = 'single';
const TLE_MODE_PER_COMPONENT = 'per-component';
const TLE_COMPONENT_WEIGHTS = Object.freeze({ ict: 0.25, specialization: 0.75 });

function isEppOrTleSubject(subject) {
  const value = String(subject || '').toLowerCase();
  if (!value) return false;
  if (value.includes('edukasyong pantahanan')) return true;
  if (value.includes('technology and livelihood')) return true;
  if (/\bepp\b/.test(value)) return true;
  return /\btle\b/.test(value);
}

function usesTleComponentScoring(assignment) {
  return (assignment?.tleMode || TLE_MODE_SINGLE) === TLE_MODE_PER_COMPONENT;
}

function tlePartsForTerm(term) {
  const spec = { 1: 'afa', 2: 'fcs', 3: 'ia' }[String(term)];
  return spec ? ['ict', spec] : ['ict'];
}

function tleSpecializationForTerm(term) {
  return tlePartsForTerm(term)[1];
}

function assessmentPartsForTerm(assignment, term) {
  if (isMapehSubject(assignment && assignment.subject)) return ['music_arts', 'pe_health'];
  if (usesTleComponentScoring(assignment)) return tlePartsForTerm(term);
  return [undefined];
}

function consolidateTleTermGrade(ictGrade, specGrade) {
  const ict = Number(ictGrade);
  const spec = Number(specGrade);
  if (!Number.isFinite(ict) || !Number.isFinite(spec)) return null;
  return Math.round(ict * TLE_COMPONENT_WEIGHTS.ict + spec * TLE_COMPONENT_WEIGHTS.specialization);
}

function computeTleConsolidatedTerm(assignment, learnerId, term) {
  const parts = tlePartsForTerm(term);
  const ict = computeTerm(assignment, learnerId, term, parts[0]);
  const spec = computeTerm(assignment, learnerId, term, parts[1]);
  const termGrade = consolidateTleTermGrade(ict.termGrade, spec.termGrade);
  return {
    ict,
    spec,
    ictTermGrade: ict.termGrade,
    specTermGrade: spec.termGrade,
    specPart: parts[1],
    termGrade,
    hasData: !!(ict.hasData && spec.hasData && termGrade !== null)
  };
}

const GMRC_DOMAIN_WEIGHTS = Object.freeze({
  WW_cognitive: 10,
  WW_affective: 10,
  PT_cognitive: 10,
  PT_affective: 10,
  PT_behavioral: 30,
  EX: 30
});

function isGmrcOrValuesSubject(subject) {
  const value = String(subject || '').toLowerCase();
  if (!value) return false;
  if (value.includes('values education')) return true;
  return value.includes('good manners and right conduct') || value.includes('gmrc');
}

function usesGmrcDomainScoring(assignment) {
  return (assignment?.scoringModel || SCORING_MODEL_POOLED) === SCORING_MODEL_GMRC_DOMAINS;
}

function schoolYearStartYear(schoolYear) {
  const year = parseInt(String(schoolYear || '').slice(0, 4), 10);
  return Number.isFinite(year) ? year : 0;
}

/** Official GMRC domain and TLE per-component sheets default from SY 2027-2028. */
const OFFICIAL_GMRC_TLE_LAYOUT_FROM_YEAR = 2027;

function officialGmrcTleLayoutsDefaultOn(schoolYear) {
  return schoolYearStartYear(schoolYear) >= OFFICIAL_GMRC_TLE_LAYOUT_FROM_YEAR;
}

function defaultScoringModelForNewAssignment(gradeLevel, subject, schoolYear) {
  if (parseInt(gradeLevel, 10) >= 2 && isGmrcOrValuesSubject(subject) && officialGmrcTleLayoutsDefaultOn(schoolYear)) {
    return SCORING_MODEL_GMRC_DOMAINS;
  }
  return SCORING_MODEL_POOLED;
}

function defaultTleModeForNewAssignment(gradeLevel, subject, schoolYear) {
  if (officialGmrcTleLayoutsDefaultOn(schoolYear) && isEppOrTleSubject(subject)) {
    return TLE_MODE_PER_COMPONENT;
  }
  return TLE_MODE_SINGLE;
}

function usesTermGradeOnly(assignment, term) {
  return !!(assignment && assignment.term1GradeOnly && String(term) === '1');
}

function canDuplicateToOfficialSheet(assignment) {
  if (!assignment) return false;
  if (assignment.term1GradeOnly) return false;
  const grade = parseInt(assignment.gradeLevel, 10);
  if (!Number.isFinite(grade) || grade < 2) return false;
  if (isGmrcOrValuesSubject(assignment.subject) && !usesGmrcDomainScoring(assignment)) return true;
  if (isEppOrTleSubject(assignment.subject) && !usesTleComponentScoring(assignment)) return true;
  return false;
}

function assignmentOfficialSheetLabel(assignment) {
  if (!assignment?.term1GradeOnly) return '';
  if (usesGmrcDomainScoring(assignment)) return 'Official sheet · Term 1 grades copied';
  if (usesTleComponentScoring(assignment)) return 'Official sheet · Term 1 grades copied';
  return 'Official sheet · Term 1 grades copied';
}

function cloneLearnerForOfficialSheet(learner, term1Grade) {
  const copy = {
    id: typeof uid === 'function' ? uid('learner') : `learner-${Date.now()}`,
    lrn: learner?.lrn || '',
    lastName: learner?.lastName,
    firstName: learner?.firstName,
    middleName: learner?.middleName || '',
    name: learner?.name,
    sex: learner?.sex,
    birthdate: learner?.birthdate,
    avatarPresetId: learner?.avatarPresetId || '',
    avatarAssignment: learner?.avatarAssignment === 'manual' ? 'manual' : 'auto',
    displayName: learner?.displayName
  };
  if (learner?.transferredOutTerm) copy.transferredOutTerm = learner.transferredOutTerm;
  if (term1Grade !== null && term1Grade !== undefined && term1Grade !== '') {
    copy.transferredInGrades = { 1: term1Grade };
  }
  return copy;
}

function termGradeForOfficialSheetCopy(assignment, learnerId) {
  if (!assignment) return null;
  const result = computeTerm(assignment, learnerId, '1');
  if (!result || !result.hasData) return null;
  return result.termGrade;
}

function setLearnerCopiedTermGrade(assignment, learnerId, value) {
  if (!assignment?.term1GradeOnly || !Array.isArray(assignment.learners)) return false;
  const learner = assignment.learners.find(item => item && item.id === learnerId);
  if (!learner) return false;
  const trimmed = String(value ?? '').trim();
  if (!learner.transferredInGrades) learner.transferredInGrades = {};
  if (!trimmed) {
    delete learner.transferredInGrades['1'];
    if (!Object.keys(learner.transferredInGrades).length) delete learner.transferredInGrades;
    return true;
  }
  if (trimmed.toUpperCase() === 'T/O') {
    learner.transferredInGrades['1'] = 'T/O';
    return true;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return false;
  learner.transferredInGrades['1'] = Math.round(numeric);
  return true;
}

function duplicateAssignmentToOfficialSheet(source) {
  if (!canDuplicateToOfficialSheet(source)) return null;
  const isGmrc = isGmrcOrValuesSubject(source.subject);
  const copy = {
    id: typeof uid === 'function' ? uid('class') : `class-${Date.now()}`,
    gradeLevel: source.gradeLevel,
    section: source.section,
    subject: source.subject,
    subjectGroup: source.subjectGroup,
    policy: source.policy,
    schoolYear: source.schoolYear,
    ...(source.shsSubjectGroup ? { shsSubjectGroup: source.shsSubjectGroup } : {}),
    ...(source.shsCurriculum ? { shsCurriculum: source.shsCurriculum } : {}),
    isSpecialProgramSubject: !!source.isSpecialProgramSubject,
    ...(source.isSpecialProgramSubject && source.specialProgramWeights
      ? { specialProgramWeights: Array.isArray(source.specialProgramWeights) ? source.specialProgramWeights.slice() : source.specialProgramWeights }
      : {}),
    scoringModel: isGmrc ? SCORING_MODEL_GMRC_DOMAINS : SCORING_MODEL_POOLED,
    tleMode: isGmrc ? TLE_MODE_SINGLE : TLE_MODE_PER_COMPONENT,
    term1GradeOnly: true,
    layoutMigration: {
      sourceAssignmentId: source.id || '',
      copiedTerm: '1'
    },
    learners: [],
    assessments: [],
    scores: {}
  };
  const template = isGmrc && typeof gmrcDomainTemplate === 'function'
    ? gmrcDomainTemplate()
    : (typeof templateForGrade === 'function' ? templateForGrade(copy.gradeLevel) : []);
  seedTemplateAssessments(copy, template);
  copy.learners = (source.learners || []).map(learner => {
    const term1Grade = termGradeForOfficialSheetCopy(source, learner.id);
    return cloneLearnerForOfficialSheet(learner, term1Grade);
  });
  return copy;
}

function gmrcDomainTemplate() {
  const items = [];
  for (let i = 1; i <= 5; i++) items.push({ component: 'WW', title: `WW ${i}`, domain: 'cognitive' });
  for (let i = 1; i <= 5; i++) items.push({ component: 'WW', title: `WW ${i}`, domain: 'affective' });
  for (let i = 1; i <= 3; i++) items.push({ component: 'PT', title: `PT ${i}`, domain: 'cognitive' });
  for (let i = 1; i <= 3; i++) items.push({ component: 'PT', title: `PT ${i}`, domain: 'affective' });
  for (let i = 1; i <= 3; i++) items.push({ component: 'PT', title: `PT ${i}`, domain: 'behavioral' });
  items.push({ component: 'ST1', title: 'ST1' }, { component: 'ST2', title: 'ST2' }, { component: 'TE', title: 'TE' });
  return items;
}

function maxComponentCount(a, component) {
  const groups = new Map();
  (a?.assessments || []).forEach(item => {
    if (canonicalAssessmentComponent(item?.component) !== component) return;
    const key = `${item.term}|${item.mapePart || 'regular'}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  let max = 0;
  groups.forEach(count => {
    if (count > max) max = count;
  });
  return max;
}

function templateFromColumnCounts(wwCount, ptCount) {
  const template = [];
  for (let i = 1; i <= wwCount; i++) template.push({ component: 'WW', title: `WW ${i}` });
  for (let i = 1; i <= ptCount; i++) template.push({ component: 'PT', title: `PT ${i}` });
  template.push({ component: 'ST1', title: 'ST1' }, { component: 'ST2', title: 'ST2' }, { component: 'TE', title: 'TE' });
  return template;
}

/**
 * Pins the WW/PT column counts already stored on a class so later preset
 * changes (for example Grades 2–3 moving from 4+4 to 5+3) cannot drop or
 * reshape existing records.
 */
function freezeColumnPreset(a) {
  if (!a || typeof a !== 'object') return null;
  const frozenWw = Number(a.columnPreset?.ww);
  const frozenPt = Number(a.columnPreset?.pt);
  if (Number.isInteger(frozenWw) && frozenWw >= 0 && Number.isInteger(frozenPt) && frozenPt >= 0) {
    const ww = Math.max(frozenWw, maxComponentCount(a, 'WW'));
    const pt = Math.max(frozenPt, maxComponentCount(a, 'PT'));
    a.columnPreset = { ww, pt };
    return a.columnPreset;
  }
  const ww = maxComponentCount(a, 'WW');
  const pt = maxComponentCount(a, 'PT');
  if (ww === 0 && pt === 0) return null;
  a.columnPreset = { ww, pt };
  return a.columnPreset;
}

/**
 * Additive compatibility flags. Existing databases keep their current
 * formulas and column layouts; new official packs must opt in per class.
 */
function freezeRecordCompatibility(a) {
  if (!a || typeof a !== 'object') return a;
  freezeColumnPreset(a);
  if (!a.scoringModel) a.scoringModel = SCORING_MODEL_POOLED;
  if (!a.tleMode) a.tleMode = TLE_MODE_SINGLE;
  return a;
}

function templateForAssignment(a) {
  freezeColumnPreset(a);
  if (usesGmrcDomainScoring(a)) return gmrcDomainTemplate();
  const preset = a?.columnPreset;
  if (preset && Number.isInteger(Number(preset.ww)) && Number.isInteger(Number(preset.pt))) {
    return templateFromColumnCounts(preset.ww, preset.pt);
  }
  return templateForGrade(a?.gradeLevel);
}

function retainUnmatchedAssessments(a, newAssessments, usedIds) {
  const leftovers = (a?.assessments || []).filter(item => item && item.id && !usedIds.has(item.id));
  leftovers.forEach(item => {
    usedIds.add(item.id);
    let insertAt = newAssessments.length;
    for (let i = newAssessments.length - 1; i >= 0; i--) {
      const current = newAssessments[i];
      if (String(current.term) === String(item.term) && matchingMapehPart(current, item.mapePart)) {
        insertAt = i + 1;
        break;
      }
    }
    newAssessments.splice(insertAt, 0, item);
  });
  return leftovers.length;
}

const SHS_CURRICULUM_SSHS = 'SSHS';
const SHS_CURRICULUM_K12_2016 = 'K12_2016';

function parseSchoolYearStart(sy) {
  if (sy) {
    const parsed = parseInt(String(sy).split('-')[0], 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 2026;
}

function normalizeShsCurriculum(value) {
  return value === SHS_CURRICULUM_SSHS || value === SHS_CURRICULUM_K12_2016 ? value : '';
}

/**
 * Resolves whether a Senior High class uses Strengthened SHS (DO 017)
 * or the 2016 K to 12 SHS curriculum. Grade 12 in SY 2026-2027 defaults
 * to 2016 unless the teacher marks the class as a pilot SSHS section.
 */
function resolveShsCurriculum(gradeLevel, schoolYear, override) {
  const explicit = normalizeShsCurriculum(override);
  if (explicit) return explicit;
  const grade = parseInt(gradeLevel, 10);
  const startYear = parseSchoolYearStart(schoolYear);
  if (grade === 11 && startYear >= 2025) return SHS_CURRICULUM_SSHS;
  if (grade === 12 && startYear >= 2027) return SHS_CURRICULUM_SSHS;
  if (grade === 12) return SHS_CURRICULUM_K12_2016;
  return SHS_CURRICULUM_SSHS;
}

function isShsSshsSubjectGroup(group) {
  return Boolean(SENIOR_HIGH_SSHS_SUBJECT_GROUPS[group]);
}

/**
 * Infers curriculum for existing assignments without rewriting scores.
 * Unique SSHS Grade 12 subjects and stored SSHS groups stay on SSHS.
 */
function inferShsCurriculum(assignment) {
  const existing = normalizeShsCurriculum(assignment?.shsCurriculum);
  if (existing) return existing;
  const grade = parseInt(assignment?.gradeLevel, 10);
  if (grade < 11 || grade > 12) return '';
  const startYear = parseSchoolYearStart(assignment?.schoolYear);
  const subject = assignment?.subject;
  const inSshs = isSubjectInSeniorHighCatalog(subject, SHS_CURRICULUM_SSHS);
  const in2016 = isSubjectInSeniorHighCatalog(subject, SHS_CURRICULUM_K12_2016);
  if (grade === 12 && startYear === 2026 && inSshs && !in2016) return SHS_CURRICULUM_SSHS;
  const storedGroup = assignment?.shsSubjectGroup || assignment?.subjectGroup;
  if (grade === 12 && startYear === 2026 && isShsSshsSubjectGroup(storedGroup)) {
    return SHS_CURRICULUM_SSHS;
  }
  return resolveShsCurriculum(grade, assignment?.schoolYear);
}

function inferAdvisoryShsCurriculum(advisoryClass, subjectNames) {
  const existing = normalizeShsCurriculum(advisoryClass?.shsCurriculum);
  if (existing) return existing;
  const grade = parseInt(advisoryClass?.gradeLevel, 10);
  if (grade < 11 || grade > 12) return '';
  const names = Array.isArray(subjectNames) ? subjectNames : [];
  const uniquelySshs = names.some(name => (
    isSubjectInSeniorHighCatalog(name, SHS_CURRICULUM_SSHS)
    && !isSubjectInSeniorHighCatalog(name, SHS_CURRICULUM_K12_2016)
  ));
  if (grade === 12 && parseSchoolYearStart(advisoryClass?.schoolYear) === 2026 && uniquelySshs) {
    return SHS_CURRICULUM_SSHS;
  }
  return resolveShsCurriculum(grade, advisoryClass?.schoolYear);
}

function shsCurriculumOptionsForGrade(gradeLevel, schoolYear) {
  const grade = parseInt(gradeLevel, 10);
  const startYear = parseSchoolYearStart(schoolYear);
  const resolved = resolveShsCurriculum(gradeLevel, schoolYear);
  return {
    grade,
    startYear,
    resolved,
    showPilotOverride: grade === 12 && startYear === 2026,
    note: grade === 11
      ? 'Strengthened SHS Curriculum (DepEd Order No. 017, s. 2026).'
      : (grade === 12 && startYear >= 2027
        ? 'Strengthened SHS Curriculum (DepEd Order No. 017, s. 2026).'
        : '2016 K to 12 SHS Curriculum. Grade 12 in SY 2026-2027 uses DepEd Order No. 8, s. 2015 weights with the DO 15 transmutation table.')
  };
}

/**
 * Returns the list of standard subjects for a given grade level.
 * @param {string|number} gradeLevel
 * @returns {string[]}
 */
const SENIOR_HIGH_SUBJECT_CATALOG = Object.freeze([
  {
    label: 'Core Subjects',
    grades: [11, 12],
    group: 'SHS_CORE',
    subjects: [
      'Effective Communication',
      'Mabisang Komunikasyon',
      'General Mathematics',
      'General Science',
      'Life and Career Skills',
      'Pag-aaral ng Kasaysayan at Lipunang Pilipino'
    ]
  },
  {
    label: 'Academic Electives — Arts and Creative Fields',
    grades: [11, 12],
    group: 'SHS_ARTS',
    subjects: [
      'Art Criticism and Creative Markets',
      'Contemporary Literature 1',
      'Contemporary Literature 2',
      'Creative Composition 1',
      'Creative Composition 2',
      'Creative Industries — Applied and Traditional Arts',
      'Creative Industries — Dance',
      'Creative Industries — Literary Arts',
      'Creative Industries — Media Arts',
      'Creative Industries — Music',
      'Creative Industries — Theater Arts',
      'Creative Industries — Visual Arts',
      'Filipino 2 — Filipino sa Isports',
      'Filipino 2 — Filipino sa Sining at Disenyo',
      'Filipino Identity Through the Arts',
      'Leadership and Management in the Arts',
      'Malikhaing Pagsulat',
      'Performance Criticism and Creative Markets'
    ]
  },
  {
    label: 'Academic Electives — Social Sciences and Humanities',
    grades: [11, 12],
    group: 'SHS_ACADEMIC',
    subjects: [
      'Citizenship and Civic Engagement',
      'Filipino 1 — Wika at Komunikasyon sa Akademikong Filipino',
      'Filipino 2 — Filipino para sa Larang Teknikal Propesyonal',
      'Introduction to Philosophy',
      'Philippine Governance / Philippine Politics and Governance',
      'Social Sciences Theory and Practice'
    ]
  },
  {
    label: 'Academic Electives — Business and Entrepreneurship',
    grades: [11, 12],
    group: 'SHS_ACADEMIC',
    subjects: [
      'Business 1 — Basic Accounting',
      'Business 2 — Business Finance and Income Taxation',
      'Business 3 — Business Economics',
      'Contemporary Marketing',
      'Entrepreneurship',
      'Introduction to Organization and Management'
    ]
  },
  {
    label: 'Academic Electives — STEM',
    grades: [11, 12],
    group: 'SHS_ACADEMIC',
    subjects: [
      'Biology 1', 'Biology 2',
      'Chemistry 1', 'Chemistry 2',
      'Earth and Space Science 1', 'Earth and Space Science 2',
      'Finite Mathematics 1', 'Finite Mathematics 2',
      'Physics 1', 'Physics 2'
    ]
  },
  {
    label: 'Academic Electives — Sports, Health, and Wellness',
    grades: [11, 12],
    group: 'SHS_ARTS',
    subjects: [
      'Human Movement 1 — Basic Anatomy in Sports and Exercise',
      'Human Movement 2 — Motor Skills Development',
      'Physical Education 1 — Fitness and Recreation',
      'Physical Education 2 — Sports and Dance',
      'Sports Activity Management',
      'Sports Coaching',
      'Sports Officiating'
    ]
  },
  {
    label: 'Grade 12 — New Arts and STEM Subjects',
    grades: [12],
    group: 'SHS_ACADEMIC',
    subjects: [
      'Advanced Mathematics',
      'Basic Calculus',
      'Biology 3', 'Biology 4',
      'Chemistry 3', 'Chemistry 4',
      'Conceptual Biology and Earth and Space Science',
      'Conceptual Physics and Chemistry in Daily Life',
      'Database Management',
      'Earth and Space Science 3', 'Earth and Space Science 4',
      'Empowerment Technologies',
      'Fundamentals of Data Analytics',
      'Physics 3', 'Physics 4',
      'Pre-Calculus'
    ]
  },
  {
    label: 'Grade 12 — Creative Production',
    grades: [12],
    group: 'SHS_FIELD',
    subjects: ['Creative Production and Presentation']
  },
  {
    label: 'Grade 12 — Field Experience and Arts Apprenticeship',
    grades: [12],
    group: 'SHS_FIELD',
    subjects: [
      'Arts Apprenticeship — Dance',
      'Arts Apprenticeship — Literary Arts',
      'Arts Apprenticeship — Media Arts',
      'Arts Apprenticeship — Music',
      'Arts Apprenticeship — Theater Arts',
      'Arts Apprenticeship — Traditional Cultural Expressions',
      'Arts Apprenticeship — Visual Arts',
      'In-Campus Field Exposure for Sports'
    ]
  },
  {
    label: 'Grade 12 — Research, Design, and Innovation',
    grades: [12],
    group: 'SHS_RESEARCH',
    subjects: ['Design and Innovation', 'Research 1', 'Research 2']
  },
  {
    label: 'Grade 12 — Sports, Health, and Wellness',
    grades: [12],
    group: 'SHS_ARTS',
    subjects: ['Exercise and Sports Programming', 'First Aid', 'Fundamentals of Basic Life Support']
  },
  {
    label: 'TechPro — Aesthetic, Wellness, and Human Care',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Aesthetic Services (Beauty Care)', 'Barbering Services', 'Caregiving (Adult Care)', 'Caregiving (Child Care)', 'Hairdressing Services', 'Wellness Services (Hilot / Massage)']
  },
  {
    label: 'TechPro — Agri-Fishery Business and Food Innovation',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Agricultural Crops Production', 'Agro-Entrepreneurship', 'Aquaculture', 'Fish Capture', 'Fish Capture Operation', 'Food Processing', 'Organic Agriculture Production', 'Poultry Production (Chicken)', 'Ruminants Production', 'Swine Production']
  },
  {
    label: 'TechPro — Artisanry and Creative Enterprise',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Garments Artisanry', 'Handicrafts (Weaving)']
  },
  {
    label: 'TechPro — Automotive and Small Engine Technologies',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Automotive Servicing (Electrical Repair)', 'Automotive Servicing (Engine and Chassis Repairs)', 'Driving and Automotive Servicing', 'Motorcycle and Small Engine Servicing']
  },
  {
    label: 'TechPro — Construction and Building Technology',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Carpentry', 'Construction Operation', 'Manual Metal Arc Welding', 'Technical Drafting']
  },
  {
    label: 'TechPro — Creative Arts and Design Technology',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Animation', 'Illustration', 'Visual Graphic Design']
  },
  {
    label: 'TechPro — Hospitality and Tourism',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Bakery Operations', 'Events Management Services', 'Food and Beverage Operation', 'Hotel Operation (Front Office Services)', 'Hotel Operation (Housekeeping Services)', 'Kitchen Operations', 'Tourism Services']
  },
  {
    label: 'TechPro — ICT Support and Computer Programming',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Broadband Installation', 'Computer Programming (.NET Technology)', 'Computer Programming (Java)', 'Computer Programming (Oracle Database)', 'Computer Systems Servicing', 'Contact Center Services']
  },
  {
    label: 'TechPro — Industrial Technologies',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Commercial Air Conditioning Installation and Servicing', 'Domestic Refrigeration and Air Conditioning Servicing', 'Electrical Installation Maintenance', 'Electronics Product Assembly and Servicing', 'Mechatronics', 'Photovoltaic Systems Installation']
  },
  {
    label: 'TechPro — Maritime',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Marine Engineering at the Support Level', 'Marine Transportation at the Support Level', 'Ships Catering Services']
  },
  {
    label: 'Transition / Legacy Subject',
    grades: [11, 12],
    group: 'SHS_WORK',
    subjects: ['Work Immersion']
  }
]);

const SENIOR_HIGH_2016_SUBJECT_CATALOG = Object.freeze([
  {
    label: 'Core Subjects',
    grades: [11, 12],
    group: 'SHS2016_CORE',
    subjects: [
      'Oral Communication',
      'Reading and Writing',
      'Komunikasyon at Pananaliksik sa Wika at Kulturang Pilipino',
      'Pagbasa at Pagsusuri ng Iba\'t Ibang Teksto Tungo sa Pananaliksik',
      '21st Century Literature from the Philippines and the World',
      'Contemporary Philippine Arts from the Regions',
      'Media and Information Literacy',
      'General Mathematics',
      'Statistics and Probability',
      'Earth and Life Science',
      'Physical Science',
      'Earth Science',
      'Disaster Readiness and Risk Reduction',
      'Personal Development',
      'Understanding Culture, Society and Politics',
      'Introduction to the Philosophy of the Human Person',
      'Physical Education and Health'
    ]
  },
  {
    label: 'Applied Track Subjects',
    grades: [11, 12],
    group: 'SHS2016_ACADEMIC',
    subjects: [
      'English for Academic and Professional Purposes',
      'Practical Research 1',
      'Practical Research 2',
      'Filipino sa Piling Larang — Akademik',
      'Filipino sa Piling Larang — Isports',
      'Filipino sa Piling Larang — Sining',
      'Filipino sa Piling Larang — Tech-Voc',
      'Empowerment Technologies',
      'Entrepreneurship'
    ]
  },
  {
    label: 'Applied — Research / Immersion',
    grades: [11, 12],
    group: 'SHS2016_WORK_ACADEMIC',
    subjects: ['Inquiries, Investigations and Immersion']
  },
  {
    label: 'Specialized — STEM',
    grades: [11, 12],
    group: 'SHS2016_ACADEMIC',
    subjects: [
      'Pre-Calculus',
      'Basic Calculus',
      'General Biology 1',
      'General Biology 2',
      'General Chemistry 1',
      'General Chemistry 2',
      'General Physics 1',
      'General Physics 2'
    ]
  },
  {
    label: 'Specialized — ABM',
    grades: [11, 12],
    group: 'SHS2016_ACADEMIC',
    subjects: [
      'Applied Economics',
      'Business Ethics and Social Responsibility',
      'Fundamentals of Accountancy, Business and Management 1',
      'Fundamentals of Accountancy, Business and Management 2',
      'Business Math',
      'Business Finance',
      'Organization and Management',
      'Principles of Marketing'
    ]
  },
  {
    label: 'Specialized — HUMSS',
    grades: [11, 12],
    group: 'SHS2016_ACADEMIC',
    subjects: [
      'Creative Writing',
      'Creative Nonfiction',
      'World Religions and Belief Systems',
      'Disciplines and Ideas in the Social Sciences',
      'Disciplines and Ideas in the Applied Social Sciences',
      'Philippine Politics and Governance',
      'Community Engagement, Solidarity, and Citizenship',
      'Trends, Networks, and Critical Thinking in the 21st Century Culture'
    ]
  },
  {
    label: 'Specialized — GAS',
    grades: [11, 12],
    group: 'SHS2016_ACADEMIC',
    subjects: ['Humanities 1', 'Humanities 2', 'Social Science 1']
  },
  {
    label: 'Academic — Work Immersion / Research / Enterprise',
    grades: [11, 12],
    group: 'SHS2016_WORK_ACADEMIC',
    subjects: [
      'Work Immersion / Research / Business Enterprise Simulation',
      'Culminating Activity'
    ]
  },
  {
    label: 'Specialized — TVL',
    grades: [11, 12],
    group: 'SHS2016_TVL',
    subjects: [
      'Animation',
      'Automotive Servicing',
      'Beauty Care',
      'Bread and Pastry Production',
      'Computer Systems Servicing',
      'Contact Center Services',
      'Cookery',
      'Crop Production',
      'Dressmaking',
      'Electrical Installation and Maintenance',
      'Food and Beverage Services',
      'Front Office Services',
      'Hairdressing',
      'Housekeeping',
      'Illustration',
      'Organic Agriculture',
      'Programming',
      'Shielded Metal Arc Welding'
    ]
  },
  {
    label: 'Specialized — Sports',
    grades: [11, 12],
    group: 'SHS2016_TVL',
    subjects: [
      'Safety and First Aid',
      'Human Movement',
      'Fundamentals of Coaching',
      'Sports Officiating and Activity Management',
      'Fitness, Sports and Recreation',
      'Psychosocial Aspects of Sports and Exercise',
      'Fitness Testing and Exercise Programming',
      'Practicum (in-campus)',
      'Apprenticeship (off-campus)'
    ]
  },
  {
    label: 'Specialized — Arts and Design',
    grades: [11, 12],
    group: 'SHS2016_TVL',
    subjects: [
      'Creative Industries I: Arts and Design Appreciation and Production',
      'Creative Industries II: Performing Arts',
      'Physical and Personal Development in the Arts',
      'Developing Filipino Identity in the Arts',
      'Integrating the Elements and Principles of Organization in the Arts',
      'Leadership and Management in Different Arts Fields',
      'Apprenticeship and Exploration in the Performing Arts',
      'Work Immersion / Exhibit / Performance'
    ]
  },
  {
    label: 'Work Immersion',
    grades: [11, 12],
    group: 'SHS2016_WORK_TVL',
    subjects: ['Work Immersion']
  }
]);

function catalogForShsCurriculum(curriculum) {
  return curriculum === SHS_CURRICULUM_K12_2016
    ? SENIOR_HIGH_2016_SUBJECT_CATALOG
    : SENIOR_HIGH_SUBJECT_CATALOG;
}

function mapSeniorHighCatalog(catalog, grade) {
  return catalog
    .filter(category => category.grades.includes(grade))
    .map(category => ({
      label: category.label,
      group: category.group,
      subjects: category.subjects.slice()
    }));
}

function seniorHighSubjectCatalog(gradeLevel, options) {
  const grade = parseInt(gradeLevel, 10);
  const settings = options && typeof options === 'object' ? options : {};
  const curriculum = resolveShsCurriculum(
    gradeLevel,
    settings.schoolYear,
    settings.curriculum || settings.shsCurriculum
  );
  return mapSeniorHighCatalog(catalogForShsCurriculum(curriculum), grade);
}

function isSubjectInSeniorHighCatalog(subject, curriculum) {
  const normalized = String(subject || '').trim().toLocaleLowerCase();
  if (!normalized) return false;
  const catalogs = curriculum
    ? [catalogForShsCurriculum(curriculum)]
    : [SENIOR_HIGH_SUBJECT_CATALOG, SENIOR_HIGH_2016_SUBJECT_CATALOG];
  return catalogs.some(catalog =>
    catalog.some(category => category.subjects.some(item => item.toLocaleLowerCase() === normalized))
  );
}

function seniorHighSubjectGroupForSubject(subject, curriculum) {
  const normalized = String(subject || '').trim().toLocaleLowerCase();
  const catalogs = curriculum
    ? [catalogForShsCurriculum(curriculum)]
    : [SENIOR_HIGH_SUBJECT_CATALOG, SENIOR_HIGH_2016_SUBJECT_CATALOG];
  for (const catalog of catalogs) {
    for (const category of catalog) {
      if (category.subjects.some(item => item.toLocaleLowerCase() === normalized)) return category.group;
    }
  }
  return '';
}

function getSubjectsForGrade(gradeLevel, options) {
  const grade = parseInt(gradeLevel);
  if (grade === 1) {
    if (typeof paceGrade1SubjectNames === 'function') {
      const names = paceGrade1SubjectNames();
      if (names.length) return names;
    }
    return [
      'Reading and Literacy',
      'Language',
      'Mathematics',
      'Good Manners and Right Conduct (GMRC)',
      'Makabansa',
      'Arts and Physical Education'
    ];
  } else if (grade === 2) {
    return [
      'Filipino',
      'English',
      'Mathematics',
      'Makabansa',
      'Good Manners and Right Conduct (GMRC)',
      'Music, Arts, Physical Education, and Health (MAPEH)'
    ];
  } else if (grade === 3) {
    return [
      'Filipino',
      'English',
      'Mathematics',
      'Science',
      'Makabansa',
      'Good Manners and Right Conduct (GMRC)'
    ];
  } else if (grade >= 4 && grade <= 5) {
    return [
      'Filipino',
      'English',
      'Mathematics',
      'Science',
      'Araling Panlipunan',
      'Good Manners and Right Conduct (GMRC)',
      'Edukasyong Pantahanan at Pangkabuhayan (EPP)',
      'MAPEH'
    ];
  } else if (grade === 6) {
    return [
      'Filipino',
      'English',
      'Mathematics',
      'Science',
      'Araling Panlipunan',
      'Good Manners and Right Conduct (GMRC)',
      'Technology and Livelihood Education (TLE)',
      'MAPEH'
    ];
  } else if (grade >= 7 && grade <= 10) {
    return [
      'Filipino',
      'English',
      'Mathematics',
      'Science',
      'Araling Panlipunan',
      'Values Education',
      'Technology and Livelihood Education (TLE)',
      'MAPEH'
    ];
  } else if (grade >= 11 && grade <= 12) {
    const settings = options && typeof options === 'object' ? { ...options } : {};
    if (!settings.schoolYear && typeof db !== 'undefined' && db?.schoolYear) {
      settings.schoolYear = db.schoolYear;
    }
    return seniorHighSubjectCatalog(grade, settings).flatMap(category => category.subjects);
  } else {
    return [];
  }
}

const SENIOR_HIGH_SSHS_SUBJECT_GROUPS = Object.freeze({
  SHS_CORE: { label: 'Core Subject', weights: [20, 50, 30] },
  SHS_ACADEMIC: { label: 'Academic - All Other Electives', weights: [20, 50, 30] },
  SHS_ARTS: { label: 'Sports and Arts Elective', weights: [20, 60, 20] },
  SHS_FIELD: { label: 'Field Experience / Exposure', weights: [15, 70, 15] },
  SHS_RESEARCH: { label: 'Research, Design and Innovation', weights: [40, 60, 0] },
  SHS_TECHPRO: { label: 'TechPro - All Other Electives', weights: [15, 65, 20] },
  SHS_WORK: { label: 'Work Immersion', weights: [20, 80, 0] }
});

const SENIOR_HIGH_2016_SUBJECT_GROUPS = Object.freeze({
  SHS2016_CORE: { label: 'Core Subject (DO 8 s.2015)', weights: [25, 50, 25] },
  SHS2016_ACADEMIC: { label: 'Academic / Applied Track (DO 8 s.2015)', weights: [25, 45, 30] },
  SHS2016_TVL: { label: 'TVL / Sports / Arts and Design (DO 8 s.2015)', weights: [20, 60, 20] },
  SHS2016_WORK_ACADEMIC: { label: 'Work Immersion / Research / Enterprise (DO 8 s.2015)', weights: [35, 40, 25] },
  SHS2016_WORK_TVL: { label: 'Work Immersion / Research / Exhibit / Performance (DO 8 s.2015)', weights: [20, 60, 20] }
});

const SENIOR_HIGH_SUBJECT_GROUPS = Object.freeze({
  ...SENIOR_HIGH_SSHS_SUBJECT_GROUPS,
  ...SENIOR_HIGH_2016_SUBJECT_GROUPS
});

function seniorHighSubjectGroupOptions(curriculum) {
  const source = curriculum === SHS_CURRICULUM_K12_2016
    ? SENIOR_HIGH_2016_SUBJECT_GROUPS
    : SENIOR_HIGH_SSHS_SUBJECT_GROUPS;
  return Object.entries(source).map(([value, config]) => ({
    value,
    label: config.label,
    weights: config.weights.slice()
  }));
}

function normalizeSeniorHighSubjectGroup(value) {
  const aliases = {
    SHS_ARTS_SPORTS: 'SHS_ARTS'
  };
  const normalized = aliases[value] || value;
  return SENIOR_HIGH_SUBJECT_GROUPS[normalized] ? normalized : '';
}

function defaultSeniorHighSubjectGroup(curriculum) {
  return curriculum === SHS_CURRICULUM_K12_2016 ? 'SHS2016_ACADEMIC' : 'SHS_ACADEMIC';
}

/**
 * Returns weight configuration [Written Work %, Performance Task %, Exam %].
 * @param {string} group Subject group key.
 * @returns {number[]} Weights array.
 */
function weightsFor(group) {
  const map = {
    KS2_TRIMESTER: [20, 50, 30],
    CORE_20_50_30: [20, 50, 30],
    SKILLS_20_60_20: [20, 60, 20],
    ...Object.fromEntries(Object.entries(SENIOR_HIGH_SUBJECT_GROUPS).map(([key, config]) => [key, config.weights])),
    SHS_ARTS_SPORTS: SENIOR_HIGH_SSHS_SUBJECT_GROUPS.SHS_ARTS.weights
  };
  return map[group] || [20, 50, 30];
}

function resolveCurriculumArgument(gradeLevel, policy, curriculumOrOptions) {
  if (typeof curriculumOrOptions === 'string') {
    return resolveShsCurriculum(gradeLevel, policy && typeof policy === 'object' ? policy.schoolYear : '', curriculumOrOptions);
  }
  if (curriculumOrOptions && typeof curriculumOrOptions === 'object') {
    return resolveShsCurriculum(
      gradeLevel,
      curriculumOrOptions.schoolYear,
      curriculumOrOptions.curriculum || curriculumOrOptions.shsCurriculum
    );
  }
  const schoolYear = policy && typeof policy === 'object' ? policy.schoolYear : undefined;
  return resolveShsCurriculum(gradeLevel, schoolYear);
}

function determineSshsSubjectGroup(subject, seniorHighOverride) {
  const explicitGroup = normalizeSeniorHighSubjectGroup(seniorHighOverride);
  if (explicitGroup && isShsSshsSubjectGroup(explicitGroup)) return explicitGroup;
  const catalogGroup = seniorHighSubjectGroupForSubject(subject, SHS_CURRICULUM_SSHS);
  if (catalogGroup) return catalogGroup;
  const s = (subject || '').toLowerCase();
  if (/work\s*immersion/i.test(s)) return 'SHS_WORK';
  if (/field\s*experience|field\s*exposure|exposure|arts?\s*apprenticeship|creative\s*production/i.test(s)) {
    return 'SHS_FIELD';
  }
  if (/research|design\s*(and|&)\s*innovation/i.test(s)) return 'SHS_RESEARCH';
  if (/techpro|nc\s*i{1,3}\b/i.test(s)) return 'SHS_TECHPRO';
  if (/\barts?\b|\bsports?\b|health and wellness|human movement|physical education/i.test(s)) {
    return 'SHS_ARTS';
  }
  const coreSubjects = new Set([
    'effective communication',
    'mabisang komunikasyon',
    'general mathematics',
    'general science',
    'life and career skills',
    'pag-aaral ng kasaysayan at lipunang pilipino'
  ]);
  return coreSubjects.has(s.trim()) ? 'SHS_CORE' : 'SHS_ACADEMIC';
}

function determine2016SubjectGroup(subject, seniorHighOverride) {
  const explicitGroup = normalizeSeniorHighSubjectGroup(seniorHighOverride);
  if (explicitGroup && SENIOR_HIGH_2016_SUBJECT_GROUPS[explicitGroup]) return explicitGroup;
  const catalogGroup = seniorHighSubjectGroupForSubject(subject, SHS_CURRICULUM_K12_2016);
  if (catalogGroup) return catalogGroup;
  const s = (subject || '').toLowerCase();
  if (/inquiries|investigations and immersion|business enterprise simulation|culminating activity/i.test(s)) {
    return 'SHS2016_WORK_ACADEMIC';
  }
  if (/work\s*immersion|exhibit|performance|apprenticeship/i.test(s)) {
    if (/academic|research|enterprise/i.test(s)) return 'SHS2016_WORK_ACADEMIC';
    return 'SHS2016_WORK_TVL';
  }
  if (/cookery|bread and pastry|housekeeping|welding|automotive|dressmaking|css|computer systems|contact center|tvl|nc\s*i{1,3}\b/i.test(s)) {
    return 'SHS2016_TVL';
  }
  if (/sports|arts and design|physical education and health|human movement|first aid/i.test(s)) {
    return 'SHS2016_TVL';
  }
  const coreSubjects = new Set([
    'oral communication',
    'reading and writing',
    'general mathematics',
    'statistics and probability',
    'earth and life science',
    'physical science',
    'earth science',
    'personal development',
    'media and information literacy',
    'physical education and health'
  ]);
  if (coreSubjects.has(s.trim()) || /komunikasyon at pananaliksik|pagbasa at pagsusuri|21st century literature|contemporary philippine arts|understanding culture|philosophy of the human person|disaster readiness/i.test(s)) {
    return 'SHS2016_CORE';
  }
  return 'SHS2016_ACADEMIC';
}

/**
 * Automatically calculates and assigns the weight set (subjectGroup)
 * based on the grade level, subject keywords, and selected policy mode.
 */
function determineSubjectGroup(gradeLevel, subject, policy, seniorHighOverride, curriculumOrOptions) {
  const grade = parseInt(gradeLevel);
  const s = (subject || '').toLowerCase();

  if (grade >= 11) {
    const curriculum = resolveCurriculumArgument(gradeLevel, policy, curriculumOrOptions);
    if (curriculum === SHS_CURRICULUM_K12_2016) {
      return determine2016SubjectGroup(subject, seniorHighOverride);
    }
    return determineSshsSubjectGroup(subject, seniorHighOverride);
  }
  if (/mapeh|music|arts|physical|health|tle|epp|livelihood|pantahanan|pangkabuhayan|technology/i.test(s)) {
    return 'SKILLS_20_60_20';
  }
  if (grade >= 4 && grade <= 6) {
    return 'KS2_TRIMESTER';
  }
  return 'CORE_20_50_30';
}

/**
 * Automatically determines the appropriate policy mode based on grade level, subject, and school year.
 * @param {string|number} gradeLevel
 * @param {string} subject
 * @param {string} sy
 * @returns {string} One of: KEY_STAGE_2_TRIMESTER|DO15_ZERO|DO15_TRANSITION|DO15_DESCRIPTIVE
 */
function determinePolicy(gradeLevel, subject, sy) {
  const grade = parseInt(gradeLevel);
  const startYear = parseSchoolYearStart(sy);
  
  // KS1 Transition rules (Grades 1-3)
  if (grade <= 3) {
    if (grade === 1) {
      return 'DO15_DESCRIPTIVE';
    }
    if (grade === 2) {
      return startYear >= 2027 ? 'DO15_DESCRIPTIVE' : 'DO15_TRANSITION';
    }
    if (grade === 3) {
      if (startYear === 2026) return 'DO15_TRANSITION';
      if (startYear === 2027) return 'DO15_ZERO';
      return 'DO15_DESCRIPTIVE';
    }
  }
  
  // KS2 (Grades 4-6)
  if (grade >= 4 && grade <= 6) {
    return 'KEY_STAGE_2_TRIMESTER';
  }
  
  // KS3 and KS4 (Grades 7-12)
  if (startYear >= 2027) {
    return 'DO15_ZERO';
  }
  
  // DO 15, s. 2026 paragraph 48 applies the adjusted transmutation table
  // uniformly to applicable numerically graded learning areas in SY 2026-2027.
  // Assessment-component weights may vary by subject, but the transmutation
  // policy does not. Zero-based grading begins in SY 2027-2028 (paragraph 50).
  return 'DO15_TRANSITION';
}

/**
 * Checks if teaching load uses Key Stage 2.
 */
function isKeyStage2(a) {
  if (!a) return false;
  if (typeof db !== 'undefined' && db.useUniversalTrimesterLayout) {
    return true;
  }
  const grade = parseInt(a.gradeLevel);
  return grade >= 4 && grade <= 6;
}

/**
 * Clean up old database formats.
 */
function normalizeAssessmentComponents(a) {
  if (!a.assessments) return;
  for (let i = 0; i < a.assessments.length; i++) {
    a.assessments[i].component = canonicalAssessmentComponent(a.assessments[i].component);
    if (a.assessments[i].title === 'SA1') a.assessments[i].title = 'ST1';
    if (a.assessments[i].title === 'SA2') a.assessments[i].title = 'ST2';
  }
}

/**
 * Validates the optional three-category grading weights used by a custom
 * special-program subject. Values are whole percentages and must total 100.
 */
function normalizeSpecialProgramWeights(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const weights = value.map(Number);
  if (weights.some(weight => !Number.isInteger(weight) || weight < 0 || weight > 100)) return null;
  return weights.reduce((sum, weight) => sum + weight, 0) === 100 ? weights : null;
}

/** Returns the authoritative weights for a teaching-load assignment. */
function weightsForAssignment(assignment) {
  if (assignment?.isSpecialProgramSubject) {
    const custom = normalizeSpecialProgramWeights(assignment.specialProgramWeights);
    if (custom) return custom;
  }
  return weightsFor(assignment?.subjectGroup);
}

function canonicalAssessmentComponent(component) {
  if (component === 'SA1') return 'ST1';
  if (component === 'SA2') return 'ST2';
  return component;
}

/**
 * Returns the examination columns mandated for an assignment.
 * Hidden columns remain stored so changing a subject category never destroys scores.
 */
function examinationComponentsForAssignment(assignment) {
  const grade = parseInt(assignment?.gradeLevel);
  if (grade < 11 || grade > 12) return ['ST1', 'ST2', 'TE'];

  const curriculum = inferShsCurriculum(assignment) || resolveShsCurriculum(
    assignment?.gradeLevel,
    assignment?.schoolYear,
    assignment?.shsCurriculum
  );
  const explicitGroup = normalizeSeniorHighSubjectGroup(
    assignment?.shsSubjectGroup || assignment?.subjectGroup
  );
  const group = explicitGroup || determineSubjectGroup(
    assignment?.gradeLevel,
    assignment?.subject,
    assignment?.policy,
    assignment?.shsSubjectGroup,
    curriculum
  );

  if (curriculum === SHS_CURRICULUM_K12_2016) return ['ST1', 'ST2', 'TE'];
  if (group === 'SHS_RESEARCH' || group === 'SHS_WORK') return [];
  if (group === 'SHS_FIELD') return ['TE'];
  return ['ST1', 'ST2', 'TE'];
}

function isAssessmentIncludedForAssignment(assignment, assessment) {
  const component = canonicalAssessmentComponent(assessment?.component);
  if (!['ST1', 'ST2', 'TE'].includes(component)) return true;
  return examinationComponentsForAssignment(assignment).includes(component);
}

function examinationResultForAssignment(assignment, result) {
  const components = examinationComponentsForAssignment(assignment);
  const componentResults = components.map(component => {
    if (component === 'ST1') return result.st1;
    if (component === 'ST2') return result.st2;
    return result.te;
  });
  return {
    components,
    raw: componentResults.reduce((sum, item) => sum + (item?.raw || 0), 0),
    max: componentResults.reduce((sum, item) => sum + (item?.max || 0), 0),
    ps: result.examPS,
    hasData: componentResults.some(item => item?.hasData)
  };
}

function assessmentTemplateSlotId(term, mapePart, slotIndex) {
  return `term:${String(term)}|part:${mapePart || 'regular'}|slot:${slotIndex}`;
}

function createTemplateAssessment(term, mapePart, slotIndex, templateItem) {
  return {
    id: uid('assessment'),
    term: String(term),
    component: templateItem.component,
    title: templateItem.title,
    templateSlotId: assessmentTemplateSlotId(term, mapePart, slotIndex),
    maxScore: '',
    date: '',
    ...(mapePart ? { mapePart } : {}),
    ...(templateItem.domain ? { domain: templateItem.domain } : {})
  };
}

function keepAssessmentInTemplateSlot(assessment, term, mapePart, slotIndex, templateItem) {
  assessment.term = String(term);
  assessment.component = templateItem.component;
  assessment.templateSlotId = assessmentTemplateSlotId(term, mapePart, slotIndex);
  if (!assessment.title) assessment.title = templateItem.title;
  if (assessment.title === 'SA1') assessment.title = 'ST1';
  if (assessment.title === 'SA2') assessment.title = 'ST2';
  if (mapePart) assessment.mapePart = mapePart;
  else delete assessment.mapePart;
  if (templateItem.domain) assessment.domain = templateItem.domain;
  return assessment;
}

function matchingMapehPart(assessment, mapePart) {
  return (assessment.mapePart || undefined) === (mapePart || undefined);
}

function matchingAssessmentDomain(assessment, domain) {
  return String(assessment?.domain || '') === String(domain || '');
}

function assessmentMatchesTemplateComponent(assessment, templateItem) {
  if (canonicalAssessmentComponent(assessment.component) !== canonicalAssessmentComponent(templateItem.component)) {
    return false;
  }
  if (templateItem.domain) return matchingAssessmentDomain(assessment, templateItem.domain);
  return true;
}

function templateComponentOccurrence(template, slotIndex) {
  const component = canonicalAssessmentComponent(template[slotIndex].component);
  const domain = template[slotIndex].domain || '';
  let occurrence = 0;
  for (let i = 0; i < slotIndex; i++) {
    if (canonicalAssessmentComponent(template[i].component) !== component) continue;
    if (String(template[i].domain || '') !== domain) continue;
    occurrence++;
  }
  return occurrence;
}

function findAssessmentForTemplate(a, usedIds, term, mapePart, slotIndex, template) {
  const templateItem = template[slotIndex];
  const legacyMatch = findAssessment(
    a,
    String(term),
    templateItem.component,
    templateItem.title,
    mapePart,
    usedIds,
    templateItem.domain
  );
  if (legacyMatch) return legacyMatch;

  const slotId = assessmentTemplateSlotId(term, mapePart, slotIndex);
  const slotMatch = a.assessments.find(item =>
    item.templateSlotId === slotId &&
    !usedIds.has(item.id) &&
    assessmentMatchesTemplateComponent(item, templateItem)
  );
  if (slotMatch) return slotMatch;

  const component = canonicalAssessmentComponent(templateItem.component);
  const occurrence = templateComponentOccurrence(template, slotIndex);
  const sameComponent = a.assessments.filter(item =>
    String(item.term) === String(term) &&
    canonicalAssessmentComponent(item.component) === component &&
    matchingMapehPart(item, mapePart) &&
    matchingAssessmentDomain(item, templateItem.domain)
  );
  const occurrenceMatch = sameComponent[occurrence];
  if (occurrenceMatch && !usedIds.has(occurrenceMatch.id)) return occurrenceMatch;
  return sameComponent.find(item => !usedIds.has(item.id)) || null;
}

/**
 * Seeds standard assessments according to grade-level templates.
 */
function seedTemplateAssessments(a, template) {
  a.assessments = [];
  for (let term = 1; term <= 3; term++) {
    for (const mapePart of assessmentPartsForTerm(a, term)) {
      for (let i = 0; i < template.length; i++) {
        a.assessments.push(createTemplateAssessment(term, mapePart, i, template[i]));
      }
    }
  }
  freezeRecordCompatibility(a);
}

function assessmentHasRecordedData(a, assessment) {
  if (!assessment) return false;
  if (assessment.maxScore !== '' && assessment.maxScore !== null && assessment.maxScore !== undefined) return true;
  if (assessment.date || assessment.description || assessment.descriptionHtml) return true;
  if (Array.isArray(assessment.attachments) && assessment.attachments.length > 0) return true;
  const scoreSuffix = `|${assessment.id}`;
  return Object.entries(a.scores || {}).some(([key, value]) =>
    key.endsWith(scoreSuffix) && value !== '' && value !== null && value !== undefined
  );
}

/**
 * Keeps extra WW/PT columns that already hold evidence when a newer preset
 * is shorter. Applies to every grade so Grades 2–3 4+4 records cannot lose PT4.
 */
function expandTemplateForRecordedComponent(a, template, component, maxAllowed) {
  if (!Array.isArray(a?.assessments) || !Array.isArray(template)) return template;
  let needed = template.filter(item => item.component === component).length;
  const groups = new Map();
  a.assessments.forEach(assessment => {
    if (canonicalAssessmentComponent(assessment.component) !== component) return;
    const key = `${assessment.term}|${assessment.mapePart || 'regular'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(assessment);
  });
  groups.forEach(items => {
    items.forEach((assessment, index) => {
      if (index >= needed && assessmentHasRecordedData(a, assessment)) {
        needed = Math.max(needed, index + 1);
      }
    });
  });
  needed = Math.min(needed, maxAllowed);
  const standardCount = template.filter(item => item.component === component).length;
  if (needed <= standardCount) return template;
  const expanded = template.map(item => ({ ...item }));
  const insertAt = expanded.reduce((last, item, index) => item.component === component ? index + 1 : last, 0);
  const extraSlots = [];
  for (let index = standardCount + 1; index <= needed; index++) {
    extraSlots.push({ component, title: `${component} ${index}` });
  }
  expanded.splice(insertAt, 0, ...extraSlots);
  return expanded;
}

function templateWithPopulatedLegacyPerformanceTasks(a, template) {
  const wwCap = usesGmrcDomainScoring(a) ? 15 : 10;
  const ptCap = usesGmrcDomainScoring(a) ? 15 : 5;
  const withWrittenWorks = expandTemplateForRecordedComponent(a, template, 'WW', wwCap);
  return expandTemplateForRecordedComponent(a, withWrittenWorks, 'PT', ptCap);
}

/**
 * Ensures template slots exist without deleting stored assessments or scores.
 * Existing classes follow their frozen column preset; unmatched columns are kept.
 */
function ensureTemplateAssessments(a) {
  if (!a) return;
  freezeRecordCompatibility(a);
  const template = templateWithPopulatedLegacyPerformanceTasks(a, templateForAssignment(a));
  const newAssessments = [];
  const usedIds = new Set();
  for (let term = 1; term <= 3; term++) {
    for (const mapePart of assessmentPartsForTerm(a, term)) {
      for (let i = 0; i < template.length; i++) {
        const tItem = template[i];
        const existing = findAssessmentForTemplate(a, usedIds, String(term), mapePart, i, template);
        if (existing) {
          keepAssessmentInTemplateSlot(existing, term, mapePart, i, tItem);
          usedIds.add(existing.id);
          newAssessments.push(existing);
        } else {
          newAssessments.push(createTemplateAssessment(term, mapePart, i, tItem));
        }
      }
    }
  }

  retainUnmatchedAssessments(a, newAssessments, usedIds);
  a.assessments = newAssessments;
  freezeColumnPreset(a);
}

function findAssessment(a, term, component, title, mapePart, usedIds, domain) {
  const componentAliases = component === 'ST1' ? ['ST1', 'SA1'] : component === 'ST2' ? ['ST2', 'SA2'] : [component];
  const titleAliases = title === 'ST1' ? ['ST1', 'SA1'] : title === 'ST2' ? ['ST2', 'SA2'] : [title];
  for (let i = 0; i < a.assessments.length; i++) {
    const item = a.assessments[i];
    if (usedIds && usedIds.has(item.id)) continue;
    if (
      String(item.term) === String(term) &&
      componentAliases.includes(canonicalAssessmentComponent(item.component)) &&
      titleAliases.includes(item.title) &&
      matchingMapehPart(item, mapePart) &&
      matchingAssessmentDomain(item, domain)
    ) {
      return item;
    }
  }
  return null;
}

/**
 * Computes component raw/max/percentage score.
 */
function componentScore(a, learnerId, term, components, mapePart, domain) {
  let raw = 0;
  let max = 0;
  let hasData = false;

  for (let i = 0; i < a.assessments.length; i++) {
    const item = a.assessments[i];
    if (String(item.term) !== String(term)) continue;
    if (!components.includes(item.component)) continue;
    if (mapePart && item.mapePart !== mapePart) continue;
    if (domain && !matchingAssessmentDomain(item, domain)) continue;

    const maxScoreVal = number(item.maxScore);
    if (maxScoreVal <= 0) continue;

    max += maxScoreVal;
    const val = a.scores[`${learnerId}|${item.id}`];
    if (val !== undefined && val !== '') {
      raw += number(val);
      hasData = true;
    }
  }

  if (max <= 0) return { raw: raw, max: max, ps: 0, hasData: false };
  return { raw: raw, max: max, ps: (raw / max) * 100, hasData: hasData };
}

/**
 * Computes complete term scores for a learner.
 */
function computeTerm(a, learnerId, term, mapePart) {
  const learner = a.learners.find(x => x.id === learnerId);
  if (learner) {
    if (learner.transferredOutTerm && parseInt(term) > parseInt(learner.transferredOutTerm)) {
      return {
        ww: { raw: 0, max: 0, ps: 0, hasData: false },
        pt: { raw: 0, max: 0, ps: 0, hasData: false },
        st1: { raw: 0, max: 0, ps: 0, hasData: false },
        st2: { raw: 0, max: 0, ps: 0, hasData: false },
        te: { raw: 0, max: 0, ps: 0, hasData: false },
        examPS: 0,
        initialGrade: 0,
        termGrade: 'T/O',
        hasData: false,
        isTransferredOut: true
      };
    }
    if (learner.transferredInGrades && learner.transferredInGrades[term] !== undefined) {
      const overriddenGrade = learner.transferredInGrades[term];
      return {
        ww: { raw: 0, max: 0, ps: 0, hasData: false },
        pt: { raw: 0, max: 0, ps: 0, hasData: false },
        st1: { raw: 0, max: 0, ps: 0, hasData: false },
        st2: { raw: 0, max: 0, ps: 0, hasData: false },
        te: { raw: 0, max: 0, ps: 0, hasData: false },
        examPS: 0,
        initialGrade: null,
        termGrade: overriddenGrade,
        hasData: true,
        isTransferredIn: true
      };
    }
  }

  if ((typeof isKinderAssignment === 'function' && isKinderAssignment(a)) || (typeof isKinderGradeLevel === 'function' && isKinderGradeLevel(a.gradeLevel))) {
    const empty = { raw: 0, max: 0, ps: 0, hasData: false };
    const result = typeof kinderTermResult === 'function'
      ? kinderTermResult(a, learnerId, term)
      : { letter: null, hasData: false };
    return {
      ww: empty,
      pt: empty,
      st1: empty,
      st2: empty,
      te: empty,
      examPS: 0,
      initialGrade: null,
      termGrade: result.letter || null,
      hasData: Boolean(result.hasData),
      paceRated: result.rated || 0,
      paceExpected: result.expected || 0
    };
  }

  if (parseInt(a.gradeLevel, 10) === 1 && typeof paceTermResult === 'function') {
    const empty = { raw: 0, max: 0, ps: 0, hasData: false };
    const paceSubject = (mapePart && typeof paceSubjectKey === 'function' && paceSubjectKey(mapePart))
      ? mapePart
      : (typeof paceWorkingSubject === 'function' ? paceWorkingSubject(a) : a.subject);
    const pace = paceTermResult(a, learnerId, term, paceSubject);
    return {
      ww: empty,
      pt: empty,
      st1: empty,
      st2: empty,
      te: empty,
      examPS: 0,
      initialGrade: null,
      termGrade: pace.letter,
      hasData: pace.hasData,
      paceRated: pace.rated,
      paceExpected: pace.expected,
      paceOverride: pace.override || ''
    };
  }

  // Displayed term grades are calculated from stored raw scores. Never write
  // them back over scores. Official GMRC domain weights must check scoringModel
  // and must not switch existing classes by subject name.
  const st1 = componentScore(a, learnerId, term, ['SA1', 'ST1'], mapePart);
  const st2 = componentScore(a, learnerId, term, ['SA2', 'ST2'], mapePart);
  const te = componentScore(a, learnerId, term, ['TE'], mapePart);

  const examinationComponents = examinationComponentsForAssignment(a);
  let examPS = 0;
  if (examinationComponents.length === 1 && examinationComponents[0] === 'TE') {
    examPS = te.ps;
  } else if (examinationComponents.length > 0) {
    examPS = (st1.ps * 0.30) + (st2.ps * 0.30) + (te.ps * 0.40);
  }

  if (usesGmrcDomainScoring(a)) {
    const wwCognitive = componentScore(a, learnerId, term, ['WW'], mapePart, 'cognitive');
    const wwAffective = componentScore(a, learnerId, term, ['WW'], mapePart, 'affective');
    const ptCognitive = componentScore(a, learnerId, term, ['PT'], mapePart, 'cognitive');
    const ptAffective = componentScore(a, learnerId, term, ['PT'], mapePart, 'affective');
    const ptBehavioral = componentScore(a, learnerId, term, ['PT'], mapePart, 'behavioral');
    const ig = (wwCognitive.ps * GMRC_DOMAIN_WEIGHTS.WW_cognitive / 100)
      + (wwAffective.ps * GMRC_DOMAIN_WEIGHTS.WW_affective / 100)
      + (ptCognitive.ps * GMRC_DOMAIN_WEIGHTS.PT_cognitive / 100)
      + (ptAffective.ps * GMRC_DOMAIN_WEIGHTS.PT_affective / 100)
      + (ptBehavioral.ps * GMRC_DOMAIN_WEIGHTS.PT_behavioral / 100)
      + (examPS * GMRC_DOMAIN_WEIGHTS.EX / 100);
    const examinationHasData = examinationComponents.some(component => {
      if (component === 'ST1') return st1.hasData;
      if (component === 'ST2') return st2.hasData;
      return te.hasData;
    });
    const hasData = wwCognitive.hasData || wwAffective.hasData || ptCognitive.hasData
      || ptAffective.hasData || ptBehavioral.hasData || examinationHasData;
    return {
      ww: componentScore(a, learnerId, term, ['WW'], mapePart),
      pt: componentScore(a, learnerId, term, ['PT'], mapePart),
      st1,
      st2,
      te,
      examPS,
      gmrcDomains: {
        WW_cognitive: wwCognitive,
        WW_affective: wwAffective,
        PT_cognitive: ptCognitive,
        PT_affective: ptAffective,
        PT_behavioral: ptBehavioral
      },
      initialGrade: ig,
      termGrade: hasData ? transmute(a, ig) : null,
      hasData
    };
  }

  const w = weightsForAssignment(a);
  const ww = componentScore(a, learnerId, term, ['WW'], mapePart);
  const pt = componentScore(a, learnerId, term, ['PT'], mapePart);

  const ig = (ww.ps * w[0] / 100) + (pt.ps * w[1] / 100) + (examPS * w[2] / 100);
  const examinationHasData = examinationComponents.some(component => {
    if (component === 'ST1') return st1.hasData;
    if (component === 'ST2') return st2.hasData;
    return te.hasData;
  });
  const hasData = ww.hasData || pt.hasData || examinationHasData;
  const tg = hasData ? transmute(a, ig) : null;

  return {
    ww,
    pt,
    st1,
    st2,
    te,
    examPS,
    initialGrade: ig,
    termGrade: tg,
    hasData
  };
}

/**
 * Transmutes initial grade into final reported grade.
 */
function transmute(a, ig) {
  const schoolYear = a.schoolYear || db.schoolYear;
  // Re-resolve the policy from authoritative class fields so a stale policy
  // persisted by an older release cannot silently produce incorrect TGs.
  const policy = determinePolicy(a.gradeLevel, a.subject, schoolYear);
  const isZeroBased = isZeroBasedSy(schoolYear) || policy === 'DO15_ZERO';
  
  if (isKeyStage2(a)) {
    if (isZeroBased) {
      return Math.round(ig);
    }
    return keyStage2Grade(ig);
  }
  
  if (policy === 'DO15_DESCRIPTIVE') {
    return transmuteDescriptive(ig);
  }
  
  if (isZeroBased) {
    return Math.round(ig);
  }
  
  const roundedIg = roundInitialGradeForTable(ig);
  const table = adjusted2026;
  for (let i = 0; i < table.length; i++) {
    if (roundedIg >= table[i][0]) {
      return table[i][2];
    }
  }
  return 60;
}

function keyStage2Grade(ig) {
  const roundedIg = roundInitialGradeForTable(ig);
  for (let i = 0; i < keyStage2Transmutation.length; i++) {
    if (roundedIg >= keyStage2Transmutation[i][0]) {
      return keyStage2Transmutation[i][1];
    }
  }
  return 60;
}

function roundInitialGradeForTable(ig) {
  const numeric = Number(ig);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function termDescription(a, grade) {
  if (grade === null || grade === undefined) return '';
  return descriptor(grade);
}

function descriptor(grade) {
  if (grade === null || grade === undefined || grade === '') return '';
  const g = String(grade).toUpperCase();
  if (g === 'T/O' || g === 'TRANSFERRED OUT') return 'Transferred Out';
  const fromLetter = descriptorLabel(g);
  if (fromLetter) return fromLetter;
  
  const num = parseFloat(grade);
  if (isNaN(num)) return grade;
  if (num >= 90) return descriptorLabel('A');
  if (num >= 80) return descriptorLabel('B');
  if (num >= 75) return descriptorLabel('C');
  if (num >= 65) return descriptorLabel('D');
  return descriptorLabel('E');
}

function consolidateMapehGrades(gm, gp) {
  if (gm === 'T/O' || gp === 'T/O') return 'T/O';
  if (gm === null || gm === undefined || gm === '' || gp === null || gp === undefined || gp === '') {
    const valid = [gm, gp].filter(x => x !== null && x !== undefined && x !== '' && x !== 'T/O');
    if (valid.length === 0) return '';
    const num = parseFloat(valid[0]);
    return isNaN(num) ? '' : Math.round(num);
  }
  const valM = parseFloat(gm);
  const valP = parseFloat(gp);
  if (isNaN(valM) && isNaN(valP)) return '';
  if (isNaN(valM)) return Math.round(valP);
  if (isNaN(valP)) return Math.round(valM);
  return Math.round((valM + valP) / 2);
}


function isZeroBasedSy(sy) {
  if (!sy) return false;
  const parts = String(sy).split('-');
  const startYear = parseInt(parts[0]);
  return !isNaN(startYear) && startYear >= 2027;
}

function isGrade1Assignment(a) {
  return parseInt(a?.gradeLevel, 10) === 1;
}

function isPassing(grade) {
  if (grade === null || grade === undefined || grade === '') return false;
  const g = String(grade).toUpperCase();
  if (['A', 'B', 'C'].includes(g)) return true;
  if (['D', 'E'].includes(g)) return false;
  const num = parseFloat(grade);
  return !isNaN(num) && num >= 75;
}

function transmuteDescriptive(ig) {
  if (ig >= 90) return 'A';
  if (ig >= 80) return 'B';
  if (ig >= 75) return 'C';
  if (ig >= 65) return 'D';
  return 'E';
}

function formatTransmutationInitialGrade(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return (Math.round((num + 1e-12) * 100) / 100).toFixed(2);
}

function formatTransmutationGrade(value) {
  if (value == null || value === '') return '—';
  const text = String(value).trim();
  if (/^[A-E]$/i.test(text)) return text.toUpperCase();
  const num = Number(text);
  if (!Number.isFinite(num)) return text;
  return String(Math.round(num));
}

function formatGradeForDisplay(grade, policy) {
  if (grade === null || grade === undefined || grade === '') return '';
  if (policy === 'DO15_DESCRIPTIVE' && typeof db !== 'undefined' && db.showNumericalEquivalents) {
    const g = String(grade).toUpperCase();
    const rangeMap = {
      'A': '90-100',
      'B': '80-89',
      'C': '75-79',
      'D': '65-74',
      'E': '0-64'
    };
    if (rangeMap[g]) {
      return `${g} (${rangeMap[g]})`;
    }
  }
  return grade;
}

function isNonLookupGrade(grade) {
  const value = String(grade == null ? '' : grade).trim().toUpperCase();
  return !value || value === 'T/O' || value === 'T/I' || value === 'TRANSFERRED OUT' || value === 'TRANSFERRED IN' || value === '—';
}

function canOpenTransmutationTable(ig, tg, options) {
  if (options && (options.isTransferredIn || options.isTransferredOut || options.disabled)) return false;
  if (isNonLookupGrade(tg)) return false;
  return Number.isFinite(Number(ig));
}

function transmutationTriggerAttrs(ig, tg, options) {
  if (!canOpenTransmutationTable(ig, tg, options)) return '';
  const igText = typeof fmt === 'function' ? String(fmt(ig)) : String(ig);
  const tgText = String(tg);
  return ` tabindex="0" role="button" title="View transmutation table" aria-label="${esc(`View transmutation table. Initial grade ${igText}, transmuted grade ${tgText}`)}" data-initial-grade="${esc(String(ig))}" data-transmuted-grade="${esc(tgText)}"`;
}

function transmutationTriggerClass(baseClass, ig, tg, options) {
  const extra = canOpenTransmutationTable(ig, tg, options) ? 'tg-lookup-trigger' : '';
  return [baseClass, extra].filter(Boolean).join(' ');
}

function wrapTransmutationTrigger(innerHtml, ig, tg, options) {
  if (!canOpenTransmutationTable(ig, tg, options)) return innerHtml;
  const extraClass = options && options.className ? ` ${options.className}` : '';
  return `<span class="tg-lookup-trigger${extraClass}"${transmutationTriggerAttrs(ig, tg, options)}>${innerHtml}</span>`;
}

function transmutationRangeHigh(nextLowerBound) {
  if (!Number.isFinite(Number(nextLowerBound))) return 100;
  return roundInitialGradeForTable(Number(nextLowerBound) - 0.01);
}

function transmutationTableModel(assignment, ig) {
  const a = assignment || {};
  const schoolYear = a.schoolYear || (typeof db !== 'undefined' ? db.schoolYear : '');
  const policy = determinePolicy(a.gradeLevel, a.subject, schoolYear);
  const zeroBased = isZeroBasedSy(schoolYear) || policy === 'DO15_ZERO';
  const roundedIg = roundInitialGradeForTable(ig);
  const transmutedGrade = transmute(a, ig);
  const numeric = Number.isFinite(Number(ig));

  if (isKeyStage2(a) && !zeroBased) {
    const rows = keyStage2Transmutation.map((row, index) => ({
      low: row[0],
      high: index === 0 ? 100 : transmutationRangeHigh(keyStage2Transmutation[index - 1][0]),
      tg: row[1]
    }));
    return {
      kind: 'ks2',
      title: 'Key Stage 2 Transmutation Table',
      sourceLabel: 'DepEd Key Stage 2 trimester transmutation',
      policy,
      roundedIg,
      initialGrade: numeric ? Number(ig) : null,
      transmutedGrade,
      rows,
      matchIndex: matchTransmutationRowIndex(rows, roundedIg)
    };
  }

  if (policy === 'DO15_DESCRIPTIVE') {
    const rows = [
      { low: 90, high: 100, tg: 'A', descriptor: descriptorLabel('A') },
      { low: 80, high: 89.99, tg: 'B', descriptor: descriptorLabel('B') },
      { low: 75, high: 79.99, tg: 'C', descriptor: descriptorLabel('C') },
      { low: 65, high: 74.99, tg: 'D', descriptor: descriptorLabel('D') },
      { low: 0, high: 64.99, tg: 'E', descriptor: descriptorLabel('E') }
    ];
    return {
      kind: 'descriptive',
      title: 'Descriptive Transmutation Table',
      sourceLabel: 'DO 15, s. 2026 descriptive equivalents',
      policy,
      roundedIg,
      initialGrade: numeric ? Number(ig) : null,
      transmutedGrade,
      rows,
      matchIndex: matchTransmutationRowIndex(rows, roundedIg)
    };
  }

  if (zeroBased) {
    return {
      kind: 'zero',
      title: 'Zero-based grading',
      sourceLabel: 'SY 2027-2028 onward: the transmuted grade is the rounded initial grade',
      policy,
      roundedIg,
      initialGrade: numeric ? Number(ig) : null,
      transmutedGrade,
      rows: [],
      matchIndex: -1
    };
  }

  const rows = adjusted2026.map(row => ({ low: row[0], high: row[1], tg: row[2] }));
  return {
    kind: 'adjusted2026',
    title: 'Transmutation Table',
    sourceLabel: 'DO 15, s. 2026 adjusted transmutation (SY 2026-2027)',
    policy,
    roundedIg,
    initialGrade: numeric ? Number(ig) : null,
    transmutedGrade,
    rows,
    matchIndex: matchTransmutationRowIndex(rows, roundedIg)
  };
}

function matchTransmutationRowIndex(rows, roundedIg) {
  const value = Number(roundedIg);
  if (!Number.isFinite(value) || !Array.isArray(rows)) return -1;
  for (let i = 0; i < rows.length; i++) {
    if (value >= rows[i].low) return i;
  }
  return rows.length ? rows.length - 1 : -1;
}

