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
        <button class="btn btn-ghost btn-sm" id="btnCancelAddLearner">Cancel</button>
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
