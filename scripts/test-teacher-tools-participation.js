const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/renderer/js/teacher-tools-participation.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/css/teacher-tools-participation.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
['Carnival Prize Wheel','Arcade Capsule Machine','Mystery Card Deck','Galaxy Scanner','Game Show Spotlight','Team Draft Arena','Space Crew Launch','Island Expedition','House Sorting Ceremony','Puzzle Party'].forEach(text => assert(source.includes(text)));
['random','no-repeat','least-stars','no-stars'].forEach(mode => assert(source.includes(mode)));
['Award Star','Undo Last Star','Participation standings','Export CSV','Reset Term Stars'].forEach(text => assert(source.includes(text)));
assert(source.includes('promptPinVerification'));
assert(source.includes("source: 'name-picker'"));
assert(source.includes('attendanceRollCallStatus'));
assert(source.includes('core.activeLearners(assignment())')); // core excludes transferred-out learners
assert(css.includes('prefers-reduced-motion'));
assert(css.includes('data-performance-mode="low"'));
assert(html.includes('css/teacher-tools-participation.css'));
assert(html.includes('js/teacher-tools-participation.js'));
console.log('Teacher Tools themes, picker modes, participation stars, privacy, and accessibility wiring tests passed.');
