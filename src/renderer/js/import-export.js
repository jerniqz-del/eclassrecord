/**
 * E-Class Record — Import & Export Module
 *
 * Implements backup/restore in JSON, learner roster imports from CSV copy-paste,
 * parsing of DepEd LIS SF1 enrollment Excel sheets, and CSV grade exporting.
 */

/**
 * Triggers native save dialog to export complete JSON database.
 */
async function exportJson() {
  updateProfile();
  const text = JSON.stringify(db, null, 2);
  try {
    const result = await window.electronAPI.exportJson(text);
    if (result.success) {
      toast('Backup exported successfully.', 'success');
    }
  } catch (error) {
    console.error(error);
    toast('Export failed: ' + error.message, 'error');
  }
}

/**
 * Triggers native open file dialog to import a JSON backup file.
 */
async function importJsonBackupFile() {
  try {
    const result = await window.electronAPI.importJson();
    if (result.success && result.content) {
      const incoming = JSON.parse(result.content);
      if (!incoming.assignments) {
        throw new Error('Invalid backup file: assignments list is missing.');
      }
      db = incoming;
      normalizeDatabase();
      await saveDatabase();
      render();
      toast('Database successfully restored from file backup.', 'success');
    }
  } catch (error) {
    console.error(error);
    toast('Import failed: ' + error.message, 'error');
  }
}

/**
 * Triggers native open file dialog to select and parse an SF1 Excel sheet.
 */
async function importSf1() {
  const a = currentAssignment();
  if (!a) {
    toast('Add or select a teaching load before uploading SF1.', 'warning');
    return;
  }
  
  try {
    const result = await window.electronAPI.importSf1();
    if (result.success && result.table) {
      const learners = extractSf1Learners(result.table);
      if (learners.length === 0) {
        toast('No learners found in file. Ensure LRN and gender columns exist.', 'error');
        return;
      }
      
      // Merge learners
      for (let i = 0; i < learners.length; i++) {
        learners[i].id = uid('learner');
        a.learners.push(learners[i]);
      }
      
      sortLearners();
      saveDatabase();
      render();
      toast(`Successfully imported ${learners.length} learners from SF1.`, 'success');
    } else if (result.error) {
      toast('SF1 processing failed: ' + result.error, 'error');
    }
  } catch (error) {
    console.error(error);
    toast('SF1 upload failed: ' + error.message, 'error');
  }
}

/**
 * Exports currently viewed table grid (Term or Summary) to a CSV sheet.
 */
async function exportCsv() {
  const a = currentAssignment();
  if (!a) {
    toast('Add a teaching load first.', 'warning');
    return;
  }
  
  let csvContent = '';
  
  if (recordTab === 'summary') {
    // Export Final Grades Summary
    csvContent += 'No.,LRN,Learner,Sex,Term 1,Term 2,Term 3,Final Grade,Remarks\n';
    for (let r = 0; r < a.learners.length; r++) {
      const learner = a.learners[r];
      const terms = [];
      let sum = 0;
      let count = 0;
      for (let t = 1; t <= 3; t++) {
        const res = computeTerm(a, learner.id, String(t));
        terms.push(res.termGrade);
        if (res.termGrade !== null) {
          sum += res.termGrade;
          count++;
        }
      }
      const fg = count > 0 ? Math.round(sum / count) : '';
      const remarkText = fg !== '' ? (fg >= 75 ? 'Passed' : 'For Intervention') : '';
      csvContent += `"${r + 1}","${learner.lrn}","${learnerDisplayName(learner)}","${learner.sex}","${blankNull(terms[0])}","${blankNull(terms[1])}","${blankNull(terms[2])}","${fg}","${remarkText}"\n`;
    }
  } else {
    // Export Active Term Grid
    const items = termAssessments(a, db.currentTerm);
    let headerRow = 'No.,Learner,Sex';
    for (let i = 0; i < items.length; i++) {
      headerRow += `,"${componentLabel(items[i].component)} - ${items[i].title}"`;
    }
    headerRow += ',Initial Grade,Transmuted Grade,Description\n';
    csvContent += headerRow;
    
    // Header Highest Possible Score
    let hpsRow = ',HPS,';
    for (let i = 0; i < items.length; i++) {
      hpsRow += `,"${items[i].maxScore}"`;
    }
    hpsRow += ',,,\n';
    csvContent += hpsRow;
    
    // Learners Row
    for (let r = 0; r < a.learners.length; r++) {
      const learner = a.learners[r];
      const result = computeTerm(a, learner.id, db.currentTerm);
      let row = `"${r + 1}","${learnerDisplayName(learner)}","${learner.sex}"`;
      for (let j = 0; j < items.length; j++) {
        const key = `${learner.id}|${items[j].id}`;
        const scoreVal = a.scores[key] === undefined ? '' : a.scores[key];
        row += `,"${scoreVal}"`;
      }
      row += `,"${result.hasData ? fmt(result.initialGrade) : ''}","${result.termGrade === null ? '' : result.termGrade}","${termDescription(a, result.termGrade)}"\n`;
      csvContent += row;
    }
  }
  
  try {
    const result = await window.electronAPI.exportCsv(csvContent);
    if (result.success) {
      toast('CSV grades data exported successfully.', 'success');
    }
  } catch (error) {
    console.error(error);
    toast('CSV export failed: ' + error.message, 'error');
  }
}

/**
 * Toggles visibility of copy-paste textarea panels.
 */
function toggleImport(mode) {
  importMode = mode;
  const panel = document.getElementById('importPanel');
  if (!mode) {
    if (panel) panel.style.display = 'none';
    showView();
    return;
  }
  
  if (mode === 'json') currentView = 'settings';
  if (mode === 'csv') currentView = 'classes';
  db.activeView = currentView;
  
  if (panel) panel.style.display = 'block';
  const importText = document.getElementById('importText');
  if (importText) importText.value = '';
  
  const titleEl = document.getElementById('importTitle');
  const helpEl = document.getElementById('importHelp');
  
  if (mode === 'json') {
    if (titleEl) titleEl.innerHTML = 'Paste JSON Backup';
    if (helpEl) helpEl.innerHTML = 'Paste raw database JSON content in the text field below to restore.';
  } else {
    if (titleEl) titleEl.innerHTML = 'Import Learners CSV Text';
    if (helpEl) helpEl.innerHTML = 'Paste CSV contents with fields: LRN, Last Name, First Name, Sex. A header line is allowed.';
  }
  showView();
}

/**
 * Processes textarea submit.
 */
function runImport() {
  const text = document.getElementById('importText').value;
  if (importMode === 'json') {
    try {
      const incoming = JSON.parse(text);
      if (!incoming.assignments) throw new Error('Invalid format.');
      db = incoming;
      normalizeDatabase();
      saveDatabase();
      toggleImport('');
      render();
      toast('JSON Backup imported.', 'success');
    } catch (e) {
      toast('Paste import failed: ' + e.message, 'error');
    }
  }
  if (importMode === 'csv') {
    importCsvLearners(text);
    toggleImport('');
    render();
  }
}

/**
 * Processes CSV rows pasted by teachers.
 */
function importCsvLearners(text) {
  const a = currentAssignment();
  if (!a) {
    toast('Select a teaching load first.', 'warning');
    return;
  }
  const lines = text.replace(/\r/g, '').split('\n');
  let added = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = trim(lines[i]);
    if (!line) continue;
    
    const cols = parseCsvLine(line);
    if (cols.length < 3) continue;
    
    // Skip header columns
    if (i === 0 && cols[0].toLowerCase().includes('lrn')) continue;
    
    const last = normalizeNamePart(cols[1]);
    const first = normalizeNamePart(cols[2]);
    const middle = cols.length > 4 ? normalizeNamePart(cols[4]) : '';
    
    a.learners.push({
      id: uid('learner'),
      lrn: trim(cols[0]),
      lastName: last,
      firstName: first,
      middleName: middle,
      displayName: formatLearnerName(last, first, middle),
      sex: cols.length > 3 ? normalizeSex(cols[3]) : ''
    });
    added++;
  }
  saveDatabase();
  sortLearners();
  toast(`Imported ${added} learners from CSV text.`, 'success');
}

/**
 * Extract structured learner objects from a sheet grid.
 */
function extractSf1Learners(table) {
  const learners = [];
  let header = null;
  let headerRowIndex = -1;
  
  for (let hr = 0; hr < table.length; hr++) {
    const det = detectSf1Header(table[hr]);
    if (!det) continue;
    if (det.sex >= 0) {
      header = det;
      headerRowIndex = hr;
      break;
    }
    if (!header) {
      header = det;
      headerRowIndex = hr;
    }
  }

  let currentSex = '';
  const start = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  for (let r = start; r < table.length; r++) {
    const row = table[r];
    const joined = row.join(' ').toUpperCase();

    if (joined === 'MALE' || joined.includes(' MALE ') || joined.includes(' BOYS ')) currentSex = 'M';
    if (joined === 'FEMALE' || joined.includes(' FEMALE ') || joined.includes(' GIRLS ')) currentSex = 'F';

    const parsed = header ? parseSf1RowWithHeader(row, header, currentSex) : parseSf1RowWithoutHeader(row, currentSex);
    if (parsed && parsed.lastName && parsed.firstName) {
      parsed.sex = normalizeSex(parsed.sex || currentSex);
      parsed.displayName = formatLearnerName(parsed.lastName, parsed.firstName, parsed.middleName);
      learners.push(parsed);
    }
  }
  return learners;
}

function detectSf1Header(row) {
  const header = { lrn: -1, name: -1, last: -1, first: -1, middle: -1, sex: -1 };
  let hits = 0;
  for (let c = 0; c < row.length; c++) {
    const cell = normalizeHeader(row[c]);
    if (!cell) continue;
    if (cell === 'lrn' || cell.includes('learner reference')) {
      header.lrn = c;
      hits++;
    }
    if (cell.includes('name') && !cell.includes('parent') && !cell.includes('guardian') && !cell.includes('father') && !cell.includes('mother')) {
      header.name = c;
      hits++;
    }
    if (cell.includes('last name') || cell === 'surname') {
      header.last = c;
      hits++;
    }
    if (cell.includes('first name') || cell === 'given name') {
      header.first = c;
      hits++;
    }
    if (cell.includes('middle name') || cell.includes('middle initial')) {
      header.middle = c;
      hits++;
    }
    if (cell === 'sex' || cell === 'gender' || cell.includes('sex') || cell.includes('gender')) {
      header.sex = c;
      hits++;
    }
  }
  if (header.last >= 0 && header.last === header.first) {
    if (header.name < 0) header.name = header.last;
    header.last = -1;
    header.first = -1;
    header.middle = -1;
  }
  if ((header.name >= 0 || (header.last >= 0 && header.first >= 0)) && header.sex >= 0) return header;
  if (hits >= 2 && (header.name >= 0 || header.last >= 0)) return header;
  return null;
}

function parseSf1RowWithHeader(row, header, fallbackSex) {
  let name = null;
  if (header.last >= 0 || header.first >= 0) {
    name = {
      lastName: normalizeNamePart(row[header.last] || ''),
      firstName: normalizeNamePart(row[header.first] || ''),
      middleName: header.middle >= 0 ? normalizeNamePart(row[header.middle] || '') : ''
    };
  } else if (header.name >= 0) {
    name = splitSf1Name(row[header.name]);
  }
  
  if (!name || !name.lastName || !name.firstName) return null;
  return {
    id: '',
    lrn: header.lrn >= 0 ? trim(row[header.lrn]) : '',
    lastName: name.lastName,
    firstName: name.firstName,
    middleName: name.middleName,
    sex: header.sex >= 0 ? normalizeSex(row[header.sex]) : normalizeSex(fallbackSex),
    displayName: ''
  };
}

function parseSf1RowWithoutHeader(row, fallbackSex) {
  let possibleName = '';
  let possibleLrn = '';
  let possibleSex = normalizeSex(fallbackSex);

  for (let c = 0; c < row.length; c++) {
    const cell = trim(row[c]);
    if (!cell) continue;
    
    const sexVal = normalizeSex(cell);
    if (sexVal) {
      possibleSex = sexVal;
      continue;
    }
    if (!possibleLrn && /^\d{10,13}$/.test(cell.replace(/\D/g, ''))) {
      possibleLrn = cell.replace(/\D/g, '');
      continue;
    }
    if (!possibleName && looksLikeLearnerName(cell)) {
      possibleName = cell;
    }
  }

  const name = splitSf1Name(possibleName);
  if (!name.lastName || !name.firstName) return null;
  return {
    id: '',
    lrn: possibleLrn,
    lastName: name.lastName,
    firstName: name.firstName,
    middleName: name.middleName,
    sex: possibleSex,
    displayName: ''
  };
}

/**
 * Standard RFC-4180 CSV line parser.
 */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (ch === '"') {
      if (inQuote && line.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
