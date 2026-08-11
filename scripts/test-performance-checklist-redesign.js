const assert = require('assert');
const path = require('path');
const core = require(path.resolve(__dirname, '../src/renderer/js/teacher-tools-core.js'));

function fixture() {
  const assignment = { id:'class-1', schoolYear:'2026-2027', learners:[{id:'l1'},{id:'l2'}], assessments:[], scores:{} };
  const db = { assignments:[assignment] };
  const tools = core.normalize(db);
  const checklist = core.createPerformanceChecklist(assignment, '1', { title:'Tasks', criteria:[{
    label:'Skills', scoringMode:'CHECK', destinationComponent:'TRACKING', maxPointsPerSession:5,
    checkItems:[{id:'item-a',label:'Accuracy',pointValue:2},{id:'item-b',label:'Explanation',pointValue:3}]
  }] });
  tools.performanceChecklists.push(checklist);
  const criterion = checklist.criteria[0];
  const session = core.addChecklistActivity(checklist, { criterionId:criterion.id, title:'Skills 1', checkItems:criterion.checkItems });
  return { assignment, db, tools, checklist, session, criterion };
}

{
  const { assignment, checklist, session, criterion } = fixture();
  const entry = core.setChecklistItemSelection(checklist, assignment, session.id, 'l1', criterion.id, ['item-a','item-b']);
  assert.strictEqual(entry.points, 5);
  assert.deepStrictEqual(entry.selectedItemIds, ['item-a','item-b']);
  assert.strictEqual(core.setChecklistItemSelection(checklist, assignment, session.id, 'l2', criterion.id, []), null);
  assert.strictEqual(core.checklistLearnerTotals(checklist, assignment).l1.TRACKING, 5);
  assert.throws(() => core.updateChecklistActivity(checklist, session.activity.id, { scoringMode:'NUMERIC' }), /Confirm the scoring-mode change/);
  core.updateChecklistActivity(checklist, session.activity.id, { scoringMode:'NUMERIC', confirmModeChange:true });
  assert.strictEqual(core.checklistEntry(checklist, session.id, 'l1', criterion.id).points, 5, 'mode changes preserve values');
  assert.throws(() => core.deleteChecklistActivity(checklist, session.activity.id), /1 learner entry/);
  const deleted = core.deleteChecklistActivity(checklist, session.activity.id, { confirmed:true });
  assert.strictEqual(deleted.affectedEntries, 1);
  assert(session.activity.deletedAt);
  assert.strictEqual(core.checklistLearnerTotals(checklist, assignment).l1.TRACKING, 0);
  core.restoreChecklistActivity(checklist, session.activity.id);
  assert.strictEqual(session.activity.deletedAt, '');
  assert.strictEqual(core.checklistEntry(checklist, session.id, 'l1', criterion.id).points, 5);
  const copy = core.duplicateChecklistActivity(checklist, session.activity.id, { title:'Skills Copy' });
  assert.strictEqual(copy.title, 'Skills Copy');
  assert.deepStrictEqual(copy.entries, {});
  assert.notStrictEqual(copy.id, session.id);
}

{
  const { checklist, session } = fixture();
  session.activity.publicationTarget.lastPublishedAt = '2026-08-11T00:00:00.000Z';
  assert.throws(() => core.deleteChecklistActivity(checklist, session.activity.id, { confirmed:true }), /Published activities/);
}

{
  const db = { assignments:[{id:'class-1'}], tools:{ performanceChecklists:[{
    id:'legacy', assignmentId:'class-1', term:'1', criteria:[{id:'c1',label:'Done',scoringMode:'CHECK',pointsPerCheck:1}], sessions:[]
  }] } };
  const criterion = core.normalize(db).performanceChecklists[0].criteria[0];
  assert.strictEqual(criterion.checkItems.length, 1);
  assert.strictEqual(criterion.checkItems[0].label, 'Completed');
  criterion.futureField = { kept:true };
  assert.strictEqual(core.normalize(JSON.parse(JSON.stringify(db))).performanceChecklists[0].criteria[0].futureField.kept, true);
}

console.log('Performance Checklist multi-item, mode-change, deletion, restore, duplication, and migration tests passed.');
