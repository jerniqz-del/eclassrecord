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
  
  const activeProfile = dbRoot.profiles.find(p => p.id === dbRoot.activeProfileId);
  let textToExport = '';
  
  try {
    if (activeProfile && activeProfile.pinEnabled) {
      const pin = currentProfilePin;
      if (!pin) {
        toast('Backup export failed: No active PIN session. Please re-authenticate.', 'error');
        return;
      }
      const encryptedObj = await encryptPayload(JSON.stringify(db), pin);
      textToExport = JSON.stringify(encryptedObj, null, 2);
    } else {
      textToExport = JSON.stringify(db, null, 2);
    }
    
    const result = await window.electronAPI.exportJson(textToExport);
    if (result.success) {
      toast('Backup downloaded successfully.', 'success');
    }
  } catch (error) {
    console.error(error);
    toast('Download failed: ' + error.message, 'error');
  }
}

/**
 * Helper to display a PIN prompt modal for encrypted backup uploads.
 */
function promptBackupPinModal(onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '11000';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__title">PIN Protected Backup</div>
      <div class="modal__body">
        <p style="margin-top:0">This backup is encrypted and secured with a PIN. Please enter the PIN to decrypt and upload.</p>
        <div class="field">
          <label class="field-label">Enter 6-digit PIN</label>
          <input type="password" id="backupDecryptPin" class="field-input" placeholder="••••••" maxlength="6" inputmode="numeric" autocomplete="off" />
        </div>
        <div id="backupDecryptErrorMsg" class="unlock-error-msg" style="color:var(--color-error-600)"></div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-ghost btn-sm" id="btnCancelBackupDecrypt">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnConfirmBackupDecrypt">Decrypt & Import</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
  
  const pinInput = overlay.querySelector('#backupDecryptPin');
  const errorEl = overlay.querySelector('#backupDecryptErrorMsg');
  
  const submit = () => {
    const pin = pinInput.value;
    if (!pin || pin.length < 6 || !/^\d+$/.test(pin)) {
      errorEl.innerText = 'Please enter a valid 6-digit numeric PIN.';
      return;
    }
    onConfirm(pin, errorEl, close);
  };
  
  overlay.querySelector('#btnCancelBackupDecrypt').addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  });
  
  overlay.querySelector('#btnConfirmBackupDecrypt').addEventListener('click', submit);
  
  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submit();
    }
  });
  
  setTimeout(() => pinInput.focus(), 80);
}

/**
 * Triggers native open file dialog to import a JSON backup file.
 */
async function importJsonBackupFile() {
  try {
    const result = await window.electronAPI.importJson();
    if (result.success && result.content) {
      const incoming = JSON.parse(result.content);
      
      if (incoming.secureBackup) {
        promptBackupPinModal(async (pin, errorEl, closeModal) => {
          try {
            errorEl.innerText = 'Decrypting backup...';
            const decryptedText = await decryptPayload(incoming, pin);
            const decryptedDb = JSON.parse(decryptedText);
            
            if (!decryptedDb.assignments) {
              throw new Error('Decrypted backup content is missing assignments.');
            }
            
            db = decryptedDb;
            normalizeDatabase();
            await saveDatabase();
            render();
            closeModal();
            toast('Secure backup uploaded and restored successfully.', 'success');
          } catch (e) {
            console.error(e);
            errorEl.innerText = e.message || 'Incorrect PIN or corrupted backup file.';
          }
        });
      } else {
        if (!incoming.assignments) {
          throw new Error('Invalid backup file: assignments list is missing.');
        }
        db = incoming;
        normalizeDatabase();
        await saveDatabase();
        render();
        toast('Backup uploaded successfully.', 'success');
      }
    }
  } catch (error) {
    console.error(error);
    toast('Upload failed: ' + error.message, 'error');
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
  const isMapeh = isMapehSubject(a.subject);
  
  if (isMapeh && currentMapehSubTab === 'consolidated') {
    if (recordTab === 'summary') {
      // Export Consolidated Final Summary
      csvContent += 'No.,LRN,Learner,Music & Arts Final,PE & Health Final,Term 1 Consolidated,Term 2 Consolidated,Term 3 Consolidated,MAPEH Final,Remarks\n';
      for (let r = 0; r < a.learners.length; r++) {
        const learner = a.learners[r];
        
        let sumMusic = 0, countMusic = 0;
        let sumPE = 0, countPE = 0;
        const consGrades = [];

        for (let t = 1; t <= 3; t++) {
          const resMusic = computeTerm(a, learner.id, String(t), 'music_arts');
          const resPE = computeTerm(a, learner.id, String(t), 'pe_health');

          const gm = resMusic.termGrade;
          const gp = resPE.termGrade;

          if (gm !== null) {
            sumMusic += gm;
            countMusic++;
          }
          if (gp !== null) {
            sumPE += gp;
            countPE++;
          }

          let gc = '';
          if (gm !== null && gp !== null) {
            gc = Math.round((gm + gp) / 2);
          } else if (gm !== null) {
            gc = gm;
          } else if (gp !== null) {
            gc = gp;
          }
          consGrades.push(gc);
        }

        const musicFinal = countMusic > 0 ? Math.round(sumMusic / countMusic) : '';
        const peFinal = countPE > 0 ? Math.round(sumPE / countPE) : '';

        let finalConsolidated = '';
        if (musicFinal !== '' && peFinal !== '') {
          finalConsolidated = Math.round((musicFinal + peFinal) / 2);
        } else if (musicFinal !== '') {
          finalConsolidated = musicFinal;
        } else if (peFinal !== '') {
          finalConsolidated = peFinal;
        }

        const remarkText = finalConsolidated !== '' ? (finalConsolidated >= 75 ? 'Passed' : 'For Intervention') : '';
        csvContent += `"${r + 1}","${learner.lrn}","${learnerDisplayName(learner)}","${musicFinal}","${peFinal}","${consGrades[0]}","${consGrades[1]}","${consGrades[2]}","${finalConsolidated}","${remarkText}"\n`;
      }
    } else {
      // Export Consolidated Term Sheet
      const term = db.currentTerm || '1';
      csvContent += 'No.,Learner,Sex,Music & Arts Grade,PE & Health Grade,Consolidated Grade,Remarks\n';
      for (let r = 0; r < a.learners.length; r++) {
        const learner = a.learners[r];
        const resMusic = computeTerm(a, learner.id, term, 'music_arts');
        const resPE = computeTerm(a, learner.id, term, 'pe_health');

        const gMusic = resMusic.termGrade;
        const gPE = resPE.termGrade;
        
        let consolidated = '';
        if (gMusic !== null && gPE !== null) {
          consolidated = Math.round((gMusic + gPE) / 2);
        } else if (gMusic !== null) {
          consolidated = gMusic;
        } else if (gPE !== null) {
          consolidated = gPE;
        }

        const remarkText = consolidated !== '' ? (consolidated >= 75 ? 'Passed' : 'For Intervention') : '';
        csvContent += `"${r + 1}","${learnerDisplayName(learner)}","${learner.sex}","${blankNull(gMusic)}","${blankNull(gPE)}","${consolidated}","${remarkText}"\n`;
      }
    }
  } else {
    // Standard non-consolidated CSV export (or specific component of MAPEH if selected)
    const mapePart = isMapeh ? currentMapehSubTab : undefined;
    
    if (recordTab === 'summary') {
      // Export Final Grades Summary
      csvContent += 'No.,LRN,Learner,Sex,Term 1,Term 2,Term 3,Final Grade,Remarks\n';
      for (let r = 0; r < a.learners.length; r++) {
        const learner = a.learners[r];
        const terms = [];
        let sum = 0;
        let count = 0;
        for (let t = 1; t <= 3; t++) {
          const res = computeTerm(a, learner.id, String(t), mapePart);
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
      const items = termAssessments(a, db.currentTerm, mapePart);
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
        const result = computeTerm(a, learner.id, db.currentTerm, mapePart);
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
      toast('JSON Backup restored.', 'success');
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

/**
 * Compiles grading database state and exports using the Templates.xlsx Excel file.
 */
async function exportToExcelTemplate() {
  const a = currentAssignment();
  if (!a) return;
  
  toast('Compiling data for Excel template...', 'info');
  const payload = buildExcelExportPayload(a);
  
  try {
    const result = await window.electronAPI.exportExcelTemplate(payload);
    if (result.success) {
      toast(`Successfully exported to: ${result.path}`, 'success');
    }
  } catch (err) {
    console.error(err);
    toast('Excel export failed: ' + err.message, 'error');
  }
}

function buildExcelExportPayload(a) {
  const isMapeh = isMapehSubject(a.subject);
  
  const baseData = {
    schoolName: db.schoolName || '',
    schoolId: db.schoolId || '',
    region: db.region || '',
    division: db.division || '',
    schoolYear: db.schoolYear || '',
    gradeLevel: a.gradeLevel,
    section: a.section,
    subject: a.subject,
    teacherName: db.teacherName || '',
    isMapeh: isMapeh
  };

  if (!isMapeh) {
    const males = a.learners.filter(l => l.sex === 'M');
    const females = a.learners.filter(l => l.sex === 'F');

    baseData.males = males.map(student => compileStudentExcelData(a, student, undefined));
    baseData.females = females.map(student => compileStudentExcelData(a, student, undefined));
    baseData.terms = {
      '1': compileTermHps(a, '1', undefined),
      '2': compileTermHps(a, '2', undefined),
      '3': compileTermHps(a, '3', undefined)
    };
  } else {
    baseData.music_arts = {
      ...baseData,
      males: a.learners.filter(l => l.sex === 'M').map(student => compileStudentExcelData(a, student, 'music_arts')),
      females: a.learners.filter(l => l.sex === 'F').map(student => compileStudentExcelData(a, student, 'music_arts')),
      terms: {
        '1': compileTermHps(a, '1', 'music_arts'),
        '2': compileTermHps(a, '2', 'music_arts'),
        '3': compileTermHps(a, '3', 'music_arts')
      }
    };
    
    baseData.pe_health = {
      ...baseData,
      males: a.learners.filter(l => l.sex === 'M').map(student => compileStudentExcelData(a, student, 'pe_health')),
      females: a.learners.filter(l => l.sex === 'F').map(student => compileStudentExcelData(a, student, 'pe_health')),
      terms: {
        '1': compileTermHps(a, '1', 'pe_health'),
        '2': compileTermHps(a, '2', 'pe_health'),
        '3': compileTermHps(a, '3', 'pe_health')
      }
    };
    
    baseData.consolidated = {
      males: a.learners.filter(l => l.sex === 'M').map(student => compileStudentConsolidatedExcelData(a, student)),
      females: a.learners.filter(l => l.sex === 'F').map(student => compileStudentConsolidatedExcelData(a, student))
    };
  }
  
  return baseData;
}

function compileStudentExcelData(a, student, mapePart) {
  const terms = {};
  let finalGrade = null;
  let term1 = null, term2 = null, term3 = null;
  let termCount = 0;
  let sum = 0;
  
  for (let t = 1; t <= 3; t++) {
    const termStr = String(t);
    const result = computeTerm(a, student.id, termStr, mapePart);
    const wwAssessments = termAssessments(a, termStr, mapePart).filter(x => x.component === 'WW');
    const ptAssessments = termAssessments(a, termStr, mapePart).filter(x => x.component === 'PT');
    const sa1Ast = termAssessments(a, termStr, mapePart).find(x => x.component === 'SA1' || x.component === 'ST1');
    const sa2Ast = termAssessments(a, termStr, mapePart).find(x => x.component === 'SA2' || x.component === 'ST2');
    const teAst = termAssessments(a, termStr, mapePart).find(x => x.component === 'TE');
    
    const wwScores = wwAssessments.map(ast => {
      const val = a.scores[`${student.id}|${ast.id}`];
      return (val !== undefined && val !== '') ? parseFloat(val) : '';
    });
    const ptScores = ptAssessments.map(ast => {
      const val = a.scores[`${student.id}|${ast.id}`];
      return (val !== undefined && val !== '') ? parseFloat(val) : '';
    });
    const sa1Score = sa1Ast ? a.scores[`${student.id}|${sa1Ast.id}`] : '';
    const sa2Score = sa2Ast ? a.scores[`${student.id}|${sa2Ast.id}`] : '';
    const teScore = teAst ? a.scores[`${student.id}|${teAst.id}`] : '';
    
    terms[termStr] = {
      ww: wwScores,
      wwTotal: result.ww.hasData ? result.ww.raw : '',
      wwPS: result.ww.hasData ? result.ww.ps : '',
      wwWS: result.ww.hasData ? (result.ww.ps * weightsFor(a.subjectGroup)[0] / 100) : '',
      
      pt: ptScores,
      ptTotal: result.pt.hasData ? result.pt.raw : '',
      ptPS: result.pt.hasData ? result.pt.ps : '',
      ptWS: result.pt.hasData ? (result.pt.ps * weightsFor(a.subjectGroup)[1] / 100) : '',
      
      sa1: (sa1Score !== undefined && sa1Score !== '') ? parseFloat(sa1Score) : '',
      sa2: (sa2Score !== undefined && sa2Score !== '') ? parseFloat(sa2Score) : '',
      te: (teScore !== undefined && teScore !== '') ? parseFloat(teScore) : '',
      saTotal: result.hasData ? (result.st1.raw + result.st2.raw + result.te.raw) : '',
      saPS: result.hasData ? result.examPS : '',
      saWS: result.hasData ? (result.examPS * weightsFor(a.subjectGroup)[2] / 100) : '',
      
      initialGrade: result.hasData ? result.initialGrade : '',
      termGrade: result.termGrade !== null ? result.termGrade : '',
      desc: result.termGrade !== null ? termDescription(a, result.termGrade) : ''
    };
    
    if (result.termGrade !== null) {
      sum += result.termGrade;
      termCount++;
      if (t === 1) term1 = result.termGrade;
      if (t === 2) term2 = result.termGrade;
      if (t === 3) term3 = result.termGrade;
    }
  }
  
  if (termCount > 0) {
    finalGrade = Math.round(sum / termCount);
  }
  
  return {
    name: formatLearnerName(student.lastName, student.firstName, student.middleName),
    terms,
    final: {
      term1: term1 !== null ? term1 : '',
      term2: term2 !== null ? term2 : '',
      term3: term3 !== null ? term3 : '',
      finalGrade: finalGrade !== null ? finalGrade : '',
      remarks: finalGrade !== null ? plainFinalRemark(a, finalGrade) : ''
    }
  };
}

function compileTermHps(a, term, mapePart) {
  const termStr = String(term);
  const wwAssessments = termAssessments(a, termStr, mapePart).filter(x => x.component === 'WW');
  const ptAssessments = termAssessments(a, termStr, mapePart).filter(x => x.component === 'PT');
  const sa1Ast = termAssessments(a, termStr, mapePart).find(x => x.component === 'SA1' || x.component === 'ST1');
  const sa2Ast = termAssessments(a, termStr, mapePart).find(x => x.component === 'SA2' || x.component === 'ST2');
  const teAst = termAssessments(a, termStr, mapePart).find(x => x.component === 'TE');
  
  const wwHps = wwAssessments.map(ast => (ast.maxScore !== undefined && ast.maxScore !== '') ? number(ast.maxScore) : '');
  const ptHps = ptAssessments.map(ast => (ast.maxScore !== undefined && ast.maxScore !== '') ? number(ast.maxScore) : '');
  const sa1Hps = (sa1Ast && sa1Ast.maxScore !== '') ? number(sa1Ast.maxScore) : '';
  const sa2Hps = (sa2Ast && sa2Ast.maxScore !== '') ? number(sa2Ast.maxScore) : '';
  const teHps = (teAst && teAst.maxScore !== '') ? number(teAst.maxScore) : '';
  
  return {
    wwHps,
    ptHps,
    sa1Hps,
    sa2Hps,
    teHps
  };
}

function compileStudentConsolidatedExcelData(a, student) {
  const name = formatLearnerName(student.lastName, student.firstName, student.middleName);
  
  const res1Music = computeTerm(a, student.id, '1', 'music_arts');
  const res1PE = computeTerm(a, student.id, '1', 'pe_health');
  const g1Music = res1Music.termGrade;
  const g1PE = res1PE.termGrade;
  let g1Cons = '';
  if (g1Music !== null && g1PE !== null) g1Cons = Math.round((g1Music + g1PE) / 2);
  else if (g1Music !== null) g1Cons = g1Music;
  else if (g1PE !== null) g1Cons = g1PE;
  
  const res2Music = computeTerm(a, student.id, '2', 'music_arts');
  const res2PE = computeTerm(a, student.id, '2', 'pe_health');
  const g2Music = res2Music.termGrade;
  const g2PE = res2PE.termGrade;
  let g2Cons = '';
  if (g2Music !== null && g2PE !== null) g2Cons = Math.round((g2Music + g2PE) / 2);
  else if (g2Music !== null) g2Cons = g2Music;
  else if (g2PE !== null) g2Cons = g2PE;
  
  const res3Music = computeTerm(a, student.id, '3', 'music_arts');
  const res3PE = computeTerm(a, student.id, '3', 'pe_health');
  const g3Music = res3Music.termGrade;
  const g3PE = res3PE.termGrade;
  let g3Cons = '';
  if (g3Music !== null && g3PE !== null) g3Cons = Math.round((g3Music + g3PE) / 2);
  else if (g3Music !== null) g3Cons = g3Music;
  else if (g3PE !== null) g3Cons = g3PE;
  
  let musicFinal = '', peFinal = '', finalConsolidated = '', remarks = '';
  let sumMusic = 0, countMusic = 0;
  let sumPE = 0, countPE = 0;
  
  if (g1Music !== null) { sumMusic += g1Music; countMusic++; }
  if (g2Music !== null) { sumMusic += g2Music; countMusic++; }
  if (g3Music !== null) { sumMusic += g3Music; countMusic++; }
  
  if (g1PE !== null) { sumPE += g1PE; countPE++; }
  if (g2PE !== null) { sumPE += g2PE; countPE++; }
  if (g3PE !== null) { sumPE += g3PE; countPE++; }
  
  if (countMusic > 0) musicFinal = Math.round(sumMusic / countMusic);
  if (countPE > 0) peFinal = Math.round(sumPE / countPE);
  
  if (musicFinal !== '' && peFinal !== '') {
    finalConsolidated = Math.round((musicFinal + peFinal) / 2);
  } else if (musicFinal !== '') {
    finalConsolidated = musicFinal;
  } else if (peFinal !== '') {
    finalConsolidated = peFinal;
  }
  
  if (finalConsolidated !== '') {
    remarks = plainFinalRemark(a, finalConsolidated);
  }
  
  return {
    name,
    t1Music: g1Music !== null ? g1Music : '',
    t1PE: g1PE !== null ? g1PE : '',
    t1Cons: g1Cons,
    t2Music: g2Music !== null ? g2Music : '',
    t2PE: g2PE !== null ? g2PE : '',
    t2Cons: g2Cons,
    t3Music: g3Music !== null ? g3Music : '',
    t3PE: g3PE !== null ? g3PE : '',
    t3Cons: g3Cons,
    musicFinal,
    peFinal,
    finalConsolidated,
    remarks
  };
}

function plainFinalRemark(a, grade) {
  if (grade === null || grade === undefined || grade === '') return '';
  const isPass = grade >= 75;
  const desc = descriptor(grade);
  if (isKeyStage2(a)) return desc;
  return isPass ? `Passed - ${desc}` : `For Intervention - ${desc}`;
}

