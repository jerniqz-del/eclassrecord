const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/teacher-tools-animation-engine.js'), 'utf8');
let frames = [];
let reduced = false;
const root = {
  state: '',
  setAttribute(name, value) { if (name === 'data-animation-state') this.state = value; },
  removeAttribute(name) { if (name === 'data-animation-state') this.state = ''; }
};
const window = {
  document: null,
  matchMedia: () => ({ matches: reduced }),
  requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
  cancelAnimationFrame: () => {}
};
const document = {
  documentElement: { dataset: {} },
  body: { classList: { contains: () => false } }
};
window.document = document;
vm.runInNewContext(source, { window, document });
const engine = window.TeacherToolsAnimationEngine;

assert.strictEqual(engine.duration(1000, 'relaxed'), 1300);
assert.strictEqual(engine.duration(1000, 'normal'), 1000);
assert.strictEqual(engine.duration(1000, 'quick'), 680);

let finished = 0;
let progress = [];
engine.start({ id: 'normal', root, duration: 120, onFrame: value => progress.push(value), onFinish: () => finished++ });
assert.strictEqual(root.state, 'running');
frames.shift()(0);
frames.shift()(60);
frames.shift()(120);
assert.strictEqual(finished, 1);
assert.strictEqual(progress.at(-1), 1);
assert.strictEqual(root.state, '');

let skipped = null;
engine.start({ id: 'skip', duration: 1000, onFinish: result => { skipped = result.skipped; } });
assert.strictEqual(engine.finish('skip'), true);
assert.strictEqual(skipped, true);
assert.strictEqual(engine.finish('skip'), false);

let cancelled = 0;
engine.start({ id: 'cancel', duration: 1000, onCancel: () => cancelled++ });
assert.strictEqual(engine.cancel('cancel'), true);
assert.strictEqual(cancelled, 1);
assert.strictEqual(engine.running('cancel'), false);

reduced = true;
let reducedFinished = 0;
engine.start({ id: 'reduced', duration: 1000, onFinish: () => reducedFinished++ });
assert.strictEqual(reducedFinished, 1);
assert.strictEqual(engine.running('reduced'), false);

console.log('Teacher Tools animation lifecycle, speed, reveal, cancellation, and reduced-motion tests passed.');
