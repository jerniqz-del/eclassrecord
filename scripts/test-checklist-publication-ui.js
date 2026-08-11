const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = fs.readFileSync(path.resolve(__dirname, '../src/renderer/js/teacher-tools.js'), 'utf8');
['Create New Assessment','createChecklistActivityAssessment','Before','Checklist change','After','Publication blocked','PIN verification is required','Published · Locked'].forEach(text => assert(ui.includes(text), `Missing publication UI: ${text}`));
assert(ui.includes('data-create-activity-assessment'));
assert(ui.includes('core.planChecklistActivityPublication'));
assert(ui.includes('core.applyChecklistActivityPublication'));
console.log('Checklist guided publication UI and learner-level review wiring tests passed.');
