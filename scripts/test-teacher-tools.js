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
  ['groupRandomizerClassSelect', 'namePickerClassSelect', 'gradeSimulatorClassSelect']
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
