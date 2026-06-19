/**
 * E-Class Record — Electron Auto-Updater Module
 *
 * Configures electron-updater to handle checking, downloading,
 * and installing OTA updates from GitHub Releases.
 */

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainAppWindow = null;

// Enable simple logging
autoUpdater.logger = console;

/**
 * Sends update status to the renderer process.
 * @param {string} status The status key (checking, available, not-available, downloading, downloaded, error).
 * @param {object} payload Content details including message.
 */
function sendStatus(status, payload) {
  if (mainAppWindow && !mainAppWindow.isDestroyed()) {
    mainAppWindow.webContents.send('update-status', status, payload);
  }
}

/**
 * Initialises updater event listeners.
 * @param {BrowserWindow} window Reference to main window.
 */
function initAutoUpdater(window) {
  mainAppWindow = window;

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'jerniqz-del',
    repo: 'eclassrecord'
  });

  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus('checking', { message: 'Checking for updates…' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus('available', {
      message: `New version v${info.version} is available.`,
      version: info.version
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus('not-available', { message: 'You are running the latest version.' });
  });

  autoUpdater.on('error', (err) => {
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
    
    sendStatus('error', { message: friendlyMessage });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    sendStatus('downloading', {
      message: `Downloading update… ${percent}%`,
      percent: percent
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus('downloaded', {
      message: `Update v${info.version} downloaded. Restart the app to apply.`,
      version: info.version
    });
  });
}

/**
 * Manually checks for updates.
 * @param {BrowserWindow} window Reference to main window.
 */
function checkForUpdates(window) {
  if (window) mainAppWindow = window;
  
  // Triggers checking and automatically downloads update if available
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('Update check failed:', err);
    sendStatus('error', { message: `Checking failed: ${err.message || err}` });
  });
}

module.exports = {
  initAutoUpdater,
  checkForUpdates
};
