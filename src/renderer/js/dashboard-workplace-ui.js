(function initDashboardWorkplaceUi(globalScope) {
  'use strict';

  let latestSnapshot = null;
  const baseRenderDashboardOverview = globalScope.renderDashboardOverview;

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
  }

  function classLabel(assignment) {
    return assignment ? `Grade ${assignment.gradeLevel} - ${assignment.section} · ${assignment.subject}` : 'Choose a teaching load';
  }

  function dateLabel(date) {
    const value = new Date(`${date}T00:00:00`);
    return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  function remember(action, assignmentId, term) {
    if (assignmentId) db.currentAssignmentId = assignmentId;
    if (['1', '2', '3'].includes(String(term || ''))) {
      db.currentTerm = String(term);
      if (typeof recordTab !== 'undefined') recordTab = String(term);
    }
    DashboardWorkplace.rememberContext(db, { assignmentId: db.currentAssignmentId, term: db.currentTerm, action });
    saveDatabase();
  }

  globalScope.selectDashboardWorkplaceAssignment = function selectDashboardWorkplaceAssignment(assignmentId) {
    const scrollTop = document.querySelector('#dashboardWorkplace .workplace-scroll-content')?.scrollTop || 0;
    remember('grading', assignmentId, db.currentTerm || '1');
    globalScope.renderDashboardOverview();
    requestAnimationFrame(() => {
      const scrollArea = document.querySelector('#dashboardWorkplace .workplace-scroll-content');
      if (scrollArea) scrollArea.scrollTop = scrollTop;
    });
  };

  globalScope.openDashboardWorkplaceAction = function openDashboardWorkplaceAction(action, assignmentId, term) {
    remember(action, assignmentId, term);
    if (action === 'advisory') return openAdvisoryClassDashboard();
    if (action === 'backup') return exportJson();
    if (action === 'tools') return setView('tools');
    if (!db.currentAssignmentId) return toast('Add or select a teaching load first.', 'warning');
    if (action === 'attendance') {
      setView('attendance');
      render();
      return;
    }
    if (action === 'learner' || action === 'roster') {
      setView('classes');
      render();
      setTimeout(action === 'learner' ? showAddLearnerModal : showImportRosterModal, 0);
      return;
    }
    setView('record');
    render();
    if (action === 'quick-grade') setTimeout(showQuickGradeModal, 0);
  };

  globalScope.openDashboardWorkplaceAttention = function openDashboardWorkplaceAttention(index) {
    const item = latestSnapshot?.attention?.[index];
    if (!item) return;
    if (item.type === 'advisory-conflicts' || item.type === 'advisory-missing') return globalScope.openDashboardWorkplaceAction('advisory');
    if (item.type === 'empty-class') return globalScope.openDashboardWorkplaceAction('learner', item.assignmentId, item.term);
    globalScope.openDashboardWorkplaceAction('grading', item.assignmentId, item.term);
  };

  globalScope.openDashboardWorkplaceUpcoming = function openDashboardWorkplaceUpcoming(index) {
    const item = latestSnapshot?.upcoming?.[index];
    if (!item) return;
    globalScope.openDashboardWorkplaceAction(item.assignmentId ? 'grading' : 'tools', item.assignmentId, item.term);
  };

  globalScope.showDashboardWorkplaceTaskModal = function showDashboardWorkplaceTaskModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '12000';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="workplaceTaskTitle">
        <div class="modal__title" id="workplaceTaskTitle">Add a personal task</div>
        <div class="modal__body">
          <div class="field"><label class="field-label" for="workplaceTaskName">Task</label><input class="field-input" id="workplaceTaskName" maxlength="160" placeholder="Example: Prepare remediation sheets"></div>
          <div class="field"><label class="field-label" for="workplaceTaskDue">Due date (optional)</label><input class="field-input" id="workplaceTaskDue" type="date"></div>
        </div>
        <div class="modal__actions"><button class="btn btn-cancel btn-sm" data-task-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-task-save>Add task</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-task-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-task-save]').addEventListener('click', () => {
      try {
        DashboardWorkplace.addTask(db, overlay.querySelector('#workplaceTaskName').value, overlay.querySelector('#workplaceTaskDue').value);
        saveDatabase();
        close();
        globalScope.renderDashboardOverview();
      } catch (error) {
        toast(error.message, 'warning');
        overlay.querySelector('#workplaceTaskName').focus();
      }
    });
    setTimeout(() => overlay.querySelector('#workplaceTaskName').focus(), 0);
  };

  globalScope.toggleDashboardWorkplaceTask = function toggleDashboardWorkplaceTask(taskId) {
    if (!DashboardWorkplace.toggleTask(db, taskId)) return;
    saveDatabase();
    globalScope.renderDashboardOverview();
  };

  globalScope.removeDashboardWorkplaceTask = function removeDashboardWorkplaceTask(taskId) {
    if (!DashboardWorkplace.removeTask(db, taskId)) return;
    saveDatabase();
    globalScope.renderDashboardOverview();
  };

  function renderWorkplace() {
    const target = document.getElementById('dashboardWorkplace');
    if (!target) return;
    const activeYear = db.schoolYear || '2026-2027';
    let advisorySummary = {};
    try {
      const advisoryClass = AdvisoryDashboard.getClassForYear(db, activeYear);
      advisorySummary = AdvisoryDashboard.summarize(db, advisoryClass);
    } catch (error) {
      console.warn('Dashboard Advisory summary unavailable:', error);
    }
    const snapshot = DashboardWorkplace.snapshot(db, { schoolYear: activeYear, advisorySummary });
    latestSnapshot = snapshot;
    const selectedId = snapshot.currentAssignment?.id || '';
    const options = snapshot.assignments.map(item => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(classLabel(item))}</option>`).join('');
    const attention = snapshot.attention.length
      ? snapshot.attention.slice(0, 6).map((item, index) => `<li><button class="workplace-list__item" type="button" onclick="openDashboardWorkplaceAttention(${index})"><span class="workplace-list__marker workplace-list__marker--${esc(item.severity)}"></span><span class="workplace-list__content"><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></span></button></li>`).join('')
      : '<li class="workplace-empty">You are caught up. No due grading work needs attention.</li>';
    const upcoming = snapshot.upcoming.length
      ? snapshot.upcoming.map((item, index) => `<li><button class="workplace-list__item" type="button" onclick="openDashboardWorkplaceUpcoming(${index})"><span class="workplace-date">${esc(dateLabel(item.date))}</span><span class="workplace-list__content"><strong>${esc(item.title)}</strong><span>${esc(item.detail || 'Calendar')}</span></span></button></li>`).join('')
      : '<li class="workplace-empty">No dated assessments or calendar events are coming up.</li>';
    const tasks = snapshot.tasks.length
      ? snapshot.tasks.map(item => `<li class="workplace-task ${item.completed ? 'workplace-task--complete' : ''}"><input type="checkbox" ${item.completed ? 'checked' : ''} aria-label="Mark ${esc(item.title)} complete" onchange="toggleDashboardWorkplaceTask('${esc(item.id)}')"><span class="workplace-task__content"><span class="workplace-task__title">${esc(item.title)}</span>${item.dueDate ? `<span class="workplace-task__due">Due ${esc(dateLabel(item.dueDate))}</span>` : ''}</span><button class="workplace-task__remove" type="button" aria-label="Remove ${esc(item.title)}" onclick="removeDashboardWorkplaceTask('${esc(item.id)}')">&times;</button></li>`).join('')
      : '<li class="workplace-empty">Add a reminder for work that is not already in a class record.</li>';
    const teacher = String(db.teacherName || '').trim().split(/\s+/)[0] || 'Teacher';
    target.innerHTML = `
      <section class="workplace-hero">
        <div><p class="workplace-hero__eyebrow">SY ${esc(activeYear)} · ${snapshot.stats.classes} classes · ${snapshot.stats.learners} learners</p><h2>${greeting()}, ${esc(teacher)}.</h2><p class="workplace-hero__copy">Continue Term ${esc(snapshot.currentTerm)} in ${esc(classLabel(snapshot.currentAssignment))}, or jump straight to a common task.</p></div>
        <div class="workplace-context"><label class="field-label" for="dashboardWorkplaceClass">Working class</label><select id="dashboardWorkplaceClass" class="field-select" onchange="selectDashboardWorkplaceAssignment(this.value)" ${options ? '' : 'disabled'}>${options || '<option>No teaching loads yet</option>'}</select><button class="btn btn-primary btn-sm u-mt-2" type="button" onclick="openDashboardWorkplaceAction('grading', '${esc(selectedId)}', '${esc(snapshot.currentTerm)}')" ${selectedId ? '' : 'disabled'}>Continue grading</button></div>
      </section>

      <div class="workplace-scroll-content">
      <div class="workplace-grid">
        <section class="workplace-panel"><header class="workplace-panel__header"><h3>Needs attention <span class="badge">${snapshot.attention.length}</span></h3></header><div class="workplace-panel__body"><ul class="workplace-list">${attention}</ul></div></section>
        <section class="workplace-panel"><header class="workplace-panel__header"><h3>Today &amp; upcoming</h3></header><div class="workplace-panel__body"><ul class="workplace-list">${upcoming}</ul></div></section>
        <section class="workplace-panel"><header class="workplace-panel__header"><h3>My tasks</h3><button class="btn btn-ghost btn-sm" type="button" onclick="showDashboardWorkplaceTaskModal()">Add task</button></header><div class="workplace-panel__body"><ul class="workplace-list">${tasks}</ul></div></section>
      </div>
      </div>`;
  }

  globalScope.renderDashboardOverview = function renderDashboardOverviewWithWorkplace() {
    baseRenderDashboardOverview();
    renderWorkplace();
  };
})(window);
