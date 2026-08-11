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
  const state = {
    pickerAnimation: null, groupAnimation: null, audioContext: null,
    pickerRoot: null, groupRoot: null, lastPicker: null, lastGroup: null
  };

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
  function animationSpeed(tool) {
    return tool === 'picker'
      ? preferences().namePickerAnimationSpeed || 'normal'
      : preferences().groupRandomizerAnimationSpeed || 'normal';
  }
  async function setSound(tool, enabled) {
    const prefs = preferences();
    if (tool === 'picker') prefs.namePickerSound = Boolean(enabled);
    else prefs.groupRandomizerSound = Boolean(enabled);
    await globalScope.saveDatabase?.();
  }
  async function setAnimationSpeed(tool, value) {
    const speed = ['relaxed', 'normal', 'quick'].includes(value) ? value : 'normal';
    const prefs = preferences();
    if (tool === 'picker') prefs.namePickerAnimationSpeed = speed;
    else prefs.groupRandomizerAnimationSpeed = speed;
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
    const names = learners.slice(0, 36).map(learner => learnerName(learner).split(/[ ,]/)[0]).filter(Boolean);
    if (theme === 'carnival-wheel') return `<div class="picker-wheel" aria-hidden="true"><div class="picker-wheel__disc">${names.map((name, index) => `<span style="--item:${index};--items:${Math.max(names.length, 1)}">${esc(name)}</span>`).join('')}</div><i class="picker-wheel__pointer"></i></div>`;
    if (theme === 'arcade-capsule') return `<div class="capsule-machine" aria-hidden="true"><div class="capsule-machine__glass">${names.map((name, index) => `<i style="--item:${index}" title="${esc(name)}"><span>${esc(name.slice(0, 1))}</span></i>`).join('')}</div><div class="capsule-machine__chute"><b></b><span class="capsule-machine__winner"></span></div></div>`;
    if (theme === 'mystery-cards') return `<div class="mystery-deck" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<i style="--item:${index}"><span>?</span></i>`).join('')}<b class="mystery-deck__winner"></b></div>`;
    if (theme === 'galaxy-scanner') return `<div class="galaxy-field" aria-hidden="true"><i class="galaxy-field__planet"></i><b class="galaxy-field__planet-name"></b><i class="galaxy-field__beam"></i>${names.slice(0, 10).map((name, index) => `<span style="--item:${index};--items:${Math.max(Math.min(names.length, 10), 1)}">${esc(name.slice(0, 1))}</span>`).join('')}</div>`;
    return `<div class="game-show-stage" aria-hidden="true"><i class="game-show-stage__curtain game-show-stage__curtain--left"></i><i class="game-show-stage__curtain game-show-stage__curtain--right"></i><i class="game-show-stage__spotlight"></i><span>WHO WILL IT BE?</span><div class="game-show-roster">${learners.slice(0,40).map(learner => `<i class="game-show-roster__learner" data-roster-learner="${esc(learner.id)}">${avatar(learner,'sm')}<b>${esc(learnerName(learner))}</b></i>`).join('')}</div></div>`;
  }
  function speedOptions(selected) {
    return [['relaxed','Relaxed'],['normal','Normal'],['quick','Quick']]
      .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
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
    toolbar.innerHTML = `<label class="experience-sound"><input type="checkbox" ${soundEnabled(tool) ? 'checked' : ''}> Sound</label><label class="experience-toolbar__speed">Speed <select class="field-select" data-animation-speed>${speedOptions(animationSpeed(tool))}</select></label><button class="btn btn-ghost btn-sm" type="button" data-present>Presentation Mode</button><button class="btn btn-ghost btn-sm" type="button" data-reveal hidden>Reveal Now</button><button class="btn btn-ghost btn-sm" type="button" data-replay disabled>Replay Animation</button>`;
    toolbar.querySelector('input').addEventListener('change', event => setSound(tool, event.target.checked));
    toolbar.querySelector('[data-animation-speed]').addEventListener('change', event => setAnimationSpeed(tool, event.target.value));
    toolbar.querySelector('[data-present]').addEventListener('click', () => fullscreen(root));
    toolbar.querySelector('[data-reveal]').addEventListener('click', () => {
      if (tool === 'picker') revealPickerNow();
      else if (!revealGroupsNow()) globalScope.TeacherTools?.revealGroupsNow?.();
    });
    toolbar.querySelector('[data-replay]').addEventListener('click', () => tool === 'picker' ? replayPicker() : replayGroups());
    host.appendChild(toolbar);
  }
  function enhancePicker(root, learners = []) {
    if (!root) return;
    if (state.pickerRoot && state.pickerRoot !== root) {
      cancelPicker();
      if (state.lastPicker && learners.some(item => item.id === state.lastPicker.selected?.id)) {
        state.lastPicker = { ...state.lastPicker, root, learners };
      } else state.lastPicker = null;
    }
    state.pickerRoot = root;
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
    const replay = root.querySelector('[data-experience-toolbar="picker"] [data-replay]');
    if (replay) replay.disabled = !state.lastPicker;
  }
  function groupIcon(theme) {
    return { 'draft-arena':'🏆', 'space-crew':'🚀', 'island-expedition':'🏝️', 'house-sorting':'🛡️', 'puzzle-party':'🧩' }[theme] || '★';
  }
  function enhanceGroups(root) {
    if (!root) return;
    if (state.groupRoot && state.groupRoot !== root) cancelGroups();
    state.groupRoot = root;
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
    if (state.lastGroup) state.lastGroup = results ? { root } : null;
    const replay = root.querySelector('[data-experience-toolbar="groups"] [data-replay]');
    if (replay) replay.disabled = !state.lastGroup || !results;
  }
  function showPickerCandidate(root, learner) {
    const name = root.querySelector('#namePickerRouletteName');
    const avatarNode = root.querySelector('#namePickerRouletteAvatar');
    if (name) { name.textContent = learnerName(learner); name.classList.remove('is-revealed'); name.classList.add('is-ticking'); }
    if (avatarNode) { avatarNode.innerHTML = avatar(learner); avatarNode.classList.remove('is-revealed','is-empty'); avatarNode.classList.add('is-ticking'); }
  }
  function cleanPicker(animation) {
    const root = animation?.root;
    const stage = root?.querySelector('.name-picker-stage');
    root?.classList.remove('experience-running');
    root?.setAttribute('aria-busy', 'false');
    stage?.removeAttribute('data-motion-phase');
    const pick = stage?.querySelector('.btn-primary.btn-lg'); if (pick) pick.disabled = false;
    root?.querySelector('[data-experience-toolbar="picker"] [data-reveal]')?.setAttribute('hidden', '');
  }
  function finishPicker(animation, skipped = false) {
    if (!animation || animation.done) return;
    animation.done = true;
    const root = animation.root, stage = root.querySelector('.name-picker-stage');
    const name = root.querySelector('#namePickerRouletteName');
    const avatarNode = root.querySelector('#namePickerRouletteAvatar');
    if (name) { name.textContent = learnerName(animation.selected); name.classList.remove('is-ticking'); name.classList.add('is-revealed'); }
    if (avatarNode) { avatarNode.innerHTML = avatar(animation.selected); avatarNode.classList.remove('is-ticking','is-empty'); avatarNode.classList.add('is-revealed'); }
    const luckyName = learnerName(animation.selected);
    root.querySelectorAll('.capsule-machine__winner,.mystery-deck__winner').forEach(node => { node.textContent = luckyName; });
    const planet = root.querySelector('.galaxy-field__planet-name'); if (planet) planet.textContent = 'Planet ' + (animation.selected.firstName || luckyName.split(/[ ,]/)[0]);
    root.querySelectorAll('.game-show-roster__learner').forEach(node => node.classList.toggle('is-lucky', node.dataset.rosterLearner === String(animation.selected.id)));
    cleanPicker(animation);
    stage?.classList.add('experience-revealed');
    if (soundEnabled('picker')) tone('reveal');
    if (!isReduced()) globalScope.TeacherTools?.launchSelectionConfetti?.(avatarNode || stage);
    state.pickerAnimation = null;
    state.lastPicker = { root, learners: animation.learners, selected: animation.selected };
    const replay = root.querySelector('[data-experience-toolbar="picker"] [data-replay]'); if (replay) replay.disabled = false;
    animation.onComplete?.({ skipped });
  }
  function animatePicker({ root, learners, selected, onComplete }) {
    if (!root || !selected || !learners?.length) return false;
    cancelPicker();
    enhancePicker(root, learners);
    const engine = globalScope.TeacherToolsAnimationEngine;
    const adapters = globalScope.TeacherToolExperienceAdapters;
    if (!engine || !adapters) return false;
    const theme = selectedTheme('picker');
    const profile = adapters.picker[theme];
    const stage = root.querySelector('.name-picker-stage');
    const pick = stage?.querySelector('.btn-primary.btn-lg'); if (pick) pick.disabled = true;
    root.classList.add('experience-running'); root.setAttribute('aria-busy', 'true'); stage?.classList.remove('experience-revealed');
    const reveal = root.querySelector('[data-experience-toolbar="picker"] [data-reveal]'); if (reveal) reveal.hidden = false;
    const replay = root.querySelector('[data-experience-toolbar="picker"] [data-replay]'); if (replay) replay.disabled = true;
    const status = root.querySelector('.name-picker-stage__status');
    if (status) { status.textContent = profile.label; status.setAttribute('aria-live', 'polite'); }
    const animation = {
      root, stage, learners, selected, onComplete, done: false, tickIndex: -1,
      selectedIndex: Math.max(0, learners.findIndex(item => item.id === selected.id))
    };
    state.pickerAnimation = animation;
    engine.start({
      id: 'name-picker', root, duration: profile.duration, speed: animationSpeed('picker'),
      onFrame(progress) {
        adapters.pickerFrame(theme, progress, animation);
        const nextTick = Math.min(profile.tickCount - 1, Math.floor(progress * profile.tickCount));
        if (nextTick !== animation.tickIndex && progress < .96) {
          animation.tickIndex = nextTick;
          showPickerCandidate(root, learners[globalScope.TeacherToolsCore.secureRandomInt(learners.length)]);
          if (soundEnabled('picker')) tone('tick');
        }
      },
      onFinish: ({ skipped }) => finishPicker(animation, skipped),
      onCancel: () => cleanPicker(animation)
    });
    return true;
  }
  function revealPickerNow() { return globalScope.TeacherToolsAnimationEngine?.finish('name-picker') || false; }
  function cancelPicker() {
    const cancelled = globalScope.TeacherToolsAnimationEngine?.cancel('name-picker') || false;
    if (cancelled) state.pickerAnimation = null;
    return cancelled;
  }
  function replayPicker() {
    const previous = state.lastPicker;
    if (!previous || !document.contains(previous.root)) return false;
    return animatePicker({ ...previous, onComplete: () => {} });
  }

  function cleanGroups(animation, finishAnimations = false) {
    animation?.animations?.forEach(item => {
      try { finishAnimations ? item.finish() : item.cancel(); } catch (_) { /* Detached learner card. */ }
    });
    const root = animation?.root;
    const results = root?.querySelector('.group-results');
    results?.classList.remove('is-assigning');
    root?.setAttribute('aria-busy', 'false');
    results?.querySelector('.group-animation-progress')?.remove();
    root?.querySelector('[data-experience-toolbar="groups"] [data-reveal]')?.setAttribute('hidden', '');
  }
  function finishGroups(animation, skipped = false) {
    if (!animation || animation.done) return;
    animation.done = true;
    cleanGroups(animation, true);
    const results = animation.root.querySelector('.group-results');
    results?.classList.add('is-revealed');
    if (soundEnabled('groups')) tone('reveal');
    if (!isReduced()) globalScope.TeacherTools?.launchSelectionConfetti?.(results?.querySelector('.group-result') || results);
    state.groupAnimation = null;
    state.lastGroup = { root: animation.root };
    const replay = animation.root.querySelector('[data-experience-toolbar="groups"] [data-replay]'); if (replay) replay.disabled = false;
    animation.onComplete?.({ skipped });
  }
  function animateGroups({ root, onComplete } = {}) {
    if (!root) return false;
    cancelGroups();
    enhanceGroups(root);
    const engine = globalScope.TeacherToolsAnimationEngine;
    const adapters = globalScope.TeacherToolExperienceAdapters;
    const results = root.querySelector('.group-results');
    const learners = [...(results?.querySelectorAll('[data-group-learner-id]') || [])];
    if (!engine || !adapters || !results || !learners.length) return false;
    const theme = selectedTheme('groups');
    const profile = adapters.groups[theme];
    results.classList.remove('is-revealed'); results.classList.add('is-assigning'); root.setAttribute('aria-busy', 'true');
    const progress = document.createElement('span'); progress.className = 'group-animation-progress'; progress.setAttribute('aria-hidden', 'true'); results.appendChild(progress);
    const reveal = root.querySelector('[data-experience-toolbar="groups"] [data-reveal]'); if (reveal) reveal.hidden = false;
    const replay = root.querySelector('[data-experience-toolbar="groups"] [data-replay]'); if (replay) replay.disabled = true;
    const status = root.querySelector('.group-randomizer-status');
    if (status) { status.textContent = profile.label; status.setAttribute('aria-live', 'polite'); }
    const totalDuration = engine.duration(profile.duration, animationSpeed('groups'));
    const stagger = Math.min(85, Math.max(24, Math.floor((totalDuration - 720) / Math.max(learners.length, 1))));
    const animations = learners.map((element, index) => typeof element.animate === 'function'
      ? element.animate(
        adapters.groupKeyframes(theme, index, learners.length),
        { duration: 620, delay: index * stagger, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }
      )
      : { finish() {}, cancel() {} });
    const animation = { root, learners, animations, onComplete, done: false, announcedCount: -1 };
    state.groupAnimation = animation;
    engine.start({
      id: 'group-randomizer', root, duration: Math.max(900, Math.min(totalDuration, learners.length * stagger + 760)),
      onFrame(value) {
        results.style.setProperty('--group-progress', value.toFixed(4));
        const assigned = Math.min(learners.length, Math.ceil(value * learners.length));
        if (status) status.textContent = profile.label + ' ' + assigned + ' of ' + learners.length;
        const soundStep = Math.max(1, Math.ceil(learners.length / 12));
        if (assigned !== animation.announcedCount && assigned % soundStep === 0) {
          animation.announcedCount = assigned;
          if (assigned && assigned < learners.length && soundEnabled('groups')) tone('tick');
        }
      },
      onFinish: ({ skipped }) => finishGroups(animation, skipped),
      onCancel: () => cleanGroups(animation, false)
    });
    return true;
  }
  function revealGroupsNow() { return globalScope.TeacherToolsAnimationEngine?.finish('group-randomizer') || false; }
  function cancelGroups() {
    const cancelled = globalScope.TeacherToolsAnimationEngine?.cancel('group-randomizer') || false;
    if (cancelled) state.groupAnimation = null;
    return cancelled;
  }
  function replayGroups() {
    const previous = state.lastGroup;
    if (!previous || !document.contains(previous.root)) return false;
    return animateGroups({ root: previous.root, onComplete: () => {} });
  }

  globalScope.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const completed = revealPickerNow() || revealGroupsNow();
    if (document.fullscreenElement) document.exitFullscreen?.();
    if (completed) event.preventDefault();
  });

  const api = {
    pickerThemes, groupThemes, legacyPickerThemes, legacyGroupThemes,
    selectedTheme, enhancePicker, enhanceGroups, animatePicker, revealPickerNow, cancelPicker, replayPicker,
    animateGroups, revealGroupsNow, cancelGroups, replayGroups, fullscreen
  };
  globalScope.TeacherToolExperiences = api;
})(window);
