/**
 * E-Class Record — Electron Main Process
 *
 * Creates the application window, registers IPC handlers for
 * file I/O and native dialogs, and initialises auto-updates.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fileIO = require('./file-io');
const updater = require('./updater');

let mainWindow = null;
let isConfirmedExit = false;
let selectBluetoothDeviceCallback = null;

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

  // Block DevTools and Reload keyboard shortcuts in production builds
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      const isDevTools = (input.key === 'F12') || (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c'));
      const isReload = (input.key === 'F5') || (input.control && key === 'r');
      if (isDevTools || isReload) {
        event.preventDefault();
      }
    });
  }

  // Chromium Web Bluetooth device selection handler
  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    selectBluetoothDeviceCallback = callback;
    // Send list of discovered devices to the renderer process
    mainWindow.webContents.send('bluetooth:device-list', deviceList);
  });

  mainWindow.once('ready-to-show', () => {
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
  Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ──────────────────────────────────────────

ipcMain.handle('db:load', async () => {
  return fileIO.loadDatabase();
});

ipcMain.handle('db:save', async (_event, data) => {
  return fileIO.saveDatabase(data);
});

ipcMain.handle('dialog:export-json', async (_event, jsonString, defaultFileName) => {
  const filename = defaultFileName || 'eclass-record-backup.json';
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
  return { success: true, content: content };
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

ipcMain.handle('dialog:export-excel-template', async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export to DepEd Excel Template',
    defaultPath: path.join(app.getPath('desktop'), `Class-Record-${payload.gradeLevel}-${payload.section}-${payload.subject}.xlsx`),
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
  
  const headerHtml = `
    <div style="font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000; width: 100%; margin: 0 0.4in; box-sizing: border-box; border-bottom: 2px solid #000; padding-bottom: 6px;">
      <div style="font-size: 11px; font-weight: bold; font-family: 'Segoe UI', Arial, sans-serif; color: #000; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 5px; text-transform: uppercase;">
        ${metadata ? (metadata.title || '') : ''}
      </div>
      <table style="width: 100%; border-collapse: collapse; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000; margin: 0; padding: 0;">
        <tr>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Region:</strong> ${metadata ? (metadata.region || '') : ''}
          </td>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>School Year:</strong> ${metadata ? (metadata.schoolYear || '') : ''}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Division:</strong> ${metadata ? (metadata.division || '') : ''}
          </td>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Grade & Section:</strong> Grade ${metadata ? (metadata.gradeLevel || '') : ''} - ${metadata ? (metadata.section || '') : ''}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>School Name:</strong> ${metadata ? (metadata.schoolName || '') : ''}
          </td>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Subject:</strong> ${metadata ? (metadata.subject || '') : ''}
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>School ID:</strong> ${metadata ? (metadata.schoolId || '') : ''}
          </td>
          <td style="width: 50%; padding: 1px 0; border: none; font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
            <strong>Teacher:</strong> ${metadata ? (metadata.teacherName || '') : ''}
          </td>
        </tr>
      </table>
    </div>
  `;
  
  const footerHtml = `
    <div style="font-size: 8px; font-family: 'Segoe UI', Arial, sans-serif; color: #555; width: 100%; margin: 0 0.4in; border-top: 1px solid #ddd; padding-top: 5px; display: flex; justify-content: space-between; box-sizing: border-box;">
      <div>
        <strong>File Stamp:</strong> ${filename || 'Class-Record.pdf'} &middot; 
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
      top: 1.3, // in inches
      bottom: 0.6,
      left: 0.4, // in inches
      right: 0.4
    },
    pageSize: size || 'A4',
    landscape: !!landscape,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: headerHtml,
    footerTemplate: footerHtml
  };
  
  try {
    const data = await mainWindow.webContents.printToPDF(printOptions);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PDF',
      defaultPath: path.join(app.getPath('desktop'), filename || 'Class-Record.pdf'),
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

ipcMain.handle('updater:check', async () => {
  return updater.checkForUpdates(mainWindow);
});

ipcMain.handle('updater:download', async () => {
  return updater.downloadUpdate();
});

ipcMain.handle('updater:quit-and-install', async () => {
  isConfirmedExit = true;
  return updater.quitAndInstall();
});

ipcMain.handle('shell:open-external', async (_event, url) => {
  await shell.openExternal(url);
});

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
