(function initTeacherToolsParticipation(globalScope) {
  'use strict';

  const core = globalScope.TeacherToolsCore;
  const pickerThemes = {
    'carnival-wheel': 'Carnival Prize Wheel',
    'wheel-of-learners': 'Wheel of Learners'
  };
  const groupThemes = {
    'draft-arena': 'Team Draft Arena', 'space-crew': 'Space Crew Launch',
    'island-expedition': 'Island Expedition', 'house-sorting': 'House Sorting Ceremony',
    'puzzle-party': 'Puzzle Party'
  };
  const state = { assignmentId: '', mode: 'random', removePicked: true, term: '', includeAbsent: false, selected: null, remaining: new Map(), history: new Map() };

  function database() { return globalScope.getActiveProfileDatabase?.(); }
  function assignment() {
    const db = database();
    return (db?.assignments || []).find(item => item.id === db.currentAssignmentId) || null;
  }
  function tools() { return core.normalize(database()); }
  function learnerName(learner) {
    return globalScope.learnerDisplayName?.(learner)
      || [learner?.lastName ? `${learner.lastName},` : '', learner?.firstName, learner?.middleName].filter(Boolean).join(' ');
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  }
  function term() { return state.term || String(database()?.currentTerm || '1'); }
  function totals() { return core.participationStarTotals(tools().participationStarEvents, assignment()?.id, term()); }
  function eligible() {
    let learners = core.activeLearners(assignment());
    if (!state.includeAbsent && typeof globalScope.attendanceRollCallStatus === 'function') {
      learners = learners.filter(item => globalScope.attendanceRollCallStatus(item.id) !== 'absent');
    }
    const starTotals = totals();
    if (state.mode === 'no-stars') learners = learners.filter(item => !starTotals[item.id]);
    if (state.mode === 'least-stars' && learners.length) {
      const minimum = Math.min(...learners.map(item => starTotals[item.id] || 0));
      learners = learners.filter(item => (starTotals[item.id] || 0) === minimum);
    }
    return learners;
  }
  function theme(tool) {
    const preferences = tools().appearancePreferences;
    return tool === 'groups' ? preferences.groupRandomizerTheme : preferences.namePickerTheme;
  }
  function themeOptions(tool, selected) {
    const themes = tool === 'groups' ? groupThemes : pickerThemes;
    return Object.entries(themes).map(([value, label]) =>
      `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }
  async function persist() {
    const saved = await globalScope.saveDatabase();
    if (saved === false) throw new Error('The change could not be saved.');
  }
  async function setTheme(tool, value, both) {
    globalScope.TeacherToolExperiences?.cancelPicker?.();
    const preferences = tools().appearancePreferences;
    if (tool === 'groups' || both) preferences.groupRandomizerTheme = value;
    if (tool === 'picker' || both) preferences.namePickerTheme = value;
    await persist();
    globalScope.TeacherTools?.refresh();
  }
  function addThemeControl(tool, host) {
    if (!host || host.querySelector('[data-theme-control]')) return;
    const selected = theme(tool);
    const wrapper = document.createElement('div');
    wrapper.className = 'field tool-theme-control';
    wrapper.dataset.themeControl = tool;
    wrapper.innerHTML = `<label class="field-label">Experience</label><div class="tool-theme-control__row"><select class="field-select">${themeOptions(tool, selected)}</select></div>`;
    const select = wrapper.querySelector('select');
    select.addEventListener('change', () => setTheme(tool, select.value, false).catch(error => globalScope.toast(error.message, 'error')));
    host.insertBefore(wrapper, host.querySelector('.tool-control-strip__actions'));
  }
  function applyTheme(tool, root) {
    if (!root) return;
    if (!root.classList.contains('tool-theme')) root.classList.add('tool-theme');
    const selected = theme(tool);
    if (root.dataset.toolTheme !== selected) root.dataset.toolTheme = selected;
  }
  function pickerKey() { return `${assignment()?.id || ''}|${term()}`; }
  function draw() {
    const learners = eligible();
    if (!learners.length) return globalScope.toast('No eligible learners match this picker mode.', 'warning');
    let candidates = learners;
    if (state.removePicked) {
      const key = pickerKey();
      let remaining = state.remaining.get(key) || [];
      const eligibleIds = new Set(learners.map(item => item.id));
      remaining = remaining.filter(id => eligibleIds.has(id));
      if (!remaining.length) {
        remaining = core.shuffle(learners).map(item => item.id);
        document.querySelectorAll('.is-removed-from-pool').forEach(node => node.classList.remove('is-removed-from-pool'));
      }
      const id = remaining.shift();
      state.remaining.set(key, remaining);
      candidates = learners.filter(item => item.id === id);
    }
    const selected = candidates[core.secureRandomInt(candidates.length)];
    const root = document.getElementById('namePickerRouletteName')?.closest('.teacher-tool');
    const complete = () => {
      const key = pickerKey();
      const history = state.history.get(key) || [];
      history.unshift({ learnerId: selected.id, name: learnerName(selected), pickedAt: new Date().toISOString() });
      state.history.set(key, history.slice(0, 30));
      if (state.removePicked) {
        root?.querySelectorAll(`[data-carnival-learner="${CSS.escape(String(selected.id))}"],[data-roster-learner="${CSS.escape(String(selected.id))}"]`)
          .forEach(node => node.classList.add('is-removed-from-pool'));
      }
      state.selected = selected;
      const name = document.getElementById('namePickerRouletteName');
      const avatar = document.getElementById('namePickerRouletteAvatar');
      if (name) { name.textContent = learnerName(selected); name.classList.add('is-revealed'); }
      if (avatar) {
        avatar.innerHTML = globalScope.LearnerAvatars?.renderLearner(selected, { size: 'xl' }) || '';
        avatar.classList.remove('is-empty'); avatar.classList.add('is-revealed');
      }
      renderParticipation();
    };
    const remainingIds = new Set(state.remaining.get(pickerKey()) || []);
    const animationLearners = state.removePicked
      ? learners.filter(item => item.id === selected.id || remainingIds.has(item.id))
      : learners;
    if (globalScope.TeacherToolExperiences?.animatePicker?.({ root, learners: animationLearners, selected, onComplete: complete })) return;
    complete();
    globalScope.TeacherTools?.launchSelectionConfetti?.('#namePickerRouletteAvatar');
  }
  function pickerToolbar(stage) {
    if (!stage || stage.previousElementSibling?.classList.contains('picker-toolbar')) return;
    const bar = document.createElement('div');
    bar.className = 'picker-toolbar name-picker-reference-controls no-print';
    bar.innerHTML = `<div class="field tool-theme-control" data-theme-control="picker"><label class="field-label">Experience</label><div class="tool-theme-control__row"><select class="field-select">${themeOptions('picker', theme('picker'))}</select></div></div><div class="field"><label class="field-label">Term</label><select data-picker-term class="field-select">${['1','2','3'].map(value => `<option value="${value}" ${value === term() ? 'selected' : ''}>Term ${value}</option>`).join('')}</select></div><div class="field"><label class="field-label">Picker method</label><select data-picker-mode class="field-select"><option value="random">Random</option><option value="least-stars">Least Stars First</option><option value="no-stars">No Stars Yet</option></select></div><div class="field"><label class="field-label">After pick</label><select data-picker-pool class="field-select"><option value="remove">Remove from pool</option><option value="retain">Retain in pool</option></select></div><label class="picker-attendance-filter"><input data-include-absent type="checkbox" ${state.includeAbsent ? 'checked' : ''}> Include absent learners</label>`;
    bar.querySelector('[data-picker-mode]').value = state.mode;
    bar.querySelector('[data-picker-pool]').value = state.removePicked ? 'remove' : 'retain';
    const themeSelect = bar.querySelector('[data-theme-control] select');
    themeSelect.addEventListener('change', () => setTheme('picker', themeSelect.value, false).catch(error => globalScope.toast(error.message, 'error')));
    bar.querySelector('[data-picker-term]').addEventListener('change', event => { state.term = event.target.value; state.selected = null; globalScope.TeacherTools?.refresh(); });
    bar.querySelector('[data-picker-mode]').addEventListener('change', event => { state.mode = event.target.value; state.selected = null; globalScope.TeacherTools?.refresh(); });
    bar.querySelector('[data-picker-pool]').addEventListener('change', event => {
      state.removePicked = event.target.value === 'remove';
      state.remaining.delete(pickerKey());
      state.selected = null;
      document.querySelectorAll('.is-removed-from-pool').forEach(node => node.classList.remove('is-removed-from-pool'));
      globalScope.TeacherTools?.refresh();
    });
    bar.querySelector('[data-include-absent]').addEventListener('change', event => { state.includeAbsent = event.target.checked; state.selected = null; globalScope.TeacherTools?.refresh(); });
    const classSelector = stage.closest('.teacher-tool')?.querySelector('.teacher-tool__class-bar .record-class-selector');
    if (classSelector) {
      classSelector.classList.add('name-picker-active-class');
      bar.prepend(classSelector);
      const classBar = stage.closest('.teacher-tool')?.querySelector('.teacher-tool__class-bar');
      if (classBar && !classBar.children.length) classBar.remove();
    }
    stage.before(bar);
  }
  function historyMarkup() {
    const history = state.history.get(pickerKey()) || [];
    if (!history.length) return '<li class="picker-history__empty">No learners picked in this session yet.</li>';
    return history.map((item, index) => {
      const time = new Date(item.pickedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
      return `<li><span class="picker-history__number">${history.length - index}</span><span title="${esc(item.name)}">${esc(item.name)}</span><time datetime="${esc(item.pickedAt)}">${esc(time)}</time></li>`;
    }).join('');
  }
  function rankedLearners() {
    const starTotals = totals();
    return core.activeLearners(assignment())
      .sort((a, b) => (starTotals[b.id] || 0) - (starTotals[a.id] || 0) || learnerName(a).localeCompare(learnerName(b)))
      .map(item => ({ item, stars: starTotals[item.id] || 0 }));
  }
  function standingsMarkup() {
    return rankedLearners().map(({ item, stars }, index) => {
      const avatar = globalScope.LearnerAvatars?.renderLearner
        ? globalScope.LearnerAvatars.renderLearner(item, { size: 'xs', showName: false })
        : `<span class="picker-standing-avatar-fallback">${esc((item.firstName || item.lastName || '?').slice(0, 1))}</span>`;
      return `<li data-star-learner="${esc(item.id)}"><span class="picker-standing-rank">${index + 1}</span><span class="picker-standing-avatar">${avatar}</span><span class="picker-standing-name" title="${esc(learnerName(item))}">${esc(learnerName(item))}</span><strong><span aria-hidden="true">★</span> ${stars}</strong></li>`;
    }).join('');
  }
  function presentationStandingsMarkup() {
    return rankedLearners().slice(0, 8).map(({ item, stars }, index) =>
      `<li class="${index === 0 ? 'is-top-learner' : ''}" data-star-learner="${esc(item.id)}"><span class="presentation-star-leaderboard__rank">${index + 1}</span><span class="presentation-star-leaderboard__name">${esc(learnerName(item))}</span><strong>${stars} ★</strong></li>`
    ).join('');
  }
  function presentationHistoryMarkup() {
    const history = state.history.get(pickerKey()) || [];
    if (!history.length) return '<li class="presentation-picking-history__empty">No picks yet.</li>';
    return history.slice(0, 5).map((item, index) => {
      const time = new Date(item.pickedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
      return `<li><span class="presentation-picking-history__number">${history.length - index}</span><span class="presentation-picking-history__name" title="${esc(item.name)}">${esc(item.name)}</span><time datetime="${esc(item.pickedAt)}">${esc(time)}</time></li>`;
    }).join('');
  }
  function animateStarChange(panel, change) {
    if (!change?.learnerId) return;
    globalScope.requestAnimationFrame?.(() => {
      const row = [...panel.querySelectorAll('[data-star-learner]')]
        .find(item => item.dataset.starLearner === String(change.learnerId));
      if (!row) return;
      row.classList.add(change.direction === 'down' ? 'star-change-down' : 'star-change-up');
      const rect = row.getBoundingClientRect();
      const spark = document.createElement('span');
      spark.className = 'picker-star-spark';
      spark.textContent = change.direction === 'down' ? '☆' : '★';
      spark.style.left = `${rect.right - 20}px`;
      spark.style.top = `${rect.top + 8}px`;
      document.body.appendChild(spark);
      setTimeout(() => spark.remove(), 900);
    });
  }
  function renderParticipation(change = null) {
    const stage = document.querySelector('#namePickerRouletteName')?.closest('.name-picker-stage');
    if (!stage) return;
    let actions = stage.querySelector('.picker-star-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'picker-star-actions';
      stage.querySelector('.name-picker-stage__content')?.appendChild(actions);
    }
    let actionDock = stage.querySelector('.name-picker-action-dock');
    if (!actionDock) {
      actionDock = document.createElement('div');
      actionDock.className = 'name-picker-action-dock';
      stage.querySelector('.name-picker-stage__selection')?.after(actionDock);
    }
    const primaryActions = stage.querySelector('.name-picker-stage__actions');
    if (primaryActions && primaryActions.parentElement !== actionDock) actionDock.appendChild(primaryActions);
    if (actions.parentElement !== actionDock) actionDock.appendChild(actions);
    const selectedTotal = state.selected ? (totals()[state.selected.id] || 0) : 0;
    let presentationLeaderboard = stage.querySelector('.presentation-star-leaderboard');
    if (!presentationLeaderboard) {
      presentationLeaderboard = document.createElement('aside');
      presentationLeaderboard.className = 'presentation-star-leaderboard';
      stage.appendChild(presentationLeaderboard);
    }
    presentationLeaderboard.innerHTML = `<header class="presentation-star-leaderboard__header"><span>Term ${term()}</span><h2>Class activity</h2></header><div class="presentation-star-leaderboard__cards"><section class="presentation-panel-card presentation-leaderboard-card" aria-labelledby="presentationLeaderboardTitle"><div class="presentation-panel-card__header"><h3 id="presentationLeaderboardTitle">Star leaderboard</h3><span>Top 8</span></div><ol>${presentationStandingsMarkup()}</ol></section><section class="presentation-panel-card presentation-picking-history" aria-labelledby="presentationHistoryTitle"><div class="presentation-panel-card__header"><h3 id="presentationHistoryTitle">Picking history</h3><span>Recent 5</span></div><ol>${presentationHistoryMarkup()}</ol></section></div>`;
    actions.innerHTML = state.selected
      ? `<strong>Term stars: ${selectedTotal}</strong><button class="btn btn-primary btn-sm" data-award-star>Add Star</button><button class="btn btn-ghost btn-sm" data-undo-star>Undo Last Star</button>`
      : '<span>Select a learner to award a participation star.</span>';
    actions.querySelector('[data-award-star]')?.addEventListener('click', async () => {
      const learnerId = state.selected.id;
      core.awardParticipationStar(tools(), assignment().id, term(), learnerId, { source: 'name-picker' });
      await persist();
      globalScope.toast('Participation star awarded.', 'success');
      renderParticipation({ learnerId, direction: 'up' });
    });
    actions.querySelector('[data-undo-star]')?.addEventListener('click', async () => {
      const reversed = core.undoLastParticipationStar(tools(), assignment().id, term());
      if (!reversed) return globalScope.toast('There is no star to undo.', 'warning');
      await persist();
      globalScope.toast('Last participation star undone.', 'success');
      renderParticipation({ learnerId: reversed.learnerId, direction: 'down' });
    });
    let panel = stage.nextElementSibling;
    if (!panel?.classList.contains('picker-star-leaderboard')) {
      panel = document.createElement('aside');
      panel.className = 'picker-star-leaderboard';
      stage.after(panel);
    }
    panel.innerHTML = `<div class="picker-star-leaderboard__header"><div><h2>Star leaderboard</h2><span>Term ${term()} · Shared with Participation Tracker</span></div></div><ol class="picker-standings-list">${standingsMarkup()}</ol><section class="picker-history" aria-labelledby="pickerHistoryTitle"><div class="picker-history__header"><h3 id="pickerHistoryTitle">Picking history</h3><span>Current session</span></div><ol>${historyMarkup()}</ol></section><div class="picker-star-leaderboard__actions"><button type="button" class="btn btn-ghost btn-sm" data-export-stars>Export CSV</button><button type="button" class="btn btn-warn btn-sm" data-reset-stars>Reset Term Stars</button></div>`;
    let workspace = stage.parentElement?.classList.contains('name-picker-workspace') ? stage.parentElement : null;
    if (!workspace) {
      workspace = document.createElement('div');
      workspace.className = 'name-picker-workspace';
      stage.before(workspace);
      workspace.append(stage, panel);
    }
    panel.querySelector('[data-export-stars]').addEventListener('click', exportCsv);
    panel.querySelector('[data-reset-stars]').addEventListener('click', resetTerm);
    animateStarChange(panel, change);
  }
  async function exportCsv() {
    const starTotals = totals();
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['Learner ID','Learner','Class','Term','Stars'], ...core.activeLearners(assignment()).map(item => [item.id, learnerName(item), core.assignmentLabel(assignment()), term(), starTotals[item.id] || 0])];
    const result = await globalScope.electronAPI?.exportCsv(rows.map(row => row.map(quote).join(',')).join('\r\n'), `Participation-Stars-Term-${term()}.csv`);
    if (result?.success) globalScope.toast('Star leaderboard exported.', 'success');
  }
  function resetTerm() {
    const currentAssignment = assignment();
    const currentTerm = term();
    if (!currentAssignment) return globalScope.toast('Choose a class before resetting term stars.', 'warning');
    const active = Object.values(core.participationStarTotals(tools().participationStarEvents, currentAssignment.id, currentTerm))
      .reduce((sum, count) => sum + count, 0);
    if (!active) return globalScope.toast(`There are no active Term ${currentTerm} stars to reset.`, 'info');
    const phrase = `RESET TERM ${currentTerm}`;
    globalScope.confirmModal(
      'Reset Term Stars',
      `Reset ${active} active star${active === 1 ? '' : 's'} for ${core.assignmentLabel(currentAssignment)}, Term ${currentTerm}? This action is recorded and cannot be undone with Undo Last Star.`,
      () => globalScope.promptPinVerification(async () => {
        try {
          const resetCount = core.resetParticipationStars(tools(), currentAssignment.id, currentTerm, phrase);
          await persist();
          state.selected = null;
          globalScope.toast(`${resetCount} Term ${currentTerm} star${resetCount === 1 ? '' : 's'} reset.`, 'success');
          renderParticipation();
        } catch (error) {
          console.error('Could not reset participation stars:', error);
          globalScope.toast(error.message || 'Term stars could not be reset.', 'error');
        }
      })
    );
  }
  function enhancePickerPagebar() {
    const pagebar = document.querySelector('#teacherToolsContent[data-active-tool="picker"] > .teacher-tool-pagebar');
    if (!pagebar || pagebar.classList.contains('name-picker-reference-header')) return;
    const usage = pagebar.querySelector('.teacher-tool-pagebar__count')?.textContent?.trim() || 'Used 0 times';
    pagebar.classList.add('name-picker-reference-header');
    pagebar.innerHTML = `<button class="btn btn-ghost btn-sm teacher-tools-back" type="button" onclick="TeacherTools.showLauncher()"><span class="teacher-tools-back__icon" aria-hidden="true">←</span><span>Back to Tools</span></button><span class="name-picker-reference-header__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M8 7.5h8l1.2 3.2v7.8H6.8v-7.8L8 7.5Zm2-3h4v3h-4v-3Zm-1 8h6m-4 3h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="name-picker-reference-header__copy"><strong>Name Picker</strong><small>Pick a learner at random and keep participation fun and fair.</small></span><span class="teacher-tool-pagebar__count">${esc(usage)}</span>`;
  }
  function augment() {
    const groupRoot = document.getElementById('groupRandomizerCount')?.closest('.teacher-tool');
    if (groupRoot) { applyTheme('groups', groupRoot); addThemeControl('groups', groupRoot.querySelector('.tool-control-strip')); globalScope.TeacherToolExperiences?.enhanceGroups?.(groupRoot); }
    const pickerRoot = document.getElementById('namePickerRouletteName')?.closest('.teacher-tool');
    if (pickerRoot) enhancePickerPagebar();
    if (pickerRoot && !pickerRoot.dataset.participationAugmented) {
      pickerRoot.dataset.participationAugmented = 'true';
      if (state.assignmentId !== assignment()?.id) { state.assignmentId = assignment()?.id || ''; state.selected = null; }
      applyTheme('picker', pickerRoot);
      const stage = pickerRoot.querySelector('.name-picker-stage'); pickerToolbar(stage); globalScope.TeacherToolExperiences?.enhancePicker?.(pickerRoot, eligible()); renderParticipation();
      const pickButton = stage?.querySelector('.btn-primary.btn-lg');
      if (pickButton && !pickButton.dataset.participationBound) {
        pickButton.dataset.participationBound = 'true'; pickButton.removeAttribute('onclick'); pickButton.addEventListener('click', draw);
      }
      const resetButton = [...(stage?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Reset Draws');
      if (resetButton) { resetButton.removeAttribute('onclick'); resetButton.addEventListener('click', () => { state.remaining.delete(pickerKey()); state.history.delete(pickerKey()); state.selected = null; pickerRoot.querySelectorAll('.is-removed-from-pool').forEach(node => node.classList.remove('is-removed-from-pool')); renderParticipation(); }); }
    }
  }
  const observer = new MutationObserver(() => globalScope.requestAnimationFrame?.(augment));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  globalScope.addEventListener('DOMContentLoaded', augment);
})(window);
