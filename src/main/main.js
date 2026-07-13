/**
 * E-Class Record — Electron Main Process
 *
 * Creates the application window, registers IPC handlers for
 * file I/O and native dialogs, and initialises auto-updates.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const fileIO = require('./file-io');
const updater = require('./updater');
const crypto = require('crypto');

let mainWindow = null;
let isConfirmedExit = false;
let selectBluetoothDeviceCallback = null;
const isSmokeTest = process.argv.includes('--smoke-test') || process.argv.includes('--offline-smoke-test');
const isOfflineSmokeTest = process.argv.includes('--offline-smoke-test');

function attachmentRoot() {
  return path.join(app.getPath('appData'), 'EClassRecordPortable', 'attachments');
}

function safePathPart(value) {
  return String(value || 'item').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'item';
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
        const result = await mainWindow.webContents.executeJavaScript(`(() => {
          const required = ['AdvisoryData', 'AdvisoryDashboard', 'AdvisoryRoster', 'AdvisoryGradeTransfer', 'AdvisoryBackup'];
          const missing = required.filter(name => !globalThis[name]);
          if (missing.length) throw new Error('Missing renderer modules: ' + missing.join(', '));
          if (typeof getActiveProfileDatabase !== 'function') throw new Error('Active profile database accessor is unavailable.');
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
            section: 'Offline', subject: 'Mathematics', learners: [], assessments: [], scores: {}
          }];
          runtimeProfile.advisory = AdvisoryData.createAdvisoryStore();
          renderDashboardOverview();

          const setupButton = document.querySelector('.dashboard-card--advisory .btn-primary');
          if (!setupButton) throw new Error('Set Up Advisory Class button was not rendered.');
          setupButton.click();
          const setupModal = document.querySelector('[data-advisory-setup-modal]');
          if (!setupModal) throw new Error('Set Up Advisory Class button did not open its modal.');
          setupModal.remove();

          const exportButton = document.querySelector('.dashboard-card__export-btn');
          if (!exportButton) throw new Error('Export Final Grades button was not rendered.');
          exportButton.click();
          const exportModal = document.querySelector('.advisory-nested-modal');
          if (!exportModal) throw new Error('Export Final Grades button did not open its modal.');
          exportModal.remove();

          return { modules: required.length, classes: profile.advisory.classes.length, setupClick: true, exportClick: true, offline: ${isOfflineSmokeTest} };
        })()`);
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
  return { success: true, content: content, name: path.basename(result.filePaths[0]) };
});

ipcMain.handle('dialog:export-grade-transfer', async (_event, jsonString, defaultFileName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Grade Transfer File',
    defaultPath: path.join(app.getPath('desktop'), defaultFileName || 'ECR_Grades.json'),
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
    <div style="font-size: 11px; font-family: 'Segoe UI', Arial, sans-serif; color: #000; width: 100%; margin: 0 0.4in; box-sizing: border-box; border-bottom: 2px solid #000; padding-bottom: 8px;">
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
      top: 1.45, // in inches
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
    const response = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'E-Class Record Link Preview'
      }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return { success: false, error: 'Preview is unavailable.' };
    }
    const html = (await response.text()).slice(0, 250000);
    return { success: true, preview: parseLinkPreview(html, response.url || parsed.toString()) };
  } catch (err) {
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
