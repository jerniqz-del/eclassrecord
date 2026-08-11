(function initTeacherToolsParticipation(globalScope) {
  'use strict';

  const core = globalScope.TeacherToolsCore;
  const themes = {
    classic: 'Classic', chalkboard: 'Chalkboard', ocean: 'Ocean', space: 'Space',
    fiesta: 'Fiesta', 'high-contrast': 'Minimal / High Contrast'
  };
  const state = { assignmentId: '', mode: 'no-repeat', term: '', includeAbsent: false, selected: null, remaining: new Map() };

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
  function themeOptions(selected) {
    return Object.entries(themes).map(([value, label]) =>
      `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }
  async function persist() {
    const saved = await globalScope.saveDatabase();
    if (saved === false) throw new Error('The change could not be saved.');
  }
  async function setTheme(tool, value, both) {
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
    wrapper.innerHTML = `<label class="field-label">Theme</label><div class="tool-theme-control__row"><span class="tool-theme-preview" data-tool-theme="${selected}" aria-hidden="true"></span><select class="field-select">${themeOptions(selected)}</select></div><label class="tool-theme-control__both"><input type="checkbox"> Use for both tools</label>`;
    const select = wrapper.querySelector('select');
    const both = wrapper.querySelector('input');
    select.addEventListener('change', () => setTheme(tool, select.value, both.checked).catch(error => globalScope.toast(error.message, 'error')));
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
    if (state.mode === 'no-repeat') {
      const key = pickerKey();
      let remaining = state.remaining.get(key) || [];
      const eligibleIds = new Set(learners.map(item => item.id));
      remaining = remaining.filter(id => eligibleIds.has(id));
      if (!remaining.length) remaining = core.shuffle(learners).map(item => item.id);
      const id = remaining.shift();
      state.remaining.set(key, remaining);
      candidates = learners.filter(item => item.id === id);
    }
    state.selected = candidates[core.secureRandomInt(candidates.length)];
    const name = document.getElementById('namePickerRouletteName');
    const avatar = document.getElementById('namePickerRouletteAvatar');
    if (name) { name.textContent = learnerName(state.selected); name.classList.add('is-revealed'); }
    if (avatar) {
      avatar.innerHTML = globalScope.LearnerAvatars?.renderLearner(state.selected, { size: 'xl' }) || '';
      avatar.classList.remove('is-empty'); avatar.classList.add('is-revealed');
    }
    renderParticipation();
  }
  function pickerToolbar(stage) {
    if (!stage || stage.previousElementSibling?.classList.contains('picker-toolbar')) return;
    const bar = document.createElement('div');
    bar.className = 'picker-toolbar no-print';
    bar.innerHTML = `<div class="field tool-theme-control" data-theme-control="picker"><label class="field-label">Theme</label><div class="tool-theme-control__row"><span class="tool-theme-preview" data-tool-theme="${theme('picker')}" aria-hidden="true"></span><select class="field-select">${themeOptions(theme('picker'))}</select></div><label class="tool-theme-control__both"><input type="checkbox"> Use for both tools</label></div><div class="field"><label class="field-label">Term</label><select data-picker-term class="field-select">${['1','2','3'].map(value => `<option value="${value}" ${value === term() ? 'selected' : ''}>Term ${value}</option>`).join('')}</select></div><div class="field"><label class="field-label">Picker mode</label><select data-picker-mode class="field-select"><option value="random">Random</option><option value="no-repeat">No Repeat</option><option value="least-stars">Least Stars First</option><option value="no-stars">No Stars Yet</option></select></div><label class="picker-attendance-filter"><input data-include-absent type="checkbox" ${state.includeAbsent ? 'checked' : ''}> Include absent learners</label>`;
    bar.querySelector('[data-picker-mode]').value = state.mode;
    const themeSelect = bar.querySelector('[data-theme-control] select');
    const both = bar.querySelector('[data-theme-control] input');
    themeSelect.addEventListener('change', () => setTheme('picker', themeSelect.value, both.checked).catch(error => globalScope.toast(error.message, 'error')));
    bar.querySelector('[data-picker-term]').addEventListener('change', event => { state.term = event.target.value; state.selected = null; renderParticipation(); });
    bar.querySelector('[data-picker-mode]').addEventListener('change', event => { state.mode = event.target.value; state.selected = null; renderParticipation(); });
    bar.querySelector('[data-include-absent]').addEventListener('change', event => { state.includeAbsent = event.target.checked; state.selected = null; });
    stage.before(bar);
  }
  function standingsMarkup() {
    const starTotals = totals();
    return core.activeLearners(assignment()).sort((a, b) => (starTotals[b.id] || 0) - (starTotals[a.id] || 0) || learnerName(a).localeCompare(learnerName(b)))
      .map(item => `<li><span>${learnerName(item)}</span><strong>${starTotals[item.id] || 0} ★</strong></li>`).join('');
  }
  function renderParticipation() {
    const stage = document.querySelector('#namePickerRouletteName')?.closest('.name-picker-stage');
    if (!stage) return;
    let actions = stage.querySelector('.picker-star-actions');
    if (!actions) {
      actions = document.createElement('div'); actions.className = 'picker-star-actions'; stage.querySelector('.name-picker-stage__content')?.appendChild(actions);
    }
    const selectedTotal = state.selected ? (totals()[state.selected.id] || 0) : 0;
    actions.innerHTML = state.selected ? `<strong>Term stars: ${selectedTotal}</strong><input class="field-input" maxlength="160" placeholder="Optional note, e.g. Correct answer."><button class="btn btn-primary btn-sm" data-award-star>Award Star</button><button class="btn btn-ghost btn-sm" data-undo-star>Undo Last Star</button>` : '<span>Select a learner to award a participation star.</span>';
    actions.querySelector('[data-award-star]')?.addEventListener('click', async () => {
      core.awardParticipationStar(tools(), assignment().id, term(), state.selected.id, { source: 'name-picker', note: actions.querySelector('input').value });
      await persist(); globalScope.toast('Participation star awarded.', 'success'); renderParticipation();
    });
    actions.querySelector('[data-undo-star]')?.addEventListener('click', async () => {
      if (!core.undoLastParticipationStar(tools(), assignment().id, term())) return globalScope.toast('There is no star to undo.', 'warning');
      await persist(); globalScope.toast('Last participation star undone.', 'success'); renderParticipation();
    });
    let panel = stage.nextElementSibling;
    if (!panel?.classList.contains('picker-standings')) { panel = document.createElement('section'); panel.className = 'picker-standings'; stage.after(panel); }
    panel.innerHTML = `<div class="picker-standings__header"><div><h2>Participation standings</h2><span>Term ${term()} · Stars never change official grades.</span></div><div><button class="btn btn-ghost btn-sm" data-export-stars>Export CSV</button><button class="btn btn-warn btn-sm" data-reset-stars>Reset Term Stars</button></div></div><ol>${standingsMarkup()}</ol>`;
    panel.querySelector('[data-export-stars]').addEventListener('click', exportCsv);
    panel.querySelector('[data-reset-stars]').addEventListener('click', resetTerm);
  }
  async function exportCsv() {
    const starTotals = totals();
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['Learner ID','Learner','Class','Term','Stars'], ...core.activeLearners(assignment()).map(item => [item.id, learnerName(item), core.assignmentLabel(assignment()), term(), starTotals[item.id] || 0])];
    const result = await globalScope.electronAPI?.exportCsv(rows.map(row => row.map(quote).join(',')).join('\r\n'), `Participation-Stars-Term-${term()}.csv`);
    if (result?.success) globalScope.toast('Participation standings exported.', 'success');
  }
  function resetTerm() {
    const active = tools().participationStarEvents.filter(item => item.assignmentId === assignment().id && item.term === term() && !item.reversedAt).length;
    const phrase = `RESET TERM ${term()}`;
    if (globalScope.prompt(`This will reverse ${active} active star event(s) for this class. Type ${phrase} to continue.`) !== phrase) return;
    globalScope.promptPinVerification(async () => {
      core.resetParticipationStars(tools(), assignment().id, term(), phrase);
      await persist(); state.selected = null; globalScope.toast('Term stars reset.', 'success'); renderParticipation();
    });
  }
  function augment() {
    const groupRoot = document.getElementById('groupRandomizerCount')?.closest('.teacher-tool');
    if (groupRoot) { applyTheme('groups', groupRoot); addThemeControl('groups', groupRoot.querySelector('.tool-control-strip')); }
    const pickerRoot = document.getElementById('namePickerRouletteName')?.closest('.teacher-tool');
    if (pickerRoot && !pickerRoot.dataset.participationAugmented) {
      pickerRoot.dataset.participationAugmented = 'true';
      if (state.assignmentId !== assignment()?.id) { state.assignmentId = assignment()?.id || ''; state.selected = null; }
      applyTheme('picker', pickerRoot);
      const stage = pickerRoot.querySelector('.name-picker-stage'); pickerToolbar(stage); renderParticipation();
      const pickButton = stage?.querySelector('.btn-primary.btn-lg');
      if (pickButton && !pickButton.dataset.participationBound) {
        pickButton.dataset.participationBound = 'true'; pickButton.removeAttribute('onclick'); pickButton.addEventListener('click', draw);
      }
      const resetButton = [...(stage?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Reset Draws');
      if (resetButton) { resetButton.removeAttribute('onclick'); resetButton.addEventListener('click', () => { state.remaining.delete(pickerKey()); state.selected = null; renderParticipation(); }); }
    }
  }
  const observer = new MutationObserver(() => globalScope.requestAnimationFrame?.(augment));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  globalScope.addEventListener('DOMContentLoaded', augment);
})(window);
