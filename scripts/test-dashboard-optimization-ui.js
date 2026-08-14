const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../src/renderer');
const ui=fs.readFileSync(path.join(root,'js/dashboard-optimization-ui.js'),'utf8');
['Overall class performance','Written Works','Performance Tasks','SA&TE','earned points against HPS','ST1 30% + ST2 30% + TE 40%','Class achievement','Entry completion','No assessments with HPS'].forEach(text=>assert(ui.includes(text)));
assert(!ui.includes("h4>Assessment mix"), 'Assessment Mix card has been replaced.');
['slice(0,5)','Set HPS','Continue Grading','Review Conflict','Snooze','Dismiss'].forEach(text=>assert(ui.includes(text)));
assert(ui.includes('if(!item?.dismissible)return'), 'integrity warnings cannot be dismissed');
assert(ui.includes('scrollTop'), 'dashboard controls preserve scroll position');
console.log('Dashboard class-performance graph, attention filters/actions, dismissibility, and scroll-stability UI tests passed.');

assert(ui.includes('missing scores contribute zero until entered'));
assert(ui.includes('workplace-component-metric--completion'));

assert(!ui.includes('aria-label="Class performance term"'), 'Term selector belongs in the dashboard title card.');

assert(ui.includes('String(item.term)!==String(data.currentTerm)'), 'Needs Attention must follow the active term.');
assert(ui.includes('workplace-panel__scope'));
assert(ui.includes('${termAttention.length}'));
assert(ui.includes('caught up for Term ${data.currentTerm}'));
