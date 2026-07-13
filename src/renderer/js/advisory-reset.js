/** Advisory Class reset flow with an optional subject-by-term ZIP backup. */
(function initAdvisoryReset(globalScope) {
  'use strict';

  function activeDb() {
    const profileDb = typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
    if (!profileDb) throw new Error('The active profile database is unavailable.');
    return profileDb;
  }

  function cleanFilePart(value) {
    return String(value || 'item').trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/\s+/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || 'item';
  }

  function jsonFile(name, value) {
    return { name, content: JSON.stringify(value, null, 2) };
  }

  function buildResetBackupFiles(profileDb, advisoryClass, exportedAt = new Date().toISOString()) {
    const store = globalScope.AdvisoryData.normalizeAdvisoryData(profileDb);
    const learners = store.learners.filter(item => item.advisoryClassId === advisoryClass.id);
    const subjects = store.subjects.filter(item => item.advisoryClassId === advisoryClass.id).sort((a, b) => a.displayOrder - b.displayOrder);
    const grades = store.grades.filter(item => item.advisoryClassId === advisoryClass.id);
    const importBatches = store.importBatches.filter(item => item.advisoryClassId === advisoryClass.id);
    const sourceMappings = store.sourceMappings.filter(item => item.advisoryClassId === advisoryClass.id);
    const files = [
      jsonFile('manifest.json', {
        format: 'eclass-record-advisory-reset-backup',
        schemaVersion: '1.0',
        exportedAt,
        schoolYear: advisoryClass.schoolYear,
        gradeLevel: advisoryClass.gradeLevel,
        section: advisoryClass.section,
        learnerCount: learners.length,
        subjectCount: subjects.length,
        subjectTermFileCount: subjects.length * 3
      }),
      jsonFile('advisory-class.json', advisoryClass),
      jsonFile('learners.json', learners),
      jsonFile('import-history.json', importBatches),
      jsonFile('source-mappings.json', sourceMappings)
    ];

    subjects.forEach((subject, subjectIndex) => {
      const folder = `subjects/${String(subjectIndex + 1).padStart(2, '0')}_${cleanFilePart(subject.subjectName)}`;
      ['1', '2', '3'].forEach(term => {
        const termGrades = grades.filter(item => item.advisorySubjectId === subject.id && item.term === term).map(grade => {
          const learner = learners.find(item => item.id === grade.advisoryLearnerId);
          return {
            learnerId: grade.advisoryLearnerId,
            lrn: learner?.lrn || grade.learnerLrn || '',
            officialName: learner ? globalScope.AdvisoryRoster.displayName(learner) : '',
            finalGrade: grade.finalGrade,
            gradeStatus: grade.gradeStatus,
            sourceType: grade.sourceType,
            sourceTeacherName: grade.sourceTeacherName,
            sourceClassName: grade.sourceClassName,
            exportId: grade.exportId,
            importedAt: grade.importedAt,
            validationStatus: grade.validationStatus,
            conflictStatus: grade.conflictStatus,
            remarks: grade.remarks
          };
        });
        files.push(jsonFile(`${folder}/Term_${term}.json`, {
          format: 'eclass-record-advisory-subject-term-backup',
          schemaVersion: '1.0',
          exportedAt,
          schoolYear: advisoryClass.schoolYear,
          gradeLevel: advisoryClass.gradeLevel,
          section: advisoryClass.section,
          subject: { id: subject.id, name: subject.subjectName, normalizedKey: subject.normalizedSubjectKey },
          term: Number(term),
          grades: termGrades
        }));
      });
    });
    return files;
  }

  function resetBackupFilename(advisoryClass) {
    return `ECR_Advisory_Backup_SY${cleanFilePart(advisoryClass.schoolYear)}_Grade${cleanFilePart(advisoryClass.gradeLevel)}-${cleanFilePart(advisoryClass.section)}.zip`;
  }

  function resetAdvisoryData(profileDb, advisoryClassId) {
    return globalScope.AdvisoryData.deleteClass(profileDb, advisoryClassId);
  }

  async function performReset(advisoryClass) {
    resetAdvisoryData(activeDb(), advisoryClass.id);
    await globalScope.saveDatabase();
    document.querySelector('[data-advisory-roster-manager]')?.remove();
    document.querySelector('[data-advisory-workspace]')?.remove();
    globalScope.renderDashboardOverview();
    globalScope.toast('Advisory Class reset completed. Subject classes were not changed.', 'success');
  }

  function showResetModal() {
    const advisoryClass = globalScope.AdvisoryDashboard.currentClass();
    if (!advisoryClass) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-reset-modal-overlay';
    overlay.setAttribute('data-advisory-reset-modal', 'true');
    overlay.innerHTML = `
      <div class="modal advisory-reset-modal" role="dialog" aria-modal="true" aria-labelledby="advisoryResetTitle">
        <div class="modal__title" id="advisoryResetTitle">Reset Advisory Class</div>
        <div class="modal__body">
          <p>This removes the Advisory roster, subjects, transferred grades, source mappings, and import history for <strong>Grade ${globalScope.esc(advisoryClass.gradeLevel)} - ${globalScope.esc(advisoryClass.section)}</strong>.</p>
          <div class="advisory-reset-warning"><strong>Subject teaching loads are not affected.</strong><span>Choose Backup &amp; Reset to save a ZIP containing class details, the roster, and one JSON file for every subject and term before removal.</span></div>
        </div>
        <div class="modal__actions advisory-reset-actions">
          <button class="btn btn-cancel btn-sm" type="button" data-reset-cancel>Cancel</button>
          <button class="btn btn-danger btn-sm" type="button" data-reset-without>Reset Without Backup</button>
          <button class="btn btn-primary btn-sm" type="button" data-reset-backup>Backup &amp; Reset</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-reset-cancel]').addEventListener('click', close);
    overlay.querySelector('[data-reset-without]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      await performReset(advisoryClass);
      close();
    });
    overlay.querySelector('[data-reset-backup]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Saving Backup…';
      try {
        const result = await globalScope.electronAPI.exportAdvisoryResetBackup({
          defaultFileName: resetBackupFilename(advisoryClass),
          files: buildResetBackupFiles(activeDb(), advisoryClass)
        });
        if (!result?.success) {
          button.disabled = false;
          button.textContent = 'Backup & Reset';
          return;
        }
        await performReset(advisoryClass);
        close();
      } catch (error) {
        console.error('Advisory reset backup failed:', error);
        globalScope.toast(error.message || 'The Advisory backup could not be saved. Nothing was reset.', 'error');
        button.disabled = false;
        button.textContent = 'Backup & Reset';
      }
    });
  }

  const api = { cleanFilePart, buildResetBackupFiles, resetBackupFilename, resetAdvisoryData, showResetModal };
  globalScope.AdvisoryReset = api;
  globalScope.showAdvisoryResetModal = showResetModal;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
