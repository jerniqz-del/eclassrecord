/**
 * E-Class Record — Learner Management Module
 *
 * Implements CRUD actions for student rosters, name parsing/formatting,
 * sorting by gender and alphabetical order, and parsing logic for imports.
 */

/**
 * Validates inputs and adds a single learner to the current teaching load.
 */
function addLearner() {
  const a = currentAssignment();
  if (!a) {
    toast('Add a teaching load first.', 'warning');
    return;
  }
  
  const lrnInput = document.getElementById('learnerLrn');
  const lastInput = document.getElementById('learnerLast');
  const firstInput = document.getElementById('learnerFirst');
  const sexInput = document.getElementById('learnerSex');
  
  const learner = {
    id: uid('learner'),
    lrn: trim(lrnInput.value),
    lastName: normalizeNamePart(lastInput.value),
    firstName: normalizeNamePart(firstInput.value),
    sex: sexInput.value
  };
  
  if (!learner.lastName && !learner.firstName) {
    toast('Enter at least a learner name.', 'warning');
    return;
  }
  
  learner.displayName = formatLearnerName(learner.lastName, learner.firstName, '');
  a.learners.push(learner);
  
  // Reset fields
  lrnInput.value = '';
  lastInput.value = '';
  firstInput.value = '';
  sexInput.value = '';
  lastInput.focus();
  
  saveDatabase();
  render();
  toast('Learner added.', 'success');
}



/**
 * Sorts learners by gender (Boys first, Girls second) and then alphabetically.
 */
function sortLearners() {
  const a = currentAssignment();
  if (!a) return;
  
  a.learners.sort((x, y) => {
    const sx = sexRank(x.sex);
    const sy = sexRank(y.sex);
    if (sx !== sy) return sx - sy;
    
    const ax = learnerDisplayName(x).toLowerCase();
    const ay = learnerDisplayName(y).toLowerCase();
    return ax.localeCompare(ay, 'fil'); // Proper Tagalog/Filipino alphabet sorting
  });
  
  saveDatabase();
  render();
  toast('Learner list sorted.', 'success');
}

/**
 * Formats a learner's name: Last Name, First Name M.I.
 */
function formatLearnerName(lastName, firstName, middleName) {
  lastName = normalizeNamePart(lastName);
  firstName = normalizeNamePart(firstName);
  middleName = normalizeNamePart(middleName);
  const mi = middleInitial(middleName);
  return lastName + ', ' + firstName + (mi ? ' ' + mi : '');
}

/**
 * Safe retrieval of display name.
 */
function learnerDisplayName(learner) {
  if (learner.displayName) return learner.displayName;
  return formatLearnerName(learner.lastName, learner.firstName, learner.middleName || '');
}

/**
 * Computes middle initial with trailing period if present.
 */
function middleInitial(middleName) {
  middleName = normalizeNamePart(middleName).replace(/\./g, '');
  if (!middleName || middleName === '-') return '';
  return middleName.charAt(0).toUpperCase() + '.';
}

/**
 * Cleans spaces within string name components.
 */
function normalizeNamePart(value) {
  return trim(value).replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}

/**
 * Resolves variations of Sex inputs into standard M or F.
 */
function normalizeSex(value) {
  value = trim(value).toUpperCase();
  if (['M', 'MALE', 'BOY', 'BOYS'].includes(value)) return 'M';
  if (['F', 'FEMALE', 'GIRL', 'GIRLS'].includes(value)) return 'F';
  return '';
}

/**
 * Order weight for sex groups.
 */
function sexRank(value) {
  const resolved = normalizeSex(value);
  if (resolved === 'M') return 1;
  if (resolved === 'F') return 2;
  return 3;
}

/**
 * Normalises headers for table extraction checks.
 */
function normalizeHeader(value) {
  return trim(value).toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Validates whether string contains a valid learner name style.
 */
function looksLikeLearnerName(value) {
  value = trim(value);
  if (!value || value.length < 3) return false;
  if (/^\d+$/.test(value.replace(/\D/g, ''))) return false; // Not a phone/LRN number
  
  const upper = value.toUpperCase();
  if (upper.includes('TOTAL') || upper.includes('SCHOOL') || upper.includes('GRADE')) return false;
  
  return value.includes(',') || value.split(/\s+/).length >= 2;
}

/**
 * Checks if token looks like a middle name/initial.
 */
function isMiddleToken(value) {
  value = trim(value).replace(/\./g, '');
  if (!value) return false;
  if (value.length === 1) return true;
  return /^[A-Za-zÑñ]+$/.test(value);
}

/**
 * Splits a full name string into components (Last, First, Middle).
 */
function splitSf1Name(raw) {
  raw = normalizeNamePart(raw);
  raw = raw.replace(/\s+(MALE|FEMALE|M|F)$/i, '');
  const upperRaw = raw.toUpperCase();
  
  if (!raw || upperRaw === 'NAME' || upperRaw.includes('LEARNER') || upperRaw.includes('TOTAL') || upperRaw.includes('COMBINED') || upperRaw.includes('GENERATED')) {
    return { lastName: '', firstName: '', middleName: '' };
  }

  if (raw.includes(',')) {
    const parts = raw.split(',');
    const last = normalizeNamePart(parts[0]);
    let first = normalizeNamePart(parts.length > 1 ? parts[1] : '');
    const explicitMiddle = parts.length > 2;
    let middle = normalizeNamePart(explicitMiddle ? parts.slice(2).join(' ') : '');
    
    if (!middle && !explicitMiddle) {
      const tokens = first.split(/\s+/);
      if (tokens.length > 1 && isMiddleToken(tokens[tokens.length - 1])) {
        middle = tokens.pop();
        first = normalizeNamePart(tokens.join(' '));
      }
    }
    return { lastName: last, firstName: first, middleName: middle };
  }

  const words = raw.split(/\s+/);
  if (words.length < 2) {
    return { lastName: '', firstName: '', middleName: '' };
  }
  
  const middleName = words.length > 2 ? words.pop() : '';
  const lastName = words.shift();
  return {
    lastName: normalizeNamePart(lastName),
    firstName: normalizeNamePart(words.join(' ')),
    middleName: normalizeNamePart(middleName)
  };
}

/**
 * Renders a structured list of students currently enrolled in the active load.
 */
function renderLearnersRoster() {
  const target = document.getElementById('classRosterContainer');
  if (!target) return;
  
  const a = currentAssignment();
  if (!a) {
    target.innerHTML = '';
    return;
  }
  
  if (a.learners.length === 0) {
    target.innerHTML = `
      <div class="text-muted text-sm" style="padding:var(--space-4);text-align:center">
        No learners registered in this class roster. Upload an SF1 spreadsheet or add a learner to get started.
      </div>
    `;
    return;
  }
  
  let html = `
    <table class="roster-table" style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid var(--border-color);text-align:left">
          <th style="padding:var(--space-2);width:8%">No.</th>
          <th style="padding:var(--space-2);width:25%">LRN</th>
          <th style="padding:var(--space-2)">Name</th>
          <th style="padding:var(--space-2);width:15%">Sex</th>
          <th style="padding:var(--space-2);width:10%;text-align:center">Action</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  for (let i = 0; i < a.learners.length; i++) {
    const l = a.learners[i];
    
    let badgeHtml = '';
    let exportBtnHtml = '';
    if (l.transferredOutTerm) {
      badgeHtml = ` <span style="font-size:10px; padding:2px 6px; margin-left:6px; border-radius:4px; font-weight:600; background: rgba(255, 193, 7, 0.15); color: #ffb703; border: 1px solid #ffb703;">T/O (Term ${l.transferredOutTerm})</span>`;
      exportBtnHtml = `
        <button class="btn btn-olive btn-sm" style="padding:var(--space-1) var(--space-2); margin-right: 4px;" 
          title="Export Learner Transfer File" 
          onclick="exportLearnerTransferFile('${esc(l.id)}')">
          Export
        </button>
      `;
    } else if (l.transferredInGrades) {
      badgeHtml = ` <span style="font-size:10px; padding:2px 6px; margin-left:6px; border-radius:4px; font-weight:600; background: rgba(46, 125, 50, 0.15); color: #81c784; border: 1px solid #81c784;" title="Grades imported for Term(s): ${Object.keys(l.transferredInGrades).join(', ')}">T/I</span>`;
      exportBtnHtml = `
        <button class="btn btn-olive btn-sm" style="padding:var(--space-1) var(--space-2); margin-right: 4px;" 
          title="Export Learner Transfer File" 
          onclick="exportLearnerTransferFile('${esc(l.id)}')">
          Export
        </button>
      `;
    } else {
      exportBtnHtml = `
        <button class="btn btn-ghost btn-sm" style="padding:var(--space-1) var(--space-2); margin-right: 4px; border: 1px solid var(--border-color);" 
          title="Export Learner Transfer File" 
          onclick="exportLearnerTransferFile('${esc(l.id)}')">
          Export
        </button>
      `;
    }

    html += `
      <tr style="border-bottom:1px solid var(--border-color); ${l.transferredOutTerm ? 'opacity: 0.65;' : ''}">
        <td style="padding:var(--space-2)">${i + 1}</td>
        <td style="padding:var(--space-2)">${esc(l.lrn || '—')}</td>
        <td style="padding:var(--space-2)"><strong>${esc(learnerDisplayName(l))}</strong>${badgeHtml}</td>
        <td style="padding:var(--space-2)">${esc(l.sex || '—')}</td>
        <td style="padding:var(--space-2);text-align:center">
          ${exportBtnHtml}
          <button class="btn btn-warn btn-sm" style="padding:var(--space-1) var(--space-2)" 
            title="Manage status and removal" 
            onclick="removeLearner('${esc(l.id)}')">
            Manage
          </button>
        </td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  target.innerHTML = html;
}

/**
 * Removes an individual student from the roster list with confirmation or options to mark as Transferred Out.
 */
function removeLearner(learnerId) {
  const a = currentAssignment();
  if (!a) return;
  
  const learner = a.learners.find(x => x.id === learnerId);
  if (!learner) return;
  
  const isTransferredOut = !!learner.transferredOutTerm;
  const isTransferredIn = !!learner.transferredInGrades;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '12000';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 500px; width: 90%;">
      <div class="modal__title">Manage Learner: ${esc(learnerDisplayName(learner))}</div>
      <div class="modal__body">
        ${(isTransferredOut || isTransferredIn) ? `
          <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid var(--color-warning-600); padding: var(--space-2); border-radius: 4px; margin-bottom: var(--space-3); display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; color: var(--color-warning-600);">
              Status: ${isTransferredOut ? `Transferred Out (Term ${learner.transferredOutTerm})` : 'Transferred In'}
            </span>
            <button class="btn btn-sm btn-ghost" id="btnRestoreActive" style="padding: var(--space-1) var(--space-2);">Restore to Active</button>
          </div>
        ` : ''}
        <p style="margin-top:0">Choose an action for this student. If the student has transferred out mid-year, mark them as Transferred Out to preserve completed term grades.</p>
        
        <div class="field" style="margin-top: var(--space-4);">
          <label class="field-label">Exit/Transfer Term</label>
          <select id="transferOutTermSelect" class="field-select">
            <option value="1">Transferred Out after Term 1 (Term 1 grade is preserved)</option>
            <option value="2">Transferred Out after Term 2 (Term 1 & 2 grades are preserved)</option>
            <option value="3">Transferred Out after Term 3 (Term 1, 2 & 3 grades are preserved)</option>
          </select>
        </div>
      </div>
      <div class="modal__actions" style="display: flex; flex-direction: column; gap: var(--space-2); width: 100%;">
        <div style="display: flex; gap: var(--space-2); width: 100%;">
          <button class="btn btn-primary" id="btnMarkTransferredOut" style="flex: 1;">
            Mark as Transferred Out
          </button>
          <button class="btn btn-ghost" id="btnCancelTransfer" style="width: 100px;">
            Cancel
          </button>
        </div>
        <div style="border-top: 1px solid var(--border-color); margin: var(--space-2) 0; padding-top: var(--space-2); display: flex; justify-content: flex-end; width: 100%;">
          <button class="btn btn-warn btn-sm" id="btnDeletePermanently">
            Delete Student Permanently
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  overlay.querySelector('#btnCancelTransfer').addEventListener('click', close);

  if (isTransferredOut || isTransferredIn) {
    overlay.querySelector('#btnRestoreActive').addEventListener('click', () => {
      delete learner.transferredOutTerm;
      delete learner.transferredInGrades;
      saveDatabase();
      render();
      close();
      toast(`${learnerDisplayName(learner)} status reset to active.`, 'success');
    });
  }

  overlay.querySelector('#btnMarkTransferredOut').addEventListener('click', () => {
    const term = overlay.querySelector('#transferOutTermSelect').value;
    close();
    
    // Mark as transferred out
    learner.transferredOutTerm = term;
    
    saveDatabase();
    render();
    
    toast(`${learnerDisplayName(learner)} marked as Transferred Out in Term ${term}.`, 'success');
    
    // Prompt to export transfer file
    confirmModal(
      'Export Transfer File',
      `Would you like to export the transfer file for ${learnerDisplayName(learner)} now?`,
      () => {
        exportLearnerTransferFile(learner.id);
      }
    );
  });

  overlay.querySelector('#btnDeletePermanently').addEventListener('click', () => {
    close();
    confirmModal(
      'Delete Permanently',
      `Are you sure you want to permanently delete ${learnerDisplayName(learner)} and all associated scores? This action cannot be undone.`,
      () => {
        a.learners = a.learners.filter(x => x.id !== learnerId);
        for (const key in a.scores) {
          if (key.startsWith(learnerId + '|')) {
            delete a.scores[key];
          }
        }
        saveDatabase();
        render();
        toast('Learner permanently deleted.', 'success');
      }
    );
  });
}
