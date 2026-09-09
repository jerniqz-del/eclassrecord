'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SRC = 'C:\\Users\\PrimePC\\Downloads\\K to 10 (Updated)-20260908T150156Z-1-001\\K to 10 (Updated)';
const DEST = path.join(__dirname, '..', 'src', 'assets', 'official-ecr');

const FILES = [
  ['UPDATED [Grades 2-10] 3Term E-Class Record (for Science, Math, English, Filipino, Araling Panlipunan).xlsx', 'academic-2-10.xlsx'],
  ['UPDATED [Grades 2-10] 3Term E-Class Record (for GMRC and Values Education)_1.xlsx', 'gmrc-values.xlsx'],
  ['UPDATED [Grades 2-10] 3Term E-Class Record (for Music and Arts, Physical Education and Health)_1.xlsx', 'mapeh.xlsx'],
  ['UPDATED [Grades 2-10] 3Term E-Class Record (for EPP-TLE).xlsx', 'epp-tle-single.xlsx'],
  ['UPDATED [Grades 2-10] 3Term E-Class Record (for EPP-TLE) - per component.xlsx', 'epp-tle-component.xlsx'],
  ['UPDATED [Grade 1] ECR, PACE Form, and SF9.xlsx', 'grade1-pace-sf9.xlsx'],
  ['UPDATED [Kinder] E-Class Record with SF9.xlsx', 'kinder-sf9.xlsx']
];

fs.mkdirSync(DEST, { recursive: true });

for (const [fromName, toName] of FILES) {
  const workbook = XLSX.readFile(path.join(SRC, fromName), {
    cellFormula: true,
    cellStyles: true,
    cellNF: true
  });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const maxR = Math.min(range.e.r, 80);
    const maxC = Math.min(range.e.c, 20);
    for (let r = 0; r <= maxR; r += 1) {
      for (let c = 0; c <= maxC; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell || cell.f) continue;
        const text = String(cell.v == null ? '' : cell.v);
        if (/password123/i.test(text)) {
          cell.v = 'Sheet protection is not copied into E-Class Record.';
          cell.t = 's';
          delete cell.w;
        }
      }
    }
  }
  XLSX.writeFile(workbook, path.join(DEST, toName), { cellStyles: true });
  console.log('wrote', toName);
}
