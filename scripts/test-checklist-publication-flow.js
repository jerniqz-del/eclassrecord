const assert = require('assert');
const path = require('path');
global.ScoreHistory = require(path.resolve(__dirname, '../src/renderer/js/score-history.js'));
const core = require(path.resolve(__dirname, '../src/renderer/js/teacher-tools-core.js'));

function setup() {
  const assignment = { id:'class-1', schoolYear:'2026-2027', learners:[{id:'l1'},{id:'l2'}], assessments:[], scores:{}, scoreHistory:[] };
  const db = { assignments:[assignment] };
  core.normalize(db);
  const checklist = core.createPerformanceChecklist(assignment, '1', { criteria:[{ label:'Oral Work', scoringMode:'NUMERIC', destinationComponent:'WW', maxPointsPerSession:10 }] });
  const criterion = checklist.criteria[0];
  const session = core.addChecklistActivity(checklist, { criterionId:criterion.id, title:'Oral Work 1', destinationComponent:'WW', scoringMode:'NUMERIC', maxPoints:10 });
  core.setChecklistEntry(checklist, assignment, session.id, 'l1', criterion.id, 8);
  core.setChecklistEntry(checklist, assignment, session.id, 'l2', criterion.id, 7);
  return { assignment, checklist, session, criterion };
}

{
  const { assignment, checklist, session } = setup();
  const assessment = core.createChecklistActivityAssessment(checklist, assignment, session.activity.id, { title:'Oral Work 1', maxScore:10 });
  assert.strictEqual(assessment.term, '1');
  assert.strictEqual(assessment.component, 'WW');
  assert.strictEqual(assessment.createdFrom, 'performance-checklist');
  core.linkChecklistActivityPublicationTarget(checklist, assignment, session.activity.id, assessment.id);
  const plan = core.planChecklistActivityPublication(checklist, assignment, session.activity.id, assessment.id);
  assert.strictEqual(plan.changes.length, 2);
  assert(plan.changes.every(change => change.before.present === false));
  const beforeAssignment = core.clone(assignment);
  const beforeChecklist = core.clone(checklist);
  assert.throws(() => core.applyChecklistActivityPublication(checklist, assignment, { ...plan, _testFailAfter:1 }), /Injected checklist publication failure/);
  assert.deepStrictEqual(assignment, beforeAssignment, 'failed publication must roll back scores and history');
  assert.deepStrictEqual(checklist, beforeChecklist, 'failed publication must roll back publication state');
  const record = core.applyChecklistActivityPublication(checklist, assignment, plan);
  assert.strictEqual(record.changes.length, 2);
  assert.strictEqual(assignment.scoreHistory.length, 2);
  assert(assignment.scoreHistory.every(entry => entry.source === 'checklist-publication'));
  assert.strictEqual(assignment.scores[`l1|${assessment.id}`], 8);
  assert.strictEqual(assignment.scores[`l2|${assessment.id}`], 7);
  assert(core.isChecklistActivityPublished(checklist.sessions.find(item => item.activity?.id === session.activity.id)));
  assert.throws(() => core.applyChecklistActivityPublication(checklist, assignment, plan), /changed after the review|no activity score changes/i);
}

{
  const { assignment, checklist, session, criterion } = setup();
  const target = core.createChecklistActivityAssessment(checklist, assignment, session.activity.id, { maxScore:5 });
  assignment.scores[`l1|${target.id}`] = 1;
  assert.throws(() => core.linkChecklistActivityPublicationTarget(checklist, assignment, session.activity.id, target.id), /exceed/);
  assignment.assessments.push({ id:'wrong-term', title:'Wrong', component:'WW', term:'2', maxScore:10 });
  assert.throws(() => core.planChecklistActivityPublication(checklist, assignment, session.activity.id, 'wrong-term'), /class, term, component/);
  assert.strictEqual(core.checklistEntry(checklist, session.id, 'l1', criterion.id).points, 8);
}

console.log('Checklist guided target creation, learner review planning, atomic rollback, overflow, stale-state, and duplicate publication tests passed.');
