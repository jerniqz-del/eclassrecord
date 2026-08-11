(function initTeacherToolsAnimationEngine(globalScope) {
  'use strict';

  const tasks = new Map();
  const SPEED_FACTORS = Object.freeze({ relaxed: 1.3, normal: 1, quick: 0.68 });

  function prefersReducedMotion() {
    return Boolean(globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      || document.documentElement.dataset.performanceMode === 'low'
      || document.body.classList.contains('low-spec-mode');
  }

  function duration(baseDuration, speed = 'normal') {
    return Math.max(120, Math.round(Number(baseDuration || 0) * (SPEED_FACTORS[speed] || 1)));
  }

  function dispose(task, outcome) {
    if (!task || task.done) return false;
    task.done = true;
    if (task.frame) globalScope.cancelAnimationFrame?.(task.frame);
    tasks.delete(task.id);
    task.root?.removeAttribute('data-animation-state');
    if (outcome === 'cancelled') task.onCancel?.();
    else task.onFinish?.({ skipped: outcome === 'skipped' });
    return true;
  }

  function start(options) {
    const id = String(options?.id || 'teacher-tool-animation');
    cancel(id);
    const task = {
      id,
      root: options.root || null,
      duration: duration(options.duration, options.speed),
      elapsed: 0,
      lastTime: null,
      frame: 0,
      done: false,
      onFrame: options.onFrame,
      onFinish: options.onFinish,
      onCancel: options.onCancel
    };
    tasks.set(id, task);
    task.root?.setAttribute('data-animation-state', 'running');
    options.onStart?.();

    if (prefersReducedMotion() || options.immediate) {
      task.onFrame?.(1, { elapsed: task.duration, duration: task.duration });
      dispose(task, 'finished');
      return task;
    }

    const tick = time => {
      if (task.done) return;
      if (task.lastTime === null) task.lastTime = time;
      const delta = Math.min(64, Math.max(0, time - task.lastTime));
      task.lastTime = time;
      task.elapsed = Math.min(task.duration, task.elapsed + delta);
      const progress = task.duration ? task.elapsed / task.duration : 1;
      task.onFrame?.(progress, { elapsed: task.elapsed, duration: task.duration });
      if (progress >= 1) dispose(task, 'finished');
      else task.frame = globalScope.requestAnimationFrame(tick);
    };
    task.frame = globalScope.requestAnimationFrame(tick);
    return task;
  }

  function finish(id) {
    const task = tasks.get(String(id));
    if (!task || task.done) return false;
    task.onFrame?.(1, { elapsed: task.duration, duration: task.duration });
    task.root?.setAttribute('data-animation-state', 'skipped');
    return dispose(task, 'skipped');
  }

  function cancel(id) {
    const task = tasks.get(String(id));
    return task ? dispose(task, 'cancelled') : false;
  }

  function cancelAll() {
    [...tasks.keys()].forEach(cancel);
  }

  function running(id) { return tasks.has(String(id)); }

  globalScope.TeacherToolsAnimationEngine = {
    SPEED_FACTORS, prefersReducedMotion, duration, start, finish, cancel, cancelAll, running
  };
})(window);
