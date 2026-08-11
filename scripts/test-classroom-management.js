const assert = require('assert');
const path = require('path');
const core = require(path.resolve(__dirname, '../src/renderer/js/teacher-tools-core.js'));

function fixture() {
  return { assignments: [{ id: 'class-a' }, { id: 'class-b' }], tools: {
    futureField: { retained: true },
    appearancePreferences: { groupRandomizerTheme: 'ocean', futureThemeField: 1 },
    participationStarEvents: [
      { id: 'a1', assignmentId: 'class-a', term: '1', learnerId: 'learner-1', awardedAt: '2026-08-01T00:00:00.000Z', source: 'legacy', futureEventField: true },
      { id: 'bad', assignmentId: '', learnerId: '', awardedAt: 'bad' }
    ],
    classroomToolSessions: [{ id: 's1', assignmentId: 'class-a', term: '1', tool: 'participation', events: [], futureSessionField: true }],
    calendarPreferences: { filters: { birthdays: false, futureFilter: true }, futureCalendarField: true }
  } };
}

{
  const db = fixture();
  const tools = core.normalize(db);
  assert.strictEqual(tools.schemaVersion, 9);
  assert.deepStrictEqual(tools.futureField, { retained: true });
  assert.strictEqual(tools.appearancePreferences.groupRandomizerTheme, 'island-expedition');
  assert.strictEqual(tools.appearancePreferences.namePickerTheme, 'carnival-wheel');
  assert.strictEqual(tools.appearancePreferences.futureThemeField, 1);
  assert.strictEqual(tools.appearancePreferences.groupRandomizerSound, true);
  assert.strictEqual(tools.appearancePreferences.namePickerSound, true);
  assert.strictEqual(tools.appearancePreferences.groupRandomizerAnimationSpeed, 'normal');
  assert.strictEqual(tools.appearancePreferences.namePickerAnimationSpeed, 'normal');
  assert.strictEqual(tools.participationStarEvents.length, 1);
  assert.strictEqual(tools.participationStarEvents[0].futureEventField, true);
  assert.strictEqual(tools.classroomToolSessions[0].futureSessionField, true);
  assert.strictEqual(tools.calendarPreferences.filters.birthdays, false);
  assert.strictEqual(tools.calendarPreferences.filters.futureFilter, true);
  assert.strictEqual(tools.calendarPreferences.futureCalendarField, true);
  core.awardParticipationStar(tools, 'class-a', '1', 'learner-1', { awardedAt: '2026-08-02T00:00:00.000Z', note: 'Correct answer.' });
  core.awardParticipationStar(tools, 'class-a', '2', 'learner-1', { awardedAt: '2026-08-03T00:00:00.000Z' });
  core.awardParticipationStar(tools, 'class-b', '1', 'learner-1', { awardedAt: '2026-08-04T00:00:00.000Z' });
  assert.strictEqual(core.participationStarTotals(tools.participationStarEvents, 'class-a', '1')['learner-1'], 2);
  assert.strictEqual(core.participationStarTotals(tools.participationStarEvents, 'class-a', '2')['learner-1'], 1);
  assert.strictEqual(core.participationStarTotals(tools.participationStarEvents, 'class-b', '1')['learner-1'], 1);
  assert(core.undoLastParticipationStar(tools, 'class-a', '1'));
  assert.strictEqual(core.participationStarTotals(tools.participationStarEvents, 'class-a', '1')['learner-1'], 1);
  assert.throws(() => core.resetParticipationStars(tools, 'class-b', '1', 'RESET'), /RESET TERM 1/);
  assert.strictEqual(core.resetParticipationStars(tools, 'class-b', '1', 'RESET TERM 1'), 1);
  assert.strictEqual(core.participationStarTotals(tools.participationStarEvents, 'class-b', '1')['learner-1'] || 0, 0);
  const normalizedAgain = core.normalize(JSON.parse(JSON.stringify(db)));
  assert.strictEqual(normalizedAgain.participationStarEvents.length, 4);
  assert.strictEqual(normalizedAgain.futureField.retained, true);
}

{
  const db = { assignments: [{ id: 'class-a' }], tools: { performanceChecklists: [{
    id: 'checklist-1', assignmentId: 'class-a', term: '1',
    criteria: [{ id: 'criterion-1', label: 'Legacy check', scoringMode: 'CHECK', pointsPerCheck: 2 }], sessions: []
  }] } };
  const criterion = core.normalize(db).performanceChecklists[0].criteria[0];
  assert.strictEqual(criterion.checkItems.length, 1);
  assert.strictEqual(criterion.checkItems[0].label, 'Completed');
  assert.strictEqual(criterion.checkItems[0].pointValue, 2);
}

console.log('Classroom-management schema, event ledger, migration, isolation, and round-trip tests passed.');
