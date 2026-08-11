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
  assert.strictEqual(tools.schemaVersion, 6);
  assert.deepStrictEqual(tools.performanceChecklists, []);
  assert.deepStrictEqual(tools.performanceChecklistHistory, []);
  assert.deepStrictEqual(tools.performanceChecklistEntryHistory, []);
  assert.deepStrictEqual(tools.performanceChecklistTemplates, []);
  assert.deepStrictEqual(tools.futureChecklistField, { preserved: true });
  assert(
    core.defaultChecklistCriteria().every(item => item.scoringMode === 'NUMERIC'),
    'standard Recitation, Notebook, and Assignment criteria must default to numerical scoring'
  );

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
  assert.strictEqual(recitation.scoringMode, 'NUMERIC');
  assert.strictEqual(notebook.scoringMode, 'NUMERIC');
  assert.strictEqual(assignmentCriterion.scoringMode, 'NUMERIC');
  const renamedRecitation = core.createChecklistCriterion({
    ...recitation,
    label: 'Oral Recitation',
    scoringMode: 'CHECK'
  });
  assert.strictEqual(
    renamedRecitation.scoringMode,
    'NUMERIC',
    'renaming a standard activity type must not remove its numerical-only rule'
  );
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
  assignment.assessments.push(
    {
      id: 'ww-recitation-1',
      title: 'Recitation 1',
      component: 'WW',
      term: '1',
      maxScore: 20
    },
    {
      id: 'ww-recitation-2',
      title: 'Recitation 2',
      component: 'WW',
      term: '1',
      maxScore: 20
    },
    {
      id: 'ww-empty-setup',
      title: 'Written Work 4',
      component: 'WW',
      term: '1',
      maxScore: ''
    },
    {
      id: 'ww-overflow',
      title: 'Written Work 5',
      component: 'WW',
      term: '1',
      maxScore: 5
    }
  );
  assignment.scores['m1|ww-overflow'] = 3;
  const database = { version: 7, assignments: [assignment] };
  const tools = core.normalize(database);
  const checklist = core.createPerformanceChecklist(assignment, '1', {
    title: 'Recurring Activities',
    activityMode: true,
    activityTitle: 'Recitation 1',
    criteria: [{
      label: 'Recitation',
      destinationComponent: 'WW',
      scoringMode: 'NUMERIC',
      maxPointsPerSession: 20
    }, {
      label: 'Notebook',
      destinationComponent: 'TRACKING',
      scoringMode: 'CHECK',
      pointsPerCheck: 1,
      maxPointsPerSession: 1
    }]
  });
  tools.performanceChecklists.push(checklist);
  const recitation = checklist.criteria.find(item => item.label === 'Recitation');
  const notebook = checklist.criteria.find(item => item.label === 'Notebook');
  const firstActivity = checklist.sessions[0];
  const secondActivity = core.addChecklistActivity(checklist, {
    criterionId: recitation.id,
    title: 'Recitation 2',
    date: '2026-08-03',
    destinationComponent: 'WW',
    scoringMode: 'NUMERIC',
    maxPoints: 20
  });
  const notebookActivity = core.addChecklistActivity(checklist, {
    criterionId: notebook.id,
    title: 'Notebook 1',
    date: '2026-08-04',
    destinationComponent: 'TRACKING',
    scoringMode: 'CHECK',
    pointsPerCheck: 1,
    maxPoints: 1
  });
  assert.strictEqual(checklist.sessions.length, 3);
  assert.strictEqual(secondActivity.activity.sequence, 2);
  assert.strictEqual(notebookActivity.activity.sequence, 1);
  assert.strictEqual(notebook.scoringMode, 'NUMERIC');
  assert.strictEqual(notebookActivity.activity.scoringMode, 'NUMERIC');
  assert.deepStrictEqual(
    core.checklistTableColumns(checklist).map(column => column.title),
    ['Recitation 1', 'Recitation 2', 'Notebook 1'],
    'every added activity must receive its own Performance Checklist table column'
  );
  assert.deepStrictEqual(
    core.checklistSessionCriteria(checklist, secondActivity).map(item => item.label),
    ['Recitation']
  );
  core.setChecklistEntry(checklist, assignment, firstActivity.id, 'm1', recitation.id, 4);
  core.setChecklistEntry(checklist, assignment, secondActivity.id, 'm1', recitation.id, 6);
  core.setChecklistEntry(checklist, assignment, notebookActivity.id, 'm1', notebook.id, 1);
  assert.throws(
    () => core.setChecklistEntry(checklist, assignment, secondActivity.id, 'm1', notebook.id, 1),
    /does not accept/
  );
  const totals = core.checklistLearnerTotals(checklist, assignment);
  assert.strictEqual(totals.m1.WW, 10, 'multiple Recitation activities must accumulate independently');
  assert.strictEqual(totals.m1.TRACKING, 1);
  const suggestions = core.checklistActivityTargetSuggestions(
    checklist,
    assignment,
    firstActivity.activity.id
  );
  assert.strictEqual(suggestions[0].assessmentId, 'ww-recitation-1');
  assert.strictEqual(suggestions[0].recommended, true);
  assert.strictEqual(suggestions[0].empty, true);
  assert.strictEqual(suggestions[0].exactHps, true);
  assert.strictEqual(
    suggestions.find(item => item.assessmentId === 'ww-empty-setup').requiresSetup,
    true
  );
  assert.deepStrictEqual(
    suggestions.find(item => item.assessmentId === 'ww-overflow').overflowLearnerIds,
    ['m1']
  );
  assert.throws(
    () => core.updateChecklistActivity(checklist, secondActivity.activity.id, { maxPoints: 5 }),
    /Reduce existing learner scores/
  );
  core.updateChecklistActivity(checklist, secondActivity.activity.id, {
    title: 'Oral Recitation 2',
    maxPoints: 20
  });
  assert.strictEqual(secondActivity.activity.title, 'Oral Recitation 2');

  const occupiedTargetPlan = core.planChecklistActivityPublication(
    checklist,
    assignment,
    firstActivity.activity.id,
    'ww-1'
  );
  assert.strictEqual(occupiedTargetPlan.changes.length, 1);
  assert.strictEqual(occupiedTargetPlan.blocked.length, 0);
  assert.deepStrictEqual(occupiedTargetPlan.changes[0].before, { present: true, value: 10 });
  assert.deepStrictEqual(occupiedTargetPlan.changes[0].after, { present: true, value: 14 });
  const occupiedPublication = core.applyChecklistActivityPublication(
    checklist,
    assignment,
    occupiedTargetPlan
  );
  assert.strictEqual(assignment.scores['m1|ww-1'], 14);
  assert.strictEqual(
    core.planChecklistPublicationRevert(occupiedPublication, checklist, assignment).canRevert,
    true
  );
  core.revertChecklistPublication(occupiedPublication, checklist, assignment);
  assert.strictEqual(assignment.scores['m1|ww-1'], 10);

  const setupPlan = core.planChecklistActivityPublication(
    checklist,
    assignment,
    firstActivity.activity.id,
    'ww-empty-setup'
  );
  assert.deepStrictEqual(setupPlan.assessmentBefore, {
    title: 'Written Work 4',
    maxScore: ''
  });
  assert.deepStrictEqual(setupPlan.assessmentAfter, {
    title: 'Recitation 1',
    maxScore: 20
  });
  const setupPublication = core.applyChecklistActivityPublication(
    checklist,
    assignment,
    setupPlan
  );
  const preparedAssessment = assignment.assessments.find(item => item.id === 'ww-empty-setup');
  assert.strictEqual(preparedAssessment.title, 'Recitation 1');
  assert.strictEqual(preparedAssessment.maxScore, 20);
  assert.strictEqual(assignment.scores['m1|ww-empty-setup'], 4);
  preparedAssessment.maxScore = 25;
  assert.strictEqual(
    core.planChecklistPublicationRevert(setupPublication, checklist, assignment).canRevert,
    false,
    'later assessment HPS edits must block automatic publication reversal'
  );
  preparedAssessment.maxScore = 20;
  core.revertChecklistPublication(setupPublication, checklist, assignment);
  assert.strictEqual(preparedAssessment.title, 'Written Work 4');
  assert.strictEqual(preparedAssessment.maxScore, '');
  assert.strictEqual(assignment.scores['m1|ww-empty-setup'], undefined);

  const overflowPlan = core.planChecklistActivityPublication(
    checklist,
    assignment,
    firstActivity.activity.id,
    'ww-overflow'
  );
  assert.strictEqual(overflowPlan.canApply, false);
  assert.strictEqual(overflowPlan.blocked[0].reason, 'score-exceeds-hps');
  assert.strictEqual(overflowPlan.blocked[0].projected, 7);
  assert.throws(
    () => core.applyChecklistActivityPublication(checklist, assignment, overflowPlan),
    /would exceed HPS/
  );
  const firstPlan = core.planChecklistActivityPublication(
    checklist,
    assignment,
    firstActivity.activity.id,
    'ww-recitation-1'
  );
  assert.strictEqual(firstPlan.changes.length, 1);
  const firstPublication = core.applyChecklistActivityPublication(checklist, assignment, firstPlan);
  tools.performanceChecklistHistory.unshift(firstPublication);
  assert.strictEqual(assignment.scores['m1|ww-recitation-1'], 4);
  assert.strictEqual(core.isChecklistActivityPublished(firstActivity), true);
  assert.strictEqual(
    core.planChecklistActivityPublication(
      checklist,
      assignment,
      firstActivity.activity.id,
      'ww-recitation-1'
    ).changes.length,
    0,
    'an activity must not publish the same points twice'
  );
  assert.throws(
    () => core.planChecklistActivityPublication(
      checklist,
      assignment,
      secondActivity.activity.id,
      'ww-recitation-1'
    ),
    /already linked to another checklist activity/
  );
  assert.throws(
    () => core.setChecklistEntry(checklist, assignment, firstActivity.id, 'm1', recitation.id, 5),
    /Published activities are locked/
  );
  assert.throws(
    () => core.updateChecklistActivity(checklist, firstActivity.activity.id, {
      title: 'Changed after publication'
    }),
    /Published activities are locked/
  );
  const lockedEntryUndo = {
    id: 'locked-entry-undo',
    checklistId: checklist.id,
    assignmentId: assignment.id,
    operation: 'entry',
    label: 'Pre-publication entry',
    appliedAt: '2026-08-01T00:00:00.000Z',
    changes: [{
      sessionId: firstActivity.id,
      learnerId: 'm1',
      criterionId: recitation.id,
      before: null,
      after: core.clone(core.checklistEntry(checklist, firstActivity.id, 'm1', recitation.id))
    }],
    status: 'applied',
    revertedAt: ''
  };
  assert.throws(
    () => core.undoChecklistEntryTransaction(lockedEntryUndo, checklist),
    /Published activities are locked/
  );
  const unlockPlan = core.planChecklistActivityUnlock(
    tools.performanceChecklistHistory,
    checklist,
    assignment,
    firstActivity.activity.id
  );
  assert.strictEqual(unlockPlan.canUnlock, true);
  assert.strictEqual(unlockPlan.publications, 1);
  assert.strictEqual(unlockPlan.restoredScores, 1);
  const unlocked = core.unlockChecklistActivity(
    tools.performanceChecklistHistory,
    checklist,
    assignment,
    firstActivity.activity.id
  );
  assert.strictEqual(unlocked.restoredScores, 1);
  assert.strictEqual(firstPublication.status, 'reverted');
  assert.strictEqual(assignment.scores['m1|ww-recitation-1'], undefined);
  assert.strictEqual(core.isChecklistActivityPublished(firstActivity), false);
  assert.strictEqual(
    core.checklistEntry(checklist, firstActivity.id, 'm1', recitation.id).points,
    4,
    'unlocking must preserve checklist points while unpublishing them'
  );
  core.setChecklistEntry(checklist, assignment, firstActivity.id, 'm1', recitation.id, 5);
  core.setChecklistEntry(checklist, assignment, firstActivity.id, 'm1', recitation.id, 4);

  const secondPlan = core.planChecklistActivityPublication(
    checklist,
    assignment,
    secondActivity.activity.id,
    'ww-recitation-2'
  );
  const secondPublication = core.applyChecklistActivityPublication(
    checklist,
    assignment,
    secondPlan
  );
  tools.performanceChecklistHistory.unshift(secondPublication);
  assert.strictEqual(assignment.scores['m1|ww-recitation-2'], 6);
  assert.strictEqual(core.hasPublishedChecklistContributions(checklist), true);
  assert.throws(
    () => core.updateChecklistActivity(checklist, secondActivity.activity.id, {
      destinationComponent: 'PT',
      maxPoints: 20
    }),
    /Published activities are locked/
  );
  assignment.scores['m1|ww-recitation-2'] = 7;
  const conflictingUnlock = core.planChecklistActivityUnlock(
    tools.performanceChecklistHistory,
    checklist,
    assignment,
    secondActivity.activity.id
  );
  assert.strictEqual(conflictingUnlock.canUnlock, false);
  assert.match(conflictingUnlock.error, /changed after publication|newer data/i);
  assignment.scores['m1|ww-recitation-2'] = 6;
  assert.strictEqual(assignment.scores['m1|ww-recitation-1'], undefined);
  assert.strictEqual(assignment.scores['m1|ww-recitation-2'], 6);
  assert.strictEqual(
    secondActivity.activity.publicationTarget.assessmentId,
    'ww-recitation-2',
    'reverting one activity must preserve publications from other activities'
  );

  notebook.scoringMode = 'CHECK';
  notebookActivity.activity.scoringMode = 'CHECK';
  const normalized = core.normalize(database);
  const normalizedChecklist = normalized.performanceChecklists[0];
  assert.strictEqual(normalizedChecklist.sessions[0].activity.title, 'Recitation 1');
  assert.strictEqual(normalizedChecklist.sessions[1].activity.title, 'Oral Recitation 2');
  assert.strictEqual(
    normalizedChecklist.sessions[1].activity.publicationTarget.assessmentId,
    'ww-recitation-2'
  );
  assert.strictEqual(
    normalizedChecklist.criteria.find(item => item.label === 'Notebook').scoringMode,
    'NUMERIC',
    'older standard checklist criteria must migrate from check mark to numerical scoring'
  );
  assert.strictEqual(
    normalizedChecklist.sessions.find(item => item.title === 'Notebook 1').activity.scoringMode,
    'NUMERIC',
    'older standard activities must migrate from check mark to numerical scoring'
  );
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
  assert.strictEqual(normalized.schemaVersion, 6);
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
  assert(ui.includes('const GROUP_COLOR_SCHEMES = Object.freeze(['));
  assert(ui.includes('core.shuffle(GROUP_COLOR_SCHEMES)'));
  assert(ui.includes('groupState.colors = randomGroupColors(finalGroups.length)'));
  assert(ui.includes('data-group-color="${esc(color.name)}"'));
  assert(ui.includes('group-result__swatch'));
  assert(ui.includes('teacher-tools-print-group'));
  assert(toolsCss.includes('--group-accent'));
  assert(toolsCss.includes('.group-result__swatch'));
  assert(toolsCss.includes('.teacher-tools-print-group'));
  assert(toolsCss.includes('print-color-adjust: exact'));
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
  assert(ui.includes("onDeactivate: cancelGroupAnimation"));
  assert(ui.includes('function renderGroupArrangement(groups, options = {})'));
  assert(ui.includes('data-group-learner-id="${esc(learner.id)}"'));
  assert(ui.includes("const delays = [100, 115, 135, 160, 200, 250, 320, 410]"));
  assert(ui.includes('Learners are moving between groups...'));
  assert(ui.includes('function animatePickerLearner(learner)'));
  assert(ui.includes('id="namePickerRouletteAvatar"'));
  assert(ui.includes('function launchSelectionConfetti(anchor)'));
  assert(toolsCss.includes('.group-results--randomizing'));
  assert(toolsCss.includes('@keyframes group-avatar-mix'));
  assert(toolsCss.includes('.teacher-tools-confetti'));
  assert(toolsCss.includes('@keyframes teacher-tools-confetti-burst'));
  assert(ui.includes("id: 'checklist'"));
  assert(ui.includes("label: 'Performance Checklist'"));
  assert(ui.includes('Mini Name Picker'));
  assert(ui.includes('Use Standard Checklist'));
  assert(ui.includes('Add Activity'));
  assert(ui.includes('Add Performance Activity'));
  assert(ui.includes('Edit Performance Activity'));
  assert(ui.includes('Unlock Published Activity'));
  assert(ui.includes('Verify PIN and Unlock'));
  assert(ui.includes('reviewChecklistActivityUnlock'));
  assert(ui.includes('core.planChecklistActivityUnlock'));
  assert(ui.includes('core.unlockChecklistActivity'));
  assert(ui.includes('Published · Locked'));
  assert(ui.includes('adjustChecklistEntry'));
  assert(ui.includes('checklist-stepper-button'));
  assert(ui.includes('Subtract 1 point'));
  assert(ui.includes('Add 1 point'));
  assert(ui.includes('Highest Possible Score'));
  assert(ui.includes('No graded activity yet'));
  assert(ui.includes('Edit Active Activity'));
  assert(ui.includes('The app prioritizes empty assessments and identifies targets that have enough HPS capacity.'));
  const addActivityHandler = ui.match(
    /function openAddChecklistActivity\(\) \{([\s\S]*?)\n  \}\n\n  function openEditChecklistActivity/
  )?.[1] || '';
  assert(
    addActivityHandler.includes('checklist.criteria.filter(item => item.active)'),
    'Add Activity must load all active activity types before a session exists'
  );
  assert(
    !addActivityHandler.includes('checklistSessionCriteria(checklist, session)'),
    'Add Activity must not reference an undefined activity session'
  );
  assert(ui.includes('Bulk Mark'));
  assert(ui.includes('Undo Last Entry'));
  assert(ui.includes('checklist-toolbar-action--bulk'));
  assert(ui.includes('checklist-toolbar-action--picker'));
  assert(ui.includes('checklist-toolbar-action--more'));
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
  assert(ui.includes('let checklistPickerAnimationTimer = null'));
  assert(ui.includes('function cancelChecklistPickerAnimation()'));
  assert(ui.includes('function animateChecklistPickerLearner(learner)'));
  assert(ui.includes("const totalSteps = 27"));
  assert(ui.includes("checklistPickerAnimationTimer = setTimeout(tick, 45)"));
  assert(ui.includes("id=\"checklistPickerRouletteName\""));
  assert(ui.includes("id=\"checklistPickerRouletteAvatar\""));
  assert(ui.includes("checklistState.spinning ? 'Picking...'"));
  assert(ui.includes('Slowly narrowing down the draw...'));
  assert(ui.includes('createDatabaseRestorePoint'));
  assert(ui.includes('core.applyChecklistEntryTransaction'));
  assert(ui.includes('data-contribution-target="${component}"'));
  assert(ui.includes('data-review-contribution="${component}"'));
  assert(ui.includes('data-activity-target="${esc(activity.activityId)}"'));
  assert(ui.includes('core.checklistActivityTargetSuggestions'));
  assert(ui.includes('Recommended - empty with matching HPS'));
  assert(ui.includes('HPS warning'));
  assert(ui.includes('would place ${item.overflowLearnerIds.length}'));
  assert(ui.includes('const saveTargetWithFeedback = async'));
  assert(ui.includes("button.textContent = 'Saving...'"));
  assert(ui.includes("button.textContent = 'Saved'"));
  assert(ui.includes('Target saved - review changes to publish'));
  assert(ui.includes('Unsaved target selected'));
  const saveActivityTargetHandler = ui.match(
    /async function saveChecklistActivityTarget\([\s\S]*?async function saveChecklistContributionTarget/
  )?.[0] || '';
  assert(saveActivityTargetHandler.includes("const criterionId = savedSession.activity.criterionId || ''"));
  assert(saveActivityTargetHandler.includes('The selected target could not be verified after saving.'));
  assert(ui.includes("modal.overlay.classList.add('checklist-publication-preview-overlay')"));
  assert(ui.includes("classList.add('checklist-publication-preview-modal')"));
  assert(ui.includes('core.checklistTableColumns(checklist)'));
  assert(ui.includes('data-checklist-activity-column="${esc(column.sessionId)}"'));
  assert(ui.includes("this,'${esc(session.id)}'"));
  assert(ui.includes('core.planChecklistActivityPublication'));
  assert(ui.includes('core.applyChecklistActivityPublication'));
  assert(ui.includes('Print Summary'));
  assert(ui.includes('Export CSV'));
  assert(ui.includes('electronAPI?.exportCsv'));
  assert(ui.includes('core.applyChecklistPublication'));
  assert(ui.includes('Blank official scores are excluded'));
  assert(toolsCss.includes('.checklist-table'));
  assert(toolsCss.includes('.checklist-toolbar-action--bulk'));
  assert(toolsCss.includes('.checklist-toolbar-action--picker'));
  assert(toolsCss.includes('.checklist-toolbar-action--more'));
  assert(toolsCss.includes('.checklist-picker'));
  assert(toolsCss.includes('.checklist-picker__stage.is-spinning'));
  assert(toolsCss.includes('.checklist-picker__name.is-ticking'));
  assert(toolsCss.includes('.checklist-picker__name.is-revealed'));
  assert(toolsCss.includes('.checklist-activity-form'));
  assert(toolsCss.includes('.checklist-activity-column.is-active'));
  assert(toolsCss.includes('.checklist-activity-column.is-published'));
  assert(toolsCss.includes('.checklist-published-badge'));
  assert(toolsCss.includes('.checklist-stepper-button'));
  assert(toolsCss.includes('.checklist-session-lock'));
  assert(toolsCss.includes('.checklist-criteria-modal'));
  assert(toolsCss.includes('.checklist-publication-preview-modal .modal__body'));
  assert(toolsCss.includes('body.admin-test-mode .checklist-publication-preview-overlay'));
  assert(toolsCss.includes('.checklist-contribution-steps'));
  assert(toolsCss.includes('.checklist-target-recommendation'));
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

console.log('Teacher Tools class selection, recurring activities, simulation isolation, reversible history, and game sandbox tests passed.');
