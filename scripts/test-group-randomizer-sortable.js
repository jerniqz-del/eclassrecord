const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const ui = read('src/renderer/js/teacher-tools.js');
const css = read('src/renderer/css/teacher-tools-workspace.css');
const html = read('src/renderer/index.html');
const vendorPath = path.join(root, 'src/renderer/vendor/sortablejs/Sortable.min.js');
const licensePath = path.join(root, 'src/renderer/vendor/sortablejs/LICENSE.md');
const packageJson = require(path.join(root, 'package.json'));

assert.strictEqual(packageJson.dependencies.sortablejs, '1.15.7');
assert(fs.existsSync(vendorPath), 'SortableJS browser runtime must be vendored for offline use');
assert(fs.existsSync(licensePath), 'SortableJS license must ship with the app');
assert(read('src/renderer/vendor/sortablejs/LICENSE.md').includes('MIT License'));
assert.doesNotThrow(() => new Function(read('src/renderer/vendor/sortablejs/Sortable.min.js')));
assert(html.includes('vendor/sortablejs/Sortable.min.js'));
assert(html.indexOf('vendor/sortablejs/Sortable.min.js') < html.indexOf('js/teacher-tools.js'));

[
  'globalScope.Sortable.create',
  "group: { name: 'teacher-tool-groups', pull: true, put: true }",
  "handle: '.group-result__drag-handle'",
  "dataIdAttr: 'data-group-learner-id'",
  'emptyInsertThreshold: 24',
  'arrangementFromGroupLists',
  "seen.size !== roster.length",
  'groupState.editHistory.push(before)',
  'groupState.editHistory.length > 30',
  'groupState.originalGroups = core.clone(finalGroups)',
  'Undo Move',
  'Restore Randomized',
  'undoGroupMove',
  'restoreRandomizedGroups',
  'destroyGroupSortables'
].forEach(token => assert(ui.includes(token), `missing SortableJS group behavior: ${token}`));

[
  '.group-edit-hint',
  '.group-result__drag-handle',
  '.group-learner--ghost',
  '.group-learner--chosen',
  '.group-result__list:empty'
].forEach(selector => assert(css.includes(selector), `missing group drag style: ${selector}`));

assert(ui.includes('Counts and balance update automatically.'));
assert(ui.includes("globalScope.toast?.('Group arrangement updated.', 'success')"));
assert(ui.indexOf('groupState.groups = next') < ui.indexOf("globalScope.toast?.('Group arrangement updated.', 'success')"));
console.log('Offline SortableJS group editing, validation, live summaries, undo, restore, and cleanup tests passed.');
