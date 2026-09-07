const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const guardPath = path.join(root, 'src', 'main', 'single-instance.js');
const mainPath = path.join(root, 'src', 'main', 'main.js');
const { bringWindowToFront, installSingleInstanceGuard } = require(guardPath);

function createApp(acquired) {
  const app = new EventEmitter();
  app.lockRequests = 0;
  app.quitCalls = 0;
  app.requestSingleInstanceLock = () => {
    app.lockRequests += 1;
    return acquired;
  };
  app.quit = () => { app.quitCalls += 1; };
  return app;
}

function createWindow({ minimized = false, visible = true, destroyed = false } = {}) {
  const calls = [];
  return {
    calls,
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    moveTop: () => calls.push('moveTop'),
  };
}

{
  const app = createApp(false);
  const guard = installSingleInstanceGuard(app);
  assert.strictEqual(guard.acquired, false);
  assert.strictEqual(app.lockRequests, 1);
  assert.strictEqual(app.quitCalls, 1, 'A second app process must quit immediately.');
}

{
  const app = createApp(true);
  const window = createWindow({ minimized: true, visible: false });
  const guard = installSingleInstanceGuard(app, { getMainWindow: () => window });
  app.emit('second-instance');
  assert.deepStrictEqual(window.calls, ['restore', 'show', 'focus', 'moveTop']);
  assert.strictEqual(guard.acquired, true);
}

{
  const app = createApp(true);
  let window = null;
  const guard = installSingleInstanceGuard(app, { getMainWindow: () => window });
  app.emit('second-instance');
  window = createWindow();
  assert.strictEqual(guard.focusIfPending(), true);
  assert.deepStrictEqual(window.calls, ['focus', 'moveTop']);
}

{
  const app = createApp(false);
  const guard = installSingleInstanceGuard(app, { bypass: true });
  assert.strictEqual(guard.acquired, true);
  assert.strictEqual(app.lockRequests, 0, 'Smoke tests must bypass the production lock.');
  assert.strictEqual(app.quitCalls, 0);
}

assert.strictEqual(bringWindowToFront(null), false);
assert.strictEqual(bringWindowToFront(createWindow({ destroyed: true })), false);

const main = fs.readFileSync(mainPath, 'utf8');
assert.match(main, /installSingleInstanceGuard\(app/);
assert.match(main, /bypass:\s*isSmokeTest/);
assert.match(main, /if \(!singleInstanceGuard\.acquired\) return/);
assert.match(main, /singleInstanceGuard\.focusIfPending\(\)/);

console.log('Desktop single-instance lock, foreground restoration, and smoke-test isolation tests passed.');
