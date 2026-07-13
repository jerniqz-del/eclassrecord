const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.AdvisoryData = require('../src/renderer/js/advisory-data.js');
const AdvisoryDashboard = require('../src/renderer/js/advisory-dashboard.js');

function createProfile() {
  const profile = { schoolYear: '2026-2027', assignments: [] };
  AdvisoryData.normalizeAdvisoryData(profile);
  return profile;
}

// The fixed card renders even before setup and is never draggable.
{
  const profile = createProfile();
  const html = AdvisoryDashboard.renderCard(profile, profile.schoolYear, 'grid');
  assert(html.includes('Advisory Class'));
  assert(html.includes('data-dashboard-fixed="true"'));
  assert(html.includes('draggable="false"'));
  assert(!html.includes('data-dashboard-draggable="true"'));
  assert(html.includes('Set Up Advisory Class'));
}

// Grid and list modes both render the same fixed identity.
{
  const profile = createProfile();
  const advisoryClass = AdvisoryData.createClass(profile, {
    id: 'advisory-1', schoolYear: profile.schoolYear, gradeLevel: '4', section: 'Molave', adviserName: 'Teacher One', isActive: true
  });
  AdvisoryData.createLearner(profile, { id: 'learner-1', advisoryClassId: advisoryClass.id, lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan' });
  AdvisoryData.createSubject(profile, { id: 'subject-1', advisoryClassId: advisoryClass.id, subjectName: 'Mathematics', normalizedSubjectKey: 'MATHEMATICS' });
  AdvisoryData.createGrade(profile, {
    advisoryClassId: advisoryClass.id, advisoryLearnerId: 'learner-1', advisorySubjectId: 'subject-1', schoolYear: profile.schoolYear,
    subjectName: 'Mathematics', normalizedSubjectKey: 'MATHEMATICS', term: '1', finalGrade: 88
  });
  const grid = AdvisoryDashboard.renderCard(profile, profile.schoolYear, 'grid');
  const list = AdvisoryDashboard.renderCard(profile, profile.schoolYear, 'list');
  assert(grid.includes('Grade 4 - Molave'));
  assert(list.includes('dashboard-card--list'));
  assert(list.includes('<strong>1</strong> learners'));
  assert.strictEqual(AdvisoryDashboard.summarize(profile, advisoryClass).missingGrades, 2);
}

// Dashboard integration inserts Advisory Class before all sorted subject cards.
{
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'src/renderer/js/dashboard.js'), 'utf8');
  const advisoryInsert = source.indexOf('html += AdvisoryDashboard.renderCard');
  const subjectLoop = source.indexOf('for (let i = 0; i < filtered.length; i++)');
  assert(advisoryInsert > -1 && advisoryInsert < subjectLoop, 'Advisory Class card must be inserted first');
  assert(source.includes("card.dataset.dashboardFixed === 'true'"), 'fixed card must be rejected by drag-start handler');
  assert(source.includes('.filter(item => item.assignment.schoolYear === activeYear)'), 'ordinary card sorting must remain scoped to assignments');
  assert(source.includes('assignment.dashboardOrder = index'), 'ordinary assignment ordering must remain persisted');
}

// The real dashboard renderer keeps the advisory card first across reload-style
// rerenders while ordinary cards retain drag ordering.
{
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/dashboard.js'), 'utf8');
  const target = { innerHTML: '' };
  const storage = new Map();
  const context = {
    console,
    setTimeout: callback => callback(),
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    document: {
      body: { getAttribute: () => 'dashboard' },
      getElementById: id => id === 'dashboardTable' ? target : null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    db: {
      schoolYear: '2026-2027',
      currentAssignmentId: 'class-b',
      assignments: [
        { id: 'class-a', schoolYear: '2026-2027', dashboardOrder: 1, gradeLevel: '4', section: 'A', subject: 'Science', learners: [], assessments: [], scores: {} },
        { id: 'class-b', schoolYear: '2026-2027', dashboardOrder: 0, gradeLevel: '4', section: 'B', subject: 'Mathematics', learners: [], assessments: [], scores: {} }
      ]
    },
    AdvisoryDashboard,
    esc: value => String(value ?? ''),
    subjectColorClass: () => 'science',
    isMapehSubject: () => false,
    termAssessments: () => [],
    saveDatabase: () => Promise.resolve(),
    toast: () => {},
    emptyState: () => '',
    showAddClassLoadModal: () => {},
    selectAssignment: () => {},
    setView: () => {},
    showClassAnalysisModal: () => {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  context.renderDashboardOverview();
  assert(target.innerHTML.indexOf('data-dashboard-fixed="true"') < target.innerHTML.indexOf('data-assignment-id="class-b"'));
  assert(target.innerHTML.indexOf('data-assignment-id="class-b"') < target.innerHTML.indexOf('data-assignment-id="class-a"'));
  assert((target.innerHTML.match(/data-dashboard-draggable="true"/g) || []).length === 2);

  let prevented = false;
  context.handleDashboardCardDragStart({
    currentTarget: { dataset: { dashboardFixed: 'true' } },
    preventDefault: () => { prevented = true; }
  });
  assert.strictEqual(prevented, true, 'fixed advisory card must reject drag start');

  context.reorderDashboardAssignments('class-a', 'class-b', 'before');
  assert.strictEqual(context.db.assignments.find(item => item.id === 'class-a').dashboardOrder, 0);
  context.renderDashboardOverview();
  assert(target.innerHTML.indexOf('data-dashboard-fixed="true"') < target.innerHTML.indexOf('data-assignment-id="class-a"'));
}

// Eyeglasses art is bundled CSS and has no network URL.
{
  const advisoryCss = fs.readFileSync(path.join(__dirname, '../src/renderer/css/advisory.css'), 'utf8');
  assert(advisoryCss.includes('data:image/svg+xml'));
  assert(!/url\(["']?https?:\/\//i.test(advisoryCss), 'eyeglasses artwork must not use a remote URL');
}

console.log('Advisory dashboard ordering and rendering tests passed.');
