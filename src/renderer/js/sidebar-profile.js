/** Keeps the sidebar profile label aligned with the active teacher profile. */
(function initSidebarProfile(globalScope) {
  function currentTeacherName() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : null;
    const fromProfile = profileDb && typeof profileDb.teacherName === 'string'
      ? profileDb.teacherName.trim()
      : '';
    const fromInput = document.getElementById('teacherName')?.value?.trim() || '';
    return fromProfile || fromInput || 'User';
  }

  function updateSidebarUserName() {
    const label = document.getElementById('sidebarUserName');
    if (!label) return;
    const name = currentTeacherName();
    label.textContent = name;
    label.title = name;
  }

  function bindTeacherNameInput() {
    const input = document.getElementById('teacherName');
    if (!input || input.dataset.sidebarProfileBound === 'true') return;
    input.dataset.sidebarProfileBound = 'true';
    input.addEventListener('input', updateSidebarUserName);
    input.addEventListener('change', updateSidebarUserName);
  }

  function wrapRender() {
    if (typeof globalScope.render !== 'function' || globalScope.render.sidebarProfileWrapped) return;
    const originalRender = globalScope.render;
    globalScope.render = function renderWithSidebarProfile(...args) {
      const result = originalRender.apply(this, args);
      updateSidebarUserName();
      bindTeacherNameInput();
      return result;
    };
    globalScope.render.sidebarProfileWrapped = true;
  }

  function init() {
    wrapRender();
    updateSidebarUserName();
    bindTeacherNameInput();
  }

  globalScope.updateSidebarUserName = updateSidebarUserName;
  document.addEventListener('DOMContentLoaded', init);
  setTimeout(init, 0);
})(window);
