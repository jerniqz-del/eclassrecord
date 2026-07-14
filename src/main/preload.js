/**
 * E-Class Record — Electron Preload Script
 *
 * Exposes a secure, limited context bridge for Electron IPC.
 */

const { contextBridge, ipcRenderer } = require('electron');
const QRCode = require('qrcode');
const jsQR = require('jsqr');

function requireRecoveryPayload(payload) {
  const text = String(payload || '');
  if (!text.startsWith('ECLASS-RECOVERY|') || text.length > 2048) throw new Error('Invalid recovery QR payload.');
  return text;
}

contextBridge.exposeInMainWorld('electronAPI', {
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
  importSf1: () => ipcRenderer.invoke('dialog:import-sf1'),
  exportCsv: (csvString) => ipcRenderer.invoke('dialog:export-csv', csvString),
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
  exportRecoveryQr: (dataUrl, defaultFileName) => ipcRenderer.invoke('dialog:export-recovery-qr', dataUrl, defaultFileName),
  printRecoveryQr: (dataUrl, label) => ipcRenderer.invoke('dialog:print-recovery-qr', dataUrl, label),
  importAssessmentAttachment: (assignmentId, assessmentId) => ipcRenderer.invoke('dialog:import-assessment-attachment', assignmentId, assessmentId),
  openAssessmentAttachment: (relativePath) => ipcRenderer.invoke('attachment:open', relativePath),
  removeAssessmentAttachment: (relativePath) => ipcRenderer.invoke('attachment:remove', relativePath),

  // Metadata & System Checks
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
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
