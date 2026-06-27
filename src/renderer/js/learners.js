/**
 * E-Class Record — Learner Management Module
 *
 * Implements CRUD actions for student rosters, name parsing/formatting,
 * sorting by gender and alphabetical order, and parsing logic for imports.
 */

/**
 * Displays a popup modal to add a new learner to the active class roster.
 */
function showAddLearnerModal() {
  const a = currentAssignment();
  if (!a) {
    toast('Add a teaching load first.', 'warning');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '12000';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 500px; width: 90%;">
      <div class="modal__title">Add New Learner</div>
      <div class="modal__body">
        <div class="field" style="margin-bottom: var(--space-3);">
          <label class="field-label">Learner Reference Number (LRN)</label>
          <input id="modalLearnerLrn" class="field-input" placeholder="e.g. 101234567890" maxlength="12" />
        </div>
        <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-3);">
          <div class="field" style="flex: 1; margin-bottom: 0;">
            <label class="field-label">Last Name</label>
            <input id="modalLearnerLast" class="field-input" placeholder="e.g. Dela Cruz" />
          </div>
          <div class="field" style="flex: 1; margin-bottom: 0;">
            <label class="field-label">First Name</label>
            <input id="modalLearnerFirst" class="field-input" placeholder="e.g. Juan" />
          </div>
        </div>
        <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div class="field" style="flex: 1; margin-bottom: 0;">
            <label class="field-label">Middle Name</label>
            <input id="modalLearnerMiddle" class="field-input" placeholder="Middle Name (Optional)" />
          </div>
          <div class="field" style="flex: 1; margin-bottom: 0;">
            <label class="field-label">Sex</label>
            <select id="modalLearnerSex" class="field-select">
              <option value=""></option>
              <option value="M">Male / Boy</option>
              <option value="F">Female / Girl</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-warn btn-sm" id="btnCancelAddLearner">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnConfirmAddLearner">Add Learner</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  overlay.querySelector('#btnCancelAddLearner').addEventListener('click', close);

  const lrnInput = overlay.querySelector('#modalLearnerLrn');
  const lastInput = overlay.querySelector('#modalLearnerLast');
  const firstInput = overlay.querySelector('#modalLearnerFirst');
  const middleInput = overlay.querySelector('#modalLearnerMiddle');
  const sexInput = overlay.querySelector('#modalLearnerSex');
  const confirmBtn = overlay.querySelector('#btnConfirmAddLearner');

  const submit = () => {
    const lrn = trim(lrnInput.value);
    const lastName = normalizeNamePart(lastInput.value);
    const firstName = normalizeNamePart(firstInput.value);
    const middleName = normalizeNamePart(middleInput.value);
    const sex = sexInput.value;

    if (!lastName && !firstName) {
      toast('Enter at least a learner name.', 'warning');
      return;
    }

    const learner = {
      id: uid('learner'),
      lrn: lrn,
      lastName: lastName,
      firstName: firstName,
      middleName: middleName,
      sex: sex
    };

    learner.displayName = formatLearnerName(learner.lastName, learner.firstName, learner.middleName);
    a.learners.push(learner);

    saveDatabase();
    render();
    close();
    toast('Learner added.', 'success');
  };

  confirmBtn.addEventListener('click', submit);

  overlay.querySelectorAll('input').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submit();
      }
    });
  });

  setTimeout(() => lastInput.focus(), 80);
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
  const otherAssignments = (db.assignments || []).filter(x => x.id !== a.id);

  const transferSectionHtml = otherAssignments.length > 0 ? `
        <div style="border-bottom: 1px solid var(--border-color); margin-bottom: var(--space-4); padding-bottom: var(--space-4);">
          <h3 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--font-size-md); font-weight: 600; color: var(--text-primary);">Transfer Student Directly</h3>
          <p style="margin-top:0; font-size: 12px; color: var(--text-secondary);">Directly move this student to another class in this profile, preserving completed term grades.</p>
          
          <div style="display: flex; gap: var(--space-2); align-items: flex-end;">
            <div class="field" style="flex: 1; margin-bottom: 0;">
              <label class="field-label">Target Class Load</label>
              <select id="directTransferClassSelect" class="field-select">
                <option value="">-- Select Class --</option>
                ${otherAssignments.map(asg => `
                  <option value="${esc(asg.id)}">${esc(asg.gradeLevel)} - ${esc(asg.section)} (${esc(asg.subject)})</option>
                `).join('')}
              </select>
            </div>
            <div class="field" style="width: 140px; margin-bottom: 0;">
              <label class="field-label">Transfer Term</label>
              <select id="directTransferTermSelect" class="field-select">
                <option value="1">Term 1 Only</option>
                <option value="2">Terms 1 & 2</option>
                <option value="3">Terms 1, 2 & 3</option>
              </select>
            </div>
          </div>
          <button class="btn btn-olive btn-sm" id="btnDirectTransferSubmit" style="width: 100%; margin-top: var(--space-3);" disabled>
            Execute Direct Transfer
          </button>
        </div>
  ` : '';

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

        <!-- Edit Learner Profile Info -->
        <div style="border-bottom: 1px solid var(--border-color); margin-bottom: var(--space-4); padding-bottom: var(--space-4);">
          <h3 style="margin-top: 0; margin-bottom: var(--space-3); font-size: var(--font-size-md); font-weight: 600; color: var(--text-primary);">Edit Learner Information</h3>
          <div class="field" style="margin-bottom: var(--space-3);">
            <label class="field-label">Learner Reference Number (LRN)</label>
            <input id="editLearnerLrn" class="field-input" value="${esc(learner.lrn || '')}" maxlength="12" placeholder="e.g. 101234567890" />
          </div>
          <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div class="field" style="flex: 1; margin-bottom: 0;">
              <label class="field-label">Last Name</label>
              <input id="editLearnerLast" class="field-input" value="${esc(learner.lastName || '')}" placeholder="Last Name" />
            </div>
            <div class="field" style="flex: 1; margin-bottom: 0;">
              <label class="field-label">First Name</label>
              <input id="editLearnerFirst" class="field-input" value="${esc(learner.firstName || '')}" placeholder="First Name" />
            </div>
          </div>
          <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
            <div class="field" style="flex: 1; margin-bottom: 0;">
              <label class="field-label">Middle Name</label>
              <input id="editLearnerMiddle" class="field-input" value="${esc(learner.middleName || '')}" placeholder="Middle Name (Optional)" />
            </div>
            <div class="field" style="flex: 1; margin-bottom: 0;">
              <label class="field-label">Sex</label>
              <select id="editLearnerSex" class="field-select">
                <option value="M" ${learner.sex === 'M' ? 'selected' : ''}>Male / Boy</option>
                <option value="F" ${learner.sex === 'F' ? 'selected' : ''}>Female / Girl</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btnSaveLearnerInfo" style="width: 100%;">
            Save Profile Info
          </button>
        </div>
        
        ${transferSectionHtml}
        
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

  const transferClassSelect = overlay.querySelector('#directTransferClassSelect');
  const transferSubmitBtn = overlay.querySelector('#btnDirectTransferSubmit');
  
  if (transferClassSelect && transferSubmitBtn) {
    transferClassSelect.addEventListener('change', () => {
      transferSubmitBtn.disabled = !transferClassSelect.value;
    });

    transferSubmitBtn.addEventListener('click', () => {
      const targetClassId = transferClassSelect.value;
      const term = overlay.querySelector('#directTransferTermSelect').value;
      
      const targetAsg = db.assignments.find(x => x.id === targetClassId);
      if (!targetAsg) return;

      const isDuplicate = targetAsg.learners.some(l => {
        const lrnMatch = l.lrn && learner.lrn && l.lrn === learner.lrn;
        const nameMatch = l.lastName.toLowerCase() === learner.lastName.toLowerCase() &&
                          l.firstName.toLowerCase() === learner.firstName.toLowerCase();
        return lrnMatch || nameMatch;
      });
      if (isDuplicate) {
        toast(`Transfer failed: Student is already registered in ${targetAsg.gradeLevel} - ${targetAsg.section}.`, 'error');
        return;
      }

      close();

      confirmModal(
        'Confirm Direct Transfer',
        `Are you sure you want to transfer ${learnerDisplayName(learner)} directly to ${targetAsg.gradeLevel} - ${targetAsg.section}? This will also mark them as Transferred Out in the current class after Term ${term}.`,
        () => {
          learner.transferredOutTerm = term;

          const compGrades = {};
          for (let t = 1; t <= parseInt(term); t++) {
            const g = getLearnerTermGradeForExport(a, learner.id, String(t));
            if (g !== null && g !== undefined && g !== '') {
              compGrades[String(t)] = g;
            }
          }

          const targetLearner = {
            id: uid('learner'),
            lrn: learner.lrn || '',
            lastName: learner.lastName,
            firstName: learner.firstName,
            middleName: learner.middleName || '',
            sex: learner.sex,
            transferredInGrades: compGrades
          };
          targetLearner.displayName = formatLearnerName(targetLearner.lastName, targetLearner.firstName, targetLearner.middleName);

          targetAsg.learners.push(targetLearner);
          targetAsg.learners.sort((x, y) => {
            const sx = sexRank(x.sex);
            const sy = sexRank(y.sex);
            if (sx !== sy) return sx - sy;
            const ax = learnerDisplayName(x).toLowerCase();
            const ay = learnerDisplayName(y).toLowerCase();
            return ax.localeCompare(ay, 'fil');
          });

          saveDatabase();
          render();
          toast(`Successfully transferred ${learnerDisplayName(learner)} to ${targetAsg.gradeLevel} - ${targetAsg.section}!`, 'success');
        }
      );
    });
  }

  overlay.querySelector('#btnCancelTransfer').addEventListener('click', close);

  overlay.querySelector('#btnSaveLearnerInfo').addEventListener('click', () => {
    const editLrn = trim(overlay.querySelector('#editLearnerLrn').value);
    const editLast = normalizeNamePart(overlay.querySelector('#editLearnerLast').value);
    const editFirst = normalizeNamePart(overlay.querySelector('#editLearnerFirst').value);
    const editMiddle = normalizeNamePart(overlay.querySelector('#editLearnerMiddle').value);
    const editSex = overlay.querySelector('#editLearnerSex').value;

    if (!editLast && !editFirst) {
      toast('Enter at least a learner name.', 'warning');
      return;
    }

    learner.lrn = editLrn;
    learner.lastName = editLast;
    learner.firstName = editFirst;
    learner.middleName = editMiddle;
    learner.sex = editSex;
    learner.displayName = formatLearnerName(editLast, editFirst, editMiddle);

    saveDatabase();
    render();
    close();
    toast('Learner profile updated.', 'success');
  });

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

/**
 * Displays a modal allowing teachers to bulk-paste a list of learners,
 * parse them in real-time, preview gender/LRN assignments, and import them.
 */
function showBulkAddLearnersModal() {
  const a = currentAssignment();
  if (!a) {
    toast('Add a teaching load first.', 'warning');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '12000';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 850px; width: 95%;">
      <div class="modal__title">Bulk Add Learners</div>
      <div class="modal__body">
        <div class="bulk-modal-grid">
          <!-- Left Column: Input and Settings -->
          <div class="bulk-textarea-wrap">
            <div class="field" style="margin-bottom: var(--space-3); display: flex; flex-direction: column; flex: 1;">
              <label class="field-label">Copy-paste Learner List (one per line)</label>
              <div class="text-xs text-muted" style="margin-bottom: var(--space-2); line-height: 1.4;">
                Accepted formats:<br>
                • <code>Last Name, First Name Middle Name</code> (e.g. <code>Dela Cruz, Juan Abad</code>)<br>
                • <code>First Name Middle Name Last Name</code> (e.g. <code>Juan Abad Dela Cruz</code>)<br>
                • Delimited (CSV/Excel copy): <code>LRN, Last, First, Sex, Middle</code>
              </div>
              <textarea id="bulkLearnersText" class="field-textarea bulk-textarea" placeholder="Paste student names/list here..."></textarea>
            </div>
            
            <div class="field" style="margin-bottom: 0;">
              <label class="field-label">Assign Sex (Gender)</label>
              <select id="bulkLearnersGenderDefault" class="field-select">
                <option value="auto">Auto-detect from pasted row (CSV/Delimited)</option>
                <option value="M">All Males / Boys</option>
                <option value="F">All Females / Girls</option>
              </select>
              <div class="text-xs text-muted" style="margin-top: 4px;">
                Selecting "All Males" or "All Females" will assign that gender to all parsed students, ignoring auto-detection.
              </div>
            </div>
          </div>
          
          <!-- Right Column: Live Preview -->
          <div class="bulk-preview-wrap">
            <div class="bulk-preview-header">
              <label class="field-label" style="margin-bottom: 0;">Parse Preview</label>
              <div class="bulk-preview-summary-badges" id="bulkPreviewSummaryBadges" style="display: none;">
                <span class="bulk-badge bulk-badge--male" id="bulkCountMale">0 Boys</span>
                <span class="bulk-badge bulk-badge--female" id="bulkCountFemale">0 Girls</span>
              </div>
            </div>
            <div class="bulk-preview-pane" id="bulkPreviewPane">
              <div class="bulk-preview-empty" id="bulkPreviewEmpty">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5; margin-bottom: 8px;">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <div>No students parsed yet. Start typing or pasting to see a live preview.</div>
              </div>
              <ul class="bulk-preview-list" id="bulkPreviewList" style="display: none;"></ul>
            </div>
          </div>
        </div>
      </div>
      <div class="modal__actions">
        <button class="btn btn-warn btn-sm" id="btnCancelBulkAdd">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btnConfirmBulkAdd" disabled>Add Learners (0)</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  overlay.querySelector('#btnCancelBulkAdd').addEventListener('click', close);

  const textInput = overlay.querySelector('#bulkLearnersText');
  const genderSelect = overlay.querySelector('#bulkLearnersGenderDefault');
  const previewPane = overlay.querySelector('#bulkPreviewPane');
  const previewEmpty = overlay.querySelector('#bulkPreviewEmpty');
  const previewList = overlay.querySelector('#bulkPreviewList');
  const badgesWrap = overlay.querySelector('#bulkPreviewSummaryBadges');
  const countMaleEl = overlay.querySelector('#bulkCountMale');
  const countFemaleEl = overlay.querySelector('#bulkCountFemale');
  const confirmBtn = overlay.querySelector('#btnConfirmBulkAdd');

  let parsedLearners = [];

  const parseInput = () => {
    const rawText = textInput.value;
    const genderMode = genderSelect.value;
    const lines = rawText.split('\n');
    parsedLearners = [];

    let boyCount = 0;
    let girlCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      // Skip common table headers if pasted with columns
      if (i === 0 && (rawLine.toLowerCase().includes('lrn') || rawLine.toLowerCase().includes('name') || rawLine.toLowerCase().includes('last name'))) {
        continue;
      }

      // Detect if it is a delimited line (Tab or CSV)
      let cols = [];
      if (rawLine.includes('\t')) {
        cols = rawLine.split('\t').map(x => x.trim());
      } else if (rawLine.includes(',')) {
        // Safe CSV parser invocation fallback
        const tempCols = (typeof parseCsvLine === 'function') ? parseCsvLine(rawLine) : rawLine.split(',').map(x => x.trim());
        if (tempCols.length > 2) {
          cols = tempCols;
        }
      }

      let lrn = '';
      let last = '';
      let first = '';
      let middle = '';
      let sex = '';

      if (cols.length >= 2) {
        // Delimited row parsing
        // Extract 12-digit LRN
        const lrnIdx = cols.findIndex(col => /^\d{12}$/.test(col));
        if (lrnIdx !== -1) {
          lrn = cols[lrnIdx];
          cols.splice(lrnIdx, 1);
        }

        // Extract gender (M, F, Male, Female)
        const sexIdx = cols.findIndex(col => {
          const lower = col.toLowerCase();
          return lower === 'm' || lower === 'f' || lower === 'male' || lower === 'female';
        });
        if (sexIdx !== -1) {
          const foundSex = cols[sexIdx].toLowerCase();
          sex = foundSex.startsWith('m') ? 'M' : 'F';
          cols.splice(sexIdx, 1);
        }

        // Parse remaining columns for names
        if (cols.length >= 2) {
          last = normalizeNamePart(cols[0]);
          first = normalizeNamePart(cols[1]);
          middle = cols.length > 2 ? normalizeNamePart(cols[2]) : '';
        } else if (cols.length === 1) {
          const nameObj = parseNameString(cols[0]);
          last = nameObj.last;
          first = nameObj.first;
          middle = nameObj.middle;
        }
      } else {
        // Parse single name string
        const nameObj = parseNameString(rawLine);
        last = nameObj.last;
        first = nameObj.first;
        middle = nameObj.middle;
      }

      // Gender overrides
      if (genderMode === 'M') {
        sex = 'M';
      } else if (genderMode === 'F') {
        sex = 'F';
      } else {
        if (!sex) sex = ''; // default empty / unassigned
      }

      if (!last && !first) continue;

      if (sex === 'M') boyCount++;
      if (sex === 'F') girlCount++;

      parsedLearners.push({
        lrn: lrn,
        lastName: last,
        firstName: first,
        middleName: middle,
        sex: sex,
        displayName: formatLearnerName(last, first, middle)
      });
    }

    // Render Preview panel list
    if (parsedLearners.length === 0) {
      previewEmpty.style.display = 'flex';
      previewList.style.display = 'none';
      badgesWrap.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Add Learners (0)';
    } else {
      previewEmpty.style.display = 'none';
      previewList.style.display = 'block';
      badgesWrap.style.display = 'flex';
      countMaleEl.textContent = `${boyCount} Boys`;
      countFemaleEl.textContent = `${girlCount} Girls`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = `Add Learners (${parsedLearners.length})`;

      previewList.innerHTML = parsedLearners.map((l, index) => {
        let genderBadge = '';
        if (l.sex === 'M') {
          genderBadge = `<span class="bulk-badge bulk-badge--male">Boy</span>`;
        } else if (l.sex === 'F') {
          genderBadge = `<span class="bulk-badge bulk-badge--female">Girl</span>`;
        } else {
          genderBadge = `<span class="bulk-badge" style="background:var(--border-default);color:var(--text-secondary);">Unknown</span>`;
        }

        return `
          <li class="bulk-preview-item">
            <div class="bulk-preview-item__name">${index + 1}. ${esc(l.displayName)}</div>
            <div class="bulk-preview-item__meta">
              <span style="font-family:monospace;color:var(--text-tertiary);">${esc(l.lrn || '—')}</span>
              ${genderBadge}
            </div>
          </li>
        `;
      }).join('');
    }
  };

  // Parses unstructured name string to extract Last, First, and Middle name
  const parseNameString = (str) => {
    let last = '';
    let first = '';
    let middle = '';

    if (str.includes(',')) {
      // Last Name, First Name Middle Name
      const parts = str.split(',').map(x => x.trim());
      last = normalizeNamePart(parts[0]);
      if (parts.length > 1) {
        const remaining = parts[1].split(/\s+/).map(x => x.trim()).filter(Boolean);
        if (remaining.length > 1) {
          middle = normalizeNamePart(remaining.pop());
          first = remaining.map(normalizeNamePart).join(' ');
        } else if (remaining.length === 1) {
          first = normalizeNamePart(remaining[0]);
        }
      }
    } else {
      // First Name Middle Name Last Name
      const words = str.split(/\s+/).map(x => x.trim()).filter(Boolean);
      if (words.length === 1) {
        last = normalizeNamePart(words[0]);
      } else if (words.length === 2) {
        first = normalizeNamePart(words[0]);
        last = normalizeNamePart(words[1]);
      } else if (words.length >= 3) {
        last = normalizeNamePart(words.pop());
        middle = normalizeNamePart(words.pop());
        first = words.map(normalizeNamePart).join(' ');
      }
    }

    return { last, first, middle };
  };

  // Bind input listeners
  textInput.addEventListener('input', parseInput);
  genderSelect.addEventListener('change', parseInput);

  // Submit / Save actions
  confirmBtn.addEventListener('click', () => {
    if (parsedLearners.length === 0) return;

    let added = 0;
    let duplicates = [];

    parsedLearners.forEach(l => {
      // Check for duplicates
      const isDuplicate = a.learners.some(existing => {
        const lrnMatch = l.lrn && existing.lrn && l.lrn === existing.lrn;
        const nameMatch = existing.lastName.toLowerCase() === l.lastName.toLowerCase() &&
                          existing.firstName.toLowerCase() === l.firstName.toLowerCase();
        return lrnMatch || nameMatch;
      });

      if (isDuplicate) {
        duplicates.push(l.displayName);
      } else {
        a.learners.push({
          id: uid('learner'),
          lrn: l.lrn,
          lastName: l.lastName,
          firstName: l.firstName,
          middleName: l.middleName,
          sex: l.sex,
          displayName: l.displayName
        });
        added++;
      }
    });

    if (added > 0) {
      saveDatabase();
      sortLearners();
      render();
    }

    close();

    if (duplicates.length > 0) {
      if (added > 0) {
        alertModal(
          'Import Partially Complete',
          `Successfully added ${added} learners. ${duplicates.length} duplicate(s) were skipped: ${duplicates.join(', ')}`
        );
      } else {
        alertModal(
          'Import Failed',
          `No learners were added. All ${duplicates.length} parsed learners are already registered in the class roster.`
        );
      }
    } else {
      toast(`Successfully added ${added} learners to roster!`, 'success');
    }
  });

  setTimeout(() => textInput.focus(), 80);
}
