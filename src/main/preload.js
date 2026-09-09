/**
 * E-Class Record — Electron Preload Script
 *
 * Exposes a secure, limited context bridge for Electron IPC.
 */

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('A subscription callback is required.');
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Authenticated Admin panel
  adminAuth: (passphrase) => ipcRenderer.invoke('admin:authenticate', passphrase),
  adminHasGhToken: (token) => ipcRenderer.invoke('admin:has-gh-token', token),
  adminLogout: () => ipcRenderer.invoke('admin:logout'),

  // Database Operations
  loadDatabase: () => ipcRenderer.invoke('db:load'),
  saveDatabase: (data) => ipcRenderer.invoke('db:save', data),

  // School-owned encrypted Cloudflare relay (pilot feature flag)
  getSchoolCloudFeatureStatus: () => ipcRenderer.invoke('school-cloud:feature-status'),
  configureSchoolCloud: (schoolId, connection) => ipcRenderer.invoke('school-cloud:configure', schoolId, connection),
  activateSchoolCloud: (schoolId, connection) => ipcRenderer.invoke('school-cloud:activate', schoolId, connection),
  bootstrapSchoolCloud: (setup) => ipcRenderer.invoke('school-cloud:bootstrap', setup),
  getSchoolCloudStatus: (schoolId) => ipcRenderer.invoke('school-cloud:status', schoolId),
  listSchoolCloudConnections: () => ipcRenderer.invoke('school-cloud:connections'),
  disconnectSchoolCloud: (schoolId) => ipcRenderer.invoke('school-cloud:disconnect', schoolId),
  requestSchoolCloud: (schoolId, request) => ipcRenderer.invoke('school-cloud:request', schoolId, request),
  backupSchoolCloudProfile: (schoolId, database) => ipcRenderer.invoke('school-cloud:backup-profile', schoolId, database),
  restoreSchoolCloudProfile: (schoolId) => ipcRenderer.invoke('school-cloud:restore-profile', schoolId),

  // Android companion sync
  startCompanionWlan: (pairingContext) => ipcRenderer.invoke('companion:wlan-start', pairingContext),
  startCompanionBluetooth: (pairingContext) => ipcRenderer.invoke('companion:bluetooth-start', pairingContext),
  configureCompanionFirewall: () => ipcRenderer.invoke('companion:firewall-configure'),
  stopCompanionWlan: () => ipcRenderer.invoke('companion:wlan-stop'),
  getCompanionWlanStatus: () => ipcRenderer.invoke('companion:wlan-status'),
  publishCompanionSnapshot: (snapshot) => ipcRenderer.invoke('companion:publish-snapshot', snapshot),
  getCompanionMobileUpdateStatus: () => ipcRenderer.invoke('companion:mobile-update-status'),
  refreshCompanionMobileUpdateFromGithub: () => ipcRenderer.invoke('companion:mobile-update-refresh'),
  importCompanionMobileUpdate: () => ipcRenderer.invoke('companion:mobile-update-import'),
  startCompanionApkInstall: () => ipcRenderer.invoke('companion:apk-install-start'),
  stopCompanionApkInstall: () => ipcRenderer.invoke('companion:apk-install-stop'),
  getCompanionApkInstallStatus: () => ipcRenderer.invoke('companion:apk-install-status'),
  generateCompanionQr: (payload) => ipcRenderer.invoke('compute:generate-companion-qr', payload),
  sendCompanionChangesResult: (requestId, result) => ipcRenderer.send('companion:changes-result', requestId, result),
  onCompanionApplyChanges: (callback) => subscribe('companion:apply-changes', callback),
  onCompanionAuthorizePairing: (callback) => subscribe('companion:authorize-pairing', callback),
  onCompanionToolCommand: (callback) => subscribe('companion:tool-command', callback),
  onCompanionClientActivity: (callback) => subscribe('companion:client-activity', callback),
  onCompanionMobileUpdate: (callback) => subscribe('companion:mobile-update', callback),

  // File Backup & Migration Dialogs
  exportJson: (jsonString, defaultFileName) => ipcRenderer.invoke('dialog:export-json', jsonString, defaultFileName),
  importJson: () => ipcRenderer.invoke('dialog:import-json'),
  exportGradeTransfer: (jsonString, defaultFileName) => ipcRenderer.invoke('dialog:export-grade-transfer', jsonString, defaultFileName),
  importGradeTransfer: () => ipcRenderer.invoke('dialog:import-grade-transfer'),
  exportAdvisoryResetBackup: (request) => ipcRenderer.invoke('dialog:export-advisory-reset-backup', request),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectAndScanBackupFolder: (backupRecoveryId) => ipcRenderer.invoke('backup:select-and-scan', backupRecoveryId),
  discoverOneDriveBackups: () => ipcRenderer.invoke('backup:discover-onedrive'),
  scanKnownBackupFolder: (backupRecoveryId, folderPath) => ipcRenderer.invoke('backup:scan-known-folder', backupRecoveryId, folderPath),
  readDiscoveredBackup: (handle) => ipcRenderer.invoke('backup:read-discovered', handle),
  getSharedSyncDeviceInfo: () => ipcRenderer.invoke('shared-sync:device-info'),
  renameSharedSyncDevice: (label) => ipcRenderer.invoke('shared-sync:rename-device', label),
  getSharedSyncState: (backupRecoveryId) => ipcRenderer.invoke('shared-sync:state', backupRecoveryId),
  configureSharedSyncFolder: (backupRecoveryId) => ipcRenderer.invoke('shared-sync:configure-folder', backupRecoveryId),
  selectOneDriveSyncFolder: () => ipcRenderer.invoke('shared-sync:select-onedrive-folder'),
  configureSelectedSharedSyncFolder: (backupRecoveryId, folderPath) => ipcRenderer.invoke('shared-sync:configure-selected-folder', backupRecoveryId, folderPath),
  inspectSelectedSharedSyncFolder: (backupRecoveryId, folderPath) => ipcRenderer.invoke('shared-sync:inspect-selected-folder', backupRecoveryId, folderPath),
  disableSharedSync: (backupRecoveryId) => ipcRenderer.invoke('shared-sync:disable', backupRecoveryId),
  writeSharedSyncHead: (backupRecoveryId, envelopeText) => ipcRenderer.invoke('shared-sync:write-head', backupRecoveryId, envelopeText),
  writeSharedSyncBase: (backupRecoveryId, envelopeText) => ipcRenderer.invoke('shared-sync:write-base', backupRecoveryId, envelopeText),
  scanSharedSyncFolder: (backupRecoveryId) => ipcRenderer.invoke('shared-sync:scan', backupRecoveryId),
  createSharedSyncRestorePoint: () => ipcRenderer.invoke('shared-sync:create-restore-point'),
  createDatabaseRestorePoint: (reason) => ipcRenderer.invoke('database:create-restore-point', reason),
  readSharedSyncFile: (handle) => ipcRenderer.invoke('shared-sync:read', handle),
  onSharedSyncFolderChanged: (callback) => subscribe('shared-sync-folder-changed', callback),
  importSf1: () => ipcRenderer.invoke('dialog:import-sf1'),
  exportCsv: (csvString, defaultFileName) => ipcRenderer.invoke('dialog:export-csv', csvString, defaultFileName),
  showPrintChoose: () => ipcRenderer.invoke('dialog:print-choose'),
  exportExcelTemplate: (payload) => ipcRenderer.invoke('dialog:export-excel-template', payload),
  exportOfficialEcr: (payload) => ipcRenderer.invoke('dialog:export-official-ecr', payload),
  exportPaceForm: (payload) => ipcRenderer.invoke('dialog:export-pace-form', payload),
  getOfficialPaceFormHtml: (payload) => ipcRenderer.invoke('pace:official-form-html', payload || {}),
  exportPdf: (options) => ipcRenderer.invoke('dialog:export-pdf', options),
  generateRecoveryQr: (payload) => ipcRenderer.invoke('compute:generate-recovery-qr', payload),
  decodeRecoveryQrPixels: (pixels) => ipcRenderer.invoke('compute:decode-recovery-qr', pixels),
  generateSudoku: (difficulty = 'medium') => ipcRenderer.invoke('compute:generate-sudoku', difficulty),
  getDiagnosticPolicy: () => ipcRenderer.invoke('diagnostics:policy'),
  setDiagnosticCollectionEnabled: (enabled) => ipcRenderer.invoke('diagnostics:set-enabled', enabled === true),
  exportDiagnosticSupportBundle: () => ipcRenderer.invoke('diagnostics:export'),
  deleteDiagnosticData: () => ipcRenderer.invoke('diagnostics:delete'),
  getPermissionPreferences: () => ipcRenderer.invoke('security:permission-preferences'),
  setPermissionPreference: (capability, enabled) => ipcRenderer.invoke('security:set-permission-preference', capability, enabled === true),
  requestCapability: (capability) => ipcRenderer.invoke('security:request-capability', capability),
  unlockProfile: (profileId, pin) => ipcRenderer.invoke('security:unlock-profile', { profileId, pin: String(pin || '') }),
  lockProfile: () => ipcRenderer.invoke('security:lock-profile'),
  onProfileSessionLocked: (callback) => subscribe('security:profile-locked', callback),
  onCompanionWorkspaceResumed: (callback) => subscribe('companion:workspace-resumed', callback),
  exportRecoveryQr: (dataUrl, defaultFileName) => ipcRenderer.invoke('dialog:export-recovery-qr', dataUrl, defaultFileName),
  printRecoveryQr: (dataUrl, label) => ipcRenderer.invoke('dialog:print-recovery-qr', dataUrl, label),
  importAssessmentAttachment: (assignmentId, assessmentId) => ipcRenderer.invoke('dialog:import-assessment-attachment', assignmentId, assessmentId),
  openAssessmentAttachment: (relativePath) => ipcRenderer.invoke('attachment:open', relativePath),
  removeAssessmentAttachment: (relativePath) => ipcRenderer.invoke('attachment:remove', relativePath),

  // Metadata & System Checks
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPerformanceProfile: () => ipcRenderer.invoke('system:performance-profile'),
  checkForUpdates: (options) => ipcRenderer.invoke('updater:check', options),
  downloadUpdate: (options) => ipcRenderer.invoke('updater:download', options),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  fetchLinkPreview: (url) => ipcRenderer.invoke('link-preview:fetch', url),

  // Menu Event Listeners (Main to Renderer)
  onMenuSave: (callback) => subscribe('menu-save', callback),
  onMenuExportJson: (callback) => subscribe('menu-export-json', callback),
  onMenuImportJson: (callback) => subscribe('menu-import-json', callback),
  onUpdateStatus: (callback) => subscribe('update-status', callback),

  confirmExit: () => ipcRenderer.invoke('app:confirm-exit'),
  onAppCloseTriggered: (callback) => subscribe('app-close-triggered', callback),

  // Bluetooth Sync APIs
  selectBluetoothDevice: (deviceId) => ipcRenderer.send('bluetooth:select-device', deviceId),
  cancelBluetoothDevice: () => ipcRenderer.send('bluetooth:cancel-device'),
  resetBluetoothScan: () => ipcRenderer.invoke('bluetooth:reset-scan'),
  startAutomaticBluetoothScan: (discoveryTag) => ipcRenderer.invoke('bluetooth:auto-scan', discoveryTag),
  onBluetoothDeviceList: (callback) => subscribe('bluetooth:device-list', callback)
});
