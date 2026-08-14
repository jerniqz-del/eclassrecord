const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Workplace = require('../src/renderer/js/dashboard-workplace.js');

const db = {
  schoolYear: '2026-2027', currentAssignmentId: 'class-a', currentTerm: '1',
  calendarEvents: [
    { id: 'future', title: 'Division meeting', date: '2026-08-12', type: 'meeting' },
    { id: 'past', title: 'Old event', date: '2026-08-01', type: 'meeting' }
  ],
  assignments: [{
    id: 'class-a', schoolYear: '2026-2027', gradeLevel: '6', section: 'A', subject: 'Mathematics',
    learners: [{ id: 'l1' }, { id: 'l2' }],
    assessments: [
      { id: 'a1', title: 'Quiz 1', term: '1', date: '2026-08-08', maxScore: '' },
      { id: 'a2', title: 'Future Quiz', term: '1', date: '2026-08-15', maxScore: 20 }
    ], scores: { 'l1|a1': 8 }
  }, {
    id: 'class-empty', schoolYear: '2026-2027', gradeLevel: '7', section: 'B', subject: 'Science', learners: [], assessments: []
  }]
};

const snapshot = Workplace.snapshot(db, { now: new Date(2026, 7, 9, 10), advisorySummary: { missingGrades: 2, conflicts: 0 } });
assert.equal(snapshot.today, '2026-08-09');
assert.equal(snapshot.stats.classes, 2);
assert.equal(snapshot.stats.learners, 2);
assert.equal(snapshot.stats.learnerDisplay, 2);
assert.equal(snapshot.stats.learnerEntries, 2);
assert.equal(snapshot.stats.uniqueLearners, 2);
assert(snapshot.attention.some(item => item.type === 'missing-hps' && item.assessmentId === 'a1'));
assert(snapshot.attention.some(item => item.type === 'incomplete-scores' && item.title.startsWith('1 score')));
assert(snapshot.attention.some(item => item.type === 'empty-class'));
assert(snapshot.attention.some(item => item.type === 'advisory-missing'));
assert(!snapshot.attention.some(item => item.assessmentId === 'a2' && item.type === 'incomplete-scores'));
assert.deepEqual(snapshot.upcoming.map(item => item.title), ['Division meeting', 'Future Quiz']);
const responsiveUpcoming = Workplace.buildUpcoming({ tools:{ calendarPreferences:{ filters:{ official:true, local:false, birthdays:true } } } }, [], '2026-08-12', { calendarEvents:[
  {id:'official-range',title:'Instructional Block',startDate:'2026-08-10',endDate:'2026-08-14',immutable:true,type:'instruction'},
  {id:'local-hidden',title:'Private reminder',date:'2026-08-12',type:'reminder'},
  {id:'birthday',title:'Ana’s birthday',date:'2026-08-13',type:'birthday',virtual:true},
  {id:'mock-reminder',title:'Mock reminder',date:'2026-08-12',type:'reminder'},
  {id:'deped-q1-exam-1',title:'Legacy seeded exam',date:'2026-08-12',type:'milestone'}
], calendarFilters:{ official:true, local:false, birthdays:true } });
assert.deepEqual(responsiveUpcoming.map(item => item.title), ['Instructional Block','Ana’s birthday']);
assert.equal(responsiveUpcoming[0].date, '2026-08-12');
assert.equal(responsiveUpcoming[0].ongoing, true);
assert(Workplace.isRuntimeMockRecord({id:'sample-event'}));
assert(Workplace.isRuntimeMockRecord({id:'deped-end'}));
assert(!Workplace.isRuntimeMockRecord({id:'teacher-reminder',type:'reminder'}));
assert.equal(snapshot.analytics.assessments, 2);
assert.equal(snapshot.analytics.expectedScores, 4);
assert.equal(snapshot.analytics.enteredScores, 1);
assert.equal(snapshot.analytics.completionPercent, 25);
assert.equal(snapshot.analytics.hpsPercent, 50);
assert.equal(snapshot.analytics.byClass[0].percent, 25);
assert.equal(snapshot.analytics.scoreCoverage.percent, 25);
assert.equal(snapshot.analytics.scoreCoverage.byClass.length, 2);
assert.equal(snapshot.analytics.scoreCoverage.missing, 3);
assert.equal(snapshot.analytics.componentPerformance.written.percent, null);
assert.equal(snapshot.analytics.mix.other, 2);
assert.equal(snapshot.analytics.termCounts['1'], 2);
assert.equal(snapshot.analytics.totalMissingScores, 3);
assert.equal(snapshot.analytics.missingByAssessment.length, 2);
assert.deepEqual(snapshot.analytics.missingByAssessment[0].missingLearners.map(item => item.id), ['l2']);
assert.equal(snapshot.analytics.missingByAssessment[1].missing, 2);
assert.equal(snapshot.analytics.missingByAssessment[0].hasHps, false);
assert.equal(snapshot.analytics.missingByAssessment[1].hasHps, true);

const duplicateDb = {
  schoolYear: '2026-2027', currentTerm: '1',
  assignments: [
    { id: 'dup-a', schoolYear: '2026-2027', learners: [{ id: 'one', lrn: '1234', firstName: 'Ana', lastName: 'Reyes' }], assessments: [] },
    { id: 'dup-b', schoolYear: '2026-2027', learners: [{ id: 'two', lrn: '1234', firstName: 'Ana', lastName: 'Reyes' }], assessments: [] }
  ]
};
let duplicateSnapshot = Workplace.snapshot(duplicateDb);
assert.equal(duplicateSnapshot.stats.learnerEntries, 2);
assert.equal(duplicateSnapshot.stats.uniqueLearners, 1);
assert.equal(duplicateSnapshot.stats.learners, 2, 'Duplicate class enrollments remain included by default.');
duplicateDb.workplace.preferences.includeDuplicateLearners = false;
duplicateSnapshot = Workplace.snapshot(duplicateDb);
assert.equal(duplicateSnapshot.stats.learners, 2, 'The general dashboard roster count remains backward compatible.');
assert.equal(duplicateSnapshot.stats.learnerDisplay, 1, 'Saved preference switches only the Learners KPI to unique learners.');

Workplace.addTask(db, 'Prepare remediation sheets', '2026-08-10');
assert.equal(db.workplace.tasks.length, 1);
assert(Workplace.toggleTask(db, db.workplace.tasks[0].id));
assert.equal(db.workplace.tasks[0].completed, true);
assert(Workplace.removeTask(db, db.workplace.tasks[0].id));
Workplace.rememberContext(db, { assignmentId: 'class-empty', term: '2', action: 'attendance' });
assert.deepEqual(db.workplace.lastContext, { assignmentId: 'class-empty', term: '2', action: 'attendance' });
Workplace.togglePanel(db, 'tasks');
assert.deepEqual(db.workplace.preferences.collapsedPanels, ['tasks']);
Workplace.togglePanel(db, 'tasks');

const unknown = { workplace: { futureSetting: true, preferences: { futurePreference: 'keep' } } };
Workplace.normalize(unknown);
assert.equal(unknown.workplace.futureSetting, true);
assert.equal(unknown.workplace.preferences.futurePreference, 'keep');
const rendererRoot = path.join(__dirname, '..', 'src', 'renderer');
const indexHtml = fs.readFileSync(path.join(rendererRoot, 'index.html'), 'utf8');
const uiSource = fs.readFileSync(path.join(rendererRoot, 'js', 'dashboard-workplace-ui.js'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(rendererRoot, 'js', 'dashboard-workplace-analytics.js'), 'utf8');
const gradeInsightsSource = fs.readFileSync(path.join(rendererRoot, 'js', 'dashboard-grade-insights.js'), 'utf8');
const panelSource = fs.readFileSync(path.join(rendererRoot, 'js', 'dashboard-class-panel.js'), 'utf8');
const panelCss = fs.readFileSync(path.join(rendererRoot, 'css', 'dashboard-class-panel.css'), 'utf8');
assert(indexHtml.includes('id="dashboardWorkplace"'));
assert(indexHtml.includes('id="dashboardTable"'), 'Existing class-card mount must remain available.');
assert(indexHtml.indexOf('js/dashboard-workplace.js') < indexHtml.indexOf('js/database.js'));
assert(indexHtml.indexOf('js/dashboard.js') < indexHtml.indexOf('js/dashboard-workplace-ui.js'));
assert(indexHtml.indexOf('js/dashboard-workplace-ui.js') < indexHtml.indexOf('js/dashboard-workplace-analytics.js'));
assert(indexHtml.indexOf('js/dashboard-workplace-analytics.js') < indexHtml.indexOf('js/dashboard-grade-insights.js'));
assert(indexHtml.indexOf('js/dashboard-grade-insights.js') < indexHtml.indexOf('js/dashboard-class-panel.js'));
assert(indexHtml.includes('id="dashboardAdvisoryPinned"'));
assert(indexHtml.includes('openDashboardClassesFullView()'));
assert(indexHtml.includes('addDashboardClassFromPanel()'));
assert(panelSource.includes('advisoryHost.replaceChildren(advisory)'));
assert(panelSource.includes("grid.querySelector('.dashboard-card--add')?.remove()"));
assert(panelSource.includes("fullGrid.appendChild(sourceAdvisory.cloneNode(true))"));
assert(panelSource.includes('setDashboardClassModalView'));
assert(panelSource.includes('baseRenderDashboardOverview();'));
assert(panelCss.includes('position:sticky'));
assert(panelCss.includes('overflow-y:auto'));
assert(panelCss.includes('top:0'));
assert(panelCss.includes('100vh - var(--header-height) - var(--footer-height)'));
assert(panelCss.includes('body[data-view="dashboard"] #dashboardViewToggle'));
assert(panelCss.includes('height:auto; max-height:none'));
assert(panelCss.includes('z-index:10000 !important'), 'The class full-view must stay below report and export dialogs.');
assert(!panelCss.includes('z-index:12200 !important'), 'The class full-view must not cover nested action dialogs.');
const componentsCss = fs.readFileSync(path.join(rendererRoot, 'css', 'components.css'), 'utf8');
const advisoryCss = fs.readFileSync(path.join(rendererRoot, 'css', 'advisory.css'), 'utf8');
assert(componentsCss.includes('.modal-z-analysis { z-index: 10002; }'), 'Reports must stack above the class full-view.');
assert(advisoryCss.includes('.advisory-nested-modal { z-index: 12100; }'), 'Export Final Grades must stack above the class full-view.');
assert(uiSource.includes('baseRenderDashboardOverview();'), 'Workplace wrapper must retain the existing dashboard cards.');
assert(!uiSource.includes('workplace-command-bar'), 'The dashboard quick menu must remain removed.');
assert(uiSource.includes('id="dashboardWorkplaceTerm"'));
assert(uiSource.includes('workplace-context__selectors'));
assert(uiSource.includes('workplace-continue'));
assert(uiSource.includes('aria-labelledby="workplaceGreeting"'));
assert(uiSource.includes('setDashboardAnalyticsTerm(this.value)'));
assert(uiSource.includes('openCalendarDate?.'));
assert(uiSource.includes('View calendar'));
assert(uiSource.includes('virtualBirthdays'));
assert(analyticsSource.includes('toggleDashboardLearnerDuplicates'));
assert(analyticsSource.includes('Include duplicates'));
assert(analyticsSource.includes('All active classes · Term ${esc(snapshot.currentTerm)}'));
assert(analyticsSource.includes('Overall class performance'));
assert(!gradeInsightsSource.includes("insertAdjacentHTML('beforeend', performanceMarkup"), 'Student Performance card must not be rendered.');
assert(gradeInsightsSource.includes('Learners with missing grades'));
assert(gradeInsightsSource.includes("openDashboardWorkplaceAction('grading'"));
console.log('Dashboard workplace tests passed.');
