(function initTeacherToolExperiences(globalScope) {
  'use strict';

  const pickerThemes = Object.freeze({
    'carnival-wheel': 'Carnival Prize Wheel',
    'wheel-of-learners': 'Wheel of Learners'
  });
  const groupThemes = Object.freeze({
    'draft-arena': 'Team Draft Arena',
    'space-crew': 'Space Crew Launch',
    'island-expedition': 'Island Expedition',
    'house-sorting': 'House Sorting Ceremony',
    'puzzle-party': 'Puzzle Party'
  });
  const legacyPickerThemes = Object.freeze({
    classic: 'carnival-wheel', fiesta: 'carnival-wheel',
    chalkboard: 'wheel-of-learners', ocean: 'wheel-of-learners', space: 'wheel-of-learners',
    'high-contrast': 'wheel-of-learners', 'arcade-capsule': 'wheel-of-learners',
    'mystery-cards': 'wheel-of-learners', 'galaxy-scanner': 'wheel-of-learners', 'game-show': 'wheel-of-learners'
  });
  const legacyGroupThemes = Object.freeze({
    classic: 'draft-arena', fiesta: 'puzzle-party', chalkboard: 'house-sorting',
    ocean: 'island-expedition', space: 'space-crew', 'high-contrast': 'draft-arena'
  });
  const state = {
    pickerAnimation: null, groupAnimation: null, audioContext: null,
    pickerRoot: null, groupRoot: null, lastGroup: null
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
  function wheelSize() {
    const value = preferences().namePickerWheelSize;
    return ['small', 'medium', 'large'].includes(value) ? value : 'medium';
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
  async function setWheelSize(value, root = state.pickerRoot) {
    const size = ['small', 'medium', 'large'].includes(value) ? value : 'medium';
    preferences().namePickerWheelSize = size;
    const stage = root?.querySelector('.name-picker-stage');
    if (stage) stage.dataset.wheelSize = size;
    const wheel = stage?.querySelector('.picker-experience-scene')?._pickerWheel;
    globalScope.requestAnimationFrame?.(() => wheel?.resize?.());
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
  function carnivalRoster(learners) {
    const rings = learners.length > 30
      ? [learners.filter((_, index) => index % 2 === 0), learners.filter((_, index) => index % 2 === 1)]
      : [learners];
    return rings.map((ring, ringIndex) => ring.map((learner, index) => {
      const shortName = learner.firstName || learnerName(learner).split(/[ ,]/)[0] || 'Learner';
      return `<i class="carnival-board__learner carnival-board__learner--${ringIndex ? 'inner' : 'outer'}" data-carnival-learner="${esc(learner.id)}" style="--item:${index};--items:${Math.max(ring.length, 1)}" title="${esc(learnerName(learner))}">${avatar(learner, 'sm')}<b>${esc(shortName)}</b></i>`;
    }).join('')).join('');
  }
  const wheelColors = ['#7c3aed', '#22c7d9', '#f472b6', '#fbbf24', '#34d399', '#60a5fa'];
  function wheelLabel(learner) {
    const first = String(learner?.firstName || '').trim();
    const last = String(learner?.lastName || '').trim();
    const label = first && last ? first + ' ' + last.slice(0, 1) + '.' : first || last || learnerName(learner);
    return label.length > 20 ? label.slice(0, 19) + '…' : label;
  }
  function wheelSceneMarkup() {
    return '<div class="picker-wheel-scene" aria-hidden="true"><div class="picker-wheel-shell"><div class="picker-wheel-canvas-host" data-picker-wheel></div><span class="picker-wheel-pointer"></span><span class="picker-wheel-hub">?</span></div><span class="picker-wheel-caption">Every learner has an equal slice</span></div>';
  }
  function disposePickerWheel(scene) {
    if (!scene?._pickerWheel) return;
    try { scene._pickerWheel.remove(); } catch (_) { /* Detached canvas is already harmless. */ }
    scene._pickerWheel = null;
  }
  function initPickerWheelScene(scene, learners) {
    const wheelScene = scene?.querySelector('.picker-wheel-scene');
    const host = scene?.querySelector('[data-picker-wheel]');
    if (!wheelScene || !host || !learners?.length) return null;
    if (scene._pickerWheel) return scene._pickerWheel;
    if (!globalScope.SpinWheel) {
      if (!scene.dataset.wheelWaiting) {
        scene.dataset.wheelWaiting = 'true';
        globalScope.addEventListener('spin-wheel-ready', () => {
          delete scene.dataset.wheelWaiting;
          if (scene.isConnected) initPickerWheelScene(scene, learners);
        }, { once: true });
      }
      return null;
    }
    try {
      const wheel = new globalScope.SpinWheel(host, {
        items: learners.map(learner => ({ label: wheelLabel(learner), value: String(learner.id) })),
        itemBackgroundColors: wheelColors,
        itemLabelColors: ['#ffffff'],
        itemLabelFont: 'Inter, Segoe UI, sans-serif',
        itemLabelFontSizeMax: learners.length > 24 ? 14 : 19,
        itemLabelRadius: .93,
        itemLabelRadiusMax: .37,
        itemLabelStrokeColor: 'rgb(52 18 122 / .3)',
        itemLabelStrokeWidth: 1,
        lineColor: '#ffffff',
        lineWidth: 2,
        borderColor: '#6d28d9',
        borderWidth: 4,
        radius: .92,
        pointerAngle: 0,
        isInteractive: false
      });
      scene._pickerWheel = wheel;
      return wheel;
    } catch (error) {
      console.error('Could not initialize the offline learner wheel:', error);
      wheelScene.classList.add('picker-wheel-scene--unavailable');
      return null;
    }
  }
  function capsuleMarkup(names) {
    return names.map((name, index) => {
      const row = Math.floor(index / 9);
      const column = index % 9;
      const x = 6 + column * 10.5 + (row % 2 ? 2.5 : 0);
      const y = 49 + row * 9;
      const tilt = (index * 17) % 30 - 15;
      return `<i style="--item:${index};--capsule-x:${x}%;--capsule-y:${y}%;--capsule-tilt:${tilt}deg" title="${esc(name)}"><span>${esc(name.slice(0, 1))}</span></i>`;
    }).join('');
  }
  function sceneMarkup(theme, learners) {
    const names = learners.slice(0, 36).map(learner => learnerName(learner).split(/[ ,]/)[0]).filter(Boolean);
    if (theme === 'carnival-wheel') return `<div class="carnival-board" aria-hidden="true"><div class="carnival-board__canopy"></div><div class="carnival-board__roster">${carnivalRoster(learners)}</div></div>`;
    if (theme === 'arcade-capsule') return `<div class="capsule-machine" aria-hidden="true"><div class="capsule-machine__glass">${capsuleMarkup(names)}</div><div class="capsule-machine__chute"><b></b><span class="capsule-machine__winner"></span></div></div>`;
    if (theme === 'wheel-of-learners') return wheelSceneMarkup();
    if (theme === 'mystery-cards') return `<div class="mystery-deck" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<i style="--item:${index}"><span>?</span></i>`).join('')}<b class="mystery-deck__winner"></b></div>`;
    if (theme === 'galaxy-scanner') return `<div class="galaxy-field" aria-hidden="true"><i class="galaxy-field__planet"></i><b class="galaxy-field__planet-name"></b><i class="galaxy-field__beam"></i>${names.slice(0, 10).map((name, index) => `<span style="--item:${index};--items:${Math.max(Math.min(names.length, 10), 1)}">${esc(name.slice(0, 1))}</span>`).join('')}</div>`;
    return `<div class="game-show-stage" aria-hidden="true"><i class="game-show-stage__curtain game-show-stage__curtain--left"></i><i class="game-show-stage__curtain game-show-stage__curtain--right"></i><i class="game-show-stage__spotlight"></i><span>WHO WILL IT BE?</span><div class="game-show-roster">${learners.slice(0,40).map(learner => `<i class="game-show-roster__learner" data-roster-learner="${esc(learner.id)}">${avatar(learner,'sm')}<b>${esc(learnerName(learner))}</b></i>`).join('')}</div></div>`;
  }
  function speedOptions(selected, tool) {
    const speeds = tool === 'picker'
      ? [['quick','Fast'],['normal','Average'],['relaxed','Slow']]
      : [['relaxed','Relaxed'],['normal','Normal'],['quick','Quick']];
    return speeds.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }
  function wheelSizeOptions(selected) {
    return [['small','Small'],['medium','Medium'],['large','Large']]
      .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  }
  function addExperienceToolbar(tool, root) {
    if (!root || root.querySelector(`[data-experience-toolbar="${tool}"]`)) return;
    const host = tool === 'picker'
      ? root.querySelector('.picker-toolbar')
      : root.querySelector('.tool-control-strip__actions');
    if (!host) return;
    const toolbar = document.createElement('div');
    const isWheelPicker = tool === 'picker' && selectedTheme('picker') === 'wheel-of-learners';
    toolbar.className = 'experience-toolbar' + (isWheelPicker ? ' experience-toolbar--wheel' : '') + ' no-print';
    toolbar.dataset.experienceToolbar = tool;
    const animationActions = tool === 'groups'
      ? '<button class="btn btn-ghost btn-sm" type="button" data-reveal hidden>Reveal Now</button><button class="btn btn-ghost btn-sm" type="button" data-replay disabled>Replay Animation</button>'
      : '';
    toolbar.innerHTML = `<label class="experience-sound"><input type="checkbox" ${soundEnabled(tool) ? 'checked' : ''}> Sound</label><label class="experience-toolbar__speed">${isWheelPicker ? 'Wheel speed' : 'Speed'} <select class="field-select" data-animation-speed>${speedOptions(animationSpeed(tool), tool)}</select></label>${isWheelPicker ? `<label class="experience-toolbar__size">Wheel size <select class="field-select" data-wheel-size>${wheelSizeOptions(wheelSize())}</select></label>` : ''}<button class="btn btn-primary btn-sm" type="button" data-present>${tool === 'picker' ? 'Present Picker' : 'Presentation Mode'}</button>${animationActions}`;
    toolbar.querySelector('input').addEventListener('change', event => setSound(tool, event.target.checked));
    toolbar.querySelector('[data-animation-speed]').addEventListener('change', event => setAnimationSpeed(tool, event.target.value));
    toolbar.querySelector('[data-wheel-size]')?.addEventListener('change', event => setWheelSize(event.target.value, root));
    toolbar.querySelector('[data-present]').addEventListener('click', () => fullscreen(tool === 'picker' ? root.querySelector('.name-picker-stage') : root));
    toolbar.querySelector('[data-reveal]')?.addEventListener('click', () => {
      if (!revealGroupsNow()) globalScope.TeacherTools?.revealGroupsNow?.();
    });
    toolbar.querySelector('[data-replay]')?.addEventListener('click', replayGroups);
    host.appendChild(toolbar);
  }
  function enhancePicker(root, learners = []) {
    if (!root) return;
    if (state.pickerRoot && state.pickerRoot !== root) {
      cancelPicker();
      disposePickerWheel(state.pickerRoot.querySelector('.picker-experience-scene'));
    }
    state.pickerRoot = root;
    const theme = selectedTheme('picker');
    root.dataset.toolTheme = theme;
    root.dataset.experience = 'picker';
    const stage = root.querySelector('.name-picker-stage');
    if (!stage) return;
    let scene = stage.querySelector('.picker-experience-scene');
    const rosterKey = learners.map(learner => String(learner.id)).join('|');
    if (!scene || scene.dataset.sceneTheme !== theme || scene.dataset.rosterKey !== rosterKey) {
      disposePickerWheel(scene);
      scene?.remove(); scene = document.createElement('div');
      scene.className = 'picker-experience-scene'; scene.dataset.sceneTheme = theme; scene.dataset.rosterKey = rosterKey;
      scene.innerHTML = sceneMarkup(theme, learners); stage.prepend(scene);
    }
    if (theme === 'wheel-of-learners') {
      stage.dataset.wheelSize = wheelSize();
      initPickerWheelScene(scene, learners);
    } else delete stage.dataset.wheelSize;
    stage.dataset.experienceLabel = pickerThemes[theme];
    addExperienceToolbar('picker', root);
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
  function carnivalLearnerNode(root, learnerId) {
    return [...(root?.querySelectorAll('[data-carnival-learner]') || [])]
      .find(node => node.dataset.carnivalLearner === String(learnerId)) || null;
  }
  function highlightCarnivalLearner(animation, tick, totalTicks) {
    const learners = animation.learners;
    if (!learners.length) return;
    const offset = Math.max(0, totalTicks - 1 - tick);
    const index = ((animation.selectedIndex - offset) % learners.length + learners.length) % learners.length;
    const activeId = learners[index]?.id;
    animation.root.querySelectorAll('[data-carnival-learner]').forEach(node => {
      node.classList.toggle('is-active', node.dataset.carnivalLearner === String(activeId));
      node.classList.remove('is-lucky');
    });
  }
  function resetCarnivalScene(root) {
    root?.classList.remove('carnival-winner-flight');
    root?.querySelectorAll('[data-carnival-learner]').forEach(node => node.classList.remove('is-active', 'is-lucky'));
    document.querySelectorAll('[data-carnival-flight]').forEach(node => node.remove());
  }
  function promoteCarnivalWinner(animation) {
    const source = carnivalLearnerNode(animation.root, animation.selected.id);
    const target = animation.root.querySelector('#namePickerRouletteAvatar');
    if (!source) return;
    animation.root.querySelectorAll('[data-carnival-learner]').forEach(node => node.classList.remove('is-active', 'is-lucky'));
    source.classList.add('is-active', 'is-lucky');
    if (!target || isReduced() || typeof source.animate !== 'function') return;
    const from = source.getBoundingClientRect(), to = target.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const flyer = source.cloneNode(true);
    flyer.className = 'carnival-board__learner carnival-board__learner--flying';
    flyer.dataset.carnivalFlight = 'true';
    Object.assign(flyer.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(flyer);
    animation.root.classList.add('carnival-winner-flight');
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(1.2, Math.min(2.2, to.width / from.width));
    const flight = flyer.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * .7}px,${dy * .7 - 24}px) scale(${scale * .82})`, opacity: 1, offset: .7 },
      { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: 0 }
    ], { duration: 650, easing: 'cubic-bezier(.2,.85,.2,1)', fill: 'forwards' });
    flight.finished.catch(() => {}).finally(() => flyer.remove());
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
    if (animation?.wheelInstance) {
      animation.wheelInstance.onCurrentIndexChange = null;
      animation.wheelInstance.onRest = null;
    }
    if (!animation?.done) resetCarnivalScene(root);
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
    const wheelScene = root.querySelector('.picker-wheel-scene');
    wheelScene?.classList.add('is-revealed');
    const wheelHub = wheelScene?.querySelector('.picker-wheel-hub');
    if (wheelHub) wheelHub.textContent = (animation.selected.firstName || luckyName).slice(0, 1).toUpperCase();
    cleanPicker(animation);
    stage?.classList.add('experience-revealed');
    if (selectedTheme('picker') === 'carnival-wheel') promoteCarnivalWinner(animation);
    if (soundEnabled('picker')) tone('reveal');
    if (!isReduced()) globalScope.TeacherTools?.launchSelectionConfetti?.(avatarNode || stage);
    state.pickerAnimation = null;
    animation.onComplete?.({ skipped });
  }
  function startWheelPicker(root, stage, learners, selected, onComplete, profile, pick) {
    const scene = stage?.querySelector('.picker-experience-scene');
    const wheel = initPickerWheelScene(scene, learners);
    const selectedIndex = wheel?.items?.findIndex(item => String(item.value) === String(selected.id)) ?? -1;
    if (!wheel || selectedIndex < 0) {
      if (pick) pick.disabled = false;
      return false;
    }
    root.classList.add('experience-running');
    root.setAttribute('aria-busy', 'true');
    stage.classList.remove('experience-revealed');
    const wheelScene = scene.querySelector('.picker-wheel-scene');
    wheelScene?.classList.remove('is-revealed');
    const status = root.querySelector('.name-picker-stage__status');
    if (status) {
      status.textContent = profile.label;
      status.setAttribute('aria-live', 'polite');
    }
    const animation = {
      root, stage, learners, selected, onComplete, done: false,
      selectedIndex, wheelInstance: wheel
    };
    state.pickerAnimation = animation;
    wheel.onCurrentIndexChange = ({ currentIndex }) => {
      const learner = learners[currentIndex];
      const hub = wheelScene?.querySelector('.picker-wheel-hub');
      if (hub && learner) hub.textContent = wheelLabel(learner).slice(0, 1).toUpperCase();
      if (soundEnabled('picker')) tone('tick');
    };
    wheel.onRest = () => finishPicker(animation, false);
    const speedProfile = {
      quick: { duration: 1800, revolutions: 3 },
      normal: { duration: 3500, revolutions: 5 },
      relaxed: { duration: 6000, revolutions: 7 }
    }[animationSpeed('picker')] || { duration: 3500, revolutions: 5 };
    wheel.spinToItem(selectedIndex, speedProfile.duration, true, speedProfile.revolutions, 1, value => 1 - Math.pow(1 - value, 4));
    return true;
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
    resetCarnivalScene(root);
    if (theme === 'wheel-of-learners') return startWheelPicker(root, stage, learners, selected, onComplete, profile, pick);
    if (theme === 'carnival-wheel') {
      const name = root.querySelector('#namePickerRouletteName');
      const avatarNode = root.querySelector('#namePickerRouletteAvatar');
      if (name) { name.textContent = 'Who will it be?'; name.classList.remove('is-revealed', 'is-ticking'); }
      if (avatarNode) { avatarNode.innerHTML = ''; avatarNode.classList.add('is-empty'); avatarNode.classList.remove('is-revealed', 'is-ticking'); }
    }
    root.classList.add('experience-running'); root.setAttribute('aria-busy', 'true'); stage?.classList.remove('experience-revealed');
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
          if (theme === 'carnival-wheel') highlightCarnivalLearner(animation, nextTick, profile.tickCount);
          else showPickerCandidate(root, learners[globalScope.TeacherToolsCore.secureRandomInt(learners.length)]);
          if (soundEnabled('picker')) tone('tick');
        }
      },
      onFinish: ({ skipped }) => finishPicker(animation, skipped),
      onCancel: () => cleanPicker(animation)
    });
    return true;
  }
  function cancelPicker() {
    const wheelAnimation = state.pickerAnimation?.wheelInstance ? state.pickerAnimation : null;
    if (wheelAnimation) {
      wheelAnimation.wheelInstance.onRest = null;
      wheelAnimation.wheelInstance.onCurrentIndexChange = null;
      wheelAnimation.wheelInstance.stop();
      cleanPicker(wheelAnimation);
      state.pickerAnimation = null;
      return true;
    }
    const cancelled = globalScope.TeacherToolsAnimationEngine?.cancel('name-picker') || false;
    if (cancelled) state.pickerAnimation = null;
    return cancelled;
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
    const completed = revealGroupsNow();
    if (document.fullscreenElement) document.exitFullscreen?.();
    if (completed) event.preventDefault();
  });

  const api = {
    pickerThemes, groupThemes, legacyPickerThemes, legacyGroupThemes,
    selectedTheme, enhancePicker, enhanceGroups, animatePicker, cancelPicker,
    animateGroups, revealGroupsNow, cancelGroups, replayGroups, fullscreen
  };
  globalScope.TeacherToolExperiences = api;
})(window);
