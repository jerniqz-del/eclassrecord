const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function element({ id = '', view = '', classes = [] } = {}) {
  const classSet = new Set(classes);
  return {
    id,
    dataset: { view },
    style: { display: view === 'dashboard' ? 'block' : 'none' },
    classList: {
      contains: (name) => classSet.has(name),
      toggle(name, force) {
        if (force) classSet.add(name);
        else classSet.delete(name);
      },
      has: (name) => classSet.has(name),
    },
  };
}

const sections = [
  element({ view: 'dashboard', classes: ['view-section'] }),
  element({ view: 'calendar', classes: ['view-section', 'view-section--flex'] }),
  element({ view: 'sync', classes: ['view-section'] }),
];
let keydownHandler = null;
const buttons = [
  element({ id: 'navDashboard', classes: ['nav-btn', 'nav-btn--active'] }),
  element({ id: 'navSync', classes: ['nav-btn'] }),
];
let baseView = '';
let runtimeState = { currentView: 'dashboard', recordTab: '1' };
const window = {
  db: { activeView: 'dashboard' },
  addEventListener(type, handler) {
    if (type === 'keydown') keydownHandler = handler;
  },
  setView(view) { baseView = view; },
  getRuntimeNavigationState: () => runtimeState,
  replaceRuntimeNavigationState(next) { runtimeState = next; },
  requestAnimationFrame(callback) { callback(); },
};
const document = {
  querySelector(selector) {
    return selector === '.view-section[data-view="sync"]' ? sections[2] : null;
  },
  querySelectorAll(selector) {
    if (selector === '.view-section') return sections;
    if (selector === '.nav-btn') return buttons;
    return [];
  },
};

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'mobile-sync-navigation.js'), 'utf8');
vm.runInNewContext(source, { window, document });
window.openMobileSyncView();

assert.strictEqual(baseView, 'sync', 'Existing router should still be called.');
assert.strictEqual(sections[0].style.display, 'none');
assert.strictEqual(sections[1].style.display, 'none');
assert.strictEqual(sections[2].style.display, 'block');
assert.strictEqual(buttons[0].classList.has('nav-btn--active'), false);
assert.strictEqual(buttons[1].classList.has('nav-btn--active'), true);
assert.strictEqual(runtimeState.currentView, 'sync');
assert.strictEqual(window.db.activeView, 'sync');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
let shortcutPrevented = false;
baseView = '';
keydownHandler({
  key: 'M',
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  repeat: false,
  preventDefault() { shortcutPrevented = true; },
});
assert.strictEqual(baseView, 'sync', 'Ctrl+Shift+M should open Mobile Sync.');
assert.strictEqual(shortcutPrevented, true, 'The browser-level shortcut must be consumed.');

assert.match(html, /id="navSync"[^>]+onclick="openMobileSyncView\(\)"/);
assert.match(html, /<script src="js\/mobile-sync-navigation\.js"><\/script>/);
console.log('Mobile Sync navigation tests passed.');
assert.match(html, /id="navSync"[^>]+hidden[^>]+aria-hidden="true"[^>]+style="display:none"/);
