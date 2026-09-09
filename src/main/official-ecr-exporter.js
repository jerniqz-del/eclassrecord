'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const packs = require('../renderer/js/official-ecr-packs');

const PACK_FILES = Object.freeze({
  academic: 'academic-2-10.xlsx',
  gmrc: 'gmrc-values.xlsx',
  mapeh: 'mapeh.xlsx',
  'tle-single': 'epp-tle-single.xlsx',
  'tle-component': 'epp-tle-component.xlsx',
  grade1: 'grade1-pace-sf9.xlsx',
  kinder: 'kinder-sf9.xlsx'
});

const BLOCKED = Object.freeze({});

const INPUT_CELLS = Object.freeze({
  region: 'E10',
  division: 'E11',
  schoolId: 'E13',
  schoolName: 'E14',
  schoolYear: 'E15',
  schoolHead: 'E16',
  teacher: 'E23',
  subject: 'E24',
  gradeLevel: 'E25',
  section: 'E26',
  maleNameCol: 'K',
  femaleNameCol: 'N',
  rosterStart: 11,
  rosterCap: 50
});

const STANDARD_TERM = Object.freeze({
  hpsRow: 15,
  maleStart: 18,
  femaleStart: 69,
  ww: ['F', 'G', 'H', 'I', 'J'],
  pt: ['N', 'O', 'P'],
  exams: ['T', 'U', 'V']
});

const GRADE1_INPUT = Object.freeze({
  region: 'F10',
  division: 'F11',
  city: 'F12',
  district: 'F13',
  schoolId: 'F15',
  schoolName: 'F16',
  schoolYear: 'F18',
  schoolHead: 'F19',
  teacher: 'F26',
  gradeLevel: 'F27',
  section: 'F28',
  maleNameCol: 'L',
  maleLrnCol: 'M',
  maleBirthCol: 'N',
  femaleNameCol: 'Q',
  femaleLrnCol: 'R',
  femaleBirthCol: 'S',
  rosterStart: 11,
  rosterCap: 50,
  summaryMaleStart: 14,
  summaryFemaleStart: 65,
  attendanceMaleStart: 13,
  attendanceFemaleStart: 64,
  attendanceClassDaysRow: 116,
  attendanceCols: ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'],
  attendanceKeys: [
    'june', 'july', 'august', 'septemberT1', 'septemberT2', 'october',
    'november', 'december', 'january', 'february', 'march', 'april'
  ]
});

function isoToExcelDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || '';
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

const GMRC_TERM = Object.freeze({
  hpsRow: 16,
  maleStart: 19,
  femaleStart: 70,
  wwCognitive: ['F', 'G', 'H', 'I', 'J'],
  wwAffective: ['N', 'O', 'P', 'Q', 'R'],
  ptCognitive: ['V', 'W', 'X'],
  ptAffective: ['AB', 'AC', 'AD'],
  ptBehavioral: ['AH', 'AI', 'AJ'],
  exams: ['AN', 'AO', 'AP']
});

function templateDir() {
  return path.join(__dirname, '..', 'assets', 'official-ecr');
}

function templatePathForPack(packId) {
  const fileName = PACK_FILES[packId];
  if (!fileName) return '';
  return path.join(templateDir(), fileName);
}

function setCellValue(sheet, cellRef, value) {
  if (value === undefined || value === null || value === '') {
    if (sheet[cellRef]) {
      sheet[cellRef].v = '';
      sheet[cellRef].t = 's';
      delete sheet[cellRef].w;
      delete sheet[cellRef].f;
    }
    return;
  }
  if (!sheet[cellRef]) sheet[cellRef] = {};
  const cell = sheet[cellRef];
  if (typeof value === 'number' && Number.isFinite(value)) {
    cell.t = 'n';
    cell.v = value;
  } else {
    cell.t = 's';
    cell.v = String(value);
  }
  delete cell.w;
  delete cell.f;
}

function writeRowValues(sheet, row, columns, values) {
  (columns || []).forEach((col, index) => {
    const value = Array.isArray(values) ? values[index] : undefined;
    if (value === undefined || value === null || value === '') return;
    setCellValue(sheet, `${col}${row}`, value);
  });
}

function fillInputData(sheet, payload) {
  const school = payload.school || {};
  const assignment = payload.assignment || {};
  setCellValue(sheet, INPUT_CELLS.region, school.region);
  setCellValue(sheet, INPUT_CELLS.division, school.division);
  setCellValue(sheet, INPUT_CELLS.schoolId, school.schoolId);
  setCellValue(sheet, INPUT_CELLS.schoolName, school.schoolName);
  setCellValue(sheet, INPUT_CELLS.schoolYear, school.schoolYear);
  setCellValue(sheet, INPUT_CELLS.schoolHead, school.schoolHead);
  setCellValue(sheet, INPUT_CELLS.teacher, school.teacherName);
  setCellValue(sheet, INPUT_CELLS.subject, assignment.subject);
  setCellValue(sheet, INPUT_CELLS.gradeLevel, assignment.gradeLevel);
  setCellValue(sheet, INPUT_CELLS.section, assignment.section);

  const males = payload.males || [];
  const females = payload.females || [];
  for (let index = 0; index < INPUT_CELLS.rosterCap; index += 1) {
    const row = INPUT_CELLS.rosterStart + index;
    setCellValue(sheet, `${INPUT_CELLS.maleNameCol}${row}`, males[index] ? males[index].name : '');
    setCellValue(sheet, `${INPUT_CELLS.femaleNameCol}${row}`, females[index] ? females[index].name : '');
  }
}

function fillStandardTerm(sheet, males, females, termHps, termKey) {
  if (!sheet) return;
  const hps = termHps || {};
  writeRowValues(sheet, STANDARD_TERM.hpsRow, STANDARD_TERM.ww, hps.wwHps);
  writeRowValues(sheet, STANDARD_TERM.hpsRow, STANDARD_TERM.pt, hps.ptHps);
  writeRowValues(sheet, STANDARD_TERM.hpsRow, STANDARD_TERM.exams, [hps.sa1Hps, hps.sa2Hps, hps.teHps]);

  function writeLearners(list, startRow) {
    (list || []).slice(0, INPUT_CELLS.rosterCap).forEach((learner, index) => {
      const row = startRow + index;
      const term = (learner.terms && learner.terms[termKey]) || {};
      writeRowValues(sheet, row, STANDARD_TERM.ww, term.ww);
      writeRowValues(sheet, row, STANDARD_TERM.pt, term.pt);
      writeRowValues(sheet, row, STANDARD_TERM.exams, [term.sa1, term.sa2, term.te]);
    });
  }

  writeLearners(males, STANDARD_TERM.maleStart);
  writeLearners(females, STANDARD_TERM.femaleStart);
}

function fillGmrcTerm(sheet, males, females, termHps, termKey) {
  if (!sheet) return;
  const hps = termHps || {};
  writeRowValues(sheet, GMRC_TERM.hpsRow, GMRC_TERM.wwCognitive, hps.wwCognitiveHps || hps.wwHps);
  writeRowValues(sheet, GMRC_TERM.hpsRow, GMRC_TERM.wwAffective, hps.wwAffectiveHps);
  writeRowValues(sheet, GMRC_TERM.hpsRow, GMRC_TERM.ptCognitive, hps.ptCognitiveHps || hps.ptHps);
  writeRowValues(sheet, GMRC_TERM.hpsRow, GMRC_TERM.ptAffective, hps.ptAffectiveHps);
  writeRowValues(sheet, GMRC_TERM.hpsRow, GMRC_TERM.ptBehavioral, hps.ptBehavioralHps);
  writeRowValues(sheet, GMRC_TERM.hpsRow, GMRC_TERM.exams, [hps.sa1Hps, hps.sa2Hps, hps.teHps]);

  function writeLearners(list, startRow) {
    (list || []).slice(0, INPUT_CELLS.rosterCap).forEach((learner, index) => {
      const row = startRow + index;
      const term = (learner.terms && learner.terms[termKey]) || {};
      writeRowValues(sheet, row, GMRC_TERM.wwCognitive, term.wwCognitive || term.ww);
      writeRowValues(sheet, row, GMRC_TERM.wwAffective, term.wwAffective);
      writeRowValues(sheet, row, GMRC_TERM.ptCognitive, term.ptCognitive || term.pt);
      writeRowValues(sheet, row, GMRC_TERM.ptAffective, term.ptAffective);
      writeRowValues(sheet, row, GMRC_TERM.ptBehavioral, term.ptBehavioral);
      writeRowValues(sheet, row, GMRC_TERM.exams, [term.sa1, term.sa2, term.te]);
    });
  }

  writeLearners(males, GMRC_TERM.maleStart);
  writeLearners(females, GMRC_TERM.femaleStart);
}

function overflowRows(payload) {
  const extra = [];
  ['males', 'females'].forEach(group => {
    (payload[group] || []).slice(INPUT_CELLS.rosterCap).forEach(learner => {
      extra.push([learner.name || '', learner.sex || (group === 'males' ? 'M' : 'F'), learner.lrn || '']);
    });
  });
  return extra;
}

function addOverflowSheet(workbook, extra) {
  if (!extra.length) return;
  const rows = [
    ['OVERFLOW — official INPUT DATA holds 50 males and 50 females'],
    ...extra
  ];
  workbook.Sheets.OVERFLOW = XLSX.utils.aoa_to_sheet(rows);
  if (!workbook.SheetNames.includes('OVERFLOW')) workbook.SheetNames.push('OVERFLOW');
}

function fillStandardPack(workbook, payload, gmrc) {
  fillInputData(workbook.Sheets['INPUT DATA'], payload);
  ['1', '2', '3'].forEach(term => {
    const sheet = workbook.Sheets[`TERM ${term}`];
    const hps = (payload.terms && payload.terms[term]) || {};
    if (gmrc) fillGmrcTerm(sheet, payload.males, payload.females, hps, term);
    else fillStandardTerm(sheet, payload.males, payload.females, hps, term);
  });
}

function fillMapehPack(workbook, payload) {
  fillInputData(workbook.Sheets['INPUT DATA'], payload);
  const parts = [
    { key: 'music_arts', prefix: 'M and A' },
    { key: 'pe_health', prefix: 'PE and H' }
  ];
  parts.forEach(part => {
    const data = payload[part.key] || {};
    ['1', '2', '3'].forEach(term => {
      fillStandardTerm(
        workbook.Sheets[`TERM ${term} ${part.prefix}`],
        data.males || [],
        data.females || [],
        (data.terms && data.terms[term]) || {},
        term
      );
    });
  });
}

function fillTleComponentPack(workbook, payload) {
  fillInputData(workbook.Sheets['INPUT DATA'], payload);
  const tracks = [
    { key: 'ict', sheetFor: term => `TERM ${term} ICT`, terms: ['1', '2', '3'] },
    { key: 'afa', sheetFor: () => 'TERM 1 AFA', terms: ['1'] },
    { key: 'fcs', sheetFor: () => 'TERM 2 FCS', terms: ['2'] },
    { key: 'ia', sheetFor: () => 'TERM 3 IA', terms: ['3'] }
  ];
  tracks.forEach(track => {
    const data = payload[track.key] || {};
    track.terms.forEach(term => {
      fillStandardTerm(
        workbook.Sheets[track.sheetFor(term)],
        data.males || [],
        data.females || [],
        (data.terms && data.terms[term]) || {},
        term
      );
    });
  });
}

function fillGrade1Input(sheet, payload) {
  if (!sheet) return;
  const school = payload.school || {};
  const assignment = payload.assignment || {};
  setCellValue(sheet, GRADE1_INPUT.region, school.region);
  setCellValue(sheet, GRADE1_INPUT.division, school.division);
  setCellValue(sheet, GRADE1_INPUT.city, school.city || school.municipality);
  setCellValue(sheet, GRADE1_INPUT.district, school.district);
  setCellValue(sheet, GRADE1_INPUT.schoolId, school.schoolId);
  setCellValue(sheet, GRADE1_INPUT.schoolName, school.schoolName);
  setCellValue(sheet, GRADE1_INPUT.schoolYear, school.schoolYear);
  setCellValue(sheet, GRADE1_INPUT.schoolHead, school.schoolHead);
  setCellValue(sheet, GRADE1_INPUT.teacher, school.teacherName);
  setCellValue(sheet, GRADE1_INPUT.gradeLevel, assignment.gradeLevel);
  setCellValue(sheet, GRADE1_INPUT.section, assignment.section);

  const males = payload.males || [];
  const females = payload.females || [];
  for (let index = 0; index < GRADE1_INPUT.rosterCap; index += 1) {
    const row = GRADE1_INPUT.rosterStart + index;
    const male = males[index];
    const female = females[index];
    setCellValue(sheet, `${GRADE1_INPUT.maleNameCol}${row}`, male ? male.name : '');
    setCellValue(sheet, `${GRADE1_INPUT.maleLrnCol}${row}`, male ? male.lrn : '');
    setCellValue(sheet, `${GRADE1_INPUT.maleBirthCol}${row}`, male && male.birthdate ? isoToExcelDate(male.birthdate) : '');
    setCellValue(sheet, `${GRADE1_INPUT.femaleNameCol}${row}`, female ? female.name : '');
    setCellValue(sheet, `${GRADE1_INPUT.femaleLrnCol}${row}`, female ? female.lrn : '');
    setCellValue(sheet, `${GRADE1_INPUT.femaleBirthCol}${row}`, female && female.birthdate ? isoToExcelDate(female.birthdate) : '');
  }
}

function fillGrade1Summaries(workbook, payload) {
  ['1', '2', '3'].forEach(term => {
    const sheet = workbook.Sheets[`TERM ${term} SUMMARY`];
    if (!sheet) return;
    function writeGroup(list, startRow) {
      for (let index = 0; index < GRADE1_INPUT.rosterCap; index += 1) {
        const row = startRow + index;
        const learner = (list || [])[index];
        const summary = learner && learner.summaries && learner.summaries[term]
          ? learner.summaries[term]
          : {};
        setCellValue(sheet, `N${row}`, summary.canDo || '');
        setCellValue(sheet, `Q${row}`, summary.toImprove || '');
      }
    }
    writeGroup(payload.males, GRADE1_INPUT.summaryMaleStart);
    writeGroup(payload.females, GRADE1_INPUT.summaryFemaleStart);
  });
}

function fillGrade1Attendance(sheet, payload) {
  if (!sheet) return;
  const classDays = payload.attendanceClassDays || {};
  GRADE1_INPUT.attendanceKeys.forEach((key, index) => {
    const col = GRADE1_INPUT.attendanceCols[index];
    const value = classDays[key];
    setCellValue(sheet, `${col}${GRADE1_INPUT.attendanceClassDaysRow}`, value == null ? 0 : value);
  });
  function writeGroup(list, startRow) {
    for (let index = 0; index < GRADE1_INPUT.rosterCap; index += 1) {
      const row = startRow + index;
      const learner = (list || [])[index];
      const present = (learner && learner.attendancePresent) || {};
      GRADE1_INPUT.attendanceKeys.forEach((key, colIndex) => {
        const col = GRADE1_INPUT.attendanceCols[colIndex];
        setCellValue(sheet, `${col}${row}`, learner ? (present[key] || 0) : '');
      });
    }
  }
  writeGroup(payload.males, GRADE1_INPUT.attendanceMaleStart);
  writeGroup(payload.females, GRADE1_INPUT.attendanceFemaleStart);
}

function fillGrade1Pack(workbook, payload) {
  fillGrade1Input(workbook.Sheets['INPUT DATA'], payload);
  fillGrade1Summaries(workbook, payload);
  fillGrade1Attendance(workbook.Sheets['G1 - ATTENDANCE SUMMARY'], payload);
}

function excelColumnName(index) {
  let next = index;
  let name = '';
  while (next >= 0) {
    name = String.fromCharCode((next % 26) + 65) + name;
    next = Math.floor(next / 26) - 1;
  }
  return name;
}

function fillKinderRatings(workbook, payload) {
  const items = require('../renderer/js/kinder-catalog').kinderAllItems();
  ['1', '2', '3'].forEach(term => {
    const sheet = workbook.Sheets[`TERM ${term} SUMMARY`];
    if (!sheet) return;
    function writeGroup(list, startRow) {
      (list || []).slice(0, GRADE1_INPUT.rosterCap).forEach((learner, index) => {
        const row = startRow + index;
        const ratings = (learner.ratings && learner.ratings[term]) || {};
        items.forEach((item, itemIndex) => {
          const letter = ratings[item.id] || '';
          if (!letter) return;
          setCellValue(sheet, `${excelColumnName(13 + itemIndex)}${row}`, letter);
        });
      });
    }
    writeGroup(payload.males, 16);
    writeGroup(payload.females, 66);
  });
}

function fillKinderPack(workbook, payload) {
  fillGrade1Input(workbook.Sheets['INPUT DATA'], payload);
  fillKinderRatings(workbook, payload);
}

function generateOfficialExcel(outputPath, payload) {
  const data = payload || {};
  if (data.packId && BLOCKED[data.packId]) {
    throw new Error(BLOCKED[data.packId]);
  }
  const pack = packs.officialEcrPackForAssignment(data.assignment || {});
  const packId = data.packId || pack.id;
  if (BLOCKED[packId] || pack.available === false) {
    throw new Error(BLOCKED[packId] || pack.warning || 'Official pack is not available.');
  }
  const templatePath = templatePathForPack(packId);
  if (!templatePath || !fs.existsSync(templatePath)) {
    throw new Error(`Official ECR template was not found for pack ${packId}.`);
  }
  const workbook = XLSX.readFile(templatePath, { cellFormula: true, cellStyles: true, cellNF: true });
  if (packId === 'mapeh') fillMapehPack(workbook, data);
  else if (packId === 'tle-component') fillTleComponentPack(workbook, data);
  else if (packId === 'grade1') fillGrade1Pack(workbook, data);
  else if (packId === 'kinder') fillKinderPack(workbook, data);
  else fillStandardPack(workbook, data, packId === 'gmrc');
  addOverflowSheet(workbook, overflowRows(data));
  XLSX.writeFile(workbook, outputPath, { cellStyles: true });
  return outputPath;
}

module.exports = {
  generateOfficialExcel,
  templatePathForPack,
  PACK_FILES
};
