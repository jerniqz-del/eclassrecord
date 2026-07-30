/**
 * E-Class Record — Electron Main Process
 *
 * Creates the application window, registers IPC handlers for
 * file I/O and native dialogs, and initialises auto-updates.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const isSmokeTest = process.argv.includes('--smoke-test') || process.argv.includes('--offline-smoke-test');
const isOfflineSmokeTest = process.argv.includes('--offline-smoke-test');
if (isSmokeTest) {
  const smokeRoot = path.join(app.getPath('temp'), `eclass-record-smoke-${process.pid}`);
  app.setPath('appData', smokeRoot);
  app.setPath('userData', path.join(smokeRoot, 'user-data'));
}

// File I/O resolves its database path while loading, so smoke paths must be
// isolated before this module (and any updater helpers) are required.
const fileIO = require('./file-io');
const sharedFolderSync = require('./shared-folder-sync');
const updater = require('./updater');
const zipArchive = require('./zip-archive');
const recoveryQr = require('./recovery-qr');
const adminSession = require('./admin-session');
const { verifyAdminPassphrase } = require('./admin-auth');

let mainWindow = null;
let isConfirmedExit = false;
let selectBluetoothDeviceCallback = null;
const discoveredBackupHandles = new Map();
const DISCOVERED_BACKUP_HANDLE_TTL_MS = 10 * 60 * 1000;
const sharedSyncWatchers = new Map();

function attachmentRoot() {
  return path.join(app.getPath('appData'), 'EClassRecordPortable', 'attachments');
}

function safePathPart(value) {
  return String(value || 'item').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'item';
}

function pruneDiscoveredBackupHandles() {
  const cutoff = Date.now() - DISCOVERED_BACKUP_HANDLE_TTL_MS;
  for (const [handle, entry] of discoveredBackupHandles) {
    if (entry.createdAt < cutoff) discoveredBackupHandles.delete(handle);
  }
}

function watchSharedSyncFolder(backupRecoveryId) {
  const key = String(backupRecoveryId || '');
  if (sharedSyncWatchers.has(key)) return;
  let paths;
  try {
    paths = sharedFolderSync.repositoryPaths(key);
  } catch (_error) {
    return;
  }
  fs.mkdirSync(paths.heads, { recursive: true });
  fs.mkdirSync(paths.bases, { recursive: true });
  let debounceTimer = null;
  try {
    const watcher = fs.watch(paths.root, { recursive: true }, () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('shared-sync-folder-changed', key);
        }
      }, 800);
    });
    watcher.on('error', () => {
      watcher.close();
      sharedSyncWatchers.delete(key);
    });
    sharedSyncWatchers.set(key, watcher);
  } catch (_error) {
    // Periodic renderer scans remain active when native watching is unavailable.
  }
}

function unwatchSharedSyncFolder(backupRecoveryId) {
  const key = String(backupRecoveryId || '');
  sharedSyncWatchers.get(key)?.close();
  sharedSyncWatchers.delete(key);
}

function resolveAttachmentPath(relativePath) {
  const root = attachmentRoot();
  const target = path.resolve(root, String(relativePath || ''));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid attachment path.');
  }
  return target;
}

function mimeFromExtension(ext) {
  const map = {
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  };
  return map[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'E-Class Record App',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);
  Menu.setApplicationMenu(null);

  if (isSmokeTest) {
    const rendererErrors = [];
    const smokeTimeout = setTimeout(() => {
      console.error('SMOKE_FAIL Renderer did not finish loading within 30 seconds.');
      app.exit(1);
    }, 30000);

    mainWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) rendererErrors.push(message);
    });

    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const result = await mainWindow.webContents.executeJavaScript(`(async () => {
          try {
          const required = ['AdvisoryData', 'AdvisoryDashboard', 'AdvisoryRoster', 'AdvisoryGradeTransfer', 'AdvisoryBackup', 'AdvisoryReset', 'AdvisoryPage', 'PinRecovery', 'BackupRecovery', 'SharedSyncCrypto', 'SharedSyncMerge', 'SharedFolderSync', 'LearnerAvatars', 'TeacherToolsCore', 'ToolsData', 'GradeSimulator', 'PerformanceChecklist', 'TeacherTools', 'AdminTestMode', 'UsageAnalytics', 'UpdateManager', 'PerformanceMode'];
          const missing = required.filter(name => !globalThis[name]);
          if (missing.length) throw new Error('Missing renderer modules: ' + missing.join(', '));
          if (LearnerAvatars.MALE_IDS.length !== 50 || LearnerAvatars.FEMALE_IDS.length !== 50) {
            throw new Error('The learner avatar library must contain 50 male and 50 female presets.');
          }
          const smokeAvatarLearners = Array.from({ length: 12 }, (_, index) => ({
            id: 'avatar-learner-' + index,
            lrn: String(100000000000 + index),
            sex: index < 6 ? 'M' : 'F'
          }));
          LearnerAvatars.assignRoster(smokeAvatarLearners);
          const maleAvatarIds = smokeAvatarLearners.slice(0, 6).map(item => item.avatarPresetId);
          const femaleAvatarIds = smokeAvatarLearners.slice(6).map(item => item.avatarPresetId);
          if (new Set(maleAvatarIds).size !== 6
            || new Set(femaleAvatarIds).size !== 6
            || maleAvatarIds.some(id => LearnerAvatars.categoryForId(id) !== 'M')
            || femaleAvatarIds.some(id => LearnerAvatars.categoryForId(id) !== 'F')
            || !LearnerAvatars.renderLearner(smokeAvatarLearners[0], { size: 'sm' }).includes('<svg')) {
            throw new Error('Learner avatar automatic assignment or rendering failed.');
          }
          if (!document.getElementById('navTools') || !document.querySelector('[data-view="tools"]')) {
            throw new Error('Teacher Tools navigation or workspace was not rendered.');
          }
          const smokeLearners = [
            { id: 'learner-1', sex: 'Male' },
            { id: 'learner-2', sex: 'Male' },
            { id: 'learner-3', sex: 'Female' },
            { id: 'learner-4', sex: 'Female' },
            { id: 'learner-5', sex: '' }
          ];
          const smokeGroups = TeacherToolsCore.randomizeGroups(smokeLearners, 2, 'balanced');
          const groupedIds = smokeGroups.flat().map(learner => learner.id);
          if (new Set(groupedIds).size !== smokeLearners.length || groupedIds.length !== smokeLearners.length) {
            throw new Error('Teacher Tools grouping duplicated or omitted a learner.');
          }
          if (Math.abs(smokeGroups[0].length - smokeGroups[1].length) > 1) {
            throw new Error('Teacher Tools grouping produced uneven group sizes.');
          }
          const smokeAssignment = {
            id: 'tools-smoke-assignment',
            learners: [{ id: 'learner-1' }],
            assessments: [{ id: 'assessment-1', term: '1', maxScore: 20 }],
            scores: { 'learner-1|assessment-1': 10 }
          };
          const smokeSession = GradeSimulator.createSession(smokeAssignment, '1');
          GradeSimulator.setScore(smokeSession, 'learner-1', 'assessment-1', 15);
          if (smokeAssignment.scores['learner-1|assessment-1'] !== 10 || smokeSession.draft.scores['learner-1|assessment-1'] !== 15) {
            throw new Error('Grade Simulator preview was not isolated from official scores.');
          }
          const smokeChecklistAssignment = {
            id: 'checklist-smoke-assignment',
            schoolYear: '2099-2100',
            learners: [{ id: 'learner-1' }],
            assessments: [],
            scores: {}
          };
          const smokeChecklist = PerformanceChecklist.create(smokeChecklistAssignment, '1', {
            activityMode: true,
            criteria: [{
              label: 'Recitation',
              destinationComponent: 'TRACKING',
              scoringMode: 'NUMERIC',
              maxPointsPerSession: 10
            }]
          });
          const secondSmokeActivity = PerformanceChecklist.addActivity(smokeChecklist, {
            criterionId: smokeChecklist.criteria[0].id,
            title: 'Recitation 2',
            maxPoints: 10
          });
          PerformanceChecklist.setEntry(
            smokeChecklist,
            smokeChecklistAssignment,
            smokeChecklist.sessions[0].id,
            'learner-1',
            smokeChecklist.criteria[0].id,
            4
          );
          PerformanceChecklist.setEntry(
            smokeChecklist,
            smokeChecklistAssignment,
            secondSmokeActivity.id,
            'learner-1',
            smokeChecklist.criteria[0].id,
            6
          );
          if (PerformanceChecklist.totals(smokeChecklist, smokeChecklistAssignment)['learner-1'].TRACKING !== 10) {
            throw new Error('Recurring Performance Checklist activities did not remain independent.');
          }
          const smokeActivityColumns = PerformanceChecklist.tableColumns(smokeChecklist);
          if (smokeActivityColumns.length !== 2
            || smokeActivityColumns[0].title !== 'Recitation 1'
            || smokeActivityColumns[1].title !== 'Recitation 2') {
            throw new Error('Added Performance Checklist activities did not receive visible table columns.');
          }
          TeacherTools.activate('groups');
          const toolsClassSelect = document.getElementById('groupRandomizerClassSelect');
          if (!toolsClassSelect?.classList.contains('select-class-dropdown') || !toolsClassSelect.closest('.record-class-selector')) {
            throw new Error('Teacher Tools Active Class selector does not match the Grading Sheet structure.');
          }
          TeacherTools.activate('games');
          const toolsGameFrame = document.getElementById('teacherToolsGameFrame');
          if (!toolsGameFrame || toolsGameFrame.getAttribute('sandbox') !== 'allow-scripts') {
            throw new Error('Offline games iframe is missing its scripts-only sandbox.');
          }
          await new Promise(resolve => setTimeout(resolve, 120));
          TeacherTools.openGame('2048');
          TeacherTools.activate('games');
          await new Promise(resolve => setTimeout(resolve, 180));
          if (!document.getElementById('teacherToolsGameFrame')?.src.endsWith('/games/2048/index.html')) {
            throw new Error('The bundled 2048 game did not open.');
          }
          TeacherTools.openGame('minesweeper');
          TeacherTools.activate('games');
          await new Promise(resolve => setTimeout(resolve, 180));
          if (!document.getElementById('teacherToolsGameFrame')?.src.endsWith('/games/minesweeper/index.html')) {
            throw new Error('The bundled Minesweeper game did not open.');
          }
          TeacherTools.openGame('sudoku');
          TeacherTools.activate('games');
          await new Promise(resolve => setTimeout(resolve, 120));
          if (!document.getElementById('teacherToolsGameFrame')?.src.endsWith('/games/sudoku/index.html')) {
            throw new Error('The bundled Sudoku game did not open.');
          }
          TeacherTools.activate('groups');
          if (!document.getElementById('settingUsageAnalytics') || !document.getElementById('welcomeUsageAnalyticsCheckbox') || !document.getElementById('usagePrivacyModal')) {
            throw new Error('Optional usage analytics privacy controls were not rendered.');
          }
          if (!document.getElementById('settingLowSpecMode') || !document.getElementById('performanceDeviceSummary')) {
            throw new Error('Low-Spec Mode settings controls were not rendered.');
          }
          if (!document.getElementById('backupRecoveryIdValue') || !document.getElementById('backupRecoverySearchInput') || !document.getElementById('btnScanBackupFolder')) {
            throw new Error('Backup Recovery ID settings controls were not rendered.');
          }
          if (!document.getElementById('sharedSyncIndicator') || !document.getElementById('sharedSyncSettingsStatus') || !document.getElementById('btnSharedSyncToggle')) {
            throw new Error('Shared Folder Sync status controls were not rendered.');
          }
          const smokeRecoveryId = BackupRecoveryId.generateBackupRecoveryId();
          if (!BackupRecoveryId.isValidBackupRecoveryId(smokeRecoveryId) || BackupRecoveryId.normalizeBackupRecoveryId(smokeRecoveryId.toLowerCase()) !== smokeRecoveryId) {
            throw new Error('Backup Recovery ID generation or normalization failed.');
          }
          const analyticsFixture = {
            region: 'Region V', division: 'Smoke Division', district: 'Must Not Leave Device',
            teacherName: 'Must Not Leave Device', assignments: [{ gradeLevel: 11 }]
          };
          const analyticsSummary = UsageAnalytics.buildUsageSummary(analyticsFixture, 'smoke', new Date('2026-07-18T00:00:00.000Z'));
          const analyticsText = JSON.stringify(analyticsSummary);
          if (!analyticsSummary || analyticsText.includes('district') || analyticsText.includes('Must Not Leave Device')) {
            throw new Error('Optional usage analytics did not enforce payload minimization.');
          }
          if (typeof getActiveProfileDatabase !== 'function') throw new Error('Active profile database accessor is unavailable.');
          const mockTestProfile = AdminTestMode.buildCompleteMockProfile();
          if (!mockTestProfile.isMockTestData || mockTestProfile.assignments?.length !== 4 || mockTestProfile.advisory?.learners?.length !== 24) {
            throw new Error('Admin mock test workspace factory is unavailable or incomplete.');
          }
          const profile = { version: 3, schoolYear: '2099-2100', assignments: [] };
          AdvisoryData.normalizeAdvisoryData(profile);
          const advisoryClass = AdvisoryData.createClass(profile, {
            id: 'smoke-advisory', schoolYear: profile.schoolYear, gradeLevel: '4',
            section: 'Offline', adviserName: 'Smoke Test', isActive: true
          });
          const card = AdvisoryDashboard.renderCard(profile, profile.schoolYear, 'grid');
          if (!card.includes('data-dashboard-fixed="true"') || !card.includes(advisoryClass.id)) {
            throw new Error('Advisory dashboard card invariant failed.');
          }
          const runtimeProfile = getActiveProfileDatabase();
          runtimeProfile.schoolYear = '2099-2100';
          runtimeProfile.assignments = [{
            id: 'smoke-subject', schoolYear: runtimeProfile.schoolYear, gradeLevel: '4',
            section: 'Offline', subject: 'Mathematics', learners: [{
              id: 'source-learner', lrn: '123456789013', lastName: 'Reyes', firstName: 'Maria', sex: 'F'
            }], assessments: [], scores: {}
          }, {
            id: 'smoke-mapeh', schoolYear: runtimeProfile.schoolYear, gradeLevel: '4',
            section: 'Offline', subject: 'MAPEH', learners: [{
              id: 'source-mapeh-learner', lrn: '123456789012', lastName: 'Cruz', firstName: 'Juan', sex: 'M'
            }], assessments: [], scores: {}
          }];
          runtimeProfile.advisory = AdvisoryData.createAdvisoryStore();
          renderDashboardOverview();
          if (!document.getElementById('navAdvisory')?.hidden) throw new Error('Advisory sidebar button should be hidden before setup.');

          const setupButton = document.querySelector('.dashboard-card--advisory .btn-primary');
          if (!setupButton) throw new Error('Set Up Advisory Class button was not rendered.');
          setupButton.click();
          const setupModal = document.querySelector('[data-advisory-setup-modal]');
          if (!setupModal) throw new Error('Set Up Advisory Class button did not open its modal.');
          if (setupModal.querySelector('#advisoryGradeLevel')?.tagName !== 'SELECT') throw new Error('Advisory grade level is not a dropdown.');
          if (!setupModal.querySelector('#advisoryGradeLevel option[value="Kindergarten"]')?.disabled || setupModal.querySelector('#advisoryGradeLevel option[value="11"]')?.disabled || setupModal.querySelector('#advisoryGradeLevel option[value="12"]')?.disabled) throw new Error('Advisory Grades 11 and 12 must be available while unsupported grade levels remain disabled.');
          const setupGrade = setupModal.querySelector('#advisoryGradeLevel');
          setupGrade.value = '11';
          setupGrade.dispatchEvent(new Event('change'));
          if (setupModal.querySelector('#advisorySeniorHighSubjects')?.hidden || !setupModal.querySelector('[data-advisory-shs-subject]')) throw new Error('Senior High subject selection is unavailable during Advisory setup.');
          if (setupModal.querySelector('#advisorySectionSelect')?.tagName !== 'SELECT' || !setupModal.querySelector('#advisorySectionSelect option[value="__custom__"]')) throw new Error('Advisory section choices are unavailable.');
          if (!setupModal.querySelector('#advisoryIsSpecialClass') || !setupModal.querySelector('#advisorySpecialProgramName') || !setupModal.querySelector('#advisorySpecialSubject1') || !setupModal.querySelector('#advisorySpecialSubject2')) throw new Error('Special Class setup fields were not rendered.');
          setupModal.querySelector('#advisoryIsSpecialClass').click();
          if (setupModal.querySelector('#advisorySpecialClassFields')?.hidden) throw new Error('Special Class setup fields did not open when selected.');
          setupModal.querySelector('#advisoryIsSpecialClass').click();
          if (!setupModal.querySelector('#advisorySetupSourceClass option[value="smoke-subject"]')) throw new Error('Setup-time roster source is unavailable.');
          const setupSource = setupModal.querySelector('#advisorySetupSourceClass');
          setupSource.value = 'smoke-subject';
          setupSource.dispatchEvent(new Event('change'));
          if (setupModal.querySelector('#advisoryGradeLevel').value !== '4' || setupModal.querySelector('#advisorySectionSelect').value !== 'Offline') throw new Error('Roster source did not populate grade and section.');
          setupModal.remove();

          populateSubjects();
          const classLoadGradeSelect = document.getElementById('newGrade');
          const classLoadGrades = [...(classLoadGradeSelect?.options || [])].map(option => option.value);
          if (!classLoadGrades.includes('11') || !classLoadGrades.includes('12')) throw new Error('Add Class Load is missing Grade 11 or Grade 12.');
          for (const seniorHighGrade of ['11', '12']) {
            classLoadGradeSelect.value = seniorHighGrade;
            populateSubjects();
            if (!document.getElementById('newSubject')?.querySelector('optgroup')) throw new Error('Grade ' + seniorHighGrade + ' subjects were not populated in Add Class Load.');
          }
          classLoadGradeSelect.value = '4';
          populateSubjects();
          const teachingSubject = document.getElementById('newSubject');
          if (!teachingSubject?.querySelector('option[value="Custom"]')) throw new Error('Custom teaching-load subjects are unavailable for Grades 1 to 10.');
          teachingSubject.value = 'Custom';
          handleSubjectChanged();
          if (document.getElementById('specialProgramSubjectField')?.hidden) throw new Error('Special-program grading controls did not open for a custom teaching-load subject.');

          const runtimeClass = AdvisoryData.createClass(runtimeProfile, {
            id: 'runtime-advisory', schoolYear: runtimeProfile.schoolYear, gradeLevel: '4',
            section: 'Offline', adviserName: 'Smoke Test', isActive: true
          });
          AdvisoryGradeTransfer.ensureGradeLevelSubjects(runtimeProfile, runtimeClass);
          const runtimeLearner = AdvisoryData.createLearner(runtimeProfile, {
            id: 'runtime-learner', advisoryClassId: runtimeClass.id, lrn: '123456789012',
            lastName: 'Cruz', firstName: 'Juan', sex: 'M'
          });
          const runtimeLearnerTwo = AdvisoryData.createLearner(runtimeProfile, {
            id: 'runtime-learner-two', advisoryClassId: runtimeClass.id, lrn: '123456789013',
            lastName: 'Reyes', firstName: 'Maria', sex: 'F'
          });
          runtimeProfile.currentAssignmentId = 'smoke-subject';
          showImportRosterModal();
          const teachingRosterImport = document.getElementById('importRosterClassSelect');
          if (!teachingRosterImport?.querySelector('option[value="advisory:runtime-advisory"]')) throw new Error('Import Roster from Other Class did not include the Advisory Class.');
          teachingRosterImport.closest('.modal-overlay').remove();
          const runtimeSubject = AdvisoryData.normalizeAdvisoryData(runtimeProfile).subjects.find(item => item.advisoryClassId === runtimeClass.id && item.normalizedSubjectKey === 'MATHEMATICS');
          const runtimeMusicArts = AdvisoryData.normalizeAdvisoryData(runtimeProfile).subjects.find(item => item.advisoryClassId === runtimeClass.id && item.normalizedSubjectKey === 'MUSIC ARTS');
          const runtimePeHealth = AdvisoryData.normalizeAdvisoryData(runtimeProfile).subjects.find(item => item.advisoryClassId === runtimeClass.id && item.normalizedSubjectKey === 'PE HEALTH');
          ['1', '2', '3'].forEach((term, index) => AdvisoryData.createGrade(runtimeProfile, {
            advisoryClassId: runtimeClass.id, advisoryLearnerId: runtimeLearner.id,
            advisorySubjectId: runtimeSubject.id, schoolYear: runtimeProfile.schoolYear,
            term, finalGrade: 88 + index
          }));
          ['1', '2', '3'].forEach((term, index) => AdvisoryData.createGrade(runtimeProfile, {
            advisoryClassId: runtimeClass.id, advisoryLearnerId: runtimeLearnerTwo.id,
            advisorySubjectId: runtimeSubject.id, schoolYear: runtimeProfile.schoolYear,
            term, finalGrade: 70 + index
          }));
          ['1', '2', '3'].forEach((term, index) => {
            AdvisoryData.createGrade(runtimeProfile, { advisoryClassId: runtimeClass.id, advisoryLearnerId: runtimeLearner.id, advisorySubjectId: runtimeMusicArts.id, schoolYear: runtimeProfile.schoolYear, term, finalGrade: 80 + index * 2 });
            AdvisoryData.createGrade(runtimeProfile, { advisoryClassId: runtimeClass.id, advisoryLearnerId: runtimeLearner.id, advisorySubjectId: runtimePeHealth.id, schoolYear: runtimeProfile.schoolYear, term, finalGrade: 90 + index * 2 });
            AdvisoryData.createGrade(runtimeProfile, { advisoryClassId: runtimeClass.id, advisoryLearnerId: runtimeLearnerTwo.id, advisorySubjectId: runtimeMusicArts.id, schoolYear: runtimeProfile.schoolYear, term, finalGrade: 70 + index * 2 });
            AdvisoryData.createGrade(runtimeProfile, { advisoryClassId: runtimeClass.id, advisoryLearnerId: runtimeLearnerTwo.id, advisorySubjectId: runtimePeHealth.id, schoolYear: runtimeProfile.schoolYear, term, finalGrade: 80 + index * 2 });
          });
          renderDashboardOverview();
          if (document.getElementById('navAdvisory')?.hidden) throw new Error('Advisory sidebar button was not shown after setup.');
          const mathWatermark = document.querySelector('.dashboard-card__subject-watermark.subject-watermark--mathematics');
          const mathIcon = mathWatermark?.closest('.dashboard-card')?.querySelector('.dashboard-card__subject-icon');
          if (!mathWatermark || !getComputedStyle(mathWatermark).backgroundImage.includes('subject-icons/mathematics.png') || Number.parseFloat(getComputedStyle(mathWatermark).opacity) > 0.2 || !mathIcon?.getAttribute('src')?.endsWith('subject-icons/mathematics.png')) throw new Error('Mathematics subject card did not render the supplied local background and title icon.');

          const exportButton = document.querySelector('.dashboard-card__export-btn');
          if (!exportButton) throw new Error('Export Final Grades button was not rendered.');
          exportButton.click();
          const exportModal = document.querySelector('.advisory-nested-modal');
          if (!exportModal) throw new Error('Export Final Grades button did not open its modal.');
          exportModal.remove();
          showGradeTransferExportModal('smoke-mapeh');
          const mapehExportModal = document.querySelector('.advisory-nested-modal');
          if (!mapehExportModal?.querySelector('[data-export-mape-part]') || !mapehExportModal.textContent.includes('Music & Arts') || !mapehExportModal.textContent.includes('PE & Health')) throw new Error('MAPEH export did not offer separate component submissions.');
          mapehExportModal.remove();

          openAdvisoryClassDashboard();
          const advisoryPage = document.querySelector('.advisory-page');
          if (document.querySelector('.advisory-page-view')?.style.display === 'none' || !advisoryPage?.querySelector('[data-advisory-grade-panel]')) throw new Error('Dedicated Advisory Class page did not open.');
          if (document.getElementById('currentTitle')?.textContent.trim() !== 'Grade 4 — Offline · Advisory Class') throw new Error('Advisory Class did not replace the teaching-load title in the app header.');
          if (document.querySelector('[data-advisory-workspace]')) throw new Error('Advisory Class still opened as a workspace modal.');
          if (!advisoryPage.querySelector('.advisory-final-column') || !advisoryPage.querySelector('.advisory-general-average')) throw new Error('Final-grade columns were not rendered.');
          if (getComputedStyle(advisoryPage.querySelector('th.advisory-general-average')).whiteSpace !== 'normal') throw new Error('General Average header does not wrap within its column.');
          const runtimeSubjects = AdvisoryData.normalizeAdvisoryData(runtimeProfile).subjects.filter(item => item.advisoryClassId === runtimeClass.id);
          if (runtimeSubjects.length !== 9 || !runtimeSubjects.some(item => item.subjectName === 'Music & Arts') || !runtimeSubjects.some(item => item.subjectName === 'PE & Health')) throw new Error('Grade-level subjects and split MAPEH components were not populated automatically.');
          if (!advisoryPage.textContent.includes('MAPEH Average') || ![...advisoryPage.querySelectorAll('.advisory-mapeh-average')].some(cell => cell.textContent.trim() === '87')) throw new Error('Derived MAPEH term and final averages were not rendered.');
          if (!advisoryPage.querySelector('.advisory-subject-sort') || !advisoryPage.textContent.includes('Aral. Pan.') || !advisoryPage.textContent.includes('GMRC') || !advisoryPage.textContent.includes('EPP')) throw new Error('Wrapped subject abbreviations and sort controls were not rendered.');
          if (getComputedStyle(advisoryPage.querySelector('.advisory-subject-end')).borderRightWidth !== '3px') throw new Error('Subject group boundaries are not visually separated.');
          const firstLearnerCell = advisoryPage.querySelector('.advisory-grade-matrix tbody td:first-child');
          if (getComputedStyle(firstLearnerCell).position !== 'sticky') throw new Error('LRN / Official Name column is not frozen during horizontal scrolling.');
          const termToggle = advisoryPage.querySelector('[data-toggle-advisory-terms]');
          const reportAction = advisoryPage.querySelector('[data-advisory-page-report]');
          const rosterCount = advisoryPage.querySelector('[data-advisory-page-roster-count]');
          if (!rosterCount || !reportAction?.closest('.advisory-page__toolbar')) throw new Error('Advisory learner count or Grade Record toolbar report action was not rendered.');
          reportAction.click();
          const reportOptions = document.getElementById('advisoryGradeReportOptionsModal');
          if (!reportOptions?.textContent.includes('Final Grades Only') || !reportOptions.textContent.includes('Include Terms 1–3')) throw new Error('Advisory report detail choices were not rendered.');
          reportOptions.querySelector('input[value="terms"]').checked = true;
          reportOptions.querySelector('[data-advisory-report-preview]').click();
          const reportPreview = document.getElementById('advisoryGradeReportPreviewModal');
          if (!reportPreview?.textContent.includes('Print Preview') || !reportPreview.textContent.includes('T1') || !reportPreview.querySelector('[data-advisory-report-print]') || !reportPreview.querySelector('[data-advisory-report-pdf]')) throw new Error('Advisory report preview did not render the selected term-grade report.');
          reportPreview.remove();
          if (!termToggle || termToggle.getAttribute('aria-pressed') !== 'false') throw new Error('The all-terms toggle is missing or terms are not hidden by default.');
          if ([...advisoryPage.querySelectorAll('.advisory-grade-matrix thead th')].some(cell => cell.textContent.trim() === 'T1')) throw new Error('Final-only view is not the default.');
          const finalHeaderWidths = [...advisoryPage.querySelectorAll('.advisory-grade-matrix thead tr:nth-child(2) th')].map(cell => Math.round(cell.getBoundingClientRect().width));
          if (!finalHeaderWidths.length || Math.max(...finalHeaderWidths) - Math.min(...finalHeaderWidths) > 1 || finalHeaderWidths[0] > 100) throw new Error('Final-only subject columns are not evenly distributed: ' + finalHeaderWidths.join(', '));
          const finalWrap = advisoryPage.querySelector('[data-advisory-panel="grades"] .advisory-grade-matrix-wrap');
          if (finalWrap.scrollWidth > finalWrap.clientWidth + 2) throw new Error('Final-only subject areas overflow the visible grade matrix: ' + finalWrap.scrollWidth + 'x' + finalWrap.clientWidth + '.');
          if (!advisoryPage.querySelector('.advisory-scroll-tip')?.dataset.tooltip.includes('Shift')) throw new Error('Horizontal mouse-wheel scrolling tooltip was not rendered.');
          termToggle.click();
          const expandedToggle = advisoryPage.querySelector('[data-toggle-advisory-terms]');
          const allTermOneHeaders = [...advisoryPage.querySelectorAll('.advisory-grade-matrix thead th')].filter(cell => cell.textContent.trim() === 'T1');
          const topScrollbar = advisoryPage.querySelector('[data-advisory-matrix-scrollbar]');
          const expandedWrap = advisoryPage.querySelector('[data-advisory-matrix-scroll-target]');
          if (!allTermOneHeaders.length || expandedToggle.getAttribute('aria-pressed') !== 'true' || topScrollbar.hidden) throw new Error('Show Terms 1–3 did not expand all subjects or reveal the top scrollbar.');
          if (getComputedStyle(allTermOneHeaders[0]).textAlign !== 'center') throw new Error('Filipino T1 header is not centered.');
          const learnerHeadingStyle = getComputedStyle(advisoryPage.querySelector('.advisory-learner-heading'));
          if (learnerHeadingStyle.textAlign !== 'center' || Number.parseFloat(learnerHeadingStyle.fontSize) < 12) throw new Error('LRN / Official Name header is not enlarged and centered.');
          topScrollbar.scrollLeft = 60;
          topScrollbar.dispatchEvent(new Event('scroll'));
          if (expandedWrap.scrollLeft !== 60) throw new Error('The visible top scrollbar is not synchronized with the grade table.');
          expandedToggle.click();
          if ([...advisoryPage.querySelectorAll('.advisory-grade-matrix thead th')].some(cell => cell.textContent.trim() === 'T1')) throw new Error('Hide Terms 1–3 did not restore the default final-only view.');
          const mathExpand = [...advisoryPage.querySelectorAll('[data-expand-advisory-subject]')].find(button => button.getAttribute('aria-label').includes('Mathematics'));
          mathExpand.click();
          if ([...advisoryPage.querySelectorAll('.advisory-grade-matrix thead th')].filter(cell => cell.textContent.trim() === 'T1').length !== 1) throw new Error('Subject term expansion affected more than one subject.');
          [...advisoryPage.querySelectorAll('[data-expand-advisory-subject]')].find(button => button.getAttribute('aria-label').includes('Mathematics')).click();
          const mathSort = () => [...advisoryPage.querySelectorAll('[data-sort-advisory-subject]')].find(button => button.title.startsWith('Mathematics'));
          mathSort().click();
          mathSort().click();
          if (!advisoryPage.querySelector('.advisory-grade-matrix tbody tr:first-child td:first-child')?.textContent.includes('123456789013')) throw new Error('Subject-final ascending sort did not reorder learners.');
          if (!advisoryPage.querySelector('.advisory-page__header [data-advisory-page-reset]') || advisoryPage.querySelector('.advisory-page__toolbar [data-advisory-page-reset]')) throw new Error('Reset Advisory Class is not in the page header.');
          advisoryPage.querySelector('[data-advisory-page-tab="sources"]').click();
          if (!advisoryPage.querySelector('[data-advisory-panel="grades"]').hidden || advisoryPage.querySelector('[data-advisory-panel="sources"]').hidden || !advisoryPage.textContent.includes('Assign Source')) throw new Error('Grade Sources tab did not open its dedicated panel.');
          advisoryPage.querySelector('[data-advisory-page-tab="roster"]').click();
          if (advisoryPage.querySelector('[data-advisory-panel="roster"]').hidden || !advisoryPage.querySelector('[data-advisory-add-manual]') || !advisoryPage.querySelector('[data-advisory-import-class]') || !advisoryPage.querySelector('[data-remove-advisory-learner]') || !advisoryPage.querySelector('[data-advisory-panel="roster"]').textContent.includes('123456789012')) throw new Error('Manage Roster tools were not rendered inline.');
          if (advisoryPage.querySelector('[data-open-advisory-roster-tools]')) throw new Error('Manage Roster still depends on a separate manager modal.');
          advisoryPage.querySelector('[data-advisory-page-tab="settings"]').click();
          if (advisoryPage.querySelector('[data-advisory-panel="settings"]').hidden || !advisoryPage.querySelector('[data-advisory-settings-form]') || !advisoryPage.querySelector('#advisoryInlineGrade') || !advisoryPage.querySelector('#advisoryInlineSection') || !advisoryPage.querySelector('#advisoryInlineSpecialClass') || !advisoryPage.querySelector('#advisoryInlineSpecialSubject1') || !advisoryPage.querySelector('[data-advisory-panel="settings"]').textContent.includes('Managed in Global Settings')) throw new Error('Editable Advisory-only settings were not rendered inline.');
          if (!advisoryPage.querySelector('#advisoryInlineGrade option[value="11"]') || !advisoryPage.querySelector('#advisoryInlineGrade option[value="12"]')) throw new Error('Advisory Settings is missing Grades 11 or 12.');
          const inlineGrade = advisoryPage.querySelector('#advisoryInlineGrade');
          inlineGrade.value = '11';
          inlineGrade.dispatchEvent(new Event('change'));
          if (advisoryPage.querySelector('[data-advisory-inline-shs]')?.hidden || !advisoryPage.querySelector('[data-advisory-inline-shs-picker] [data-advisory-shs-subject]')) throw new Error('Senior High subject selection is unavailable in Advisory Settings.');
          if (advisoryPage.querySelector('[data-open-advisory-settings]')) throw new Error('Advisory Settings still depends on an edit modal.');
          advisoryPage.querySelector('[data-advisory-page-tab="grades"]').click();
          showAdvisoryClassSetupModal();
          if (document.querySelector('[data-advisory-setup-modal]') || advisoryPage.querySelector('[data-advisory-panel="settings"]').hidden) throw new Error('Editing an existing Advisory Class did not redirect to the inline Settings tab.');
          advisoryPage.querySelector('[data-advisory-page-tab="grades"]').click();
          AdvisoryGradeTransfer.showSubjectModal(runtimeSubject.id);
          const subjectModal = document.querySelector('.advisory-nested-modal');
          if (!subjectModal || subjectModal.textContent.includes('Expected Source Class') || subjectModal.textContent.includes('Normalized Subject Key')) throw new Error('Grade source assignment still exposes technical fields (modal=' + Boolean(subjectModal) + ', expectedClass=' + Boolean(subjectModal?.textContent.includes('Expected Source Class')) + ', normalizedKey=' + Boolean(subjectModal?.textContent.includes('Normalized Subject Key')) + ').');
          const advisoryCancel = subjectModal.querySelector('[data-cancel]');
          const advisoryReset = advisoryPage.querySelector('[data-advisory-page-reset]');
          if (!advisoryCancel?.classList.contains('btn-cancel') || !advisoryReset?.classList.contains('btn-danger')) throw new Error('Advisory cancel and destructive actions do not use the shared red button classes.');
          if (!subjectModal.textContent.includes('school year, grade and section, subject, and term directly')) throw new Error('Grade Transfer File automatic identification is not explained.');
          const localSourceRadio = subjectModal.querySelector('input[value="local-subject-class"]');
          localSourceRadio.click();
          if (subjectModal.querySelector('[data-local-source-class]')?.hidden || !subjectModal.querySelector('[data-local-source-class] option[value="smoke-subject"]')) throw new Error('Matching local class source choices were not shown.');
          if (getComputedStyle(subjectModal.querySelector('[data-source-help="grade-transfer-file"]')).display !== 'none') throw new Error('Inactive Grade Transfer File help remained visible after choosing a class in this app.');
          subjectModal.remove();
          advisoryPage.querySelector('[data-advisory-page-tab="roster"]').click();
          advisoryPage.querySelector('[data-advisory-import-class]').click();
          const classChooser = document.querySelector('.advisory-nested-modal');
          const sourceSelect = classChooser?.querySelector('[data-source-class]');
          if (!sourceSelect?.querySelector('option[value="smoke-subject"]')) throw new Error('Import from Other Class chooser did not list the Dashboard class.');
          sourceSelect.value = 'smoke-subject';
          sourceSelect.dispatchEvent(new Event('change'));
          classChooser.querySelector('[data-review]').click();
          const rosterPreview = document.querySelector('.advisory-preview-modal');
          if (!rosterPreview || !rosterPreview.textContent.toUpperCase().includes('REYES')) throw new Error('Other Class roster did not reach review preview.');
          rosterPreview.closest('.modal-overlay').remove();
          advisoryPage.querySelector('[data-remove-advisory-learner]').click();
          const confirmation = document.querySelector('.modal-z-confirm');
          if (!confirmation) throw new Error('Remove Advisory Learner confirmation did not open.');
          confirmation.querySelector('#confirmModalCancel').click();
          advisoryPage.querySelector('[data-advisory-page-reset]').click();
          const resetModal = document.querySelector('[data-advisory-reset-modal]');
          if (!resetModal?.querySelector('[data-reset-backup]') || !resetModal.querySelector('[data-reset-without]')) throw new Error('Reset backup choices were not rendered.');
          resetModal.remove();
          const districtField = document.getElementById('schoolDistrict');
          if (!districtField) throw new Error('District profile field was not rendered.');
          districtField.value = 'Smoke Test District';
          updateProfile();
          if (runtimeProfile.district !== 'Smoke Test District') throw new Error('District profile field did not update the active profile.');

          const integrityReport = AdvisoryData.checkAdvisoryIntegrity(runtimeProfile);
          if (!integrityReport.isValid || integrityReport.errors.length) throw new Error('Healthy runtime Advisory data failed integrity checking: ' + JSON.stringify(integrityReport.errors));
          const advisoryCounts = Object.fromEntries(['classes', 'learners', 'subjects', 'grades', 'importBatches', 'sourceMappings'].map(collection => [collection, runtimeProfile.advisory[collection].length]));
          const restoredProfile = AdvisoryBackup.prepareRestoredDatabase(JSON.parse(JSON.stringify(runtimeProfile)));
          const restoredIntegrity = AdvisoryData.checkAdvisoryIntegrity(restoredProfile);
          const restoredCounts = Object.fromEntries(Object.keys(advisoryCounts).map(collection => [collection, restoredProfile.advisory[collection].length]));
          if (!restoredIntegrity.isValid || JSON.stringify(restoredCounts) !== JSON.stringify(advisoryCounts) || restoredProfile.assignments.length !== runtimeProfile.assignments.length) {
            throw new Error('Runtime Advisory backup/restore round trip failed: ' + JSON.stringify({ restoredIntegrity, advisoryCounts, restoredCounts }));
          }

          if (!document.getElementById('pinRecoveryStatus') || !document.getElementById('profileRecoveryPanel') || !document.getElementById('btnForgotProfilePin') || !document.getElementById('recoveryQrFile')) throw new Error('PIN/QR recovery settings or unlock controls were not rendered.');
          const recoveryKey = generateRecoveryKey();
          const recoverySalt = generateSalt();
          const recoveryFixture = {
            id: 'smoke-recovery', name: 'Recovery Smoke', pinEnabled: true,
            salt: recoverySalt,
            pinHash: await hashPin('123456', recoverySalt),
            data: await encryptPayload(JSON.stringify(runtimeProfile), '123456'),
            recovery: await createPinRecoveryDescriptor('123456', recoveryKey)
          };
          const recoveryQrPayload = await createRecoveryQrPayload(recoveryFixture.recovery, recoveryKey);
          const recoveryQrDataUrl = await electronAPI.generateRecoveryQr(recoveryQrPayload);
          const recoveryQrImage = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Generated recovery QR image did not load.'));
            image.src = recoveryQrDataUrl;
          });
          const recoveryQrCanvas = document.createElement('canvas');
          recoveryQrCanvas.width = recoveryQrImage.naturalWidth;
          recoveryQrCanvas.height = recoveryQrImage.naturalHeight;
          recoveryQrCanvas.getContext('2d').drawImage(recoveryQrImage, 0, 0);
          const recoveryQrPixels = recoveryQrCanvas.getContext('2d').getImageData(0, 0, recoveryQrCanvas.width, recoveryQrCanvas.height).data;
          const decodedRecoveryQr = await electronAPI.decodeRecoveryQrPixels({ data: recoveryQrPixels, width: recoveryQrCanvas.width, height: recoveryQrCanvas.height });
          if (decodedRecoveryQr !== recoveryQrPayload || await PinRecovery.decodeRecoveryQrPayloadForProfile(decodedRecoveryQr, recoveryFixture) !== normalizeRecoveryKey(recoveryKey)) throw new Error('Recovery QR encode/decode/profile validation failed.');
          const recoveredFixture = await PinRecovery.buildRecoveredProfile(recoveryFixture, recoveryKey, '654321');
          if (!await verifyPin('654321', recoveredFixture.profile.salt, recoveredFixture.profile.pinHash)) throw new Error('Recovered PIN did not verify.');
          const recoveredPayload = JSON.parse(await decryptPayload(recoveredFixture.profile.data, '654321'));
          if (!AdvisoryData.checkAdvisoryIntegrity(recoveredPayload).isValid || recoveredPayload.assignments.length !== runtimeProfile.assignments.length) throw new Error('PIN recovery did not preserve valid profile data.');
          let wrongRecoveryRejected = false;
          try { await PinRecovery.buildRecoveredProfile(recoveryFixture, 'WRONG-WRONG-WRONG-WRONG-WRONG', '654321'); } catch (_) { wrongRecoveryRejected = true; }
          if (!wrongRecoveryRejected) throw new Error('An incorrect recovery key was accepted.');
          const recoveryRoot = getRootDatabase();
          const previousActiveProfileId = recoveryRoot.activeProfileId;
          recoveryRoot.profiles.push(recoveryFixture);
          selectProfileCard(recoveryFixture.id);
          const forgotPinButton = document.getElementById('btnForgotProfilePin');
          if (forgotPinButton.hidden) throw new Error('Recovery action remained hidden for a protected profile.');
          forgotPinButton.click();
          if (document.getElementById('profileRecoveryPanel').style.display === 'none' || !document.getElementById('recoveryProfileTitle').textContent.includes('Recovery Smoke')) throw new Error('Forgot PIN did not open the selected profile recovery panel.');
          cancelPinRecovery();
          if (document.getElementById('profileUnlockPanel').style.display === 'none') throw new Error('Recovery cancellation did not return to PIN entry.');
          recoveryRoot.profiles = recoveryRoot.profiles.filter(profile => profile.id !== recoveryFixture.id);
          recoveryRoot.activeProfileId = previousActiveProfileId;
          document.getElementById('profileOverlay').style.display = 'none';

          const smokeEnvelope = await createBackupEnvelope(runtimeProfile, '123456', { appVersion: 'smoke' });
          const openedEnvelope = await openBackupEnvelope(smokeEnvelope, '123456');
          if (!AdvisoryData.checkAdvisoryIntegrity(openedEnvelope).isValid) throw new Error('Versioned backup envelope round trip failed.');
          await saveRootDatabase();
          if (!getRootDatabase().integrity?.digest || !getRootIntegrityStatus().valid) throw new Error('Root database integrity metadata was not generated.');
          runDatabaseIntegrityCheck();
          await new Promise(resolve => setTimeout(resolve, 0));
          const storageIntegrityReport = document.querySelector('[data-storage-integrity-report]');
          if (!storageIntegrityReport || !storageIntegrityReport.textContent.includes('integrity metadata is active')) throw new Error('Database Integrity Checker did not report file checksum status.');
          closeIntegrityResultsModal();

          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: ' ', code: 'Space', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true
          }));
          await new Promise(resolve => setTimeout(resolve, 0));
          const adminShortcutSurface = document.querySelector('.adm-overlay, .adm-auth-box, .adm-panel');
          if (!adminShortcutSurface) throw new Error('Ctrl + Alt + Shift + Space did not open the Admin authentication surface.');
          const adminPassphraseInput = adminShortcutSurface.querySelector('input[type="password"]');
          const adminVerifyButton = adminShortcutSurface.querySelector('.adm-btn--primary');
          if (!adminPassphraseInput || !adminVerifyButton) throw new Error('Admin authentication controls were not rendered.');
          adminPassphraseInput.value = ['114', '@Juan', '@239'].join('');
          adminVerifyButton.click();
          await new Promise(resolve => setTimeout(resolve, 120));
          const authenticatedAdminPanel = document.querySelector('.adm-panel');
          if (!authenticatedAdminPanel) throw new Error('The reset Admin passphrase did not authenticate.');
          const testingTab = authenticatedAdminPanel.querySelector('[data-admin-testing-tab]');
          if (!testingTab) throw new Error('The Testing tab was not added after Admin authentication.');
          const realProfileReference = getActiveProfileDatabase();
          const realProfileBytes = JSON.stringify(realProfileReference);
          const realNavigation = getRuntimeNavigationState();
          testingTab.click();
          const startMockButton = authenticatedAdminPanel.querySelector('.admin-testing-start');
          if (!startMockButton) throw new Error('The complete mock workspace action was not rendered.');
          startMockButton.click();
          const startConfirmation = document.querySelector('#adminTestModeConfirm [data-confirm]');
          if (!startConfirmation) throw new Error('Starting the mock workspace did not request confirmation.');
          startConfirmation.click();
          await new Promise(resolve => setTimeout(resolve, 160));
          if (!AdminTestMode.isActive()) throw new Error('Admin Test Mode did not become active.');
          if (!document.getElementById('adminTestModeBanner')) throw new Error('The persistent Admin Test Mode banner was not rendered.');
          const mockProfile = getActiveProfileDatabase();
          if (mockProfile === realProfileReference || mockProfile.assignments?.length !== 4) throw new Error('The runtime workspace was not replaced with the complete mock profile.');
          if (!AdminTestMode.shouldSuppressPersistence()) throw new Error('Persistence was not suppressed while Admin Test Mode was active.');
          const rouletteAssignment = mockProfile.assignments.find(assignment => TeacherToolsCore.activeLearners(assignment).length >= 2);
          if (!rouletteAssignment) throw new Error('The mock workspace did not provide a class for the Name Picker roulette test.');
          mockProfile.currentAssignmentId = rouletteAssignment.id;
          setView('tools');
          TeacherTools.activate('groups');
          TeacherTools.randomizeGroups();
          await new Promise(resolve => setTimeout(resolve, 120));
          if (!document.querySelector('.group-results--randomizing')
            || !document.querySelector('.group-randomizer-status')
            || !document.querySelector('.tool-control-strip__actions .btn-primary')?.disabled) {
            throw new Error('Group Randomizer did not enter its learner movement animation.');
          }
          await new Promise(resolve => setTimeout(resolve, 2300));
          const settledGroupLearners = Array.from(document.querySelectorAll('[data-group-learner-id]'))
            .map(element => element.dataset.groupLearnerId);
          if (document.querySelector('.group-results--randomizing')
            || settledGroupLearners.length !== TeacherToolsCore.activeLearners(rouletteAssignment).length
            || new Set(settledGroupLearners).size !== settledGroupLearners.length) {
            throw new Error('Group Randomizer did not settle into a complete unique final grouping.');
          }
          TeacherTools.activate('picker');
          TeacherTools.pickName();
          await new Promise(resolve => setTimeout(resolve, 90));
          if (!document.querySelector('.name-picker-stage.is-spinning')) throw new Error('Name Picker roulette did not enter its spinning state.');
          if (!document.querySelector('#namePickerRouletteAvatar .learner-avatar')) throw new Error('Name Picker roulette did not shuffle an avatar with the learner name.');
          const rouletteButtons = Array.from(document.querySelectorAll('.name-picker-stage__actions button'));
          if (!rouletteButtons.length || rouletteButtons.some(button => !button.disabled)) throw new Error('Name Picker controls remained active while the roulette was spinning.');
          for (let attempt = 0; attempt < 70; attempt++) {
            const pickerName = document.getElementById('namePickerRouletteName');
            const pickerAvatar = document.getElementById('namePickerRouletteAvatar');
            if (pickerName
              && pickerName.textContent.trim() !== 'Ready to pick'
              && pickerAvatar?.classList.contains('is-revealed')
              && pickerAvatar.querySelector('.learner-avatar')
              && !document.querySelector('.name-picker-stage.is-spinning')
              && document.querySelector('.teacher-tools-confetti')) {
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          const rouletteName = document.getElementById('namePickerRouletteName');
          const rouletteAvatar = document.getElementById('namePickerRouletteAvatar');
          if (!rouletteName
            || rouletteName.textContent.trim() === 'Ready to pick'
            || document.querySelector('.name-picker-stage.is-spinning')
            || !rouletteAvatar?.classList.contains('is-revealed')
            || !rouletteAvatar.querySelector('.learner-avatar')
            || !document.querySelector('.teacher-tools-confetti')) {
            throw new Error('Name Picker roulette did not settle on a learner.');
          }
          const mockTools = TeacherToolsCore.normalize(mockProfile);
          const checklistTerm = String(mockProfile.currentTerm || '1');
          const checklistMapePart = typeof isMapehSubject === 'function' && isMapehSubject(rouletteAssignment.subject)
            ? 'music_arts'
            : '';
          let renderedChecklist = mockTools.performanceChecklists.find(item =>
            item.assignmentId === rouletteAssignment.id
            && item.term === checklistTerm
            && String(item.mapePart || '') === checklistMapePart
            && item.status === 'active'
          );
          if (!renderedChecklist) {
            renderedChecklist = PerformanceChecklist.create(rouletteAssignment, checklistTerm, {
              activityMode: true,
              activityTitle: 'Smoke Activity 1',
              mapePart: checklistMapePart
            });
            mockTools.performanceChecklists.push(renderedChecklist);
          }
          PerformanceChecklist.addActivity(renderedChecklist, {
            criterionId: renderedChecklist.criteria[0].id,
            title: 'Smoke Added Activity',
            date: '2099-08-02'
          });
          renderedChecklist.sessions.forEach(session => {
            if (session.activity) session.activity.destinationComponent = 'TRACKING';
          });
          TeacherTools.activate('checklist');
          await new Promise(resolve => setTimeout(resolve, 80));
          const renderedActivityTitles = Array.from(document.querySelectorAll('.checklist-activity-column > span'))
            .map(element => element.textContent.trim());
          if (!renderedActivityTitles.includes('Smoke Added Activity')) {
            throw new Error('An added activity was not reflected in the Performance Checklist table.');
          }
          const checklistToolbar = document.querySelector('.checklist-tool .simulator-toolbar');
          const checklistToolbarActions = checklistToolbar?.querySelector('.simulator-toolbar__actions');
          const checklistActionButtons = Array.from(checklistToolbarActions?.querySelectorAll('.checklist-toolbar-action') || []);
          const checklistSupportStyles = ['--bulk', '--picker', '--more'].map(suffix => {
            const button = checklistToolbarActions?.querySelector('.checklist-toolbar-action' + suffix);
            const style = button ? getComputedStyle(button) : null;
            return {
              found: Boolean(button),
              backgroundImage: style?.backgroundImage || 'none',
              color: style?.color || ''
            };
          });
          const distinctChecklistBackgrounds = new Set(checklistSupportStyles.map(item => item.backgroundImage));
          if (!checklistToolbar
            || !checklistToolbarActions
            || checklistActionButtons.length !== 5
            || checklistSupportStyles.some(item => !item.found || item.backgroundImage === 'none')
            || distinctChecklistBackgrounds.size !== 3
            || checklistActionButtons.some(button => button.scrollWidth > button.clientWidth + 1)
            || checklistToolbarActions.getBoundingClientRect().right > checklistToolbar.getBoundingClientRect().right + 1) {
            throw new Error('Performance Checklist toolbar actions did not receive distinct, contained color treatments.');
          }
          TeacherTools.openChecklistPicker();
          await new Promise(resolve => setTimeout(resolve, 40));
          const miniPickerStage = document.querySelector('.checklist-picker__stage');
          const miniPickerButton = document.querySelector('.checklist-picker__actions .btn-primary');
          if (!miniPickerStage || !miniPickerButton) {
            throw new Error('The Performance Checklist mini picker did not open.');
          }
          miniPickerButton.click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const spinningMiniPickerStage = document.querySelector('.checklist-picker__stage');
          const spinningMiniPickerButton = document.querySelector('.checklist-picker__actions .btn-primary');
          const spinningMiniPickerName = document.getElementById('checklistPickerRouletteName');
          if (!spinningMiniPickerStage?.classList.contains('is-spinning')
            || spinningMiniPickerButton?.textContent.trim() !== 'Picking...'
            || spinningMiniPickerName?.getAttribute('aria-busy') !== 'true') {
            throw new Error('The Performance Checklist mini picker did not enter its suspense animation.');
          }
          for (let attempt = 0; attempt < 70; attempt++) {
            const pickerName = document.getElementById('checklistPickerRouletteName');
            const pickerStage = document.querySelector('.checklist-picker__stage');
            if (pickerName
              && pickerName.textContent.trim() !== 'Ready to pick'
              && pickerName.classList.contains('is-revealed')
              && !pickerStage?.classList.contains('is-spinning')) {
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          const revealedMiniPickerName = document.getElementById('checklistPickerRouletteName');
          const finalMiniPickerStage = document.querySelector('.checklist-picker__stage');
          const finalMiniPickerStatus = document.querySelector('.checklist-picker__status')?.textContent || '';
          if (!revealedMiniPickerName
            || revealedMiniPickerName.textContent.trim() === 'Ready to pick'
            || !revealedMiniPickerName.classList.contains('is-revealed')
            || !document.querySelector('#checklistPickerRouletteAvatar.is-revealed .learner-avatar')
            || finalMiniPickerStage?.classList.contains('is-spinning')
            || !finalMiniPickerStatus.includes('remaining in this draw cycle')
            || !document.querySelector('.teacher-tools-confetti')) {
            throw new Error('The Performance Checklist mini picker did not finish with a selected learner reveal: '
              + JSON.stringify({
                name: revealedMiniPickerName?.textContent?.trim() || '',
                revealed: Boolean(revealedMiniPickerName?.classList.contains('is-revealed')),
                spinning: Boolean(finalMiniPickerStage?.classList.contains('is-spinning')),
                status: finalMiniPickerStatus.trim()
              }));
          }
          document.querySelector('.checklist-picker')?.closest('.modal')?.querySelector('[data-close]')?.click();
          TeacherTools.openChecklistCriteria();
          await new Promise(resolve => setTimeout(resolve, 40));
          const criteriaModal = document.querySelector('.checklist-criteria-modal');
          const criteriaBody = criteriaModal?.querySelector('.modal__body');
          const criteriaRow = criteriaModal?.querySelector('.checklist-settings-row');
          if (!criteriaModal || !criteriaBody || !criteriaRow
            || criteriaRow.getBoundingClientRect().right > criteriaBody.getBoundingClientRect().right + 1
            || criteriaRow.scrollWidth > criteriaBody.clientWidth + 1) {
            throw new Error('Manage Checklist Criteria still overflows its modal.');
          }
          criteriaModal.querySelector('[data-cancel]')?.click();
          TeacherTools.openGradeContributionDashboard();
          await new Promise(resolve => setTimeout(resolve, 40));
          const contributionGuide = document.querySelector('.checklist-contribution-guide');
          if (!contributionGuide
            || contributionGuide.querySelectorAll('.checklist-contribution-steps li').length !== 4
            || !document.querySelector('[data-edit-graded-activity]')
            || !document.querySelector('[data-add-graded-activity]')) {
            throw new Error('Tracking Only grade contributions did not provide the guided setup actions.');
          }
          contributionGuide.closest('.modal')?.querySelector('[data-close]')?.click();
          const currentSmokeChecklist = TeacherToolsCore.normalize(mockProfile).performanceChecklists
            .find(item => item.id === renderedChecklist.id);
          const gradedSmokeSession = currentSmokeChecklist.sessions
            .find(item => item.title === 'Smoke Added Activity');
          gradedSmokeSession.activity.destinationComponent = 'WW';
          const gradedSmokeLearner = TeacherToolsCore.activeLearners(rouletteAssignment)[0];
          const smokeTargetMax = gradedSmokeSession.activity.maxPoints;
          rouletteAssignment.assessments.push(
            {
              id: 'smoke-empty-checklist-target',
              title: 'Smoke Empty WW',
              component: 'WW',
              term: checklistTerm,
              maxScore: smokeTargetMax,
              ...(checklistMapePart ? { mapePart: checklistMapePart } : {})
            },
            {
              id: 'smoke-overflow-checklist-target',
              title: 'Smoke Full WW',
              component: 'WW',
              term: checklistTerm,
              maxScore: smokeTargetMax,
              ...(checklistMapePart ? { mapePart: checklistMapePart } : {})
            }
          );
          rouletteAssignment.scores[gradedSmokeLearner.id + '|smoke-overflow-checklist-target'] = smokeTargetMax;
          PerformanceChecklist.setEntry(
            currentSmokeChecklist,
            rouletteAssignment,
            gradedSmokeSession.id,
            gradedSmokeLearner.id,
            gradedSmokeSession.activity.criterionId,
            smokeTargetMax
          );
          TeacherTools.activate('checklist');
          TeacherTools.openGradeContributionDashboard();
          await new Promise(resolve => setTimeout(resolve, 40));
          const recommendationText = document.querySelector('.checklist-target-recommendation')?.textContent || '';
          const overflowText = Array.from(document.querySelectorAll('.checklist-warning'))
            .map(element => element.textContent)
            .join(' ');
          const overflowOption = document.querySelector('option[value="smoke-overflow-checklist-target"]');
          if (!recommendationText.includes('Smoke Empty WW')
            || !overflowText.includes('Smoke Full WW')
            || !overflowText.includes('above HPS')
            || !overflowOption?.disabled) {
            throw new Error('Grade contribution target recommendations did not prioritize empty assessments and block HPS overflow: '
              + JSON.stringify({
                recommendationText,
                overflowText,
                overflowOptionDisabled: Boolean(overflowOption?.disabled)
              }));
          }
          const saveActivityButton = document.querySelector('[data-save-activity="' + gradedSmokeSession.activity.id + '"]');
          if (!saveActivityButton || saveActivityButton.disabled) {
            throw new Error('The recommended checklist activity target could not be saved.');
          }
          saveActivityButton.click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const savedActivityState = saveActivityButton.closest('.checklist-contribution-card')
            ?.querySelector('.checklist-contribution-card__state')?.textContent || '';
          const saveCriterionErrorToast = Array.from(document.querySelectorAll('.toast'))
            .some(element => element.textContent.includes('criterionId is not defined'));
          const savedSmokeChecklist = TeacherToolsCore.normalize(getActiveProfileDatabase()).performanceChecklists
            .find(item => item.id === renderedChecklist.id);
          const savedSmokeSession = savedSmokeChecklist?.sessions
            .find(item => item.id === gradedSmokeSession.id);
          const savedSmokeTargetId = savedSmokeSession?.activity?.publicationTarget?.assessmentId || '';
          if (saveCriterionErrorToast
            || saveActivityButton.textContent.trim() !== 'Saved'
            || !savedActivityState.includes('Target saved')
            || savedSmokeTargetId !== 'smoke-empty-checklist-target'
            || !document.body.contains(saveActivityButton)) {
            throw new Error('Saving a checklist activity target did not provide durable confirmation: '
              + JSON.stringify({
                criterionErrorToast: saveCriterionErrorToast,
                buttonText: saveActivityButton.textContent.trim(),
                savedActivityState,
                targetId: savedSmokeTargetId,
                dialogRemainedOpen: document.body.contains(saveActivityButton)
              }));
          }
          const reviewActivityButton = document.querySelector('[data-review-activity="' + gradedSmokeSession.activity.id + '"]');
          if (!reviewActivityButton || reviewActivityButton.disabled) {
            throw new Error('The recommended checklist activity target could not be reviewed.');
          }
          reviewActivityButton.click();
          await new Promise(resolve => setTimeout(resolve, 100));
          const publicationModal = document.querySelector('.checklist-publication-preview-modal');
          const publicationBody = publicationModal?.querySelector('.modal__body');
          const publicationActions = publicationModal?.querySelector('.modal__actions');
          const publicationRect = publicationModal?.getBoundingClientRect();
          const publicationActionsRect = publicationActions?.getBoundingClientRect();
          const publicationBodyStyle = publicationBody ? getComputedStyle(publicationBody) : null;
          const criterionErrorToast = Array.from(document.querySelectorAll('.toast'))
            .some(element => element.textContent.includes('criterionId is not defined'));
          if (!publicationModal
            || !publicationBody
            || !publicationActions
            || criterionErrorToast
            || publicationRect.top < 42
            || publicationRect.bottom > window.innerHeight - 54
            || publicationActionsRect.bottom > publicationRect.bottom + 1
            || publicationBodyStyle.overflowY !== 'auto') {
            throw new Error('Checklist publication preview was not scroll-safe or activity target saving failed: '
              + JSON.stringify({
                criterionErrorToast,
                modalTop: publicationRect?.top,
                modalBottom: publicationRect?.bottom,
                viewportHeight: window.innerHeight,
                actionsBottom: publicationActionsRect?.bottom,
                bodyOverflowY: publicationBodyStyle?.overflowY
              }));
          }
          publicationModal.querySelector('[data-cancel]')?.click();
          TeacherTools.activate('simulator');
          await new Promise(resolve => setTimeout(resolve, 80));
          const simulatorWrap = document.querySelector('.simulator-table-wrap');
          if (!simulatorWrap || simulatorWrap.scrollWidth - simulatorWrap.clientWidth > 2) {
            throw new Error('Grade Simulator table still requires horizontal scrolling.');
          }
          const previousAppZoom = parseInt(document.documentElement.style.fontSize, 10) || 100;
          const simulatorZoomLevels = [];
          for (const zoom of [100, 125, 150, 200]) {
            setZoomPct(zoom);
            await new Promise(resolve => setTimeout(resolve, 50));
            const zoomedSimulatorWrap = document.querySelector('.simulator-table-wrap');
            if (!zoomedSimulatorWrap || zoomedSimulatorWrap.scrollWidth - zoomedSimulatorWrap.clientWidth > 2) {
              throw new Error('Grade Simulator table overflowed at ' + zoom + '% app zoom.');
            }
            simulatorZoomLevels.push(zoom);
          }
          setZoomPct(previousAppZoom);
          mockProfile.teacherName = 'MUTATED TEST TEACHER';
          const suppressedSave = await saveDatabase();
          if (!suppressedSave) throw new Error('A suppressed test-mode save did not report safe in-memory success.');
          await AdminTestMode.exitTestMode();
          if (AdminTestMode.isActive()) throw new Error('Admin Test Mode remained active after exit.');
          if (getActiveProfileDatabase() !== realProfileReference) throw new Error('Exiting test mode did not restore the exact original profile reference.');
          if (JSON.stringify(getActiveProfileDatabase()) !== realProfileBytes) throw new Error('Mock changes leaked into the restored real workspace.');
          const restoredNavigation = getRuntimeNavigationState();
          if (restoredNavigation.currentView !== realNavigation.currentView || restoredNavigation.recordTab !== realNavigation.recordTab) throw new Error('Exiting test mode did not restore the previous view and term.');
          if (document.getElementById('adminTestModeBanner')) throw new Error('The Admin Test Mode banner remained after exit.');

          return { modules: required.length, learnerAvatars: true, teacherTools: true, animatedGroupRandomizer: true, recurringChecklistActivities: true, namePickerRoulette: true, avatarRoulette: true, selectionConfetti: true, checklistMiniPickerRoulette: true, compactGradeSimulator: true, simulatorZoomLevels, usageAnalytics: true, backupRecovery: true, sharedFolderSync: true, adminTestWorkspace: true, adminTestLifecycle: true, adminSaveSuppression: true, adminShortcut: true, setupClick: true, dynamicSidebar: true, dedicatedPage: true, setupAutofill: true, automaticSubjects: true, splitMapeh: true, mapehAverage: true, gradeTabs: true, inlineRoster: true, inlineSettings: true, subjectWidths: true, subjectBorders: true, advisoryActionColors: true, frozenLearnerColumn: true, subjectExpansion: true, subjectSorting: true, simpleSourceAssignment: true, automaticFileIdentification: true, exportClick: true, rosterImportReview: true, finalGrades: true, resetChoices: true, modalLayering: true, subjectWatermark: true, districtPersistence: true, integrityCheck: true, backupRestore: true, databaseChecksum: true, pinRecovery: true, qrRecovery: true, versionedBackup: true, offline: ${isOfflineSmokeTest} };
          } catch (error) {
            return { __error: String(error?.stack || error?.message || error) };
          }
        })()`);
        if (result?.__error) throw new Error(result.__error);
        const zoomChecks = [];
        for (const factor of [1, 1.25, 1.5, 2]) {
          mainWindow.webContents.setZoomFactor(factor);
          await new Promise(resolve => setTimeout(resolve, 80));
          const zoomResult = await mainWindow.webContents.executeJavaScript(`(() => {
            const page = document.querySelector('.advisory-page');
            AdvisoryGradeTransfer.setPanelTab('grades', page);
            const wrap = page.querySelector('[data-advisory-panel="grades"] .advisory-grade-matrix-wrap');
            const matrix = wrap.querySelector('.advisory-grade-matrix--finals-only');
            const general = matrix?.querySelector('.advisory-general-average');
            const learner = matrix?.querySelector('tbody td:first-child');
            const compact = matrix?.querySelector('.advisory-subject-name--compact');
            wrap.scrollTop = Math.min(120, Math.max(0, wrap.scrollHeight - wrap.clientHeight));
            const subjectHeader = matrix?.querySelector('thead tr:first-child .advisory-subject-heading');
            const finalHeader = matrix?.querySelector('thead tr:nth-child(2) th');
            const subjectHeaderRect = subjectHeader?.getBoundingClientRect();
            const finalHeaderRect = finalHeader?.getBoundingClientRect();
            return {
              overflow: wrap.scrollWidth - wrap.clientWidth,
              generalVisible: Boolean(general && general.getBoundingClientRect().right <= wrap.getBoundingClientRect().right + 1),
              learnerWrap: learner ? getComputedStyle(learner).whiteSpace === 'normal' : false,
              compactVisible: compact ? getComputedStyle(compact).display !== 'none' : false,
              headerRowsSeparated: Boolean(subjectHeaderRect && finalHeaderRect && finalHeaderRect.top >= subjectHeaderRect.bottom - 1)
            };
          })()`);
          if (zoomResult.overflow > 2 || !zoomResult.generalVisible || !zoomResult.learnerWrap || !zoomResult.headerRowsSeparated || (factor > 1 && !zoomResult.compactVisible)) {
            throw new Error(`Final-only layout failed at ${factor * 100}% zoom: ${JSON.stringify(zoomResult)}`);
          }
          zoomChecks.push(factor);
        }
        mainWindow.webContents.setZoomFactor(1);
        result.zoomFactors = zoomChecks;
        clearTimeout(smokeTimeout);
        if (rendererErrors.length) {
          console.error('SMOKE_FAIL Renderer console errors: ' + rendererErrors.join(' | '));
          app.exit(1);
          return;
        }
        console.log('SMOKE_OK ' + JSON.stringify(result));
        app.exit(0);
      } catch (error) {
        clearTimeout(smokeTimeout);
        console.error('SMOKE_FAIL ' + (error && error.stack ? error.stack : error));
        app.exit(1);
      }
    });
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Alt') {
      event.preventDefault();
      return;
    }

    // Block DevTools and Reload keyboard shortcuts in production builds
    if (app.isPackaged) {
      const key = input.key.toLowerCase();
      const isDevTools = (input.key === 'F12') || (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'));
      const isReload = (input.key === 'F5') || (input.control && key === 'r');
      if (isDevTools || isReload) {
        event.preventDefault();
      }
    }
  });

  // Chromium Web Bluetooth device selection handler
  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    selectBluetoothDeviceCallback = callback;
    // Send list of discovered devices to the renderer process
    mainWindow.webContents.send('bluetooth:device-list', deviceList);
  });

  mainWindow.once('ready-to-show', () => {
    if (isSmokeTest) return;
    mainWindow.show();
    mainWindow.maximize();
    // Open DevTools automatically in development (not in packaged builds)
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    // Start updater only after renderer is fully loaded and listening
    updater.initAutoUpdater(mainWindow);
  });

  mainWindow.on('close', (e) => {
    if (!isConfirmedExit) {
      e.preventDefault();
      try {
        if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('app-close-triggered');
        } else {
          isConfirmedExit = true;
          app.exit(0);
        }
      } catch (err) {
        console.error('Failed to send close trigger:', err);
        isConfirmedExit = true;
        app.exit(0);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Build minimal menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-save') },
        { type: 'separator' },
        { label: 'Export JSON…', click: () => mainWindow.webContents.send('menu-export-json') },
        { label: 'Import JSON…', click: () => mainWindow.webContents.send('menu-import-json') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About E-Class Record',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About E-Class Record',
              message: 'E-Class Record v' + app.getVersion(),
              detail: 'Local, teacher-owned class record for DepEd three-term grading workflows compliant with DepEd Order No. 15 s. 2026.'
            });
          }
        },
        {
          label: 'Check for Updates…',
          click: () => updater.checkForUpdates(mainWindow)
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(null);
}

// ── IPC Handlers ──────────────────────────────────────────

function isMockTestArtifact(...values) {
  return values.some(value => {
    if (value === undefined || value === null) return false;
    let text = '';
    try {
      text = typeof value === 'string' ? value : JSON.stringify(value);
    } catch (_error) {
      text = String(value);
    }
    return /TEST DATA(?:\s|—|-)*NOT FOR OFFICIAL USE/i.test(text)
      || /"isMockTestData"\s*:\s*true/i.test(text)
      || /"mockTestLabel"\s*:/i.test(text);
  });
}

function mockSafeFilename(filename, ...payloads) {
  const value = String(filename || 'eclass-record-export').trim() || 'eclass-record-export';
  if (!isMockTestArtifact(...payloads) || /^TEST-MOCK-/i.test(value)) return value;
  return `TEST-MOCK-${value}`;
}

ipcMain.handle('admin:authenticate', async (_event, passphrase) => {
  const cooldown = adminSession.checkCooldown();
  if (cooldown.locked) {
    return { success: false, locked: true, remainingMs: cooldown.remainingMs };
  }
  if (verifyAdminPassphrase(passphrase)) {
    return { success: true, token: adminSession.createSession() };
  }
  return { success: false, ...adminSession.recordFailedAttempt() };
});

ipcMain.handle('admin:has-gh-token', async (_event, token) => {
  try {
    adminSession.validateSession(token);
    return { success: true, hasToken: false };
  } catch (_error) {
    return { success: false, hasToken: false, error: 'Admin session expired.' };
  }
});

ipcMain.handle('admin:logout', async () => {
  adminSession.invalidateSession();
  return { success: true };
});

ipcMain.handle('db:load', async () => {
  return fileIO.loadDatabase();
});

ipcMain.handle('db:save', async (_event, data) => {
  return fileIO.saveDatabase(data);
});

ipcMain.handle('dialog:export-json', async (_event, jsonString, defaultFileName) => {
  const filename = mockSafeFilename(defaultFileName || 'eclass-record-backup.json', jsonString);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export JSON',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  fileIO.writeFile(result.filePath, jsonString);
  return { success: true, path: result.filePath };
});

ipcMain.handle('dialog:import-json', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import JSON Backup',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const content = fileIO.readFile(result.filePaths[0]);
  return { success: true, content: content, name: path.basename(result.filePaths[0]) };
});

ipcMain.handle('dialog:export-recovery-qr', async (_event, dataUrl, defaultFileName) => {
  const image = recoveryQr.decodeRecoveryQrPng(dataUrl);
  const filename = `${safePathPart(String(defaultFileName || 'eclass-recovery-qr').replace(/\.png$/i, ''))}.png`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PIN Recovery QR',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  fs.writeFileSync(result.filePath, image);
  return { success: true, path: result.filePath };
});

ipcMain.handle('dialog:print-recovery-qr', async (_event, dataUrl, label) => {
  const html = recoveryQr.createRecoveryQrPrintHtml(dataUrl, label);
  const printWindow = new BrowserWindow({
    width: 720, height: 900, show: false, parent: mainWindow,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return new Promise(resolve => {
    printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      if (!printWindow.isDestroyed()) printWindow.destroy();
      resolve({ success, error: success ? '' : failureReason || 'Printing was canceled.' });
    });
  });
});

ipcMain.handle('dialog:export-grade-transfer', async (_event, jsonString, defaultFileName) => {
  const filename = mockSafeFilename(defaultFileName || 'ECR_Grades.json', jsonString);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Grade Transfer File',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'Grade Transfer Files', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  fileIO.writeFile(result.filePath, jsonString);
  return { success: true, path: result.filePath };
});

ipcMain.handle('dialog:import-grade-transfer', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Grade Transfer File',
    filters: [{ name: 'Grade Transfer Files', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  const filePath = result.filePaths[0];
  return { success: true, content: fileIO.readFile(filePath), name: path.basename(filePath) };
});

ipcMain.handle('dialog:export-advisory-reset-backup', async (_event, request) => {
  const files = Array.isArray(request?.files) ? request.files : [];
  const requestedName = String(request?.defaultFileName || 'ECR_Advisory_Backup.zip').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const defaultFileName = mockSafeFilename(requestedName, request);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Advisory Class Backup',
    defaultPath: path.join(app.getPath('desktop'), defaultFileName.endsWith('.zip') ? defaultFileName : `${defaultFileName}.zip`),
    filters: [{ name: 'Advisory Class ZIP Backup', extensions: ['zip'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  const archive = zipArchive.createZip(files.map(file => ({ name: file.name, content: file.content })));
  fs.writeFileSync(result.filePath, archive);
  return { success: true, path: result.filePath, fileCount: files.length };
});

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Secondary Auto-Backup Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('backup:select-and-scan', async (_event, backupRecoveryId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Find Backup in OneDrive or Local Folder',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  pruneDiscoveredBackupHandles();
  const scan = fileIO.scanBackupDirectory(result.filePaths[0], backupRecoveryId);
  if (!scan.latest) {
    return {
      canceled: false,
      found: false,
      invalidMatchingFiles: scan.invalidMatchingFiles
    };
  }

  const handle = crypto.randomUUID();
  if (discoveredBackupHandles.size >= 100) {
    const oldestHandle = discoveredBackupHandles.keys().next().value;
    discoveredBackupHandles.delete(oldestHandle);
  }
  discoveredBackupHandles.set(handle, {
    filePath: scan.latest.filePath,
    backupRecoveryId: scan.latest.backupRecoveryId,
    createdAt: Date.now()
  });
  const { filePath: _filePath, ...metadata } = scan.latest;
  return {
    canceled: false,
    found: true,
    handle,
    metadata,
    matchCount: scan.matchCount,
    invalidMatchingFiles: scan.invalidMatchingFiles
  };
});

ipcMain.handle('backup:read-discovered', async (_event, handle) => {
  pruneDiscoveredBackupHandles();
  const normalizedHandle = String(handle || '');
  const entry = discoveredBackupHandles.get(normalizedHandle);
  if (!entry) throw new Error('This backup selection has expired. Scan the folder again.');
  discoveredBackupHandles.delete(normalizedHandle);
  const backup = fileIO.readValidDiscoveredBackup(entry.filePath, entry.backupRecoveryId);
  return { content: backup.content };
});

ipcMain.handle('shared-sync:device-info', async () => {
  return sharedFolderSync.getDeviceInfo();
});

ipcMain.handle('shared-sync:rename-device', async (_event, label) => {
  return sharedFolderSync.renameDevice(label);
});

ipcMain.handle('shared-sync:state', async (_event, backupRecoveryId) => {
  const state = sharedFolderSync.getState(backupRecoveryId);
  if (state.configured && state.available) watchSharedSyncFolder(backupRecoveryId);
  return state;
});

ipcMain.handle('shared-sync:configure-folder', async (_event, backupRecoveryId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Shared Sync Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const state = sharedFolderSync.configureFolder(backupRecoveryId, result.filePaths[0]);
  watchSharedSyncFolder(backupRecoveryId);
  return { canceled: false, ...state };
});

function exposeBackupScan(scan) {
  if (!scan.latest) {
    return {
      canceled: false,
      found: false,
      invalidMatchingFiles: scan.invalidMatchingFiles
    };
  }
  const handle = crypto.randomUUID();
  if (discoveredBackupHandles.size >= 100) {
    const oldestHandle = discoveredBackupHandles.keys().next().value;
    discoveredBackupHandles.delete(oldestHandle);
  }
  discoveredBackupHandles.set(handle, {
    filePath: scan.latest.filePath,
    backupRecoveryId: scan.latest.backupRecoveryId,
    createdAt: Date.now()
  });
  const { filePath: _filePath, ...metadata } = scan.latest;
  return {
    canceled: false,
    found: true,
    handle,
    metadata,
    matchCount: scan.matchCount,
    invalidMatchingFiles: scan.invalidMatchingFiles
  };
}

ipcMain.handle('backup:discover-onedrive', async () => {
  return fileIO.discoverOneDriveBackups();
});

ipcMain.handle('backup:scan-known-folder', async (_event, backupRecoveryId, folderPath) => {
  const validation = sharedFolderSync.validateOneDriveFolder(folderPath);
  pruneDiscoveredBackupHandles();
  return exposeBackupScan(fileIO.scanBackupDirectory(validation.folderPath, backupRecoveryId));
});

ipcMain.handle('shared-sync:select-onedrive-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a Folder Inside OneDrive',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const validation = sharedFolderSync.validateOneDriveFolder(result.filePaths[0]);
  return { canceled: false, ...validation };
});

ipcMain.handle('shared-sync:configure-selected-folder', async (_event, backupRecoveryId, folderPath) => {
  const state = sharedFolderSync.configureFolder(backupRecoveryId, folderPath);
  watchSharedSyncFolder(backupRecoveryId);
  return { canceled: false, ...state };
});

ipcMain.handle('shared-sync:inspect-selected-folder', async (_event, backupRecoveryId, folderPath) => {
  return sharedFolderSync.inspectFolder(backupRecoveryId, folderPath);
});

ipcMain.handle('shared-sync:disable', async (_event, backupRecoveryId) => {
  unwatchSharedSyncFolder(backupRecoveryId);
  return sharedFolderSync.disableFolder(backupRecoveryId);
});

ipcMain.handle('shared-sync:write-head', async (_event, backupRecoveryId, envelopeText) => {
  return sharedFolderSync.writeEnvelope('head', backupRecoveryId, envelopeText);
});

ipcMain.handle('shared-sync:write-base', async (_event, backupRecoveryId, envelopeText) => {
  return sharedFolderSync.writeEnvelope('base', backupRecoveryId, envelopeText);
});

ipcMain.handle('shared-sync:scan', async (_event, backupRecoveryId) => {
  return sharedFolderSync.scan(backupRecoveryId);
});

ipcMain.handle('shared-sync:create-restore-point', async () => {
  return fileIO.createLocalRestorePoint('shared-sync');
});

ipcMain.handle('database:create-restore-point', async (_event, reason) => {
  return fileIO.createLocalRestorePoint(String(reason || 'database-migration').slice(0, 80));
});

ipcMain.handle('shared-sync:read', async (_event, handle) => {
  return sharedFolderSync.read(handle);
});

ipcMain.handle('dialog:import-sf1', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Upload SF1 File',
    filters: [
      { name: 'SF1 Files', extensions: ['xlsx', 'xls', 'csv', 'txt'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };

  const filePath = result.filePaths[0];
  try {
    const sf1Reader = require('./sf1-reader');
    const table = sf1Reader.readSf1Table(filePath);
    return { success: true, table: table };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dialog:import-assessment-attachment', async (_event, assignmentId, assessmentId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Upload Assessment File',
    filters: [
      { name: 'Assessment Files', extensions: ['docx', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };

  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath).toLowerCase();
  const allowed = new Set(['.docx', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
  if (!allowed.has(ext)) return { success: false, error: 'Unsupported file type.' };

  const stats = fs.statSync(sourcePath);
  const originalName = path.basename(sourcePath);
  const folder = path.join(attachmentRoot(), safePathPart(assignmentId), safePathPart(assessmentId));
  fs.mkdirSync(folder, { recursive: true });

  const id = crypto.randomUUID();
  const storedName = `${Date.now()}-${id}${ext}`;
  const targetPath = path.join(folder, storedName);
  fs.copyFileSync(sourcePath, targetPath);

  const relativePath = path.relative(attachmentRoot(), targetPath).replace(/\\/g, '/');
  return {
    success: true,
    attachment: {
      id,
      originalName,
      storedName,
      relativePath,
      mimeType: mimeFromExtension(ext),
      size: stats.size,
      createdAt: new Date().toISOString()
    }
  };
});

ipcMain.handle('attachment:open', async (_event, relativePath) => {
  const targetPath = resolveAttachmentPath(relativePath);
  if (!fs.existsSync(targetPath)) return { success: false, error: 'Attachment file was not found.' };
  const error = await shell.openPath(targetPath);
  return error ? { success: false, error } : { success: true };
});

ipcMain.handle('attachment:remove', async (_event, relativePath) => {
  const targetPath = resolveAttachmentPath(relativePath);
  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  return { success: true };
});

ipcMain.handle('dialog:export-csv', async (_event, csvString, defaultFileName) => {
  const filename = mockSafeFilename(defaultFileName || 'eclass-record-grades.csv', csvString);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export CSV',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  fileIO.writeFile(result.filePath, '\uFEFF' + csvString); // BOM for Excel
  return { success: true, path: result.filePath };
});

ipcMain.handle('dialog:export-excel-template', async (_event, payload) => {
  const filename = mockSafeFilename(`Class-Record-${payload.gradeLevel}-${payload.section}-${payload.subject}.xlsx`, payload);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to DepEd Excel Template',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };

  try {
    const excelExporter = require('./excel-exporter');
    await excelExporter.generateExcel(result.filePath, payload);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error(e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dialog:export-pdf', async (_event, options) => {
  const { size, landscape, filename, metadata } = options || {};
  const isSelfContainedSf2Report = /^School Form 2 \(SF2\)\b/i.test(String(metadata?.title || '').trim());
  // SF2 already renders its complete official heading and class metadata inside
  // the document. Keep the shared app header enabled for older callers, while
  // automatically suppressing it for SF2 exports that predate includeHeader.
  const includeHeader = options?.includeHeader ?? !isSelfContainedSf2Report;
  const isTestArtifact = isMockTestArtifact(options, metadata);
  const exportFilename = mockSafeFilename(filename || 'Class-Record.pdf', options, metadata);
  const testNoticeHtml = isTestArtifact
    ? '<div style="color:#b91c1c;font-size:12px;font-weight:800;letter-spacing:1px;margin-bottom:5px;">TEST DATA — NOT FOR OFFICIAL USE</div>'
    : '';
  
  const headerHtml = `
    <div style="font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000; width: 100%; margin: 0 0.4in; box-sizing: border-box; border-bottom: 2px solid #000; padding-bottom: 8px;">
      ${testNoticeHtml}
      <div style="font-size: 16px; font-weight: bold; font-family: 'Segoe UI', Arial, sans-serif; color: #000; border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 6px; text-transform: uppercase;">
        ${metadata ? (metadata.title || '') : ''}
      </div>
      <table style="width: 100%; border-collapse: collapse; border: none; font-size: 11px; line-height: 1.25; font-family: 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 0;">
        <tr>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Region:</strong> ${metadata ? (metadata.region || '') : ''}
          </td>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>School Year:</strong> ${metadata ? (metadata.schoolYear || '') : ''}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Division:</strong> ${metadata ? (metadata.division || '') : ''}
          </td>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Grade & Section:</strong> Grade ${metadata ? (metadata.gradeLevel || '') : ''} - ${metadata ? (metadata.section || '') : ''}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>School Name:</strong> ${metadata ? (metadata.schoolName || '') : ''}
          </td>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Subject:</strong> ${metadata ? (metadata.subject || '') : ''}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>School ID:</strong> ${metadata ? (metadata.schoolId || '') : ''}
          </td>
          <td style="width: 50%; padding: 2px 0; border: none; font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Teacher:</strong> ${metadata ? (metadata.teacherName || '') : ''}
          </td>
        </tr>
      </table>
    </div>
  `;
  
  const footerHtml = `
    <div style="font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #555; width: 100%; margin: 0 0.4in; border-top: 1px solid #ddd; padding-top: 5px; display: flex; justify-content: space-between; box-sizing: border-box;">
      <div>
        <strong>File Stamp:</strong> ${exportFilename} &middot; 
        <strong>Generated:</strong> ${metadata ? (metadata.timestamp || '') : ''}
      </div>
      <div>
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    </div>
  `;

  const printOptions = {
    margins: {
      marginType: 'custom',
      // Advisory reports supply their own report header in the document. Reserving
      // space for the shared PDF header makes the two headers collide.
      top: includeHeader ? 1.45 : 0.4, // in inches
      bottom: includeHeader ? 0.6 : 0.4,
      left: 0.4, // in inches
      right: 0.4
    },
    pageSize: size || 'A4',
    landscape: !!landscape,
    printBackground: true,
    displayHeaderFooter: includeHeader,
    headerTemplate: includeHeader ? headerHtml : '',
    footerTemplate: includeHeader ? footerHtml : ''
  };
  
  try {
    const data = await mainWindow.webContents.printToPDF(printOptions);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: path.join(app.getPath('desktop'), exportFilename),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return { success: false };
    fs.writeFileSync(result.filePath, data);
    return { success: true, path: result.filePath };
  } catch (e) {
    console.error(e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dialog:print-choose', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'Print Web Layout', 'Export to DepEd Excel Template…'],
    defaultId: 2,
    cancelId: 0,
    title: 'Print / Export Options',
    message: 'Select how you would like to print or export this class record:',
    detail: 'Exporting to the DepEd Excel Template will populate the official class record format with all current scores and calculations.'
  });
  return result.response;
});


ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('system:performance-profile', () => {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const cpus = os.cpus() || [];
  const logicalProcessors = cpus.length;
  const reasons = [];

  if (totalMemoryBytes <= 5 * 1024 ** 3) reasons.push('Limited system memory');
  if (logicalProcessors <= 2) reasons.push('Limited processor capacity');

  return {
    totalMemoryBytes,
    freeMemoryBytes,
    logicalProcessors,
    cpuModel: String(cpus[0]?.model || '').trim().slice(0, 120),
    arch: os.arch(),
    platform: os.platform(),
    recommended: reasons.length > 0,
    reasons
  };
});

ipcMain.handle('updater:check', async (_event, options) => {
  return updater.checkForUpdates(mainWindow, options);
});

ipcMain.handle('updater:download', async (_event, options) => {
  return updater.downloadUpdate(options);
});

ipcMain.handle('updater:quit-and-install', async () => {
  const result = updater.quitAndInstall();
  if (result && result.started) isConfirmedExit = true;
  return result;
});

ipcMain.handle('shell:open-external', async (_event, url) => {
  await shell.openExternal(url);
});

function normalizePreviewText(value, limit) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function decodePreviewEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getPreviewMeta(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return decodePreviewEntities(match[1]);
    }
  }
  return '';
}

function resolvePreviewImage(imageUrl, baseUrl) {
  if (!imageUrl) return '';
  try {
    return new URL(imageUrl, baseUrl).toString();
  } catch (err) {
    return '';
  }
}

function parseLinkPreview(html, url) {
  const title = getPreviewMeta(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ]);
  const description = getPreviewMeta(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
  ]);
  const image = getPreviewMeta(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
  ]);
  const siteName = getPreviewMeta(html, [
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i
  ]);

  return {
    title: normalizePreviewText(title, 120),
    description: normalizePreviewText(description, 220),
    imageUrl: resolvePreviewImage(normalizePreviewText(image, 500), url),
    siteName: normalizePreviewText(siteName, 80),
    url
  };
}

const { fetchPublicUrl } = require('./link-preview-helper');

async function fetchLinkPreview(url) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch (err) {
    return { success: false, error: 'Invalid URL.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, error: 'Unsupported URL.' };
  }

  if (typeof fetch !== 'function') {
    return { success: false, error: 'Preview fetch is unavailable.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const { response, finalUrl } = await fetchPublicUrl(parsed, {
      fetchImpl: fetch,
      signal: controller.signal,
      headers: { 'user-agent': 'E-Class Record Link Preview' }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return { success: false, error: 'Preview is unavailable.' };
    }
    const html = (await response.text()).slice(0, 250000);
    return { success: true, preview: parseLinkPreview(html, finalUrl.toString()) };
  } catch (err) {
    if (err.message === 'PRIVATE_HOST') {
      return { success: false, error: 'Preview blocked for private/internal hosts.' };
    }
    return { success: false, error: 'Preview request failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

ipcMain.handle('link-preview:fetch', async (_event, url) => fetchLinkPreview(url));

ipcMain.handle('app:confirm-exit', () => {
  isConfirmedExit = true;
  app.exit(0);
});

// ── Bluetooth Sync IPC Listeners ──────────────────────────
ipcMain.on('bluetooth:select-device', (_event, deviceId) => {
  if (selectBluetoothDeviceCallback) {
    selectBluetoothDeviceCallback(deviceId);
    selectBluetoothDeviceCallback = null;
  }
});

ipcMain.on('bluetooth:cancel-device', () => {
  if (selectBluetoothDeviceCallback) {
    selectBluetoothDeviceCallback('');
    selectBluetoothDeviceCallback = null;
  }
});

// ── App Lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  if (isOfflineSmokeTest) {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (_details, callback) => callback({ cancel: true })
    );
  }
  createWindow();
});

app.on('before-quit', () => {
  isConfirmedExit = true;
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
