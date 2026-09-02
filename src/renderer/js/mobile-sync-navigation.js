(function installMobileSyncNavigation(globalScope) {
  'use strict';

  function viewIncludes(section, view) {
    return String(section?.dataset?.view || '')
      .split(',')
      .map((value) => value.trim())
      .includes(view);
  }

  function activateMobileSyncView() {
    const target = document.querySelector('.view-section[data-view="sync"]');
    if (!target) return false;

    document.querySelectorAll('.view-section').forEach((section) => {
      const active = viewIncludes(section, 'sync');
      section.style.display = active
        ? (section.classList.contains('view-section--flex') ? 'flex' : 'block')
        : 'none';
    });

    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.classList.toggle('nav-btn--active', button.id === 'navSync');
    });

    const state = globalScope.getRuntimeNavigationState?.() || {};
    globalScope.replaceRuntimeNavigationState?.({ ...state, currentView: 'sync' });
    if (globalScope.db && typeof globalScope.db === 'object') globalScope.db.activeView = 'sync';
    return true;
  }

  const baseSetView = globalScope.setView;
  if (typeof baseSetView === 'function') {
    globalScope.setView = function setViewWithMobileSync(view, ...args) {
      let result;
      try {
        result = baseSetView.call(this, view, ...args);
      } finally {
        if (view === 'sync') {
          activateMobileSyncView();
          globalScope.requestAnimationFrame?.(activateMobileSyncView);
          globalScope.setTimeout?.(activateMobileSyncView, 0);
        }
      }
      return result;
    };
  }
  function handleMobileSyncShortcut(event) {
    const key = String(event?.key || '').toLocaleLowerCase();
    const commandKey = event?.ctrlKey === true || event?.metaKey === true;
    if (!commandKey || event?.shiftKey !== true || event?.altKey === true || key !== 'm' || event?.repeat) return;
    event.preventDefault?.();
    globalScope.openMobileSyncView();
  }

  // The sidebar entry is intentionally hidden for now; keep the complete
  // Mobile Sync workspace available through Ctrl/Cmd+Shift+M.
  globalScope.addEventListener?.('keydown', handleMobileSyncShortcut, true);


  globalScope.openMobileSyncView = function openMobileSyncView() {
    if (typeof globalScope.setView === 'function') globalScope.setView('sync');
    else activateMobileSyncView();
  };

  globalScope.MobileSyncNavigation = { activate: activateMobileSyncView, handleShortcut: handleMobileSyncShortcut };
})(window);
