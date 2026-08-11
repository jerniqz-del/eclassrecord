(function initTeacherToolExperienceAdapters(globalScope) {
  'use strict';

  const picker = Object.freeze({
    'carnival-wheel': { duration: 3300, tickCount: 28, label: 'Spinning the prize wheel…' },
    'arcade-capsule': { duration: 3000, tickCount: 22, label: 'Mixing the capsules…' },
    'mystery-cards': { duration: 2800, tickCount: 18, label: 'Shuffling the mystery deck…' },
    'galaxy-scanner': { duration: 3200, tickCount: 24, label: 'Scanning learner signals…' },
    'game-show': { duration: 3100, tickCount: 21, label: 'Searching with the spotlight…' }
  });

  const groups = Object.freeze({
    'draft-arena': { duration: 2700, label: 'Drafting learners into teams…' },
    'space-crew': { duration: 2900, label: 'Boarding the space crews…' },
    'island-expedition': { duration: 3000, label: 'Sending expeditions to their islands…' },
    'house-sorting': { duration: 2850, label: 'Sorting learners into houses…' },
    'puzzle-party': { duration: 2600, label: 'Snapping the teams together…' }
  });

  function easeOutQuart(value) { return 1 - Math.pow(1 - value, 4); }
  function easeInOut(value) { return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2; }

  function pickerFrame(theme, progress, context) {
    const stage = context.stage;
    const eased = easeOutQuart(progress);
    stage?.style.setProperty('--experience-progress', progress.toFixed(4));
    stage?.style.setProperty('--experience-eased', eased.toFixed(4));
    if (stage) stage.dataset.motionPhase = progress < 0.18 ? 'start' : progress < 0.78 ? 'mix' : progress < 1 ? 'lock' : 'reveal';
    if (theme === 'carnival-wheel') {
      const segment = 360 / Math.max(context.learners.length, 1);
      const target = 360 - ((context.selectedIndex + 0.5) * segment);
      stage?.style.setProperty('--wheel-angle', `${Math.round((eased * 1800) + (target * eased))}deg`);
    } else if (theme === 'galaxy-scanner') {
      stage?.style.setProperty('--scanner-angle', `${Math.round(eased * 1440)}deg`);
    } else if (theme === 'game-show') {
      stage?.style.setProperty('--spotlight-offset', `${Math.sin(progress * Math.PI * 8) * (1 - eased) * 42}%`);
    }
  }

  function groupKeyframes(theme, index, total) {
    const direction = index % 2 ? 1 : -1;
    const spread = Math.min(460, 160 + total * 7);
    if (theme === 'space-crew') return [
      { transform: `translate(${direction * spread}px, 220px) scale(.3) rotate(${direction * 20}deg)`, opacity: 0 },
      { transform: `translate(${direction * 35}px, -20px) scale(1.08)`, opacity: 1, offset: .76 },
      { transform: 'none', opacity: 1 }
    ];
    if (theme === 'island-expedition') return [
      { transform: `translate(${direction * spread}px, 120px) rotate(${direction * 8}deg)`, opacity: .1 },
      { transform: `translate(${direction * 18}px, -8px) rotate(${direction * -2}deg)`, opacity: 1, offset: .82 },
      { transform: 'none', opacity: 1 }
    ];
    if (theme === 'house-sorting') return [
      { transform: 'translateY(-130px) scale(.68) rotateY(80deg)', opacity: 0 },
      { transform: 'translateY(10px) scale(1.05) rotateY(0)', opacity: 1, offset: .78 },
      { transform: 'none', opacity: 1 }
    ];
    if (theme === 'puzzle-party') return [
      { transform: `translate(${direction * spread}px, ${index % 3 * 90 - 90}px) rotate(${direction * 25}deg) scale(.55)`, opacity: 0 },
      { transform: `translate(${direction * 12}px, 0) rotate(${direction * -3}deg) scale(1.04)`, opacity: 1, offset: .8 },
      { transform: 'none', opacity: 1 }
    ];
    return [
      { transform: `translate(${direction * spread}px, -90px) scale(.65)`, opacity: 0 },
      { transform: `translate(${direction * 14}px, 6px) scale(1.06)`, opacity: 1, offset: .8 },
      { transform: 'none', opacity: 1 }
    ];
  }

  globalScope.TeacherToolExperienceAdapters = {
    picker, groups, pickerFrame, groupKeyframes, easeOutQuart, easeInOut
  };
})(window);
