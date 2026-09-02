// Bundled changelog for v1.9.6
const APP_CHANGELOG = {
  version: '1.9.6',
  releaseDate: '2026-09-02',
  points: [
    'Corrected SY 2026-2027 TLE and other numerically graded subjects to use the adjusted DO 15 transmutation table.',
    'Hardened grading against stale saved policy values by resolving the policy from the grade level, subject, and school year.',
    'Rounded initial grades to hundredths before table lookup, closing boundary gaps between official ranges.',
    'Verified every learner row in the supplied Grade 10 TLE PDF against raw scores, weighted components, initial grades, and corrected transmuted grades.',
    'Removed MAPEH from Grade 3 class creation and removed its Music & Arts and PE & Health components from Grade 3 Advisory records.'
  ]
};
