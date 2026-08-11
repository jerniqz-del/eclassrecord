const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('src/renderer/index.html');
const css = read('src/renderer/css/teacher-tools-polish.css');
const polish = read('src/renderer/js/teacher-tools-polish.js');
const tools = read('src/renderer/js/teacher-tools.js');

['timer','participation','noise','duels','seating','exit','notes','race','simulator','games','picker','groups']
  .forEach(id => assert(css.includes(`data-active-tool="${id}"`) || ['picker','groups'].includes(id)));
['classroom-timer','participation-card','noise-meter','seat-card','exit-ticket-grid','anecdotal-list','boat-track','duel-stage','game-frame','simulator-overview','checklist-summary']
  .forEach(selector => assert(css.includes(selector), `missing polish for ${selector}`));
assert(css.includes('prefers-reduced-motion'));
assert(css.includes('data-performance-mode="low"'));
assert(css.includes('data-motion-style="calm"'));
assert(css.includes('data-motion-style="playful"'));
assert(polish.includes('MutationObserver'));
assert(polish.includes('tool-button-ripple'));
assert(polish.includes('pointermove'));
assert(tools.includes('workspaceMotionStyle'));
assert(tools.includes('setWorkspaceMotionStyle'));
assert(html.includes('teacher-tools-polish.css'));
assert(html.includes('teacher-tools-polish.js'));
assert(!polish.includes('.scores'));
console.log('Teacher Tools shared visual system, micro-interactions, motion levels, reduced-motion, and Low-Spec tests passed.');
