const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const core = require(path.join(root, 'src/renderer/js/teacher-tools-core.js'));

function sequenceRandom(values) {
  let index = 0;
  return max => {
    const value = values[index++ % values.length];
    return Math.abs(value) % max;
  };
}

function learner(id, sex) {
  return { id, firstName: id, lastName: 'Learner', sex };
}

function fixture() {
  const learners = [
    learner('m1', 'M'), learner('m2', 'M'), learner('m3', 'M'),
    learner('f1', 'F'), learner('f2', 'F'), learner('f3', 'F'),
    learner('u1', ''), { ...learner('out', 'M'), transferredOutTerm: '1' }
  ];
  return {
    id: 'class-1',
    schoolYear: '2026-2027',
    gradeLevel: '6',
    section: 'Integrity',
    subject: 'Mathematics',
    learners,
    assessments: [
      { id: 'ww-1', title: 'Written Work 1', component: 'WW', term: '1', maxScore: 20 },
      { id: 'pt-1', title: 'Performance Task 1', component: 'PT', term: '1', maxScore: 30 },
      { id: 'ww-2', title: 'Written Work 2', component: 'WW', term: '2', maxScore: 20 }
    ],
    scores: {
      'm1|ww-1': 10,
      'm2|ww-1': 11,
      'f1|ww-1': 12
    }
  };
}

{
  const assignment = fixture();
  const eligible = core.activeLearners(assignment);
  assert.strictEqual(eligible.length, 7);
  assert(!eligible.some(item => item.id === 'out'));

  const groups = core.randomizeGroups(eligible, 3, 'random', sequenceRandom([2, 1, 0, 3]));
  assert.strictEqual(groups.length, 3);
  const flattened = groups.flat();
  assert.strictEqual(new Set(flattened.map(item => item.id)).size, eligible.length);
  assert.deepStrictEqual(
    flattened.map(item => item.id).sort(),
    eligible.map(item => item.id).sort()
  );
  assert(Math.max(...groups.map(group => group.length)) - Math.min(...groups.map(group => group.length)) <= 1);

  const balancedRoster = [
    ...Array.from({ length: 8 }, (_, index) => learner(`m${index}`, 'M')),
    ...Array.from({ length: 8 }, (_, index) => learner(`f${index}`, 'F')),
    learner('unknown-1', '')
  ];
  const balanced = core.randomizeGroups(balancedRoster, 4, 'balanced', sequenceRandom([0, 2, 1, 3]));
  const maleCounts = balanced.map(group => group.filter(item => item.sex === 'M').length);
  const femaleCounts = balanced.map(group => group.filter(item => item.sex === 'F').length);
  assert(Math.max(...maleCounts) - Math.min(...maleCounts) <= 1);
  assert(Math.max(...femaleCounts) - Math.min(...femaleCounts) <= 1);
  assert(Math.max(...balanced.map(group => group.length)) - Math.min(...balanced.map(group => group.length)) <= 1);
  assert.throws(() => core.randomizeGroups(eligible, 1), /Choose between 2/);
  assert.throws(() => core.randomizeGroups(eligible, 8), /Choose between 2/);
}

{
  const roster = [learner('a', 'M'), learner('b', 'F'), learner('c', '')];
  const picker = core.createNamePicker(roster, sequenceRandom([0, 1, 0]));
  const firstCycle = [picker.draw(), picker.draw(), picker.draw()];
  assert.strictEqual(new Set(firstCycle.map(result => result.learner.id)).size, 3);
  assert.strictEqual(firstCycle[2].remaining, 0);
  const next = picker.draw();
  assert.strictEqual(next.restarted, true);
  assert(next.learner);
  picker.reset();
  assert.strictEqual(picker.status().remaining, 3);
}

{
  const assignment = fixture();
  const database = {
    version: 6,
    assignments: [assignment],
    tools: {
      schemaVersion: 99,
      futureField: { preserved: true },
      gradeSimulatorHistory: []
    }
  };
  const tools = core.normalize(database);
  assert.strictEqual(tools.schemaVersion, 99);
  assert.deepStrictEqual(tools.futureField, { preserved: true });

  const session = core.createSimulationSession(assignment, '1');
  core.setSimulationScore(session, 'm1', 'ww-1', '18');
  core.setSimulationScore(session, 'f2', 'pt-1', '25');
  assert.strictEqual(assignment.scores['m1|ww-1'], 10, 'preview must not mutate official scores');
  assert.strictEqual(assignment.scores['f2|pt-1'], undefined, 'preview must not create official scores');
  assert.strictEqual(core.simulationChanges(session).length, 2);
  assert.throws(() => core.setSimulationScore(session, 'm1', 'ww-1', '21'), /0 to 20/);
  session.draft.assessments.push({ id: 'ww-no-hps', title: 'No HPS', component: 'WW', term: '1', maxScore: '' });
  assert.throws(
    () => core.setSimulationScore(session, 'm1', 'ww-no-hps', '1'),
    /Set a positive HPS/
  );
  assert.throws(() => core.setSimulationScore(session, 'out', 'ww-1', '10'), /not eligible/);
  assert.throws(() => core.setSimulationScore(session, 'm1', 'ww-2', '10'), /selected term/);

  const cleanPlan = core.planSimulationApply(session, assignment);
  assert.strictEqual(cleanPlan.canApply, true);
  const stale = core.clone(assignment);
  stale.scores['m1|ww-1'] = 15;
  assert.strictEqual(core.planSimulationApply(session, stale).conflicts.length, 1);

  const history = core.applySimulation(session, assignment);
  assert.strictEqual(assignment.scores['m1|ww-1'], 18);
  assert.strictEqual(assignment.scores['f2|pt-1'], 25);
  assert.strictEqual(history.changes.length, 2);

  const revertPlan = core.planSimulationRevert(history, assignment);
  assert.strictEqual(revertPlan.ready.length, 2);
  assignment.scores['m1|ww-1'] = 19;
  const conflictPlan = core.planSimulationRevert(history, assignment);
  assert.strictEqual(conflictPlan.conflicts.length, 1);
  const result = core.revertSimulation(history, assignment, { 'm1|ww-1': 'keep' });
  assert.strictEqual(result.restored.length, 1);
  assert.strictEqual(result.kept.length, 1);
  assert.strictEqual(assignment.scores['m1|ww-1'], 19);
  assert.strictEqual(assignment.scores['f2|pt-1'], undefined);
  assert.strictEqual(history.status, 'partially-reverted');

  database.tools.gradeSimulatorHistory = Array.from({ length: 12 }, (_, index) => ({
    ...core.clone(history),
    id: `history-${index}`,
    status: 'applied',
    revertedAt: ''
  }));
  assert.strictEqual(core.normalize(database).gradeSimulatorHistory.length, 10);
}

{
  const assignment = fixture();
  const database = {
    version: 7,
    assignments: [assignment],
    tools: {
      schemaVersion: 1,
      futureChecklistField: { preserved: true }
    }
  };
  const tools = core.normalize(database);
  assert.strictEqual(tools.schemaVersion, 3);
  assert.deepStrictEqual(tools.performanceChecklists, []);
  assert.deepStrictEqual(tools.performanceChecklistHistory, []);
  assert.deepStrictEqual(tools.performanceChecklistEntryHistory, []);
  assert.deepStrictEqual(tools.performanceChecklistTemplates, []);
  assert.deepStrictEqual(tools.futureChecklistField, { preserved: true });

  const checklist = core.createPerformanceChecklist(assignment, '1', {
    title: 'Term 1 Participation',
    criteria: [
      {
        label: 'Recitation',
        destinationComponent: 'WW',
        scoringMode: 'CHECK',
        pointsPerCheck: 2,
        maxPointsPerSession: 2,
        maxPointsPerTerm: 3
      },
      {
        label: 'Notebook',
        destinationComponent: 'TRACKING',
        scoringMode: 'NUMERIC',
        maxPointsPerSession: 5
      },
      {
        label: 'Assignment',
        destinationComponent: 'PT',
        scoringMode: 'CHECK',
        pointsPerCheck: 1,
        maxPointsPerSession: 1
      }
    ]
  });
  tools.performanceChecklists.push(checklist);
  const recitation = checklist.criteria.find(item => item.label === 'Recitation');
  const notebook = checklist.criteria.find(item => item.label === 'Notebook');
  const assignmentCriterion = checklist.criteria.find(item => item.label === 'Assignment');
  const firstSession = checklist.sessions[0];
  core.setChecklistEntry(checklist, assignment, firstSession.id, 'm1', recitation.id, 2);
  core.setChecklistEntry(checklist, assignment, firstSession.id, 'f1', recitation.id, 2);
  core.setChecklistEntry(checklist, assignment, firstSession.id, 'm1', notebook.id, 4);
  core.setChecklistEntry(checklist, assignment, firstSession.id, 'm2', assignmentCriterion.id, 1);
  const secondSession = core.addChecklistSession(checklist, { title: 'Second Meeting', date: '2026-07-30' });
  core.setChecklistEntry(checklist, assignment, secondSession.id, 'm1', recitation.id, 2);
  assert.throws(
    () => core.setChecklistEntry(checklist, assignment, secondSession.id, 'm1', recitation.id, 3),
    /0 to 2/
  );
  assert.throws(
    () => core.setChecklistEntry(checklist, assignment, secondSession.id, 'out', recitation.id, 1),
    /not eligible/
  );
  const totals = core.checklistLearnerTotals(checklist, assignment);
  assert.strictEqual(totals.m1.WW, 3, 'term cap must limit recurring checklist points');
  assert.strictEqual(totals.m1.TRACKING, 4, 'tracking evidence must remain separate');
  assert.strictEqual(totals.m2.PT, 1);

  const wwPlan = core.planChecklistPublication(checklist, assignment, 'WW', 'ww-1');
  assert.strictEqual(wwPlan.changes.length, 2);
  assert.strictEqual(wwPlan.changes.find(item => item.learnerId === 'm1').after.value, 13);
  const publication = core.applyChecklistPublication(checklist, assignment, wwPlan);
  tools.performanceChecklistHistory.unshift(publication);
  assert.strictEqual(assignment.scores['m1|ww-1'], 13);
  assert.strictEqual(assignment.scores['f1|ww-1'], 14);
  assert.strictEqual(core.hasPublishedChecklistContributions(checklist), true);
  assert.throws(
    () => core.clearChecklistEntries(checklist, 'session', firstSession.id),
    /Revert all published checklist points/
  );
  assert.strictEqual(
    core.planChecklistPublication(checklist, assignment, 'WW', 'ww-1').changes.length,
    0,
    'publishing the same checklist total twice must be idempotent'
  );
  core.setChecklistEntry(checklist, assignment, secondSession.id, 'f1', recitation.id, 1);
  assignment.scores['f1|ww-1'] = 15;
  const driftPlan = core.planChecklistPublication(checklist, assignment, 'WW', 'ww-1');
  assert.strictEqual(driftPlan.changes.length, 0);
  assert.strictEqual(driftPlan.blocked[0].reason, 'score-changed-after-publication');
  core.setChecklistEntry(checklist, assignment, secondSession.id, 'f1', recitation.id, '');
  assignment.scores['f1|ww-1'] = 14;
  assert.throws(
    () => core.planChecklistPublication(checklist, assignment, 'WW', 'ww-2'),
    /matching assessment|different target/
  );

  const ptPlan = core.planChecklistPublication(checklist, assignment, 'PT', 'pt-1');
  assert.strictEqual(ptPlan.changes.length, 0);
  assert.strictEqual(ptPlan.blocked.length, 1);
  assert.strictEqual(ptPlan.blocked[0].reason, 'blank-score');

  const revertPlan = core.planChecklistPublicationRevert(publication, checklist, assignment);
  assert.strictEqual(revertPlan.canRevert, true);
  const reverted = core.revertChecklistPublication(publication, checklist, assignment);
  assert.strictEqual(reverted.restored.length, 2);
  assert.strictEqual(assignment.scores['m1|ww-1'], 10);
  assert.strictEqual(assignment.scores['f1|ww-1'], 12);
  assert.strictEqual(publication.status, 'reverted');
  assert.strictEqual(core.hasPublishedChecklistContributions(checklist), false);
  const scoresBeforeReset = core.clone(assignment.scores);
  const sessionReset = core.clearChecklistEntries(checklist, 'session', secondSession.id);
  assert.strictEqual(sessionReset.cleared, 1);
  assert.deepStrictEqual(assignment.scores, scoresBeforeReset, 'resetting checklist entries must not change official scores');
  const termReset = core.clearChecklistEntries(checklist, 'term');
  assert.strictEqual(termReset.cleared, 4);
  assert(checklist.sessions.every(item => core.checklistEntryCount(item) === 0));

  const normalized = core.normalize(database);
  assert.strictEqual(normalized.performanceChecklists.length, 1);
  assert.strictEqual(normalized.performanceChecklists[0].sessions.length, 2);
  assert.strictEqual(normalized.performanceChecklistHistory.length, 1);
}

{
  const assignment = fixture();
  const database = { version: 7, assignments: [assignment] };
  const tools = core.normalize(database);
  const checklist = core.createPerformanceChecklist(assignment, '1', {
    title: 'Safe Entry Transactions',
    criteria: [{
      label: 'Recitation',
      destinationComponent: 'WW',
      scoringMode: 'CHECK',
      pointsPerCheck: 1,
      maxPointsPerSession: 1,
      allowNotes: true
    }]
  });
  tools.performanceChecklists.push(checklist);
  const session = checklist.sessions[0];
  const criterion = checklist.criteria[0];

  const bulkRecord = core.applyChecklistEntryTransaction(checklist, assignment, [
    { sessionId: session.id, learnerId: 'm1', criterionId: criterion.id, value: 1 },
    { sessionId: session.id, learnerId: 'f1', criterionId: criterion.id, value: 1 }
  ], {
    operation: 'bulk',
    label: 'Bulk mark visible learners',
    metadata: { deviceId: 'device-test' }
  });
  assert.strictEqual(bulkRecord.changes.length, 2);
  assert.strictEqual(core.planChecklistEntryUndo(bulkRecord, checklist).canUndo, true);
  assert.strictEqual(core.undoChecklistEntryTransaction(bulkRecord, checklist).restored, 2);
  assert.strictEqual(core.checklistEntry(checklist, session.id, 'm1', criterion.id), null);
  assert.strictEqual(bulkRecord.status, 'reverted');

  const noteRecord = core.applyChecklistEntryTransaction(checklist, assignment, [{
    sessionId: session.id,
    learnerId: 'm1',
    criterionId: criterion.id,
    value: 1
  }], {
    operation: 'entry',
    label: 'Learner note',
    metadata: { deviceId: 'device-test', note: 'Participated clearly.' }
  });
  assert.strictEqual(core.checklistEntry(checklist, session.id, 'm1', criterion.id).note, 'Participated clearly.');
  core.setChecklistEntry(checklist, assignment, session.id, 'm1', criterion.id, '');
  assert.strictEqual(core.planChecklistEntryUndo(noteRecord, checklist).canUndo, false);
  assert.throws(
    () => core.undoChecklistEntryTransaction(noteRecord, checklist),
    /newer entries were preserved/
  );

  session.entries.out = {
    [criterion.id]: { points: 1, note: '', updatedAt: '', updatedByDeviceId: '' }
  };
  const transferredClear = core.applyChecklistEntryTransaction(checklist, assignment, [{
    sessionId: session.id,
    learnerId: 'out',
    criterionId: criterion.id,
    value: ''
  }], {
    operation: 'criterion-clear',
    label: 'Clear Recitation'
  });
  assert.strictEqual(transferredClear.changes.length, 1, 'reset must clear preserved entries for inactive learners');

  const template = core.createChecklistTemplate(checklist, 'Participation Setup', 'Reusable criteria only');
  tools.performanceChecklistTemplates.push(template);
  const copiedCriteria = core.checklistCriteriaFromTemplate(template);
  assert.strictEqual(copiedCriteria.length, 1);
  assert.notStrictEqual(copiedCriteria[0].id, template.criteria[0].id);
  assert.strictEqual(copiedCriteria[0].allowNotes, true);

  const target = core.linkChecklistPublicationTarget(checklist, assignment, 'WW', 'ww-1');
  assert.strictEqual(target.assessmentId, 'ww-1');
  assert.throws(
    () => core.linkChecklistPublicationTarget(checklist, assignment, 'WW', 'pt-1'),
    /matching assessment/
  );

  tools.performanceChecklistEntryHistory.unshift(transferredClear, noteRecord, bulkRecord);
  const normalized = core.normalize(database);
  assert.strictEqual(normalized.schemaVersion, 3);
  assert.strictEqual(normalized.performanceChecklistTemplates.length, 1);
  assert.strictEqual(normalized.performanceChecklistEntryHistory.length, 3);
}

{
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'src/renderer/js/teacher-tools.js'), 'utf8');
  const toolsCss = fs.readFileSync(path.join(root, 'src/renderer/css/teacher-tools.css'), 'utf8');
  const database = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const sudoku = fs.readFileSync(path.join(root, 'src/renderer/games/sudoku/index.html'), 'utf8');
  const game2048 = fs.readFileSync(path.join(root, 'src/renderer/games/2048/index.html'), 'utf8');
  const minesweeper = fs.readFileSync(path.join(root, 'src/renderer/games/minesweeper/index.html'), 'utf8');

  assert(html.indexOf('id="navTools"') > html.indexOf('id="navAttendance"'));
  assert(html.indexOf('id="navTools"') < html.indexOf('id="navSync"'));
  assert(html.includes('data-view="tools"'));
  assert(html.indexOf('js/teacher-tools-core.js') < html.indexOf('js/database.js'));
  assert(html.indexOf('js/teacher-tools.js') > html.indexOf('js/app.js'));
  ['groupRandomizerClassSelect', 'namePickerClassSelect', 'gradeSimulatorClassSelect', 'performanceChecklistClassSelect']
    .forEach(id => assert(ui.includes(id)));
  assert(ui.includes('record-class-selector u-mb-0'));
  assert(ui.includes('select-class-dropdown'));
  assert(ui.includes('globalScope.selectAssignment(assignmentId)'));
  assert(ui.includes('globalScope.selectAssignment = selectAssignmentFromElsewhere'));
  assert(ui.includes('resetTemporaryClassState()'));
  assert(ui.includes('globalScope.computeTerm(session.draft'));
  assert(ui.includes('Set HPS in the Grading Sheet first'));
  assert(ui.includes('HPS not set'));
  assert(ui.includes('Assessment Scores'));
  assert(ui.includes('Grade Preview'));
  assert(ui.includes('simulator-score-grid'));
  assert(ui.includes('simulator-score-grid--header'));
  assert(ui.includes('simulator-score-slot--header'));
  assert(toolsCss.includes('flex: 1 1 54px'));
  assert(!toolsCss.includes('max-width: 76px'));
  assert(ui.includes('roulette spinning'));
  assert(ui.includes('core.secureRandomInt(learners.length)'));
  assert(ui.includes("matchMedia?.('(prefers-reduced-motion: reduce)')"));
  assert(ui.includes('aria-busy="${pickerState.spinning'));
  assert(ui.includes("onDeactivate: cancelPickerAnimation"));
  assert(ui.includes("id: 'checklist'"));
  assert(ui.includes("label: 'Performance Checklist'"));
  assert(ui.includes('Mini Name Picker'));
  assert(ui.includes('Use Standard Checklist'));
  assert(ui.includes('Start Today’s Session'));
  assert(ui.includes('Bulk Mark'));
  assert(ui.includes('Undo Last Entry'));
  assert(ui.includes('Show Me How It Works'));
  assert(ui.includes('Performance Checklist Tutorial'));
  assert(ui.includes('This tutorial is read-only'));
  assert(ui.includes('Clear One Criterion'));
  assert(ui.includes('checklistResetCriterion'));
  assert(ui.includes('Review Grade Contributions'));
  assert(ui.includes('Missing this criterion'));
  assert(ui.includes('Checklist learner note'));
  assert(ui.includes('Save as Template'));
  assert(ui.includes('Reset Checklist'));
  assert(ui.includes('Clear Current Session'));
  assert(ui.includes('Clear All Term Sessions'));
  assert(ui.includes('Reset Mini Name Picker Only'));
  assert(ui.includes('createDatabaseRestorePoint'));
  assert(ui.includes('core.applyChecklistEntryTransaction'));
  assert(ui.includes('data-contribution-target="${component}"'));
  assert(ui.includes('data-review-contribution="${component}"'));
  assert(ui.includes('Print Summary'));
  assert(ui.includes('Export CSV'));
  assert(ui.includes('electronAPI?.exportCsv'));
  assert(ui.includes('core.applyChecklistPublication'));
  assert(ui.includes('Blank official scores are excluded'));
  assert(toolsCss.includes('.checklist-table'));
  assert(toolsCss.includes('.checklist-picker'));
  assert(toolsCss.includes('.checklist-tutorial'));
  assert(ui.includes('if (!await globalScope.saveDatabase())'));
  assert(database.includes('const DB_VERSION = 7;'));
  assert(database.includes('ToolsData.normalize(db)'));
  assert(preload.includes("require('sudoku-gen')"));
  assert(preload.includes('generateSudoku:'));
  [sudoku, game2048, minesweeper].forEach(source => {
    assert(source.includes("connect-src 'none'"));
    assert(!source.includes('https://'));
    assert(!source.includes('http://'));
    assert(!source.includes('electronAPI'));
    assert(!source.includes('<script src='));
    assert(!source.includes('rel="stylesheet"'));
  });
  assert(!game2048.includes('@import'));
  assert(game2048.includes('data-bundled-from="2048-html@1.0.0"'));
  assert(minesweeper.includes('data-bundled-from="minesjs@1.0.2"'));
  assert(html.includes('sandbox="allow-scripts"') || ui.includes('sandbox="allow-scripts"'));
}

console.log('Teacher Tools class selection, randomization, simulation isolation, reversible history, and game sandbox tests passed.');
