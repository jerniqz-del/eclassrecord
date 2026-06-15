/**
 * E-Class Record — Electron Main Process
 *
 * Creates the application window, registers IPC handlers for
 * file I/O and native dialogs, and initialises auto-updates.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fileIO = require('./file-io');
const updater = require('./updater');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'E-Class Record',
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
    // Start updater only after renderer is fully loaded and listening
    updater.initAutoUpdater(mainWindow);
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
              detail: 'Local, teacher-owned class record for DepEd three-term and legacy grading workflows.'
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
  Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ──────────────────────────────────────────

ipcMain.handle('db:load', async () => {
  return fileIO.loadDatabase();
});

ipcMain.handle('db:save', async (_event, data) => {
  return fileIO.saveDatabase(data);
});

ipcMain.handle('dialog:export-json', async (_event, jsonString) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export JSON Backup',
    defaultPath: path.join(app.getPath('desktop'), 'eclass-record-backup.json'),
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
  return { success: true, content: content };
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

ipcMain.handle('dialog:export-csv', async (_event, csvString) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export CSV',
    defaultPath: path.join(app.getPath('desktop'), 'eclass-record-grades.csv'),
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  fileIO.writeFile(result.filePath, '\uFEFF' + csvString); // BOM for Excel
  return { success: true, path: result.filePath };
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('updater:check', async () => {
  return updater.checkForUpdates(mainWindow);
});

// ── App Lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
