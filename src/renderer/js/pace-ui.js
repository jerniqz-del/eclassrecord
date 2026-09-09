/**
 * Grade 1 PACE rating UI — Individual (one learner, one criterion) and Class
 * (set baseline, increment class, increment selected). Ratings are always per learner.
 */
var paceUi = {
  mode: 'class',
  itemIndex: 0,
  skillIndex: 0,
  learnerIndex: 0,
  selectedIds: {},
  showEvidence: false,
  rosterQuery: '',
  replaceClass: false,
  focusedKey: '',
  showBooklet: false,
  subject: '',
  formLearnerId: '',
  focusedLearnerId: '',
  showShortcuts: true,
  officialFocus: null
};

function isGrade1PaceAssignment(assignment) {
  if (!assignment) return false;
  if (typeof isKinderAssignment === 'function' && isKinderAssignment(assignment)) return false;
  if (parseInt(assignment.gradeLevel, 10) !== 1) return false;
  if (typeof isPaceHomeroomAssignment === 'function' && isPaceHomeroomAssignment(assignment)) return true;
  const term = (typeof db !== 'undefined' && db.currentTerm) || '1';
  return typeof paceCompetenciesFor === 'function'
    && paceCompetenciesFor(assignment.subject, term).length > 0;
}

function isPaceAssignment(assignment) {
  if (typeof isKinderAssignment === 'function' && isKinderAssignment(assignment)) return true;
  return isGrade1PaceAssignment(assignment);
}

function paceCurrentItems(assignment) {
  if (typeof isKinderAssignment === 'function' && isKinderAssignment(assignment) && typeof kinderCompetenciesFor === 'function') {
    const domains = typeof kinderDomainNames === 'function' ? kinderDomainNames() : [];
    const domain = paceUi.subject && domains.includes(paceUi.subject) ? paceUi.subject : domains[0];
    paceUi.subject = domain || '';
    return kinderCompetenciesFor(domain);
  }
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment?.subject;
  const term = (typeof db !== 'undefined' && db.currentTerm) || '1';
  return paceCompetenciesFor(subject, term);
}

function paceSubjectAssignments(assignment) {
  if (!assignment) return [];
  const year = assignment.schoolYear || (typeof db !== 'undefined' ? db.schoolYear : '');
  const section = String(assignment.section || '');
  const grade = parseInt(assignment.gradeLevel, 10);
  const pool = (typeof db !== 'undefined' && Array.isArray(db.assignments)) ? db.assignments : [assignment];
  const seen = new Set();
  const siblings = [];
  pool.forEach(item => {
    if (!item || parseInt(item.gradeLevel, 10) !== grade) return;
    if (String(item.section || '') !== section) return;
    if (year && item.schoolYear && item.schoolYear !== year) return;
    if (!isPaceAssignment(item)) return;
    const key = typeof paceSubjectKey === 'function' ? paceSubjectKey(item.subject) : item.subject;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    siblings.push(item);
  });
  if (!siblings.some(item => item.id === assignment.id)) siblings.unshift(assignment);
  return siblings.sort((left, right) => {
    const leftIndex = typeof paceSubjectSortIndex === 'function' ? paceSubjectSortIndex(left.subject) : 0;
    const rightIndex = typeof paceSubjectSortIndex === 'function' ? paceSubjectSortIndex(right.subject) : 0;
    return leftIndex - rightIndex || String(left.subject || '').localeCompare(String(right.subject || ''));
  });
}

function renderPaceCriterionNav(assignment, term, currentItem, currentSkill) {
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment?.subject;
  const subjectName = typeof paceSubjectDisplayName === 'function' ? paceSubjectDisplayName(subject) : subject;
  const items = typeof paceCompetenciesFor === 'function'
    ? paceCompetenciesFor(subject, term)
    : [];
  const rows = [];
  let lastStrand = '';
  items.forEach(item => {
    const strand = String(item.group || '');
    if (strand && strand !== lastStrand) {
      rows.push(`<div class="pace-criterion-strand">${esc(strand)}</div>`);
      lastStrand = strand;
    }
    rows.push(...paceCriterionNavRows(assignment, item, currentItem, currentSkill));
  });
  return `<nav class="pace-criterion-nav" aria-label="Criteria"><p class="pace-na-legend">Competencies · Term ${esc(term)}</p><section class="pace-criterion-subject-group"><h4 class="pace-criterion-subject">${esc(subjectName)}</h4>${rows.join('') || '<p class="text-muted">No competencies for this term.</p>'}</section></nav>`;
}

function paceSkillLabelText(code) {
  return typeof paceSkillDisplayLabel === 'function'
    ? paceSkillDisplayLabel(code)
    : ((typeof PACE_SKILL_LABELS !== 'undefined' && PACE_SKILL_LABELS[code]) || code || '');
}

function paceNavJumpIndex(item, assignment, detailIndex, skillCode) {
  const ratingSkills = paceUiCellSkills(item, assignment);
  if (typeof paceHasLetteredParts === 'function' && paceHasLetteredParts(item)) {
    return Number.isInteger(detailIndex) ? detailIndex : 0;
  }
  if (assignment && typeof paceUsesPerSkillRating === 'function' && paceUsesPerSkillRating(assignment) && skillCode) {
    const index = ratingSkills.indexOf(skillCode);
    return index >= 0 ? index : 0;
  }
  return 0;
}

function paceCriterionSkillLine(label, clickable, active, assignmentId, itemId, skillIndex) {
  const text = `<span class="pace-criterion-skill-mark" aria-hidden="true">&gt;</span> ${esc(label)}`;
  if (!clickable) {
    return `<div class="pace-criterion-skill">${text}</div>`;
  }
  return `<button type="button" class="pace-criterion-link is-skill${active ? ' is-active' : ''}" title="${esc(label)}" data-eclass-onclick="paceJumpAssignment('${esc(assignmentId)}', '${esc(itemId)}', ${skillIndex})">${text}</button>`;
}

function paceCriterionNavRows(assignment, item, currentItem, currentSkill) {
  const assignmentId = assignment.id;
  const lettered = typeof paceHasLetteredParts === 'function' && paceHasLetteredParts(item);
  const perSkill = assignment && typeof paceUsesPerSkillRating === 'function' && paceUsesPerSkillRating(assignment);
  const current = item.id === (currentItem?.id || '');
  const liveFor = detailIndex => (typeof paceLiveSkills === 'function' ? paceLiveSkills(item, detailIndex) : []);
  const title = `${item.number}. ${item.title}`;
  const rows = [];

  function skillLines(detailIndex, clickable) {
    const codes = liveFor(Number.isInteger(detailIndex) ? detailIndex : undefined);
    return codes.map(code => {
      const jump = paceNavJumpIndex(item, assignment, detailIndex, code);
      const selected = current && clickable && jump === paceUi.skillIndex;
      return paceCriterionSkillLine(paceSkillLabelText(code), clickable, selected, assignmentId, item.id, jump);
    }).join('');
  }

  if (lettered) {
    rows.push(`<div class="pace-criterion-parent">${esc(title)}</div>`);
    item.details.forEach((detail, detailIndex) => {
      const letter = typeof paceDetailSkillCode === 'function' ? paceDetailSkillCode(detailIndex) : String.fromCharCode(97 + detailIndex);
      const jump = paceNavJumpIndex(item, assignment, detailIndex, '');
      const active = current && jump === paceUi.skillIndex;
      const caption = `${letter}. ${detail}`;
      rows.push(`<button type="button" class="pace-criterion-link is-part${active ? ' is-active' : ''}" title="${esc(title)} — ${esc(detail)}" data-eclass-onclick="paceJumpAssignment('${esc(assignmentId)}', '${esc(item.id)}', ${jump})">${esc(caption)}</button>`);
      rows.push(skillLines(detailIndex, false));
    });
    return rows;
  }

  const live = liveFor();
  if (live.length) {
    if (perSkill) {
      rows.push(`<div class="pace-criterion-parent">${esc(title)}</div>`);
      rows.push(skillLines(undefined, true));
      return rows;
    }
    const active = current;
    rows.push(`<button type="button" class="pace-criterion-link is-parent${active ? ' is-active' : ''}" title="${esc(title)}" data-eclass-onclick="paceJumpAssignment('${esc(assignmentId)}', '${esc(item.id)}', 0)">${esc(title)}</button>`);
    rows.push(skillLines(undefined, false));
    return rows;
  }

  const active = current;
  rows.push(`<button type="button" class="pace-criterion-link${active ? ' is-active' : ''}" title="${esc(title)}" data-eclass-onclick="paceJumpAssignment('${esc(assignmentId)}', '${esc(item.id)}', 0)">${esc(title)}</button>`);
  return rows;
}

function renderPaceSubjectTabs(assignment) {
  if (typeof isKinderAssignment === 'function' && isKinderAssignment(assignment) && typeof kinderDomainNames === 'function') {
    const names = kinderDomainNames();
    const current = paceUi.subject || names[0];
    return `<div class="pace-subject-tabs" role="tablist" aria-label="Developmental domains">${names.map(name => {
      const on = name === current;
      return `<button type="button" class="pace-subject-tab${on ? ' is-active' : ''}" role="tab" aria-selected="${on ? 'true' : 'false'}" title="${esc(name)}" data-eclass-onclick="paceSetSubject('${esc(name)}')">${esc(name.replace(' Development', ''))}</button>`;
    }).join('')}</div>`;
  }
  if (typeof isPaceHomeroomAssignment !== 'function' || !isPaceHomeroomAssignment(assignment)) return '';
  const current = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : '';
  const names = typeof paceHomeroomSubjectNames === 'function' ? paceHomeroomSubjectNames() : [];
  return `<div class="pace-subject-tabs" role="tablist" aria-label="Learning areas">${names.map((name, index) => {
    const tone = typeof paceSubjectTone === 'function' ? paceSubjectTone(name) : '';
    const on = name === current;
    const label = tone === 'gmrc' ? 'GMRC' : name;
    return `<button type="button" class="pace-subject-tab${on ? ' is-active' : ''}" role="tab" aria-selected="${on ? 'true' : 'false'}" title="${esc(name)} (Alt+${index + 1})" data-pace-subject="${esc(tone)}" data-eclass-onclick="paceSetSubject('${esc(name)}')">${esc(label)}</button>`;
  }).join('')}</div>`;
}

function paceScrollActiveCriterion() {
  const active = document.querySelector('#paceRatingPanel .pace-criterion-link.is-active');
  if (active && typeof active.scrollIntoView === 'function') {
    active.scrollIntoView({ block: 'nearest' });
  }
}

function paceCurrentItem(assignment) {
  const items = paceCurrentItems(assignment);
  if (!items.length) return null;
  if (paceUi.itemIndex >= items.length) paceUi.itemIndex = 0;
  return items[paceUi.itemIndex] || null;
}

function paceUiCellSkills(item, assignment) {
  return typeof paceCellSkills === 'function'
    ? paceCellSkills(item, assignment || (typeof currentAssignment === 'function' ? currentAssignment() : null))
    : [''];
}

function paceCurrentSkill(item) {
  const skills = paceUiCellSkills(item);
  if (paceUi.skillIndex >= skills.length) paceUi.skillIndex = 0;
  return skills[paceUi.skillIndex] || '';
}

function paceActiveRoster(assignment) {
  const term = (typeof db !== 'undefined' && db.currentTerm) || '1';
  return paceClassEligibleLearners(assignment, term);
}

function pacePersist() {
  if (typeof saveDatabase === 'function') saveDatabase();
  if (typeof scheduleRecordTableRefresh === 'function') scheduleRecordTableRefresh();
}

function paceLetterShortName(letter) {
  const names = { A: 'Advancing', B: 'Benchmarking', C: 'Connecting', D: 'Developing', E: 'Emerging' };
  return names[String(letter || '').toUpperCase()] || String(letter || '');
}

function paceIcon(name) {
  const paths = {
    search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"></polyline>',
    chevronRight: '<polyline points="9 18 15 12 9 6"></polyline>',
    keyboard: '<rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"></path>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
  };
  return `<svg class="pace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function paceKbd(label) {
  return `<kbd class="pace-kbd">${esc(label)}</kbd>`;
}

function paceLetterButtons(selected, actionName, extraArg, options) {
  const prefix = extraArg ? `'${esc(extraArg)}', ` : '';
  const disabled = options && options.disabled === true;
  const tiles = options && options.tiles === true;
  return PACE_LETTERS.slice().reverse().map(letter => {
    const on = selected === letter ? ' is-active' : '';
    const pressed = selected === letter ? 'true' : 'false';
    const tip = typeof paceLetterTooltip === 'function' ? paceLetterTooltip(letter) : letter;
    const body = tiles
      ? `<span class="pace-letter__code">${letter}</span><span class="pace-letter__name">${esc(paceLetterShortName(letter))}</span>`
      : letter;
    return `<button type="button" class="pace-letter pace-letter--${letter}${on}${tiles ? ' pace-letter--tile' : ''}" aria-pressed="${pressed}" aria-label="${esc(tip)}" title="${esc(tip)}" ${disabled ? 'disabled' : ''} data-eclass-onclick="${actionName}(${prefix}'${letter}')">${body}</button>`;
  }).join('');
}

function paceLegendMarkup() {
  return `<div class="pace-legend">${PACE_LETTERS.slice().reverse().map(letter =>
    `<span><b>${letter}</b> ${esc(paceLetterShortName(letter))}</span>`
  ).join('')}</div>`;
}

function paceMeterMarkup(counts, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const unrated = counts && counts.unrated ? counts.unrated : 0;
  const rated = Math.max(0, safeTotal - unrated);
  const pct = safeTotal ? Math.round((rated / safeTotal) * 100) : 0;
  return `<div class="pace-meter"><div class="pace-meter__track"><div class="pace-meter__fill" data-eclass-style="width:${pct}%"></div></div><div class="pace-meter__label"><span>${rated} of ${safeTotal} rated</span><span>${unrated} unrated</span></div></div>`;
}

function paceShortcutsMarkup() {
  const hidden = paceUi.showShortcuts ? '' : ' hidden';
  return `<div class="pace-shortcuts"${hidden}>
    <strong>Keys</strong>
    <span>${paceKbd('A')}–${paceKbd('E')} or ${paceKbd('1')}–${paceKbd('5')} rate</span>
    <span>${paceKbd('←')}${paceKbd('→')} criterion</span>
    <span>${paceKbd('↑')}${paceKbd('↓')} learner</span>
    <span>${paceKbd('Alt')}+${paceKbd('C')}/${paceKbd('I')} mode</span>
    <span>${paceKbd('Alt')}+${paceKbd('1')}–${paceKbd('5')} area</span>
    <span>${paceKbd('/')} search</span>
    <span>${paceKbd('Space')} select</span>
    <span>${paceKbd('Ctrl')}+${paceKbd('Z')} undo</span>
    <span>${paceKbd('Ctrl')}+${paceKbd('E')} export</span>
    <span>${paceKbd('?')} hide</span>
  </div>`;
}

function paceVisibleLearners(assignment) {
  const query = String(paceUi.rosterQuery || '').trim().toLowerCase();
  return paceActiveRoster(assignment).filter(person => {
    if (!query) return true;
    return `${person.name || ''} ${person.lrn || ''}`.toLowerCase().includes(query);
  });
}

function paceCountsMarkup(counts) {
  return PACE_LETTERS.slice().reverse().map(letter => `<span class="pace-count pace-count--${letter}"><b>${letter}</b> ${counts[letter] || 0}</span>`).join('')
    + `<span class="pace-count"><b>—</b> ${counts.unrated || 0} unrated</span>`;
}

function renderPaceUi() {
  const root = document.getElementById('paceRatingPanel');
  if (!root) return;
  const assignment = typeof currentAssignment === 'function' ? currentAssignment() : null;
  if (!assignment || !isPaceAssignment(assignment)) {
    root.hidden = true;
    return;
  }
  paceEnsureStore(assignment);
  const term = (typeof db !== 'undefined' && db.currentTerm) || '1';
  const items = paceCurrentItems(assignment);
  if (!items.length) {
    root.hidden = true;
    const emptyTable = document.getElementById('recordTable');
    if (emptyTable) emptyTable.hidden = false;
    return;
  }
  const evidenceOn = paceUi.showEvidence === true;
  const item = paceCurrentItem(assignment);
  if (!item) {
    root.hidden = true;
    const table = document.getElementById('recordTable');
    if (table) table.hidden = false;
    return;
  }
  const skill = paceCurrentSkill(item);
  const itemApplies = typeof paceItemAppliesToTerm !== 'function' || paceItemAppliesToTerm(item, term);
  const learners = paceActiveRoster(assignment);
  root.hidden = evidenceOn;
  const table = document.getElementById('recordTable');
  if (table) table.hidden = !evidenceOn && learners.length > 0;
  if (paceUi.learnerIndex >= learners.length) paceUi.learnerIndex = Math.max(0, learners.length - 1);
  const learner = learners[paceUi.learnerIndex];
  const skillLabel = typeof paceCellCaption === 'function' ? paceCellCaption(item, skill, paceUi.skillIndex) : (skill ? (PACE_SKILL_LABELS[skill] || skill) : '');
  const cellNumber = typeof paceCellNumber === 'function' ? paceCellNumber(item, paceUi.skillIndex) : item.number;
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : (assignment.subject || '');
  const subjectName = typeof paceSubjectDisplayName === 'function' ? paceSubjectDisplayName(subject) : subject;
  const counts = paceLetterCounts(assignment, item, term, skill);
  const query = String(paceUi.rosterQuery || '').trim().toLowerCase();
  const visible = learners.filter(person => {
    if (!query) return true;
    return `${person.name || ''} ${person.lrn || ''}`.toLowerCase().includes(query);
  });
  const rosterList = document.querySelector('#paceRatingPanel .pace-roster-list');
  const rosterScrollTop = rosterList ? rosterList.scrollTop : 0;
  const officialHost = typeof document.querySelector === 'function'
    ? document.querySelector('#paceOfficialFormHost')
    : null;
  const officialScrollTop = officialHost ? officialHost.scrollTop : 0;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const activeId = active && active.id;
  const selectionStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const selectionEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

  try {
    const lettered = typeof paceHasLetteredParts === 'function' && paceHasLetteredParts(item);
    const details = !lettered && (item.details || []).length
      ? `<ul class="pace-details">${item.details.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`
      : '';
    const standard = item.standard ? `<p class="pace-standard">${esc(item.standard)}</p>` : '';
    const cellNote = skillLabel ? `<p class="pace-progress">${lettered ? `${esc(cellNumber)} ${esc(skillLabel)}` : esc(skillLabel)}</p>` : '';
    const subjectTone = typeof paceSubjectTone === 'function' ? paceSubjectTone(subject) : '';
    const classOn = paceUi.mode === 'class';
    const ratedCount = Math.max(0, learners.length - (counts.unrated || 0));

    const individual = learner ? renderPaceIndividual(assignment, learner, item, skill, term, learners.length, itemApplies) : '<p class="text-muted">Add learners before rating.</p>';
    const classPane = renderPaceClass(assignment, item, skill, term, visible, counts, itemApplies);

    root.innerHTML = `
    <div class="pace-shell" data-pace-root="true" data-pace-subject="${esc(subjectTone)}">
      <div class="pace-toolbar">
        <div class="pace-toolbar-cluster">
          <div class="pace-mode-toggle" role="group" aria-label="Rating mode">
            <button type="button" class="pace-mode-toggle__option${classOn ? ' is-active' : ''}" aria-pressed="${classOn ? 'true' : 'false'}" title="Class mode (Alt+C)" data-eclass-onclick="paceSetMode('class')">${paceIcon('users')} Class</button>
            <button type="button" class="pace-mode-toggle__option${!classOn ? ' is-active' : ''}" aria-pressed="${!classOn ? 'true' : 'false'}" title="Individual mode (Alt+I)" data-eclass-onclick="paceSetMode('individual')">${paceIcon('user')} Individual</button>
          </div>
          <div class="pace-crumb">
            <p class="pace-crumb__kicker">${esc(subjectName)} · Term ${esc(term)}</p>
            <p class="pace-crumb__title">${esc(cellNumber)}${skillLabel ? ` · ${esc(skillLabel)}` : ''} · ${ratedCount}/${learners.length} rated</p>
          </div>
        </div>
        <div class="pace-toolbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" title="Previous criterion (Left arrow)" data-eclass-onclick="pacePrevItem()">${paceIcon('chevronLeft')} Previous</button>
          <button type="button" class="btn btn-ghost btn-sm" title="Next criterion (Right arrow)" data-eclass-onclick="paceNextItem()">Next ${paceIcon('chevronRight')}</button>
          <button type="button" class="btn btn-ghost btn-sm" title="Keyboard shortcuts (?)" data-eclass-onclick="paceToggleShortcuts()">${paceIcon('keyboard')} Shortcuts</button>
          ${typeof isKinderAssignment === 'function' && isKinderAssignment(assignment) ? '' : `<label class="checkbox-row pace-per-skill"><input type="checkbox"${typeof paceUsesPerSkillRating === 'function' && paceUsesPerSkillRating(assignment) ? ' checked' : ''} data-eclass-onchange="paceTogglePerSkill(this.checked)"> Rate L/S/R/C separately</label>`}
        </div>
      </div>
      ${renderPaceSubjectTabs(assignment)}
      <div class="pace-body">
        ${renderPaceCriterionNav(assignment, term, item, skill)}
        <div class="pace-main">
          <div class="pace-criterion">
            <div class="pace-group">${esc(subjectName)}${item.group ? ` · ${esc(item.group)}` : ''}${itemApplies ? '' : ' · not rated this term'}</div>
            <h3 class="pace-title">${lettered ? `${esc(item.number)}. ${esc(item.title)}` : `${esc(cellNumber)}. ${esc(item.title)}`}</h3>
            ${cellNote}${standard}${details}
            ${paceLegendMarkup()}
            ${paceMeterMarkup(counts, learners.length)}
          </div>
          ${classOn ? classPane : individual}
        </div>
      </div>
      ${paceShortcutsMarkup()}
    </div>
  `;
    const restoredList = document.querySelector('#paceRatingPanel .pace-roster-list');
    if (restoredList) restoredList.scrollTop = rosterScrollTop;
    const restoredActive = activeId ? document.getElementById(activeId) : null;
    if (restoredActive && typeof restoredActive.focus === 'function') {
      restoredActive.focus();
      if (selectionStart != null && typeof restoredActive.setSelectionRange === 'function') {
        restoredActive.setSelectionRange(selectionStart, selectionEnd == null ? selectionStart : selectionEnd);
      }
    }
    paceScrollActiveCriterion();
    if (typeof paceRefreshOfficialForm === 'function') {
      Promise.resolve(paceRefreshOfficialForm()).then(() => {
        const restoredForm = typeof document.querySelector === 'function'
          ? document.querySelector('#paceOfficialFormHost')
          : null;
        if (restoredForm) restoredForm.scrollTop = officialScrollTop;
      });
    }
  } catch (error) {
    console.error('PACE UI failed:', error);
    root.hidden = false;
    root.innerHTML = '<p class="text-muted">PACE ratings could not be opened. Add learners, then reopen this class. Optional WW/PT evidence stays on the grading sheet.</p>';
    const fallbackTable = document.getElementById('recordTable');
    if (fallbackTable) fallbackTable.hidden = false;
  }
}

function renderPaceIndividual(assignment, learner, item, skill, term, learnerCount, itemApplies) {
  const letter = paceGetRating(assignment, learner.id, item.id, term, skill);
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject;
  const result = paceTermResult(assignment, learner.id, term, subject);
  const summary = typeof paceTermSummary === 'function'
    ? paceTermSummary(assignment, learner.id, term, subject)
    : { canDo: '', toImprove: '' };
  const name = typeof learnerDisplayName === 'function' ? learnerDisplayName(learner) : (learner.name || 'Learner');
  const disabled = itemApplies === false;
  return `
    <div class="pace-individual">
      <div class="pace-learner-card">
        <div class="pace-progress">Learner ${paceUi.learnerIndex + 1} of ${learnerCount}</div>
        <div class="pace-learner-name">${esc(name)}</div>
        <div class="pace-learner-meta">LRN: ${esc(learner.lrn || '—')}</div>
        <div class="pace-letter-row">${paceLetterButtons(letter, 'paceRateCurrent', '', { disabled, tiles: true })}</div>
        <p class="pace-hint">${disabled ? 'This competency is not rated this term.' : 'Press A–E or 1–5 to save this letter. Left/Right arrows change criterion. Up/Down arrows change learner. Skip leaves the cell unrated.'}</p>
        <div class="pace-nav-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="pacePrevCriterion()">Previous</button>
          <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="paceSkipCriterion()">Skip</button>
          <button type="button" class="btn btn-primary btn-sm" data-eclass-onclick="paceNextCriterion()">Next criterion</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="paceToggleBooklet()">${paceUi.showBooklet ? 'Hide' : 'Show'} booklet overview</button>
        ${paceIsYearLongSubject(typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject) && String(term) !== '1' ? `<button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="paceCopyPreviousTerm()">Copy Term ${Number(term) - 1} unrated cells into Term ${esc(term)}</button>` : ''}
      </div>
      <div class="pace-side">
        <div class="pace-letter-bar">Subject letter: <strong>${esc(result.letter || '—')}</strong> (${result.rated} of ${result.expected} rated)${result.override ? ' · override' : ''}</div>
        <label class="field-label" for="paceOverrideSelect">Override subject letter</label>
        <select id="paceOverrideSelect" class="field-select" data-eclass-onchange="paceOverrideCurrent(this.value)">
          <option value="">Use median</option>
          ${PACE_LETTERS.slice().reverse().map(option => `<option value="${option}" ${result.override === option ? 'selected' : ''}>${option}</option>`).join('')}
        </select>
        <label class="field-label" for="paceCanDo">What Your Child Can Do (Mga Nagagawa)</label>
        <textarea id="paceCanDo" class="field-input pace-narrative" rows="3" data-eclass-oninput="paceSaveTermSummaryFields()" placeholder="Mga nagagawa this term">${esc(summary.canDo)}</textarea>
        <label class="field-label" for="paceToImprove">What Your Child Is Learning To Improve (Dapat Linangin)</label>
        <textarea id="paceToImprove" class="field-input pace-narrative" rows="3" data-eclass-oninput="paceSaveTermSummaryFields()" placeholder="Dapat linangin this term">${esc(summary.toImprove)}</textarea>
        ${paceUi.showBooklet ? paceBookletOverviewMarkup(assignment, learner, term) : ''}
      </div>
      ${typeof isGrade1PaceAssignment === 'function' && isGrade1PaceAssignment(assignment)
        ? '<div class="pace-official-live" id="paceOfficialFormHost" aria-label="Official PACE form"></div>'
        : ''}
    </div>
  `;
}

function renderPaceClass(assignment, item, skill, term, visible, counts, itemApplies) {
  const disabled = itemApplies === false;
  const selectedCount = Object.keys(paceUi.selectedIds).filter(id => paceUi.selectedIds[id]).length;
  if (!paceUi.focusedLearnerId && visible[0]) paceUi.focusedLearnerId = visible[0].id;
  const rows = visible.map(person => {
    const letter = paceGetRating(assignment, person.id, item.id, term, skill);
    const name = typeof learnerDisplayName === 'function' ? learnerDisplayName(person) : (person.name || 'Learner');
    const checked = paceUi.selectedIds[person.id] ? ' checked' : '';
    const focused = paceUi.focusedLearnerId === person.id ? ' is-focused' : '';
    const selected = paceUi.selectedIds[person.id] ? ' is-selected' : '';
    return `<div class="pace-roster-row${focused}${selected}" role="listitem" data-eclass-onclick="paceFocusLearner('${esc(person.id)}')"><label class="pace-roster-select"><input type="checkbox"${checked} data-eclass-onchange="paceToggleSelected('${esc(person.id)}', this.checked)" aria-label="Select ${esc(name)}"></label><span class="pace-roster-name" title="${esc(name)}">${esc(name)}</span><div class="pace-letter-row pace-roster-letters">${paceLetterButtons(letter, 'paceRateLearner', person.id, { disabled })}</div></div>`;
  }).join('');
  return `
    <div class="pace-class">
      <div class="pace-class-actions">
        <div>
          <div class="field-label">Set unrated learners to</div>
          <div class="pace-letter-row pace-letter-row--palette">${paceLetterButtons('', 'paceClassSetLetter', '', { disabled, tiles: true })}</div>
        </div>
        <label class="checkbox-row pace-replace"><input type="checkbox" ${paceUi.replaceClass ? 'checked' : ''} data-eclass-onchange="paceToggleReplace(this.checked)"> Replace existing letters</label>
        <div class="pace-bulk">
          <button type="button" class="btn btn-primary" ${disabled ? 'disabled' : ''} data-eclass-onclick="paceIncrementClass()">Increment class</button>
          <button type="button" class="btn btn-primary" ${disabled ? 'disabled' : ''} data-eclass-onclick="paceIncrementSelected()">Increment selected</button>
          <button type="button" class="btn btn-ghost" data-eclass-onclick="paceUndoBulk()">Undo</button>
        </div>
        <div class="pace-counts">${paceCountsMarkup(counts)}</div>
        <p class="pace-hint">${disabled ? 'This competency is not rated this term.' : 'Check learners to increment. Clear removes letters on this competency. Set fills empty cells only unless Replace is on. A–E rates the highlighted row.'}</p>
        <button type="button" class="btn btn-ghost btn-sm" ${disabled ? 'disabled' : ''} data-eclass-onclick="paceApplyRemainingPrompt()">Apply this letter to remaining unrated competencies</button>
      </div>
      <div class="pace-roster">
        <div class="pace-roster-tools">
          <div class="pace-roster-search">
            ${paceIcon('search')}
            <input id="paceRosterSearch" class="field-input" type="search" placeholder="Search learners..." value="${esc(paceUi.rosterQuery)}" data-eclass-oninput="paceFilterRoster(this.value)" aria-label="Search learners">
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="paceSelectVisible(true)">Select visible</button>
          <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="paceClearVisibleRatings()" title="Clear ratings for selected or visible learners">Clear</button>
          <button type="button" class="btn btn-ghost btn-sm" data-eclass-onclick="paceInvertVisible()">Invert</button>
          <span class="pace-roster-meta">${selectedCount} selected · ${visible.length} shown</span>
        </div>
        <div class="pace-roster-list" tabindex="0" role="list" aria-label="Learners">${rows || '<p class="text-muted">No learners match.</p>'}</div>
      </div>
    </div>
  `;
}

function paceSetMode(mode) {
  paceUi.mode = mode === 'individual' ? 'individual' : 'class';
  paceUi.officialFocus = null;
  renderPaceUi();
}

function paceSetSubject(name) {
  const assignment = typeof currentAssignment === 'function' ? currentAssignment() : null;
  paceUi.subject = String(name || '');
  paceUi.itemIndex = 0;
  paceUi.skillIndex = 0;
  paceUi.focusedKey = '';
  paceUi.officialFocus = null;
  if (assignment && typeof isPaceHomeroomAssignment === 'function' && isPaceHomeroomAssignment(assignment)) {
    paceEnsureStore(assignment).currentSubject = paceUi.subject;
    pacePersist();
  }
  renderPaceUi();
}

function paceRateLearner(learnerId, letter) {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  if (!assignment || !item || !learnerId) return;
  const term = db.currentTerm || '1';
  if (typeof paceItemAppliesToTerm === 'function' && !paceItemAppliesToTerm(item, term)) return;
  paceSetRating(assignment, learnerId, item.id, term, paceCurrentSkill(item), letter);
  pacePersist();
  renderPaceUi();
}

function paceSetSkill(index) {
  paceUi.skillIndex = Number(index) || 0;
  renderPaceUi();
}

function paceMoveItem(delta) {
  paceUi.officialFocus = null;
  const assignment = currentAssignment();
  const items = paceCurrentItems(assignment);
  if (!items.length) return;
  if (paceUi.itemIndex >= items.length) paceUi.itemIndex = 0;
  const skills = paceUiCellSkills(items[paceUi.itemIndex]);
  if (delta > 0) {
    if (paceUi.skillIndex < skills.length - 1) paceUi.skillIndex += 1;
    else if (paceUi.itemIndex < items.length - 1) {
      paceUi.itemIndex += 1;
      paceUi.skillIndex = 0;
    } else {
      paceUi.itemIndex = 0;
      paceUi.skillIndex = 0;
    }
  } else if (paceUi.skillIndex > 0) {
    paceUi.skillIndex -= 1;
  } else if (paceUi.itemIndex > 0) {
    paceUi.itemIndex -= 1;
    paceUi.skillIndex = Math.max(0, paceUiCellSkills(items[paceUi.itemIndex]).length - 1);
  } else {
    paceUi.itemIndex = items.length - 1;
    paceUi.skillIndex = Math.max(0, paceUiCellSkills(items[paceUi.itemIndex]).length - 1);
  }
  renderPaceUi();
}

function paceClearVisibleRatings() {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  if (!assignment || !item) return;
  const term = db.currentTerm || '1';
  if (typeof paceItemAppliesToTerm === 'function' && !paceItemAppliesToTerm(item, term)) return;
  const skill = paceCurrentSkill(item);
  const query = String(paceUi.rosterQuery || '').trim().toLowerCase();
  const selected = Object.keys(paceUi.selectedIds).filter(id => paceUi.selectedIds[id]);
  const visible = paceActiveRoster(assignment).filter(person => {
    if (!query) return true;
    return `${person.name || ''} ${person.lrn || ''}`.toLowerCase().includes(query);
  });
  const ids = selected.length ? selected : visible.map(person => person.id);
  const count = ids.filter(id => paceGetRating(assignment, id, item.id, term, skill)).length;
  if (!count) {
    if (typeof toast === 'function') toast('No ratings to clear.', 'info');
    return;
  }
  const who = selected.length ? 'selected' : 'visible';
  confirmModal('Clear ratings', `Clear ${count} letter${count === 1 ? '' : 's'} for ${who} learners on this competency? Undo restores the last bulk action.`, () => {
    paceClearRatings(assignment, item, term, skill, ids);
    pacePersist();
    renderPaceUi();
  });
}

function pacePrevItem() { paceMoveItem(-1); }
function paceNextItem() { paceMoveItem(1); }

function paceRateCurrent(letter) {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  const learners = paceActiveRoster(assignment);
  const learner = learners[paceUi.learnerIndex];
  if (!assignment || !item || !learner) return;
  const focus = paceUi.officialFocus;
  const competencyId = focus && focus.competencyId ? focus.competencyId : item.id;
  const term = focus && focus.term ? focus.term : (db.currentTerm || '1');
  const skill = focus && focus.competencyId ? (focus.skill || '') : paceCurrentSkill(item);
  const ratedItem = competencyId === item.id
    ? item
    : (typeof paceCompetencyById === 'function' ? paceCompetencyById(assignment.subject, competencyId) : item);
  if (typeof paceItemAppliesToTerm === 'function' && ratedItem && !paceItemAppliesToTerm(ratedItem, term)) return;
  paceSetRating(assignment, learner.id, competencyId, term, skill, letter);
  pacePersist();
  renderPaceUi();
}

function paceSelectOfficialFormCell(competencyId, term, skill) {
  const assignment = typeof currentAssignment === 'function' ? currentAssignment() : null;
  if (!assignment || typeof isGrade1PaceAssignment !== 'function' || !isGrade1PaceAssignment(assignment)) return;
  const id = String(competencyId || '');
  if (!id) return;
  let subjectName = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject;
  const names = typeof paceHomeroomSubjectNames === 'function'
    ? paceHomeroomSubjectNames()
    : (typeof paceGrade1SubjectNames === 'function' ? paceGrade1SubjectNames() : []);
  for (let index = 0; index < names.length; index += 1) {
    const items = typeof paceAllCompetenciesFor === 'function' ? paceAllCompetenciesFor(names[index]) : [];
    if (items.some(entry => entry.id === id)) {
      subjectName = names[index];
      break;
    }
  }
  paceUi.subject = subjectName;
  paceUi.mode = 'individual';
  if (assignment && typeof isPaceHomeroomAssignment === 'function' && isPaceHomeroomAssignment(assignment)) {
    paceEnsureStore(assignment).currentSubject = paceUi.subject;
  }
  const items = paceCurrentItems(assignment);
  const itemIndex = items.findIndex(entry => entry.id === id);
  if (itemIndex >= 0) paceUi.itemIndex = itemIndex;
  const current = items[paceUi.itemIndex] || (typeof paceCompetencyById === 'function' ? paceCompetencyById(subjectName, id) : null);
  const skills = paceUiCellSkills(current, assignment);
  const skillIndex = skills.indexOf(skill);
  paceUi.skillIndex = skillIndex >= 0 ? skillIndex : 0;
  paceUi.officialFocus = { competencyId: id, term: String(term || ''), skill: skill || '' };
  renderPaceUi();
}

function paceSkipCriterion() {
  paceNextCriterion();
}

function paceNextCriterion() {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  const skills = paceUiCellSkills(item, assignment);
  if (paceUi.skillIndex < skills.length - 1) {
    paceUi.skillIndex += 1;
    renderPaceUi();
    return;
  }
  const items = paceCurrentItems(assignment);
  if (paceUi.itemIndex < items.length - 1) {
    paceUi.itemIndex += 1;
    paceUi.skillIndex = 0;
    renderPaceUi();
    return;
  }
  const learners = paceActiveRoster(assignment);
  if (paceUi.learnerIndex < learners.length - 1) {
    paceUi.learnerIndex += 1;
    paceUi.itemIndex = 0;
    paceUi.skillIndex = 0;
  }
  renderPaceUi();
}

function pacePrevCriterion() {
  if (paceUi.skillIndex > 0) {
    paceUi.skillIndex -= 1;
    renderPaceUi();
    return;
  }
  if (paceUi.itemIndex > 0) {
    paceUi.itemIndex -= 1;
    const item = paceCurrentItem(currentAssignment());
    paceUi.skillIndex = Math.max(0, paceUiCellSkills(item).length - 1);
    renderPaceUi();
    return;
  }
  if (paceUi.learnerIndex > 0) {
    paceUi.learnerIndex -= 1;
    const items = paceCurrentItems(currentAssignment());
    paceUi.itemIndex = Math.max(0, items.length - 1);
    paceUi.skillIndex = 0;
  }
  renderPaceUi();
}

function paceOverrideCurrent(value) {
  const assignment = currentAssignment();
  const learners = paceActiveRoster(assignment);
  const learner = learners[paceUi.learnerIndex];
  if (!assignment || !learner) return;
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject;
  paceSetTermOverride(assignment, learner.id, db.currentTerm || '1', value, subject);
  pacePersist();
  renderPaceUi();
}

function paceSaveNarrative(value) {
  const assignment = currentAssignment();
  const learners = paceActiveRoster(assignment);
  const learner = learners[paceUi.learnerIndex];
  if (!assignment || !learner) return;
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject;
  paceSetNarrative(assignment, learner.id, db.currentTerm || '1', value, subject);
  pacePersist();
}

function paceSaveTermSummaryFields() {
  const assignment = currentAssignment();
  const learners = paceActiveRoster(assignment);
  const learner = learners[paceUi.learnerIndex];
  if (!assignment || !learner || typeof paceSetTermSummary !== 'function') return;
  const canDo = document.getElementById('paceCanDo')?.value || '';
  const toImprove = document.getElementById('paceToImprove')?.value || '';
  paceSetTermSummary(assignment, learner.id, db.currentTerm || '1', canDo, toImprove);
  pacePersist();
}

function paceTogglePerSkill(checked) {
  const assignment = currentAssignment();
  if (!assignment) return;
  paceEnsureStore(assignment).skillRatingMode = checked ? 'per-skill' : 'single-letter';
  paceUi.skillIndex = 0;
  pacePersist();
  renderPaceUi();
}

function paceClassSetLetter(letter) {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  if (!assignment || !item) return;
  const term = db.currentTerm || '1';
  const eligible = paceClassEligibleLearners(assignment, term);
  const skill = paceCurrentSkill(item);
  const count = eligible.filter(person => paceUi.replaceClass || !paceGetRating(assignment, person.id, item.id, term, skill)).length;
  confirmModal('Set class rating', `Set ${count} ${paceUi.replaceClass ? '' : 'unrated '}learners to ${letter} for this competency?`, () => {
    paceClassSet(assignment, item, term, paceCurrentSkill(item), letter, { replace: paceUi.replaceClass });
    pacePersist();
    renderPaceUi();
  });
}

function paceIncrementClass() {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  if (!assignment || !item) return;
  paceIncrementLearners(assignment, item, db.currentTerm || '1', paceCurrentSkill(item), null);
  pacePersist();
  renderPaceUi();
}

function paceIncrementSelected() {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  if (!assignment || !item) return;
  const ids = Object.keys(paceUi.selectedIds).filter(id => paceUi.selectedIds[id]);
  if (!ids.length) {
    toast('Select learners to increment.', 'warning');
    return;
  }
  paceIncrementLearners(assignment, item, db.currentTerm || '1', paceCurrentSkill(item), ids);
  pacePersist();
  renderPaceUi();
}

function paceUndoBulk() {
  const assignment = currentAssignment();
  if (!assignment) return;
  const count = paceUndoLastBulk(assignment);
  if (!count) {
    toast('Nothing to undo.', 'warning');
    return;
  }
  pacePersist();
  renderPaceUi();
}

function paceToggleReplace(on) {
  paceUi.replaceClass = !!on;
}

function paceInvertVisible() {
  const assignment = currentAssignment();
  const query = String(paceUi.rosterQuery || '').trim().toLowerCase();
  paceActiveRoster(assignment).forEach(person => {
    const matches = !query || `${person.name || ''} ${person.lrn || ''}`.toLowerCase().includes(query);
    if (!matches) return;
    if (paceUi.selectedIds[person.id]) delete paceUi.selectedIds[person.id];
    else paceUi.selectedIds[person.id] = true;
  });
  renderPaceUi();
}

function paceApplyRemainingPrompt() {
  const assignment = currentAssignment();
  const item = paceCurrentItem(assignment);
  if (!assignment || !item) return;
  const term = db.currentTerm || '1';
  const counts = paceLetterCounts(assignment, item, term, paceCurrentSkill(item));
  const popular = ['A', 'B', 'C', 'D', 'E'].sort((left, right) => (counts[right] || 0) - (counts[left] || 0))[0];
  const chosen = popular && counts[popular] ? popular : 'E';
  confirmModal('Apply remaining', `Set remaining unrated competencies this term to ${chosen}? Empty cells only unless Replace is on.`, () => {
    paceClassSetRemaining(assignment, paceUi.itemIndex, paceUi.skillIndex, term, chosen, { replace: paceUi.replaceClass });
    pacePersist();
    renderPaceUi();
  });
}

function paceToggleBooklet() {
  paceUi.showBooklet = !paceUi.showBooklet;
  renderPaceUi();
}

function paceJumpItem(index, skillIndex) {
  paceUi.itemIndex = Number(index) || 0;
  paceUi.skillIndex = Number(skillIndex) || 0;
  renderPaceUi();
}

function paceJumpAssignment(assignmentId, itemId, skillIndex) {
  const term = (typeof db !== 'undefined' ? db.currentTerm : '') || '1';
  const pool = (typeof db !== 'undefined' && Array.isArray(db.assignments)) ? db.assignments : [];
  const target = pool.find(item => item.id === assignmentId)
    || (typeof currentAssignment === 'function' ? currentAssignment() : null);
  if (!target) return;
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(target) : target.subject;
  const items = paceCompetenciesFor(subject, term);
  const index = items.findIndex(item => item.id === itemId);
  if (index < 0) {
    if (typeof toast === 'function') toast('That competency is not rated this term.', 'info');
    return;
  }
  paceUi.itemIndex = index;
  paceUi.skillIndex = Number(skillIndex) || 0;
  paceUi.focusedKey = `${assignmentId}|${term}|${subject}`;
  const current = typeof currentAssignment === 'function' ? currentAssignment() : null;
  if (current && current.id === assignmentId) {
    renderPaceUi();
    return;
  }
  if (typeof selectAssignment === 'function') {
    selectAssignment(assignmentId);
    return;
  }
  if (typeof db !== 'undefined') db.currentAssignmentId = assignmentId;
  renderPaceUi();
}

function paceCopyPreviousTerm() {
  const assignment = currentAssignment();
  const term = parseInt(db.currentTerm || '1', 10);
  if (!assignment || term < 2) return;
  const count = paceCopyYearLongTerm(assignment, String(term - 1), String(term));
  if (!count) {
    toast('No year-long unrated cells to copy.', 'warning');
    return;
  }
  pacePersist();
  renderPaceUi();
}

function paceBookletOverviewMarkup(assignment, learner, term) {
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject;
  const items = typeof paceAllCompetenciesFor === 'function'
    ? paceAllCompetenciesFor(subject)
    : paceCurrentItems(assignment);
  const terms = ['1', '2', '3'];
  const rows = items.map(item => {
    const cells = terms.map(column => {
      const applies = typeof paceItemAppliesToTerm !== 'function' || paceItemAppliesToTerm(item, column);
      if (!applies) {
        return '<span class="pace-overview-cell is-na" title="Not applicable this term"></span>';
      }
      const skills = paceUiCellSkills(item, assignment);
      const letters = skills.map((skill, skillIndex) => {
        const letter = paceGetRating(assignment, learner.id, item.id, column, skill) || '—';
        const active = String(column) === String(term) && item.id === (paceCurrentItem(assignment) || {}).id && skillIndex === paceUi.skillIndex ? ' is-active' : '';
        const jump = String(column) === String(term)
          ? ` data-eclass-onclick="paceJumpAssignment('${esc(assignment.id)}', '${esc(item.id)}', ${skillIndex})"`
          : '';
        return `<button type="button" class="pace-overview-cell${active}"${jump}>${esc(letter)}</button>`;
      }).join('');
      return `<span class="pace-overview-term">${letters}</span>`;
    }).join('');
    return `<div class="pace-overview-row"><span>${item.number}. ${esc(item.title)}</span><span class="pace-overview-terms">${cells}</span></div>`;
  }).join('');
  return `<div class="pace-overview"><div class="field-label">Booklet overview</div><p class="pace-na-legend">Gray cells are not applicable that term and are not rated.</p><div class="pace-overview-head"><span>Competency</span><span>T1</span><span>T2</span><span>T3</span></div>${rows}</div>`;
}

function paceFocusFirstUnrated(assignment) {
  if (!assignment) return;
  const term = typeof db !== 'undefined' ? (db.currentTerm || '1') : '1';
  const subject = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject;
  const key = `${assignment.id}|${term}|${subject}`;
  if (paceUi.focusedKey === key) return;
  paceUi.focusedKey = key;
  paceUi.mode = 'class';
  const focus = paceFirstUnratedFocus(assignment, term);
  paceUi.itemIndex = focus.itemIndex;
  paceUi.skillIndex = focus.skillIndex;
}

function paceToggleSelected(learnerId, checked) {
  if (checked) paceUi.selectedIds[learnerId] = true;
  else delete paceUi.selectedIds[learnerId];
}

function paceSelectVisible(on) {
  const assignment = currentAssignment();
  const term = db.currentTerm || '1';
  const query = String(paceUi.rosterQuery || '').trim().toLowerCase();
  paceActiveRoster(assignment).forEach(person => {
    const matches = !query || `${person.name || ''} ${person.lrn || ''}`.toLowerCase().includes(query);
    if (!matches) return;
    if (on) paceUi.selectedIds[person.id] = true;
    else delete paceUi.selectedIds[person.id];
  });
  renderPaceUi();
}

function paceFilterRoster(value) {
  paceUi.rosterQuery = String(value || '');
  renderPaceUi();
}

function setPaceToolbarButton(el, on) {
  if (!el) return;
  el.hidden = !on;
  if (el.style) el.style.display = on ? 'inline-flex' : 'none';
}

function paceToggleEvidence() {
  const assignment = currentAssignment();
  if (!isGrade1PaceAssignment(assignment)) return;
  paceUi.showEvidence = !paceUi.showEvidence;
  const table = document.getElementById('recordTable');
  const panel = document.getElementById('paceRatingPanel');
  if (table) table.hidden = isPaceAssignment(assignment) && !paceUi.showEvidence;
  if (panel) panel.hidden = !isPaceAssignment(assignment) || paceUi.showEvidence;
  if (!paceUi.showEvidence) renderPaceUi();
}

function syncPaceWorkspace() {
  const assignment = typeof currentAssignment === 'function' ? currentAssignment() : null;
  const paceOn = typeof isPaceAssignment === 'function' && isPaceAssignment(assignment);
  const grade1Pace = typeof isGrade1PaceAssignment === 'function' && isGrade1PaceAssignment(assignment);
  const kinder = typeof isKinderAssignment === 'function' && isKinderAssignment(assignment);
  const evidenceBtn = document.getElementById('paceEvidenceBtn');
  const printBtn = document.getElementById('pacePrintBtn');
  const exportBtn = document.getElementById('paceExportBtn');
  const recordPanel = document.getElementById('classRecordPanel');
  const title = document.getElementById('classRecordTitle');
  if (!grade1Pace) paceUi.showEvidence = false;
  if (recordPanel && recordPanel.classList && typeof recordPanel.classList.toggle === 'function') {
    recordPanel.classList.toggle('is-pace-workspace', paceOn);
  }
  if (title) {
    title.textContent = grade1Pace ? 'Grade 1 PACE Record' : (kinder ? 'Kindergarten Record' : 'Class Record');
  }
  setPaceToolbarButton(evidenceBtn, grade1Pace);
  if (evidenceBtn) {
    const evidenceLabel = document.getElementById('paceEvidenceLabel');
    const evidenceText = paceUi.showEvidence ? 'Back to PACE' : 'Evidence (optional)';
    if (evidenceLabel) evidenceLabel.textContent = evidenceText;
    else if (!evidenceBtn.querySelector || !evidenceBtn.querySelector('.btn-icon')) evidenceBtn.textContent = evidenceText;
  }
  setPaceToolbarButton(printBtn, grade1Pace);
  setPaceToolbarButton(exportBtn, grade1Pace);
  if (!paceOn) {
    const panel = document.getElementById('paceRatingPanel');
    if (panel) panel.hidden = true;
    const table = document.getElementById('recordTable');
    if (table) table.hidden = false;
    paceUi.focusedKey = '';
    return;
  }
  try {
    paceFocusFirstUnrated(assignment);
    if (!paceUi.showEvidence) renderPaceUi();
  } catch (error) {
    console.error('PACE workspace failed:', error);
  }
}

function printPaceBooklet() {
  const assignment = currentAssignment();
  if (!assignment || !isGrade1PaceAssignment(assignment)) return;
  const host = document.getElementById('paceBookletPrint');
  if (!host) return;
  const school = typeof db !== 'undefined' ? db : {};
  const learners = paceActiveRoster(assignment);
  const subjects = typeof isPaceHomeroomAssignment === 'function' && isPaceHomeroomAssignment(assignment)
    ? (typeof paceHomeroomSubjectNames === 'function' ? paceHomeroomSubjectNames() : [assignment.subject])
    : [assignment.subject];
  host.innerHTML = learners.map(learner => subjects.map(subject => paceBookletPageMarkup(assignment, learner, school, subject)).join('')).join('');
  document.body.classList.add('print-pace-booklet');
  window.print();
  document.body.classList.remove('print-pace-booklet');
}

function paceBookletPageMarkup(assignment, learner, school, subjectName) {
  const name = typeof learnerDisplayName === 'function' ? learnerDisplayName(learner) : (learner.name || '');
  const subject = subjectName || (typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : assignment.subject) || '';
  const terms = ['1', '2', '3'];
  const catalog = paceSubjectCatalog(subject);
  const items = catalog ? catalog.items : [];
  const rows = items.map(item => {
    const cells = terms.map(column => {
      if (typeof paceItemAppliesToTerm === 'function' ? !paceItemAppliesToTerm(item, column) : !item.terms.includes(parseInt(column, 10))) {
        return '<td class="pace-print-na" title="Not applicable this term"></td>';
      }
      const letters = paceUiCellSkills(item, assignment).map(skill => paceGetRating(assignment, learner.id, item.id, column, skill) || '');
      const incomplete = letters.every(letter => !letter);
      return `<td class="${incomplete ? 'pace-print-incomplete' : ''}">${esc(letters.filter(Boolean).join(' / ') || '')}</td>`;
    }).join('');
    return `<tr><td>${item.number}. ${esc(item.title)}</td>${cells}</tr>`;
  }).join('');
  const remarks = terms.map(term => {
    const letter = paceTermResult(assignment, learner.id, term, subject).letter || '—';
    const note = assignment.pace?.narratives?.[paceOverrideKey(learner.id, term, subject, assignment)] || '';
    return `<p><strong>Term ${esc(term)}: ${esc(letter)}</strong> ${esc(note)}</p>`;
  }).join('');
  return `
    <article class="pace-print-page">
      <h1>PACE Form — Grade 1</h1>
      <p>${esc(school.schoolName || '')} · SY ${esc(assignment.schoolYear || school.schoolYear || '')}</p>
      <p>Name: <strong>${esc(name)}</strong> · LRN: ${esc(learner.lrn || '—')} · Section: ${esc(assignment.section || '')}</p>
      <p>Learning area: <strong>${esc(subject)}</strong></p>
      <table class="pace-print-table">
        <thead><tr><th>Learning competencies</th><th>T1</th><th>T2</th><th>T3</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="pace-print-legend">Gray cells are not applicable that term and are not rated.</p>
      ${remarks}
    </article>
  `;
}

function paceToggleShortcuts() {
  paceUi.showShortcuts = !paceUi.showShortcuts;
  renderPaceUi();
}

function paceFocusLearner(learnerId) {
  paceUi.focusedLearnerId = String(learnerId || '');
  const learners = paceActiveRoster(typeof currentAssignment === 'function' ? currentAssignment() : null);
  const index = learners.findIndex(person => person.id === paceUi.focusedLearnerId);
  if (index >= 0) paceUi.learnerIndex = index;
  renderPaceUi();
}

function paceMoveLearner(delta) {
  const learners = paceActiveRoster(typeof currentAssignment === 'function' ? currentAssignment() : null);
  const next = paceUi.learnerIndex + delta;
  if (next < 0 || next >= learners.length) return;
  paceUi.learnerIndex = next;
  paceUi.focusedLearnerId = learners[next] ? learners[next].id : '';
  if (learners[next]) paceUi.formLearnerId = learners[next].id;
  renderPaceUi();
}

function paceMoveRosterFocus(delta) {
  const visible = paceVisibleLearners(typeof currentAssignment === 'function' ? currentAssignment() : null);
  if (!visible.length) return;
  let index = visible.findIndex(person => person.id === paceUi.focusedLearnerId);
  if (index < 0) index = 0;
  else index = Math.min(visible.length - 1, Math.max(0, index + delta));
  paceUi.focusedLearnerId = visible[index].id;
  const roster = paceActiveRoster(typeof currentAssignment === 'function' ? currentAssignment() : null);
  const rosterIndex = roster.findIndex(person => person.id === paceUi.focusedLearnerId);
  if (rosterIndex >= 0) paceUi.learnerIndex = rosterIndex;
  renderPaceUi();
  const row = typeof document !== 'undefined' ? document.querySelector('#paceRatingPanel .pace-roster-row.is-focused') : null;
  if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
}

function paceToggleFocusedSelect() {
  const id = paceUi.focusedLearnerId;
  if (!id) return;
  if (paceUi.selectedIds[id]) delete paceUi.selectedIds[id];
  else paceUi.selectedIds[id] = true;
  renderPaceUi();
}

function paceSetSubjectByIndex(index) {
  const names = typeof paceHomeroomSubjectNames === 'function' ? paceHomeroomSubjectNames() : [];
  if (!names[index]) return;
  paceSetSubject(names[index]);
}

function paceCycleSubject(delta) {
  const assignment = typeof currentAssignment === 'function' ? currentAssignment() : null;
  if (typeof isPaceHomeroomAssignment !== 'function' || !isPaceHomeroomAssignment(assignment)) return;
  const names = typeof paceHomeroomSubjectNames === 'function' ? paceHomeroomSubjectNames() : [];
  if (!names.length) return;
  const current = typeof paceWorkingSubject === 'function' ? paceWorkingSubject(assignment) : '';
  const index = Math.max(0, names.indexOf(current));
  const next = names[(index + delta + names.length) % names.length];
  paceSetSubject(next);
}

function paceTypingTarget(target) {
  if (!target) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/i.test(String(target.tagName || ''))) return true;
  if (target.isContentEditable) return true;
  return false;
}

function pacePanelOpen() {
  const panel = typeof document !== 'undefined' ? document.getElementById('paceRatingPanel') : null;
  return Boolean(panel && !panel.hidden);
}

function paceModalOpen() {
  if (typeof document === 'undefined') return false;
  if (typeof isVisibleModalOverlay === 'function' && typeof document.querySelectorAll === 'function') {
    const overlays = document.querySelectorAll('.modal-overlay');
    for (let i = 0; i < overlays.length; i += 1) {
      if (overlays[i] && overlays[i].id === 'paceFormPreviewModal') continue;
      if (isVisibleModalOverlay(overlays[i])) return true;
    }
  }
  return false;
}

function paceHandleKeydown(event) {
  if (!event || !pacePanelOpen() || paceModalOpen()) return;
  const typing = paceTypingTarget(event.target);
  const key = String(event.key || '');
  const upper = key.toUpperCase();
  const meta = event.ctrlKey || event.metaKey;
  const previewOpen = typeof document !== 'undefined' && (
    typeof document.querySelector === 'function'
      ? document.querySelector('#paceFormPreviewModal')
      : document.getElementById('paceFormPreviewModal')
  );

  if (key === 'Escape' && previewOpen) {
    event.preventDefault();
    if (typeof closePaceFormPreview === 'function') closePaceFormPreview();
    return;
  }

  if (meta && !event.altKey && upper === 'E'
    && typeof isGrade1PaceAssignment === 'function'
    && isGrade1PaceAssignment(typeof currentAssignment === 'function' ? currentAssignment() : null)) {
    event.preventDefault();
    if (typeof openPaceFormPreview === 'function') openPaceFormPreview();
    return;
  }

  if (meta && !event.altKey && !event.shiftKey && upper === 'Z' && !typing) {
    event.preventDefault();
    paceUndoBulk();
    return;
  }

  if (typing) {
    if (key === 'Escape' && event.target && typeof event.target.blur === 'function') {
      event.preventDefault();
      event.target.blur();
    }
    return;
  }

  if (key === '?' || (key === '/' && event.shiftKey)) {
    event.preventDefault();
    paceToggleShortcuts();
    return;
  }

  if (key === '/') {
    event.preventDefault();
    const search = document.getElementById('paceRosterSearch');
    if (search && typeof search.focus === 'function') search.focus();
    return;
  }

  if (key === 'Escape' && paceUi.showShortcuts) {
    paceUi.showShortcuts = false;
    renderPaceUi();
    return;
  }

  if (event.altKey && !meta) {
    if (upper === 'C') { event.preventDefault(); paceSetMode('class'); return; }
    if (upper === 'I') { event.preventDefault(); paceSetMode('individual'); return; }
    const fromCode = event.code && String(event.code).indexOf('Digit') === 0 ? Number(String(event.code).slice(5)) : NaN;
    const digit = Number.isFinite(fromCode) ? fromCode : Number(key);
    if (digit >= 1 && digit <= 5) {
      event.preventDefault();
      paceSetSubjectByIndex(digit - 1);
    }
    return;
  }

  if (key === '[') { event.preventDefault(); paceCycleSubject(-1); return; }
  if (key === ']') { event.preventDefault(); paceCycleSubject(1); return; }

  if (key === 'ArrowLeft' || key === 'PageUp') { event.preventDefault(); pacePrevItem(); return; }
  if (key === 'ArrowRight' || key === 'PageDown') { event.preventDefault(); paceNextItem(); return; }

  if (key === 'Home') {
    event.preventDefault();
    paceUi.itemIndex = 0;
    paceUi.skillIndex = 0;
    renderPaceUi();
    return;
  }
  if (key === 'End') {
    event.preventDefault();
    const items = paceCurrentItems(typeof currentAssignment === 'function' ? currentAssignment() : null);
    paceUi.itemIndex = Math.max(0, items.length - 1);
    paceUi.skillIndex = Math.max(0, paceUiCellSkills(items[paceUi.itemIndex]).length - 1);
    renderPaceUi();
    return;
  }

  if (key === 'ArrowUp') {
    event.preventDefault();
    if (paceUi.mode === 'individual') paceMoveLearner(-1);
    else paceMoveRosterFocus(-1);
    return;
  }
  if (key === 'ArrowDown') {
    event.preventDefault();
    if (paceUi.mode === 'individual') paceMoveLearner(1);
    else paceMoveRosterFocus(1);
    return;
  }

  if ((key === ' ' || key === 'Spacebar') && paceUi.mode === 'class') {
    event.preventDefault();
    paceToggleFocusedSelect();
    return;
  }

  const map = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };
  if (map[upper] && !event.altKey && !meta) {
    event.preventDefault();
    if (paceUi.mode === 'individual') paceRateCurrent(map[upper]);
    else if (paceUi.focusedLearnerId) paceRateLearner(paceUi.focusedLearnerId, map[upper]);
  }
}

function installPaceKeyboard() {
  if (typeof window === 'undefined' || window.__paceKeyboardInstalled) return;
  window.__paceKeyboardInstalled = true;
  document.addEventListener('keydown', paceHandleKeydown);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installPaceKeyboard, { once: true });
} else {
  installPaceKeyboard();
}
