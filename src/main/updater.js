/**
 * E-Class Record — Electron Auto-Updater Module
 *
 * Checks GitHub Releases, downloads updates in the background, and applies a
 * downloaded update only after the user chooses a safe restart or exits.
 */

const { app, net } = require('electron');

// Clean sandbox dummy tokens.
if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.includes('antigravitydummytoken')) {
  delete process.env.GITHUB_TOKEN;
}
if (process.env.GH_TOKEN && process.env.GH_TOKEN.includes('antigravitydummytoken')) {
  delete process.env.GH_TOKEN;
}

// Development builds may use the developer's authenticated GitHub CLI token.
if (app && !app.isPackaged) {
  try {
    const { execSync } = require('child_process');
    const token = execSync('gh auth token', {
      env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' },
      encoding: 'utf8'
    }).trim();
    if (token && (token.startsWith('gho_') || token.startsWith('ghp_') || token.startsWith('github_pat_'))) {
      process.env.GH_TOKEN = token;
      process.env.GITHUB_TOKEN = token;
    }
  } catch (_error) {
    // The updater remains usable for public packaged releases.
  }
}

const { autoUpdater } = require('electron-updater');

let mainAppWindow = null;
let initialized = false;
let checkInProgress = false;
let downloadInProgress = false;
let updateDownloaded = false;
let autoDownloadRequested = false;
let currentCheckAutomatic = false;

autoUpdater.logger = console;

function sendStatus(status, payload) {
  if (mainAppWindow && !mainAppWindow.isDestroyed()) {
    mainAppWindow.webContents.send('update-status', status, payload);
  }
}

function initAutoUpdater(window) {
  mainAppWindow = window;
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'jerniqz-del',
    repo: 'eclassrecord',
    private: !app.isPackaged
  });

  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatus('checking', {
      message: 'Checking for updates…',
      automatic: currentCheckAutomatic
    });
  });

  autoUpdater.on('update-available', info => {
    checkInProgress = false;
    sendStatus('available', {
      message: `New version v${info.version} is available.`,
      version: info.version,
      automatic: currentCheckAutomatic,
      autoDownload: autoDownloadRequested
    });
    if (autoDownloadRequested) downloadUpdate({ automatic: currentCheckAutomatic });
  });

  autoUpdater.on('update-not-available', () => {
    checkInProgress = false;
    autoDownloadRequested = false;
    sendStatus('not-available', {
      message: 'You are running the latest version.',
      automatic: currentCheckAutomatic
    });
  });

  autoUpdater.on('error', err => {
    checkInProgress = false;
    downloadInProgress = false;
    autoDownloadRequested = false;
    const errMsg = err.message || String(err);
    let friendlyMessage = `Update error: ${errMsg}`;
    if (
      errMsg.includes('ERR_INTERNET_DISCONNECTED') ||
      errMsg.includes('ERR_CONNECTION_RESET') ||
      errMsg.includes('ERR_CONNECTION_REFUSED') ||
      errMsg.includes('ERR_NAME_NOT_RESOLVED') ||
      errMsg.includes('network') ||
      errMsg.includes('offline') ||
      errMsg.includes('fetch failed')
    ) {
      friendlyMessage = 'Connection failed. Please check your internet connection and try again.';
    }
    sendStatus('error', { message: friendlyMessage, automatic: currentCheckAutomatic });
  });

  autoUpdater.on('download-progress', progress => {
    const percent = Math.round(progress.percent || 0);
    sendStatus('downloading', {
      message: `Downloading update… ${percent}%`,
      percent
    });
  });

  autoUpdater.on('update-downloaded', info => {
    downloadInProgress = false;
    updateDownloaded = true;
    autoDownloadRequested = false;
    sendStatus('downloaded', {
      message: `Update v${info.version} downloaded. Restart the app to apply.`,
      version: info.version
    });
  });
}

function checkForUpdates(window, options = {}) {
  if (window) mainAppWindow = window;
  const automatic = Boolean(options.automatic);

  if (automatic && !app.isPackaged) return { started: false, reason: 'development' };
  if (checkInProgress || downloadInProgress || updateDownloaded) {
    return { started: false, reason: updateDownloaded ? 'downloaded' : 'busy' };
  }
  if (net && typeof net.isOnline === 'function' && !net.isOnline()) {
    sendStatus('offline', {
      message: 'No internet connection. Update check skipped.',
      automatic
    });
    return { started: false, reason: 'offline' };
  }

  checkInProgress = true;
  currentCheckAutomatic = automatic;
  autoDownloadRequested = Boolean(options.autoDownload);
  autoUpdater.checkForUpdates().catch(err => {
    checkInProgress = false;
    autoDownloadRequested = false;
    console.error('Update check failed:', err);
    sendStatus('error', {
      message: `Checking failed: ${err.message || err}`,
      automatic
    });
  });
  return { started: true };
}

function downloadUpdate(options = {}) {
  if (downloadInProgress || updateDownloaded) {
    return { started: false, reason: updateDownloaded ? 'downloaded' : 'busy' };
  }
  downloadInProgress = true;
  currentCheckAutomatic = Boolean(options.automatic);
  sendStatus('downloading', { message: 'Downloading update… 0%', percent: 0 });
  autoUpdater.downloadUpdate().catch(err => {
    downloadInProgress = false;
    console.error('Failed to start download:', err);
    sendStatus('error', { message: `Download failed: ${err.message || err}` });
  });
  return { started: true };
}

function quitAndInstall() {
  if (!updateDownloaded) return { started: false, reason: 'not-downloaded' };
  console.log('Quitting and installing update...');
  autoUpdater.quitAndInstall(false, true);
  return { started: true };
}

module.exports = {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall
};
