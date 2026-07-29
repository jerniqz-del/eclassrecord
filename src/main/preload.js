/**
 * E-Class Record — Electron Preload Script
 *
 * Exposes a secure, limited context bridge for Electron IPC.
 */

const { contextBridge, ipcRenderer } = require('electron');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { getSudoku } = require('sudoku-gen');

function requireRecoveryPayload(payload) {
  const text = String(payload || '');
  if (!text.startsWith('ECLASS-RECOVERY|') || text.length > 2048) throw new Error('Invalid recovery QR payload.');
  return text;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Authenticated Admin panel
  adminAuth: (passphrase) => ipcRenderer.invoke('admin:authenticate', passphrase),
  adminHasGhToken: (token) => ipcRenderer.invoke('admin:has-gh-token', token),
  adminLogout: () => ipcRenderer.invoke('admin:logout'),

  // Database Operations
  loadDatabase: () => ipcRenderer.invoke('db:load'),
  saveDatabase: (data) => ipcRenderer.invoke('db:save', data),

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
  onSharedSyncFolderChanged: (callback) => ipcRenderer.on('shared-sync-folder-changed', (_event, backupRecoveryId) => callback(backupRecoveryId)),
  importSf1: () => ipcRenderer.invoke('dialog:import-sf1'),
  exportCsv: (csvString, defaultFileName) => ipcRenderer.invoke('dialog:export-csv', csvString, defaultFileName),
  showPrintChoose: () => ipcRenderer.invoke('dialog:print-choose'),
  exportExcelTemplate: (payload) => ipcRenderer.invoke('dialog:export-excel-template', payload),
  exportPdf: (options) => ipcRenderer.invoke('dialog:export-pdf', options),
  generateRecoveryQr: (payload) => QRCode.toDataURL(requireRecoveryPayload(payload), {
    errorCorrectionLevel: 'H', type: 'image/png', width: 512, margin: 4,
    color: { dark: '#0f172a', light: '#ffffff' }
  }),
  decodeRecoveryQrPixels: ({ data, width, height }) => {
    const safeWidth = Number(width);
    const safeHeight = Number(height);
    if (!Number.isInteger(safeWidth) || !Number.isInteger(safeHeight) || safeWidth < 21 || safeHeight < 21 || safeWidth * safeHeight > 16777216) {
      throw new Error('Recovery QR image dimensions are invalid.');
    }
    const pixels = new Uint8ClampedArray(data);
    if (pixels.length !== safeWidth * safeHeight * 4) throw new Error('Recovery QR image pixels are incomplete.');
    return jsQR(pixels, safeWidth, safeHeight, { inversionAttempts: 'attemptBoth' })?.data || '';
  },
  generateSudoku: (difficulty = 'medium') => {
    const safeDifficulty = ['easy', 'medium', 'hard', 'expert'].includes(String(difficulty))
      ? String(difficulty)
      : 'medium';
    const sudoku = getSudoku(safeDifficulty);
    return {
      puzzle: String(sudoku.puzzle || ''),
      solution: String(sudoku.solution || ''),
      difficulty: safeDifficulty
    };
  },
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
  onMenuSave: (callback) => ipcRenderer.on('menu-save', (_event) => callback()),
  onMenuExportJson: (callback) => ipcRenderer.on('menu-export-json', (_event) => callback()),
  onMenuImportJson: (callback) => ipcRenderer.on('menu-import-json', (_event) => callback()),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status, details) => callback(status, details)),

  confirmExit: () => ipcRenderer.invoke('app:confirm-exit'),
  onAppCloseTriggered: (callback) => ipcRenderer.on('app-close-triggered', (_event) => callback()),

  // Bluetooth Sync APIs
  selectBluetoothDevice: (deviceId) => ipcRenderer.send('bluetooth:select-device', deviceId),
  cancelBluetoothDevice: () => ipcRenderer.send('bluetooth:cancel-device'),
  onBluetoothDeviceList: (callback) => ipcRenderer.on('bluetooth:device-list', (_event, deviceList) => callback(deviceList))
});
