'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const packs = require('../src/renderer/js/official-ecr-packs');
const exporter = require('../src/main/official-ecr-exporter');
const calendar = require('../src/renderer/js/official-calendar-pack');

const context = {
  console,
  Math,
  Date,
  Intl,
  db: { schoolYear: '2026-2027' }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-catalog.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-engine.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-form-export.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer/js/pace-sf9.js'), 'utf8'), context);

function homeroom(overrides) {
  return {
    id: 'g1-home',
    gradeLevel: '1',
    section: 'Rizal',
    subject: 'Grade 1',
    paceHomeroom: true,
    schoolYear: '2026-2027',
    learners: [
      {
        id: 'm1',
        lastName: 'Santos',
        firstName: 'Juan',
        sex: 'M',
        lrn: '123456789012',
        birthdate: '2019-05-05'
      },
      {
        id: 'f1',
        lastName: 'Reyes',
        firstName: 'Ana',
        sex: 'F',
        lrn: '123456789013',
        birthdate: '2018-11-20'
      }
    ],
    attendanceSessions: [],
    supportRecords: [],
    ...overrides
  };
}

const events = calendar.officialEvents();
assert.ok(events.some(item => item.type === 'term' && String(item.startDate) === '2026-06-08'));
assert.ok(events.some(item => item.type === 'report-card' && String(item.startDate) === '2027-04-08'));

assert.strictEqual(context.paceCompetenciesFor('Arts and Physical Education', 1).length, 1, 'APE stays one placeholder competency');
assert.strictEqual(context.paceCompetenciesFor('Arts and Physical Education', 2).length, 1);
assert.strictEqual(context.paceCompetenciesFor('Arts and Physical Education', 3).length, 1);

const readingFirst = context.paceCompetenciesFor('Reading and Literacy', 1)[0];
assert.strictEqual(context.paceCellSkills(readingFirst).join(','), '', 'single-letter default ignores catalog L/S/R/C');
assert.strictEqual(context.paceExpectedCellCount('Reading and Literacy', 1), 35);

const legacy = homeroom();
context.paceSetRating(legacy, 'm1', 'rl-01', '1', '', 'B');
const keysBefore = Object.keys(legacy.pace.ratings).sort().join('|');
assert.strictEqual(legacy.pace.skillRatingMode, 'single-letter');
assert.strictEqual(context.paceGetRating(legacy, 'm1', 'rl-01', '1', ''), 'B');
assert.strictEqual(context.paceGetRating(legacy, 'm1', 'rl-01', '1', 'listen'), 'B', 'L/S/R/C reads fall back to the one stored letter');
assert.strictEqual(context.paceGetRating(legacy, 'm1', 'rl-01', '1', 'speak'), 'B');
assert.strictEqual(Object.keys(legacy.pace.ratings).sort().join('|'), keysBefore, 'fallback must not rewrite stored keys');
assert.ok(!context.paceUsesPerSkillRating(legacy));

const perSkill = homeroom();
context.paceEnsureStore(perSkill).skillRatingMode = 'per-skill';
assert.ok(context.paceUsesPerSkillRating(perSkill));
assert.strictEqual(context.paceCellSkills(readingFirst, perSkill).join(','), 'listen,speak');
assert.strictEqual(context.paceCellSkills(readingFirst).join(','), '', 'catalog counts stay one cell without opt-in');
context.paceSetRating(perSkill, 'm1', 'rl-01', '1', 'listen', 'A');
context.paceSetRating(perSkill, 'm1', 'rl-01', '1', 'speak', 'C');
assert.strictEqual(context.paceGetRating(perSkill, 'm1', 'rl-01', '1', 'listen'), 'A');
assert.strictEqual(context.paceGetRating(perSkill, 'm1', 'rl-01', '1', 'speak'), 'C');
assert.notStrictEqual(context.paceGetRating(perSkill, 'm1', 'rl-01', '1', 'listen'), context.paceGetRating(perSkill, 'm1', 'rl-01', '1', 'speak'));

const lettered = context.paceCompetenciesFor('Reading and Literacy', 1).find(item => item.number === 20);
assert.strictEqual(context.paceCellSkills(lettered, perSkill).join(','), 'a,b,c,d,e,f,g', 'lettered parts stay a/b/c even in per-skill mode');

const split = context.splitPaceRemarks('Reads rhymes on her own.\nDapat Linangin: Blend beginning sounds.');
assert.strictEqual(split.canDo, 'Reads rhymes on her own.');
assert.strictEqual(split.toImprove, 'Blend beginning sounds.');
const unsplit = context.splitPaceRemarks('Participates in chants.');
assert.strictEqual(unsplit.canDo, 'Participates in chants.');
assert.strictEqual(unsplit.toImprove, '');

context.paceSetNarrative(legacy, 'm1', '1', 'Joins rhymes. Dapat Linangin: Isolate ending sounds.', 'Reading and Literacy');
const fromRemarks = context.paceTermSummary(legacy, 'm1', '1');
assert.match(fromRemarks.canDo, /Joins rhymes/);
assert.match(fromRemarks.toImprove, /Isolate ending sounds/);
context.paceSetTermSummary(legacy, 'm1', '1', 'Mga nagagawa sample', 'Needs blending');
const explicit = context.paceTermSummary(legacy, 'm1', '1');
assert.strictEqual(explicit.canDo, 'Mga nagagawa sample');
assert.strictEqual(explicit.toImprove, 'Needs blending');
assert.match(legacy.pace.narratives[Object.keys(legacy.pace.narratives)[0]], /Joins rhymes/, 'existing remarks stay when summaries are added');

const anchors = context.paceSchoolYearAnchorDates(events);
assert.strictEqual(anchors.beginning, '2026-06-08');
assert.strictEqual(anchors.end, '2027-04-08');
const bosy = context.paceAgeAtDate('2019-05-05', anchors.beginning);
assert.strictEqual(Number(bosy.years), 7);
assert.strictEqual(Number(bosy.months), 1);
const eosy = context.paceAgeAtDate('2019-05-05', anchors.end);
assert.strictEqual(Number(eosy.years), 7);
assert.strictEqual(Number(eosy.months), 11);

const attended = homeroom({
  attendanceSessions: [
    { date: '2026-06-10', term: '1' },
    { date: '2026-06-11', term: '1' },
    { date: '2026-09-10', term: '1' },
    { date: '2026-09-20', term: '2' },
    { date: '2026-10-05', term: '2' }
  ],
  supportRecords: [
    { category: 'attendance', type: 'absence', learnerId: 'm1', date: '2026-09-10', term: '1' }
  ]
});
const months = context.paceSf9AttendanceByMonth(attended, 'm1', events);
const june = months.find(item => item.key === 'june');
const sep1 = months.find(item => item.key === 'septemberT1');
const sep2 = months.find(item => item.key === 'septemberT2');
const oct = months.find(item => item.key === 'october');
assert.strictEqual(june.classDays, 2);
assert.strictEqual(june.present, 2);
assert.strictEqual(sep1.classDays, 1);
assert.strictEqual(sep1.present, 0);
assert.strictEqual(sep1.absent, 1);
assert.strictEqual(sep2.classDays, 1);
assert.strictEqual(sep2.present, 1);
assert.strictEqual(oct.classDays, 1);
assert.ok(months.some(item => item.label === 'September' && item.term === '1'));
assert.ok(months.some(item => item.label === 'September' && item.term === '2'));

const sf9 = context.paceSf9CardMarkup({
  school: { schoolName: 'Sample Elementary School', schoolYear: '2026-2027', region: 'V', teacherName: 'Maria Teacher' },
  assignment: attended,
  learner: attended.learners[0],
  events
});
assert.match(sf9, /LEARNER'S PROGRESS REPORT CARD|Learner’s Progress Report Card/i);
assert.match(sf9, /Mga Nagagawa/);
assert.match(sf9, /Dapat Linangin/);
assert.match(sf9, /Naipamamalas/);
assert.match(sf9, /Nagpapaunlad/);
assert.match(sf9, /CERTIFICATE OF TRANSFER|Certificate of Transfer/i);
assert.match(sf9, /June/);
assert.match(sf9, /September/);
assert.match(sf9, /Juan|Santos/);
assert.match(sf9, /123456789012/);
assert.match(sf9, /7/);
assert.doesNotMatch(sf9, /Written Work|Performance Task|Initial Grade/);

const singleValues = context.paceFormReplacements(legacy, legacy.learners[0], { schoolName: 'Sample', schoolId: '123456' }, '1');
assert.strictEqual(singleValues['001'], 'B');
assert.strictEqual(singleValues['002'], 'B');

const perValues = context.paceFormReplacements(perSkill, perSkill.learners[0], { schoolName: 'Sample', schoolId: '123456' }, '1');
assert.strictEqual(perValues['001'], 'A');
assert.strictEqual(perValues['002'], 'C');

const threeTerm = context.paceFormPreviewMarkup(legacy, legacy.learners[0], { schoolName: 'Sample Elementary School', schoolId: '123456' });
assert.match(threeTerm, /TERM 1/i);
assert.match(threeTerm, /TERM 2/i);
assert.match(threeTerm, /TERM 3/i);
assert.match(threeTerm, /READING AND LITERACY/i);

const officialForm = require('../src/main/official-pace-form-preview');
const layout = officialForm.getOfficialPaceFormLayout();
assert.ok(layout.ratingCells.length >= 500, 'official PACE sheet rating cells must come from the template');
const chantCell = layout.ratingCells.find(cell => cell.competencyId === 'rl-01' && String(cell.term) === '1');
assert.ok(chantCell, 'Chant rhymes T1 must map to rl-01');
const mathCell = layout.ratingCells.find(cell => cell.competencyId === 'ma-t1-01' && String(cell.term) === '1');
assert.ok(mathCell, 'Count up to 100 must map to the Term 1 math competency');
const gmrcCell = layout.ratingCells.find(cell => cell.competencyId === 'gm-t1-01' && String(cell.term) === '1');
assert.ok(gmrcCell, 'GMRC Term 1 first value must map by number and term');
const mapped = layout.ratingCells.filter(cell => cell.competencyId).length;
assert.ok(mapped / layout.ratingCells.length >= 0.9, `most official rating cells must map to the catalog (${mapped}/${layout.ratingCells.length})`);

const filledOfficial = officialForm.renderOfficialPaceFormHtml(layout, {
  lrn: '123456789012',
  name: 'Santos, Juan',
  section: 'Rizal',
  school: 'Sample Elementary School',
  schoolID: '123456',
  letters: { [chantCell.addr]: 'B' }
});
assert.match(filledOfficial, /PERFORMANCE AND COMPETENCY EVALUATION \(PACE\) FORM/);
assert.match(filledOfficial, /Chant rhymes/);
assert.match(filledOfficial, /READING AND LITERACY/);
assert.match(filledOfficial, /LANGUAGE/);
assert.match(filledOfficial, /MATHEMATICS/);
assert.match(filledOfficial, /GOOD MANNERS AND RIGHT CONDUCT/);
assert.match(filledOfficial, /MAKABANSA/);
assert.match(filledOfficial, />B</);
assert.match(filledOfficial, /Santos, Juan/);
assert.match(filledOfficial, /123456789012/);
assert.match(filledOfficial, /Rizal/);
assert.match(filledOfficial, /Sample Elementary School/);
assert.match(filledOfficial, /data-pace-kind="school"/);
assert.doesNotMatch(filledOfficial, /1234566776/);
assert.doesNotMatch(filledOfficial, />sample</i);
assert.match(filledOfficial, /data-pace-kind="rating"/);
assert.match(filledOfficial, /official-pace-form/);

const grade1Pack = packs.officialEcrPackForAssignment(homeroom());
assert.strictEqual(grade1Pack.id, 'grade1');
assert.strictEqual(grade1Pack.available, true);
assert.doesNotMatch(String(grade1Pack.warning || ''), /Phase E/);

const kinderPack = packs.officialEcrPackForAssignment({ gradeLevel: 'Kindergarten', subject: 'Kindergarten' });
assert.strictEqual(kinderPack.id, 'kinder');

const packFile = path.join(root, 'src', 'assets', 'official-ecr', 'grade1-pace-sf9.xlsx');
assert.ok(fs.existsSync(packFile), 'Grade 1 official pack template must ship in Phase E');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k10-phase-e-'));
const outPath = path.join(tmp, 'grade1.xlsx');
const payload = {
  packId: 'grade1',
  school: {
    schoolName: 'Sample Elementary School',
    schoolId: '123456',
    region: 'V',
    division: 'Sorsogon',
    schoolYear: '2026-2027',
    teacherName: 'Maria Teacher',
    schoolHead: 'Pedro Head'
  },
  assignment: {
    gradeLevel: '1',
    section: 'Rizal',
    subject: 'Grade 1'
  },
  males: [{
    name: 'Santos, Juan',
    lrn: '123456789012',
    sex: 'M',
    birthdate: '2019-05-05',
    summaries: {
      1: { canDo: 'Chants rhymes.', toImprove: 'Blend sounds.' }
    },
    attendancePresent: { june: 18, septemberT1: 8, septemberT2: 7 }
  }],
  females: [{
    name: 'Reyes, Ana',
    lrn: '123456789013',
    sex: 'F',
    birthdate: '2018-11-20',
    summaries: {
      1: { canDo: 'Greets peers.', toImprove: 'Ask questions.' }
    },
    attendancePresent: { june: 19 }
  }],
  attendanceClassDays: {
    june: 20,
    july: 0,
    august: 0,
    septemberT1: 10,
    septemberT2: 8,
    october: 0,
    november: 0,
    december: 0,
    january: 0,
    february: 0,
    march: 0,
    april: 0
  }
};
exporter.generateOfficialExcel(outPath, payload);
const wb = XLSX.readFile(outPath, { cellFormula: true });
assert.ok(wb.SheetNames.includes('INPUT DATA'));
assert.ok(wb.SheetNames.includes('SF9 - GRADE 1'));
assert.ok(wb.SheetNames.includes('TERM 1 SUMMARY'));
assert.ok(wb.SheetNames.includes('PACE - GRADE 1'));
assert.ok(wb.SheetNames.includes('G1 - ATTENDANCE SUMMARY'));

function cellValue(sheet, addr) {
  const cell = sheet[addr];
  if (!cell || cell.v == null) return '';
  return cell.v;
}

const input = wb.Sheets['INPUT DATA'];
assert.strictEqual(cellValue(input, 'F10'), 'V');
assert.strictEqual(String(cellValue(input, 'F15')), '123456');
assert.strictEqual(cellValue(input, 'F16'), 'Sample Elementary School');
assert.strictEqual(cellValue(input, 'F18'), '2026-2027');
assert.strictEqual(cellValue(input, 'F26'), 'Maria Teacher');
assert.strictEqual(String(cellValue(input, 'F27')), '1');
assert.strictEqual(cellValue(input, 'F28'), 'Rizal');
assert.strictEqual(cellValue(input, 'L11'), 'Santos, Juan');
assert.strictEqual(String(cellValue(input, 'M11')), '123456789012');
assert.ok(cellValue(input, 'N11') === '2019-05-05' || Number(cellValue(input, 'N11')) === 43590);
assert.strictEqual(cellValue(input, 'Q11'), 'Reyes, Ana');
assert.strictEqual(String(cellValue(input, 'R11')), '123456789013');
assert.doesNotMatch(String(cellValue(input, 'B37') || ''), /password123/i);

const summary = wb.Sheets['TERM 1 SUMMARY'];
assert.ok(summary.C14 && summary.C14.f, 'TERM SUMMARY name formulas must stay');
assert.match(String(cellValue(summary, 'N14')), /Chants rhymes/);
assert.match(String(cellValue(summary, 'Q14')), /Blend sounds/);
assert.match(String(cellValue(summary, 'N65')), /Greets peers/);
assert.match(String(cellValue(summary, 'Q65')), /Ask questions/);

const attendance = wb.Sheets['G1 - ATTENDANCE SUMMARY'];
assert.strictEqual(Number(cellValue(attendance, 'F116')), 20);
assert.strictEqual(Number(cellValue(attendance, 'I116')), 10);
assert.strictEqual(Number(cellValue(attendance, 'J116')), 8);
assert.strictEqual(Number(cellValue(attendance, 'F13')), 18);

const sf9Sheet = wb.Sheets['SF9 - GRADE 1'];
assert.ok(sf9Sheet.E23 && sf9Sheet.E23.f, 'SF9 narrative formulas must stay');
assert.match(String(sf9Sheet.M50 && sf9Sheet.M50.v || ''), /Naipamamalas/);

console.log('k10 phase E tests passed');
