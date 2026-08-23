const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'src/renderer/js/teacher-tools.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/css/teacher-tools.css'), 'utf8');
const polish = fs.readFileSync(path.join(root, 'src/renderer/css/teacher-tools-polish.css'), 'utf8');
const workspace = fs.readFileSync(path.join(root, 'src/renderer/css/teacher-tools-workspace.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const database = fs.readFileSync(path.join(root, 'src/renderer/js/database.js'), 'utf8');
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
assert(ui.includes("globalScope.confirmModal('Delete Activity'"));
assert(ui.includes('globalScope.setTimeout(() => globalScope.promptPinVerification'));
assert.match(ui, /checklistState\.sessionId='';\r?\n\s+openPerformanceChecklistPage\(\);/);
assert.doesNotMatch(ui, /checklistState\.sessionId='';\r?\n\s+activate\('checklist'\);/);
assert(!ui.includes("if (!globalScope.confirm(count ? "));
assert(database.includes("overlay.dataset.pinVerificationModal = 'true'"));
assert(database.includes("overlay.style.zIndex = '13000'"));
assert(database.includes("pinInput.addEventListener('input'"));
assert(database.includes('requestAnimationFrame(focusPin)'));
assert(database.includes('pinInput.focus({ preventScroll: true })'));
assert(ui.includes('hidden but retained for restoration'));
assert(css.includes('.checklist-multi-items'));
assert(index.includes('record-header-row performance-checklist-class-row'));
assert(index.includes('id="performanceChecklistClassSelect"'));
assert(!ui.includes("classPicker('performanceChecklistClassSelect'"));
assert(workspace.includes('.performance-checklist-class-row'));
assert(polish.includes('Dedicated Performance Checklist workspace'));
assert(polish.includes('.checklist-toolbar-action--primary'));
[
  'checklistActionIcon',
  'checklist-primary-toolbar',
  'checklist-overview-grid',
  'checklist-overview-card--summary',
  'checklist-overview-card--actions',
  'checklist-overview-card--active',
  'checklist-overview-card--save',
  'checklist-grid-footer',
  'Review Grade Contributions'
].forEach(value => assert(ui.includes(value), `Missing checklist command-center UI: ${value}`));
assert(!index.includes('performance-checklist-hero'));
assert(!index.includes('performance-checklist-hero__scene'));
assert(polish.includes('Performance Checklist command-center redesign'));
assert(polish.includes('.checklist-overview-grid'));
assert(polish.includes('@media(max-width:760px)'));
console.log('Performance Checklist redesign UI, protected deletion, restore, and export-detail wiring tests passed.');
