'use strict';

if (!window.electronAPI) {
  window.electronAPI = {
    loadDatabase: async () => ({
      teacherName: 'MOCK TEACHER',
      schoolName: 'MOCK SCHOOL',
      schoolYear: '2026-2027',
      currentAssignmentId: 'class-mock',
      currentTerm: '1',
      activeView: 'dashboard',
      assignments: [{
        id: 'class-mock',
        gradeLevel: '4',
        section: 'A',
        subject: 'Science',
        policy: 'KEY_STAGE_2_TRIMESTER',
        subjectGroup: 'KS2_TRIMESTER',
        learners: [
          { id: 'learner-1', lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan', sex: 'M' },
          { id: 'learner-2', lrn: '123456789013', lastName: 'Dela Cruz', firstName: 'Maria', sex: 'F' }
        ],
        assessments: [
          { id: 'ast-1', component: 'WW', title: 'WW 1', maxScore: 20, term: '1' },
          { id: 'ast-2', component: 'WW', title: 'WW 2', maxScore: 20, term: '1' },
          { id: 'ast-3', component: 'PT', title: 'PT 1', maxScore: 50, term: '1' }
        ],
        scores: {
          'learner-1|ast-1': 15,
          'learner-2|ast-1': 18,
          'learner-1|ast-2': 16
        },
        supportRecords: [],
        attendanceSessions: []
      }]
    }),
    saveDatabase: async () => true,
    getVersion: async () => '1.9.6-mock',
    getPerformanceProfile: async () => ({
      totalMemoryBytes: 8 * 1024 ** 3,
      freeMemoryBytes: 4 * 1024 ** 3,
      logicalProcessors: 4,
      cpuModel: 'Mock processor',
      arch: 'x64',
      platform: 'browser',
      recommended: false,
      reasons: []
    }),
    checkForUpdates: async () => ({ started: false, reason: 'browser' }),
    downloadUpdate: async () => ({ started: false, reason: 'browser' }),
    quitAndInstall: async () => ({ started: false, reason: 'browser' }),
    onMenuSave: () => () => {},
    onMenuExportJson: () => () => {},
    onMenuImportJson: () => () => {},
    exportGradeTransfer: async () => ({ success: false }),
    exportOfficialEcr: async () => ({ success: false }),
    getOfficialPaceFormHtml: async () => ({ html: '', fallback: true }),
    importGradeTransfer: async () => ({ success: false }),
    exportAdvisoryResetBackup: async () => ({ success: false }),
    generateRecoveryQr: async () => '',
    decodeRecoveryQrPixels: async () => '',
    generateSudoku: async () => ({ puzzle: '', solution: '', difficulty: 'medium' }),
    exportRecoveryQr: async () => ({ success: false }),
    printRecoveryQr: async () => ({ success: false }),
    onUpdateStatus: () => () => {}
  };
}
