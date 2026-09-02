/**
 * E-Class Record — Grading Calculation Engine
 *
 * Implements standard DepEd Department Order (DO) grading rules,
 * including DO 15 s.2026 and Key Stage 2 Trimester.
 */

let currentMapehSubTab = 'music_arts';

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
  if (typeof db !== 'undefined' && db.useUniversalTrimesterLayout) {
    return keyStage2Template;
  }
  const grade = parseInt(gradeLevel);
  if (grade <= 3) return keyStage1Template;
  if (grade <= 6) return keyStage2Template;
  if (grade <= 10) return juniorHighTemplate;
  return seniorHighTemplate;
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
    subjects: ['Aesthetic Services (Beauty Care)', 'Caregiving (Adult Care)', 'Caregiving (Child Care)', 'Hairdressing Services']
  },
  {
    label: 'TechPro — Agri-Fishery Business and Food Innovation',
    grades: [11, 12],
    group: 'SHS_TECHPRO',
    subjects: ['Agricultural Crops Production', 'Agro-Entrepreneurship', 'Aquaculture', 'Fish Capture', 'Food Processing', 'Organic Agriculture Production', 'Poultry Production (Chicken)', 'Ruminants Production', 'Swine Production']
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

function seniorHighSubjectCatalog(gradeLevel) {
  const grade = parseInt(gradeLevel);
  return SENIOR_HIGH_SUBJECT_CATALOG
    .filter(category => category.grades.includes(grade))
    .map(category => ({
      label: category.label,
      group: category.group,
      subjects: category.subjects.slice()
    }));
}

function seniorHighSubjectGroupForSubject(subject) {
  const normalized = String(subject || '').trim().toLocaleLowerCase();
  for (const category of SENIOR_HIGH_SUBJECT_CATALOG) {
    if (category.subjects.some(item => item.toLocaleLowerCase() === normalized)) return category.group;
  }
  return '';
}

function getSubjectsForGrade(gradeLevel) {
  const grade = parseInt(gradeLevel);
  if (grade === 1) {
    return [
      'Language',
      'Reading and Literacy',
      'Mathematics',
      'Makabansa',
      'Good Manners and Right Conduct (GMRC)',
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
    return seniorHighSubjectCatalog(grade).flatMap(category => category.subjects);
  } else {
    return [];
  }
}

const SENIOR_HIGH_SUBJECT_GROUPS = Object.freeze({
  SHS_CORE: { label: 'Core Subject', weights: [20, 50, 30] },
  SHS_ACADEMIC: { label: 'Academic - All Other Electives', weights: [20, 50, 30] },
  SHS_ARTS: { label: 'Sports and Arts Elective', weights: [20, 60, 20] },
  SHS_FIELD: { label: 'Field Experience / Exposure', weights: [15, 70, 15] },
  SHS_RESEARCH: { label: 'Research, Design and Innovation', weights: [40, 60, 0] },
  SHS_TECHPRO: { label: 'TechPro - All Other Electives', weights: [15, 65, 20] },
  SHS_WORK: { label: 'Work Immersion', weights: [20, 80, 0] }
});

function seniorHighSubjectGroupOptions() {
  return Object.entries(SENIOR_HIGH_SUBJECT_GROUPS).map(([value, config]) => ({
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
    SHS_ARTS_SPORTS: SENIOR_HIGH_SUBJECT_GROUPS.SHS_ARTS.weights
  };
  return map[group] || [20, 50, 30];
}

/**
 * Automatically calculates and assigns the weight set (subjectGroup)
 * based on the grade level, subject keywords, and selected policy mode.
 */
function determineSubjectGroup(gradeLevel, subject, policy, seniorHighOverride) {
  const grade = parseInt(gradeLevel);
  const s = (subject || '').toLowerCase();
  
  if (grade >= 11) {
    const explicitGroup = normalizeSeniorHighSubjectGroup(seniorHighOverride);
    if (explicitGroup) return explicitGroup;
    const catalogGroup = seniorHighSubjectGroupForSubject(subject);
    if (catalogGroup) return catalogGroup;
    if (/work\s*immersion/i.test(s)) {
      return 'SHS_WORK';
    }
    if (/field\s*experience|field\s*exposure|exposure|arts?\s*apprenticeship|creative\s*production/i.test(s)) {
      return 'SHS_FIELD';
    }
    if (/research|design\s*(and|&)\s*innovation/i.test(s)) {
      return 'SHS_RESEARCH';
    }
    if (/techpro|nc\s*i{1,3}\b/i.test(s)) {
      return 'SHS_TECHPRO';
    }
    if (/\barts?\b|\bsports?\b|health and wellness|human movement|physical education/i.test(s)) {
      return 'SHS_ARTS';
    }
    const coreSubjects = new Set([
      'effective communication',
      'mabisang komunikasyon',
      'general mathematics',
      'general science',
      'life and career skills'
    ]);
    return coreSubjects.has(s.trim()) ? 'SHS_CORE' : 'SHS_ACADEMIC';
  } else {
    if (/mapeh|music|arts|physical|health|tle|epp|livelihood|pantahanan|pangkabuhayan|technology/i.test(s)) {
      return 'SKILLS_20_60_20';
    }
    if (grade >= 4 && grade <= 6) {
      return 'KS2_TRIMESTER';
    }
    return 'CORE_20_50_30';
  }
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
  const s = (subject || '').toLowerCase();
  
  // Resolve school year start
  let startYear = 2026;
  if (sy) {
    const parts = String(sy).split('-');
    const parsed = parseInt(parts[0]);
    if (!isNaN(parsed)) startYear = parsed;
  }
  
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

  const explicitGroup = normalizeSeniorHighSubjectGroup(
    assignment?.shsSubjectGroup || assignment?.subjectGroup
  );
  const group = explicitGroup || determineSubjectGroup(
    assignment?.gradeLevel,
    assignment?.subject,
    assignment?.policy
  );

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
    ...(mapePart ? { mapePart } : {})
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
  return assessment;
}

function matchingMapehPart(assessment, mapePart) {
  return (assessment.mapePart || undefined) === (mapePart || undefined);
}

function assessmentMatchesTemplateComponent(assessment, templateItem) {
  return canonicalAssessmentComponent(assessment.component) === canonicalAssessmentComponent(templateItem.component);
}

function templateComponentOccurrence(template, slotIndex) {
  const component = canonicalAssessmentComponent(template[slotIndex].component);
  let occurrence = 0;
  for (let i = 0; i < slotIndex; i++) {
    if (canonicalAssessmentComponent(template[i].component) === component) occurrence++;
  }
  return occurrence;
}

function findAssessmentForTemplate(a, usedIds, term, mapePart, slotIndex, template) {
  const templateItem = template[slotIndex];
  const legacyMatch = findAssessment(a, String(term), templateItem.component, templateItem.title, mapePart, usedIds);
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
    matchingMapehPart(item, mapePart)
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
  const isMapeh = isMapehSubject(a.subject);
  const parts = isMapeh ? ['music_arts', 'pe_health'] : [undefined];
  
  for (let term = 1; term <= 3; term++) {
    for (const mapePart of parts) {
      for (let i = 0; i < template.length; i++) {
        a.assessments.push(createTemplateAssessment(term, mapePart, i, template[i]));
      }
    }
  }
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
 * Keeps previously used PT4/PT5 columns visible during the DO 015 migration.
 * New Grades 7-12 records receive the recommended five-WW/three-PT preset,
 * while populated legacy columns are retained so no recorded evidence is hidden.
 */
function templateWithPopulatedLegacyPerformanceTasks(a, template) {
  const grade = parseInt(a?.gradeLevel);
  if (!Array.isArray(a?.assessments) || grade < 7 || grade > 12) return template;

  let performanceTaskCount = template.filter(item => item.component === 'PT').length;
  const groups = new Map();
  a.assessments.forEach(assessment => {
    if (canonicalAssessmentComponent(assessment.component) !== 'PT') return;
    const key = `${assessment.term}|${assessment.mapePart || 'regular'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(assessment);
  });

  groups.forEach(items => {
    items.forEach((assessment, index) => {
      if (index >= performanceTaskCount && assessmentHasRecordedData(a, assessment)) {
        performanceTaskCount = Math.max(performanceTaskCount, index + 1);
      }
    });
  });

  performanceTaskCount = Math.min(performanceTaskCount, 5);
  const standardCount = template.filter(item => item.component === 'PT').length;
  if (performanceTaskCount <= standardCount) return template;

  const expanded = template.map(item => ({ ...item }));
  const insertAt = expanded.reduce((last, item, index) => item.component === 'PT' ? index + 1 : last, 0);
  const legacySlots = [];
  for (let index = standardCount + 1; index <= performanceTaskCount; index++) {
    legacySlots.push({ component: 'PT', title: `PT ${index}` });
  }
  expanded.splice(insertAt, 0, ...legacySlots);
  return expanded;
}

/**
 * Ensures appropriate template assessments exist, removing legacy custom ones
 * and preserving scores on matching template columns.
 */
function ensureTemplateAssessments(a) {
  if (!a) return;
  const template = templateWithPopulatedLegacyPerformanceTasks(a, templateForGrade(a.gradeLevel));
  const isMapeh = isMapehSubject(a.subject);
  
  const newAssessments = [];
  const usedIds = new Set();
  const parts = isMapeh ? ['music_arts', 'pe_health'] : [undefined];
  
  for (let term = 1; term <= 3; term++) {
    for (const mapePart of parts) {
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

  a.assessments = newAssessments;
}

function findAssessment(a, term, component, title, mapePart, usedIds) {
  const componentAliases = component === 'ST1' ? ['ST1', 'SA1'] : component === 'ST2' ? ['ST2', 'SA2'] : [component];
  const titleAliases = title === 'ST1' ? ['ST1', 'SA1'] : title === 'ST2' ? ['ST2', 'SA2'] : [title];
  for (let i = 0; i < a.assessments.length; i++) {
    const item = a.assessments[i];
    if (usedIds && usedIds.has(item.id)) continue;
    if (
      String(item.term) === String(term) &&
      componentAliases.includes(canonicalAssessmentComponent(item.component)) &&
      titleAliases.includes(item.title) &&
      matchingMapehPart(item, mapePart)
    ) {
      return item;
    }
  }
  return null;
}

/**
 * Computes component raw/max/percentage score.
 */
function componentScore(a, learnerId, term, components, mapePart) {
  let raw = 0;
  let max = 0;
  let hasData = false;

  for (let i = 0; i < a.assessments.length; i++) {
    const item = a.assessments[i];
    if (String(item.term) !== String(term)) continue;
    if (!components.includes(item.component)) continue;
    if (mapePart && item.mapePart !== mapePart) continue;

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
        initialGrade: 0,
        termGrade: overriddenGrade,
        hasData: true,
        isTransferredIn: true
      };
    }
  }

  const w = weightsForAssignment(a);
  const ww = componentScore(a, learnerId, term, ['WW'], mapePart);
  const pt = componentScore(a, learnerId, term, ['PT'], mapePart);
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
  if (g === 'A') return 'Advancing (Namumukod-tangi)';
  if (g === 'B') return 'Benchmarking (Napamamalas)';
  if (g === 'C') return 'Connecting (Natutungo)';
  if (g === 'D') return 'Developing (Napauunlad)';
  if (g === 'E') return 'Emerging (Nagsisimula)';
  
  const num = parseFloat(grade);
  if (isNaN(num)) return grade;
  
  if (num >= 90) return 'Advancing (Namumukod-tangi)';
  if (num >= 80) return 'Benchmarking (Napamamalas)';
  if (num >= 75) return 'Connecting (Natutungo)';
  if (num >= 65) return 'Developing (Napauunlad)';
  return 'Emerging (Nagsisimula)';
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

