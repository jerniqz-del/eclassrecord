const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const OfficialSchoolCalendar = require('../src/renderer/js/official-calendar-pack.js');

const database = {
  schoolYear: '2026-2027',
  teacherName: 'Teacher',
  schoolName: 'Sample School',
  assignments: [],
  calendarEvents: [
    {
      id: 'local-range',
      title: 'Local school event',
      startDate: '2026-08-17',
      endDate: '2026-08-19',
      details: 'Visible on Android',
    },
    {
      id: 'private-birthday',
      title: 'Learner birthday',
      date: '2026-08-18',
      localOnly: true,
      syncByDefault: false,
    },
    {
      id: 'other-school-year',
      title: 'Wrong year',
      date: '2025-08-18',
      schoolYear: '2025-2026',
    },
  ],
};

const window = {
  OfficialSchoolCalendar,
  TeacherToolsCore: {
    normalize: () => ({ calendarPreferences: { filters: { official: true, local: true } } }),
  },
  electronAPI: {},
  addEventListener() {},
};
const document = {
  title: 'E-Class Record v1.9.6',
  getElementById: () => null,
};
const context = {
  window,
  document,
  console,
  setTimeout: () => 0,
  clearTimeout() {},
  getActiveProfileDatabase: () => database,
};

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'js', 'mobile-sync-companion.js'),
  'utf8',
);
vm.runInNewContext(source, context);

const snapshot = window.MobileSyncBridge.buildCompanionSnapshot();
const local = snapshot.calendar.find((event) => event.id === 'local-range');
