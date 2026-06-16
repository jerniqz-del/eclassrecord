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
 * Removes the last added learner, requesting confirmation via a modern modal.
 */
function removeLastLearner() {
  const a = currentAssignment();
  if (!a || a.learners.length === 0) {
    toast('No learners to remove.', 'warning');
    return;
  }
  
  confirmModal(
    'Remove Learner',
    'Are you sure you want to remove the last learner from this teaching load? All associated scores will be permanently deleted.',
    () => {
      const learner = a.learners.pop();
      for (const key in a.scores) {
        if (key.startsWith(learner.id + '|')) {
          delete a.scores[key];
        }
      }
      saveDatabase();
      render();
      toast('Learner removed.', 'success');
    }
  );
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
    html += `
      <tr style="border-bottom:1px solid var(--border-color)">
        <td style="padding:var(--space-2)">${i + 1}</td>
        <td style="padding:var(--space-2)">${esc(l.lrn || '—')}</td>
        <td style="padding:var(--space-2)"><strong>${esc(learnerDisplayName(l))}</strong></td>
        <td style="padding:var(--space-2)">${esc(l.sex || '—')}</td>
        <td style="padding:var(--space-2);text-align:center">
          <button class="btn btn-warn btn-sm" style="padding:var(--space-1) var(--space-2)" 
            title="Remove student" 
            onclick="removeLearner('${esc(l.id)}')">
            Remove
          </button>
        </td>
      </tr>
    `;
  }
  
  html += '</tbody></table>';
  target.innerHTML = html;
}

/**
 * Removes an individual student from the roster list with confirmation.
 */
function removeLearner(learnerId) {
  const a = currentAssignment();
  if (!a) return;
  
  const learner = a.learners.find(x => x.id === learnerId);
  if (!learner) return;
  
  confirmModal(
    'Remove Learner',
    `Are you sure you want to remove ${learnerDisplayName(learner)}? All associated scores will be permanently deleted.`,
    () => {
      a.learners = a.learners.filter(x => x.id !== learnerId);
      for (const key in a.scores) {
        if (key.startsWith(learnerId + '|')) {
          delete a.scores[key];
        }
      }
      saveDatabase();
      render();
      toast('Learner removed.', 'success');
    }
  );
}
