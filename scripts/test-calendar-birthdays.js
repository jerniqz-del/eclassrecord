const assert=require('assert');
const calendar=require('../src/renderer/js/official-calendar-pack.js');
const db={schoolYear:'2026-2027',assignments:[
  {id:'a',schoolYear:'2026-2027',gradeLevel:'4',section:'A',subject:'Math',learners:[{id:'1',lrn:'123',firstName:'Ana',lastName:'Reyes',birthdate:'2016-02-29',avatar:'girl'}]},
  {id:'b',schoolYear:'2026-2027',gradeLevel:'4',section:'B',subject:'Science',learners:[{id:'2',lrn:'123',firstName:'Ana',lastName:'Reyes',birthdate:'2016-02-29'},{id:'3',firstName:'Ben',lastName:'Cruz',birthdate:'2015-07-10'}]},
  {id:'old',schoolYear:'2025-2026',learners:[{id:'4',birthdate:'2015-08-10'}]}
]};
const all=calendar.virtualBirthdays(db,{assignmentId:'all'});
assert.strictEqual(all.length,2,'same LRN across classes is deduplicated');
const ana=all.find(item=>item.learnerName.includes('Reyes'));
assert.strictEqual(ana.date,'2027-02-28');assert.strictEqual(ana.observed,true);assert.strictEqual(ana.classes.length,2);assert.strictEqual(ana.localOnly,true);assert.strictEqual(ana.syncByDefault,false);assert.strictEqual(ana.exportByDefault,false);
assert.strictEqual(calendar.virtualBirthdays(db,{assignmentId:'a'}).length,1);
assert.strictEqual(calendar.birthdayOccurrence('2016-02-29','2027-2028').date,'2028-02-29');
assert.deepStrictEqual(calendar.exportableEvents([{type:'birthday',virtual:true},{id:'local',type:'reminder'}]),[{id:'local',type:'reminder'}]);
console.log('Birthday school-year/class scoping, LRN deduplication, privacy defaults, age occurrence, and February 29 policy tests passed.');
