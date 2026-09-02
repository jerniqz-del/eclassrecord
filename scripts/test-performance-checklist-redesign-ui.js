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
  'openDeleteChecklist',
  'executeChecklistDeletion',
  'Delete This Checklist',
  'Delete All Class Checklists',
  'performance-checklist-class-delete',
  'restoreChecklistActivity',
  'duplicateChecklistActivity',
  'Unlock and revert official changes before deleting',
  'Items:'
].forEach(value => assert(ui.includes(value), `Missing checklist redesign UI: ${value}`));
assert(ui.includes('promptPinVerification'));
assert(ui.includes("globalScope.confirmModal('Delete Checklist'"));
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
assert(ui.includes('Choose checklist to conduct'));
assert(ui.includes('Select a checklist…'));
assert(ui.includes('selectChecklistToConduct'));
assert(ui.includes("core.checklistTableColumns(checklist).filter(column => column.sessionId === session.id)"));
assert(ui.includes("checklistState.sessionId = '';\n      openPerformanceChecklistPage();"));
assert(!ui.includes('startTodayChecklistSession'));
assert(!ui.includes('openAddChecklistSession'));
assert(!ui.includes('changeChecklistSession'));
assert(!ui.includes('Start Today’s Session'));
assert(!ui.includes('New Checklist Session'));
assert(!ui.includes('Clear Current Session'));
assert(!ui.includes('Clear All Term Sessions'));
assert(ui.includes("tools.performanceChecklistHistory = tools.performanceChecklistHistory.filter"));
assert(ui.includes("tools.performanceChecklistEntryHistory = tools.performanceChecklistEntryHistory.filter"));
assert(ui.includes("Revert all published checklist points before deleting checklist data."));
assert(ui.includes("createDatabaseRestorePoint"));
assert(css.includes('.checklist-multi-items'));
assert(css.includes('.checklist-more-actions__danger'));
const components = fs.readFileSync(path.join(root, 'src/renderer/css/components.css'), 'utf8');
const premiumFluidity = fs.readFileSync(path.join(root, 'src/renderer/css/premium-fluidity.css'), 'utf8');
assert(index.includes('id="welcomeCloseBtn" class="btn btn-cancel btn-sm"'));
assert(components.includes('#welcomeCloseBtn:disabled'));
assert(!premiumFluidity.includes('.btn-secondary,\n.btn-cancel'));
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
