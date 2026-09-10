'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const rendererJs = path.join(root, 'src', 'renderer', 'js');
const runtimeSource = fs.readFileSync(path.join(rendererJs, 'legacy-markup-runtime.js'), 'utf8');
const excusedSource = fs.readFileSync(path.join(rendererJs, 'attendance-excused.js'), 'utf8');
const trackerSource = fs.readFileSync(path.join(rendererJs, 'support-tracker.js'), 'utf8');

assert.match(
  trackerSource,
  /onclick=/,
  'compressed attendance tracker still emits inline onclick handlers'
);
assert.match(
  runtimeSource,
  /function migrateInlineHandlers/,
  'legacy markup runtime must migrate compressed-module onclick handlers'
);
assert.match(
  runtimeSource,
  /migrateInlineHandlers\(/,
  'inline handler migration must run on inserted Attendance markup'
);
assert.match(
  excusedSource,
  /existing\.outerHTML\s*=\s*html/,
  'roll-call date carousel must re-render so date clicks update the selected day'
);

class FakeElement {
  constructor(attrs = {}) {
    this.nodeType = 1;
    this.attrs = { ...attrs };
    this.children = [];
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  getAttribute(name) {
    return this.hasAttribute(name) ? this.attrs[name] : null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  querySelectorAll(selector) {
    const match = /^\[(on[a-z]+)\]$/i.exec(selector);
    const out = [];
    const walk = (node) => {
      if (match && node.hasAttribute(match[1])) out.push(node);
      (node.children || []).forEach(walk);
    };
    this.children.forEach(walk);
    return out;
  }
}

function loadRuntime() {
  const documentElement = new FakeElement();
  const document = {
    readyState: 'complete',
    documentElement,
    styleSheets: [],
    addEventListener() {},
    querySelectorAll() {
      return [];
    }
  };
  function MutationObserver() {}
  MutationObserver.prototype.observe = function observe() {};
  const context = {
    window: null,
    document,
    MutationObserver,
    Element: FakeElement,
    Node: { ELEMENT_NODE: 1 },
    console
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${runtimeSource}\nthis.exported = window.LegacyMarkupRuntime;`, context);
  return context.exported;
}

const runtime = loadRuntime();
assert.equal(typeof runtime.migrateInlineHandlers, 'function');

const button = new FakeElement({
  onclick: "showAttendanceRollCallModal('2026-09-10')",
  onkeydown: "openAttendanceRollCallFromHeaderKey(event, '2026-09-10')"
});
const rootEl = new FakeElement();
rootEl.children.push(button);
runtime.migrateInlineHandlers(rootEl);

assert.strictEqual(button.getAttribute('onclick'), null);
assert.strictEqual(button.getAttribute('onkeydown'), null);
assert.strictEqual(
  button.getAttribute('data-eclass-onclick'),
  "showAttendanceRollCallModal('2026-09-10')"
);
assert.strictEqual(
  button.getAttribute('data-eclass-onkeydown'),
  "openAttendanceRollCallFromHeaderKey(event, '2026-09-10')"
);

console.log('Attendance roll-call date and CSP handler migration tests passed.');
