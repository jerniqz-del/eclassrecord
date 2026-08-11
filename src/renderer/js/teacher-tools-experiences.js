(function initTeacherToolExperiences(globalScope) {
  'use strict';

  const pickerThemes = Object.freeze({
    'carnival-wheel': 'Carnival Prize Wheel',
    'arcade-capsule': 'Arcade Capsule Machine',
    'mystery-cards': 'Mystery Card Deck',
    'galaxy-scanner': 'Galaxy Scanner',
    'game-show': 'Game Show Spotlight'
  });
  const groupThemes = Object.freeze({
    'draft-arena': 'Team Draft Arena',
    'space-crew': 'Space Crew Launch',
    'island-expedition': 'Island Expedition',
    'house-sorting': 'House Sorting Ceremony',
    'puzzle-party': 'Puzzle Party'
  });
  const legacyPickerThemes = Object.freeze({
    classic: 'carnival-wheel', fiesta: 'carnival-wheel', chalkboard: 'mystery-cards',
    ocean: 'game-show', space: 'galaxy-scanner', 'high-contrast': 'mystery-cards'
  });
  const legacyGroupThemes = Object.freeze({
    classic: 'draft-arena', fiesta: 'puzzle-party', chalkboard: 'house-sorting',
    ocean: 'island-expedition', space: 'space-crew', 'high-contrast': 'draft-arena'
  });
  const state = { pickerAnimation: null, audioContext: null, groupWasAnimating: false };

  function database() { return globalScope.getActiveProfileDatabase?.(); }
  function tools() { return globalScope.TeacherToolsCore?.normalize(database()); }
  function preferences() { return tools()?.appearancePreferences || {}; }
  function isReduced() {
    return Boolean(globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      || document.documentElement.dataset.performanceMode === 'low'
      || document.body.classList.contains('low-spec-mode');
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }
  function learnerName(learner) {
    return globalScope.learnerDisplayName?.(learner)
      || [learner?.lastName ? `${learner.lastName},` : '', learner?.firstName, learner?.middleName].filter(Boolean).join(' ')
      || learner?.name || 'Learner';
  }
  function avatar(learner, size = 'xl') {
    return learner && globalScope.LearnerAvatars?.renderLearner(learner, { size }) || '';
  }
  function selectedTheme(tool) {
    const value = tool === 'picker' ? preferences().namePickerTheme : preferences().groupRandomizerTheme;
    const available = tool === 'picker' ? pickerThemes : groupThemes;
    const legacy = tool === 'picker' ? legacyPickerThemes : legacyGroupThemes;
    return available[value] ? value : legacy[value] || Object.keys(available)[0];
  }
  function soundEnabled(tool) {
    return tool === 'picker' ? preferences().namePickerSound !== false : preferences().groupRandomizerSound !== false;
  }
  async function setSound(tool, enabled) {
    const prefs = preferences();
    if (tool === 'picker') prefs.namePickerSound = Boolean(enabled);
    else prefs.groupRandomizerSound = Boolean(enabled);
    await globalScope.saveDatabase?.();
  }
  function tone(kind = 'tick') {
    if (isReduced()) return;
    const AudioContextClass = globalScope.AudioContext || globalScope.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = state.audioContext && state.audioContext.state !== 'closed'
        ? state.audioContext : new AudioContextClass();
      state.audioContext = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === 'reveal' ? 'triangle' : 'sine';
      oscillator.frequency.value = kind === 'reveal' ? 660 : 250 + Math.random() * 90;
      gain.gain.setValueAtTime(kind === 'reveal' ? 0.065 : 0.025, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (kind === 'reveal' ? 0.34 : 0.06));
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start();
      oscillator.stop(context.currentTime + (kind === 'reveal' ? 0.35 : 0.07));
    } catch (_) { /* Optional sound must never block a draw. */ }
  }
  function fullscreen(root) {
    if (document.fullscreenElement) return document.exitFullscreen?.();
    return root?.requestFullscreen?.();
  }
  function sceneMarkup(theme, learners) {
    const names = learners.slice(0, 12).map(learner => learnerName(learner).split(/[ ,]/)[0]).filter(Boolean);
    if (theme === 'carnival-wheel') return `<div class="picker-wheel" aria-hidden="true"><div class="picker-wheel__disc">${names.map((name, index) => `<span style="--item:${index};--items:${Math.max(names.length, 1)}">${esc(name)}</span>`).join('')}</div><i class="picker-wheel__pointer"></i></div>`;
    if (theme === 'arcade-capsule') return `<div class="capsule-machine" aria-hidden="true"><div class="capsule-machine__glass">${names.map((name, index) => `<i style="--item:${index}" title="${esc(name)}"><span>${esc(name.slice(0, 1))}</span></i>`).join('')}</div><div class="capsule-machine__chute"><b></b></div></div>`;
    if (theme === 'mystery-cards') return `<div class="mystery-deck" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<i style="--item:${index}"><span>?</span></i>`).join('')}</div>`;
    if (theme === 'galaxy-scanner') return `<div class="galaxy-field" aria-hidden="true"><i class="galaxy-field__planet"></i><i class="galaxy-field__beam"></i>${names.slice(0, 10).map((name, index) => `<span style="--item:${index};--items:${Math.max(Math.min(names.length, 10), 1)}">${esc(name.slice(0, 1))}</span>`).join('')}</div>`;
    return '<div class="game-show-stage" aria-hidden="true"><i class="game-show-stage__curtain game-show-stage__curtain--left"></i><i class="game-show-stage__curtain game-show-stage__curtain--right"></i><i class="game-show-stage__spotlight"></i><span>WHO WILL IT BE?</span></div>';
  }
  function addExperienceToolbar(tool, root) {
    if (!root || root.querySelector(`[data-experience-toolbar="${tool}"]`)) return;
    const host = tool === 'picker'
      ? root.querySelector('.picker-toolbar')
      : root.querySelector('.tool-control-strip__actions');
    if (!host) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'experience-toolbar no-print';
    toolbar.dataset.experienceToolbar = tool;
    toolbar.innerHTML = `<label class="experience-sound"><input type="checkbox" ${soundEnabled(tool) ? 'checked' : ''}> Sound</label><button class="btn btn-ghost btn-sm" type="button" data-present>Present Fullscreen</button>${tool === 'picker' ? '<button class="btn btn-ghost btn-sm" type="button" data-reveal hidden>Reveal Now</button>' : '<button class="btn btn-ghost btn-sm" type="button" data-reveal>Reveal Now</button>'}`;
    toolbar.querySelector('input').addEventListener('change', event => setSound(tool, event.target.checked));
    toolbar.querySelector('[data-present]').addEventListener('click', () => fullscreen(root));
    toolbar.querySelector('[data-reveal]').addEventListener('click', () => {
      if (tool === 'picker') revealPickerNow();
      else globalScope.TeacherTools?.revealGroupsNow?.();
    });
    host.appendChild(toolbar);
  }
  function enhancePicker(root, learners = []) {
    if (!root) return;
    const theme = selectedTheme('picker');
    root.dataset.toolTheme = theme;
    root.dataset.experience = 'picker';
    const stage = root.querySelector('.name-picker-stage');
    if (!stage) return;
    let scene = stage.querySelector('.picker-experience-scene');
    if (!scene || scene.dataset.sceneTheme !== theme) {
      scene?.remove(); scene = document.createElement('div');
      scene.className = 'picker-experience-scene'; scene.dataset.sceneTheme = theme;
      scene.innerHTML = sceneMarkup(theme, learners); stage.prepend(scene);
    }
    stage.dataset.experienceLabel = pickerThemes[theme];
    addExperienceToolbar('picker', root);
  }
  function groupIcon(theme) {
    return { 'draft-arena':'🏆', 'space-crew':'🚀', 'island-expedition':'🏝️', 'house-sorting':'🛡️', 'puzzle-party':'🧩' }[theme] || '★';
  }
  function enhanceGroups(root) {
    if (!root) return;
    const theme = selectedTheme('groups');
    root.dataset.toolTheme = theme;
    root.dataset.experience = 'groups';
    addExperienceToolbar('groups', root);
    const results = root.querySelector('.group-results');
    if (results) {
      results.classList.add('group-experience-stage');
      results.dataset.experienceLabel = groupThemes[theme];
      results.querySelectorAll('.group-result').forEach((card, index) => {
        card.style.setProperty('--team-index', String(index));
        card.dataset.teamNumber = String(index + 1);
        if (!card.querySelector('.group-experience-icon')) {
          const icon = document.createElement('span'); icon.className = 'group-experience-icon';
          icon.setAttribute('aria-hidden', 'true'); icon.textContent = groupIcon(theme);
          card.querySelector('.group-result__header')?.prepend(icon);
        }
      });
    }
    const animating = Boolean(root.querySelector('.group-randomizer-status'));
    if (state.groupWasAnimating && !animating && results) {
      if (soundEnabled('groups')) tone('reveal');
      if (!isReduced()) globalScope.TeacherTools?.launchSelectionConfetti?.(results.querySelector('.group-result') || results);
      results.classList.add('is-revealed');
    }
    state.groupWasAnimating = animating;
  }
  function finishPicker(animation) {
    if (!animation || animation.done) return;
    animation.done = true;
    clearTimeout(animation.timer);
    const root = animation.root, stage = root.querySelector('.name-picker-stage');
    const name = root.querySelector('#namePickerRouletteName');
    const avatarNode = root.querySelector('#namePickerRouletteAvatar');
    if (name) { name.textContent = learnerName(animation.selected); name.classList.remove('is-ticking'); name.classList.add('is-revealed'); }
    if (avatarNode) { avatarNode.innerHTML = avatar(animation.selected); avatarNode.classList.remove('is-ticking','is-empty'); avatarNode.classList.add('is-revealed'); }
    root.classList.remove('experience-running'); stage?.classList.add('experience-revealed');
    root.querySelector('[data-experience-toolbar="picker"] [data-reveal]')?.setAttribute('hidden', '');
    const pick = stage?.querySelector('.btn-primary.btn-lg'); if (pick) pick.disabled = false;
    if (soundEnabled('picker')) tone('reveal');
    if (!isReduced()) globalScope.TeacherTools?.launchSelectionConfetti?.(avatarNode || stage);
    state.pickerAnimation = null;
    animation.onComplete();
  }
  function animatePicker({ root, learners, selected, onComplete }) {
    if (!root || !selected || isReduced() || learners.length < 2) return false;
    revealPickerNow();
    enhancePicker(root, learners);
    const stage = root.querySelector('.name-picker-stage');
    const pick = stage?.querySelector('.btn-primary.btn-lg'); if (pick) pick.disabled = true;
    root.classList.add('experience-running'); stage?.classList.remove('experience-revealed');
    const reveal = root.querySelector('[data-experience-toolbar="picker"] [data-reveal]'); if (reveal) reveal.hidden = false;
    const animation = { root, learners, selected, onComplete, step: 0, timer: null, done: false };
    state.pickerAnimation = animation;
    const total = 22;
    const tick = () => {
      if (animation.done) return;
      if (animation.step >= total) return finishPicker(animation);
      const candidate = learners[globalScope.TeacherToolsCore.secureRandomInt(learners.length)];
      const name = root.querySelector('#namePickerRouletteName');
      const avatarNode = root.querySelector('#namePickerRouletteAvatar');
      if (name) { name.textContent = learnerName(candidate); name.classList.remove('is-revealed'); name.classList.add('is-ticking'); }
      if (avatarNode) { avatarNode.innerHTML = avatar(candidate); avatarNode.classList.remove('is-revealed','is-empty'); avatarNode.classList.add('is-ticking'); }
      root.style.setProperty('--experience-step', String(animation.step));
      if (soundEnabled('picker')) tone('tick');
      animation.step++;
      const progress = animation.step / total;
      animation.timer = setTimeout(tick, 45 + Math.round(progress * progress * 150));
    };
    tick();
    return true;
  }
  function revealPickerNow() { if (state.pickerAnimation) finishPicker(state.pickerAnimation); }

  const api = {
    pickerThemes, groupThemes, legacyPickerThemes, legacyGroupThemes,
    selectedTheme, enhancePicker, enhanceGroups, animatePicker, revealPickerNow, fullscreen
  };
  globalScope.TeacherToolExperiences = api;
})(window);
