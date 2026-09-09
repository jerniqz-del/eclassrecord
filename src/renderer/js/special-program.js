/** Special-program teaching-load form enhancements loaded after the legacy bundle. */
(function initSpecialProgramForms(globalScope) {
  'use strict';

  function addCustomOption(select) {
    if (!select || Array.from(select.options).some(option => option.value === 'Custom')) return;
    const option = document.createElement('option');
    option.value = 'Custom';
    option.textContent = 'Other / Custom Subject…';
    select.appendChild(option);
  }

  function updateWeightTotal(prefix) {
    const values = ['Ww', 'Pt', 'Exam'].map(part => Number(document.getElementById(`${prefix}Special${part}Weight`)?.value));
    const total = values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : 0;
    const output = document.getElementById(`${prefix}SpecialWeightTotal`);
    if (output) {
      output.textContent = `Total: ${total}%${total === 100 ? '' : ' — must equal 100%'}`;
      output.classList.toggle('is-invalid', total !== 100);
    }
  }

  function syncNewSpecialProgramWeights() {
    const checkbox = document.getElementById('newSpecialProgramSubject');
    const weights = document.getElementById('newSpecialProgramWeights');
    if (weights) weights.hidden = !checkbox?.checked;
    updateWeightTotal('new');
  }

  function selectedNewShsCurriculum() {
    const grade = Number(document.getElementById('newGrade')?.value);
    const schoolYear = document.getElementById('newClassSchoolYear')?.value
      || (typeof db !== 'undefined' && db?.schoolYear)
      || '2026-2027';
    const pilot = document.getElementById('newShsPilotCurriculum')?.checked === true;
    if (typeof resolveShsCurriculum !== 'function') return 'SSHS';
    return resolveShsCurriculum(grade, schoolYear, pilot ? 'SSHS' : '');
  }

  function syncNewSeniorHighCurriculumField() {
    const grade = Number(document.getElementById('newGrade')?.value);
    const schoolYear = document.getElementById('newClassSchoolYear')?.value
      || (typeof db !== 'undefined' && db?.schoolYear)
      || '2026-2027';
    const field = document.getElementById('seniorHighCurriculumField');
    const note = document.getElementById('newSeniorHighCurriculumNote');
    const row = document.getElementById('newShsPilotCurriculumRow');
    const isSeniorHigh = grade >= 11 && grade <= 12;
    if (field) field.hidden = !isSeniorHigh;
    if (!isSeniorHigh) return selectedNewShsCurriculum();
    const info = typeof shsCurriculumOptionsForGrade === 'function'
      ? shsCurriculumOptionsForGrade(grade, schoolYear)
      : { showPilotOverride: false, note: '' };
    if (note) note.textContent = info.note || '';
    if (row) row.hidden = !info.showPilotOverride;
    if (!info.showPilotOverride) {
      const checkbox = document.getElementById('newShsPilotCurriculum');
      if (checkbox) checkbox.checked = false;
    }
    return selectedNewShsCurriculum();
  }

  function populateSeniorHighSubjects(select, grade, curriculum) {
    if (!select || typeof seniorHighSubjectCatalog !== 'function') return false;
    const schoolYear = document.getElementById('newClassSchoolYear')?.value
      || (typeof db !== 'undefined' && db?.schoolYear)
      || '2026-2027';
    const catalog = seniorHighSubjectCatalog(grade, { curriculum, schoolYear });
    if (!catalog.length) return false;
    select.innerHTML = '';
    catalog.forEach(category => {
      const group = document.createElement('optgroup');
      group.label = category.label;
      category.subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        option.dataset.shsGroup = category.group;
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    return true;
  }

  function fillSeniorHighGroupOptions(select, curriculum) {
    if (!select || typeof seniorHighSubjectGroupOptions !== 'function') return;
    const previous = select.value;
    select.innerHTML = '';
    seniorHighSubjectGroupOptions(curriculum).forEach(group => {
      const option = document.createElement('option');
      option.value = group.value;
      option.textContent = `${group.label} — ${group.weights[0]}% Written, ${group.weights[1]}% Performance, ${group.weights[2]}% Assessment`;
      select.appendChild(option);
    });
    if (previous && Array.from(select.options).some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  function syncSeniorHighSubjectGroup() {
    const grade = Number(document.getElementById('newGrade')?.value);
    const subject = document.getElementById('newSubject')?.value || '';
    const isSeniorHigh = grade >= 11 && grade <= 12;
    const field = document.getElementById('seniorHighSubjectGroupField');
    const select = document.getElementById('newSeniorHighSubjectGroup');
    const help = document.getElementById('newSeniorHighSubjectGroupHelp');
    const curriculum = syncNewSeniorHighCurriculumField();
    if (field) field.hidden = !isSeniorHigh;
    if (!isSeniorHigh || !select) return;
    fillSeniorHighGroupOptions(select, curriculum);
    if (help) {
      help.textContent = curriculum === 'K12_2016'
        ? 'Percentages follow DepEd Order No. 8, s. 2015. Transmutation still follows DepEd Order No. 15, s. 2026.'
        : 'Percentages follow DepEd Order No. 15, s. 2026 for the Strengthened SHS subject type.';
    }
    if (subject !== 'Custom') {
      const subjectOption = document.getElementById('newSubject')?.selectedOptions?.[0];
      select.value = subjectOption?.dataset?.shsGroup
        || determineSubjectGroup(grade, subject, null, '', curriculum);
    }
    if (!select.value) select.value = typeof defaultSeniorHighSubjectGroup === 'function'
      ? defaultSeniorHighSubjectGroup(curriculum)
      : 'SHS_ACADEMIC';
  }

  const originalPopulateSubjects = globalScope.populateSubjects;
  globalScope.populateSubjects = function populateSubjectsWithCustomOption(...args) {
    const result = typeof originalPopulateSubjects === 'function' ? originalPopulateSubjects.apply(this, args) : undefined;
    const subjectSelect = document.getElementById('newSubject');
    const grade = Number(document.getElementById('newGrade')?.value);
    const curriculum = syncNewSeniorHighCurriculumField();
    if (grade >= 11 && grade <= 12) populateSeniorHighSubjects(subjectSelect, grade, curriculum);
    addCustomOption(subjectSelect);
    globalScope.handleSubjectChanged?.();
    syncGrade1AddClassForm();
    return result;
  };

  function officialLayoutDefaultOn() {
    const year = document.getElementById('newClassSchoolYear')?.value || '';
    return typeof globalScope.officialGmrcTleLayoutsDefaultOn === 'function'
      && globalScope.officialGmrcTleLayoutsDefaultOn(year);
  }

  function syncOfficialLayoutCheckboxes() {
    const rawGrade = String(document.getElementById('newGrade')?.value || '');
    const grade = Number(rawGrade);
    const isGrade1 = grade === 1;
    const isKinder = typeof globalScope.isKinderGradeLevel === 'function'
      ? globalScope.isKinderGradeLevel(rawGrade)
      : /kinder/i.test(rawGrade);
    const subjectValue = document.getElementById('newSubject')?.value || '';
    const defaultOn = officialLayoutDefaultOn();

    const gmrcField = document.getElementById('gmrcDomainsField');
    const gmrcBox = document.getElementById('newGmrcDomains');
    const showGmrc = !isGrade1 && !isKinder && grade >= 2
      && typeof globalScope.isGmrcOrValuesSubject === 'function'
      && globalScope.isGmrcOrValuesSubject(subjectValue);
    if (gmrcField) gmrcField.hidden = !showGmrc;
    if (gmrcBox) gmrcBox.checked = !!(showGmrc && defaultOn);

    const tleField = document.getElementById('tlePerComponentField');
    const tleBox = document.getElementById('newTlePerComponent');
    const showTle = !isGrade1 && !isKinder
      && typeof globalScope.isEppOrTleSubject === 'function'
      && globalScope.isEppOrTleSubject(subjectValue);
    if (tleField) tleField.hidden = !showTle;
    if (tleBox) tleBox.checked = !!(showTle && defaultOn);
  }

  function syncGrade1AddClassForm() {
    const rawGrade = String(document.getElementById('newGrade')?.value || '');
    const isGrade1 = Number(rawGrade) === 1;
    const isKinder = typeof globalScope.isKinderGradeLevel === 'function'
      ? globalScope.isKinderGradeLevel(rawGrade)
      : /kinder/i.test(rawGrade);
    const subjectField = document.getElementById('newSubjectField');
    const note = document.getElementById('newGrade1HomeroomNote');
    const customField = document.getElementById('customSubjectField');
    const specialField = document.getElementById('specialProgramSubjectField');
    if (subjectField) subjectField.hidden = isGrade1 || isKinder;
    if (note) note.hidden = !isGrade1;
    const paceField = document.getElementById('pacePerSkillField');
    if (paceField) paceField.hidden = !isGrade1;
    if (!isGrade1) {
      const paceBox = document.getElementById('newPacePerSkill');
      if (paceBox) paceBox.checked = false;
    }
    if (isGrade1 || isKinder) {
      if (customField) customField.style.display = 'none';
      if (specialField) specialField.hidden = true;
    }
    syncOfficialLayoutCheckboxes();
  }

  const originalHandleSubjectChanged = globalScope.handleSubjectChanged;
  globalScope.handleSubjectChanged = function handleSubjectChangedWithSpecialProgram(...args) {
    const result = typeof originalHandleSubjectChanged === 'function' ? originalHandleSubjectChanged.apply(this, args) : undefined;
    const isCustom = document.getElementById('newSubject')?.value === 'Custom';
    const grade = Number(document.getElementById('newGrade')?.value);
    const isSeniorHigh = grade >= 11 && grade <= 12;
    const customField = document.getElementById('customSubjectField');
    const specialField = document.getElementById('specialProgramSubjectField');
    if (grade === 1) {
      syncGrade1AddClassForm();
      return result;
    }
    if (customField) customField.style.display = isCustom ? 'block' : 'none';
    if (specialField) specialField.hidden = !isCustom || isSeniorHigh;
    syncOfficialLayoutCheckboxes();
    if (!isCustom || isSeniorHigh) {
      const checkbox = document.getElementById('newSpecialProgramSubject');
      if (checkbox) checkbox.checked = false;
    }
    syncSeniorHighSubjectGroup();
    syncNewSpecialProgramWeights();
    return result;
  };

  globalScope.syncNewSpecialProgramWeights = syncNewSpecialProgramWeights;
  globalScope.syncSeniorHighSubjectGroup = syncSeniorHighSubjectGroup;
  globalScope.selectedNewShsCurriculum = selectedNewShsCurriculum;
  globalScope.relabelOfficialSheetClassOptions = function relabelOfficialSheetClassOptions() {
    const assignments = globalScope.db?.assignments || [];
    ['recordClassSelect', 'classesClassSelect'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      Array.from(select.options || []).forEach(option => {
        const assignment = assignments.find(item => item && item.id === option.value);
        if (!assignment?.term1GradeOnly) return;
        const marker = ' · Official sheet';
        if (!String(option.textContent || '').includes('Official sheet')) {
          option.textContent = `${option.textContent}${marker}`;
        }
      });
    });
  };
  const originalRender = globalScope.render;
  if (typeof originalRender === 'function') {
    globalScope.render = function renderWithOfficialSheetDuplicate(...args) {
      const result = originalRender.apply(this, args);
      globalScope.relabelOfficialSheetClassOptions();
      if (typeof globalScope.syncDuplicateOfficialSheetButtons === 'function') {
        globalScope.syncDuplicateOfficialSheetButtons();
      }
      return result;
    };
  }
  document.addEventListener('input', event => {
    if (event.target?.id && /^newSpecial(?:Ww|Pt|Exam)Weight$/.test(event.target.id)) updateWeightTotal('new');
  });
  document.addEventListener('change', event => {
    if (event.target?.id === 'newClassSchoolYear') syncOfficialLayoutCheckboxes();
  });
})(typeof window !== 'undefined' ? window : globalThis);
