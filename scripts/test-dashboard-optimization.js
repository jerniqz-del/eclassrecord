const assert = require('assert');
const path = require('path');
const dashboard = require(path.resolve(__dirname, '../src/renderer/js/dashboard-workplace.js'));

const db = { schoolYear:'2026-2027', currentAssignmentId:'selected', currentTerm:'1', assignments:[
  { id:'other', schoolYear:'2026-2027', gradeLevel:'6', section:'B', subject:'Science', learners:[{id:'o1'}], assessments:[{id:'o-a',title:'Other Quiz',term:'1',date:'2026-08-01',component:'WW',maxScore:''}], scores:{} },
  { id:'selected', schoolYear:'2026-2027', gradeLevel:'6', section:'A', subject:'Math', learners:[{id:'l1'},{id:'l2'}], assessments:[
    {id:'a1',title:'Quiz 1',term:'1',date:'2026-08-01',component:'WW',maxScore:10},
    {id:'a2',title:'Quiz 2',term:'1',date:'2026-08-01',component:'WW',maxScore:''},
    {id:'a3',title:'Task',term:'1',date:'2026-08-14',component:'PT',maxScore:20}
  ], scores:{'l1|a1':11,'l2|a1':5} }
] };
const snapshot = dashboard.snapshot(db, { now:new Date(2026,7,11) });
assert.strictEqual(snapshot.analytics.assessments, 3, 'assessment mix defaults to selected class');
assert.strictEqual(snapshot.analytics.mix.written, 2);
assert.strictEqual(snapshot.analytics.mix.performance, 1);
assert.strictEqual(snapshot.analytics.missingHps, 1);
assert(snapshot.analytics.emptyCategories.includes('Quarterly/Other'));
assert.strictEqual(snapshot.attention[0].assignmentId, 'selected', 'selected class appears first');
assert.strictEqual(snapshot.attention[0].type, 'invalid-scores');
assert(snapshot.attention.find(item => item.type === 'missing-hps' && item.assignmentId === 'selected'));
assert(snapshot.attention.find(item => item.type === 'incomplete-scores')?.count >= 2);
assert(snapshot.attention.find(item => item.type === 'upcoming-deadline')?.dismissible);
db.workplace.preferences.analyticsScope = 'all';
const all = dashboard.snapshot(db, { now:new Date(2026,7,11) });
assert.strictEqual(all.analytics.assessments, 4);
assert.strictEqual(all.attention.filter(item => item.type === 'missing-hps').length, 2, 'issues are combined per class, not duplicated per assessment');

const empty = dashboard.snapshot({ schoolYear:'2026-2027', assignments:[] });
assert.strictEqual(empty.analytics.assessments, 0);
assert.deepStrictEqual(empty.attention, []);

const manyAssignments = Array.from({length:40}, (_,index) => ({ id:'c'+index, schoolYear:'2026-2027', learners:[{id:'l'}], assessments:Array.from({length:20},(__,a)=>({id:`a${a}`,term:'1',date:'2026-01-01',maxScore:10,component:'WW'})), scores:{} }));
assert(dashboard.snapshot({schoolYear:'2026-2027',assignments:manyAssignments},{now:new Date(2026,7,11)}).attention.length <= 40, 'large datasets are deduplicated by class and issue type');
console.log('Dashboard priority, deduplication, class/term scope, empty, and large-dataset tests passed.');
