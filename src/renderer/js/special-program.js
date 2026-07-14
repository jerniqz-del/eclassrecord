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

  const originalPopulateSubjects = globalScope.populateSubjects;
  globalScope.populateSubjects = function populateSubjectsWithCustomOption(...args) {
    const result = typeof originalPopulateSubjects === 'function' ? originalPopulateSubjects.apply(this, args) : undefined;
    addCustomOption(document.getElementById('newSubject'));
    globalScope.handleSubjectChanged?.();
    return result;
  };

  const originalHandleSubjectChanged = globalScope.handleSubjectChanged;
  globalScope.handleSubjectChanged = function handleSubjectChangedWithSpecialProgram(...args) {
    const result = typeof originalHandleSubjectChanged === 'function' ? originalHandleSubjectChanged.apply(this, args) : undefined;
    const isCustom = document.getElementById('newSubject')?.value === 'Custom';
    const customField = document.getElementById('customSubjectField');
    const specialField = document.getElementById('specialProgramSubjectField');
    if (customField) customField.style.display = isCustom ? 'block' : 'none';
    if (specialField) specialField.hidden = !isCustom;
    if (!isCustom) {
      const checkbox = document.getElementById('newSpecialProgramSubject');
      if (checkbox) checkbox.checked = false;
    }
    syncNewSpecialProgramWeights();
    return result;
  };

  globalScope.syncNewSpecialProgramWeights = syncNewSpecialProgramWeights;
  document.addEventListener('input', event => {
    if (event.target?.id && /^newSpecial(?:Ww|Pt|Exam)Weight$/.test(event.target.id)) updateWeightTotal('new');
  });
})(typeof window !== 'undefined' ? window : globalThis);
