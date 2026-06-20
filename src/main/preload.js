/**
 * E-Class Record — Electron Preload Script
 *
 * Exposes a secure, limited context bridge for Electron IPC.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Database Operations
  loadDatabase: () => ipcRenderer.invoke('db:load'),
  saveDatabase: (data) => ipcRenderer.invoke('db:save', data),

  // File Backup & Migration Dialogs
  exportJson: (jsonString, defaultFileName) => ipcRenderer.invoke('dialog:export-json', jsonString, defaultFileName),
  importJson: () => ipcRenderer.invoke('dialog:import-json'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  importSf1: () => ipcRenderer.invoke('dialog:import-sf1'),
  exportCsv: (csvString) => ipcRenderer.invoke('dialog:export-csv', csvString),
  showPrintChoose: () => ipcRenderer.invoke('dialog:print-choose'),
  exportExcelTemplate: (payload) => ipcRenderer.invoke('dialog:export-excel-template', payload),
  exportPdf: (options) => ipcRenderer.invoke('dialog:export-pdf', options),

  // Metadata & System Checks
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

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
