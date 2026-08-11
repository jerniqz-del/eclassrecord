const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('src/renderer/index.html');
const tools = read('src/renderer/js/teacher-tools.js');
const classroom = read('src/renderer/js/classroom-management-ui.js');
const core = read('src/renderer/js/teacher-tools-core.js');
const participation = read('src/renderer/js/teacher-tools-participation.js');
const experience = read('src/renderer/js/teacher-tools-experiences.js');
const css = read('src/renderer/css/teacher-tools-workspace.css');

['Name Picker','Group Randomizer','Grade Simulator','Games','Activity Timer','Participation Tracker','Noise Meter','Class Duels','Seating Chart','Exit Ticket','Anecdotal Notes','Boat Race']
  .forEach(label => assert(tools.includes(label) || classroom.includes(label), `missing launcher tool ${label}`));
assert(tools.includes('teacher-tools-grid'));
assert(tools.includes('toolUsageCounts'));
assert(core.includes('normalizeToolUsageCounts'));
assert(tools.includes('showInLauncher: false'));
assert(html.indexOf('navAttendance') < html.indexOf('navPerformanceChecklist'));
assert(html.indexOf('navPerformanceChecklist') < html.indexOf('navCalendar'));
assert(html.includes('data-view="performance-checklist"'));
assert(tools.includes('openPerformanceChecklistPage'));
assert(tools.includes('openEditChecklistActivity'));
assert(tools.includes('deleteChecklistActivity'));
assert(classroom.includes('renderMode'));
['memory','reaction','word-scramble'].forEach(game => {
  assert(tools.includes(`games/${game}/index.html`));
  assert(fs.existsSync(path.join(root, `src/renderer/games/${game}/index.html`)));
});
assert(participation.includes('Star leaderboard'));
assert(!participation.includes('Participation standings'));
assert(participation.includes('star-change-up'));
assert(participation.includes('star-change-down'));
['capsule-machine__winner','mystery-deck__winner','galaxy-field__planet-name','game-show-roster'].forEach(selector => assert(experience.includes(selector)));
assert(css.includes('.name-picker-workspace'));
assert(css.includes('.teacher-tool-card'));
assert(!tools.slice(tools.indexOf('function renderLauncher'), tools.indexOf('function showLauncher')).includes('.scores'));
console.log('Teacher Tools launcher, usage counters, dedicated checklist, picker leaderboard, themed reveals, and additional games tests passed.');
