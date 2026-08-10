(function initDashboardClassPanel(globalScope) {
  'use strict';

  const baseRenderDashboardOverview = globalScope.renderDashboardOverview;
  let classModal = null;

  function arrangeClassPanel() {
    const table = document.getElementById('dashboardTable');
    const advisoryHost = document.getElementById('dashboardAdvisoryPinned');
    const count = document.getElementById('dashboardClassPanelCount');
    const grid = table?.querySelector('.dashboard-cards-grid');
    if (!grid || !advisoryHost) return;

    const advisory = grid.querySelector('[data-dashboard-fixed="true"]');
    if (advisory) advisoryHost.replaceChildren(advisory);
    else advisoryHost.replaceChildren();
    grid.querySelector('.dashboard-card--add')?.remove();
    grid.classList.add('dashboard-cards--rail');
    const classCards = grid.querySelectorAll('[data-assignment-id]');
    if (!classCards.length) grid.innerHTML = '<div class="dashboard-class-panel__empty">No teaching loads yet. Use Add Class to create one.</div>';
    if (count) count.textContent = `${classCards.length} class${classCards.length === 1 ? '' : 'es'}`;

    const headerToggle = document.getElementById('dashboardViewToggle');
    if (headerToggle) headerToggle.style.display = 'none';
  }

  function closeClassModal() {
    if (!classModal) return;
    document.removeEventListener('keydown', handleModalKeydown);
    classModal.remove();
    classModal = null;
  }

  function handleModalKeydown(event) {
    if (event.key === 'Escape') closeClassModal();
  }

  globalScope.setDashboardClassModalView = function setDashboardClassModalView(mode) {
    if (!classModal) return;
    const nextMode = mode === 'list' ? 'list' : 'grid';
    localStorage.setItem('dashboard_view_mode', nextMode);
    const grid = classModal.querySelector('.dashboard-cards-grid');
    if (!grid) return;
    grid.classList.toggle('dashboard-cards--grid', nextMode === 'grid');
    grid.classList.toggle('dashboard-cards--list', nextMode === 'list');
    grid.querySelectorAll('.dashboard-card').forEach(card => card.classList.toggle('dashboard-card--list', nextMode === 'list'));
    classModal.querySelectorAll('[data-class-modal-view]').forEach(button => {
      const active = button.dataset.classModalView === nextMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  globalScope.openDashboardClassesFullView = function openDashboardClassesFullView() {
    closeClassModal();
    const sourceGrid = document.querySelector('#dashboardTable .dashboard-cards-grid');
    const sourceAdvisory = document.querySelector('#dashboardAdvisoryPinned [data-dashboard-fixed="true"]');
    if (!sourceGrid) return;
    const mode = localStorage.getItem('dashboard_view_mode') === 'list' ? 'list' : 'grid';
    const fullGrid = document.createElement('div');
    fullGrid.className = `dashboard-cards-grid dashboard-cards--${mode}`;
    if (sourceAdvisory) fullGrid.appendChild(sourceAdvisory.cloneNode(true));
    sourceGrid.querySelectorAll('[data-assignment-id]').forEach(card => fullGrid.appendChild(card.cloneNode(true)));

    classModal = document.createElement('div');
    classModal.className = 'modal-overlay dashboard-class-modal-overlay';
    classModal.innerHTML = `
      <section class="dashboard-class-modal" role="dialog" aria-modal="true" aria-labelledby="dashboardClassModalTitle">
        <header class="dashboard-class-modal__header">
          <div><p class="workplace-hero__eyebrow">Teaching workspace</p><h2 id="dashboardClassModalTitle">My Classes &amp; Advisory</h2><p>Open a class, review its term summary, export final grades, or run reports.</p></div>
          <div class="dashboard-class-modal__controls">
            <div class="dashboard-class-modal__view-toggle" aria-label="Class view mode">
              <button type="button" data-class-modal-view="grid" onclick="setDashboardClassModalView('grid')">Grid</button>
              <button type="button" data-class-modal-view="list" onclick="setDashboardClassModalView('list')">List</button>
            </div>
            <button class="btn btn-primary btn-sm" type="button" data-class-modal-add>Add Class</button>
            <button class="btn btn-cancel btn-sm" type="button" data-class-modal-close>Close</button>
          </div>
        </header>
        <div class="dashboard-class-modal__body"></div>
      </section>`;
    classModal.querySelector('.dashboard-class-modal__body').appendChild(fullGrid);
    classModal.querySelector('[data-class-modal-close]').addEventListener('click', closeClassModal);
    classModal.querySelector('[data-class-modal-add]').addEventListener('click', () => {
      closeClassModal();
      showAddClassLoadModal();
    });
    classModal.addEventListener('click', event => {
      if (event.target === classModal) closeClassModal();
      const card = event.target.closest('[data-assignment-id], [data-dashboard-fixed="true"]');
      if (card && !event.target.closest('button, input, select, textarea, a')) setTimeout(closeClassModal, 0);
    });
    document.body.appendChild(classModal);
    document.addEventListener('keydown', handleModalKeydown);
    globalScope.setDashboardClassModalView(mode);
    setTimeout(() => classModal?.querySelector('[data-class-modal-close]')?.focus(), 0);
  };

  globalScope.addDashboardClassFromPanel = function addDashboardClassFromPanel() {
    showAddClassLoadModal();
  };

  globalScope.renderDashboardOverview = function renderDashboardOverviewWithClassPanel() {
    baseRenderDashboardOverview();
    arrangeClassPanel();
  };
})(window);
