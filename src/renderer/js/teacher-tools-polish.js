(function initTeacherToolsPolish(globalScope) {
  'use strict';

  const lastTool = new WeakMap();
  function reduced() {
    return Boolean(globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      || document.documentElement.dataset.performanceMode === 'low'
      || document.body.classList.contains('low-spec-mode');
  }
  function decorate(container) {
    if (!container) return;
    const tool = container.dataset.activeTool || '';
    if (!tool || lastTool.get(container) === tool) return;
    lastTool.set(container, tool);
    const root = container.firstElementChild;
    if (!root || reduced()) return;
    root.classList.add('tool-polish-enter');
    const surfaces = root.querySelectorAll(':scope > *, .teacher-tool__body > *, .classroom-workspace > section, .group-result');
    [...surfaces].slice(0, 18).forEach((surface, index) => {
      surface.style.setProperty('--polish-index', String(index));
      surface.classList.add('tool-polish-stagger');
    });
    setTimeout(() => {
      root.classList.remove('tool-polish-enter');
      surfaces.forEach(surface => surface.classList.remove('tool-polish-stagger'));
    }, 1400);
  }
  function observe(id) {
    const container = document.getElementById(id);
    if (!container) return;
    new MutationObserver(() => decorate(container)).observe(container, { childList: true, subtree: false, attributes: true, attributeFilter: ['data-active-tool'] });
    decorate(container);
  }
  function addRipple(event) {
    if (reduced()) return;
    const button = event.target.closest('#teacherToolsView .btn,#teacherToolsView .tool-segmented button,#teacherToolsView .game-tool__switcher button,#performanceChecklistContent .btn');
    if (!button || button.disabled) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'tool-button-ripple';
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }
  function tiltCard(event) {
    if (reduced()) return;
    const card = event.target.closest('.teacher-tool-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const ratio = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
    card.style.setProperty('--tool-card-rotate', `${ratio * 1.4}deg`);
  }
  globalScope.addEventListener('DOMContentLoaded', () => {
    observe('teacherToolsContent');
    observe('performanceChecklistContent');
    document.addEventListener('pointerdown', addRipple);
    document.addEventListener('pointermove', tiltCard, { passive: true });
  });
})(window);
