const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

/**
 * Helper to write a value into a cell while preserving formatting (style) if the cell already exists.
 */
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
  
  if (!sheet[cellRef]) {
    sheet[cellRef] = {};
  }
  
  const cell = sheet[cellRef];
  if (typeof value === 'number') {
    cell.t = 'n';
    cell.v = Number(value);
    delete cell.w;
    delete cell.f;
  } else {
    cell.t = 's';
    cell.v = String(value);
    delete cell.w;
    delete cell.f;
  }
}

/**
 * Clones a worksheet object.
 */
function cloneSheet(sheet) {
  return JSON.parse(JSON.stringify(sheet));
}

/**
 * Populates a single term sheet (e.g. TERM 1, TERM 2, etc.)
 */
function populateTermSheet(sheet, data, term, subTitleSubject) {
  // 1. School & Header Details
  setCellValue(sheet, 'G4', data.region);
  setCellValue(sheet, 'R4', data.division);
  setCellValue(sheet, 'G5', data.schoolName);
  setCellValue(sheet, 'R5', data.schoolId);
  setCellValue(sheet, 'Z5', data.schoolYear);
  setCellValue(sheet, 'K7', `Grade ${data.gradeLevel} - ${data.section}`);
  setCellValue(sheet, 'T7', subTitleSubject || data.subject);
  setCellValue(sheet, 'T8', data.teacherName);

  const termData = data.terms[term] || {};
  
  // 2. Highest Possible Score (HPS) Row 11
  const wwHps = termData.wwHps || [];
  const ptHps = termData.ptHps || [];
  
  // Written Works HPS (Columns F to J)
  for (let i = 0; i < 5; i++) {
    const col = XLSX.utils.encode_col(5 + i);
    setCellValue(sheet, `${col}11`, wwHps[i]);
  }
  // Performance Tasks HPS (Columns N to P)
  for (let i = 0; i < 3; i++) {
    const col = XLSX.utils.encode_col(13 + i);
    setCellValue(sheet, `${col}11`, ptHps[i]);
  }
  // Summative / Exams HPS
  setCellValue(sheet, 'T11', termData.sa1Hps);
  setCellValue(sheet, 'U11', termData.sa2Hps);
  setCellValue(sheet, 'V11', termData.teHps);

  // 3. Student Lists and Scores
  const colsToClear = [
    'B', 'C', 'D', 'E', // details
    'F', 'G', 'H', 'I', 'J', // WW scores
    'K', 'L', 'M', // WW totals
    'N', 'O', 'P', // PT scores
    'Q', 'R', 'S', // PT totals
    'T', 'U', 'V', // SA scores
    'W', 'X', 'Y', // SA totals
    'Z', 'AA', 'AB' // Grades
  ];

  // Boys (Row 13 to 62)
  for (let idx = 0; idx < 50; idx++) {
    const row = 13 + idx;
    const student = data.males[idx];
    if (student) {
      setCellValue(sheet, `B${row}`, student.name);
      
      const sTerm = student.terms[term] || {};
      const wwScores = sTerm.ww || [];
      const ptScores = sTerm.pt || [];

      // WW Scores
      for (let i = 0; i < 5; i++) {
        const col = XLSX.utils.encode_col(5 + i);
        setCellValue(sheet, `${col}${row}`, wwScores[i]);
      }
      setCellValue(sheet, `K${row}`, sTerm.wwTotal);
      setCellValue(sheet, `L${row}`, sTerm.wwPS);
      setCellValue(sheet, `M${row}`, sTerm.wwWS);

      // PT Scores
      for (let i = 0; i < 3; i++) {
        const col = XLSX.utils.encode_col(13 + i);
        setCellValue(sheet, `${col}${row}`, ptScores[i]);
      }
      setCellValue(sheet, `Q${row}`, sTerm.ptTotal);
      setCellValue(sheet, `R${row}`, sTerm.ptPS);
      setCellValue(sheet, `S${row}`, sTerm.ptWS);

      // SA / Exams
      setCellValue(sheet, `T${row}`, sTerm.sa1);
      setCellValue(sheet, `U${row}`, sTerm.sa2);
      setCellValue(sheet, `V${row}`, sTerm.te);
      setCellValue(sheet, `W${row}`, sTerm.saTotal);
      setCellValue(sheet, `X${row}`, sTerm.saPS);
      setCellValue(sheet, `Y${row}`, sTerm.saWS);

      // Final Grades
      setCellValue(sheet, `Z${row}`, sTerm.initialGrade);
      setCellValue(sheet, `AA${row}`, sTerm.termGrade);
      setCellValue(sheet, `AB${row}`, sTerm.desc);
    } else {
      // Clear unused student row
      colsToClear.forEach(col => setCellValue(sheet, `${col}${row}`, ''));
    }
  }

  // Girls (Row 64 to 113)
  for (let idx = 0; idx < 50; idx++) {
    const row = 64 + idx;
    const student = data.females[idx];
    if (student) {
      setCellValue(sheet, `B${row}`, student.name);
      
      const sTerm = student.terms[term] || {};
      const wwScores = sTerm.ww || [];
      const ptScores = sTerm.pt || [];

      // WW Scores
      for (let i = 0; i < 5; i++) {
        const col = XLSX.utils.encode_col(5 + i);
        setCellValue(sheet, `${col}${row}`, wwScores[i]);
      }
      setCellValue(sheet, `K${row}`, sTerm.wwTotal);
      setCellValue(sheet, `L${row}`, sTerm.wwPS);
      setCellValue(sheet, `M${row}`, sTerm.wwWS);

      // PT Scores
      for (let i = 0; i < 3; i++) {
        const col = XLSX.utils.encode_col(13 + i);
        setCellValue(sheet, `${col}${row}`, ptScores[i]);
      }
      setCellValue(sheet, `Q${row}`, sTerm.ptTotal);
      setCellValue(sheet, `R${row}`, sTerm.ptPS);
      setCellValue(sheet, `S${row}`, sTerm.ptWS);

      // SA / Exams
      setCellValue(sheet, `T${row}`, sTerm.sa1);
      setCellValue(sheet, `U${row}`, sTerm.sa2);
      setCellValue(sheet, `V${row}`, sTerm.te);
      setCellValue(sheet, `W${row}`, sTerm.saTotal);
      setCellValue(sheet, `X${row}`, sTerm.saPS);
      setCellValue(sheet, `Y${row}`, sTerm.saWS);

      // Final Grades
      setCellValue(sheet, `Z${row}`, sTerm.initialGrade);
      setCellValue(sheet, `AA${row}`, sTerm.termGrade);
      setCellValue(sheet, `AB${row}`, sTerm.desc);
    } else {
      // Clear unused student row
      colsToClear.forEach(col => setCellValue(sheet, `${col}${row}`, ''));
    }
  }
  if (data.policy === 'DO15_DESCRIPTIVE') {
    setCellValue(sheet, 'B115', 'Original basis of grade was descriptive (DO 15, s. 2026).');
  }
}

/**
 * Populates a single Final Summary sheet.
 */
function populateSummarySheet(sheet, data, subTitleSubject) {
  // 1. School & Header Details
  setCellValue(sheet, 'D5', data.region);
  setCellValue(sheet, 'P5', data.division);
  setCellValue(sheet, 'AB5', data.schoolId);
  setCellValue(sheet, 'D6', data.schoolName);
  setCellValue(sheet, 'AB6', data.schoolYear);
  setCellValue(sheet, 'N9', `Grade ${data.gradeLevel} - ${data.section}`);
  setCellValue(sheet, 'Z9', subTitleSubject || data.subject);
  setCellValue(sheet, 'Z10', data.teacherName);

  const colsToClear = [
    'B', 'C', 'D', 'E', // details
    'H', 'P', 'V', // Term grades
    'Z', 'AC' // Final Average and Remarks
  ];

  // Boys (Row 13 to 62)
  for (let idx = 0; idx < 50; idx++) {
    const row = 13 + idx;
    const student = data.males[idx];
    if (student) {
      setCellValue(sheet, `B${row}`, student.name);
      
      const sFinal = student.final || {};
      setCellValue(sheet, `H${row}`, sFinal.term1);
      setCellValue(sheet, `P${row}`, sFinal.term2);
      setCellValue(sheet, `V${row}`, sFinal.term3);
      setCellValue(sheet, `Z${row}`, sFinal.finalGrade);
      setCellValue(sheet, `AC${row}`, sFinal.remarks);
    } else {
      colsToClear.forEach(col => setCellValue(sheet, `${col}${row}`, ''));
    }
  }

  // Girls (Row 64 to 113)
  for (let idx = 0; idx < 50; idx++) {
    const row = 64 + idx;
    const student = data.females[idx];
    if (student) {
      setCellValue(sheet, `B${row}`, student.name);
      
      const sFinal = student.final || {};
      setCellValue(sheet, `H${row}`, sFinal.term1);
      setCellValue(sheet, `P${row}`, sFinal.term2);
      setCellValue(sheet, `V${row}`, sFinal.term3);
      setCellValue(sheet, `Z${row}`, sFinal.finalGrade);
      setCellValue(sheet, `AC${row}`, sFinal.remarks);
    } else {
      colsToClear.forEach(col => setCellValue(sheet, `${col}${row}`, ''));
    }
  }
  if (data.policy === 'DO15_DESCRIPTIVE') {
    setCellValue(sheet, 'B115', 'Original basis of grade was descriptive (DO 15, s. 2026).');
  }
}

/**
 * Main function to read template, populate values, and save to target path.
 */
async function generateExcel(outputPath, payload) {
  // Read template file from app assets
  const templatePath = path.join(__dirname, '..', 'assets', 'Templates.xlsx');
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Templates.xlsx not found at ${templatePath}`);
  }
  
  const workbook = XLSX.readFile(templatePath);
  
  // Trim ranges of original sheets to prevent enormous cell-writing performance issues
  workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    if (sheet) sheet['!ref'] = 'A1:AE120';
  });
  
  if (!payload.isMapeh) {
    // Standard Class Load: Populate the standard sheets directly
    populateTermSheet(workbook.Sheets['TERM 1'], payload, '1');
    populateTermSheet(workbook.Sheets['TERM 2'], payload, '2');
    populateTermSheet(workbook.Sheets['TERM 3'], payload, '3');
    populateSummarySheet(workbook.Sheets['SUMMARY'], payload);
  } else {
    // MAPEH Class Load: Duplicate template sheets to separate sub-track sheets
    const originalTerm1 = workbook.Sheets['TERM 1'];
    const originalTerm2 = workbook.Sheets['TERM 2'];
    const originalTerm3 = workbook.Sheets['TERM 3'];
    const originalSummary = workbook.Sheets['SUMMARY'];
    
    // Create new sheet references
    const maTerm1 = cloneSheet(originalTerm1);
    const maTerm2 = cloneSheet(originalTerm2);
    const maTerm3 = cloneSheet(originalTerm3);
    const maSummary = cloneSheet(originalSummary);

    const peTerm1 = cloneSheet(originalTerm1);
    const peTerm2 = cloneSheet(originalTerm2);
    const peTerm3 = cloneSheet(originalTerm3);
    const peSummary = cloneSheet(originalSummary);
    
    // Populate Music & Arts sub-sheets
    populateTermSheet(maTerm1, payload.music_arts, '1', `${payload.subject} - Music & Arts`);
    populateTermSheet(maTerm2, payload.music_arts, '2', `${payload.subject} - Music & Arts`);
    populateTermSheet(maTerm3, payload.music_arts, '3', `${payload.subject} - Music & Arts`);
    populateSummarySheet(maSummary, payload.music_arts, `${payload.subject} - Music & Arts`);
    
    // Populate PE & Health sub-sheets
    populateTermSheet(peTerm1, payload.pe_health, '1', `${payload.subject} - PE & Health`);
    populateTermSheet(peTerm2, payload.pe_health, '2', `${payload.subject} - PE & Health`);
    populateTermSheet(peTerm3, payload.pe_health, '3', `${payload.subject} - PE & Health`);
    populateSummarySheet(peSummary, payload.pe_health, `${payload.subject} - PE & Health`);
    
    // Create Consolidated MAPEH summary sheet from scratch
    const consolidatedRows = [
      ['MAPEH Consolidated Grades Summary'],
      [],
      [`School Name: ${payload.schoolName || ''}`, `School ID: ${payload.schoolId || ''}`, `School Year: ${payload.schoolYear || ''}`],
      [`Grade & Section: Grade ${payload.gradeLevel} - ${payload.section}`, `Subject: ${payload.subject}`, `Teacher: ${payload.teacherName || ''}`],
      [],
      [
        'No.', 'Learners Name', 'Sex',
        'T1 Music & Arts', 'T1 PE & Health', 'T1 Consolidated',
        'T2 Music & Arts', 'T2 PE & Health', 'T2 Consolidated',
        'T3 Music & Arts', 'T3 PE & Health', 'T3 Consolidated',
        'Music & Arts Final', 'PE & Health Final', 'MAPEH Final Grade', 'Remarks/Descriptor'
      ]
    ];
    
    // Populate Male students
    payload.consolidated.males.forEach((student, idx) => {
      consolidatedRows.push([
        idx + 1,
        student.name,
        'M',
        student.t1Music,
        student.t1PE,
        student.t1Cons,
        student.t2Music,
        student.t2PE,
        student.t2Cons,
        student.t3Music,
        student.t3PE,
        student.t3Cons,
        student.musicFinal,
        student.peFinal,
        student.finalConsolidated,
        student.remarks
      ]);
    });
    
    // Divider
    consolidatedRows.push([]);
    
    // Populate Female students
    payload.consolidated.females.forEach((student, idx) => {
      consolidatedRows.push([
        idx + 1,
        student.name,
        'F',
        student.t1Music,
        student.t1PE,
        student.t1Cons,
        student.t2Music,
        student.t2PE,
        student.t2Cons,
        student.t3Music,
        student.t3PE,
        student.t3Cons,
        student.musicFinal,
        student.peFinal,
        student.finalConsolidated,
        student.remarks
      ]);
    });
    
    if (payload.policy === 'DO15_DESCRIPTIVE') {
      consolidatedRows.push([]);
      consolidatedRows.push(['', 'Original basis of grade was descriptive (DO 15, s. 2026).']);
    }
    
    const consolidatedSheet = XLSX.utils.aoa_to_sheet(consolidatedRows);
    
    // Add columns sizing
    consolidatedSheet['!cols'] = [
      { wch: 5 }, { wch: 30 }, { wch: 5 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }
    ];

    // Assign all sheets
    workbook.Sheets = {
      'M&A - TERM 1': maTerm1,
      'M&A - TERM 2': maTerm2,
      'M&A - TERM 3': maTerm3,
      'M&A - SUMMARY': maSummary,
      'PEH - TERM 1': peTerm1,
      'PEH - TERM 2': peTerm2,
      'PEH - TERM 3': peTerm3,
      'PEH - SUMMARY': peSummary,
      'MAPEH CONSOLIDATION': consolidatedSheet
    };
    
    // Reset sheet names order
    workbook.SheetNames = [
      'M&A - TERM 1', 'M&A - TERM 2', 'M&A - TERM 3', 'M&A - SUMMARY',
      'PEH - TERM 1', 'PEH - TERM 2', 'PEH - TERM 3', 'PEH - SUMMARY',
      'MAPEH CONSOLIDATION'
    ];
  }
  
  XLSX.writeFile(workbook, outputPath);
}

module.exports = {
  generateExcel
};
