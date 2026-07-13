/**
 * Advisory Class learner roster management.
 * Pure review helpers are shared by class-copy, manual, bulk, and SF1 flows.
 */
(function initAdvisoryRoster(globalScope) {
  'use strict';

  function activeDb() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
    if (!profileDb) throw new Error('The active profile database is unavailable.');
    return profileDb;
  }

  function text(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function normalizeMatchText(value) {
    return text(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function nameKey(learner) {
    return [learner?.lastName, learner?.firstName, learner?.middleName, learner?.extensionName]
      .map(normalizeMatchText)
      .join('|');
  }

  function displayName(learner) {
    const last = text(learner?.lastName);
    const given = [text(learner?.firstName), text(learner?.middleName), text(learner?.extensionName)].filter(Boolean).join(' ');
    return last && given ? `${last}, ${given}` : (last || given || 'Unnamed learner');
  }

  function normalizeSexValue(value) {
    const normalized = text(value).toUpperCase();
    if (normalized === 'M' || normalized === 'MALE' || normalized === 'BOY') return 'M';
    if (normalized === 'F' || normalized === 'FEMALE' || normalized === 'GIRL') return 'F';
    return '';
  }

  function normalizeIncoming(learner, source) {
    return {
      linkedLearnerId: text(learner?.linkedLearnerId || learner?.id),
      lrn: text(learner?.lrn).replace(/\s+/g, ''),
      lastName: text(learner?.lastName),
      firstName: text(learner?.firstName),
      middleName: text(learner?.middleName),
      extensionName: text(learner?.extensionName),
      sex: normalizeSexValue(learner?.sex),
      birthdate: text(learner?.birthdate),
      enrollmentStatus: text(learner?.enrollmentStatus) || 'active',
      source: text(source || learner?.source) || 'manual'
    };
  }

  function validateLearner(learner) {
    const errors = [];
    if (!learner.lastName) errors.push('Last name is required.');
    if (!learner.firstName) errors.push('First name is required.');
    if (learner.lrn && !/^\d{12}$/.test(learner.lrn)) errors.push('LRN must contain exactly 12 digits.');
    ['lastName', 'firstName', 'middleName', 'extensionName'].forEach(field => {
      if (learner[field] && !/^[\p{L}\p{M} .,'’\-]+$/u.test(learner[field])) errors.push(`${field} contains unsupported characters.`);
    });
    return errors;
  }

  function reviewLearners(profileDb, advisoryClassId, incoming, source) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const existing = store.learners.filter(item => item.advisoryClassId === advisoryClassId);
    const seenLrns = new Set();
    const seenNames = new Set();
    return (Array.isArray(incoming) ? incoming : []).map((raw, index) => {
      const learner = normalizeIncoming(raw, source);
      const errors = validateLearner(learner);
      const normalizedName = nameKey(learner);
      let status = errors.length ? 'invalid' : 'add';
      let matchedLearnerId = '';
      let warning = '';

      if (!errors.length && learner.lrn && seenLrns.has(learner.lrn)) {
        status = 'duplicate-incoming';
        warning = 'Another incoming row uses this LRN.';
      } else if (!errors.length && seenNames.has(normalizedName)) {
        status = 'duplicate-incoming';
        warning = 'Another incoming row uses this learner name.';
      }

      if (status === 'add') {
        const lrnMatch = learner.lrn ? existing.find(item => item.lrn && item.lrn === learner.lrn) : null;
        if (lrnMatch) {
          status = 'existing-lrn';
          matchedLearnerId = lrnMatch.id;
          warning = 'Already in the Advisory Class (exact LRN match).';
        } else {
          const nameMatches = existing.filter(item => nameKey(item) === normalizedName);
          const safeMatches = learner.lrn
            ? nameMatches.filter(item => !item.lrn)
            : nameMatches;
          const conflictingLrns = learner.lrn && nameMatches.some(item => item.lrn && item.lrn !== learner.lrn);
          if (conflictingLrns || safeMatches.length > 1) {
            status = 'ambiguous';
            warning = conflictingLrns
              ? 'The same name exists with a different LRN. Review manually.'
              : 'More than one existing learner has this name.';
          } else if (safeMatches.length === 1) {
            status = 'existing-name';
            matchedLearnerId = safeMatches[0].id;
            warning = 'Matched by normalized official name because an exact LRN match was unavailable.';
          }
        }
      }

      if (learner.lrn) seenLrns.add(learner.lrn);
      if (normalizedName) seenNames.add(normalizedName);
      return { index, learner, status, matchedLearnerId, errors, warning, selected: status === 'add' };
    });
  }

  function commitReviewedLearners(profileDb, advisoryClassId, reviewRows, selectedIndexes) {
    const selected = selectedIndexes instanceof Set ? selectedIndexes : new Set(selectedIndexes || []);
    const rows = (reviewRows || []).filter(row => row.status === 'add' && selected.has(row.index));
    const created = [];
    rows.forEach(row => {
      created.push(globalScope.AdvisoryData.createLearner(profileDb, {
        ...row.learner,
        advisoryClassId
      }));
    });
    return created;
  }

  function parseDelimitedLine(line) {
    if (line.includes('\t')) return line.split('\t').map(text);
    const values = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') { current += '"'; index++; }
        else quoted = !quoted;
      } else if (character === ',' && !quoted) {
        values.push(text(current));
        current = '';
      } else current += character;
    }
    values.push(text(current));
    return values;
  }

  function parseLooseName(value) {
    const raw = text(value);
    if (!raw) return { lastName: '', firstName: '', middleName: '' };
    if (raw.includes(',')) {
      const comma = raw.indexOf(',');
      const lastName = text(raw.slice(0, comma));
      const remainder = text(raw.slice(comma + 1)).split(/\s+/).filter(Boolean);
      return {
        lastName,
        firstName: remainder.length > 1 ? remainder.slice(0, -1).join(' ') : (remainder[0] || ''),
        middleName: remainder.length > 1 ? remainder[remainder.length - 1] : ''
      };
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { lastName: parts[0], firstName: '', middleName: '' };
    if (parts.length === 2) return { firstName: parts[0], lastName: parts[1], middleName: '' };
    return { firstName: parts.slice(0, -2).join(' '), middleName: parts[parts.length - 2], lastName: parts[parts.length - 1] };
  }

  function parseBulkText(rawText, defaultSex) {
    const lines = text(rawText).replace(/\r/g, '').split('\n');
    const learners = [];
    lines.forEach((rawLine, index) => {
      const line = text(rawLine);
      if (!line) return;
      if (index === 0 && /\b(lrn|last\s*name|learner\s*name)\b/i.test(line)) return;
      let columns = [];
      if (line.includes('\t')) columns = parseDelimitedLine(line);
      else if ((line.match(/,/g) || []).length >= 2) columns = parseDelimitedLine(line);
      let learner;
      if (columns.length >= 2) {
        const lrnIndex = columns.findIndex(value => /^\d{12}$/.test(value.replace(/\s/g, '')));
        const sexIndex = columns.findIndex(value => /^(m|f|male|female|boy|girl)$/i.test(value));
        const lrn = lrnIndex >= 0 ? columns[lrnIndex].replace(/\s/g, '') : '';
        const sex = sexIndex >= 0 ? normalizeSexValue(columns[sexIndex]) : normalizeSexValue(defaultSex);
        const names = columns.filter((_, columnIndex) => columnIndex !== lrnIndex && columnIndex !== sexIndex);
        learner = { lrn, lastName: names[0] || '', firstName: names[1] || '', middleName: names[2] || '', extensionName: names[3] || '', sex };
      } else {
        learner = { ...parseLooseName(line), lrn: '', extensionName: '', sex: normalizeSexValue(defaultSex) };
      }
      learners.push(learner);
    });
    return learners;
  }

  function rosterForClass(profileDb, advisoryClassId) {
    return globalScope.AdvisoryData.normalizeAdvisoryData(profileDb).learners
      .filter(item => item.advisoryClassId === advisoryClassId)
      .sort((left, right) => {
        const sexOrder = { M: 0, F: 1 };
        const leftSex = sexOrder[left.sex] ?? 2;
        const rightSex = sexOrder[right.sex] ?? 2;
        return leftSex - rightSex || displayName(left).localeCompare(displayName(right), 'fil');
      });
  }

  function closeElement(element) {
    if (element && element.parentNode) element.parentNode.removeChild(element);
  }

  function workspaceElement() {
    return document.querySelector('[data-advisory-workspace]');
  }

  function rosterManagerElement() {
    return document.querySelector('[data-advisory-roster-manager]');
  }

  function renderRosterManager() {
    const overlay = rosterManagerElement();
    if (!overlay) return;
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) { closeElement(overlay); return; }
    const roster = rosterForClass(activeDb(), advisoryClass.id);
    const escHtml = globalScope.esc;
    const body = overlay.querySelector('[data-advisory-manager-roster-body]');
    const count = overlay.querySelector('[data-advisory-manager-roster-count]');
    if (count) count.textContent = `${roster.length} learner${roster.length === 1 ? '' : 's'}`;
    body.innerHTML = roster.length ? roster.map((learner, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="advisory-roster__lrn">${escHtml(learner.lrn || '—')}</td>
        <td><strong>${escHtml(displayName(learner))}</strong></td>
        <td>${escHtml(learner.sex || '—')}</td>
        <td>${escHtml(learner.enrollmentStatus || 'active')}</td>
        <td>${escHtml(learner.source || 'manual')}</td>
        <td class="advisory-roster__actions">
          <button class="btn btn-ghost btn-sm" type="button" data-edit-advisory-learner="${escHtml(learner.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" type="button" data-remove-advisory-learner="${escHtml(learner.id)}">Remove</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="7"><div class="advisory-roster__empty">No learners yet. Import an existing roster, add learners manually, paste a list, or upload a supported SF1 file.</div></td></tr>';
    body.querySelectorAll('[data-edit-advisory-learner]').forEach(button => button.addEventListener('click', () => showLearnerForm(button.dataset.editAdvisoryLearner)));
    body.querySelectorAll('[data-remove-advisory-learner]').forEach(button => button.addEventListener('click', () => removeLearner(button.dataset.removeAdvisoryLearner)));
  }

  function openRosterManager() {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) { globalScope.showAdvisoryClassSetupModal(); return; }
    let overlay = rosterManagerElement();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay advisory-roster-modal-overlay';
      overlay.setAttribute('data-advisory-roster-manager', 'true');
      overlay.innerHTML = `
        <div class="modal advisory-roster-modal" role="dialog" aria-modal="true" aria-labelledby="advisoryRosterTitle">
          <div class="advisory-workspace__header">
            <div><span class="advisory-card__eyebrow">Roster and learner settings</span><h2 id="advisoryRosterTitle">Official Advisory Class Roster</h2><p>Grade ${globalScope.esc(advisoryClass.gradeLevel)} - ${globalScope.esc(advisoryClass.section)} · School Year ${globalScope.esc(advisoryClass.schoolYear)}</p></div>
            <button class="btn btn-ghost btn-sm" type="button" data-close-advisory-roster>Close</button>
          </div>
          <div class="advisory-workspace__toolbar advisory-action-toolbar">
            <button class="btn btn-sm advisory-action-btn" type="button" data-advisory-import-class>Import from Other Class</button>
            <button class="btn btn-sm advisory-action-btn" type="button" data-advisory-add-manual>Add Learner</button>
            <button class="btn btn-sm advisory-action-btn" type="button" data-advisory-add-bulk>Bulk Add</button>
            <button class="btn btn-sm advisory-action-btn" type="button" data-advisory-import-sf1>Upload SF1</button>
            <span class="advisory-workspace__count" data-advisory-manager-roster-count></span>
          </div>
          <div class="advisory-workspace__body">
            <div class="advisory-roster-table-wrap"><table class="advisory-roster-table"><thead><tr><th>#</th><th>LRN</th><th>Official Name</th><th>Sex</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody data-advisory-manager-roster-body></tbody></table></div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('[data-close-advisory-roster]').addEventListener('click', () => closeElement(overlay));
      overlay.querySelector('[data-advisory-import-class]').addEventListener('click', showClassImportChooser);
      overlay.querySelector('[data-advisory-add-manual]').addEventListener('click', () => showLearnerForm());
      overlay.querySelector('[data-advisory-add-bulk]').addEventListener('click', showBulkModal);
      overlay.querySelector('[data-advisory-import-sf1]').addEventListener('click', importSf1Roster);
    }
    renderRosterManager();
  }

  function renderWorkspace() {
    const overlay = workspaceElement();
    if (!overlay) {
      globalScope.renderAdvisoryClassPage?.();
      renderRosterManager();
      return;
    }
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) { closeElement(overlay); globalScope.showAdvisoryClassSetupModal(); return; }
    const roster = rosterForClass(activeDb(), advisoryClass.id);
    const escHtml = globalScope.esc;
    const body = overlay.querySelector('[data-advisory-roster-body]');
    const count = overlay.querySelector('[data-advisory-roster-count]');
    if (count) count.textContent = `${roster.length} learner${roster.length === 1 ? '' : 's'}`;
    body.innerHTML = roster.length ? roster.map((learner, index) => `
      <tr>
        <td>${index + 1}</td>
        <td class="advisory-roster__lrn">${escHtml(learner.lrn || '—')}</td>
        <td><strong>${escHtml(displayName(learner))}</strong></td>
        <td>${escHtml(learner.sex || '—')}</td>
        <td>${escHtml(learner.enrollmentStatus || 'active')}</td>
        <td>${escHtml(learner.source || 'manual')}</td>
        <td class="advisory-roster__actions">
          <button class="btn btn-ghost btn-sm" type="button" data-edit-advisory-learner="${escHtml(learner.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" type="button" data-remove-advisory-learner="${escHtml(learner.id)}">Remove</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="7"><div class="advisory-roster__empty">No learners yet. Import an existing roster, add learners manually, paste a list, or upload a supported SF1 file.</div></td></tr>';
    body.querySelectorAll('[data-edit-advisory-learner]').forEach(button => button.addEventListener('click', () => showLearnerForm(button.dataset.editAdvisoryLearner)));
    body.querySelectorAll('[data-remove-advisory-learner]').forEach(button => button.addEventListener('click', () => removeLearner(button.dataset.removeAdvisoryLearner)));
    if (globalScope.AdvisoryGradeTransfer?.renderWorkspacePanel) globalScope.AdvisoryGradeTransfer.renderWorkspacePanel(overlay, advisoryClass);
    renderRosterManager();
  }

  function openWorkspace(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) { globalScope.showAdvisoryClassSetupModal(); return; }
    let overlay = workspaceElement();
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay advisory-workspace-overlay';
      overlay.setAttribute('data-advisory-workspace', 'true');
      overlay.innerHTML = `
        <div class="modal advisory-workspace" role="dialog" aria-modal="true" aria-labelledby="advisoryWorkspaceTitle">
          <div class="advisory-workspace__header">
            <div><span class="advisory-card__eyebrow">School Year ${globalScope.esc(advisoryClass.schoolYear)}</span><h2 id="advisoryWorkspaceTitle">Advisory Class · Grade ${globalScope.esc(advisoryClass.gradeLevel)} - ${globalScope.esc(advisoryClass.section)}</h2><p>${globalScope.esc(advisoryClass.adviserName)}</p></div>
            <button class="btn btn-ghost btn-sm" type="button" data-close-advisory-workspace aria-label="Close Advisory Class">Close</button>
          </div>
          <div class="advisory-workspace__toolbar">
            <button class="btn btn-primary btn-sm" type="button" data-advisory-manage-roster>Manage Roster</button>
            <button class="btn btn-ghost btn-sm" type="button" data-advisory-edit-class>Advisory Settings</button>
            <button class="btn btn-danger btn-sm" type="button" data-advisory-reset-class>Reset Advisory Class</button>
            <span class="advisory-workspace__count" data-advisory-roster-count></span>
          </div>
          <div class="advisory-workspace__body">
            <div class="advisory-hidden-roster-cache" hidden><table><tbody data-advisory-roster-body></tbody></table></div>
            <section class="advisory-grade-panel" data-advisory-grade-panel></section>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('[data-close-advisory-workspace]').addEventListener('click', () => closeElement(overlay));
      overlay.querySelector('[data-advisory-manage-roster]').addEventListener('click', openRosterManager);
      overlay.querySelector('[data-advisory-edit-class]').addEventListener('click', globalScope.showAdvisoryClassSetupModal);
      overlay.querySelector('[data-advisory-reset-class]').addEventListener('click', () => globalScope.showAdvisoryResetModal?.());
    }
    renderWorkspace();
  }

  function showLearnerForm(learnerId) {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb());
    const existing = learnerId ? store.learners.find(item => item.id === learnerId && item.advisoryClassId === advisoryClass.id) : null;
    const escHtml = globalScope.esc;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal modal--wide"><div class="modal__title">${existing ? 'Edit' : 'Add'} Advisory Learner</div><div class="modal__body advisory-scroll-body">
      <div class="field"><label class="field-label">Learner Reference Number (LRN)</label><input class="field-input" data-field="lrn" maxlength="12" inputmode="numeric" value="${escHtml(existing?.lrn || '')}"></div>
      <div class="split-row"><div class="field"><label class="field-label">Last Name</label><input class="field-input" data-field="lastName" value="${escHtml(existing?.lastName || '')}"></div><div class="field"><label class="field-label">First Name</label><input class="field-input" data-field="firstName" value="${escHtml(existing?.firstName || '')}"></div></div>
      <div class="split-row"><div class="field"><label class="field-label">Middle Name</label><input class="field-input" data-field="middleName" value="${escHtml(existing?.middleName || '')}"></div><div class="field"><label class="field-label">Extension Name</label><input class="field-input" data-field="extensionName" value="${escHtml(existing?.extensionName || '')}"></div></div>
      <div class="split-row"><div class="field"><label class="field-label">Sex</label><select class="field-select" data-field="sex"><option value=""></option><option value="M" ${existing?.sex === 'M' ? 'selected' : ''}>Male / Boy</option><option value="F" ${existing?.sex === 'F' ? 'selected' : ''}>Female / Girl</option></select></div><div class="field"><label class="field-label">Birthdate</label><input type="date" class="field-input" data-field="birthdate" value="${escHtml(existing?.birthdate || '')}"></div></div>
      <div class="field"><label class="field-label">Enrollment Status</label><select class="field-select" data-field="enrollmentStatus"><option value="active">Active</option><option value="transferred">Transferred</option><option value="inactive">Inactive</option></select></div>
    </div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>${existing ? 'Save Changes' : 'Add Learner'}</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-field="enrollmentStatus"]').value = existing?.enrollmentStatus || 'active';
    overlay.querySelector('[data-cancel]').addEventListener('click', () => closeElement(overlay));
    overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const values = {};
      overlay.querySelectorAll('[data-field]').forEach(input => { values[input.dataset.field] = input.value; });
      const normalized = normalizeIncoming(values, existing?.source || 'manual');
      const errors = validateLearner(normalized);
      const otherRoster = rosterForClass(activeDb(), advisoryClass.id).filter(item => item.id !== existing?.id);
      if (normalized.lrn && otherRoster.some(item => item.lrn === normalized.lrn)) errors.push('This LRN already belongs to another Advisory learner.');
      if (otherRoster.some(item => nameKey(item) === nameKey(normalized))) errors.push('A learner with this official name already exists.');
      if (errors.length) { globalScope.toast(errors[0], 'warning'); return; }
      if (existing) globalScope.AdvisoryData.updateLearner(activeDb(), existing.id, normalized);
      else globalScope.AdvisoryData.createLearner(activeDb(), { ...normalized, advisoryClassId: advisoryClass.id });
      await globalScope.saveDatabase();
      closeElement(overlay);
      renderWorkspace();
      globalScope.renderDashboardOverview();
      globalScope.toast(existing ? 'Advisory learner updated.' : 'Advisory learner added.', 'success');
    });
  }

  function showClassImportChooser() {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    const classes = (activeDb().assignments || []).filter(item => item.schoolYear === advisoryClass.schoolYear && Array.isArray(item.learners));
    if (!classes.length) { globalScope.toast('No subject-class roster is available for this school year.', 'info'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal"><div class="modal__title">Import Learners from Existing Class</div><div class="modal__body"><p class="text-muted">The source class will not be changed. A preview is required before saving.</p><div class="field"><label class="field-label">Source Class</label><select class="field-select" data-source-class><option value="">Choose a class</option>${classes.map(item => `<option value="${globalScope.esc(item.id)}">Grade ${globalScope.esc(item.gradeLevel)} - ${globalScope.esc(item.section)} (${globalScope.esc(item.subject)}) · ${item.learners.length} learners</option>`).join('')}</select></div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-review disabled>Review Import</button></div></div>`;
    document.body.appendChild(overlay);
    const select = overlay.querySelector('[data-source-class]');
    const review = overlay.querySelector('[data-review]');
    select.addEventListener('change', () => { review.disabled = !select.value; });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => closeElement(overlay));
    review.addEventListener('click', () => {
      closeElement(overlay);
      startClassImport(select.value);
    });
  }

  function startClassImport(sourceClassId) {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) { globalScope.toast('Set up the Advisory Class before importing its roster.', 'warning'); return; }
    const sourceClass = (activeDb().assignments || []).find(item => item.id === sourceClassId && item.schoolYear === advisoryClass.schoolYear && Array.isArray(item.learners));
    if (!sourceClass) { globalScope.toast('The selected source class is no longer available.', 'error'); return; }
    showImportPreview(sourceClass.learners, `existing-class:${sourceClass.id}`, 'Review Existing Class Roster');
  }

  function showImportPreview(incoming, source, title) {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    const rows = reviewLearners(activeDb(), advisoryClass.id, incoming, source);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    const statusLabel = { add: 'Will add', 'existing-lrn': 'Already exists · LRN', 'existing-name': 'Name match', ambiguous: 'Needs review', invalid: 'Invalid', 'duplicate-incoming': 'Duplicate in file' };
    overlay.innerHTML = `<div class="modal advisory-preview-modal"><div class="modal__title">${globalScope.esc(title)}</div><div class="modal__body advisory-scroll-body"><p class="text-muted">LRN matches take priority. Name-only matches and ambiguous records are never added automatically.</p><div class="advisory-preview-list">${rows.map(row => `<label class="advisory-preview-row advisory-preview-row--${row.status}"><input type="checkbox" data-row-index="${row.index}" ${row.selected ? 'checked' : ''} ${row.status !== 'add' ? 'disabled' : ''}><span><strong>${globalScope.esc(displayName(row.learner))}</strong><small>${globalScope.esc(row.learner.lrn || 'No LRN')} · ${globalScope.esc(statusLabel[row.status] || row.status)}${row.warning ? ` · ${globalScope.esc(row.warning)}` : ''}${row.errors.length ? ` · ${globalScope.esc(row.errors.join(' '))}` : ''}</small></span></label>`).join('')}</div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-confirm>Import Selected</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-cancel]').addEventListener('click', () => closeElement(overlay));
    overlay.querySelector('[data-confirm]').addEventListener('click', async () => {
      const selected = new Set(Array.from(overlay.querySelectorAll('[data-row-index]:checked')).map(input => Number(input.dataset.rowIndex)));
      const created = commitReviewedLearners(activeDb(), advisoryClass.id, rows, selected);
      if (!created.length) { globalScope.toast('No new valid learners were selected.', 'warning'); return; }
      await globalScope.saveDatabase();
      closeElement(overlay);
      renderWorkspace();
      globalScope.renderDashboardOverview();
      globalScope.toast(`Imported ${created.length} learner${created.length === 1 ? '' : 's'} into the Advisory Class.`, 'success');
    });
  }

  function showBulkModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal modal--wide"><div class="modal__title">Bulk Add Advisory Learners</div><div class="modal__body advisory-scroll-body"><p class="text-muted">Paste one learner per row. Supported columns: LRN, Last Name, First Name, Middle Name, Extension, Sex. Valid rows can be selected independently after preview.</p><div class="field"><label class="field-label">Learner List</label><textarea class="field-textarea bulk-textarea" data-bulk-text></textarea></div><div class="field"><label class="field-label">Default Sex</label><select class="field-select" data-default-sex><option value="">Use row value / unspecified</option><option value="M">Male / Boy</option><option value="F">Female / Girl</option></select></div></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-review>Review Rows</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-cancel]').addEventListener('click', () => closeElement(overlay));
    overlay.querySelector('[data-review]').addEventListener('click', () => {
      const learners = parseBulkText(overlay.querySelector('[data-bulk-text]').value, overlay.querySelector('[data-default-sex]').value);
      closeElement(overlay);
      showImportPreview(learners, 'bulk-entry', 'Review Bulk Learner Entry');
    });
  }

  async function importSf1Roster() {
    try {
      const result = await globalScope.electronAPI.importSf1();
      if (!result?.success || !result.table) {
        if (result?.error) globalScope.toast(`SF1 processing failed: ${result.error}`, 'error');
        return;
      }
      if (typeof globalScope.extractSf1Learners !== 'function') throw new Error('The supported SF1 parser is unavailable.');
      const learners = globalScope.extractSf1Learners(result.table);
      if (!learners.length) { globalScope.toast('No supported learner records were found in this SF1 file.', 'error'); return; }
      showImportPreview(learners, 'sf1', 'Review SF1 Learners');
    } catch (error) {
      console.error('Advisory SF1 import failed:', error);
      globalScope.toast(`SF1 upload failed: ${error.message}`, 'error');
    }
  }

  function removeLearner(learnerId) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(activeDb());
    const learner = store.learners.find(item => item.id === learnerId);
    if (!learner) return;
    globalScope.confirmModal('Remove Advisory Learner', `Remove ${displayName(learner)} from this Advisory Class? Subject-class rosters will not be changed.`, async () => {
      globalScope.AdvisoryData.deleteLearner(activeDb(), learnerId);
      await globalScope.saveDatabase();
      renderWorkspace();
      globalScope.renderDashboardOverview();
      globalScope.toast('Advisory learner removed.', 'success');
    });
  }

  const api = {
    normalizeMatchText,
    nameKey,
    displayName,
    validateLearner,
    normalizeIncoming,
    reviewLearners,
    commitReviewedLearners,
    parseBulkText,
    rosterForClass,
    startClassImport,
    openWorkspace,
    openRosterManager,
    renderRosterManager,
    renderWorkspace
  };
  globalScope.AdvisoryRoster = api;
  globalScope.openAdvisoryClassDashboard = openWorkspace;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
