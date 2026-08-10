const assert = require('assert');
const ScoreHistory = require('../src/renderer/js/score-history.js');

const assignment = {
  assessments: [{ id: 'a1', term: '2' }, { id: 'a2', term: '3' }],
  scores: {}
};

assert.strictEqual(ScoreHistory.record(assignment, {
  learnerId: 'l1', assessmentId: 'a1', previousValue: '', newValue: 8, source: 'quick-grade', changedAt: '2026-08-10T01:00:00.000Z'
}).term, '2');
assert.strictEqual(assignment.scoreHistory.length, 1);
assert.strictEqual(ScoreHistory.record(assignment, {
  learnerId: 'l1', assessmentId: 'a1', previousValue: '8', newValue: 8
}), null, 'numeric no-op should not be logged');

ScoreHistory.record(assignment, {
  learnerId: 'l1', assessmentId: 'a1', previousValue: 8, newValue: 9, source: 'grading-sheet', changedAt: '2026-08-10T02:00:00.000Z'
});
ScoreHistory.record(assignment, {
  learnerId: 'l1', assessmentId: 'a1', previousValue: 9, newValue: '', source: 'clear-column', changedAt: '2026-08-10T03:00:00.000Z'
});
assert.deepStrictEqual(ScoreHistory.forCell(assignment, 'l1', 'a1').map(entry => entry.newValue), [null, 9, 8]);

const diffAssignment = { assessments: [{ id: 'a2', term: '3' }] };
const diff = ScoreHistory.recordDiff(diffAssignment, { 'l2|a2': 4, 'l3|a2': 5 }, { 'l2|a2': 6, 'l3|a2': 5 }, 'undo');
assert.strictEqual(diff.length, 1);
assert.strictEqual(diff[0].term, '3');
assert.strictEqual(diff[0].source, 'undo');
assert.deepStrictEqual(ScoreHistory.splitScoreKey('learner|with|pipes|assessment'), {
  learnerId: 'learner|with|pipes', assessmentId: 'assessment'
});

const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const recordTable = read('src/renderer/js/record-table.js');
const quickGrade = read('src/renderer/js/quick-grade.js');
const mobileSync = read('src/renderer/js/mobile-sync.js');
const teacherTools = read('src/renderer/js/teacher-tools-core.js');
const index = read('src/renderer/index.html');

assert.match(recordTable, /ScoreHistory\?\.record\(a,/);
assert.match(recordTable, /score-history-trigger/);
assert.match(quickGrade, /'quick-grade'/);
assert.match(mobileSync, /source: 'mobile-sync'/);
assert.match(teacherTools, /function auditScoreChange/);
assert.ok(index.indexOf('js/score-history.js') < index.indexOf('js/record-table.js'));
assert.ok(index.includes('js/score-history-ui.js'));

console.log('Score history tests passed.');
