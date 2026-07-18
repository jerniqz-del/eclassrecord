/**
 * Advisory Class dashboard card, summary, and school-year setup dialog.
 */
(function initAdvisoryDashboard(globalScope) {
  'use strict';

  function activeDb() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
    if (!profileDb) throw new Error('The active profile database is unavailable.');
    return profileDb;
  }

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
    const subjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id && !item.isArchived);
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
    const profileDb = activeDb();
    const schoolYear = profileDb.schoolYear || '2026-2027';
    return getClassForYear(profileDb, schoolYear);
  }

  function showSetupModal() {
    const profileDb = activeDb();
    const schoolYear = profileDb.schoolYear || '2026-2027';
    const existing = getClassForYear(profileDb, schoolYear);
    if (existing) {
      globalScope.openAdvisoryClassPage?.();
      globalScope.AdvisoryGradeTransfer?.setPanelTab?.('settings', document.querySelector('.advisory-page'));
      return;
    }
    const escHtml = globalScope.esc || (value => String(value ?? ''));
    const gradeLevels = ['Kindergarten', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const supportedGrades = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    const selectedGrade = existing?.gradeLevel || '';
    const sourceClasses = (profileDb.assignments || []).filter(item => item.schoolYear === schoolYear && Array.isArray(item.learners));
    const sections = [];
    const seenSections = new Set();
    sourceClasses.forEach(item => {
      const section = String(item.section || '').trim();
      const key = section.toLocaleUpperCase();
      if (!section || seenSections.has(key)) return;
      seenSections.add(key);
      sections.push({ value: section, gradeLevel: String(item.gradeLevel || '').trim() });
    });
    sections.sort((left, right) => left.value.localeCompare(right.value, 'fil'));
    const existingSectionKey = String(existing?.section || '').trim().toLocaleUpperCase();
    const selectedSection = sections.find(item => item.value.toLocaleUpperCase() === existingSectionKey)?.value || '';
    const useCustomSection = Boolean(existing?.section && !selectedSection);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '11800';
    overlay.setAttribute('data-advisory-setup-modal', 'true');
    overlay.innerHTML = `
      <div class="modal modal--wide advisory-setup-modal" role="dialog" aria-modal="true" aria-labelledby="advisorySetupTitle">
        <div class="modal__title" id="advisorySetupTitle">${existing ? 'Edit' : 'Set Up'} Advisory Class</div>
        <div class="modal__body advisory-setup-modal__body">
          <p class="text-muted" style="margin-top:0">This is the adviser&apos;s central record for School Year ${escHtml(schoolYear)}. Previous school-year records are preserved.</p>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisoryGradeLevel">Grade Level <span aria-hidden="true">*</span></label><select class="field-select" id="advisoryGradeLevel" required><option value="">Select grade level</option>${gradeLevels.map(level => `<option value="${escHtml(level)}" ${selectedGrade === level ? 'selected' : ''} ${supportedGrades.has(level) ? '' : 'disabled'}>${level === 'Kindergarten' ? level : `Grade ${level}`}${supportedGrades.has(level) ? '' : ' (Not yet available)'}</option>`).join('')}</select></div>
            <div class="field"><label class="field-label" for="advisorySectionSelect">Section <span aria-hidden="true">*</span></label><select class="field-select" id="advisorySectionSelect" required><option value="">Select a section</option>${sections.map(item => `<option value="${escHtml(item.value)}" ${selectedSection === item.value ? 'selected' : ''}>${escHtml(item.value)}${item.gradeLevel ? ` (Grade ${escHtml(item.gradeLevel)})` : ''}</option>`).join('')}<option value="__custom__" ${useCustomSection ? 'selected' : ''}>Add a different section...</option></select><input class="field-input advisory-custom-section" id="advisoryCustomSection" value="${escHtml(useCustomSection ? existing.section : '')}" placeholder="Enter the section name" ${useCustomSection ? '' : 'hidden'} /></div>
          </div>
          <section class="advisory-shs-subject-picker" id="advisorySeniorHighSubjects" hidden>
            <div><strong>Select the subjects handled by this adviser</strong><p>Only selected subjects will appear in the Senior High grading sheet. You can change this list later in Advisory Settings.</p></div>
            <div data-advisory-shs-picker></div>
          </section>
          <div class="field"><label class="field-label" for="advisoryAdviserName">Adviser Name <span aria-hidden="true">*</span></label><input class="field-input" id="advisoryAdviserName" value="${escHtml(existing?.adviserName || profileDb.teacherName || '')}" required /></div>
          <div class="field"><label class="field-label" for="advisorySchoolName">School Name <span aria-hidden="true">*</span></label><input class="field-input" id="advisorySchoolName" value="${escHtml(existing?.schoolName || profileDb.schoolName || '')}" required /></div>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisorySchoolId">School ID <span aria-hidden="true">*</span></label><input class="field-input" id="advisorySchoolId" value="${escHtml(existing?.schoolId || profileDb.schoolId || '')}" required /></div>
            <div class="field"><label class="field-label" for="advisoryDistrict">District <span aria-hidden="true">*</span></label><input class="field-input" id="advisoryDistrict" value="${escHtml(existing?.district || profileDb.district || '')}" required /></div>
          </div>
          <div class="split-row">
            <div class="field"><label class="field-label" for="advisoryDivision">Division <span aria-hidden="true">*</span></label><input class="field-input" id="advisoryDivision" value="${escHtml(existing?.division || profileDb.division || '')}" required /></div>
            <div class="field"><label class="field-label" for="advisoryRegion">Region <span aria-hidden="true">*</span></label><input class="field-input" id="advisoryRegion" value="${escHtml(existing?.region || profileDb.region || '')}" required /></div>
          </div>
          <div class="special-program-weight-panel advisory-special-class-setup">
            <label class="checkbox-row"><input type="checkbox" id="advisoryIsSpecialClass"> This is a Special Class</label>
            <div id="advisorySpecialClassFields" hidden>
              <div class="field"><label class="field-label" for="advisorySpecialProgramName">Special Program Name <span aria-hidden="true">*</span></label><input class="field-input" id="advisorySpecialProgramName" placeholder="e.g. Journalism or Science"></div>
              <div class="split-row">
                <div class="field"><label class="field-label" for="advisorySpecialSubject1">Special Subject 1 <span aria-hidden="true">*</span></label><input class="field-input" id="advisorySpecialSubject1" placeholder="Enter the subject name"><label class="checkbox-row"><input type="checkbox" id="advisorySpecialSubject1Ga" checked> Include in General Average</label></div>
                <div class="field"><label class="field-label" for="advisorySpecialSubject2">Special Subject 2 (Optional)</label><input class="field-input" id="advisorySpecialSubject2" placeholder="Enter another subject"><label class="checkbox-row"><input type="checkbox" id="advisorySpecialSubject2Ga" checked> Include in General Average</label></div>
              </div>
              <p class="text-muted">A Special Class may have one or two additional subjects. These can be changed later in Advisory Settings.</p>
            </div>
          </div>
          <div class="advisory-setup-roster-source">
            <div><strong>${existing ? 'Import additional learners' : 'Start with an existing class roster'}</strong><p>Optional. Select a class already on the Dashboard. You will review learners before anything is added, and the source class will remain unchanged.</p></div>
            <div class="field"><label class="field-label" for="advisorySetupSourceClass">Import learners from Other Class</label><select class="field-select" id="advisorySetupSourceClass"><option value="">Do not import a roster now</option>${sourceClasses.map(item => `<option value="${escHtml(item.id)}">Grade ${escHtml(item.gradeLevel)} - ${escHtml(item.section)} (${escHtml(item.subject)}) · ${item.learners.length} learners</option>`).join('')}</select></div>
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
    const gradeInput = overlay.querySelector('#advisoryGradeLevel');
    const sectionSelect = overlay.querySelector('#advisorySectionSelect');
    const customSection = overlay.querySelector('#advisoryCustomSection');
    const sourceSelect = overlay.querySelector('#advisorySetupSourceClass');
    const seniorHighSection = overlay.querySelector('#advisorySeniorHighSubjects');
    const seniorHighPicker = overlay.querySelector('[data-advisory-shs-picker]');
    const specialClassInput = overlay.querySelector('#advisoryIsSpecialClass');
    const specialClassFields = overlay.querySelector('#advisorySpecialClassFields');
    const syncSpecialClassFields = () => {
      specialClassFields.hidden = !specialClassInput.checked;
      overlay.querySelector('#advisorySpecialProgramName').required = specialClassInput.checked;
      overlay.querySelector('#advisorySpecialSubject1').required = specialClassInput.checked;
    };
    specialClassInput.addEventListener('change', syncSpecialClassFields);
    syncSpecialClassFields();
    let selectedSeniorHighSubjects = [];
    const syncSeniorHighPicker = () => {
      if (!seniorHighSection || !seniorHighPicker) return;
      if (!seniorHighSection.hidden) {
        selectedSeniorHighSubjects = globalScope.AdvisoryGradeTransfer?.collectSeniorHighSubjects?.(seniorHighPicker) || selectedSeniorHighSubjects;
      }
      const isSeniorHigh = globalScope.AdvisoryGradeTransfer?.isSeniorHighGrade?.(gradeInput.value);
      seniorHighSection.hidden = !isSeniorHigh;
      seniorHighPicker.innerHTML = isSeniorHigh
        ? (globalScope.AdvisoryGradeTransfer?.seniorHighSubjectPickerMarkup?.(gradeInput.value, selectedSeniorHighSubjects) || '')
        : '';
    };
    gradeInput.addEventListener('change', syncSeniorHighPicker);
    syncSeniorHighPicker();
    const setSection = section => {
      const normalized = String(section || '').trim();
      const matched = Array.from(sectionSelect.options).find(option => option.value !== '__custom__' && option.value.toLocaleUpperCase() === normalized.toLocaleUpperCase());
      sectionSelect.value = matched ? matched.value : '__custom__';
      customSection.hidden = Boolean(matched);
      customSection.required = !matched;
      customSection.value = matched ? '' : normalized;
    };
    const syncCustomSection = () => {
      const isCustom = sectionSelect.value === '__custom__';
      customSection.hidden = !isCustom;
      customSection.required = isCustom;
      if (isCustom) setTimeout(() => customSection.focus(), 0);
    };
    sectionSelect.addEventListener('change', syncCustomSection);
    sourceSelect.addEventListener('change', () => {
      const sourceClass = sourceClasses.find(item => String(item.id) === sourceSelect.value);
      if (!sourceClass) return;
      const sourceGrade = String(sourceClass.gradeLevel || '').trim();
      if (supportedGrades.has(sourceGrade)) gradeInput.value = sourceGrade;
      else {
        gradeInput.value = '';
        globalScope.toast(`Grade ${sourceGrade || 'level'} is not yet available for Advisory Class.`, 'warning');
      }
      setSection(sourceClass.section);
      if (globalScope.AdvisoryGradeTransfer?.isSeniorHighGrade?.(sourceGrade) && sourceClass.subject) {
        selectedSeniorHighSubjects = [sourceClass.subject];
      }
      syncSeniorHighPicker();
    });
    syncCustomSection();
    overlay.querySelector('[data-advisory-save]').addEventListener('click', async () => {
      const section = sectionSelect.value === '__custom__' ? customSection.value.trim() : sectionSelect.value.trim();
      const values = {
        schoolYear,
        gradeLevel: gradeInput.value.trim(),
        section,
        adviserName: overlay.querySelector('#advisoryAdviserName').value.trim(),
        schoolName: overlay.querySelector('#advisorySchoolName').value.trim(),
        schoolId: overlay.querySelector('#advisorySchoolId').value.trim(),
        district: overlay.querySelector('#advisoryDistrict').value.trim(),
        division: overlay.querySelector('#advisoryDivision').value.trim(),
        region: overlay.querySelector('#advisoryRegion').value.trim(),
        isSpecialClass: specialClassInput.checked,
        specialProgramName: overlay.querySelector('#advisorySpecialProgramName').value.trim(),
        isActive: existing ? !overlay.querySelector('#advisoryArchived').checked : true,
        isArchived: existing ? overlay.querySelector('#advisoryArchived').checked : false
      };
      const sourceClassId = sourceSelect.value;
      const isSeniorHigh = globalScope.AdvisoryGradeTransfer?.isSeniorHighGrade?.(values.gradeLevel);
      const seniorHighSubjects = isSeniorHigh
        ? (globalScope.AdvisoryGradeTransfer?.collectSeniorHighSubjects?.(seniorHighPicker) || [])
        : [];
      const specialSubjects = [
        { subjectName: overlay.querySelector('#advisorySpecialSubject1').value.trim(), includeInGeneralAverage: overlay.querySelector('#advisorySpecialSubject1Ga').checked },
        { subjectName: overlay.querySelector('#advisorySpecialSubject2').value.trim(), includeInGeneralAverage: overlay.querySelector('#advisorySpecialSubject2Ga').checked }
      ].filter(item => item.subjectName);
      const requiredFields = [
        [gradeInput, values.gradeLevel, 'Grade level'],
        [sectionSelect.value === '__custom__' ? customSection : sectionSelect, values.section, 'Section'],
        [overlay.querySelector('#advisoryAdviserName'), values.adviserName, 'Adviser name'],
        [overlay.querySelector('#advisorySchoolName'), values.schoolName, 'School name'],
        [overlay.querySelector('#advisorySchoolId'), values.schoolId, 'School ID'],
        [overlay.querySelector('#advisoryDistrict'), values.district, 'District'],
        [overlay.querySelector('#advisoryDivision'), values.division, 'Division'],
        [overlay.querySelector('#advisoryRegion'), values.region, 'Region']
      ];
      requiredFields.forEach(([input, value]) => input.setAttribute('aria-invalid', value ? 'false' : 'true'));
      const missing = requiredFields.filter(([, value]) => !value);
      if (missing.length) {
        globalScope.toast(`Complete all required fields: ${missing.map(([, , label]) => label).join(', ')}.`, 'warning');
        missing[0][0].focus();
        return;
      }
      if (!supportedGrades.has(values.gradeLevel)) {
        globalScope.toast('Advisory Class is currently available only for Grades 1 to 12.', 'warning');
        gradeInput.focus();
        return;
      }
      if (isSeniorHigh && !seniorHighSubjects.length) {
        globalScope.toast('Select at least one Senior High subject.', 'warning');
        seniorHighPicker.querySelector('input, textarea')?.focus();
        return;
      }
      if (values.isSpecialClass && (!values.specialProgramName || specialSubjects.length < 1)) {
        globalScope.toast('Enter the Special Program Name and at least one special subject.', 'warning');
        (!values.specialProgramName ? overlay.querySelector('#advisorySpecialProgramName') : overlay.querySelector('#advisorySpecialSubject1')).focus();
        return;
      }
      const advisorySnapshot = JSON.parse(JSON.stringify(profileDb.advisory));
      try {
        const savedClass = existing
          ? globalScope.AdvisoryData.updateClass(profileDb, existing.id, values)
          : globalScope.AdvisoryData.createClass(profileDb, values);
        if (isSeniorHigh) globalScope.AdvisoryGradeTransfer?.syncSeniorHighSubjects?.(profileDb, savedClass, seniorHighSubjects);
        else globalScope.AdvisoryGradeTransfer?.ensureGradeLevelSubjects?.(profileDb, savedClass);
        globalScope.AdvisoryGradeTransfer?.syncSpecialProgramSubjects?.(profileDb, savedClass, specialSubjects);
        await globalScope.saveDatabase();
        close();
        globalScope.renderDashboardOverview();
        globalScope.syncAdvisorySidebarButton?.();
        if (savedClass.isActive && !savedClass.isArchived) globalScope.openAdvisoryClassPage?.();
        globalScope.toast(existing ? 'Advisory Class details updated.' : 'Advisory Class created.', 'success');
        if (sourceClassId && globalScope.AdvisoryRoster?.startClassImport) {
          globalScope.AdvisoryRoster.startClassImport(sourceClassId, savedClass);
        }
      } catch (error) {
        profileDb.advisory = advisorySnapshot;
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
    globalScope.openAdvisoryClassPage?.(event);
  }

  const api = { getClassForYear, summarize, renderCard, showSetupModal, currentClass };
  globalScope.AdvisoryDashboard = api;
  globalScope.showAdvisoryClassSetupModal = showSetupModal;
  globalScope.openAdvisoryClassDashboard = openDashboard;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
