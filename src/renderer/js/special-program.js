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
    return result;
  };

  const originalHandleSubjectChanged = globalScope.handleSubjectChanged;
  globalScope.handleSubjectChanged = function handleSubjectChangedWithSpecialProgram(...args) {
    const result = typeof originalHandleSubjectChanged === 'function' ? originalHandleSubjectChanged.apply(this, args) : undefined;
    const isCustom = document.getElementById('newSubject')?.value === 'Custom';
    const grade = Number(document.getElementById('newGrade')?.value);
    const isSeniorHigh = grade >= 11 && grade <= 12;
    const customField = document.getElementById('customSubjectField');
    const specialField = document.getElementById('specialProgramSubjectField');
    if (customField) customField.style.display = isCustom ? 'block' : 'none';
    if (specialField) specialField.hidden = !isCustom || isSeniorHigh;
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
  document.addEventListener('input', event => {
    if (event.target?.id && /^newSpecial(?:Ww|Pt|Exam)Weight$/.test(event.target.id)) updateWeightTotal('new');
  });
})(typeof window !== 'undefined' ? window : globalThis);
