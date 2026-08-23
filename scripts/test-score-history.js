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
const recordTableCss = read('src/renderer/css/record-table.css');
const scoreHistoryCss = read('src/renderer/css/score-history.css');
const scoreHistoryUi = read('src/renderer/js/score-history-ui.js');

assert.match(recordTable, /ScoreHistory\?\.record\(a,/);
assert.match(recordTable, /score-history-trigger/);
assert.match(recordTable, /const historyButton = !isDisabled && hasScoreChange/);
assert.match(recordTable, /bindScoreHistoryTriggers\(recordTableRoot\)/);
assert.match(recordTable, /trigger\.addEventListener\('click'/);
assert.match(recordTable, /data-learner-id=/);
assert.doesNotMatch(recordTable, /onclick="[^"]*openScoreHistory/);
assert.doesNotMatch(recordTable, /const historyButton = !isDisabled && globalThis\.ScoreHistory\?\.hasScore\(val\)/);
assert.match(recordTable, /ScoreHistory\?\.hasScore\(entry\.previousValue\)/);
assert.match(recordTable, /scoreChangeKeys/);
assert.doesNotMatch(recordTable, /score-cell--changed/);
assert.doesNotMatch(recordTableCss, /td\.score-cell--changed/);
assert.doesNotMatch(recordTableCss, /#f59e0b/);
assert.match(quickGrade, /'quick-grade'/);
assert.match(mobileSync, /source: 'mobile-sync'/);
assert.match(teacherTools, /function auditScoreChange/);
assert.ok(index.indexOf('js/score-history.js') < index.indexOf('js/record-table.js'));
assert.ok(index.includes('js/score-history-ui.js'));
assert.doesNotMatch(scoreHistoryUi, /hasScore\(assignment\.scores/);
assert.match(scoreHistoryCss, /\.score-history-modal\s*\{[^}]*z-index:/);

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.style = {};
    this.textContent = '';
    this.listeners = {};
    this.children = {};
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id === 'scoreHistoryModal') return;
    this.children = {
      '.score-history-close': new FakeElement(),
      '.score-history-done': new FakeElement(),
      '#scoreHistorySubtitle': new FakeElement('scoreHistorySubtitle'),
      '#scoreHistoryContext': new FakeElement('scoreHistoryContext'),
      '#scoreHistoryList': new FakeElement('scoreHistoryList')
    };
  }

  get innerHTML() { return this._innerHTML; }
  querySelector(selector) { return this.children[selector] || null; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  focus() { this.focused = true; }
}

const vm = require('vm');
const elements = {};
const clearedAssignment = {
  gradeLevel: '4',
  section: 'Test',
  subject: 'Mathematics',
  learners: [{ id: 'l1', firstName: 'Ana', lastName: 'Reyes' }],
  assessments: [{ id: 'a1', term: '1', title: 'Quiz 1', component: 'WW' }],
  scores: { 'l1|a1': '' },
  scoreHistory: [{
    id: 'history-1', learnerId: 'l1', assessmentId: 'a1', term: '1',
    previousValue: 5, newValue: null, source: 'grading-sheet', changedAt: '2026-08-15T01:00:00.000Z'
  }]
};
const context = {
  console,
  Date,
  ScoreHistory,
  currentAssignment: () => clearedAssignment,
  learnerDisplayName: learner => `${learner.lastName}, ${learner.firstName}`,
  assessmentHeaderLabel: assessment => assessment.title,
  componentFullName: component => component,
  esc: value => String(value ?? ''),
  document: {
    body: { appendChild(element) { elements[element.id] = element; } },
    getElementById(id) { return elements[id] || null; },
    createElement() {
      const overlay = new FakeElement();
      Object.defineProperty(overlay, 'id', {
        get() { return this._id || ''; },
        set(value) { this._id = value; }
      });
      const originalSetter = Object.getOwnPropertyDescriptor(FakeElement.prototype, 'innerHTML').set;
      Object.defineProperty(overlay, 'innerHTML', {
        get() { return this._innerHTML; },
        set(value) {
          originalSetter.call(this, value);
          this.children = {
            '.score-history-close': new FakeElement(), '.score-history-done': new FakeElement(),
            '#scoreHistorySubtitle': new FakeElement(), '#scoreHistoryContext': new FakeElement(), '#scoreHistoryList': new FakeElement()
          };
        }
      });
      return overlay;
    }
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(scoreHistoryUi, context);
context.openScoreHistory('l1', 'a1');
assert.strictEqual(elements.scoreHistoryModal.style.display, 'flex', 'history must open for a score that was changed and then cleared');
assert.match(elements.scoreHistoryModal.querySelector('#scoreHistoryList').innerHTML, /5/);
assert.match(elements.scoreHistoryModal.querySelector('#scoreHistoryList').innerHTML, /Blank/);

console.log('Score history tests passed.');
