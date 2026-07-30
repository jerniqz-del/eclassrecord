const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const recordSource = fs.readFileSync(path.join(root, 'src/renderer/js/record-table.js'), 'utf8');
const componentCss = fs.readFileSync(path.join(root, 'src/renderer/css/components.css'), 'utf8');
const printCss = fs.readFileSync(path.join(root, 'src/renderer/css/print.css'), 'utf8');
const attendanceSource = fs.readFileSync(path.join(root, 'src/renderer/js/attendance-excused.js'), 'utf8');

let domReady = null;
const visibility = new Map();
const assignment = { subject: 'Mathematics', learners: [{ id: 'learner-1' }] };
const context = {
  console,
  window: null,
  document: {
    readyState: 'loading',
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') domReady = callback; }
  },
  currentView: 'dashboard',
  currentMapehSubTab: 'music_arts',
  currentAssignment: () => assignment,
  isMapehSubject: () => false,
  showEl: (id, visible, display) => visibility.set(id, { visible, display }),
  setView(view) { context.currentView = view; },
  requestAnimationFrame(callback) { callback(); },
  debounce(fn) { const wrapped = (...args) => fn(...args); wrapped.cancel = () => {}; return wrapped; },
  saveDatabase() {},
  setTimeout,
  clearTimeout
};
context.window = context;

vm.createContext(context);
vm.runInContext(recordSource, context, { filename: 'record-table.js' });
assert.strictEqual(typeof domReady, 'function', 'Record action sync must wait for the complete app script set.');
domReady();
context.setView('record');
for (const id of ['quickGradeBtn', 'transferScoresBtn', 'viewLearnerGradesBtn']) {
  assert.deepStrictEqual(visibility.get(id), { visible: true, display: 'inline-flex' }, `${id} must appear immediately on Grading Sheet navigation.`);
}
context.setView('dashboard');
assert.strictEqual(visibility.get('transferScoresBtn').visible, false, 'Transfer Scores must hide outside the Grading Sheet.');

const zValue = selector => Number(componentCss.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*z-index:\\s*(\\d+)`, 'm'))?.[1] || 0);
assert(zValue('#imageZoomModal.modal-z-top') > zValue('#donateQrModal.modal-z-higher'), 'Image zoom must stack above the QR modal.');
assert(zValue('#imageZoomModal.modal-z-top') > zValue('.modal-z-donate'), 'Image zoom must stack above the parent support modal.');

assert(attendanceSource.includes("target.id = 'attendanceSf2ReportPrint'"), 'SF2 export must create a dedicated print target.');
assert(attendanceSource.includes('target.innerHTML = window.renderAttendanceSf2Preview(payload)'), 'SF2 PDF must use the exact preview renderer.');
assert(printCss.includes('body.support-print-mode.support-print-attendance.sf2-export-print-mode > *:not(#attendanceSf2ReportPrint)'), 'SF2 export mode must exclude the grading sheet and all other page content.');
assert(printCss.includes('body.support-print-mode.support-print-attendance.sf2-export-print-mode #attendanceSf2ReportPrint .sf2-preview-sheet'), 'SF2 export mode must size the preview sheet for PDF output.');

console.log('UI regression checks passed.');
