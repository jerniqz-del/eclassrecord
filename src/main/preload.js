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
  exportJson: (jsonString) => ipcRenderer.invoke('dialog:export-json', jsonString),
  importJson: () => ipcRenderer.invoke('dialog:import-json'),
  importSf1: () => ipcRenderer.invoke('dialog:import-sf1'),
  exportCsv: (csvString) => ipcRenderer.invoke('dialog:export-csv', csvString),

  // Metadata & System Checks
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  // Menu Event Listeners (Main to Renderer)
  onMenuSave: (callback) => ipcRenderer.on('menu-save', (_event) => callback()),
  onMenuExportJson: (callback) => ipcRenderer.on('menu-export-json', (_event) => callback()),
  onMenuImportJson: (callback) => ipcRenderer.on('menu-import-json', (_event) => callback()),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, status, details) => callback(status, details))
});
