'use strict';

function installPowerLifecycle({
  powerMonitor,
  profileAuth,
  companionSyncService,
  mobileApkInstallService,
  fileIO,
  getMainWindow,
  logger = console
} = {}) {
  if (!powerMonitor || typeof powerMonitor.on !== 'function') {
    throw new Error('A power monitor is required.');
  }

  let osSessionLocked = false;
  let resumeTimer = null;

  function checkpoint(reason) {
    try {
      fileIO?.createLocalRestorePoint?.(`lifecycle-${String(reason || 'event').replace(/[^a-z0-9-]/gi, '-').slice(0, 40)}`);
    } catch (error) {
      logger.warn?.('Lifecycle checkpoint failed:', error?.message || error);
    }
  }

  function notifyRenderer(channel, payload) {
    const window = getMainWindow?.();
    if (!window || window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) return;
    window.webContents.send(channel, payload);
  }

  function lockWorkspace(reason) {
    osSessionLocked = true;
    profileAuth?.lock?.();
    companionSyncService?.setCommandLock?.(true);
    companionSyncService?.pauseDiscovery?.();
    mobileApkInstallService?.stop?.()?.catch?.(() => {});
    checkpoint(reason);
    notifyRenderer('security:profile-locked', { reason });
    notifyRenderer('menu-save');
  }

  function scheduleResume() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      companionSyncService?.resumeAfterSleep?.().catch((error) => {
        logger.warn?.('Companion resume failed:', error?.message || error);
      });
      notifyRenderer('companion:workspace-resumed', { locked: !profileAuth?.isUnlocked?.() });
    }, 1500);
  }

  powerMonitor.on('lock-screen', () => lockWorkspace('lock-screen'));
  powerMonitor.on('suspend', () => lockWorkspace('suspend'));
  powerMonitor.on('unlock-screen', () => {
    osSessionLocked = false;
    companionSyncService?.setCommandLock?.(!profileAuth?.isUnlocked?.());
  });
  powerMonitor.on('resume', () => {
    osSessionLocked = false;
    companionSyncService?.setCommandLock?.(!profileAuth?.isUnlocked?.());
    scheduleResume();
  });

  return {
    isOsLocked: () => osSessionLocked,
    lockWorkspace,
    dispose() {
      clearTimeout(resumeTimer);
    }
  };
}

module.exports = { installPowerLifecycle };
