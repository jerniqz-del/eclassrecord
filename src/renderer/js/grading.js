/**
 * E-Class Record — Grading Calculation Engine
 *
 * Implements standard DepEd Department Order (DO) grading rules,
 * including DO 15 s.2026, DO 8 s.2015, and Key Stage 2 Trimester.
 */

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

// Transmutation table: DO 8, s. 2015 Legacy
const legacy2015 = [
  [100.00, 100.00, 100], [98.40, 99.99, 99], [96.80, 98.39, 98], [95.20, 96.79, 97],
  [93.60, 95.19, 96], [92.00, 93.59, 95], [90.40, 91.99, 94], [88.80, 90.39, 93],
  [87.20, 88.79, 92], [85.60, 87.19, 91], [84.00, 85.59, 90], [82.40, 83.99, 89],
  [80.80, 82.39, 88], [79.20, 80.79, 87], [77.60, 79.19, 86], [76.00, 77.59, 85],
  [74.40, 75.99, 84], [72.80, 74.39, 83], [71.20, 72.79, 82], [69.60, 71.19, 81],
  [68.00, 69.59, 80], [66.40, 67.99, 79], [64.80, 66.39, 78], [63.20, 64.79, 77],
  [61.60, 63.19, 76], [60.00, 61.59, 75], [56.00, 59.99, 74], [52.00, 55.99, 73],
  [48.00, 51.99, 72], [44.00, 47.99, 71], [40.00, 43.99, 70], [36.00, 39.99, 69],
  [32.00, 35.99, 68], [28.00, 31.99, 67], [24.00, 27.99, 66], [20.00, 23.99, 65],
  [16.00, 19.99, 64], [12.00, 15.99, 63], [8.00, 11.99, 62], [4.00, 7.99, 61],
  [0.00, 3.99, 60]
];

// Transmutation table: Key Stage 2 Trimester
const keyStage2Transmutation = [
  [99.5, 100], [97.5, 99], [96, 98], [95, 97], [94, 96], [93, 95], [92, 94], [91, 93],
  [90, 92], [89, 91], [88, 90], [87, 89], [86, 88], [85, 87], [84, 86], [83, 85],
  [82, 84], [81, 83], [80, 82], [79, 81], [78, 80], [77, 79], [76, 78], [75, 77],
  [73, 76], [70, 75], [68, 74], [66, 73], [64, 72], [62, 71], [60, 70], [58, 69],
  [56, 68], [54, 67], [52, 66], [50, 65], [48, 64], [46, 63], [43, 62], [40, 61],
  [0, 60]
];

// Key Stage 2 Preset Template for Trimesters
const keyStage2Template = [
  { component: 'WW', title: 'WW 1' },
  { component: 'WW', title: 'WW 2' },
  { component: 'WW', title: 'WW 3' },
  { component: 'WW', title: 'WW 4' },
  { component: 'WW', title: 'WW 5' },
  { component: 'PT', title: 'PT 1' },
  { component: 'PT', title: 'PT 2' },
  { component: 'PT', title: 'PT 3' },
  { component: 'SA1', title: 'SA1' },
  { component: 'SA2', title: 'SA2' },
  { component: 'TE', title: 'TE' }
];

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
    SHS_CORE: [20, 50, 30],
    SHS_ARTS: [20, 60, 20],
    SHS_FIELD: [15, 70, 15],
    SHS_RESEARCH: [40, 60, 0],
    SHS_TECHPRO: [15, 65, 20],
    SHS_WORK: [20, 80, 0],
    DO8_LANG_AP_ESP: [30, 50, 20],
    DO8_SCI_MATH: [40, 40, 20],
    DO8_MUSIC_TLE: [20, 60, 20],
    DO8_SHS_CORE: [25, 50, 25],
    DO8_SHS_ACAD_OTHER: [25, 45, 30],
    DO8_SHS_ACAD_WORK: [35, 40, 25],
    DO8_SHS_TVL: [20, 60, 20]
  };
  return map[group] || [20, 50, 30];
}

/**
 * Checks if teaching load uses Key Stage 2.
 */
function isKeyStage2(a) {
  return a && a.subjectGroup === 'KS2_TRIMESTER';
}

/**
 * Clean up old database formats.
 */
function normalizeAssessmentComponents(a) {
  if (!a.assessments) return;
  for (let i = 0; i < a.assessments.length; i++) {
    if (a.assessments[i].component === 'ST1') a.assessments[i].component = 'SA1';
    if (a.assessments[i].component === 'ST2') a.assessments[i].component = 'SA2';
  }
}

/**
 * Pre-populates KS2 assessments.
 */
function seedKeyStage2Assessments(a) {
  for (let term = 1; term <= 3; term++) {
    for (let i = 0; i < keyStage2Template.length; i++) {
      a.assessments.push({
        id: uid('assessment'),
        term: String(term),
        component: keyStage2Template[i].component,
        title: keyStage2Template[i].title,
        maxScore: '',
        date: ''
      });
    }
  }
}

/**
 * Ensures KS2 elements exist.
 */
function ensureKeyStage2Assessments(a) {
  for (let term = 1; term <= 3; term++) {
    for (let i = 0; i < keyStage2Template.length; i++) {
      const item = keyStage2Template[i];
      if (!findAssessment(a, String(term), item.component, item.title)) {
        a.assessments.push({
          id: uid('assessment'),
          term: String(term),
          component: item.component,
          title: item.title,
          maxScore: '',
          date: ''
        });
      }
    }
  }
}

function findAssessment(a, term, component, title) {
  for (let i = 0; i < a.assessments.length; i++) {
    const item = a.assessments[i];
    if (item.term === term && item.component === component && item.title === title) {
      return item;
    }
  }
  return null;
}

/**
 * Computes component raw/max/percentage score.
 */
function componentScore(a, learnerId, term, components) {
  let raw = 0;
  let max = 0;
  let hasData = false;

  for (let i = 0; i < a.assessments.length; i++) {
    const item = a.assessments[i];
    if (item.term !== term) continue;
    if (!components.includes(item.component)) continue;

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
function computeTerm(a, learnerId, term) {
  const w = weightsFor(a.subjectGroup);
  const ww = componentScore(a, learnerId, term, ['WW']);
  const pt = componentScore(a, learnerId, term, ['PT']);
  const st1 = componentScore(a, learnerId, term, ['SA1', 'ST1']);
  const st2 = componentScore(a, learnerId, term, ['SA2', 'ST2']);
  const te = componentScore(a, learnerId, term, ['TE']);

  let examPS;
  if (isKeyStage2(a) || a.policy === 'DO8_2015') {
    const qa = componentScore(a, learnerId, term, ['SA1', 'SA2', 'ST1', 'ST2', 'TE']);
    examPS = qa.ps;
  } else {
    examPS = (st1.ps * 0.30) + (st2.ps * 0.30) + (te.ps * 0.40);
  }

  const ig = (ww.ps * w[0] / 100) + (pt.ps * w[1] / 100) + (examPS * w[2] / 100);
  const hasData = ww.hasData || pt.hasData || st1.hasData || st2.hasData || te.hasData;
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
  if (isKeyStage2(a)) return keyStage2Grade(ig);
  if (a.policy === 'DO15_ZERO') return Math.round(ig);
  
  const table = a.policy === 'DO8_2015' ? legacy2015 : adjusted2026;
  for (let i = 0; i < table.length; i++) {
    if (ig >= table[i][0] && ig <= table[i][1]) {
      return table[i][2];
    }
  }
  return ig >= 100 ? 100 : 60;
}

function keyStage2Grade(ig) {
  for (let i = 0; i < keyStage2Transmutation.length; i++) {
    if (ig >= keyStage2Transmutation[i][0]) {
      return keyStage2Transmutation[i][1];
    }
  }
  return 60;
}

/**
 * Returns text descriptions for a grade.
 */
function termDescription(a, grade) {
  if (grade === null || grade === undefined) return '';
  if (isKeyStage2(a)) {
    if (grade >= 90) return 'A';
    if (grade >= 80) return 'B';
    if (grade >= 75) return 'C';
    if (grade >= 65) return 'D';
    return 'E';
  }
  return descriptor(grade);
}

function descriptor(grade) {
  if (grade === null || grade === undefined) return '';
  if (grade >= 90) return 'Advancing';
  if (grade >= 80) return 'Benchmarking';
  if (grade >= 75) return 'Connecting';
  if (grade >= 65) return 'Developing';
  return 'Emerging';
}
