'use strict';

function bringWindowToFront(window) {
  if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) return false;
  if (typeof window.isMinimized === 'function' && window.isMinimized()) window.restore();
  if (typeof window.isVisible === 'function' && !window.isVisible()) window.show();
  if (typeof window.focus === 'function') window.focus();
  if (typeof window.moveTop === 'function') window.moveTop();
  return true;
}

function installSingleInstanceGuard(app, options = {}) {
  const getMainWindow = typeof options.getMainWindow === 'function'
    ? options.getMainWindow
    : () => null;
  let focusPending = false;

  if (options.bypass === true) {
    return { acquired: true, focusIfPending: () => false };
  }

  const acquired = app.requestSingleInstanceLock();
  if (!acquired) {
    app.quit();
    return { acquired: false, focusIfPending: () => false };
  }

  const focusExistingWindow = () => {
    const focused = bringWindowToFront(getMainWindow());
    focusPending = !focused;
    return focused;
  };
  app.on('second-instance', focusExistingWindow);

  return {
    acquired: true,
    focusIfPending() {
      if (!focusPending) return false;
      return focusExistingWindow();
    },
  };
}

module.exports = { bringWindowToFront, installSingleInstanceGuard };
