/**
 * Teacher Tools workspace UI and lifecycle coordinator.
 */
(function initTeacherToolsModule(globalScope) {
  'use strict';

  const core = globalScope.TeacherToolsCore;
  const registry = new Map();
  let initialized = false;
  let activeToolId = '';
  let groupState = {
    assignmentId: '',
    mode: 'random',
    groupCount: 2,
    groups: [],
    colors: [],
    animating: false
  };
  let groupAnimationTimer = null;
  let groupAnimationToken = 0;
  let pickerState = {
    assignmentId: '',
    rosterSignature: '',
    picker: null,
    selected: null,
    spinning: false,
    rouletteName: '',
    rouletteLearner: null
  };
  let pickerAnimationTimer = null;
  let pickerAnimationToken = 0;
  let simulatorState = { assignmentId: '', term: '1', session: null };
  let checklistState = {
    assignmentId: '',
    term: '1',
    mapePart: '',
    sessionId: '',
    selectedCriterionId: '',
    gridCriterionId: '',
    search: '',
    filter: 'all',
    pickerFilter: 'all',
    rosterSignature: '',
    picker: null,
    selected: null,
    spinning: false,
    rouletteName: '',
    rouletteLearner: null
  };
  let checklistPickerModal = null;
  let checklistPickerAnimationTimer = null;
  let checklistPickerAnimationToken = 0;
  let activeGameId = 'sudoku';
  let gameFrame = null;
  let baseSetView = null;
  let baseRender = null;
  let baseSelectAssignment = null;

  const icons = {
    groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    picker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3v5h5"></path><path d="M21 12a9 9 0 0 0-15-6.7L3 8"></path><path d="M21 21v-5h-5"></path><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"></path></svg>',
    simulator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3h6"></path><path d="M10 9h4"></path><path d="M10 3v6l-4 8a3 3 0 0 0 2.7 4h6.6a3 3 0 0 0 2.7-4l-4-8V3"></path></svg>',
    checklist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5h10"></path><path d="M9 12h10"></path><path d="M9 19h10"></path><path d="m3 5 1.5 1.5L7 4"></path><path d="m3 12 1.5 1.5L7 11"></path><path d="m3 19 1.5 1.5L7 18"></path></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v5l3 2M9 2h6"></path></svg>',
    participation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m12 2 3 6 6 .9-4.5 4.4 1 6.2-5.5-3-5.5 3 1-6.2L3 8.9 9 8z"></path></svg>',
    noise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"></path></svg>',
    duels: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 3 12 18M18 3 6 21"></path><path d="m4 5 3-2M20 5l-3-2"></path></svg>',
    seating: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="7" height="6"></rect><rect x="14" y="4" width="7" height="6"></rect><rect x="3" y="14" width="7" height="6"></rect><rect x="14" y="14" width="7" height="6"></rect></svg>',
    exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 3H4v18h5M16 17l5-5-5-5M21 12H9"></path></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5"></path></svg>',
    race: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 17h18M5 14l3-8 4 8M12 14l3-10 4 10"></path></svg>',
    games: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line><rect x="2" y="6" width="20" height="12" rx="2"></rect></svg>'
  };

  const TOOL_DESCRIPTIONS = Object.freeze({
    picker: 'Pick learners fairly with animated classroom experiences and term stars.',
    groups: 'Build random or sex-balanced teams with presentation-ready reveals.',
    simulator: 'Try score changes safely before applying them to the class record.',
    games: 'Open fun offline games for breaks, rewards, and learning stations.',
    timer: 'Run lesson segments, transitions, and classroom activity countdowns.',
    participation: 'Award and undo the same class- and term-scoped stars used by Name Picker.',
    noise: 'Monitor live room volume locally without recording classroom audio.',
    duels: 'Run learner-versus-learner or team classroom challenges.',
    seating: 'Arrange, lock, print, and randomize classroom seats.',
    exit: 'Record quick learner understanding and follow-up needs.',
    notes: 'Keep private, class-scoped anecdotal observations.',
    race: 'Use Randomizer teams in a lively teacher-scored boat race.'
  });
  const TOOL_ACCENTS = Object.freeze({ picker:'#e11d48',groups:'#2563eb',simulator:'#7c3aed',games:'#f59e0b',timer:'#0891b2',participation:'#eab308',noise:'#10b981',duels:'#ef4444',seating:'#6366f1',exit:'#14b8a6',notes:'#8b5cf6',race:'#0284c7' });

  const GROUP_COLOR_SCHEMES = Object.freeze([
    { name: 'Blue', accent: '#2563eb' },
    { name: 'Emerald', accent: '#059669' },
    { name: 'Amber', accent: '#d97706' },
    { name: 'Rose', accent: '#e11d48' },
    { name: 'Violet', accent: '#7c3aed' },
    { name: 'Cyan', accent: '#0891b2' },
    { name: 'Lime', accent: '#4d7c0f' },
    { name: 'Orange', accent: '#c2410c' },
    { name: 'Indigo', accent: '#4f46e5' },
    { name: 'Teal', accent: '#0f766e' },
    { name: 'Pink', accent: '#be185d' },
    { name: 'Red', accent: '#b91c1c' },
    { name: 'Sky', accent: '#0369a1' },
    { name: 'Green', accent: '#15803d' },
    { name: 'Gold', accent: '#a16207' },
    { name: 'Fuchsia', accent: '#a21caf' },
    { name: 'Purple', accent: '#6d28d9' },
    { name: 'Turquoise', accent: '#0e7490' },
    { name: 'Olive', accent: '#3f6212' },
    { name: 'Coral', accent: '#c2415d' }
  ]);

  function randomGroupColors(count) {
    return core.shuffle(GROUP_COLOR_SCHEMES).slice(0, Math.max(0, Number(count) || 0));
  }

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

  function learnerAvatar(learner, size = 'xs') {
    return learner && globalScope.LearnerAvatars
      ? globalScope.LearnerAvatars.renderLearner(learner, { size })
      : '';
  }

  function visualRandom(maximum) {
    return maximum > 0 ? core.secureRandomInt(maximum) : 0;
  }

  function launchSelectionConfetti(anchor) {
    if (globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const target = typeof anchor === 'string' ? document.querySelector(anchor) : anchor;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'teacher-tools-confetti';
    layer.style.left = `${rect.left + (rect.width / 2)}px`;
    layer.style.top = `${rect.top + (rect.height / 2)}px`;
    const colors = ['#06b6d4', '#2563eb', '#16a34a', '#eab308', '#ef4444', '#db2777', '#7c3aed'];
    for (let index = 0; index < 34; index++) {
      const piece = document.createElement('i');
      const x = visualRandom(281) - 140;
      const rotation = visualRandom(721) - 360;
      piece.style.setProperty('--confetti-x', `${x}px`);
      piece.style.setProperty('--confetti-mid-x', `${Math.round(x * 0.48)}px`);
      piece.style.setProperty('--confetti-y', `${140 + visualRandom(151)}px`);
      piece.style.setProperty('--confetti-rotation', `${rotation}deg`);
      piece.style.setProperty('--confetti-mid-rotation', `${Math.round(rotation * 0.45)}deg`);
      piece.style.setProperty('--confetti-delay', `${visualRandom(130)}ms`);
      piece.style.setProperty('--confetti-color', colors[visualRandom(colors.length)]);
      piece.dataset.shape = String(index % 3);
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1700);
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
    ['groupRandomizerClassSelect', 'namePickerClassSelect', 'gradeSimulatorClassSelect', 'performanceChecklistClassSelect']
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
    cancelGroupAnimation();
    cancelPickerAnimation();
    cancelChecklistPickerAnimation();
    groupState = {
      assignmentId: '',
      mode: groupState.mode,
      groupCount: 2,
      groups: [],
      colors: [],
      animating: false
    };
    pickerState = {
      assignmentId: '',
      rosterSignature: '',
      picker: null,
      selected: null,
      spinning: false,
      rouletteName: '',
      rouletteLearner: null
    };
    simulatorState = { assignmentId: '', term: simulatorState.term, session: null };
    checklistPickerModal?.remove();
    checklistPickerModal = null;
    checklistState = {
      assignmentId: '',
      term: checklistState.term,
      mapePart: '',
      sessionId: '',
      selectedCriterionId: '',
      gridCriterionId: '',
      search: '',
      filter: 'all',
      pickerFilter: 'all',
      rosterSignature: '',
      picker: null,
      selected: null,
      spinning: false,
      rouletteName: '',
      rouletteLearner: null
    };
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
    if (previousTool === 'checklist') openPerformanceChecklistPage();
    else { globalScope.setView('tools'); activate(previousTool); }
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

  function cancelGroupAnimation() {
    globalScope.TeacherToolExperiences?.cancelGroups?.();
    if (groupAnimationTimer) {
      clearTimeout(groupAnimationTimer);
      groupAnimationTimer = null;
    }
    groupAnimationToken++;
    groupState.pendingGroups = [];
    if (groupState.animating) {
      groupState.groups = [];
      groupState.colors = [];
    }
    groupState.animating = false;
  }

  function groupLearnerPositions() {
    const positions = new Map();
    document.querySelectorAll('[data-group-learner-id]').forEach(element => {
      positions.set(element.dataset.groupLearnerId, element.getBoundingClientRect());
    });
    return positions;
  }

  function renderGroupArrangement(groups, options = {}) {
    const previous = groupLearnerPositions();
    groupState.groups = groups;
    refresh();
    if (globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    globalScope.requestAnimationFrame?.(() => {
      document.querySelectorAll('[data-group-learner-id]').forEach(element => {
        const before = previous.get(element.dataset.groupLearnerId);
        if (!before || typeof element.animate !== 'function') return;
        const after = element.getBoundingClientRect();
        const deltaX = before.left - after.left;
        const deltaY = before.top - after.top;
        element.animate([
          { transform: `translate(${deltaX}px, ${deltaY}px) scale(0.92)`, opacity: 0.55 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 }
        ], {
          duration: options.duration || 260,
          easing: options.settled ? 'cubic-bezier(.2,.8,.2,1)' : 'cubic-bezier(.4,0,.2,1)'
        });
        if (options.settled) element.classList.add('is-settled');
      });
    });
  }

  function renderGroupRandomizer(container) {
    const assignment = activeAssignment();
    const learners = core.activeLearners(assignment);
    if (groupState.assignmentId !== assignment?.id) {
      groupState = {
        assignmentId: assignment?.id || '',
        mode: groupState.mode,
        groupCount: 2,
        groups: [],
        colors: [],
        animating: false
      };
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
            <input id="groupRandomizerCount" class="field-input" type="number" min="2" max="${maximum}" value="${groupState.groupCount}" ${maximum < 2 || groupState.animating ? 'disabled' : ''} onchange="TeacherTools.setGroupCount(this.value)">
          </div>
          <div class="field">
            <span class="field-label">Grouping mode</span>
            <div class="tool-segmented" aria-label="Grouping mode">
              <button type="button" aria-pressed="${groupState.mode === 'random'}" onclick="TeacherTools.setGroupMode('random')" ${groupState.animating ? 'disabled' : ''}>Complete Random</button>
              <button type="button" aria-pressed="${groupState.mode === 'balanced'}" onclick="TeacherTools.setGroupMode('balanced')" ${groupState.animating ? 'disabled' : ''}>Balance by Sex</button>
            </div>
          </div>
          <div class="tool-control-strip__actions">
            <button class="btn btn-primary btn-sm" type="button" onclick="TeacherTools.randomizeGroups()" ${maximum < 2 || groupState.animating ? 'disabled' : ''}>${groupState.animating ? 'Randomizing...' : (groupState.groups.length ? 'Randomize Again' : 'Randomize')}</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.copyGroups()" ${groupState.groups.length && !groupState.animating ? '' : 'disabled'} title="Copy group lists">Copy</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.printGroups()" ${groupState.groups.length && !groupState.animating ? '' : 'disabled'} title="Print group lists">Print</button>
          </div>
        </div>
        ${groupState.animating ? '<div class="group-randomizer-status" role="status">Learners are moving between groups...</div>' : ''}
        ${groupState.groups.length ? renderGroupResults(groupState.groups, groupState.colors, groupState.animating) : emptyTool(maximum < 2 ? 'Add at least two active learners to create groups.' : 'Choose the number of groups and randomize the class.')}`
        : emptyTool('Create a teaching load before using Group Randomizer.')}
      </div>
    </div>`;
    populateClassPickers();
  }

  function renderGroupResults(groups, colors, animating = false) {
    return `<div class="group-results${animating ? ' group-results--randomizing' : ''}">${groups.map((members, index) => {
      const male = members.filter(item => ['M', 'MALE'].includes(String(item.sex || '').toUpperCase())).length;
      const female = members.filter(item => ['F', 'FEMALE'].includes(String(item.sex || '').toUpperCase())).length;
      const unspecified = members.length - male - female;
      const color = colors[index] || GROUP_COLOR_SCHEMES[index % GROUP_COLOR_SCHEMES.length];
      return `<section class="group-result" style="--group-accent:${esc(color.accent)}" data-group-color="${esc(color.name)}">
        <header class="group-result__header">
          <div><h2 class="group-result__title"><span class="group-result__swatch" title="${esc(`${color.name} group color`)}" aria-hidden="true"></span>Group ${index + 1}</h2><span class="group-result__sex">M ${male} · F ${female}${unspecified ? ` · Unspecified ${unspecified}` : ''}</span></div>
          <span class="group-result__count">${members.length}</span>
        </header>
        <ol class="group-result__list">${members.map(learner => `<li data-group-learner-id="${esc(learner.id)}"><span class="group-result__learner">${learnerAvatar(learner)}<span>${esc(learnerName(learner))}</span></span></li>`).join('')}</ol>
      </section>`;
    }).join('')}</div>`;
  }

  function setGroupCount(value) {
    cancelGroupAnimation();
    groupState.groupCount = Number(value);
    groupState.groups = [];
    groupState.colors = [];
    refresh();
  }

  function setGroupMode(mode) {
    cancelGroupAnimation();
    groupState.mode = mode === 'balanced' ? 'balanced' : 'random';
    groupState.groups = [];
    groupState.colors = [];
    refresh();
  }

  function runGroupRandomizer() {
    try {
      const learners = core.activeLearners(activeAssignment());
      cancelGroupAnimation();
      const finalGroups = core.randomizeGroups(learners, groupState.groupCount, groupState.mode);
      groupState.colors = randomGroupColors(finalGroups.length);
      groupState.pendingGroups = finalGroups;
      if (learners.length < 2 || globalScope.TeacherToolsAnimationEngine?.prefersReducedMotion?.()) {
        groupState.groups = finalGroups;
        groupState.pendingGroups = [];
        refresh();
        return;
      }

      const token = ++groupAnimationToken;
      groupState.animating = true;
      groupState.groups = finalGroups;
      refresh();
      globalScope.requestAnimationFrame?.(() => {
        if (token !== groupAnimationToken || !groupState.animating) return;
        const root = document.getElementById('groupRandomizerCount')?.closest('.teacher-tool');
        const complete = () => {
          if (token !== groupAnimationToken) return;
          groupState.animating = false;
          groupState.pendingGroups = [];
          renderGroupArrangement(finalGroups, { duration: 0, settled: true });
        };
        if (!globalScope.TeacherToolExperiences?.animateGroups?.({ root, onComplete: complete })) complete();
      });
    } catch (error) {
      cancelGroupAnimation();
      globalScope.toast(error.message, 'warning');
    }
  }

  function revealGroupsNow() {
    if (!groupState.animating || !groupState.pendingGroups?.length) return false;
    if (globalScope.TeacherToolExperiences?.revealGroupsNow?.()) return true;
    groupAnimationToken++;
    const finalGroups = groupState.pendingGroups;
    groupState.pendingGroups = [];
    groupState.animating = false;
    renderGroupArrangement(finalGroups, { duration: 0, settled: true });
    return true;
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
    if (!groupState.groups.length || groupState.animating) return;
    try {
      await navigator.clipboard.writeText(groupText());
      globalScope.toast('Group lists copied.', 'success');
    } catch (error) {
      globalScope.toast('The group lists could not be copied.', 'error');
    }
  }

  function printGroups() {
    if (!groupState.groups.length || groupState.animating) return;
    const sheet = document.getElementById('teacherToolsPrintSheet');
    const assignment = activeAssignment();
    sheet.innerHTML = `<h1>${esc(assignmentLabel(assignment))}</h1>${groupState.groups.map((members, index) => {
      const color = groupState.colors[index] || GROUP_COLOR_SCHEMES[index % GROUP_COLOR_SCHEMES.length];
      return `<section class="teacher-tools-print-group" style="--group-accent:${esc(color.accent)}">
        <h2>Group ${index + 1}</h2>
        <ol>${members.map(learner => `<li>${esc(learnerName(learner))}</li>`).join('')}</ol>
      </section>`;
    }).join('')}`;
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
        rouletteName: '',
        rouletteLearner: null
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
    pickerState.rouletteLearner = null;
  }

  function animatePickerLearner(learner) {
    const nameElement = document.getElementById('namePickerRouletteName');
    const avatarElement = document.getElementById('namePickerRouletteAvatar');
    if (!nameElement || !avatarElement || !learner) return false;
    nameElement.textContent = learnerName(learner);
    avatarElement.innerHTML = learnerAvatar(learner, 'xl');
    nameElement.classList.remove('is-ticking');
    avatarElement.classList.remove('is-ticking');
    void nameElement.offsetWidth;
    void avatarElement.offsetWidth;
    nameElement.classList.add('is-ticking');
    avatarElement.classList.add('is-ticking');
    return true;
  }

  function renderNamePicker(container) {
    const assignment = activeAssignment();
    const learners = ensurePicker(assignment);
    const status = pickerState.picker?.status() || { remaining: 0, total: 0 };
    const displayName = pickerState.spinning
      ? pickerState.rouletteName
      : (pickerState.selected ? learnerName(pickerState.selected) : 'Ready to pick');
    const displayLearner = pickerState.spinning ? pickerState.rouletteLearner : pickerState.selected;
    const statusText = pickerState.spinning
      ? `${learners.length} eligible learners · roulette spinning`
      : `${learners.length} eligible learners · ${pickerState.selected ? status.remaining : learners.length} remaining`;
    container.innerHTML = `<div class="teacher-tool">
      <div class="teacher-tool__class-bar no-print">${classPicker('namePickerClassSelect', 'Choose the active class for random name selection')}</div>
      <div class="teacher-tool__body">
        ${assignment ? `<div class="name-picker-stage${pickerState.spinning ? ' is-spinning' : ''}">
          <div class="name-picker-stage__content">
            <div class="name-picker-stage__status" role="status">${esc(statusText)}</div>
            <div class="name-picker-stage__selection">
              <div id="namePickerRouletteAvatar" class="name-picker-stage__avatar${displayLearner ? '' : ' is-empty'}">${learnerAvatar(displayLearner, 'xl')}</div>
              <div id="namePickerRouletteName" class="name-picker-stage__name${pickerState.spinning ? ' is-spinning' : ''}"
                aria-live="${pickerState.spinning ? 'off' : 'polite'}" aria-busy="${pickerState.spinning ? 'true' : 'false'}">${esc(displayName)}</div>
            </div>
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
      globalScope.requestAnimationFrame?.(() => {
        document.getElementById('namePickerRouletteName')?.classList.add('is-revealed');
        document.getElementById('namePickerRouletteAvatar')?.classList.add('is-revealed');
        if (result.learner) launchSelectionConfetti('#namePickerRouletteAvatar');
      });
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
    pickerState.rouletteLearner = pickRouletteLearner();
    pickerState.rouletteName = learnerName(pickerState.rouletteLearner);
    refresh();

    const tick = () => {
      if (token !== pickerAnimationToken || !pickerState.spinning) return;
      if (step >= totalSteps) {
        pickerAnimationTimer = null;
        pickerState.spinning = false;
        pickerState.rouletteName = '';
        pickerState.rouletteLearner = null;
        refresh();
        globalScope.requestAnimationFrame?.(() => {
          document.getElementById('namePickerRouletteName')?.classList.add('is-revealed');
          document.getElementById('namePickerRouletteAvatar')?.classList.add('is-revealed');
          launchSelectionConfetti('#namePickerRouletteAvatar');
        });
        return;
      }
      const candidate = pickRouletteLearner();
      pickerState.rouletteLearner = candidate;
      pickerState.rouletteName = learnerName(candidate);
      if (!animatePickerLearner(candidate)) {
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
        <td class="simulator-learner-cell"><span class="learner-avatar-name">${learnerAvatar(learner)}<span>${esc(learnerName(learner))}</span></span></td>
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

  function isMapehAssignment(assignment) {
    return Boolean(assignment && typeof globalScope.isMapehSubject === 'function'
      && globalScope.isMapehSubject(assignment.subject));
  }

  function ensureChecklistState(assignment) {
    const assignmentId = assignment?.id || '';
    const isMapeh = isMapehAssignment(assignment);
    if (checklistState.assignmentId !== assignmentId) {
      checklistState = {
        assignmentId,
        term: String(profileDb()?.currentTerm || checklistState.term || '1'),
        mapePart: isMapeh ? 'music_arts' : '',
        sessionId: '',
        selectedCriterionId: '',
        gridCriterionId: '',
        search: '',
        filter: 'all',
        pickerFilter: 'all',
        rosterSignature: '',
        picker: null,
        selected: null
      };
    }
    if (isMapeh && !checklistState.mapePart) checklistState.mapePart = 'music_arts';
    if (!isMapeh) checklistState.mapePart = '';
    return checklistState;
  }

  function currentChecklist(assignment = activeAssignment()) {
    if (!assignment) return null;
    ensureChecklistState(assignment);
    const tools = core.normalize(profileDb());
    return tools.performanceChecklists.find(item =>
      item.assignmentId === assignment.id
      && item.term === checklistState.term
      && String(item.mapePart || '') === String(checklistState.mapePart || '')
      && item.status === 'active'
    ) || null;
  }

  function hasPublishedChecklistPoints(checklist) {
    return core.hasPublishedChecklistContributions(checklist);
  }

  function checklistToday() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function checklistSession(checklist) {
    if (!checklist) return null;
    let session = (checklist.sessions || []).find(item => item.id === checklistState.sessionId && !item.activity?.deletedAt);
    if (!session) {
      const sessions = (checklist.sessions || []).filter(item => !item.activity?.deletedAt).slice();
      session = sessions
        .filter(item => !item.activity?.deletedAt && item.date === checklistToday())
        .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0]
        || sessions.sort((left, right) =>
          String(right.date || '').localeCompare(String(left.date || ''))
          || String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
        )[0]
        || null;
      checklistState.sessionId = session?.id || '';
    }
    return session;
  }

  function checklistCriterion(checklist, criterionId = checklistState.selectedCriterionId) {
    return (checklist?.criteria || []).find(item => item.id === criterionId) || null;
  }

  function renderChecklistContextControls(assignment) {
    const mapeControl = isMapehAssignment(assignment) ? `
      <label class="simulator-toolbar__term">
        <span class="field-label">MAPEH strand</span>
        <select class="field-select" onchange="TeacherTools.changeChecklistMapePart(this.value)">
          <option value="music_arts" ${checklistState.mapePart === 'music_arts' ? 'selected' : ''}>Music &amp; Arts</option>
          <option value="pe_health" ${checklistState.mapePart === 'pe_health' ? 'selected' : ''}>PE &amp; Health</option>
        </select>
      </label>` : '';
    return `${classPicker('performanceChecklistClassSelect', 'Choose the class for the performance checklist')}
      <label class="simulator-toolbar__term">
        <span class="field-label">Term</span>
        <select class="field-select" onchange="TeacherTools.changeChecklistTerm(this.value)">
          ${['1', '2', '3'].map(term => `<option value="${term}" ${checklistState.term === term ? 'selected' : ''}>Term ${term}</option>`).join('')}
        </select>
      </label>${mapeControl}`;
  }

  function checklistComponentLabel(component) {
    return component === 'WW' ? 'Written Work' : component === 'PT' ? 'Performance Task' : 'Tracking Only';
  }

  function checklistEntryControl(checklist, session, learner, criterion) {
    const entry = core.checklistEntry(checklist, session.id, learner.id, criterion.id);
    const definition = core.checklistActivityDefinition(checklist, session) || criterion;
    const published = core.isChecklistActivityPublished(session);
    const disabled = !definition.active || published;
    const currentPoints = Number(entry?.points || 0);
    const maximum = Number(definition.maxPointsPerSession || 0);
    const lockTitle = published
      ? 'Published activity. Unlock it with your PIN before editing.'
      : '';
    const noteButton = definition.allowNotes
      ? `<button class="checklist-note-button${entry?.note ? ' has-note' : ''}" type="button" title="${esc(lockTitle || (entry ? 'Add or edit learner note' : 'Record an entry before adding a note'))}" aria-label="${esc(`Note for ${learnerName(learner)}, ${definition.title || criterion.label}`)}" onclick="TeacherTools.openChecklistEntryNote('${esc(learner.id)}','${esc(criterion.id)}','${esc(session.id)}')" ${entry && !published ? '' : 'disabled'}>${entry?.note ? '●' : 'Note'}</button>`
      : '';
    if (definition.scoringMode === 'CHECK') {
      const checkItems = (definition.checkItems || []).filter(item => item.active !== false);
      if (checkItems.length > 1) {
        const selected = new Set(entry?.selectedItemIds || []);
        return `<fieldset class="checklist-multi-items" data-checklist-multi-cell ${disabled ? 'disabled' : ''}><legend class="sr-only">${esc(learnerName(learner))}, ${esc(definition.title || criterion.label)}</legend>${checkItems.map(item => `<label title="${esc(item.label)} (${esc(item.pointValue)} points)"><input type="checkbox" value="${esc(item.id)}" ${selected.has(item.id) ? 'checked' : ''} onchange="TeacherTools.updateChecklistItemSelection('${esc(learner.id)}','${esc(criterion.id)}',this.closest('[data-checklist-multi-cell]'),'${esc(session.id)}')"><span>${esc(item.label)} +${esc(item.pointValue)}</span></label>`).join('')}<strong>${entry?.points || 0}</strong></fieldset>`;
      }
      return `<div class="checklist-entry-control${published ? ' is-locked' : ''}" title="${esc(lockTitle)}"><label class="checklist-check" data-checklist-cell>
        <input type="checkbox" ${entry ? 'checked' : ''} ${disabled ? 'disabled' : ''}
          aria-label="${esc(`${learnerName(learner)}, ${definition.title || criterion.label}`)}"
          onkeydown="TeacherTools.handleChecklistCellKey(event)"
          onchange="TeacherTools.updateChecklistEntry('${esc(learner.id)}','${esc(criterion.id)}',this.checked ? '${esc(definition.pointsPerCheck)}' : '',this,'${esc(session.id)}')">
        <span>${entry ? esc(entry.points) : ''}</span>
      </label>${noteButton}</div>`;
    }
    return `<div class="checklist-entry-control checklist-entry-stepper${published ? ' is-locked' : ''}" title="${esc(lockTitle)}">
      <button class="checklist-stepper-button" type="button" title="Subtract 1 point" aria-label="${esc(`Subtract one point from ${learnerName(learner)}`)}"
        onclick="TeacherTools.adjustChecklistEntry('${esc(learner.id)}','${esc(criterion.id)}',-1,'${esc(session.id)}')"
        ${disabled || !entry || currentPoints <= 0 ? 'disabled' : ''}>&minus;</button>
      <input class="field-input checklist-points-input" type="number" min="0" max="${esc(definition.maxPointsPerSession)}" step="any"
      value="${entry ? esc(entry.points) : ''}" ${disabled ? 'disabled' : ''}
      aria-label="${esc(`${learnerName(learner)}, ${definition.title || criterion.label}`)}"
      onkeydown="TeacherTools.handleChecklistCellKey(event)"
      onchange="TeacherTools.updateChecklistEntry('${esc(learner.id)}','${esc(criterion.id)}',this.value,this,'${esc(session.id)}')">
      <button class="checklist-stepper-button" type="button" title="Add 1 point" aria-label="${esc(`Add one point to ${learnerName(learner)}`)}"
        onclick="TeacherTools.adjustChecklistEntry('${esc(learner.id)}','${esc(criterion.id)}',1,'${esc(session.id)}')"
        ${disabled || currentPoints >= maximum ? 'disabled' : ''}>+</button>
      ${noteButton}
    </div>`;
  }

  function checklistStatus(checklist, assignment) {
    const entryCount = (checklist.sessions || []).filter(session => !session.activity?.deletedAt).reduce(
      (total, session) => total + core.checklistEntryCount(session),
      0
    );
    if (!entryCount) return { label: 'No Entries', tone: 'neutral' };
    let missingTarget = false;
    let pending = false;
    let needsReview = false;
    let published = false;
    const gradedActivities = (checklist.sessions || []).filter(session =>
      !session.activity?.deletedAt && ['WW', 'PT'].includes(session.activity?.destinationComponent)
    );
    gradedActivities.forEach(session => {
      const target = session.activity.publicationTarget;
      published = published || core.isChecklistActivityPublished(session);
      if (!target?.assessmentId) {
        missingTarget = true;
        return;
      }
      try {
        const plan = core.planChecklistActivityPublication(
          checklist,
          assignment,
          session.activity.id || session.id,
          target.assessmentId
        );
        pending = pending || plan.changes.length > 0;
        needsReview = needsReview || plan.blocked.some(item =>
          ['blank-score', 'score-changed-after-publication', 'score-exceeds-hps'].includes(item.reason)
        );
      } catch (error) {
        needsReview = true;
      }
    });
    const hasLegacySessions = (checklist.sessions || []).some(session => !session.activity);
    const legacyComponents = hasLegacySessions
      ? ['WW', 'PT'].filter(component =>
        checklist.criteria.some(item => item.destinationComponent === component)
      )
      : [];
    legacyComponents.forEach(component => {
      const target = checklist.publicationTargets?.[component];
      published = published || Object.values(target?.publishedContributions || {})
        .some(value => Number(value) > 0);
      if (!target?.assessmentId) {
        missingTarget = true;
        return;
      }
      try {
        const plan = core.planChecklistPublication(checklist, assignment, component, target.assessmentId);
        pending = pending || plan.changes.length > 0;
        needsReview = needsReview || plan.blocked.some(item =>
          ['blank-score', 'score-changed-after-publication'].includes(item.reason)
        );
      } catch (error) {
        needsReview = true;
      }
    });
    if (!gradedActivities.length && !legacyComponents.length) {
      return { label: 'Tracking Only', tone: 'neutral' };
    }
    if (needsReview) return { label: 'Needs Review', tone: 'warning' };
    if (missingTarget) return { label: 'Grade Setup Needed', tone: 'warning' };
    if (pending) return { label: published ? 'Unpublished Changes' : 'Ready to Publish', tone: 'primary' };
    if (published) return { label: 'Fully Published', tone: 'success' };
    return { label: 'Draft', tone: 'neutral' };
  }

  function renderChecklistHistory(checklist, assignment) {
    const history = core.normalize(profileDb()).performanceChecklistHistory
      .filter(item => item.checklistId === checklist.id && item.assignmentId === assignment.id);
    return `<section class="simulator-history checklist-history">
      <h2 class="simulator-history__title">Published Point History</h2>
      <div class="simulator-history__list">${history.length ? history.map(entry => {
        const assessment = (assignment.assessments || []).find(item => item.id === entry.assessmentId);
        return `<div class="simulator-history__item">
          <div class="simulator-history__meta">
            <strong>${entry.activityTitle ? `${esc(entry.activityTitle)} · ` : ''}${esc(checklistComponentLabel(entry.component))} · ${esc(assessment?.title || 'Assessment')} · ${entry.changes.length} learner${entry.changes.length === 1 ? '' : 's'}</strong>
            <span>${esc(new Date(entry.appliedAt).toLocaleString())} · ${esc(entry.status)}</span>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.reviewChecklistPublicationRevert('${esc(entry.id)}')" ${entry.status === 'applied' ? '' : 'disabled'}>Revert</button>
        </div>`;
      }).join('') : '<div class="text-muted text-sm">No checklist points have been published for this term.</div>'}</div>
    </section>`;
  }

  function renderChecklistWelcome() {
    const templates = core.normalize(profileDb()).performanceChecklistTemplates;
    return `<div class="checklist-welcome">
      <div class="checklist-welcome__content">
        <h2>Start a Term ${esc(checklistState.term)} checklist</h2>
        <p>Begin immediately with the standard Tracking Only checklist, choose a saved template, or configure a custom checklist.</p>
        <div class="checklist-quick-start">
          <button class="checklist-quick-start__card" type="button" onclick="TeacherTools.quickStartChecklist()">
            <strong>Use Standard Checklist</strong>
            <span>Recitation, Notebook, and Assignment · Tracking Only</span>
          </button>
          <button class="checklist-quick-start__card" type="button" onclick="TeacherTools.openCreateChecklist()">
            <strong>Create Custom Checklist</strong>
            <span>Choose criteria, destinations, and point values first</span>
          </button>
          ${templates.map(template => `<button class="checklist-quick-start__card" type="button" onclick="TeacherTools.quickStartChecklist('${esc(template.id)}')">
            <strong>${esc(template.name)}</strong>
            <span>${esc(template.criteria.length)} saved criteria${template.description ? ` · ${esc(template.description)}` : ''}</span>
          </button>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm checklist-welcome__tutorial" type="button" onclick="TeacherTools.openChecklistTutorial()">Show Me How It Works</button>
      </div>
    </div>`;
  }

  function renderPerformanceChecklist(container) {
    const assignment = activeAssignment();
    ensureChecklistState(assignment);
    const checklist = currentChecklist(assignment);
    const learners = core.activeLearners(assignment);
    const session = checklistSession(checklist);
    const activityPublished = core.isChecklistActivityPublished(session);

    container.innerHTML = `<div class="teacher-tool checklist-tool">
      <div class="simulator-toolbar no-print">
        ${renderChecklistContextControls(assignment)}
        <div class="simulator-toolbar__actions">
          ${checklist ? `
            ${session
              ? '<button class="btn btn-primary btn-sm checklist-toolbar-action checklist-toolbar-action--primary" type="button" onclick="TeacherTools.openAddChecklistActivity()">Add Activity</button>'
              : '<button class="btn btn-primary btn-sm checklist-toolbar-action checklist-toolbar-action--primary" type="button" onclick="TeacherTools.startTodayChecklistSession()">Start Today’s Session</button>'}
            <button class="btn btn-sm checklist-toolbar-action checklist-toolbar-action--bulk" type="button" onclick="TeacherTools.openChecklistBulkMark()" title="${activityPublished ? 'Unlock the published activity before changing points.' : ''}" ${session && !activityPublished ? '' : 'disabled'}>Bulk Mark</button>
            <button class="btn btn-sm checklist-toolbar-action checklist-toolbar-action--picker" type="button" onclick="TeacherTools.openChecklistPicker()" title="${activityPublished ? 'Unlock the published activity before changing points.' : ''}" ${session && !activityPublished ? '' : 'disabled'}>Mini Name Picker</button>
            <button class="btn btn-primary btn-sm checklist-toolbar-action checklist-toolbar-action--primary" type="button" onclick="TeacherTools.openGradeContributionDashboard()">Review Grade Contributions</button>
            <button class="btn btn-sm checklist-toolbar-action checklist-toolbar-action--more" type="button" onclick="TeacherTools.openChecklistMoreActions()">More Actions</button>` : ''}
        </div>
      </div>
      <div class="teacher-tool__body">
        ${!assignment ? emptyTool('Create a teaching load before using Performance Checklist.')
          : !checklist ? renderChecklistWelcome()
          : renderChecklistWorkspace(checklist, assignment, learners, session)}
      </div>
    </div>`;
    populateClassPickers();
    setTimeout(applyChecklistRowFilters, 0);
  }

  async function quickStartChecklist(templateId = '') {
    const assignment = activeAssignment();
    if (!assignment || currentChecklist(assignment)) return;
    try {
      const checklist = await runTransaction(() => {
        const official = activeAssignment();
        const tools = core.normalize(profileDb());
        const template = templateId
          ? tools.performanceChecklistTemplates.find(item => item.id === templateId)
          : null;
        if (templateId && !template) throw new Error('The selected checklist template is no longer available.');
        const created = core.createPerformanceChecklist(official, checklistState.term, {
          title: template?.name || 'Performance Checklist',
          mapePart: checklistState.mapePart,
          criteria: template ? core.checklistCriteriaFromTemplate(template) : core.defaultChecklistCriteria(),
          activityMode: true,
          date: checklistToday(),
          activityTitle: `${template?.criteria?.[0]?.label || 'Recitation'} 1`
        });
        tools.performanceChecklists.push(created);
        return created;
      });
      checklistState.sessionId = checklist.sessions[0].id;
      openPerformanceChecklistPage();
      globalScope.toast('Today’s performance checklist is ready.', 'success');
    } catch (error) {
      globalScope.toast(error.message || 'The checklist could not be created.', 'error');
    }
  }

  function renderChecklistWorkspace(checklist, assignment, learners, session) {
    const totals = core.checklistLearnerTotals(checklist, assignment);
    const criteria = session ? core.checklistSessionCriteria(checklist, session) : [];
    const tableColumns = core.checklistTableColumns(checklist);
    const status = checklistStatus(checklist, assignment);
    const gridCriteria = criteria.filter(item => item.active);
    if (!gridCriteria.some(item => item.id === checklistState.gridCriterionId)) {
      checklistState.gridCriterionId = gridCriteria[0]?.id || '';
    }
    const filterCriterion = checklistCriterion(checklist, checklistState.gridCriterionId);
    const activityPublished = core.isChecklistActivityPublished(session);
    const entryHistory = core.normalize(profileDb()).performanceChecklistEntryHistory
      .find(item => item.checklistId === checklist.id && item.status === 'applied');
    const activityOptions = checklist.sessions
      .filter(item => !item.activity?.deletedAt)
      .slice()
      .sort((left, right) => String(right.date).localeCompare(String(left.date)))
      .map(item => {
        const activity = core.checklistActivityDefinition(checklist, item);
        const detail = activity
          ? `${checklistComponentLabel(activity.destinationComponent)} · HPS ${activity.maxPointsPerSession}`
          : 'Legacy combined session';
        return `<option value="${esc(item.id)}" ${item.id === session?.id ? 'selected' : ''}>${esc(item.title)} · ${esc(item.date)} · ${esc(detail)}</option>`;
      }).join('');
    return `<div class="checklist-summary">
        <div>
          <div class="checklist-title-row">
            <h2 class="checklist-title">${esc(checklist.title)}</h2>
            <span class="checklist-status checklist-status--${esc(status.tone)}">${esc(status.label)}</span>
          </div>
          <p class="text-muted text-sm">${checklist.criteria.length} activity types · ${checklist.sessions.filter(item => !item.activity?.deletedAt).length} active activities · ${learners.length} active learners</p>
        </div>
        <div class="checklist-summary__actions no-print">
          ${session?.activity
            ? activityPublished
              ? `<button class="btn btn-warning btn-sm" type="button" onclick="TeacherTools.reviewChecklistActivityUnlock('${esc(session.activity.id || session.id)}')">Unlock Activity</button>`
              : '<button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.openEditChecklistActivity()">Edit Activity</button><button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.duplicateChecklistActivity()">Duplicate</button><button class="btn btn-danger btn-sm" type="button" onclick="TeacherTools.deleteChecklistActivity()">Delete</button>'
            : ''}
          ${(checklist.sessions || []).some(item => item.activity?.deletedAt) ? '<button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.restoreChecklistActivity()">Restore Deleted</button>' : ''}
          <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.undoLastChecklistEntryChange()" ${entryHistory && !activityPublished ? '' : 'disabled'}>Undo Last Entry</button>
        </div>
      </div>
      ${session ? `<div class="checklist-session-bar no-print">
        <label>
          <span class="field-label">Active activity</span>
          <select class="field-select" onchange="TeacherTools.changeChecklistSession(this.value)">
            ${activityOptions}
          </select>
        </label>
        ${activityPublished
          ? '<span class="checklist-session-lock"><strong>Published and locked</strong><span>Points are in the official grading sheet.</span></span>'
          : '<span class="checklist-save-state text-muted text-sm">Saved locally · official grades unchanged</span>'}
      </div>` : `<div class="checklist-no-session">
        <div><strong>No activity selected</strong><span>Add a Recitation, Notebook, Assignment, or custom activity for this term.</span></div>
        <div class="checklist-no-session__actions">
          <button class="btn btn-primary btn-sm" type="button" onclick="TeacherTools.openAddChecklistActivity()">Add Activity</button>
          ${checklist.sessions.length ? `<select class="field-select" onchange="if(this.value) TeacherTools.changeChecklistSession(this.value)">
            <option value="">Open Existing Activity...</option>
            ${checklist.sessions.filter(item => !item.activity?.deletedAt).slice().sort((left, right) => String(right.date).localeCompare(String(left.date))).map(item => `<option value="${esc(item.id)}">${esc(item.date)} · ${esc(item.title)}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>`}
      ${session && criteria.length ? `<div class="checklist-entry-toolbar no-print">
        <input id="checklistLearnerSearch" class="field-input" type="search" value="${esc(checklistState.search)}" placeholder="Search learner…" oninput="TeacherTools.filterChecklistRows(this.value)">
        <select class="field-select" onchange="TeacherTools.changeChecklistGridCriterion(this.value)">
          ${gridCriteria.map(item => `<option value="${esc(item.id)}" ${item.id === checklistState.gridCriterionId ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}
        </select>
        <select id="checklistEntryFilter" class="field-select" onchange="TeacherTools.changeChecklistFilter(this.value)">
          <option value="all" ${checklistState.filter === 'all' ? 'selected' : ''}>All learners</option>
          <option value="missing" ${checklistState.filter === 'missing' ? 'selected' : ''}>Not yet recorded</option>
          <option value="recorded" ${checklistState.filter === 'recorded' ? 'selected' : ''}>Has an entry</option>
        </select>
      </div>
      <div class="checklist-table-wrap">
        <table class="checklist-table">
          <thead><tr>
            <th class="checklist-learner-column">Learner</th>
            ${tableColumns.map(column => {
              const published = core.isChecklistActivityPublished(column.session);
              return `<th class="checklist-activity-column${column.sessionId === session.id ? ' is-active' : ''}${published ? ' is-published' : ''}" data-checklist-activity-column="${esc(column.sessionId)}" title="${esc(`${column.title}, ${column.date}${published ? ', published and locked' : ''}`)}">
                <span>${esc(column.title)}</span>
                <small>${esc(column.date)} · ${esc(checklistComponentLabel(column.definition.destinationComponent))} · HPS ${esc(column.definition.maxPointsPerSession)}${column.definition.active ? '' : ' · Archived'}</small>
                ${published ? '<span class="checklist-published-badge">Published · Locked</span>' : ''}
              </th>`;
            }).join('')}
            <th>WW Total</th><th>PT Total</th>
          </tr></thead>
          <tbody>${learners.map(learner => {
            const filterEntry = filterCriterion
              ? core.checklistEntry(checklist, session.id, learner.id, filterCriterion.id)
              : null;
            return `<tr id="checklistLearner-${esc(learner.id)}" data-checklist-row data-name="${esc(learnerName(learner).toLowerCase())}" data-recorded="${filterEntry ? 'true' : 'false'}" class="${checklistState.selected?.id === learner.id ? 'is-picker-selected' : ''}">
            <td class="checklist-learner-column"><span class="checklist-learner-identity">${learnerAvatar(learner)}<span>${esc(learnerName(learner))}</span></span></td>
            ${tableColumns.map(column => `<td class="${column.sessionId === session.id ? 'is-active-activity' : ''}${core.isChecklistActivityPublished(column.session) ? ' is-published-activity' : ''}">${checklistEntryControl(checklist, column.session, learner, column.definition)}</td>`).join('')}
            <td class="checklist-total">${esc(totals[learner.id]?.WW || 0)}</td>
            <td class="checklist-total">${esc(totals[learner.id]?.PT || 0)}</td>
          </tr>`;
          }).join('')}</tbody>
        </table>
      </div>` : emptyTool('Add an activity to begin recording learner points.')}
      <div class="checklist-integrity-note">
        <strong>Grade integrity:</strong> Tracking Only entries never affect grades. WW and PT points require a target assessment, valid HPS, PIN verification, and a before-and-after review.
      </div>
      ${renderChecklistHistory(checklist, assignment)}`;
  }

  function changeChecklistTerm(term) {
    checklistState.term = ['1', '2', '3'].includes(String(term)) ? String(term) : '1';
    checklistState.sessionId = '';
    checklistState.selected = null;
    checklistState.picker = null;
    refresh();
  }

  function changeChecklistMapePart(mapePart) {
    checklistState.mapePart = mapePart === 'pe_health' ? 'pe_health' : 'music_arts';
    checklistState.sessionId = '';
    checklistState.selected = null;
    checklistState.picker = null;
    refresh();
  }

  function changeChecklistSession(sessionId) {
    checklistState.sessionId = String(sessionId || '');
    checklistState.selected = null;
    checklistState.picker = null;
    checklistState.rosterSignature = '';
    const checklist = currentChecklist();
    const activity = core.checklistActivityDefinition(checklist, checklistState.sessionId);
    checklistState.gridCriterionId = activity?.criterionId || '';
    checklistState.selectedCriterionId = activity?.criterionId || '';
    refresh();
  }

  async function startTodayChecklistSession() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const existing = (checklist.sessions || [])
      .filter(item => item.date === checklistToday())
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0];
    if (existing) {
      checklistState.sessionId = existing.id;
      refresh();
      return;
    }
    try {
      const session = await runTransaction(() => core.addChecklistSession(currentChecklist(), {
        title: 'Today',
        date: checklistToday()
      }));
      checklistState.sessionId = session.id;
      openPerformanceChecklistPage();
      globalScope.toast('Today’s checklist session started.', 'success');
    } catch (error) {
      globalScope.toast(error.message || 'Today’s session could not be created.', 'error');
    }
  }

  function changeChecklistGridCriterion(criterionId) {
    checklistState.gridCriterionId = String(criterionId || '');
    refresh();
  }

  function checklistRowIsVisible(learner, checklist, session) {
    const nameMatches = !checklistState.search
      || learnerName(learner).toLowerCase().includes(checklistState.search.toLowerCase());
    const criterion = checklistCriterion(checklist, checklistState.gridCriterionId);
    const recorded = Boolean(criterion && core.checklistEntry(
      checklist,
      session.id,
      learner.id,
      criterion.id
    ));
    const filterMatches = checklistState.filter === 'all'
      || (checklistState.filter === 'missing' && !recorded)
      || (checklistState.filter === 'recorded' && recorded);
    return nameMatches && filterMatches;
  }

  function applyChecklistRowFilters() {
    document.querySelectorAll('[data-checklist-row]').forEach(row => {
      const nameMatches = !checklistState.search
        || String(row.dataset.name || '').includes(checklistState.search.toLowerCase());
      const recorded = row.dataset.recorded === 'true';
      const filterMatches = checklistState.filter === 'all'
        || (checklistState.filter === 'missing' && !recorded)
        || (checklistState.filter === 'recorded' && recorded);
      row.hidden = !(nameMatches && filterMatches);
    });
  }

  function filterChecklistRows(value) {
    checklistState.search = String(value || '');
    applyChecklistRowFilters();
  }

  function changeChecklistFilter(value) {
    checklistState.filter = ['missing', 'recorded'].includes(value) ? value : 'all';
    applyChecklistRowFilters();
  }

  function handleChecklistCellKey(event) {
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'z') {
      event.preventDefault();
      undoLastChecklistEntryChange();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const cell = event.target.closest('td');
    const row = event.target.closest('tr');
    const table = event.target.closest('table');
    if (!cell || !row || !table) return;
    const visibleRows = Array.from(table.querySelectorAll('tbody tr')).filter(item => !item.hidden);
    const rowIndex = visibleRows.indexOf(row);
    const columnIndex = Array.from(row.children).indexOf(cell);
    let targetRow = rowIndex;
    let targetColumn = columnIndex;
    if (event.key === 'ArrowUp') targetRow--;
    if (event.key === 'ArrowDown') targetRow++;
    if (event.key === 'ArrowLeft') targetColumn--;
    if (event.key === 'ArrowRight') targetColumn++;
    const target = visibleRows[targetRow]?.children[targetColumn]?.querySelector('input:not(:disabled)');
    if (!target) return;
    event.preventDefault();
    target.focus();
    if (target.type === 'number') target.select();
  }

  function appendChecklistEntryHistory(record) {
    const tools = core.normalize(profileDb());
    tools.performanceChecklistEntryHistory = [record, ...tools.performanceChecklistEntryHistory]
      .slice(0, core.CHECKLIST_ENTRY_HISTORY_LIMIT);
  }

  function openChecklistBulkMark() {
    const checklist = currentChecklist();
    const session = checklistSession(checklist);
    if (!checklist || !session) return;
    if (core.isChecklistActivityPublished(session)) {
      globalScope.toast('Unlock this published activity with your PIN before changing learner points.', 'warning');
      return;
    }
    const activeCriteria = core.checklistSessionCriteria(checklist, session)
      .filter(item => item.active);
    if (!activeCriteria.length) return;
    const body = `<div class="checklist-add-grid">
      <label><span class="field-label">Criterion</span><select id="checklistBulkCriterion" class="field-select">
        ${activeCriteria.map(item => `<option value="${esc(item.id)}" ${item.id === checklistState.gridCriterionId ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}
      </select></label>
      <label><span class="field-label">Learners</span><select id="checklistBulkScope" class="field-select">
        <option value="missing">Visible learners without an entry</option>
        <option value="visible">All visible learners — overwrite existing</option>
      </select></label>
      <label><span class="field-label">Points</span><input id="checklistBulkValue" class="field-input" type="number" min="0" step="any" value="1"></label>
    </div>
    <div class="checklist-integrity-note">A before-and-after confirmation appears before any entries are changed. Hidden learners are never included.</div>`;
    const modal = createModal(
      'Bulk Mark Checklist',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-review>Review Bulk Mark</button>'
    );
    const updateMaximum = () => {
      const criterion = checklistCriterion(checklist, modal.overlay.querySelector('#checklistBulkCriterion').value);
      const input = modal.overlay.querySelector('#checklistBulkValue');
      input.max = criterion?.maxPointsPerSession || 1;
      input.value = criterion?.scoringMode === 'CHECK'
        ? criterion.pointsPerCheck
        : Math.min(Number(input.value) || 1, criterion?.maxPointsPerSession || 1);
    };
    updateMaximum();
    modal.overlay.querySelector('#checklistBulkCriterion').addEventListener('change', updateMaximum);
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-review]').addEventListener('click', () => {
      const criterionId = modal.overlay.querySelector('#checklistBulkCriterion').value;
      const criterion = checklistCriterion(checklist, criterionId);
      const scope = modal.overlay.querySelector('#checklistBulkScope').value;
      const value = Number(modal.overlay.querySelector('#checklistBulkValue').value);
      if (!criterion || !Number.isFinite(value) || value < 0 || value > criterion.maxPointsPerSession) {
        globalScope.toast(`Enter points from 0 to ${criterion?.maxPointsPerSession || 0}.`, 'warning');
        return;
      }
      const visibleLearners = core.activeLearners(activeAssignment()).filter(learner =>
        checklistRowIsVisible(learner, checklist, session)
      );
      const affected = visibleLearners.filter(learner =>
        scope === 'visible' || !core.checklistEntry(checklist, session.id, learner.id, criterionId)
      );
      if (!affected.length) {
        globalScope.toast('No visible learners match this bulk action.', 'info');
        return;
      }
      modal.close();
      confirmChecklistBulkMark(
        criterion,
        value,
        affected,
        scope === 'visible',
        checklist.id,
        session.id
      );
    });
  }

  function confirmChecklistBulkMark(criterion, value, learners, overwrite, checklistId, sessionId) {
    const checklist = currentChecklist();
    if (!checklist || checklist.id !== checklistId) {
      globalScope.toast('The checklist changed before the bulk action could be reviewed.', 'warning');
      return;
    }
    const existing = learners.filter(learner => core.checklistEntry(
      checklist,
      sessionId,
      learner.id,
      criterion.id
    )).length;
    const body = `<p><strong>${esc(criterion.label)}</strong> will be set to <strong>${esc(value)}</strong> for <strong>${learners.length}</strong> visible learner${learners.length === 1 ? '' : 's'}.</p>
      <ul><li>${overwrite ? `${existing} existing entr${existing === 1 ? 'y' : 'ies'} will be overwritten.` : `${existing} existing entries will be preserved.`}</li>
      <li>Official assessment scores will not change.</li></ul>`;
    const modal = createModal(
      'Confirm Bulk Mark',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-apply>Apply Bulk Mark</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-apply]').addEventListener('click', () => {
      modal.close();
      executeChecklistBulkMark(
        criterion.id,
        value,
        learners.map(item => item.id),
        overwrite,
        checklistId,
        sessionId
      );
    });
  }

  async function executeChecklistBulkMark(criterionId, value, learnerIds, overwrite, checklistId, sessionId) {
    try {
      if (overwrite) {
        if (typeof globalScope.electronAPI?.createDatabaseRestorePoint !== 'function') {
          throw new Error('A restore point cannot be created. No checklist entries were changed.');
        }
        await globalScope.electronAPI.createDatabaseRestorePoint('performance-checklist-bulk-overwrite');
      }
      const record = await runTransaction(() => {
        const checklist = currentChecklist();
        if (!checklist || checklist.id !== checklistId) {
          throw new Error('The checklist changed before the bulk action was applied.');
        }
        const session = checklist.sessions.find(item => item.id === sessionId);
        const criterion = checklist.criteria.find(item => item.id === criterionId && item.active);
        if (!session || !criterion) {
          throw new Error('The selected checklist session or criterion is no longer available.');
        }
        const eligibleIds = new Set(core.activeLearners(activeAssignment()).map(item => item.id));
        const changes = learnerIds.filter(learnerId =>
          eligibleIds.has(learnerId)
          && (overwrite || !core.checklistEntry(checklist, session.id, learnerId, criterion.id))
        ).map(learnerId => ({
          sessionId: session.id,
          learnerId,
          criterionId: criterion.id,
          value
        }));
        if (!changes.length) {
          throw new Error('No eligible checklist entries remain for this bulk action.');
        }
        const applied = core.applyChecklistEntryTransaction(checklist, activeAssignment(), changes, {
          operation: 'bulk',
          label: `${criterion.label} bulk mark`,
          metadata: { deviceId: rootDb()?.deviceId || '' }
        });
        appendChecklistEntryHistory(applied);
        return applied;
      });
      openPerformanceChecklistPage();
      globalScope.toast(`${record.changes.length} checklist entries updated.`, 'success');
    } catch (error) {
      globalScope.toast(error.message || 'The bulk checklist update failed.', 'error');
    }
  }

  async function undoLastChecklistEntryChange() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const entry = core.normalize(profileDb()).performanceChecklistEntryHistory
      .find(item => item.checklistId === checklist.id && item.status === 'applied');
    if (!entry) {
      globalScope.toast('There is no checklist entry action to undo.', 'info');
      return;
    }
    try {
      const plan = core.planChecklistEntryUndo(entry, checklist);
      if (!plan.canUndo) {
        globalScope.toast('Some entries changed after this action. The newer data was preserved.', 'warning');
        return;
      }
      const result = await runTransaction(() => {
        const tools = core.normalize(profileDb());
        const currentEntry = tools.performanceChecklistEntryHistory.find(item => item.id === entry.id);
        return core.undoChecklistEntryTransaction(currentEntry, currentChecklist());
      });
      openPerformanceChecklistPage();
      globalScope.toast(`${result.restored} checklist entr${result.restored === 1 ? 'y' : 'ies'} restored.`, 'success');
    } catch (error) {
      globalScope.toast(error.message || 'The checklist action could not be undone.', 'error');
    }
  }

  function criterionFormRow(label, id, selected = true) {
    return `<div class="checklist-criterion-form-row" data-starter-row>
      <label class="checklist-starter-check"><input type="checkbox" data-use ${selected ? 'checked' : ''}> <span>${esc(label)}</span></label>
      <select class="field-select" data-destination aria-label="${esc(`${label} destination`)}">
        <option value="TRACKING">Tracking Only</option>
        <option value="WW">Written Work</option>
        <option value="PT">Performance Task</option>
      </select>
      <label><span class="field-label">Points</span><input class="field-input" data-points type="number" min="0.01" step="any" value="1"></label>
      <input type="hidden" data-label value="${esc(label)}">
    </div>`;
  }

  function openCreateChecklist() {
    const assignment = activeAssignment();
    if (!assignment || currentChecklist(assignment)) return;
    const body = `<p>Choose the starter criteria for this class and term. Select <strong>Tracking Only</strong> when the entries are formative or should not affect grades.</p>
      <div class="field"><label class="field-label" for="checklistTitleInput">Checklist name</label><input id="checklistTitleInput" class="field-input" value="Performance Checklist"></div>
      <div class="checklist-criterion-form">
        ${criterionFormRow('Recitation', 'recitation')}
        ${criterionFormRow('Notebook', 'notebook')}
        ${criterionFormRow('Assignment', 'assignment')}
      </div>`;
    const modal = createModal(
      'Create Performance Checklist',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-create>Create Checklist</button>',
      true
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-create]').addEventListener('click', async () => {
      const criteria = Array.from(modal.overlay.querySelectorAll('[data-starter-row]'))
        .filter(row => row.querySelector('[data-use]').checked)
        .map(row => ({
          label: row.querySelector('[data-label]').value,
          destinationComponent: row.querySelector('[data-destination]').value,
          scoringMode: 'NUMERIC',
          pointsPerCheck: row.querySelector('[data-points]').value,
          maxPointsPerSession: row.querySelector('[data-points]').value
        }));
      if (!criteria.length) {
        globalScope.toast('Select at least one starter criterion.', 'warning');
        return;
      }
      const title = modal.overlay.querySelector('#checklistTitleInput').value.trim() || 'Performance Checklist';
      modal.close();
      try {
        await runTransaction(() => {
          const official = activeAssignment();
          const checklist = core.createPerformanceChecklist(official, checklistState.term, {
            title,
            mapePart: checklistState.mapePart,
            criteria,
            activityMode: true
          });
          const tools = core.normalize(profileDb());
          tools.performanceChecklists.push(checklist);
          checklistState.sessionId = checklist.sessions[0].id;
          return checklist;
        });
        openPerformanceChecklistPage();
        globalScope.toast('Performance checklist created.', 'success');
      } catch (error) {
        globalScope.toast(error.message, 'error');
      }
    });
  }

  function openChecklistCriteria() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const locked = hasPublishedChecklistPoints(checklist);
    const body = `${locked ? '<div class="checklist-warning">Revert published checklist points before changing criterion scoring or destinations.</div>' : ''}
      <div class="checklist-settings-list">${checklist.criteria.map(criterion => `
        <div class="checklist-settings-row" data-criterion-row data-id="${esc(criterion.id)}">
          <label><span class="field-label">Activity type</span><input class="field-input" data-label value="${esc(criterion.label)}" ${locked ? 'disabled' : ''}></label>
          <label><span class="field-label">Default destination</span><select class="field-select" data-destination ${locked ? 'disabled' : ''}>
            ${['TRACKING', 'WW', 'PT'].map(component => `<option value="${component}" ${criterion.destinationComponent === component ? 'selected' : ''}>${esc(checklistComponentLabel(component))}</option>`).join('')}
          </select></label>
          <label><span class="field-label">Default scoring</span><select class="field-select" data-mode ${locked || core.isStandardNumericalChecklistLabel(criterion) ? 'disabled' : ''} title="${core.isStandardNumericalChecklistLabel(criterion) ? 'Recitation, Notebook, and Assignment always use numerical scores.' : ''}">
            <option value="CHECK" ${criterion.scoringMode === 'CHECK' ? 'selected' : ''}>Check mark</option>
            <option value="NUMERIC" ${criterion.scoringMode === 'NUMERIC' ? 'selected' : ''}>Numeric</option>
          </select></label>
          <label><span class="field-label">Default HPS</span><input class="field-input" data-session-max type="number" min="0.01" step="any" value="${esc(criterion.maxPointsPerSession)}" ${locked ? 'disabled' : ''}></label>
          <label><span class="field-label">Term cap</span><input class="field-input" data-term-max type="number" min="0.01" step="any" value="${criterion.maxPointsPerTerm || ''}" placeholder="No cap" ${locked ? 'disabled' : ''}></label>
          <div class="checklist-settings-toggles">
            <label class="checklist-active-toggle"><input type="checkbox" data-notes ${criterion.allowNotes ? 'checked' : ''} ${locked ? 'disabled' : ''}> Notes</label>
            <label class="checklist-active-toggle"><input type="checkbox" data-active ${criterion.active ? 'checked' : ''} ${locked ? 'disabled' : ''}> Active</label>
          </div>
        </div>`).join('')}</div>`;
    const actions = `<button class="btn btn-cancel btn-sm" data-cancel>${locked ? 'Close' : 'Cancel'}</button>
      ${locked ? '' : '<button class="btn btn-ghost btn-sm" data-add>Add Criterion</button><button class="btn btn-primary btn-sm" data-save>Save Criteria</button>'}`;
    const modal = createModal('Manage Checklist Criteria', body, actions, true);
    modal.overlay.querySelector('.modal')?.classList.add('checklist-criteria-modal');
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-add]')?.addEventListener('click', () => {
      modal.close();
      openAddChecklistCriterion();
    });
    modal.overlay.querySelector('[data-save]')?.addEventListener('click', async () => {
      try {
        const criteria = Array.from(modal.overlay.querySelectorAll('[data-criterion-row]')).map((row, index) => {
          const existing = checklist.criteria.find(item => item.id === row.dataset.id);
          return core.createChecklistCriterion({
            ...existing,
            label: row.querySelector('[data-label]').value,
            destinationComponent: row.querySelector('[data-destination]').value,
            scoringMode: row.querySelector('[data-mode]').value,
            pointsPerCheck: row.querySelector('[data-session-max]').value,
            maxPointsPerSession: row.querySelector('[data-session-max]').value,
            maxPointsPerTerm: row.querySelector('[data-term-max]').value,
            allowNotes: row.querySelector('[data-notes]').checked,
            active: row.querySelector('[data-active]').checked,
            order: index
          }, []);
        });
        const labels = criteria.map(item => item.label.toLowerCase());
        if (new Set(labels).size !== labels.length) {
          throw new Error('Each checklist criterion must have a unique name.');
        }
        modal.close();
        await runTransaction(() => {
          const current = currentChecklist();
          if (!current || hasPublishedChecklistPoints(current)) {
            throw new Error('Checklist criteria changed or became locked. Reopen the settings.');
          }
          current.criteria = criteria;
          current.updatedAt = new Date().toISOString();
        });
        openPerformanceChecklistPage();
        globalScope.toast('Checklist criteria updated.', 'success');
      } catch (error) {
        globalScope.toast(error.message, 'warning');
      }
    });
  }

  function openAddChecklistCriterion() {
    const checklist = currentChecklist();
    if (!checklist || hasPublishedChecklistPoints(checklist)) return;
    const body = `<div class="checklist-add-grid">
      <label><span class="field-label">Criterion name</span><input id="newChecklistCriterionLabel" class="field-input" placeholder="Example: Group Participation"></label>
      <label><span class="field-label">Destination</span><select id="newChecklistCriterionDestination" class="field-select">
        <option value="TRACKING">Tracking Only</option><option value="WW">Written Work</option><option value="PT">Performance Task</option>
      </select></label>
      <label><span class="field-label">Entry type</span><select id="newChecklistCriterionMode" class="field-select">
        <option value="CHECK">Check mark</option><option value="NUMERIC">Numeric</option>
      </select></label>
      <label><span class="field-label">Maximum per session</span><input id="newChecklistCriterionMax" class="field-input" type="number" min="0.01" step="any" value="1"></label>
      <label><span class="field-label">Optional term cap</span><input id="newChecklistCriterionTermMax" class="field-input" type="number" min="0.01" step="any" placeholder="No cap"></label>
      <label class="checklist-active-toggle"><input id="newChecklistCriterionNotes" type="checkbox"> Allow learner notes</label>
    </div>`;
    const modal = createModal(
      'Add Checklist Criterion',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-add>Add Criterion</button>'
    );
    const labelInput = modal.overlay.querySelector('#newChecklistCriterionLabel');
    const modeSelect = modal.overlay.querySelector('#newChecklistCriterionMode');
    const syncStandardMode = () => {
      const standardNumerical = core.isStandardNumericalChecklistLabel(labelInput.value);
      if (standardNumerical) modeSelect.value = 'NUMERIC';
      modeSelect.disabled = standardNumerical;
      modeSelect.title = standardNumerical
        ? 'Recitation, Notebook, and Assignment always use numerical scores.'
        : '';
    };
    labelInput.addEventListener('input', syncStandardMode);
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-add]').addEventListener('click', async () => {
      try {
        const criterion = core.createChecklistCriterion({
          label: modal.overlay.querySelector('#newChecklistCriterionLabel').value,
          destinationComponent: modal.overlay.querySelector('#newChecklistCriterionDestination').value,
          scoringMode: modal.overlay.querySelector('#newChecklistCriterionMode').value,
          pointsPerCheck: modal.overlay.querySelector('#newChecklistCriterionMax').value,
          maxPointsPerSession: modal.overlay.querySelector('#newChecklistCriterionMax').value,
          maxPointsPerTerm: modal.overlay.querySelector('#newChecklistCriterionTermMax').value,
          allowNotes: modal.overlay.querySelector('#newChecklistCriterionNotes').checked
        }, checklist.criteria);
        modal.close();
        await runTransaction(() => {
          const current = currentChecklist();
          if (!current || hasPublishedChecklistPoints(current)) throw new Error('Checklist criteria are currently locked.');
          current.criteria.push(criterion);
          current.updatedAt = new Date().toISOString();
        });
        openPerformanceChecklistPage();
        globalScope.toast('Criterion added.', 'success');
      } catch (error) {
        globalScope.toast(error.message, 'warning');
      }
    });
  }

  function openAddChecklistSession() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const today = new Date().toISOString().slice(0, 10);
    const body = `<div class="checklist-add-grid">
      <label><span class="field-label">Session title</span><input id="newChecklistSessionTitle" class="field-input" value="Session ${checklist.sessions.length + 1}"></label>
      <label><span class="field-label">Date</span><input id="newChecklistSessionDate" class="field-input" type="date" value="${today}"></label>
    </div>`;
    const modal = createModal(
      'New Checklist Session',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-create>Create Session</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-create]').addEventListener('click', async () => {
      const title = modal.overlay.querySelector('#newChecklistSessionTitle').value.trim();
      const date = modal.overlay.querySelector('#newChecklistSessionDate').value;
      if (!title || !date) {
        globalScope.toast('Enter a session title and date.', 'warning');
        return;
      }
      modal.close();
      try {
        const session = await runTransaction(() => core.addChecklistSession(currentChecklist(), { title, date }));
        checklistState.sessionId = session.id;
        openPerformanceChecklistPage();
        globalScope.toast('Checklist session created.', 'success');
      } catch (error) {
        globalScope.toast(error.message, 'error');
      }
    });
  }

  function openAddChecklistActivity() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const activeCriteria = checklist.criteria.filter(item => item.active);
    if (!activeCriteria.length) {
      globalScope.toast('Add an active activity type first.', 'warning');
      return;
    }
    const today = checklistToday();
    const nextTitle = criterion => {
      const count = checklist.sessions.filter(session =>
        session.activity?.criterionId === criterion.id
      ).length;
      return `${criterion.label} ${count + 1}`;
    };
    const body = `<div class="checklist-activity-form">
      <label><span class="field-label">Activity type</span><select id="newChecklistActivityType" class="field-select">
        ${activeCriteria.map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')}
      </select></label>
      <label><span class="field-label">Activity title</span><input id="newChecklistActivityTitle" class="field-input"></label>
      <label><span class="field-label">Date</span><input id="newChecklistActivityDate" class="field-input" type="date" value="${esc(today)}"></label>
      <label><span class="field-label">Grade destination</span><select id="newChecklistActivityDestination" class="field-select">
        <option value="TRACKING">Tracking Only</option>
        <option value="WW">Written Work</option>
        <option value="PT">Performance Task</option>
      </select></label>
      <label><span class="field-label">Scoring</span><select id="newChecklistActivityMode" class="field-select">
        <option value="CHECK">Check mark</option>
        <option value="NUMERIC">Numeric score</option>
      </select></label>
      <label><span class="field-label">Highest Possible Score</span><input id="newChecklistActivityHps" class="field-input" type="number" min="0.01" step="any"></label>
      <label class="checklist-active-toggle"><input id="newChecklistActivityNotes" type="checkbox"> Allow learner notes</label>
    </div>
    <div class="checklist-integrity-note">Each activity is stored separately. Graded activities can add points only to a compatible assessment in the same term and component without exceeding HPS.</div>`;
    const modal = createModal(
      'Add Performance Activity',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-create>Create Activity</button>',
      true
    );
    const typeSelect = modal.overlay.querySelector('#newChecklistActivityType');
    const titleInput = modal.overlay.querySelector('#newChecklistActivityTitle');
    const destinationSelect = modal.overlay.querySelector('#newChecklistActivityDestination');
    const modeSelect = modal.overlay.querySelector('#newChecklistActivityMode');
    const hpsInput = modal.overlay.querySelector('#newChecklistActivityHps');
    const notesInput = modal.overlay.querySelector('#newChecklistActivityNotes');
    const applyDefaults = () => {
      const criterion = activeCriteria.find(item => item.id === typeSelect.value) || activeCriteria[0];
      titleInput.value = nextTitle(criterion);
      destinationSelect.value = criterion.destinationComponent;
      const standardNumerical = core.isStandardNumericalChecklistLabel(criterion);
      modeSelect.value = standardNumerical ? 'NUMERIC' : criterion.scoringMode;
      modeSelect.disabled = standardNumerical;
      modeSelect.title = standardNumerical
        ? 'Recitation, Notebook, and Assignment activities always use numerical scores.'
        : '';
      hpsInput.value = criterion.maxPointsPerSession;
      notesInput.checked = criterion.allowNotes;
    };
    applyDefaults();
    typeSelect.addEventListener('change', applyDefaults);
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-create]').addEventListener('click', async () => {
      const maxPoints = Number(hpsInput.value);
      const title = titleInput.value.trim();
      const date = modal.overlay.querySelector('#newChecklistActivityDate').value;
      if (!title || !date || !Number.isFinite(maxPoints) || maxPoints <= 0) {
        globalScope.toast('Enter an activity title, date, and positive HPS.', 'warning');
        return;
      }
      modal.close();
      try {
        const activitySession = await runTransaction(() => core.addChecklistActivity(
          currentChecklist(),
          {
            criterionId: typeSelect.value,
            title,
            date,
            destinationComponent: destinationSelect.value,
            scoringMode: modeSelect.value,
            pointsPerCheck: maxPoints,
            maxPoints,
            allowNotes: notesInput.checked
          }
        ));
        checklistState.sessionId = activitySession.id;
        checklistState.gridCriterionId = activitySession.activity.criterionId;
        checklistState.selected = null;
        checklistState.picker = null;
        openPerformanceChecklistPage();
        globalScope.toast(`${activitySession.title} created.`, 'success');
      } catch (error) {
        globalScope.toast(error.message || 'The activity could not be created.', 'error');
      }
    });
  }

  function openEditChecklistActivity() {
    const checklist = currentChecklist();
    const session = checklistSession(checklist);
    const activity = core.checklistActivityDefinition(checklist, session);
    if (!checklist || !session?.activity || !activity) return;
    if (core.isChecklistActivityPublished(session)) {
      reviewChecklistActivityUnlock(activity.activityId);
      return;
    }
    const standardNumerical = core.isStandardNumericalChecklistLabel(activity);
    const body = `<div class="checklist-activity-form">
        <label><span class="field-label">Activity type</span><input class="field-input" value="${esc(activity.label)}" disabled></label>
        <label><span class="field-label">Activity title</span><input id="editChecklistActivityTitle" class="field-input" value="${esc(activity.title)}"></label>
        <label><span class="field-label">Date</span><input id="editChecklistActivityDate" class="field-input" type="date" value="${esc(session.date)}"></label>
        <label><span class="field-label">Grade destination</span><select id="editChecklistActivityDestination" class="field-select">
          ${['TRACKING', 'WW', 'PT'].map(component => `<option value="${component}" ${activity.destinationComponent === component ? 'selected' : ''}>${esc(checklistComponentLabel(component))}</option>`).join('')}
        </select></label>
        <label><span class="field-label">Scoring</span><select id="editChecklistActivityMode" class="field-select" ${standardNumerical ? 'disabled title="Recitation, Notebook, and Assignment activities always use numerical scores."' : ''}>
          <option value="CHECK" ${activity.scoringMode === 'CHECK' ? 'selected' : ''}>Check mark</option>
          <option value="NUMERIC" ${activity.scoringMode === 'NUMERIC' ? 'selected' : ''}>Numeric score</option>
        </select></label>
        <label><span class="field-label">Highest Possible Score</span><input id="editChecklistActivityHps" class="field-input" type="number" min="0.01" step="any" value="${esc(activity.maxPointsPerSession)}"></label>
        <label id="editChecklistItemsField"><span class="field-label">Checklist items (one per line: Label | Points)</span><textarea id="editChecklistActivityItems" class="field-input" rows="5">${esc((activity.checkItems || []).map(item => item.label + ' | ' + item.pointValue).join('\n'))}</textarea><small>Use 1–10 items. Stable item IDs are retained when labels match.</small></label>
        <label class="checklist-active-toggle"><input id="editChecklistActivityNotes" type="checkbox" ${activity.allowNotes ? 'checked' : ''}> Allow learner notes</label>
      </div>`;
    const modal = createModal(
      'Edit Performance Activity',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Activity</button>',
      true
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const title = modal.overlay.querySelector('#editChecklistActivityTitle').value.trim();
      const date = modal.overlay.querySelector('#editChecklistActivityDate').value;
      const maxPoints = Number(modal.overlay.querySelector('#editChecklistActivityHps').value);
      if (!title || !date || !Number.isFinite(maxPoints) || maxPoints <= 0) {
        globalScope.toast('Enter an activity title, date, and positive HPS.', 'warning');
        return;
      }
      const requestedMode = modal.overlay.querySelector('#editChecklistActivityMode').value;
      const existingEntries = core.checklistEntryCount(session);
      if (requestedMode !== activity.scoringMode && existingEntries && !globalScope.confirm('This activity has learner entries. Change scoring mode while preserving every existing value?')) return;
      const lines = modal.overlay.querySelector('#editChecklistActivityItems').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (requestedMode === 'CHECK' && (lines.length < 1 || lines.length > 10)) { globalScope.toast('Checklist mode requires 1–10 items.', 'warning'); return; }
      const previousItems = new Map((activity.checkItems || []).map(item => [item.label.toLowerCase(), item]));
      const checkItems = lines.map((line, index) => { const [labelPart, pointsPart] = line.split('|'); const label = String(labelPart || '').trim(); const pointValue = Number(pointsPart); const previous = previousItems.get(label.toLowerCase()); return { ...previous, id: previous?.id, label, pointValue, active:true, order:index }; });
      if (requestedMode === 'CHECK' && checkItems.some(item => !item.label || !Number.isFinite(item.pointValue) || item.pointValue < 0)) { globalScope.toast('Use “Label | Points” for every checklist item.', 'warning'); return; }
      const options = {
        title,
        date,
        destinationComponent: modal.overlay.querySelector('#editChecklistActivityDestination').value,
        scoringMode: requestedMode,
        confirmModeChange: true,
        checkItems,
        pointsPerCheck: maxPoints,
        maxPoints,
        allowNotes: modal.overlay.querySelector('#editChecklistActivityNotes').checked
      };
      modal.close();
      try {
        await runTransaction(() => core.updateChecklistActivity(
          currentChecklist(),
          activity.activityId,
          options
        ));
        openPerformanceChecklistPage();
        globalScope.toast('Activity updated.', 'success');
      } catch (error) {
        globalScope.toast(error.message || 'The activity could not be updated.', 'warning');
      }
    });
  }

  async function duplicateChecklistActivity() {
    const checklist = currentChecklist(); const session = checklistSession(checklist);
    if (!session?.activity) return;
    try { const copy = core.duplicateChecklistActivity(checklist, session.activity.id); await globalScope.saveDatabase(); checklistState.sessionId = copy.id; activate('checklist'); globalScope.toast('Activity duplicated without learner entries.', 'success'); }
    catch (error) { globalScope.toast(error.message, 'warning'); }
  }

  function deleteChecklistActivity() {
    const checklist = currentChecklist(); const session = checklistSession(checklist);
    if (!session?.activity) return;
    if (core.isChecklistActivityPublished(session)) { globalScope.toast('Unlock and revert official changes before deleting this published activity.', 'warning'); return; }
    const count = core.checklistEntryCount(session);
    if (!globalScope.confirm(count ? `Delete this activity? ${count} learner entry record(s) will be hidden but retained for restoration.` : 'Delete this empty, unpublished activity?')) return;
    globalScope.promptPinVerification(async () => { core.deleteChecklistActivity(checklist, session.activity.id, { confirmed:true }); await globalScope.saveDatabase(); checklistState.sessionId=''; activate('checklist'); globalScope.toast('Activity deleted. It can be restored.', 'success'); });
  }

  function restoreChecklistActivity() {
    const checklist = currentChecklist(); const deleted = (checklist?.sessions || []).filter(item => item.activity?.deletedAt);
    if (!deleted.length) return;
    const labels = deleted.map((item,index) => `${index + 1}. ${item.title}`).join('\n');
    const index = Number(globalScope.prompt(`Choose an activity to restore:
${labels}`, '1')) - 1;
    if (!deleted[index]) return;
    core.restoreChecklistActivity(checklist, deleted[index].activity.id); globalScope.saveDatabase().then(() => { checklistState.sessionId=deleted[index].id; activate('checklist'); globalScope.toast('Activity restored with its entries.', 'success'); });
  }

  function reviewChecklistActivityUnlock(activityId = '') {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    const session = (checklist?.sessions || []).find(item =>
      String(item.activity?.id || item.id) === String(activityId || '')
    );
    if (!checklist || !assignment || !session?.activity) return;
    const tools = core.normalize(profileDb());
    const plan = core.planChecklistActivityUnlock(
      tools.performanceChecklistHistory,
      checklist,
      assignment,
      activityId
    );
    if (!plan.canUnlock) {
      globalScope.toast(plan.error || 'This published activity cannot be unlocked safely.', 'warning');
      return;
    }
    const activityTitle = session.activity.title || session.title;
    const body = `<div class="checklist-warning">
        <strong>${esc(activityTitle)} will become unpublished.</strong>
        <p>The app will restore ${esc(plan.restoredScores)} official score change${plan.restoredScores === 1 ? '' : 's'} from ${esc(plan.publications)} publication${plan.publications === 1 ? '' : 's'} before unlocking the activity.</p>
      </div>
      <ul>
        <li>The recorded checklist points will stay in this activity.</li>
        <li>Those points will no longer be included in the official grading sheet.</li>
        <li>You can edit the full activity and publish it again after reviewing the changes.</li>
      </ul>
      <p class="text-muted text-sm">PIN verification is required because this changes official grades.</p>`;
    const modal = createModal(
      'Unlock Published Activity',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Stay Locked</button><button class="btn btn-primary btn-sm" data-unlock>Verify PIN and Unlock</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-unlock]').addEventListener('click', () => {
      modal.close();
      withPinVerification(async () => {
        const result = await runTransaction(() => {
          const currentChecklistValue = currentChecklist();
          const currentAssignmentValue = activeAssignment();
          const currentTools = core.normalize(profileDb());
          if (!currentChecklistValue
            || currentChecklistValue.id !== checklist.id
            || currentAssignmentValue?.id !== assignment.id) {
            throw new Error('The active class or checklist changed. Reopen the unlock review.');
          }
          return core.unlockChecklistActivity(
            currentTools.performanceChecklistHistory,
            currentChecklistValue,
            currentAssignmentValue,
            activityId
          );
        });
        globalScope.render();
        openPerformanceChecklistPage();
        globalScope.toast(
          `${activityTitle} is editable again. ${result.restoredScores} official score change${result.restoredScores === 1 ? '' : 's'} restored.`,
          'success'
        );
      });
    });
  }

  function openChecklistMoreActions() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const body = `<div class="checklist-more-actions">
      <button type="button" data-action="criteria"><strong>Manage Criteria</strong><span>Edit names, point values, destinations, and term caps.</span></button>
      <button type="button" data-action="tutorial"><strong>Checklist Tutorial</strong><span>Walk through the safe daily workflow without changing profile data.</span></button>
      <button type="button" data-action="template"><strong>Save as Template</strong><span>Reuse this criterion setup in another class or term.</span></button>
      <button type="button" data-action="templates"><strong>Manage Saved Templates</strong><span>Review or delete personal checklist templates.</span></button>
      <button type="button" data-action="print"><strong>Print Summary</strong><span>Print learner and criterion totals for this term.</span></button>
      <button type="button" data-action="csv"><strong>Export CSV</strong><span>Save checklist totals as a spreadsheet-ready file.</span></button>
      <button type="button" data-action="reset"><strong>Reset Checklist</strong><span>Clear a session, the term, or only the Mini Name Picker.</span></button>
    </div>`;
    const modal = createModal(
      'More Checklist Actions',
      body,
      '<button class="btn btn-cancel btn-sm" data-close>Close</button>',
      true
    );
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
    modal.overlay.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action;
        modal.close();
        if (action === 'criteria') openChecklistCriteria();
        if (action === 'tutorial') openChecklistTutorial();
        if (action === 'template') openSaveChecklistTemplate();
        if (action === 'templates') openManageChecklistTemplates();
        if (action === 'print') printChecklistSummary();
        if (action === 'csv') exportChecklistCsv();
        if (action === 'reset') openResetChecklist();
      });
    });
  }

  function openChecklistTutorial() {
    const steps = [
      {
        title: 'Choose the class and term',
        body: 'Performance Checklist keeps a separate checklist for every class, term, and MAPEH strand. Confirm the context shown at the top before recording.'
      },
      {
        title: 'Add each activity occurrence',
        body: 'Create Recitation 1, Recitation 2, Notebook 1, Assignment 1, or another activity as it happens. Every activity keeps its own date, HPS, scoring mode, and destination.'
      },
      {
        title: 'Record evidence quickly',
        body: 'Select one activity and mark learners in its focused roster. Bulk Mark, search, filters, notes, and the Mini Name Picker affect only the selected activity.'
      },
      {
        title: 'Correct safely',
        body: 'Undo Last Entry reverses the latest compatible entry action. Reset Checklist requires the profile PIN and a local restore point before clearing a session, criterion, or term.'
      },
      {
        title: 'Review before adding to grades',
        body: 'Tracking Only activities never affect official grades. For Written Work or Performance Task, the app recommends unused assessments first and blocks any target that would place a learner above HPS.'
      },
      {
        title: 'Keep a reusable setup',
        body: 'Save the checklist as a template to reuse its criteria. Templates do not copy learners, entries, assessment links, or published grades.'
      }
    ];
    let stepIndex = 0;
    const modal = createModal(
      'Performance Checklist Tutorial',
      '<div id="checklistTutorialContent"></div>',
      '<button class="btn btn-cancel btn-sm" data-close>Close</button><button class="btn btn-ghost btn-sm" data-back>Back</button><button class="btn btn-primary btn-sm" data-next>Next</button>',
      true
    );
    const content = modal.overlay.querySelector('#checklistTutorialContent');
    const backButton = modal.overlay.querySelector('[data-back]');
    const nextButton = modal.overlay.querySelector('[data-next]');
    const renderStep = () => {
      const step = steps[stepIndex];
      content.innerHTML = `<div class="checklist-tutorial">
        <div class="checklist-tutorial__progress" aria-label="Tutorial step ${stepIndex + 1} of ${steps.length}">
          ${steps.map((item, index) => `<span class="${index === stepIndex ? 'is-active' : ''}" aria-hidden="true"></span>`).join('')}
        </div>
        <span class="checklist-tutorial__eyebrow">Step ${stepIndex + 1} of ${steps.length}</span>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.body)}</p>
        <div class="checklist-integrity-note">This tutorial is read-only. It does not create sessions, entries, templates, or grade changes.</div>
      </div>`;
      backButton.disabled = stepIndex === 0;
      nextButton.textContent = stepIndex === steps.length - 1 ? 'Finish' : 'Next';
    };
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
    backButton.addEventListener('click', () => {
      stepIndex = Math.max(0, stepIndex - 1);
      renderStep();
    });
    nextButton.addEventListener('click', () => {
      if (stepIndex === steps.length - 1) {
        modal.close();
        return;
      }
      stepIndex += 1;
      renderStep();
    });
    renderStep();
  }

  function openSaveChecklistTemplate() {
    const checklist = currentChecklist();
    if (!checklist) return;
    const body = `<div class="checklist-add-grid">
      <label><span class="field-label">Template name</span><input id="checklistTemplateName" class="field-input" value="${esc(checklist.title)}"></label>
      <label><span class="field-label">Description</span><input id="checklistTemplateDescription" class="field-input" placeholder="Optional"></label>
    </div>
    <div class="checklist-integrity-note">Only criterion configuration is copied. Learners, sessions, entries, assessment links, and publication history are excluded.</div>`;
    const modal = createModal(
      'Save Checklist as Template',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Template</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const name = modal.overlay.querySelector('#checklistTemplateName').value.trim();
      const description = modal.overlay.querySelector('#checklistTemplateDescription').value.trim();
      try {
        const template = core.createChecklistTemplate(checklist, name, description);
        const duplicate = core.normalize(profileDb()).performanceChecklistTemplates.some(item =>
          item.name.toLowerCase() === template.name.toLowerCase()
        );
        if (duplicate) throw new Error('A checklist template with this name already exists.');
        modal.close();
        await runTransaction(() => {
          core.normalize(profileDb()).performanceChecklistTemplates.push(template);
        });
        openPerformanceChecklistPage();
        globalScope.toast('Checklist template saved.', 'success');
      } catch (error) {
        globalScope.toast(error.message || 'The checklist template could not be saved.', 'warning');
      }
    });
  }

  function openManageChecklistTemplates() {
    const templates = core.normalize(profileDb()).performanceChecklistTemplates;
    const body = templates.length
      ? `<div class="checklist-template-list">${templates.map(template => `<div class="checklist-template-row">
          <div><strong>${esc(template.name)}</strong><span>${esc(template.criteria.length)} criteria${template.description ? ` · ${esc(template.description)}` : ''}</span></div>
          <button class="btn btn-warn btn-sm" type="button" data-delete-template="${esc(template.id)}">Delete</button>
        </div>`).join('')}</div>`
      : '<p>No personal checklist templates have been saved.</p>';
    const modal = createModal(
      'Saved Checklist Templates',
      body,
      '<button class="btn btn-cancel btn-sm" data-close>Close</button>',
      true
    );
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
    modal.overlay.querySelectorAll('[data-delete-template]').forEach(button => {
      button.addEventListener('click', () => {
        const templateId = button.dataset.deleteTemplate;
        modal.close();
        confirmDeleteChecklistTemplate(templateId);
      });
    });
  }

  function confirmDeleteChecklistTemplate(templateId) {
    const template = core.normalize(profileDb()).performanceChecklistTemplates.find(item => item.id === templateId);
    if (!template) return;
    const modal = createModal(
      'Delete Checklist Template',
      `<p>Delete <strong>${esc(template.name)}</strong>? Existing checklists created from it will not be changed.</p>`,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-warn btn-sm" data-delete>Delete Template</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-delete]').addEventListener('click', async () => {
      modal.close();
      try {
        await runTransaction(() => {
          const tools = core.normalize(profileDb());
          tools.performanceChecklistTemplates = tools.performanceChecklistTemplates.filter(item => item.id !== templateId);
        });
        openPerformanceChecklistPage();
        globalScope.toast('Checklist template deleted.', 'success');
      } catch (error) {
        globalScope.toast(error.message || 'The checklist template could not be deleted.', 'error');
      }
    });
  }

  function openResetChecklist() {
    const checklist = currentChecklist();
    const session = checklistSession(checklist);
    if (!checklist || !session) return;
    const published = core.hasPublishedChecklistContributions(checklist);
    const currentCount = core.checklistEntryCount(session);
    const termCount = (checklist.sessions || []).reduce(
      (total, item) => total + core.checklistEntryCount(item),
      0
    );
    const criterionCounts = new Map((checklist.criteria || []).map(criterion => [
      criterion.id,
      (checklist.sessions || []).reduce((total, item) => total + Object.values(item.entries || {})
        .filter(learnerEntries => learnerEntries?.[criterion.id])
        .length, 0)
    ]));
    const populatedCriteria = (checklist.criteria || []).filter(criterion =>
      Number(criterionCounts.get(criterion.id) || 0) > 0
    );
    const preferredCriterionId = populatedCriteria.some(item => item.id === checklistState.gridCriterionId)
      ? checklistState.gridCriterionId
      : populatedCriteria[0]?.id || '';
    const body = `${published ? `<div class="checklist-warning">
        Published checklist contributions are still linked to official scores. Revert every Published Point History entry before clearing checklist data.
      </div>` : ''}
      <div class="checklist-reset-options">
        <label class="checklist-reset-option${published || !currentCount ? ' is-disabled' : ''}">
          <input type="radio" name="checklistResetScope" value="session" ${published || !currentCount ? 'disabled' : 'checked'}>
          <span><strong>Clear Current Session</strong><small>Remove ${currentCount} recorded entr${currentCount === 1 ? 'y' : 'ies'} from ${esc(session.date)} · ${esc(session.title)}.</small></span>
        </label>
        <label class="checklist-reset-option${published || !populatedCriteria.length ? ' is-disabled' : ''}">
          <input type="radio" name="checklistResetScope" value="criterion" ${published || !populatedCriteria.length ? 'disabled' : ''}>
          <span><strong>Clear One Criterion</strong><small>Remove one criterion from every session in this term.</small>
            <select id="checklistResetCriterion" class="field-select" ${published || !populatedCriteria.length ? 'disabled' : ''}>
              ${populatedCriteria.map(criterion => `<option value="${esc(criterion.id)}" ${criterion.id === preferredCriterionId ? 'selected' : ''}>${esc(criterion.label)} · ${esc(criterionCounts.get(criterion.id))} entries</option>`).join('')}
            </select>
          </span>
        </label>
        <label class="checklist-reset-option${published || !termCount ? ' is-disabled' : ''}">
          <input type="radio" name="checklistResetScope" value="term" ${published || !termCount ? 'disabled' : (!currentCount ? 'checked' : '')}>
          <span><strong>Clear All Term Sessions</strong><small>Remove ${termCount} recorded entr${termCount === 1 ? 'y' : 'ies'} from all ${checklist.sessions.length} Term ${esc(checklist.term)} sessions.</small></span>
        </label>
        <label class="checklist-reset-option">
          <input type="radio" name="checklistResetScope" value="picker" ${published || !termCount ? 'checked' : ''}>
          <span><strong>Reset Mini Name Picker Only</strong><small>Start a new no-repeat draw cycle. No checklist entries or grades are changed.</small></span>
        </label>
      </div>
      <div class="checklist-integrity-note">Clearing checklist data requires PIN verification and creates a local restore point first. Official assessment scores are never changed by Reset Checklist.</div>`;
    const modal = createModal(
      'Reset Performance Checklist',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-warn btn-sm" data-reset>Reset Selected</button>',
      true
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-reset]').addEventListener('click', () => {
      const scope = modal.overlay.querySelector('input[name="checklistResetScope"]:checked')?.value;
      if (!scope) {
        globalScope.toast('Choose what you want to reset.', 'warning');
        return;
      }
      modal.close();
      if (scope === 'picker') {
        ensureChecklistPicker(checklist, activeAssignment());
        checklistState.picker.reset();
        checklistState.selected = null;
        refresh();
        renderChecklistPickerModal();
        globalScope.toast('Mini Name Picker draw cycle reset.', 'success');
        return;
      }
      const criterionId = scope === 'criterion'
        ? modal.overlay.querySelector('#checklistResetCriterion')?.value || ''
        : '';
      executeChecklistDataReset(scope, session.id, criterionId);
    });
  }

  function executeChecklistDataReset(scope, sessionId, criterionId = '') {
    withPinVerification(async () => {
      if (typeof globalScope.electronAPI?.createDatabaseRestorePoint !== 'function') {
        throw new Error('A local restore point cannot be created on this device. The checklist was not reset.');
      }
      const restorePointReason = scope === 'term'
        ? 'performance-checklist-term-reset'
        : scope === 'criterion'
          ? 'performance-checklist-criterion-reset'
          : 'performance-checklist-session-reset';
      await globalScope.electronAPI.createDatabaseRestorePoint(
        restorePointReason
      );
      const result = await runTransaction(() => {
        const checklist = currentChecklist();
        if (core.hasPublishedChecklistContributions(checklist)) {
          throw new Error('Revert all published checklist points before resetting checklist entries.');
        }
        const criterion = scope === 'criterion'
          ? checklist.criteria.find(item => item.id === criterionId)
          : null;
        if (scope === 'criterion' && !criterion) {
          throw new Error('The selected criterion is no longer available.');
        }
        const sessions = scope === 'term' || scope === 'criterion'
          ? checklist.sessions
          : checklist.sessions.filter(item => item.id === sessionId);
        const changes = [];
        sessions.forEach(session => {
          Object.entries(session.entries || {}).forEach(([learnerId, learnerEntries]) => {
            Object.keys(learnerEntries || {})
              .filter(entryCriterionId => scope !== 'criterion' || entryCriterionId === criterionId)
              .forEach(entryCriterionId => changes.push({
              sessionId: session.id,
              learnerId,
              criterionId: entryCriterionId,
              value: ''
            }));
          });
        });
        const record = core.applyChecklistEntryTransaction(checklist, activeAssignment(), changes, {
          operation: scope === 'term'
            ? 'term-reset'
            : scope === 'criterion'
              ? 'criterion-clear'
              : 'session-reset',
          label: scope === 'term'
            ? 'Clear all term sessions'
            : scope === 'criterion'
              ? `Clear ${criterion.label}`
              : 'Clear current session',
          metadata: { deviceId: rootDb()?.deviceId || '' }
        });
        appendChecklistEntryHistory(record);
        return { cleared: record.changes.length, scope, criterionLabel: criterion?.label || '' };
      });
      checklistState.selected = null;
      checklistState.picker = null;
      globalScope.render();
      openPerformanceChecklistPage();
      const destination = result.scope === 'term'
        ? 'the selected term'
        : result.scope === 'criterion'
          ? `${result.criterionLabel} in the selected term`
          : 'the current session';
      globalScope.toast(
        `${result.cleared} checklist entr${result.cleared === 1 ? 'y' : 'ies'} cleared from ${destination}.`,
        'success'
      );
    });
  }

  async function adjustChecklistEntry(learnerId, criterionId, delta, sessionId = '') {
    const checklist = currentChecklist();
    const session = (checklist?.sessions || []).find(item => item.id === String(sessionId || ''))
      || checklistSession(checklist);
    const criterion = checklistCriterion(checklist, criterionId);
    const definition = core.checklistActivityDefinition(checklist, session) || criterion;
    if (!checklist || !session || !criterion || !definition) return;
    if (core.isChecklistActivityPublished(session)) {
      globalScope.toast('Unlock this published activity with your PIN before changing learner points.', 'warning');
      return;
    }
    const entry = core.checklistEntry(checklist, session.id, learnerId, criterionId);
    const currentPoints = Number(entry?.points || 0);
    const maximum = Number(definition.maxPointsPerSession || 0);
    const adjustment = Number(delta);
    if (!Number.isFinite(adjustment) || !Number.isFinite(maximum) || maximum <= 0) return;
    const nextPoints = Math.round(
      (Math.min(maximum, Math.max(0, currentPoints + adjustment)) + Number.EPSILON) * 10000
    ) / 10000;
    if (nextPoints === currentPoints) return;
    await updateChecklistEntry(learnerId, criterionId, String(nextPoints), null, session.id);
  }

  async function updateChecklistItemSelection(learnerId, criterionId, fieldset, sessionId = '') {
    const checklist = currentChecklist();
    const session = (checklist?.sessions || []).find(item => item.id === String(sessionId || '')) || checklistSession(checklist);
    if (!checklist || !session || !fieldset) return;
    const previous = core.clone(core.checklistEntry(checklist, session.id, learnerId, criterionId));
    const selectedItemIds = [...fieldset.querySelectorAll('input:checked')].map(input => input.value);
    try {
      await runTransaction(() => {
        const current = currentChecklist();
        const before = core.clone(core.checklistEntry(current, session.id, learnerId, criterionId));
        const after = core.clone(core.setChecklistItemSelection(current, activeAssignment(), session.id, learnerId, criterionId, selectedItemIds, { deviceId: rootDb()?.deviceId || '' }));
        const record = { id: `checklist-entry-change-${Date.now()}`, checklistId: current.id, assignmentId: activeAssignment().id, operation: 'entry', label: 'Checklist item selection', createdAt: new Date().toISOString(), changes: [{ sessionId:session.id, learnerId, criterionId, before, after }], status:'applied', revertedAt:'' };
        appendChecklistEntryHistory(record); return record;
      });
      checklistState.sessionId = session.id; globalScope.setView('tools'); activate('checklist');
    } catch (error) {
      const selected = new Set(previous?.selectedItemIds || []);
      fieldset.querySelectorAll('input').forEach(input => { input.checked = selected.has(input.value); });
      globalScope.toast(error.message, 'warning');
    }
  }

  async function updateChecklistEntry(learnerId, criterionId, value, input, sessionId = '') {
    const checklist = currentChecklist();
    const session = (checklist?.sessions || []).find(item => item.id === String(sessionId || ''))
      || checklistSession(checklist);
    if (!checklist || !session) return;
    const previous = core.checklistEntry(checklist, session.id, learnerId, criterionId);
    try {
      await runTransaction(() => {
        const current = currentChecklist();
        const record = core.applyChecklistEntryTransaction(current, activeAssignment(), [{
          sessionId: session.id,
          learnerId,
          criterionId,
          value
        }], {
          operation: 'entry',
          label: 'Checklist entry',
          metadata: { deviceId: rootDb()?.deviceId || '' }
        });
        appendChecklistEntryHistory(record);
        return record;
      });
      checklistState.sessionId = session.id;
      checklistState.gridCriterionId = criterionId;
      checklistState.selectedCriterionId = criterionId;
      openPerformanceChecklistPage();
      renderChecklistPickerModal();
    } catch (error) {
      if (input) {
        if (input.type === 'checkbox') input.checked = Boolean(previous);
        else input.value = previous?.points ?? '';
      }
      globalScope.toast(error.message, 'warning');
    }
  }

  function openChecklistEntryNote(learnerId, criterionId, sessionId = '') {
    const checklist = currentChecklist();
    const session = (checklist?.sessions || []).find(item => item.id === String(sessionId || ''))
      || checklistSession(checklist);
    const assignment = activeAssignment();
    const learner = (assignment?.learners || []).find(item => item.id === learnerId);
    const criterion = checklistCriterion(checklist, criterionId);
    const definition = core.checklistActivityDefinition(checklist, session) || criterion;
    const entry = core.checklistEntry(checklist, session?.id, learnerId, criterionId);
    if (!checklist || !session || !learner || !criterion || !entry || !definition?.allowNotes) return;
    if (core.isChecklistActivityPublished(session)) {
      globalScope.toast('Unlock this published activity with your PIN before editing learner notes.', 'warning');
      return;
    }
    const entrySnapshot = core.clone(entry);
    const body = `<p><strong>${esc(learnerName(learner))}</strong> · ${esc(definition.title || criterion.label)} · ${esc(entry.points)} point${entry.points === 1 ? '' : 's'}</p>
      <label><span class="field-label">Private teacher note</span><textarea id="checklistEntryNote" class="field-input checklist-note-input" maxlength="500" placeholder="Optional observation or follow-up note">${esc(entry.note || '')}</textarea></label>
      <p class="text-muted text-sm">Notes stay in the encrypted profile and are excluded from the basic CSV export.</p>`;
    const modal = createModal(
      'Checklist Learner Note',
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Note</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const note = modal.overlay.querySelector('#checklistEntryNote').value.trim();
      modal.close();
      if (note === entrySnapshot.note) return;
      try {
        await runTransaction(() => {
          const current = currentChecklist();
          if (!current || current.id !== checklist.id) {
            throw new Error('The active checklist changed while the note was open.');
          }
          const latestEntry = core.checklistEntry(current, session.id, learnerId, criterionId);
          if (JSON.stringify(latestEntry || null) !== JSON.stringify(entrySnapshot)) {
            throw new Error('This checklist entry changed while the note was open. Reopen the note to keep the newer score.');
          }
          const record = core.applyChecklistEntryTransaction(current, activeAssignment(), [{
            sessionId: session.id,
            learnerId,
            criterionId,
            value: latestEntry.points
          }], {
            operation: 'entry',
            label: 'Checklist learner note',
            metadata: { deviceId: rootDb()?.deviceId || '', note }
          });
          appendChecklistEntryHistory(record);
        });
        openPerformanceChecklistPage();
        renderChecklistPickerModal();
        globalScope.toast('Checklist note saved.', 'success');
      } catch (error) {
        globalScope.toast(error.message || 'The checklist note could not be saved.', 'warning');
      }
    });
  }

  function ensureChecklistPicker(checklist, assignment) {
    const session = checklistSession(checklist);
    const activeCriteria = core.checklistSessionCriteria(checklist, session).filter(item => item.active);
    if (!activeCriteria.some(item => item.id === checklistState.selectedCriterionId)) {
      checklistState.selectedCriterionId = activeCriteria[0]?.id || '';
    }
    const criterion = checklistCriterion(checklist);
    const learners = core.activeLearners(assignment).filter(learner =>
      checklistState.pickerFilter !== 'missing'
      || !criterion
      || !session
      || !core.checklistEntry(checklist, session.id, learner.id, criterion.id)
    );
    const signature = [
      checklistState.pickerFilter,
      checklistState.selectedCriterionId,
      session?.id || '',
      ...learners.map(item => item.id)
    ].join('|');
    if (checklistState.rosterSignature !== signature || !checklistState.picker) {
      cancelChecklistPickerAnimation();
      checklistState.rosterSignature = signature;
      checklistState.picker = core.createNamePicker(learners);
      checklistState.selected = null;
    }
    return learners;
  }

  function openChecklistPicker() {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    const session = checklistSession(checklist);
    if (!checklist || !session) return;
    if (core.isChecklistActivityPublished(session)) {
      globalScope.toast('Unlock this published activity with your PIN before awarding or clearing points.', 'warning');
      return;
    }
    const learners = ensureChecklistPicker(checklist, assignment);
    if (!learners.length || !checklist.criteria.some(item => item.active)) {
      globalScope.toast('Add an active criterion and learner before opening the mini picker.', 'warning');
      return;
    }
    cancelChecklistPickerAnimation();
    checklistPickerModal?.remove();
    const modal = createModal(
      'Performance Checklist Mini Picker',
      '<div id="checklistPickerContent"></div>',
      '<button class="btn btn-cancel btn-sm" data-close>Close</button>',
      true
    );
    checklistPickerModal = modal.overlay;
    modal.overlay.querySelector('[data-close]').addEventListener('click', () => {
      cancelChecklistPickerAnimation();
      modal.close();
      checklistPickerModal = null;
    });
    renderChecklistPickerModal();
  }

  function cancelChecklistPickerAnimation() {
    if (checklistPickerAnimationTimer) {
      clearTimeout(checklistPickerAnimationTimer);
      checklistPickerAnimationTimer = null;
    }
    checklistPickerAnimationToken++;
    checklistState.spinning = false;
    checklistState.rouletteName = '';
    checklistState.rouletteLearner = null;
  }

  function animateChecklistPickerLearner(learner) {
    const nameElement = document.getElementById('checklistPickerRouletteName');
    const avatarElement = document.getElementById('checklistPickerRouletteAvatar');
    if (!nameElement || !avatarElement || !learner) return false;
    nameElement.textContent = learnerName(learner);
    avatarElement.innerHTML = learnerAvatar(learner, 'xl');
    nameElement.classList.remove('is-ticking');
    avatarElement.classList.remove('is-ticking');
    void nameElement.offsetWidth;
    void avatarElement.offsetWidth;
    nameElement.classList.add('is-ticking');
    avatarElement.classList.add('is-ticking');
    return true;
  }

  function revealChecklistPickerSelection() {
    globalScope.requestAnimationFrame?.(() => {
      document.getElementById('checklistPickerRouletteName')?.classList.add('is-revealed');
      document.getElementById('checklistPickerRouletteAvatar')?.classList.add('is-revealed');
      if (checklistState.selected) launchSelectionConfetti('#checklistPickerRouletteAvatar');
      document.getElementById(`checklistLearner-${checklistState.selected?.id}`)?.scrollIntoView({
        block: 'center',
        behavior: globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    });
  }

  function renderChecklistPickerModal() {
    const content = checklistPickerModal?.querySelector('#checklistPickerContent');
    if (!content) return;
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    const session = checklistSession(checklist);
    const learners = ensureChecklistPicker(checklist, assignment);
    const criterion = core.checklistActivityDefinition(checklist, session) || checklistCriterion(checklist);
    const selected = checklistState.selected;
    const displayLearner = checklistState.spinning ? checklistState.rouletteLearner : selected;
    const currentEntry = selected && criterion
      ? core.checklistEntry(checklist, session.id, selected.id, criterion.id)
      : null;
    const status = checklistState.picker.status();
    content.innerHTML = `<div class="checklist-picker">
      <div class="checklist-picker__controls">
        <label><span class="field-label">Criterion to record</span><select class="field-select" onchange="TeacherTools.changeChecklistPickerCriterion(this.value)" ${checklistState.spinning ? 'disabled' : ''}>
          ${core.checklistSessionCriteria(checklist, session).filter(item => item.active).map(item => `<option value="${esc(item.id)}" ${item.id === criterion?.id ? 'selected' : ''}>${esc(item.label)} · ${esc(checklistComponentLabel(item.destinationComponent))}</option>`).join('')}
        </select></label>
        <label><span class="field-label">Picker group</span><select class="field-select" onchange="TeacherTools.changeChecklistPickerFilter(this.value)" ${checklistState.spinning ? 'disabled' : ''}>
          <option value="all" ${checklistState.pickerFilter === 'all' ? 'selected' : ''}>All active learners</option>
          <option value="missing" ${checklistState.pickerFilter === 'missing' ? 'selected' : ''}>Missing this criterion</option>
        </select></label>
      </div>
      <div class="checklist-picker__stage${checklistState.spinning ? ' is-spinning' : ''}">
        <span class="checklist-picker__status text-muted text-sm">${checklistState.spinning ? `${learners.length} eligible learners · roulette spinning` : `${status.remaining || learners.length} remaining in this draw cycle`}</span>
        <div class="checklist-picker__selection">
          <div id="checklistPickerRouletteAvatar" class="checklist-picker__avatar${displayLearner ? '' : ' is-empty'}">${learnerAvatar(displayLearner, 'xl')}</div>
          <strong id="checklistPickerRouletteName" class="checklist-picker__name${checklistState.spinning ? ' is-spinning' : ''}"
            aria-live="${checklistState.spinning ? 'off' : 'polite'}" aria-busy="${checklistState.spinning ? 'true' : 'false'}">${esc(checklistState.spinning ? checklistState.rouletteName : (selected ? learnerName(selected) : 'Ready to pick'))}</strong>
        </div>
        <span>${checklistState.spinning ? 'Slowly narrowing down the draw...' : (selected && criterion ? `${esc(criterion.label)}: ${currentEntry ? `${esc(currentEntry.points)} this session` : 'not recorded'}` : 'Selecting a learner does not award points.')}</span>
      </div>
      <div class="checklist-picker__actions">
        <button class="btn btn-primary" type="button" onclick="TeacherTools.pickChecklistName()" ${learners.length && !checklistState.spinning ? '' : 'disabled'}>${checklistState.spinning ? 'Picking...' : (selected ? 'Skip / Pick Another' : 'Pick a Learner')}</button>
        <button class="btn btn-ghost" type="button" onclick="TeacherTools.awardChecklistPickerPoints()" ${!checklistState.spinning && selected && criterion && !(criterion.scoringMode === 'CHECK' && currentEntry) && Number(currentEntry?.points || 0) < Number(criterion?.maxPointsPerSession || 0) ? '' : 'disabled'}>${criterion?.scoringMode === 'CHECK' ? `Award ${esc(criterion.pointsPerCheck)} point${criterion.pointsPerCheck === 1 ? '' : 's'}` : `Add ${esc(criterion?.pointsPerCheck || 1)} point${criterion?.pointsPerCheck === 1 ? '' : 's'}`}</button>
        <button class="btn btn-ghost" type="button" onclick="TeacherTools.clearChecklistPickerEntry()" ${!checklistState.spinning && selected && currentEntry ? '' : 'disabled'}>Clear Entry</button>
        ${criterion?.allowNotes ? `<button class="btn btn-ghost" type="button" onclick="TeacherTools.openChecklistEntryNote('${esc(selected?.id || '')}','${esc(criterion.id)}')" ${!checklistState.spinning && selected && currentEntry ? '' : 'disabled'}>${currentEntry?.note ? 'Edit Note' : 'Add Note'}</button>` : ''}
        <button class="btn btn-ghost btn-sm" type="button" onclick="TeacherTools.resetChecklistPicker()" ${checklistState.spinning ? 'disabled' : ''}>Reset Draws</button>
      </div>
    </div>`;
  }

  function changeChecklistPickerCriterion(criterionId) {
    cancelChecklistPickerAnimation();
    checklistState.selectedCriterionId = criterionId;
    checklistState.rosterSignature = '';
    renderChecklistPickerModal();
  }

  function changeChecklistPickerFilter(value) {
    cancelChecklistPickerAnimation();
    checklistState.pickerFilter = value === 'missing' ? 'missing' : 'all';
    checklistState.rosterSignature = '';
    renderChecklistPickerModal();
  }

  function pickChecklistName() {
    if (checklistState.spinning) return;
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    const learners = ensureChecklistPicker(checklist, assignment);
    if (!learners.length) return;
    const result = checklistState.picker.draw();
    checklistState.selected = result.learner;
    if (!result.learner || learners.length < 2 || globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      refresh();
      renderChecklistPickerModal();
      revealChecklistPickerSelection();
      return;
    }

    const token = ++checklistPickerAnimationToken;
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

    checklistState.spinning = true;
    checklistState.rouletteLearner = pickRouletteLearner();
    checklistState.rouletteName = learnerName(checklistState.rouletteLearner);
    renderChecklistPickerModal();

    const tick = () => {
      if (token !== checklistPickerAnimationToken || !checklistState.spinning) return;
      if (step >= totalSteps) {
        checklistPickerAnimationTimer = null;
        checklistState.spinning = false;
        checklistState.rouletteName = '';
        checklistState.rouletteLearner = null;
        refresh();
        renderChecklistPickerModal();
        revealChecklistPickerSelection();
        return;
      }
      const candidate = pickRouletteLearner();
      checklistState.rouletteLearner = candidate;
      checklistState.rouletteName = learnerName(candidate);
      if (!animateChecklistPickerLearner(candidate)) {
        cancelChecklistPickerAnimation();
        return;
      }
      step++;
      const progress = step / totalSteps;
      const delay = 35 + Math.round(progress * progress * 190);
      checklistPickerAnimationTimer = setTimeout(tick, delay);
    };
    checklistPickerAnimationTimer = setTimeout(tick, 45);
  }

  function resetChecklistPicker() {
    const checklist = currentChecklist();
    ensureChecklistPicker(checklist, activeAssignment());
    cancelChecklistPickerAnimation();
    checklistState.picker.reset();
    checklistState.selected = null;
    refresh();
    renderChecklistPickerModal();
  }

  function awardChecklistPickerPoints() {
    const checklist = currentChecklist();
    const session = checklistSession(checklist);
    const learner = checklistState.selected;
    const criterion = core.checklistActivityDefinition(checklist, session) || checklistCriterion(checklist);
    if (!checklist || !session || !learner || !criterion) return;
    const existing = core.checklistEntry(checklist, session.id, learner.id, criterion.id);
    const next = criterion.scoringMode === 'CHECK'
      ? criterion.pointsPerCheck
      : Math.min(criterion.maxPointsPerSession, Number(existing?.points || 0) + criterion.pointsPerCheck);
    updateChecklistEntry(learner.id, criterion.id, next, null);
  }

  function clearChecklistPickerEntry() {
    const checklist = currentChecklist();
    const session = checklistSession(checklist);
    const learner = checklistState.selected;
    const criterion = checklistCriterion(checklist);
    if (!checklist || !session || !learner || !criterion) return;
    updateChecklistEntry(learner.id, criterion.id, '', null);
  }

  function checklistSummaryRows(checklist, assignment) {
    const totals = core.checklistLearnerTotals(checklist, assignment);
    const activitySessions = (checklist.sessions || []).filter(session => session.activity && !session.activity.deletedAt);
    const hasLegacySessions = (checklist.sessions || []).some(session => !session.activity);
    const columns = [
      ...activitySessions.map(session => {
        const activity = core.checklistActivityDefinition(checklist, session);
        return {
          id: activity.activityId,
          label: activity.title,
          detail: `${session.date} · ${checklistComponentLabel(activity.destinationComponent)} · HPS ${activity.maxPointsPerSession}${activity.scoringMode === 'CHECK' ? ` · Items: ${(activity.checkItems || []).map(item => `${item.label} (${item.pointValue})`).join('; ')}` : ''}`,
          value: learnerId => core.checklistEntry(
            checklist,
            session.id,
            learnerId,
            activity.criterionId
          )?.points ?? ''
        };
      }),
      ...(hasLegacySessions ? (checklist.criteria || []).map(criterion => ({
        id: criterion.id,
        label: criterion.label,
        detail: `${checklistComponentLabel(criterion.destinationComponent)} · Legacy total`,
        value: learnerId => totals[learnerId]?.criteria?.[criterion.id] || 0
      })) : [])
    ];
    return core.activeLearners(assignment).map(learner => ({
      learner,
      values: columns.map(column => column.value(learner.id)),
      tracking: totals[learner.id]?.TRACKING || 0,
      ww: totals[learner.id]?.WW || 0,
      pt: totals[learner.id]?.PT || 0,
      columns
    }));
  }

  function printChecklistSummary() {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    const sheet = document.getElementById('teacherToolsPrintSheet');
    if (!checklist || !assignment || !sheet) return;
    const rows = checklistSummaryRows(checklist, assignment);
    const columns = rows[0]?.columns || [];
    sheet.innerHTML = `<h1>${esc(checklist.title)}</h1>
      <p>${esc(assignmentLabel(assignment))} · Term ${esc(checklist.term)}${checklist.mapePart ? ` · ${esc(checklist.mapePart === 'music_arts' ? 'Music & Arts' : 'PE & Health')}` : ''}</p>
      <table class="checklist-print-table"><thead><tr><th>Learner</th>
        ${columns.map(item => `<th>${esc(item.label)}<small>${esc(item.detail)}</small></th>`).join('')}
        <th>Tracking</th><th>WW</th><th>PT</th>
      </tr></thead><tbody>${rows.map(row => `<tr><td>${esc(learnerName(row.learner))}</td>
        ${row.values.map(value => `<td>${esc(value)}</td>`).join('')}
        <td>${esc(row.tracking)}</td><td>${esc(row.ww)}</td><td>${esc(row.pt)}</td>
      </tr>`).join('')}</tbody></table>
      <p class="checklist-print-note">Checklist totals are evidence records. Only contributions shown in Published Point History have been applied to official assessment scores.</p>`;
    document.body.classList.add('teacher-tools-printing');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('teacher-tools-printing');
      sheet.innerHTML = '';
    }, 100);
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  async function exportChecklistCsv() {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    if (!checklist || !assignment) return;
    const rows = checklistSummaryRows(checklist, assignment);
    const columns = rows[0]?.columns || [];
    const headings = [
      'Learner',
      ...columns.map(item => `${item.label} (${item.detail})`),
      'Tracking Total',
      'Written Work Total',
      'Performance Task Total'
    ];
    const csv = [
      headings.map(csvCell).join(','),
      ...rows.map(row => [
        learnerName(row.learner),
        ...row.values,
        row.tracking,
        row.ww,
        row.pt
      ].map(csvCell).join(','))
    ].join('\r\n');
    const filenameParts = [
      'Performance-Checklist',
      assignment.gradeLevel,
      assignment.section,
      `Term-${checklist.term}`
    ].filter(Boolean).map(value => String(value).replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-'));
    try {
      const result = await globalScope.electronAPI?.exportCsv(csv, `${filenameParts.join('-')}.csv`);
      if (result?.success) globalScope.toast('Performance checklist CSV exported.', 'success');
      else if (result?.error) globalScope.toast(`Checklist export failed: ${result.error}`, 'error');
    } catch (error) {
      globalScope.toast(error.message || 'The performance checklist could not be exported.', 'error');
    }
  }

  function matchingChecklistAssessments(assignment, checklist, component) {
    return (assignment?.assessments || []).filter(item =>
      String(item.term) === String(checklist.term)
      && String(item.component) === String(component)
      && String(item.mapePart || '') === String(checklist.mapePart || '')
    );
  }

  function checklistContributionCard(checklist, assignment, component) {
    const criteriaCount = checklist.criteria.filter(item => item.destinationComponent === component).length;
    if (!criteriaCount) return '';
    const assessments = matchingChecklistAssessments(assignment, checklist, component);
    const targetId = checklist.publicationTargets?.[component]?.assessmentId || '';
    let ready = 0;
    let blocked = 0;
    let overflow = 0;
    let state = targetId ? 'No unpublished changes' : 'Choose a target assessment';
    if (targetId) {
      try {
        const plan = core.planChecklistPublication(checklist, assignment, component, targetId);
        ready = plan.changes.length;
        blocked = plan.blocked.length;
        overflow = plan.changes.filter(item => item.overflow).length;
        state = ready
          ? `${ready} learner${ready === 1 ? '' : 's'} ready`
          : blocked
            ? `${blocked} learner${blocked === 1 ? '' : 's'} need review`
            : 'Fully up to date';
      } catch (error) {
        state = error.message;
      }
    }
    return `<section class="checklist-contribution-card" data-component="${component}">
      <div class="checklist-contribution-card__header">
        <div><strong>${esc(checklistComponentLabel(component))}</strong><span>${criteriaCount} linked ${criteriaCount === 1 ? 'criterion' : 'criteria'}</span></div>
        <span class="checklist-contribution-card__state">${esc(state)}</span>
      </div>
      ${assessments.length ? `<label><span class="field-label">Target assessment</span><select class="field-select" data-contribution-target="${component}">
        <option value="">Choose assessment…</option>
        ${assessments.map(item => `<option value="${esc(item.id)}" ${item.id === targetId ? 'selected' : ''}>${esc(item.title || item.component)} · HPS ${esc(item.maxScore || 'not set')}</option>`).join('')}
      </select></label>` : '<div class="checklist-warning">No matching assessment exists in this term and component.</div>'}
      <div class="checklist-contribution-stats">
        <span><strong>${ready}</strong> ready</span><span><strong>${blocked}</strong> excluded</span><span><strong>${overflow}</strong> at limit</span>
      </div>
      <div class="checklist-contribution-card__actions">
        <button class="btn btn-secondary btn-sm" type="button" data-save-contribution="${component}" ${assessments.length ? '' : 'disabled'}>Save Target</button>
        <button class="btn btn-primary btn-sm" type="button" data-review-contribution="${component}" ${assessments.length ? '' : 'disabled'}>Review Changes</button>
      </div>
    </section>`;
  }

  function checklistActivityContributionCard(checklist, assignment, session) {
    const activity = core.checklistActivityDefinition(checklist, session);
    if (!activity || !['WW', 'PT'].includes(activity.destinationComponent)) return '';
    const suggestions = core.checklistActivityTargetSuggestions(
      checklist,
      assignment,
      activity.activityId
    );
    const recommended = suggestions.find(item => item.recommended);
    const targetId = session.activity.publicationTarget?.assessmentId || '';
    const currentSuggestion = suggestions.find(item => item.assessmentId === targetId);
    const targetHasPublishedScores = core.isChecklistActivityPublished(session);
    const displayTargetId = targetId && (currentSuggestion?.compatible || targetHasPublishedScores)
      ? targetId
      : recommended?.assessmentId || '';
    const selectedSuggestion = suggestions.find(item => item.assessmentId === displayTargetId);
    let ready = 0;
    let blocked = 0;
    let state = displayTargetId
      ? selectedSuggestion?.recommended
        ? 'Recommended target selected'
        : 'Target selected'
      : 'No safe target available';
    if (displayTargetId && selectedSuggestion?.compatible) {
      try {
        const plan = core.planChecklistActivityPublication(
          checklist,
          assignment,
          activity.activityId,
          displayTargetId
        );
        ready = plan.changes.length;
        blocked = plan.blocked.length;
        state = ready
          ? `${ready} learner${ready === 1 ? '' : 's'} ready`
          : blocked
            ? `${blocked} learner${blocked === 1 ? '' : 's'} need review`
            : 'Fully up to date';
      } catch (error) {
        state = error.message;
      }
    }
    const overflowSuggestions = suggestions.filter(item => item.overflowLearnerIds.length);
    const selectable = Boolean(displayTargetId && selectedSuggestion?.compatible);
    const optionLabel = suggestion => {
      const hps = suggestion.configuredMax === null ? 'not set' : suggestion.configuredMax;
      const status = suggestion.recommended
        ? suggestion.requiresSetup
          ? `Recommended - empty; will become HPS ${suggestion.effectiveMax}`
          : 'Recommended - empty with matching HPS'
        : suggestion.linkedElsewhere
          ? 'Unavailable - linked to another activity'
          : suggestion.overflowLearnerIds.length
            ? `Unavailable - ${suggestion.overflowLearnerIds.length} learner${suggestion.overflowLearnerIds.length === 1 ? '' : 's'} exceed HPS`
            : suggestion.empty
              ? suggestion.requiresSetup
                ? `Empty - will become HPS ${suggestion.effectiveMax}`
                : 'Empty'
              : 'Can accept all recorded points';
      return `${suggestion.title} - HPS ${hps} - ${status}`;
    };
    const recommendation = recommended
      ? `<div class="checklist-target-recommendation">
          <strong>Recommended: ${esc(recommended.title)}</strong>
          <span>${recommended.requiresSetup
            ? `This slot is empty. Publication will rename it to ${esc(activity.title)} and set its HPS to ${esc(activity.maxPointsPerSession)}.`
            : `This assessment is empty and already matches HPS ${esc(activity.maxPointsPerSession)}.`}</span>
        </div>`
      : '<div class="checklist-warning">No assessment can safely accept all recorded points. Adjust an assessment HPS or free an unused slot in the Grading Sheet.</div>';
    const overflowWarning = overflowSuggestions.length
      ? `<div class="checklist-warning"><strong>HPS warning</strong><span>${overflowSuggestions.map(item =>
        `${esc(item.title)} would place ${item.overflowLearnerIds.length} learner${item.overflowLearnerIds.length === 1 ? '' : 's'} above HPS`
      ).join('; ')}. These targets cannot be selected.</span></div>`
      : '';
    return `<section class="checklist-contribution-card" data-activity="${esc(activity.activityId)}">
      <div class="checklist-contribution-card__header">
        <div><strong>${esc(activity.title)}</strong><span>${esc(session.date)} - ${esc(checklistComponentLabel(activity.destinationComponent))} - HPS ${esc(activity.maxPointsPerSession)}</span></div>
        <span class="checklist-contribution-card__state">${esc(state)}</span>
      </div>
      ${recommendation}
      ${suggestions.length ? `<label><span class="field-label">Official assessment</span><select class="field-select" data-activity-target="${esc(activity.activityId)}">
        <option value="">Choose assessment...</option>
        ${suggestions.map(item => `<option value="${esc(item.assessmentId)}" ${item.assessmentId === displayTargetId ? 'selected' : ''} ${item.compatible ? '' : 'disabled'}>${esc(optionLabel(item))}</option>`).join('')}
      </select></label>` : `<div class="checklist-warning">No ${esc(checklistComponentLabel(activity.destinationComponent))} assessment slot exists for this term.</div>`}
      ${overflowWarning}
      <div class="checklist-contribution-stats">
        <span><strong>${ready}</strong> ready</span><span><strong>${blocked}</strong> excluded</span>
      </div>
      <div class="checklist-contribution-card__actions">
        <button class="btn btn-ghost btn-sm" type="button" data-create-activity-assessment="${esc(activity.activityId)}">Create New Assessment</button>
        <button class="btn btn-secondary btn-sm" type="button" data-save-activity="${esc(activity.activityId)}" ${selectable ? '' : 'disabled'}>Save Target</button>
        <button class="btn btn-primary btn-sm" type="button" data-review-activity="${esc(activity.activityId)}" ${selectable ? '' : 'disabled'}>Review Changes</button>
      </div>
    </section>`;
  }

  function openGradeContributionDashboard() {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    if (!checklist || !assignment) return;
    const gradedActivities = checklist.sessions.filter(session =>
      ['WW', 'PT'].includes(session.activity?.destinationComponent)
    );
    const hasLegacySessions = checklist.sessions.some(session => !session.activity);
    const legacyComponents = hasLegacySessions
      ? ['WW', 'PT'].filter(component =>
        checklist.criteria.some(item => item.destinationComponent === component)
      )
      : [];
    const contributionCards = [
      ...gradedActivities.map(session =>
        checklistActivityContributionCard(checklist, assignment, session)
      ),
      ...legacyComponents.map(component =>
        checklistContributionCard(checklist, assignment, component)
      )
    ].filter(Boolean);
    const body = contributionCards.length
      ? `<p>Each graded activity adds its earned points to one compatible official assessment. Empty assessments are recommended first, and unsafe HPS results are blocked.</p>
        <div class="checklist-contribution-dashboard">${contributionCards.join('')}</div>
        <div class="checklist-integrity-note">Tracking Only criteria are excluded. Publication still requires valid HPS, a before-and-after preview, PIN verification, and a verified save.</div>`
      : `<div class="checklist-contribution-guide">
          <div>
            <h2>No graded activity yet</h2>
            <p>Your current activities are Tracking Only, so they are saved in the checklist but cannot change official grades.</p>
          </div>
          <ol class="checklist-contribution-steps">
            <li><strong>Edit the active activity</strong><span>Set Grade destination to Written Work or Performance Task.</span></li>
            <li><strong>Review suggested targets</strong><span>The app prioritizes empty assessments and identifies targets that have enough HPS capacity.</span></li>
            <li><strong>Record learner scores</strong><span>Enter scores in that activity's Performance Checklist column.</span></li>
            <li><strong>Review before publishing</strong><span>Return here, select a compatible assessment, review every change, and verify your PIN.</span></li>
          </ol>
          <div class="checklist-integrity-note">Changing an activity type's defaults affects future activities. Use Edit Active Activity to change the activity you already created.</div>
        </div>`;
    const actions = contributionCards.length
      ? '<button class="btn btn-cancel btn-sm" data-close>Close</button>'
      : `<button class="btn btn-cancel btn-sm" data-close>Close</button>
        ${hasLegacySessions
          ? '<button class="btn btn-primary btn-sm" data-manage-criteria>Manage Criteria</button>'
          : '<button class="btn btn-ghost btn-sm" data-add-graded-activity>Add Graded Activity</button><button class="btn btn-primary btn-sm" data-edit-graded-activity>Edit Active Activity</button>'}`;
    const modal = createModal(
      'Review Grade Contributions',
      body,
      actions,
      true
    );
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-manage-criteria]')?.addEventListener('click', () => {
      modal.close();
      openChecklistCriteria();
    });
    modal.overlay.querySelector('[data-add-graded-activity]')?.addEventListener('click', () => {
      modal.close();
      openAddChecklistActivity();
    });
    modal.overlay.querySelector('[data-edit-graded-activity]')?.addEventListener('click', () => {
      modal.close();
      openEditChecklistActivity();
    });
    const saveTargetWithFeedback = async (button, saveAction) => {
      const card = button.closest('.checklist-contribution-card');
      const state = card?.querySelector('.checklist-contribution-card__state');
      button.disabled = true;
      button.textContent = 'Saving...';
      const saved = await saveAction();
      if (!button.isConnected) return saved;
      if (!saved) {
        button.disabled = false;
        button.textContent = 'Save Target';
        return false;
      }
      button.textContent = 'Saved';
      if (state) state.textContent = 'Target saved - review changes to publish';
      return true;
    };
    modal.overlay.querySelectorAll('[data-contribution-target], [data-activity-target]').forEach(select => {
      select.addEventListener('change', () => {
        const card = select.closest('.checklist-contribution-card');
        const saveButton = card?.querySelector('[data-save-contribution], [data-save-activity]');
        const reviewButton = card?.querySelector('[data-review-contribution], [data-review-activity]');
        const state = card?.querySelector('.checklist-contribution-card__state');
        const hasTarget = Boolean(select.value);
        if (saveButton) {
          saveButton.disabled = !hasTarget;
          saveButton.textContent = 'Save Target';
        }
        if (reviewButton) reviewButton.disabled = !hasTarget;
        if (state) state.textContent = hasTarget ? 'Unsaved target selected' : 'Choose a target assessment';
      });
    });
    modal.overlay.querySelectorAll('[data-save-contribution]').forEach(button => {
      button.addEventListener('click', async () => {
        const component = button.dataset.saveContribution;
        const assessmentId = modal.overlay.querySelector(`[data-contribution-target="${component}"]`)?.value || '';
        if (!assessmentId) {
          globalScope.toast('Choose a target assessment first.', 'warning');
          return;
        }
        await saveTargetWithFeedback(button, () =>
          saveChecklistContributionTarget(component, assessmentId, false)
        );
      });
    });
    modal.overlay.querySelectorAll('[data-review-contribution]').forEach(button => {
      button.addEventListener('click', () => {
        const component = button.dataset.reviewContribution;
        const assessmentId = modal.overlay.querySelector(`[data-contribution-target="${component}"]`)?.value || '';
        if (!assessmentId) {
          globalScope.toast('Choose a target assessment first.', 'warning');
          return;
        }
        modal.close();
        saveChecklistContributionTarget(component, assessmentId, true);
      });
    });
    modal.overlay.querySelectorAll('[data-create-activity-assessment]').forEach(button => {
      button.addEventListener('click', async () => {
        const activityId = button.dataset.createActivityAssessment;
        const session = currentChecklist()?.sessions.find(item => String(item.activity?.id || item.id) === String(activityId));
        const title = globalScope.prompt('Assessment title', session?.activity?.title || session?.title || 'Checklist Activity');
        if (!title) return;
        const hps = Number(globalScope.prompt('Highest Possible Score', String(session?.activity?.maxPoints || '')));
        if (!Number.isFinite(hps) || hps <= 0) { globalScope.toast('Enter a positive HPS.', 'warning'); return; }
        try {
          const assessment = await runTransaction(() => {
            const created = core.createChecklistActivityAssessment(currentChecklist(), activeAssignment(), activityId, { title, maxScore:hps });
            core.linkChecklistActivityPublicationTarget(currentChecklist(), activeAssignment(), activityId, created.id);
            return created;
          });
          modal.close();
          globalScope.toast(assessment.title + ' created. Review learner-level changes before publishing.', 'success');
          showChecklistPublicationPreview('', assessment.id, activityId);
        } catch (error) { globalScope.toast(error.message, 'warning'); }
      });
    });
    modal.overlay.querySelectorAll('[data-save-activity]').forEach(button => {
      button.addEventListener('click', async () => {
        const activityId = button.dataset.saveActivity;
        const assessmentId = modal.overlay.querySelector(`[data-activity-target="${activityId}"]`)?.value || '';
        if (!assessmentId) {
          globalScope.toast('Choose a compatible official assessment first.', 'warning');
          return;
        }
        await saveTargetWithFeedback(button, () =>
          saveChecklistActivityTarget(activityId, assessmentId, false)
        );
      });
    });
    modal.overlay.querySelectorAll('[data-review-activity]').forEach(button => {
      button.addEventListener('click', () => {
        const activityId = button.dataset.reviewActivity;
        const assessmentId = modal.overlay.querySelector(`[data-activity-target="${activityId}"]`)?.value || '';
        if (!assessmentId) {
          globalScope.toast('Choose a compatible official assessment first.', 'warning');
          return;
        }
        modal.close();
        saveChecklistActivityTarget(activityId, assessmentId, true);
      });
    });
  }

  async function saveChecklistActivityTarget(activityId, assessmentId, reviewAfterSave) {
    try {
      const checklist = currentChecklist();
      const findActivitySession = source => source?.sessions.find(item =>
        String(item.activity?.id || item.id) === String(activityId)
      );
      const session = findActivitySession(checklist);
      const existingId = session?.activity?.publicationTarget?.assessmentId || '';
      if (existingId !== assessmentId) {
        await runTransaction(() => core.linkChecklistActivityPublicationTarget(
          currentChecklist(),
          activeAssignment(),
          activityId,
          assessmentId
        ));
      }
      const savedSession = findActivitySession(currentChecklist());
      if (savedSession?.activity?.publicationTarget?.assessmentId !== assessmentId) {
        throw new Error('The selected target could not be verified after saving.');
      }
      const criterionId = savedSession.activity.criterionId || '';
      if (reviewAfterSave) {
        showChecklistPublicationPreview('', assessmentId, activityId);
      } else {
        checklistState.sessionId = savedSession.id;
        checklistState.gridCriterionId = criterionId;
        checklistState.selectedCriterionId = criterionId;
        globalScope.toast('Target saved. Review changes when you are ready to publish.', 'success');
      }
      return true;
    } catch (error) {
      globalScope.toast(error.message || 'The activity target could not be saved.', 'warning');
      return false;
    }
  }

  async function saveChecklistContributionTarget(component, assessmentId, reviewAfterSave) {
    try {
      const checklist = currentChecklist();
      const existingId = checklist?.publicationTargets?.[component]?.assessmentId || '';
      if (existingId !== assessmentId) {
        await runTransaction(() => core.linkChecklistPublicationTarget(
          currentChecklist(),
          activeAssignment(),
          component,
          assessmentId
        ));
      }
      if (currentChecklist()?.publicationTargets?.[component]?.assessmentId !== assessmentId) {
        throw new Error('The selected target could not be verified after saving.');
      }
      if (reviewAfterSave) {
        showChecklistPublicationPreview(component, assessmentId);
      } else {
        globalScope.toast(`${checklistComponentLabel(component)} target saved. Review changes when you are ready to publish.`, 'success');
      }
      return true;
    } catch (error) {
      globalScope.toast(error.message || 'The target assessment could not be saved.', 'warning');
      return false;
    }
  }

  function reviewChecklistPublication(component) {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    if (!checklist) return;
    const assessments = matchingChecklistAssessments(assignment, checklist, component);
    if (!assessments.length) {
      globalScope.toast(`No matching ${checklistComponentLabel(component)} assessment is available in this term.`, 'warning');
      return;
    }
    const existingTarget = checklist.publicationTargets?.[component]?.assessmentId || '';
    const body = `<p>Select the existing ${esc(checklistComponentLabel(component))} assessment that will receive the unpublished checklist points.</p>
      <label><span class="field-label">Target assessment</span><select id="checklistTargetAssessment" class="field-select">
        ${assessments.map(item => `<option value="${esc(item.id)}" ${item.id === existingTarget ? 'selected' : ''}>${esc(item.title || item.component)} · HPS ${esc(item.maxScore || 'not set')}</option>`).join('')}
      </select></label>
      <div class="checklist-integrity-note">Blank official scores are excluded. Scores are capped at HPS, and the same contribution cannot be published twice.</div>`;
    const modal = createModal(
      `Review ${checklistComponentLabel(component)} Points`,
      body,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-review>Continue to Preview</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-review]').addEventListener('click', () => {
      const assessmentId = modal.overlay.querySelector('#checklistTargetAssessment').value;
      modal.close();
      showChecklistPublicationPreview(component, assessmentId);
    });
  }

  function showChecklistPublicationPreview(component, assessmentId, activityId = '') {
    const checklist = currentChecklist();
    const assignment = activeAssignment();
    let plan;
    try {
      plan = activityId
        ? core.planChecklistActivityPublication(checklist, assignment, activityId, assessmentId)
        : core.planChecklistPublication(checklist, assignment, component, assessmentId);
    } catch (error) {
      globalScope.toast(error.message, 'warning');
      return;
    }
    const learnerById = new Map((assignment.learners || []).map(item => [item.id, item]));
    const changedRows = plan.changes.map(change => `<tr>
      <td>${esc(learnerName(learnerById.get(change.learnerId)))}</td>
      <td>${change.before.present ? esc(change.before.value) : '—'}</td>
      <td>${change.requestedDelta > 0 ? '+' : ''}${esc(change.requestedDelta)}</td>
      <td>${change.after.present ? esc(change.after.value) : '—'}</td>
      <td>${change.overflow ? esc(`${change.overflow} not applied`) : '—'}</td>
    </tr>`).join('');
    const blockedRows = plan.blocked.map(item => `<li>${esc(learnerName(learnerById.get(item.learnerId)))} — ${
      item.reason === 'blank-score'
        ? 'official score is blank'
        : item.reason === 'target-score-not-blank'
          ? 'official assessment already contains a score'
        : item.reason === 'score-changed-after-publication'
          ? 'official score changed after the previous checklist publication'
          : item.reason === 'score-exceeds-hps'
            ? `resulting score ${item.projected} would exceed HPS ${item.maxScore}`
          : item.reason === 'hps-limit'
            ? 'already at HPS'
            : 'already at zero'
    }</li>`).join('');
    const assessmentSetup = plan.assessmentBefore
      && (String(plan.assessmentBefore.title) !== String(plan.assessmentAfter?.title)
        || String(plan.assessmentBefore.maxScore ?? '') !== String(plan.assessmentAfter?.maxScore ?? ''))
      ? `<div class="checklist-target-recommendation">
          <strong>Empty assessment will be prepared</strong>
          <span>${esc(plan.assessmentBefore.title || plan.assessmentTitle)} will become ${esc(plan.assessmentAfter.title)} with HPS ${esc(plan.assessmentAfter.maxScore)} when you publish.</span>
        </div>`
      : '';
    const body = `<p>${plan.activityTitle ? `<strong>${esc(plan.activityTitle)}</strong> · ` : ''}<strong>${esc(plan.assessmentTitle)}</strong> · HPS ${esc(plan.maxScore)}</p>
      ${assessmentSetup}
      ${plan.changes.length ? `<div class="checklist-preview-table-wrap"><table class="checklist-preview-table">
        <thead><tr><th>Learner</th><th>Before</th><th>Checklist change</th><th>After</th><th>Limit</th></tr></thead>
        <tbody>${changedRows}</tbody>
      </table></div>` : '<p>No eligible official score changes are ready to publish.</p>'}
      ${blockedRows ? `<div class="checklist-warning"><strong>Publication blocked</strong><ul>${blockedRows}</ul></div>` : ''}
      <p class="text-muted text-sm">PIN verification is required. Reopening this action without new entries will not add the same points again.</p>`;
    const modal = createModal(
      'Checklist Publication Preview',
      body,
      `<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-publish ${plan.canApply ? '' : 'disabled'}>Publish ${plan.changes.length} Change${plan.changes.length === 1 ? '' : 's'}</button>`,
      true
    );
    modal.overlay.classList.add('checklist-publication-preview-overlay');
    modal.overlay.querySelector('.modal')?.classList.add('checklist-publication-preview-modal');
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-publish]')?.addEventListener('click', () => {
      modal.close();
      executeChecklistPublication(plan);
    });
  }

  function executeChecklistPublication(reviewedPlan) {
    withPinVerification(async () => {
      const record = await runTransaction(() => {
        const checklist = currentChecklist();
        const official = activeAssignment();
        const applied = reviewedPlan.activityId
          ? core.applyChecklistActivityPublication(checklist, official, reviewedPlan)
          : core.applyChecklistPublication(checklist, official, reviewedPlan);
        const tools = core.normalize(profileDb());
        tools.performanceChecklistHistory = [applied, ...tools.performanceChecklistHistory]
          .slice(0, core.CHECKLIST_HISTORY_LIMIT);
        return applied;
      });
      globalScope.render();
      openPerformanceChecklistPage();
      globalScope.toast(`${record.changes.length} checklist score change${record.changes.length === 1 ? '' : 's'} published.`, 'success');
    });
  }

  function reviewChecklistPublicationRevert(entryId) {
    const tools = core.normalize(profileDb());
    const entry = tools.performanceChecklistHistory.find(item => item.id === entryId);
    const checklist = tools.performanceChecklists.find(item => item.id === entry?.checklistId);
    const assignment = (profileDb()?.assignments || []).find(item => item.id === entry?.assignmentId);
    if (!entry || !checklist || !assignment) return;
    const plan = core.planChecklistPublicationRevert(entry, checklist, assignment);
    if (!plan.canRevert) {
      globalScope.toast('This publication cannot be reverted automatically because scores or publication data changed afterward.', 'warning');
      return;
    }
    const modal = createModal(
      'Revert Checklist Publication',
      `<p>${plan.changes.length} official score change${plan.changes.length === 1 ? '' : 's'} will be restored. The checklist contribution will become unpublished again.</p>`,
      '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-warn btn-sm" data-revert>Revert Publication</button>'
    );
    modal.overlay.querySelector('[data-cancel]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-revert]').addEventListener('click', () => {
      modal.close();
      withPinVerification(async () => {
        const result = await runTransaction(() => {
          const currentTools = core.normalize(profileDb());
          const currentEntry = currentTools.performanceChecklistHistory.find(item => item.id === entryId);
          const currentChecklistRecord = currentTools.performanceChecklists.find(item => item.id === currentEntry?.checklistId);
          const currentAssignment = (profileDb().assignments || []).find(item => item.id === currentEntry?.assignmentId);
          return core.revertChecklistPublication(currentEntry, currentChecklistRecord, currentAssignment);
        });
        globalScope.render();
        openPerformanceChecklistPage();
        globalScope.toast(`${result.restored.length} checklist score change${result.restored.length === 1 ? '' : 's'} reverted.`, 'success');
      });
    });
  }

  const gameSources = {
    sudoku: 'games/sudoku/index.html', '2048': 'games/2048/index.html', minesweeper: 'games/minesweeper/index.html',
    memory: 'games/memory/index.html', reaction: 'games/reaction/index.html', 'word-scramble': 'games/word-scramble/index.html'
  };

  function renderGames(container) {
    container.innerHTML = `<div class="game-tool">
      <div class="game-tool__switcher no-print">
        <div class="tool-segmented" role="tablist" aria-label="Games">
          <button type="button" aria-selected="${activeGameId === 'sudoku'}" onclick="TeacherTools.openGame('sudoku')">Sudoku</button>
          <button type="button" aria-selected="${activeGameId === '2048'}" onclick="TeacherTools.openGame('2048')">2048</button>
          <button type="button" aria-selected="${activeGameId === 'minesweeper'}" onclick="TeacherTools.openGame('minesweeper')">Minesweeper</button>
          <button type="button" aria-selected="${activeGameId === 'memory'}" onclick="TeacherTools.openGame('memory')">Memory Match</button>
          <button type="button" aria-selected="${activeGameId === 'reaction'}" onclick="TeacherTools.openGame('reaction')">Reaction Challenge</button>
          <button type="button" aria-selected="${activeGameId === 'word-scramble'}" onclick="TeacherTools.openGame('word-scramble')">Word Scramble</button>
        </div>
      </div>
      <iframe id="teacherToolsGameFrame" class="game-frame" sandbox="allow-scripts" title="${esc(activeGameId)} game" src="${gameSources[activeGameId]}"></iframe>
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

  function getRandomizerGroups(){return {assignmentId:groupState.assignmentId,groups:core.clone(groupState.groups)};}

  function registerTool(definition) {
    if (!definition?.id || typeof definition.render !== 'function') {
      throw new TypeError('A tool id and render function are required.');
    }
    registry.set(definition.id, definition);
    renderTabs();
  }

  function renderTabs() {
    const tabs = document.getElementById('teacherToolsTabs');
    if (tabs) tabs.innerHTML = '';
  }

  function usageCounts() { return core.normalize(profileDb()).toolUsageCounts; }
  function workspaceMotionStyle() {
    return core.normalize(profileDb()).appearancePreferences.workspaceMotionStyle || 'standard';
  }
  function applyWorkspaceMotionStyle() {
    const style = workspaceMotionStyle();
    document.getElementById('teacherToolsView')?.setAttribute('data-motion-style', style);
    document.getElementById('performanceChecklistContent')?.setAttribute('data-motion-style', style);
  }
  async function setWorkspaceMotionStyle(value) {
    const style = ['calm', 'standard', 'playful'].includes(String(value)) ? String(value) : 'standard';
    core.normalize(profileDb()).appearancePreferences.workspaceMotionStyle = style;
    applyWorkspaceMotionStyle();
    await globalScope.saveDatabase?.();
  }
  function renderLauncher() {
    const content = document.getElementById('teacherToolsContent');
    if (!content) return;
    content.dataset.activeTool = 'launcher';
    applyWorkspaceMotionStyle();
    const counts = usageCounts();
    const tools = Array.from(registry.values()).filter(tool => tool.showInLauncher !== false);
    content.innerHTML = `<section class="teacher-tools-launcher"><header class="teacher-tools-launcher__hero"><div><h2>Choose a classroom tool</h2><p>Everything you need for fair participation, classroom routines, records, and learner-friendly activities.</p></div><div class="teacher-tools-launcher__controls"><strong>${tools.length} tools</strong><label>Motion <select aria-label="Workspace motion style" onchange="TeacherTools.setWorkspaceMotionStyle(this.value)"><option value="calm" ${workspaceMotionStyle() === 'calm' ? 'selected' : ''}>Calm</option><option value="standard" ${workspaceMotionStyle() === 'standard' ? 'selected' : ''}>Standard</option><option value="playful" ${workspaceMotionStyle() === 'playful' ? 'selected' : ''}>Playful</option></select></label></div></header><div class="teacher-tools-grid">${tools.map(tool => `<button class="teacher-tool-card" type="button" style="--card-accent:${TOOL_ACCENTS[tool.id] || '#06b6d4'}" onclick="TeacherTools.openTool('${esc(tool.id)}')"><span class="teacher-tool-card__icon" aria-hidden="true">${icons[tool.id] || tool.launchIcon || '★'}</span><span class="teacher-tool-card__copy"><strong>${esc(tool.label)}</strong><small>${esc(tool.description || TOOL_DESCRIPTIONS[tool.id] || '')}</small></span><span class="teacher-tool-card__count">Used ${Number(counts[tool.id] || 0)} time${Number(counts[tool.id] || 0) === 1 ? '' : 's'}</span></button>`).join('')}</div></section>`;
  }
  function showLauncher() {
    registry.get(activeToolId)?.onDeactivate?.();
    activeToolId = '';
    renderLauncher();
  }
  function activate(toolId, containerOverride = null) {
    const next = registry.get(toolId);
    if (!next) return;
    const current = registry.get(activeToolId);
    if (current && current !== next) current.onDeactivate?.();
    activeToolId = toolId;
    const content = containerOverride || document.getElementById('teacherToolsContent');
    if (content) {
      content.dataset.activeTool = toolId;
      applyWorkspaceMotionStyle();
      next.render(content);
      if (!containerOverride && toolId !== 'checklist') content.insertAdjacentHTML('afterbegin', `<div class="teacher-tool-pagebar no-print"><button class="btn btn-ghost btn-sm teacher-tools-back" type="button" onclick="TeacherTools.showLauncher()"><span class="teacher-tools-back__icon" aria-hidden="true">←</span><span>All Tools</span></button><strong>${esc(next.label)}</strong><span class="teacher-tool-pagebar__count">Used ${Number(usageCounts()[toolId] || 0)} times</span></div>`);
    }
    next.onActivate?.();
  }
  async function openTool(toolId) {
    if (!registry.get(toolId)) return;
    const counts = usageCounts(); counts[toolId] = Number(counts[toolId] || 0) + 1;
    await globalScope.saveDatabase?.();
    activate(toolId);
  }
  function renderDedicatedChecklist() {
    const content = document.getElementById('performanceChecklistContent');
    if (content) activate('checklist', content);
  }
  function openPerformanceChecklistPage() {
    activeToolId = 'checklist';
    globalScope.setView('performance-checklist');
  }

  function refresh() {
    const view = globalScope.getRuntimeNavigationState?.().currentView;
    if (view === 'performance-checklist') return renderDedicatedChecklist();
    if (view !== 'tools') return;
    if (activeToolId) activate(activeToolId); else renderLauncher();
  }

  function disposeActiveTool() {
    registry.get(activeToolId)?.onDeactivate?.();
  }

  function updateToolsNav(view) {
    const navTools = document.getElementById('navTools');
    if (navTools) navTools.classList.toggle('nav-btn--active', view === 'tools');
    const navChecklist = document.getElementById('navPerformanceChecklist');
    if (navChecklist) navChecklist.classList.toggle('nav-btn--active', view === 'performance-checklist');
    if (view === 'tools' || view === 'performance-checklist') {
      const activeButton = view === 'tools' ? navTools : navChecklist;
      document.querySelectorAll('.nav-btn.nav-btn--active').forEach(button => {
        if (button !== activeButton) button.classList.remove('nav-btn--active');
      });
    }
  }

  function init() {
    if (initialized || !core) return;
    initialized = true;
    core.normalize(profileDb());
    registerTool({ id: 'picker', label: 'Name Picker', render: renderNamePicker, onDeactivate: cancelPickerAnimation });
    registerTool({ id: 'groups', label: 'Group Randomizer', render: renderGroupRandomizer, onDeactivate: cancelGroupAnimation });
    registerTool({ id: 'simulator', label: 'Grade Simulator', render: renderGradeSimulator });
    registerTool({
      id: 'checklist',
      label: 'Performance Checklist',
      render: renderPerformanceChecklist,
      showInLauncher: false,
      onDeactivate: () => {
        cancelChecklistPickerAnimation();
        checklistPickerModal?.remove();
        checklistPickerModal = null;
      }
    });
    registerTool({ id: 'games', label: 'Games', render: renderGames, onDeactivate: disposeGame });

    baseSetView = globalScope.setView;
    baseSelectAssignment = globalScope.selectAssignment;
    globalScope.selectAssignment = selectAssignmentFromElsewhere;
    globalScope.setView = function setViewWithTools(view) {
      const result = baseSetView(view);
      updateToolsNav(view);
      if (view === 'tools') showLauncher();
      else if (view === 'performance-checklist') setTimeout(renderDedicatedChecklist, 0);
      else disposeActiveTool();
      return result;
    };

    baseRender = globalScope.render;
    globalScope.render = function renderWithTools() {
      const result = baseRender();
      if (['tools', 'performance-checklist'].includes(globalScope.getRuntimeNavigationState?.().currentView)) setTimeout(refresh, 0);
      return result;
    };

    globalScope.addEventListener('message', handleGameMessage);
    renderTabs();
  }

  const api = {
    init,
    registerTool,
    activate,
    openTool,
    showLauncher,
    setWorkspaceMotionStyle,
    openPerformanceChecklistPage,
    refresh,
    disposeActiveTool,
    handleActiveClassChange,
    setGroupCount,
    setGroupMode,
    randomizeGroups: runGroupRandomizer,
    revealGroupsNow,
    launchSelectionConfetti,
    copyGroups,
    printGroups,
    pickName,
    resetPicker,
    changeSimulatorTerm,
    updateSimulationScore,
    resetSimulation,
    reviewSimulationApply,
    reviewSimulationRevert,
    changeChecklistTerm,
    changeChecklistMapePart,
    changeChecklistSession,
    startTodayChecklistSession,
    quickStartChecklist,
    changeChecklistGridCriterion,
    filterChecklistRows,
    changeChecklistFilter,
    handleChecklistCellKey,
    openChecklistBulkMark,
    undoLastChecklistEntryChange,
    openCreateChecklist,
    openChecklistCriteria,
    openAddChecklistCriterion,
    openAddChecklistSession,
    openAddChecklistActivity,
    openEditChecklistActivity,
    reviewChecklistActivityUnlock,
    openChecklistMoreActions,
    openChecklistTutorial,
    openSaveChecklistTemplate,
    openManageChecklistTemplates,
    openResetChecklist,
    adjustChecklistEntry,
    updateChecklistEntry,
    updateChecklistItemSelection,
    duplicateChecklistActivity,
    deleteChecklistActivity,
    restoreChecklistActivity,
    openChecklistEntryNote,
    openChecklistPicker,
    changeChecklistPickerCriterion,
    changeChecklistPickerFilter,
    pickChecklistName,
    resetChecklistPicker,
    awardChecklistPickerPoints,
    clearChecklistPickerEntry,
    printChecklistSummary,
    exportChecklistCsv,
    openGradeContributionDashboard,
    reviewChecklistPublication,
    reviewChecklistPublicationRevert,
    openGame
  };

  globalScope.TeacherTools = api;
  globalScope.initTeacherTools = init;
})(window);
