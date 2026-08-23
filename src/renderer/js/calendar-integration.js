(function initCalendarIntegration(globalScope) {
  'use strict';

  const baseSetView = globalScope.setView;
  let seededProfileDatabase = null;

  function updateCalendarHeader() {
    const title = document.getElementById('currentTitle');
    if (title) title.textContent = 'School Calendar';
    const school = document.getElementById('headerSchoolName');
    if (school) school.textContent = db.schoolName || 'School calendar';
  }

  function configureCalendarSync() {
    const offline = document.getElementById('calendarSyncOffline');
    if (offline) {
      offline.hidden = false;
      offline.textContent = 'Local calendar active';
    }
  }

  function renderCalendarPage() {
    if (typeof db !== 'object' || !db) return;
    if (seededProfileDatabase !== db) {
      if (typeof seedCalendarEvents === 'function') seedCalendarEvents();
      seededProfileDatabase = db;
    }
    configureCalendarSync();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof updateSyncTimestamp === 'function') updateSyncTimestamp();
    if (typeof checkTodayCalendarNotifications === 'function') checkTodayCalendarNotifications();
  }

  globalScope.openCalendarView = function openCalendarView() {
    globalScope.setView('calendar');
  };

  globalScope.openCalendarDate = function openCalendarDate(date) {
    const normalized = String(date || '').match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
    globalScope.setView('calendar');
    if (!normalized) return;
    requestAnimationFrame(() => {
      if (typeof globalScope.openCalendarDayModal === 'function') globalScope.openCalendarDayModal(normalized);
    });
  };

  globalScope.setView = function setViewWithCalendar(view) {
    baseSetView(view);
    const isCalendar = view === 'calendar';
    document.getElementById('navCalendar')?.classList.toggle('nav-btn--active', isCalendar);
    if (!isCalendar) return;
    updateCalendarHeader();
    requestAnimationFrame(renderCalendarPage);
  };

  globalScope.refreshCalendarView = renderCalendarPage;
})(window);
