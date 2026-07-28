/**
 * Teacher Tools workspace UI and lifecycle coordinator.
 */
(function initTeacherToolsModule(globalScope) {
  'use strict';

  const core = globalScope.TeacherToolsCore;
  const registry = new Map();
  let initialized = false;
  let activeToolId = 'groups';
  let groupState = { assignmentId: '', mode: 'random', groupCount: 2, groups: [] };
  let pickerState = {
    assignmentId: '',
    rosterSignature: '',
    picker: null,
    selected: null,
    spinning: false,
    rouletteName: ''
  };
  let pickerAnimationTimer = null;
  let pickerAnimationToken = 0;
  let simulatorState = { assignmentId: '', term: '1', session: null };
  let activeGameId = 'sudoku';
  let gameFrame = null;
  let baseSetView = null;
  let baseRender = null;
  let baseSelectAssignment = null;

  const icons = {
    groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    picker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v5h5"></path><path d="M21 12a9 9 0 0 0-15-6.7L3 8"></path><path d="M21 21v-5h-5"></path><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"></path></svg>',
    simulator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3h6"></path><path d="M10 9h4"></path><path d="M10 3v6l-4 8a3 3 0 0 0 2.7 4h6.6a3 3 0 0 0 2.7-4l-4-8V3"></path></svg>',
    games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line><rect x="2" y="6" width="20" height="12" rx="2"></rect></svg>'
  };

  function profileDb() {
    return globalScope.getActiveProfileDatabase?.();
  }

  function rootDb() {
    return globalScope.getRootDatabase?.();
  }

  function esc(value) {
    return typeof globalScope.esc === 'function'
      ? globalScope.esc(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
  }

  function classAssignments() {
    const database = profileDb();
    if (!database) return [];
    const year = database.schoolYear || '2026-2027';
    return (database.assignments || []).filter(item => item.schoolYear === year);
  }

  function activeAssignment() {
    const database = profileDb();
    const assignments = classAssignments();
    if (!database || assignments.length === 0) return null;
    let assignment = assignments.find(item => item.id === database.currentAssignmentId);
    if (!assignment) {
      assignment = assignments[0];
      database.currentAssignmentId = assignment.id;
    }
    return assignment;
  }

  function assignmentLabel(assignment) {
    return core.assignmentLabel(assignment);
  }

  function learnerName(learner) {
    if (typeof globalScope.learnerDisplayName === 'function') return globalScope.learnerDisplayName(learner);
    return [learner?.lastName ? `${learner.lastName},` : '', learner?.firstName, learner?.middleName]
      .filter(Boolean).join(' ').trim() || 'Unnamed learner';
  }

  function classPicker(id, title) {
    return `<div class="record-class-selector u-mb-0">
      <span class="record-class-label">Active Class:</span>
      <select id="${id}" class="field-select select-class-dropdown" onchange="TeacherTools.handleActiveClassChange(this.value, this)" title="${esc(title)}"></select>
    </div>`;
  }

  function populateClassPickers() {
    const assignments = classAssignments();
    const database = profileDb();
    const activeId = database?.currentAssignmentId || assignments[0]?.id || '';
    ['groupRandomizerClassSelect', 'namePickerClassSelect', 'gradeSimulatorClassSelect']
      .forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';
        if (assignments.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No classes available';
          select.appendChild(option);
          select.disabled = true;
          return;
        }
        assignments.forEach(assignment => {
          const option = document.createElement('option');
          option.value = assignment.id;
          option.textContent = assignmentLabel(assignment);
          option.selected = assignment.id === activeId;
          select.appendChild(option);
        });
        select.disabled = false;
      });
  }

  function hasDirtySimulation() {
    return Boolean(simulatorState.session && core.simulationChanges(simulatorState.session).length);
  }

  function resetTemporaryClassState() {
    cancelPickerAnimation();
    groupState = { assignmentId: '', mode: groupState.mode, groupCount: 2, groups: [] };
    pickerState = {
      assignmentId: '',
      rosterSignature: '',
      picker: null,
      selected: null,
      spinning: false,
      rouletteName: ''
    };
    simulatorState = { assignmentId: '', term: simulatorState.term, session: null };
  }

  function createModal(title, body, actions, wide = false) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}">
      <div class="modal__title">${esc(title)}</div>
      <div class="modal__body">${body}</div>
      <div class="modal__actions">${actions}</div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    return { overlay, close };
  }

  function performClassChange(assignmentId) {
    const previousTool = activeToolId;
    resetTemporaryClassState();
    globalScope.selectAssignment(assignmentId);
    globalScope.setView('tools');
    activate(previousTool);
  }

  function selectAssignmentFromElsewhere(assignmentId, selectElement) {
    const currentId = profileDb()?.currentAssignmentId || '';
    if (!assignmentId || assignmentId === currentId || !hasDirtySimulation()) {
      if (assignmentId !== currentId) resetTemporaryClassState();
      return baseSelectAssignment(assignmentId);
    }
    if (selectElement) selectElement.value = currentId;
    const modal = createModal(
      'Discard Grade Simulation?',
      '<p>The Grade Simulator contains changes that have not been applied to the official class record.</p>',
      '<button class="btn btn-cancel btn-sm" data-stay>Stay Here</button><button class="btn btn-warn btn-sm" data-discard>Discard and Switch</button>'
    );
    modal.overlay.querySelector('[data-stay]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-discard]').addEventListener('click', () => {
      modal.close();
      resetTemporaryClassState();
      baseSelectAssignment(assignmentId);
    });
    return undefined;
  }

  function handleActiveClassChange(assignmentId, selectElement) {
    const currentId = profileDb()?.currentAssignmentId || '';
    if (!assignmentId || assignmentId === currentId) return;
    if (!hasDirtySimulation()) {
      performClassChange(assignmentId);
      return;
    }
    if (selectElement) selectElement.value = currentId;
    const modal = createModal(
      'Discard Grade Simulation?',
      '<p>The Grade Simulator contains changes that have not been applied to the official class record.</p>',
      '<button class="btn btn-cancel btn-sm" data-stay>Stay Here</button><button class="btn btn-warn btn-sm" data-discard>Discard and Switch</button>'
    );
    modal.overlay.querySelector('[data-stay]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-discard]').addEventListener('click', () => {
      modal.close();
      performClassChange(assignmentId);
    });
  }

  function emptyTool(message) {
    return `<div class="teacher-tool__empty"><div>${esc(message)}</div></div>`;
  }

  function renderGroupRandomizer(container) {
    const assignment = activeAssignment();
    const learners = core.activeLearners(assignment);
    if (groupState.assignmentId !== assignment?.id) {
      groupState = { assignmentId: assignment?.id || '', mode: groupState.mode, groupCount: 2, groups: [] };
    }
    const maximum = Math.min(20, learners.length);
    if (groupState.groupCount > maximum) groupState.groupCount = Math.max(2, maximum);

    container.innerHTML = `<div class="teacher-tool">
      <div class="teacher-tool__class-bar no-print">${classPicker('groupRandomizerClassSelect', 'Choose the active class for group randomization')}</div>
      <div class="teacher-tool__body">
        ${assignment ? `<div class="tool-control-strip no-print">
          <div class="tool-stat"><strong>${learners.length}</strong> eligible learners</div>
          <div class="field">
            <label class="field-label" for="groupRandomizerCount">Number of groups</label>
            <input id="groupRandomizerCount" class="field-input" type="number" min="2" max="${maximum}" value="${groupState.groupCount}" ${maximum < 2 ? 'disabled' : ''} onchange="TeacherTools.setGroupCount(this.value)">
          </div>
          <div class="field">
            <span class="field-label">Grouping mode</span>
            <div class="tool-segmented" aria-label="Grouping mode">
              <button type="button" aria-pressed="${groupState.mode === 'random'}" onclick="TeacherTools.setGroupMode('random')">Complete Random</button>
              <button type="button" aria-pressed="${groupState.mode === 'balanced'}" onclick="TeacherTools.setGroupMode('balanced')">Balance by Sex</button>
            </div>
          </div>
          <div class="tool-control-strip__actions">
            <button class="btn btn-primary btn-sm" type="button" onclick="TeacherTools.randomizeGroups()" ${maximum < 2 ? 'disabled' : ''}>${groupState.groups.length ? 'Randomize Again' : 'Randomize'}</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.copyGroups()" ${groupState.groups.length ? '' : 'disabled'} title="Copy group lists">Copy</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.printGroups()" ${groupState.groups.length ? '' : 'disabled'} title="Print group lists">Print</button>
          </div>
        </div>
        ${groupState.groups.length ? renderGroupResults(groupState.groups) : emptyTool(maximum < 2 ? 'Add at least two active learners to create groups.' : 'Choose the number of groups and randomize the class.')}`
        : emptyTool('Create a teaching load before using Group Randomizer.')}
      </div>
    </div>`;
    populateClassPickers();
  }

  function renderGroupResults(groups) {
    return `<div class="group-results">${groups.map((members, index) => {
      const male = members.filter(item => ['M', 'MALE'].includes(String(item.sex || '').toUpperCase())).length;
      const female = members.filter(item => ['F', 'FEMALE'].includes(String(item.sex || '').toUpperCase())).length;
      const unspecified = members.length - male - female;
      return `<section class="group-result">
        <header class="group-result__header">
          <div><h2 class="group-result__title">Group ${index + 1}</h2><span class="group-result__sex">M ${male} · F ${female}${unspecified ? ` · Unspecified ${unspecified}` : ''}</span></div>
          <span class="group-result__count">${members.length}</span>
        </header>
        <ol class="group-result__list">${members.map(learner => `<li>${esc(learnerName(learner))}</li>`).join('')}</ol>
      </section>`;
    }).join('')}</div>`;
  }

  function setGroupCount(value) {
    groupState.groupCount = Number(value);
    groupState.groups = [];
    refresh();
  }

  function setGroupMode(mode) {
    groupState.mode = mode === 'balanced' ? 'balanced' : 'random';
    groupState.groups = [];
    refresh();
  }

  function runGroupRandomizer() {
    try {
      const learners = core.activeLearners(activeAssignment());
      groupState.groups = core.randomizeGroups(learners, groupState.groupCount, groupState.mode);
      refresh();
    } catch (error) {
      globalScope.toast(error.message, 'warning');
    }
  }

  function groupText() {
    const assignment = activeAssignment();
    const lines = [assignmentLabel(assignment), ''];
    groupState.groups.forEach((members, index) => {
      lines.push(`Group ${index + 1}`);
      members.forEach((learner, learnerIndex) => lines.push(`${learnerIndex + 1}. ${learnerName(learner)}`));
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  async function copyGroups() {
    if (!groupState.groups.length) return;
    try {
      await navigator.clipboard.writeText(groupText());
      globalScope.toast('Group lists copied.', 'success');
    } catch (error) {
      globalScope.toast('The group lists could not be copied.', 'error');
    }
  }

  function printGroups() {
    if (!groupState.groups.length) return;
    const sheet = document.getElementById('teacherToolsPrintSheet');
    const assignment = activeAssignment();
    sheet.innerHTML = `<h1>${esc(assignmentLabel(assignment))}</h1>${groupState.groups.map((members, index) =>
      `<h2>Group ${index + 1}</h2><ol>${members.map(learner => `<li>${esc(learnerName(learner))}</li>`).join('')}</ol>`
    ).join('')}`;
    document.body.classList.add('teacher-tools-printing');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('teacher-tools-printing');
      sheet.innerHTML = '';
    }, 100);
  }

  function ensurePicker(assignment) {
    const learners = core.activeLearners(assignment);
    const signature = learners.map(item => item.id).join('|');
    if (pickerState.assignmentId !== assignment?.id || pickerState.rosterSignature !== signature) {
      cancelPickerAnimation();
      pickerState = {
        assignmentId: assignment?.id || '',
        rosterSignature: signature,
        picker: core.createNamePicker(learners),
        selected: null,
        spinning: false,
        rouletteName: ''
      };
    }
    return learners;
  }

  function cancelPickerAnimation() {
    if (pickerAnimationTimer) {
      clearTimeout(pickerAnimationTimer);
      pickerAnimationTimer = null;
    }
    pickerAnimationToken++;
    pickerState.spinning = false;
    pickerState.rouletteName = '';
  }

  function animatePickerName(name) {
    const nameElement = document.getElementById('namePickerRouletteName');
    if (!nameElement) return false;
    nameElement.textContent = name;
    nameElement.classList.remove('is-ticking');
    void nameElement.offsetWidth;
    nameElement.classList.add('is-ticking');
    return true;
  }

  function renderNamePicker(container) {
    const assignment = activeAssignment();
    const learners = ensurePicker(assignment);
    const status = pickerState.picker?.status() || { remaining: 0, total: 0 };
    const displayName = pickerState.spinning
      ? pickerState.rouletteName
      : (pickerState.selected ? learnerName(pickerState.selected) : 'Ready to pick');
    const statusText = pickerState.spinning
      ? `${learners.length} eligible learners · roulette spinning`
      : `${learners.length} eligible learners · ${pickerState.selected ? status.remaining : learners.length} remaining`;
    container.innerHTML = `<div class="teacher-tool">
      <div class="teacher-tool__class-bar no-print">${classPicker('namePickerClassSelect', 'Choose the active class for random name selection')}</div>
      <div class="teacher-tool__body">
        ${assignment ? `<div class="name-picker-stage${pickerState.spinning ? ' is-spinning' : ''}">
          <div class="name-picker-stage__content">
            <div class="name-picker-stage__status" role="status">${esc(statusText)}</div>
            <div id="namePickerRouletteName" class="name-picker-stage__name${pickerState.spinning ? ' is-spinning' : ''}"
              aria-live="${pickerState.spinning ? 'off' : 'polite'}" aria-busy="${pickerState.spinning ? 'true' : 'false'}">${esc(displayName)}</div>
            <div class="name-picker-stage__actions">
              <button class="btn btn-primary btn-lg" type="button" onclick="TeacherTools.pickName()" ${learners.length && !pickerState.spinning ? '' : 'disabled'}>${pickerState.spinning ? 'Picking...' : (pickerState.selected ? 'Pick Another' : 'Pick a Learner')}</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.resetPicker()" ${learners.length && !pickerState.spinning ? '' : 'disabled'}>Reset Draws</button>
            </div>
          </div>
        </div>` : emptyTool('Create a teaching load before using Name Picker.')}
      </div>
    </div>`;
    populateClassPickers();
  }

  function pickName() {
    if (pickerState.spinning) return;
    const assignment = activeAssignment();
    const learners = ensurePicker(assignment);
    if (!learners.length) return;
    const result = pickerState.picker.draw();
    pickerState.selected = result.learner;
    if (!result.learner || learners.length < 2 || globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      refresh();
      return;
    }

    const token = ++pickerAnimationToken;
    const totalSteps = 27;
    let step = 0;
    let previousId = '';
    const pickRouletteLearner = () => {
      let candidate = learners[core.secureRandomInt(learners.length)];
      for (let attempt = 0; attempt < 4 && candidate.id === previousId; attempt++) {
        candidate = learners[core.secureRandomInt(learners.length)];
      }
      previousId = candidate.id;
      return candidate;
    };

    pickerState.spinning = true;
    pickerState.rouletteName = learnerName(pickRouletteLearner());
    refresh();

    const tick = () => {
      if (token !== pickerAnimationToken || !pickerState.spinning) return;
      if (step >= totalSteps) {
        pickerAnimationTimer = null;
        pickerState.spinning = false;
        pickerState.rouletteName = '';
        refresh();
        globalScope.requestAnimationFrame?.(() => {
          document.getElementById('namePickerRouletteName')?.classList.add('is-revealed');
        });
        return;
      }
      const candidate = pickRouletteLearner();
      pickerState.rouletteName = learnerName(candidate);
      if (!animatePickerName(pickerState.rouletteName)) {
        cancelPickerAnimation();
        return;
      }
      step++;
      const progress = step / totalSteps;
      const delay = 35 + Math.round(progress * progress * 190);
      pickerAnimationTimer = setTimeout(tick, delay);
    };
    pickerAnimationTimer = setTimeout(tick, 45);
  }

  function resetPicker() {
    const assignment = activeAssignment();
    ensurePicker(assignment);
    cancelPickerAnimation();
    pickerState.picker.reset();
    pickerState.selected = null;
    refresh();
  }

  function ensureSimulation(assignment, term = simulatorState.term) {
    if (!assignment) {
      simulatorState = { assignmentId: '', term: String(term), session: null };
      return null;
    }
    if (simulatorState.assignmentId !== assignment.id
      || simulatorState.term !== String(term)
      || !simulatorState.session) {
      simulatorState = {
        assignmentId: assignment.id,
        term: String(term),
        session: core.createSimulationSession(assignment, String(term))
      };
    }
    return simulatorState.session;
  }

  function gradeValue(result) {
    const value = result?.termGrade;
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function numericGrade(result) {
    const value = Number(result?.termGrade);
    return Number.isFinite(value) ? value : null;
  }

  function renderGradeSimulator(container) {
    const assignment = activeAssignment();
    const session = ensureSimulation(assignment);
    const changes = session ? core.simulationChanges(session) : [];
    const learners = core.activeLearners(assignment);
    const assessments = (session?.draft?.assessments || []).filter(item => String(item.term) === simulatorState.term);
    const changedLearners = new Set(changes.map(change => change.key.split('|')[0])).size;

    container.innerHTML = `<div class="teacher-tool">
      <div class="simulator-toolbar no-print">
        ${classPicker('gradeSimulatorClassSelect', 'Choose the active class for grade simulation')}
        <div class="simulator-toolbar__term">
          <label class="record-class-label" for="gradeSimulatorTerm">Term:</label>
          <select id="gradeSimulatorTerm" class="field-select" onchange="TeacherTools.changeSimulatorTerm(this.value)">
            ${['1', '2', '3'].map(term => `<option value="${term}" ${term === simulatorState.term ? 'selected' : ''}>Term ${term}</option>`).join('')}
          </select>
        </div>
        <div class="simulator-toolbar__actions">
          <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.resetSimulation()" ${changes.length ? '' : 'disabled'}>Reset Preview</button>
          <button class="btn btn-primary btn-sm" type="button" onclick="TeacherTools.reviewSimulationApply()" ${changes.length ? '' : 'disabled'}>Apply to Official Record</button>
        </div>
      </div>
      <div class="teacher-tool__body">
        ${assignment ? `<div class="simulator-summary">
          <div class="simulator-summary__item"><span class="simulator-summary__label">Changed scores</span><span class="simulator-summary__value">${changes.length}</span></div>
          <div class="simulator-summary__item"><span class="simulator-summary__label">Affected learners</span><span class="simulator-summary__value">${changedLearners}</span></div>
          <div class="simulator-summary__item"><span class="simulator-summary__label">Selected term</span><span class="simulator-summary__value">Term ${simulatorState.term}</span></div>
        </div>
        ${assessments.length ? renderSimulationTable(assignment, session, learners, assessments) : emptyTool('This class has no assessments in the selected term.')}
        ${renderSimulationHistory(assignment)}` : emptyTool('Create a teaching load before using Grade Simulator.')}
      </div>
    </div>`;
    populateClassPickers();
  }

  function renderSimulationTable(official, session, learners, assessments) {
    const changedKeys = new Set(core.simulationChanges(session).map(change => change.key));
    const rows = learners.map(learner => {
      const officialResult = globalScope.computeTerm(official, learner.id, simulatorState.term);
      const simulatedResult = globalScope.computeTerm(session.draft, learner.id, simulatorState.term);
      const officialNumeric = numericGrade(officialResult);
      const simulatedNumeric = numericGrade(simulatedResult);
      const delta = officialNumeric === null || simulatedNumeric === null ? null : simulatedNumeric - officialNumeric;
      return `<tr>
        <td class="simulator-learner-cell">${esc(learnerName(learner))}</td>
        <td class="simulator-scores-cell">
          <div class="simulator-score-grid">${assessments.map(assessment => {
          const key = `${learner.id}|${assessment.id}`;
          const officialState = core.scoreState(official.scores || {}, key);
          const simulatedState = core.scoreState(session.draft.scores || {}, key);
          const maxScore = Number(assessment.maxScore);
          const hasHps = Number.isFinite(maxScore) && maxScore > 0;
          const assessmentName = assessment.title || assessment.component;
          const label = `${learnerName(learner)}, ${assessmentName}`;
          return `<label class="simulator-score-slot${changedKeys.has(key) ? ' is-changed' : ''}">
            <input class="simulator-score-input${changedKeys.has(key) ? ' is-changed' : ''}${hasHps ? '' : ' is-unavailable'}" type="number" min="0" ${hasHps ? `max="${esc(maxScore)}"` : ''} step="any"
              value="${simulatedState.present ? esc(simulatedState.value) : ''}"
              ${hasHps
                ? `aria-label="${esc(label)}" onchange="TeacherTools.updateSimulationScore('${esc(learner.id)}','${esc(assessment.id)}',this.value,this)"`
                : `disabled placeholder="Set HPS" title="Set HPS in the Grading Sheet first" aria-label="${esc(`${label}, HPS not set. Set HPS in the Grading Sheet first.`)}"`}>
            <span class="simulator-original">${changedKeys.has(key) ? `was ${officialState.present ? esc(officialState.value) : 'blank'}` : ''}</span>
          </label>`;
        }).join('')}</div>
        </td>
        <td class="simulator-grade-cell">
          <div class="simulator-grade-preview">
            <span><small>Official</small><strong>${esc(gradeValue(officialResult))}</strong></span>
            <span><small>Simulated</small><strong>${esc(gradeValue(simulatedResult))}</strong></span>
            <span class="${delta > 0 ? 'simulator-delta--up' : delta < 0 ? 'simulator-delta--down' : ''}"><small>Difference</small><strong>${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}</strong></span>
          </div>
        </td>
      </tr>`;
    }).join('');

    return `<div class="simulator-table-wrap">
      <table class="simulator-table">
        <colgroup><col class="simulator-col-learner"><col><col class="simulator-col-grade"></colgroup>
        <thead><tr>
          <th>Learner</th>
          <th class="simulator-scores-heading" aria-label="Assessment Scores">
            <div class="simulator-score-grid simulator-score-grid--header">${assessments.map(assessment => {
              const maxScore = Number(assessment.maxScore);
              const hasHps = Number.isFinite(maxScore) && maxScore > 0;
              const assessmentName = assessment.title || assessment.component;
              return `<div class="simulator-score-slot simulator-score-slot--header">
                <span class="simulator-assessment-title" title="${esc(assessmentName)}">${esc(assessmentName)}</span>
                <span class="simulator-assessment-hps">HPS ${esc(hasHps ? maxScore : '—')}</span>
              </div>`;
            }).join('')}</div>
          </th>
          <th>Grade Preview</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function renderSimulationHistory(assignment) {
    const tools = core.normalize(profileDb());
    const history = tools.gradeSimulatorHistory.filter(item => item.assignmentId === assignment.id);
    return `<section class="simulator-history">
      <h2 class="simulator-history__title">Applied Simulation History</h2>
      <div class="simulator-history__list">${history.length ? history.map(entry => `
        <div class="simulator-history__item">
          <div class="simulator-history__meta">
            <strong>Term ${esc(entry.term)} · ${entry.changes.length} score change${entry.changes.length === 1 ? '' : 's'}</strong>
            <span>${esc(new Date(entry.appliedAt).toLocaleString())} · ${esc(entry.status.replace(/-/g, ' '))}</span>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.reviewSimulationRevert('${esc(entry.id)}')" ${entry.status === 'applied' ? '' : 'disabled'}>Revert</button>
        </div>`).join('') : '<div class="text-muted text-sm">No simulations have been applied to this class.</div>'}</div>
    </section>`;
  }

  function updateSimulationScore(learnerId, assessmentId, value, input) {
    try {
      core.setSimulationScore(simulatorState.session, learnerId, assessmentId, value);
      refresh();
    } catch (error) {
      globalScope.toast(error.message, 'warning');
      const before = core.scoreState(simulatorState.session.draft.scores || {}, `${learnerId}|${assessmentId}`);
      if (input) input.value = before.present ? before.value : '';
    }
  }

  function changeSimulatorTerm(term) {
    const applyChange = () => {
      simulatorState = { assignmentId: '', term: String(term), session: null };
      refresh();
    };
    if (!hasDirtySimulation()) {
      applyChange();
      return;
    }
    const modal = createModal(
      'Discard Grade Simulation?',
      '<p>Changing terms will discard the current simulated score changes.</p>',
      '<button class="btn btn-cancel btn-sm" data-stay>Stay Here</button><button class="btn btn-warn btn-sm" data-discard>Discard and Switch</button>'
    );
    modal.overlay.querySelector('[data-stay]').addEventListener('click', () => {
      modal.close();
      const select = document.getElementById('gradeSimulatorTerm');
      if (select) select.value = simulatorState.term;
    });
    modal.overlay.querySelector('[data-discard]').addEventListener('click', () => {
      modal.close();
      applyChange();
    });
  }

  function resetSimulation() {
    simulatorState = {
      assignmentId: activeAssignment()?.id || '',
      term: simulatorState.term,
      session: activeAssignment() ? core.createSimulationSession(activeAssignment(), simulatorState.term) : null
    };
    refresh();
  }

  async function runTransaction(mutator) {
    const databaseSnapshot = core.clone(profileDb());
    const rootSnapshot = core.clone(rootDb());
    try {
      const result = mutator();
      if (!await globalScope.saveDatabase()) throw new Error('The official class record could not be saved.');
      return result;
    } catch (error) {
      globalScope.replaceActiveProfileDatabase(databaseSnapshot);
      globalScope.replaceRootDatabase(rootSnapshot);
      globalScope.render();
      throw error;
    }
  }

  function withPinVerification(action) {
    globalScope.promptPinVerification(async () => {
      try {
        await action();
      } catch (error) {
        console.error(error);
        globalScope.toast(error.message || 'The grade operation could not be completed.', 'error');
      }
    });
  }

  function reviewSimulationApply() {
    const assignment = activeAssignment();
    const plan = core.planSimulationApply(simulatorState.session, assignment);
    if (plan.conflicts.length) {
      globalScope.toast('Official scores changed while the simulation was open. Reset the preview and try again.', 'warning');
      return;
    }
    if (!plan.changes.length) return;
    const learners = new Set(plan.changes.map(change => change.key.split('|')[0])).size;
    const modal = createModal(
      'Apply Simulated Scores',
      `<p><strong>${plan.changes.length}</strong> scores for <strong>${learners}</strong> learners will be written to the official Term ${esc(simulatorState.term)} class record.</p><p>This action creates a reversible history entry.</p>`,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-apply>Apply to Official Record</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-apply]').addEventListener('click', () => {
      modal.close();
      withPinVerification(async () => {
        const record = await runTransaction(() => {
          const official = activeAssignment();
          const applied = core.applySimulation(simulatorState.session, official);
          const tools = core.normalize(profileDb());
          tools.gradeSimulatorHistory = [applied, ...tools.gradeSimulatorHistory]
            .slice(0, core.SIMULATION_HISTORY_LIMIT);
          return applied;
        });
        simulatorState = {
          assignmentId: activeAssignment().id,
          term: simulatorState.term,
          session: core.createSimulationSession(activeAssignment(), simulatorState.term)
        };
        globalScope.render();
        globalScope.setView('tools');
        activate('simulator');
        globalScope.toast(`${record.changes.length} simulated score changes applied.`, 'success');
      });
    });
  }

  function historyEntryById(entryId) {
    return core.normalize(profileDb()).gradeSimulatorHistory.find(item => item.id === entryId) || null;
  }

  function scoreChangeLabel(change, assignment) {
    const separator = change.key.indexOf('|');
    const learnerId = change.key.slice(0, separator);
    const assessmentId = change.key.slice(separator + 1);
    const learner = (assignment.learners || []).find(item => item.id === learnerId);
    const assessment = (assignment.assessments || []).find(item => item.id === assessmentId);
    return `${learnerName(learner)} · ${assessment?.title || assessment?.component || 'Assessment'}`;
  }

  function reviewSimulationRevert(entryId) {
    const entry = historyEntryById(entryId);
    const assignment = activeAssignment();
    if (!entry) return;
    const plan = core.planSimulationRevert(entry, assignment);
    if (!plan.conflicts.length) {
      const modal = createModal(
        'Revert Applied Simulation',
        `<p>${plan.ready.length} official score change${plan.ready.length === 1 ? '' : 's'} will be restored to the values from before this simulation was applied.</p>`,
        '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-warn btn-sm" data-revert>Revert Scores</button>'
      );
      modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
      modal.overlay.querySelector('[data-revert]').addEventListener('click', () => {
        modal.close();
        executeSimulationRevert(entryId, {});
      });
      return;
    }

    const body = `<p>${plan.conflicts.length} scores were edited after the simulation was applied. Choose whether to preserve each current value.</p>
      <div class="tool-conflict-list">${plan.conflicts.map((change, index) => `
        <div class="tool-conflict-row">
          <span class="tool-conflict-row__label">${esc(scoreChangeLabel(change, assignment))}</span>
          <select class="field-select" data-conflict-key="${esc(change.key)}">
            <option value="keep">Keep current value</option>
            <option value="restore">Restore previous value</option>
          </select>
        </div>`).join('')}</div>`;
    const modal = createModal(
      'Review Revert Conflicts',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-warn btn-sm" data-revert>Apply Revert Decisions</button>',
      true
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-revert]').addEventListener('click', () => {
      const resolutions = {};
      modal.overlay.querySelectorAll('[data-conflict-key]').forEach(select => {
        resolutions[select.dataset.conflictKey] = select.value;
      });
      modal.close();
      executeSimulationRevert(entryId, resolutions);
    });
  }

  function executeSimulationRevert(entryId, resolutions) {
    withPinVerification(async () => {
      const result = await runTransaction(() => {
        const entry = historyEntryById(entryId);
        if (!entry) throw new Error('The simulation history entry is no longer available.');
        return core.revertSimulation(entry, activeAssignment(), resolutions);
      });
      simulatorState = {
        assignmentId: activeAssignment().id,
        term: simulatorState.term,
        session: core.createSimulationSession(activeAssignment(), simulatorState.term)
      };
      globalScope.render();
      globalScope.setView('tools');
      activate('simulator');
      globalScope.toast(`${result.restored.length} score changes reverted${result.kept.length ? `; ${result.kept.length} later edits kept` : ''}.`, 'success');
    });
  }

  const gameSources = {
    sudoku: 'games/sudoku/index.html',
    '2048': 'games/2048/index.html',
    minesweeper: 'games/minesweeper/index.html'
  };

  function renderGames(container) {
    container.innerHTML = `<div class="game-tool">
      <div class="game-tool__switcher no-print">
        <div class="tool-segmented" role="tablist" aria-label="Offline games">
          <button type="button" aria-selected="${activeGameId === 'sudoku'}" onclick="TeacherTools.openGame('sudoku')">Sudoku</button>
          <button type="button" aria-selected="${activeGameId === '2048'}" onclick="TeacherTools.openGame('2048')">2048</button>
          <button type="button" aria-selected="${activeGameId === 'minesweeper'}" onclick="TeacherTools.openGame('minesweeper')">Minesweeper</button>
        </div>
      </div>
      <iframe id="teacherToolsGameFrame" class="game-frame" sandbox="allow-scripts" title="${esc(activeGameId)} offline game" src="${gameSources[activeGameId]}"></iframe>
    </div>`;
    gameFrame = document.getElementById('teacherToolsGameFrame');
  }

  function openGame(gameId) {
    if (!gameSources[gameId]) return;
    activeGameId = gameId;
    refresh();
  }

  function disposeGame() {
    if (gameFrame) {
      gameFrame.src = 'about:blank';
      gameFrame = null;
    }
  }

  async function handleGameMessage(event) {
    if (!gameFrame || event.source !== gameFrame.contentWindow || event.data?.type !== 'teacher-tools:sudoku-request') return;
    try {
      const difficulty = ['easy', 'medium', 'hard', 'expert'].includes(event.data.difficulty)
        ? event.data.difficulty
        : 'medium';
      const puzzle = await globalScope.electronAPI.generateSudoku(difficulty);
      gameFrame.contentWindow.postMessage({ type: 'teacher-tools:sudoku-puzzle', puzzle }, '*');
    } catch (error) {
      gameFrame.contentWindow.postMessage({ type: 'teacher-tools:sudoku-error' }, '*');
    }
  }

  function registerTool(definition) {
    if (!definition?.id || typeof definition.render !== 'function') {
      throw new TypeError('A tool id and render function are required.');
    }
    registry.set(definition.id, definition);
    renderTabs();
  }

  function renderTabs() {
    const tabs = document.getElementById('teacherToolsTabs');
    if (!tabs) return;
    tabs.innerHTML = Array.from(registry.values()).map(tool => `
      <button id="teacherToolTab-${esc(tool.id)}" class="teacher-tools__tab" type="button" role="tab"
        aria-selected="${activeToolId === tool.id}" onclick="TeacherTools.activate('${esc(tool.id)}')">
        ${icons[tool.id] || ''}<span>${esc(tool.label)}</span>
      </button>`).join('');
  }

  function activate(toolId) {
    const next = registry.get(toolId);
    if (!next) return;
    const current = registry.get(activeToolId);
    if (current && current !== next) current.onDeactivate?.();
    activeToolId = toolId;
    renderTabs();
    const content = document.getElementById('teacherToolsContent');
    if (content) next.render(content);
    next.onActivate?.();
  }

  function refresh() {
    if (globalScope.getRuntimeNavigationState?.().currentView !== 'tools') return;
    activate(activeToolId);
  }

  function disposeActiveTool() {
    registry.get(activeToolId)?.onDeactivate?.();
  }

  function updateToolsNav(view) {
    const navTools = document.getElementById('navTools');
    if (navTools) navTools.classList.toggle('nav-btn--active', view === 'tools');
    if (view === 'tools') {
      document.querySelectorAll('.nav-btn.nav-btn--active').forEach(button => {
        if (button !== navTools) button.classList.remove('nav-btn--active');
      });
    }
  }

  function init() {
    if (initialized || !core) return;
    initialized = true;
    core.normalize(profileDb());
    registerTool({ id: 'groups', label: 'Group Randomizer', render: renderGroupRandomizer });
    registerTool({ id: 'picker', label: 'Name Picker', render: renderNamePicker, onDeactivate: cancelPickerAnimation });
    registerTool({ id: 'simulator', label: 'Grade Simulator', render: renderGradeSimulator });
    registerTool({ id: 'games', label: 'Offline Games', render: renderGames, onDeactivate: disposeGame });

    baseSetView = globalScope.setView;
    baseSelectAssignment = globalScope.selectAssignment;
    globalScope.selectAssignment = selectAssignmentFromElsewhere;
    globalScope.setView = function setViewWithTools(view) {
      const result = baseSetView(view);
      updateToolsNav(view);
      if (view === 'tools') setTimeout(() => activate(activeToolId), 0);
      else disposeActiveTool();
      return result;
    };

    baseRender = globalScope.render;
    globalScope.render = function renderWithTools() {
      const result = baseRender();
      if (globalScope.getRuntimeNavigationState?.().currentView === 'tools') {
        setTimeout(refresh, 0);
      }
      return result;
    };

    globalScope.addEventListener('message', handleGameMessage);
    renderTabs();
  }

  const api = {
    init,
    registerTool,
    activate,
    refresh,
    disposeActiveTool,
    handleActiveClassChange,
    setGroupCount,
    setGroupMode,
    randomizeGroups: runGroupRandomizer,
    copyGroups,
    printGroups,
    pickName,
    resetPicker,
    changeSimulatorTerm,
    updateSimulationScore,
    resetSimulation,
    reviewSimulationApply,
    reviewSimulationRevert,
    openGame
  };

  globalScope.TeacherTools = api;
  globalScope.initTeacherTools = init;
})(window);
