const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'src/renderer/js/teacher-tools.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/css/teacher-tools.css'), 'utf8');
[
  'Checklist items (one per line: Label | Points)',
  'updateChecklistItemSelection',
  'deleteChecklistActivity',
  'restoreChecklistActivity',
  'duplicateChecklistActivity',
  'Unlock and revert official changes before deleting',
  'Items:'
].forEach(value => assert(ui.includes(value), `Missing checklist redesign UI: ${value}`));
assert(ui.includes('promptPinVerification'));
assert(ui.includes('hidden but retained for restoration'));
assert(css.includes('.checklist-multi-items'));
console.log('Performance Checklist redesign UI, protected deletion, restore, and export-detail wiring tests passed.');
