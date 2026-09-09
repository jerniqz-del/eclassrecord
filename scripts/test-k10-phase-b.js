'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const packs = require('../src/renderer/js/official-ecr-packs');
const exporter = require('../src/main/official-ecr-exporter');
const genericExporter = require('../src/main/excel-exporter');

function assignment(overrides) {
  return {
    gradeLevel: '8',
    section: 'Rizal',
    subject: 'English',
    scoringModel: 'pooled-ww-pt',
    tleMode: 'single',
    policy: 'DO15_TRANSITION',
    learners: [
      { id: 'm1', lastName: 'Santos', firstName: 'Juan', sex: 'M', lrn: '123456789012' },
      { id: 'f1', lastName: 'Reyes', firstName: 'Ana', sex: 'F', lrn: '123456789013' }
    ],
    ...overrides
  };
}

function school(overrides) {
  return {
    schoolName: 'Sample Elementary School',
    schoolId: '123456',
    region: 'V',
    division: 'Sorsogon',
    schoolYear: '2026-2027',
    teacherName: 'Maria Teacher',
    schoolHead: 'Pedro Head',
    ...overrides
  };
}

assert.strictEqual(packs.officialEcrPackForAssignment(assignment()).id, 'academic');
assert.strictEqual(packs.officialEcrPackForAssignment(assignment()).available, true);

const gmrcDomains = assignment({
  subject: 'Values Education',
  scoringModel: 'gmrc-domains-2026'
});
assert.strictEqual(packs.officialEcrPackForAssignment(gmrcDomains).id, 'gmrc');
assert.strictEqual(packs.officialEcrPackForAssignment(gmrcDomains).available, true);

const gmrcPooled = assignment({
  subject: 'Good Manners and Right Conduct (GMRC)',
  scoringModel: 'pooled-ww-pt'
});
const gmrcPooledPack = packs.officialEcrPackForAssignment(gmrcPooled);
assert.strictEqual(gmrcPooledPack.id, 'gmrc');
assert.strictEqual(gmrcPooledPack.available, true);
assert.match(String(gmrcPooledPack.warning || ''), /pooled/i);
assert.strictEqual(gmrcPooled.scoringModel, 'pooled-ww-pt', 'pack selection must not switch existing GMRC scoring');

assert.strictEqual(packs.officialEcrPackForAssignment(assignment({ subject: 'MAPEH' })).id, 'mapeh');
assert.strictEqual(packs.officialEcrPackForAssignment(assignment({
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'single'
})).id, 'tle-single');

const tleComponent = packs.officialEcrPackForAssignment(assignment({
  subject: 'Technology and Livelihood Education (TLE)',
  tleMode: 'per-component'
}));
assert.strictEqual(tleComponent.id, 'tle-component');
assert.strictEqual(tleComponent.available, true);

const grade1 = packs.officialEcrPackForAssignment(assignment({ gradeLevel: '1', subject: 'Mathematics' }));
assert.strictEqual(grade1.id, 'grade1');
assert.strictEqual(grade1.available, true);

const kinder = packs.officialEcrPackForAssignment(assignment({ gradeLevel: 'Kindergarten', subject: 'Kindergarten' }));
assert.strictEqual(kinder.id, 'kinder');
assert.strictEqual(kinder.available, true);

assert.strictEqual(
  packs.officialEcrPackForAssignment(assignment({ subject: 'Edukasyong Pantahanan at Pangkabuhayan (EPP)' })).id,
  'tle-single'
);

const missing = packs.officialEcrExportReadiness(school({ schoolId: '', region: '' }), assignment({
  learners: [
    { id: 'm1', lastName: 'Santos', firstName: 'Juan', sex: '', lrn: '' },
    { id: 'f1', lastName: 'Reyes', firstName: 'Ana', sex: 'F', lrn: '123456789013' }
  ]
}));
const byField = Object.fromEntries(missing.items.map(item => [item.field, item]));
assert.strictEqual(byField.schoolId.ok, false);
assert.strictEqual(byField.region.ok, false);
assert.strictEqual(byField.sex.ok, false);
assert.strictEqual(byField.lrn.ok, false);
assert.ok(missing.ready === false);
assert.ok(missing.emptyOfficialCells.some(cell => /School ID/i.test(cell.label)));

const ready = packs.officialEcrExportReadiness(school(), assignment());
assert.strictEqual(ready.items.every(item => item.ok), true);
assert.strictEqual(ready.ready, true);

assert.strictEqual(packs.officialFinalGrade(90, 80, ''), '');
assert.strictEqual(packs.officialFinalGrade(90, 80, 70), 80);
assert.strictEqual(packs.officialFinalGrade('90', '91', '92'), 91);

const packDir = path.join(root, 'src', 'assets', 'official-ecr');
assert.ok(fs.existsSync(path.join(packDir, 'academic-2-10.xlsx')));
assert.ok(fs.existsSync(path.join(packDir, 'gmrc-values.xlsx')));
assert.ok(fs.existsSync(path.join(packDir, 'mapeh.xlsx')));
assert.ok(fs.existsSync(path.join(packDir, 'epp-tle-single.xlsx')));
assert.ok(fs.existsSync(path.join(packDir, 'grade1-pace-sf9.xlsx')), 'Grade 1 pack ships in Phase E');
assert.ok(fs.existsSync(path.join(packDir, 'kinder-sf9.xlsx')), 'Kinder pack ships in Phase F');

function cellValue(sheet, addr) {
  const cell = sheet[addr];
  if (!cell) return '';
  if (cell.v == null) return '';
  return cell.v;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k10-phase-b-'));

const academicPayload = {
  packId: 'academic',
  school: school(),
  assignment: assignment(),
  males: [{
    name: 'Santos, Juan',
    lrn: '123456789012',
    sex: 'M',
    terms: {
      1: { ww: [10, 10, 10, 10, 10], pt: [20, 20, 20], sa1: 30, sa2: 30, te: 40 }
    }
  }],
  females: [{
    name: 'Reyes, Ana',
    lrn: '123456789013',
    sex: 'F',
    terms: {
      1: { ww: [8, 8, 8, 8, 8], pt: [16, 16, 16], sa1: 24, sa2: 24, te: 32 }
    }
  }],
  terms: {
    1: { wwHps: [10, 10, 10, 10, 10], ptHps: [20, 20, 20], sa1Hps: 30, sa2Hps: 30, teHps: 40 }
  }
};

const academicPath = path.join(tmp, 'academic.xlsx');
exporter.generateOfficialExcel(academicPath, academicPayload);
const academicWb = XLSX.readFile(academicPath);
assert.deepStrictEqual(
  academicWb.SheetNames.filter(name => ['INPUT DATA', 'TERM 1', 'TERM 2', 'TERM 3', 'FINAL GRADES'].includes(name)).sort(),
  ['FINAL GRADES', 'INPUT DATA', 'TERM 1', 'TERM 2', 'TERM 3'].sort()
);
const academicInput = academicWb.Sheets['INPUT DATA'];
assert.strictEqual(cellValue(academicInput, 'E10'), 'V');
assert.strictEqual(cellValue(academicInput, 'E13'), '123456');
assert.strictEqual(cellValue(academicInput, 'E24'), 'English');
assert.strictEqual(cellValue(academicInput, 'K11'), 'Santos, Juan');
assert.strictEqual(cellValue(academicInput, 'N11'), 'Reyes, Ana');
assert.doesNotMatch(String(cellValue(academicInput, 'B36') || ''), /password123/i);

const academicTerm = academicWb.Sheets['TERM 1'];
assert.ok(academicTerm.C18 && academicTerm.C18.f, 'term name formulas must stay');
assert.strictEqual(Number(cellValue(academicTerm, 'F15')), 10);
assert.strictEqual(Number(cellValue(academicTerm, 'F18')), 10);
assert.strictEqual(Number(cellValue(academicTerm, 'N18')), 20);
assert.strictEqual(Number(cellValue(academicTerm, 'T18')), 30);
assert.strictEqual(Number(cellValue(academicTerm, 'F69')), 8);

const finalSheet = academicWb.Sheets['FINAL GRADES'];
assert.match(String(finalSheet.I14 && finalSheet.I14.f || ''), /COUNT\(F14,G14,H14\)<3/);
assert.ok(finalSheet.I14.f, 'official final must remain the COUNT<3 Excel formula');

const overflowMales = Array.from({ length: 51 }, (_, index) => ({
  name: `Male ${index + 1}`,
  lrn: String(100000000000 + index),
  sex: 'M',
  terms: { 1: { ww: [1, 1, 1, 1, 1], pt: [1, 1, 1], sa1: 1, sa2: 1, te: 1 } }
}));
const overflowPath = path.join(tmp, 'overflow.xlsx');
exporter.generateOfficialExcel(overflowPath, {
  ...academicPayload,
  males: overflowMales,
  females: []
});
const overflowWb = XLSX.readFile(overflowPath);
assert.ok(overflowWb.SheetNames.includes('OVERFLOW'));
assert.strictEqual(cellValue(overflowWb.Sheets['INPUT DATA'], 'K60'), 'Male 50');
assert.match(String(cellValue(overflowWb.Sheets['OVERFLOW'], 'A2') || ''), /Male 51/);

const gmrcPayload = {
  packId: 'gmrc',
  school: school(),
  assignment: gmrcDomains,
  scoringModel: 'gmrc-domains-2026',
  males: [{
    name: 'Santos, Juan',
    lrn: '123456789012',
    sex: 'M',
    terms: {
      1: {
        wwCognitive: [10, 10, 10, 10, 10],
        wwAffective: [9, 9, 9, 9, 9],
        ptCognitive: [8, 8, 8],
        ptAffective: [7, 7, 7],
        ptBehavioral: [6, 6, 6],
        sa1: 30,
        sa2: 30,
        te: 40
      }
    }
  }],
  females: [],
  terms: {
    1: {
      wwCognitiveHps: [10, 10, 10, 10, 10],
      wwAffectiveHps: [10, 10, 10, 10, 10],
      ptCognitiveHps: [10, 10, 10],
      ptAffectiveHps: [10, 10, 10],
      ptBehavioralHps: [10, 10, 10],
      sa1Hps: 30,
      sa2Hps: 30,
      teHps: 40
    }
  }
};
const gmrcPath = path.join(tmp, 'gmrc.xlsx');
exporter.generateOfficialExcel(gmrcPath, gmrcPayload);
const gmrcWb = XLSX.readFile(gmrcPath);
const gmrcTerm = gmrcWb.Sheets['TERM 1'];
assert.strictEqual(Number(cellValue(gmrcTerm, 'F16')), 10);
assert.strictEqual(Number(cellValue(gmrcTerm, 'N16')), 10);
assert.strictEqual(Number(cellValue(gmrcTerm, 'AH16')), 10);
assert.strictEqual(Number(cellValue(gmrcTerm, 'F19')), 10);
assert.strictEqual(Number(cellValue(gmrcTerm, 'N19')), 9);
assert.strictEqual(Number(cellValue(gmrcTerm, 'AH19')), 6);
assert.strictEqual(Number(cellValue(gmrcTerm, 'AN19')), 30);

const mapehPayload = {
  packId: 'mapeh',
  school: school(),
  assignment: assignment({ subject: 'MAPEH' }),
  music_arts: {
    males: [{
      name: 'Santos, Juan',
      terms: { 1: { ww: [10, 9, 8, 7, 6], pt: [20, 19, 18], sa1: 30, sa2: 29, te: 40 } }
    }],
    females: [],
    terms: {
      1: { wwHps: [10, 10, 10, 10, 10], ptHps: [20, 20, 20], sa1Hps: 30, sa2Hps: 30, teHps: 40 }
    }
  },
  pe_health: {
    males: [{
      name: 'Santos, Juan',
      terms: { 1: { ww: [5, 5, 5, 5, 5], pt: [10, 10, 10], sa1: 15, sa2: 15, te: 20 } }
    }],
    females: [],
    terms: {
      1: { wwHps: [10, 10, 10, 10, 10], ptHps: [20, 20, 20], sa1Hps: 30, sa2Hps: 30, teHps: 40 }
    }
  },
  males: [{ name: 'Santos, Juan', lrn: '123456789012', sex: 'M' }],
  females: []
};
const mapehPath = path.join(tmp, 'mapeh.xlsx');
exporter.generateOfficialExcel(mapehPath, mapehPayload);
const mapehWb = XLSX.readFile(mapehPath);
assert.ok(mapehWb.SheetNames.includes('TERM 1 M and A'));
assert.ok(mapehWb.SheetNames.includes('TERM 1 PE and H'));
assert.ok(mapehWb.SheetNames.includes('FINAL GRADES'));
assert.strictEqual(Number(cellValue(mapehWb.Sheets['TERM 1 M and A'], 'F18')), 10);
assert.strictEqual(Number(cellValue(mapehWb.Sheets['TERM 1 PE and H'], 'F18')), 5);

const tlePath = path.join(tmp, 'tle.xlsx');
exporter.generateOfficialExcel(tlePath, {
  ...academicPayload,
  packId: 'tle-single',
  assignment: assignment({ subject: 'Technology and Livelihood Education (TLE)' })
});
const tleWb = XLSX.readFile(tlePath);
assert.ok(tleWb.SheetNames.includes('TERM 1'));
assert.strictEqual(cellValue(tleWb.Sheets['INPUT DATA'], 'E24'), 'Technology and Livelihood Education (TLE)');

assert.strictEqual(typeof genericExporter.generateExcel, 'function');
const genericSource = fs.readFileSync(path.join(root, 'src', 'main', 'excel-exporter.js'), 'utf8');
assert.match(genericSource, /Templates\.xlsx/);
assert.doesNotMatch(genericSource, /official-ecr/);

const exporterSource = fs.readFileSync(path.join(root, 'src', 'main', 'official-ecr-exporter.js'), 'utf8');
assert.doesNotMatch(exporterSource, /password123/);
assert.doesNotMatch(exporterSource, /saveDatabase|db:save/);
assert.match(exporterSource, /OVERFLOW/);

const indexSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
assert.match(indexSource, /Export Official ECR/);
assert.match(indexSource, /official-ecr-packs\.js/);
assert.match(indexSource, /Export Official ECR checklist|officialEcrChecklist|empty official/i);

const importExportSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'import-export.js'), 'utf8');
assert.match(importExportSource, /exportOfficialEcr|openOfficialEcrExport/);
assert.match(importExportSource, /exportExcelTemplate/);
assert.match(importExportSource, /school ID|schoolId/i);
assert.match(importExportSource, /region/i);
assert.match(importExportSource, /\bsex\b/i);
assert.match(importExportSource, /\bLRN\b/i);

const helpSource = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'help.js'), 'utf8');
assert.match(helpSource, /Export Official ECR/);
assert.match(helpSource, /generic Excel export/i);

const preloadSource = fs.readFileSync(path.join(root, 'src', 'main', 'preload.js'), 'utf8');
assert.match(preloadSource, /dialog:export-official-ecr/);
const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
assert.match(mainSource, /dialog:export-official-ecr/);
assert.match(mainSource, /dialog:export-excel-template/);
const securitySource = fs.readFileSync(path.join(root, 'src', 'main', 'security-boundary.js'), 'utf8');
assert.match(securitySource, /dialog:export-official-ecr/);

console.log('K to 10 Phase B official pack tests passed.');
