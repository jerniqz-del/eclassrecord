/**
 * Advisory Class dashboard card, summary, and school-year setup dialog.
 */
(function initAdvisoryDashboard(globalScope) {
  'use strict';

  function getClassForYear(profileDb, schoolYear) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    return store.classes.find(item => item.schoolYear === schoolYear && item.isActive && !item.isArchived)
      || store.classes.find(item => item.schoolYear === schoolYear && !item.isArchived)
      || null;
  }

  function summarize(profileDb, advisoryClass) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    if (!advisoryClass) {
      return {
        learners: 0,
        subjects: 0,
        importedSets: 0,
        completedSets: 0,
        expectedSets: 0,
        missingGrades: 0,
        conflicts: 0,
        completionPercent: 0
      };
    }

    const learners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id && item.enrollmentStatus !== 'inactive');
    const subjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id);
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    const importedSets = new Set(store.importBatches
      .filter(item => item.advisoryClassId === advisoryClass.id && item.status !== 'undone' && item.status !== 'rolled-back')
      .map(item => `${String(item.subject).trim().toUpperCase()}|${item.term}`)).size;
    const validGradeKeys = new Set(grades
      .filter(item => item.validationStatus === 'valid' && (item.conflictStatus === 'none' || item.conflictStatus === 'resolved'))
      .map(item => `${item.advisoryLearnerId}|${item.advisorySubjectId}|${item.term}`));
    const expectedSets = subjects.length * 3;
    let completedSets = 0;
    subjects.forEach(subject => {
      ['1', '2', '3'].forEach(term => {
        if (learners.length > 0 && learners.every(learner => validGradeKeys.has(`${learner.id}|${subject.id}|${term}`))) {
          completedSets++;
        }
      });
    });
    const expectedGrades = learners.length * expectedSets;
    const validGrades = validGradeKeys.size;
    const conflicts = grades.filter(item => item.conflictStatus && !['none', 'resolved'].includes(item.conflictStatus)).length;
    return {
      learners: learners.length,
      subjects: subjects.length,
      importedSets,
      completedSets,
      expectedSets,
      missingGrades: Math.max(0, expectedGrades - validGrades),
      conflicts,
      completionPercent: expectedGrades > 0 ? Math.round((Math.min(validGrades, expectedGrades) / expectedGrades) * 100) : 0
    };
  }

  function renderCard(profileDb, schoolYear, viewMode, escapeHtml) {
    const escHtml = typeof escapeHtml === 'function'
      ? escapeHtml
      : value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const advisoryClass = getClassForYear(profileDb, schoolYear);
    const summary = summarize(profileDb, advisoryClass);
    const listClass = viewMode === 'list' ? ' dashboard-card--list' : '';
    const identity = advisoryClass
      ? `Grade ${escHtml(advisoryClass.gradeLevel)} - ${escHtml(advisoryClass.section)}`
      : 'Not configured';
    const adviser = advisoryClass && advisoryClass.adviserName
      ? escHtml(advisoryClass.adviserName)
      : 'Set up the official class roster and adviser details.';
    const progressText = summary.expectedSets > 0
      ? `${summary.completedSets} of ${summary.expectedSets} subject-term sets complete`
      : 'Configure subjects to begin grade consolidation';

    return `
      <article class="dashboard-card dashboard-card--advisory${listClass}" draggable="false"
        data-dashboard-fixed="true" data-advisory-class-id="${advisoryClass ? escHtml(advisoryClass.id) : ''}"
        aria-label="Advisory Class" onclick="openAdvisoryClassDashboard(event)">
        <div class="dashboard-card__identity advisory-card__identity">
          <span class="advisory-card__eyebrow">Fixed first card</span>
          <h3 class="dashboard-card__title">Advisory Class</h3>
          <div class="dashboard-card__subject">${identity} &middot; SY ${escHtml(schoolYear)}</div>
          <div class="advisory-card__adviser">${adviser}</div>
        </div>
        <div class="dashboard-card__students-details advisory-card__stats" aria-label="Advisory Class summary">
          <span><strong>${summary.learners}</strong> learners</span>
          <span><strong>${summary.subjects}</strong> subjects</span>
          <span><strong>${summary.importedSets}</strong> imports</span>
        </div>
        <div class="advisory-card__progress">
          <div class="advisory-card__progress-copy">
            <span>${progressText}</span>
            <strong>${summary.completionPercent}%</strong>
          </div>
          <div class="advisory-card__progress-bar" aria-hidden="true"><span style="width:${summary.completionPercent}%"></span></div>
        </div>
        <div class="advisory-card__status">
          <span class="advisory-card__status-item ${summary.missingGrades ? 'is-warning' : ''}">${summary.missingGrades} missing grades</span>
          <span class="advisory-card__status-item ${summary.conflicts ? 'is-conflict' : ''}">${summary.conflicts} unresolved conflicts</span>
        </div>
        <div class="dashboard-card__actions advisory-card__actions" onclick="event.stopPropagation();">
          <button class="btn btn-primary btn-sm" type="button" onclick="openAdvisoryClassDashboard(event)">
            ${advisoryClass ? 'Open Advisory Class' : 'Set Up Advisory Class'}
          </button>
          ${advisoryClass ? '<button class="btn btn-ghost btn-sm" type="button" onclick="showAdvisoryClassSetupModal()">Edit Details</button>' : ''}
        </div>
      </article>
    `;
  }

  function currentClass() {
    const schoolYear = globalScope.db?.schoolYear || '2026-2027';
    return getClassForYear(globalScope.db, schoolYear);
  }

  function showSetupModal() {
    const profileDb = globalScope.db;
    if (!profileDb) return;
    const schoolYear = profileDb.schoolYear || '2026-2027';
    const existing = getClassForYear(profileDb, schoolYear);
    const escHtml = globalScope.esc || (value => String(value ?? ''));
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('data-advisory-setup-modal', 'true');
    overlay.innerHTML = `
      <div class="modal modal--wide advisory-setup-modal" role="dialog" aria-modal="true" aria-labelledby="advisorySetupTitle">
        <div class="modal__title" id="advisorySetupTitle">${existing ? 'Edit' : 'Set Up'} Advisory Class</div>
        <div class="modal__body advisory-setup-modal__body">
          <p class="text-muted" style="margin-top:0">This is the adviser&apos;s central record for School Year ${escHtml(schoolYear)}. Previous school-year records are preserved.</p>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisoryGradeLevel">Grade Level</label><input class="field-input" id="advisoryGradeLevel" value="${escHtml(existing?.gradeLevel || '')}" inputmode="numeric" required /></div>
            <div class="field"><label class="field-label" for="advisorySection">Section</label><input class="field-input" id="advisorySection" value="${escHtml(existing?.section || '')}" required /></div>
          </div>
          <div class="field"><label class="field-label" for="advisoryAdviserName">Adviser Name</label><input class="field-input" id="advisoryAdviserName" value="${escHtml(existing?.adviserName || profileDb.teacherName || '')}" required /></div>
          <div class="field"><label class="field-label" for="advisorySchoolName">School Name</label><input class="field-input" id="advisorySchoolName" value="${escHtml(existing?.schoolName || profileDb.schoolName || '')}" /></div>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisorySchoolId">School ID</label><input class="field-input" id="advisorySchoolId" value="${escHtml(existing?.schoolId || profileDb.schoolId || '')}" /></div>
            <div class="field"><label class="field-label" for="advisoryDistrict">District</label><input class="field-input" id="advisoryDistrict" value="${escHtml(existing?.district || '')}" /></div>
          </div>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisoryDivision">Division</label><input class="field-input" id="advisoryDivision" value="${escHtml(existing?.division || profileDb.division || '')}" /></div>
            <div class="field"><label class="field-label" for="advisoryRegion">Region</label><input class="field-input" id="advisoryRegion" value="${escHtml(existing?.region || profileDb.region || '')}" /></div>
          </div>
          ${existing ? '<label class="checkbox-row"><input type="checkbox" id="advisoryArchived" ' + (existing.isArchived ? 'checked' : '') + '> Archive this Advisory Class</label>' : ''}
        </div>
        <div class="modal__actions">
          <button class="btn btn-cancel btn-sm" type="button" data-advisory-cancel>Cancel</button>
          <button class="btn btn-primary btn-sm" type="button" data-advisory-save>${existing ? 'Save Changes' : 'Create Advisory Class'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-advisory-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-advisory-save]').addEventListener('click', async () => {
      const values = {
        schoolYear,
        gradeLevel: overlay.querySelector('#advisoryGradeLevel').value.trim(),
        section: overlay.querySelector('#advisorySection').value.trim(),
        adviserName: overlay.querySelector('#advisoryAdviserName').value.trim(),
        schoolName: overlay.querySelector('#advisorySchoolName').value.trim(),
        schoolId: overlay.querySelector('#advisorySchoolId').value.trim(),
        district: overlay.querySelector('#advisoryDistrict').value.trim(),
        division: overlay.querySelector('#advisoryDivision').value.trim(),
        region: overlay.querySelector('#advisoryRegion').value.trim(),
        isActive: existing ? !overlay.querySelector('#advisoryArchived').checked : true,
        isArchived: existing ? overlay.querySelector('#advisoryArchived').checked : false
      };
      if (!values.gradeLevel || !values.section || !values.adviserName) {
        globalScope.toast('Grade level, section, and adviser name are required.', 'warning');
        return;
      }
      try {
        if (existing) globalScope.AdvisoryData.updateClass(profileDb, existing.id, values);
        else globalScope.AdvisoryData.createClass(profileDb, values);
        await globalScope.saveDatabase();
        close();
        globalScope.renderDashboardOverview();
        globalScope.toast(existing ? 'Advisory Class details updated.' : 'Advisory Class created.', 'success');
      } catch (error) {
        console.error('Advisory Class setup failed:', error);
        globalScope.toast(error.message || 'Advisory Class could not be saved.', 'error');
      }
    });
    setTimeout(() => overlay.querySelector('#advisoryGradeLevel').focus(), 50);
  }

  function openDashboard(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const advisoryClass = currentClass();
    if (!advisoryClass) {
      showSetupModal();
      return;
    }
    // Phase 3 replaces this setup entry point with the complete roster workspace.
    showSetupModal();
  }

  const api = { getClassForYear, summarize, renderCard, showSetupModal, currentClass };
  globalScope.AdvisoryDashboard = api;
  globalScope.showAdvisoryClassSetupModal = showSetupModal;
  globalScope.openAdvisoryClassDashboard = openDashboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
