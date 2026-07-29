(function (globalScope) {
  'use strict';

  let selectedBackup = null;
  let discoveredProfiles = [];
  let discoveryLoaded = false;

  function activeProfile() {
    const root = globalScope.getRootDatabase?.();
    return root?.profiles?.find(profile => profile.id === root.activeProfileId) || null;
  }

  function setStatus(message, kind = '') {
    const status = document.getElementById('backupDiscoveryStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('u-text-danger', kind === 'error');
    status.classList.toggle('u-text-success', kind === 'success');
  }

  function clearResult() {
    selectedBackup = null;
    const result = document.getElementById('backupDiscoveryResult');
    if (result) result.hidden = true;
  }

  function refreshSettings() {
    const profile = activeProfile();
    const value = document.getElementById('backupRecoveryIdValue');
    if (!value) return;
    const recoveryId = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(profile?.backupRecoveryId);
    value.textContent = recoveryId || 'Not generated — local profile only';
    const copyButton = document.getElementById('btnCopyBackupRecoveryId');
    const regenerateButton = document.getElementById('btnRegenerateBackupRecoveryId');
    if (copyButton) copyButton.hidden = !recoveryId;
    if (regenerateButton) regenerateButton.hidden = !recoveryId || Boolean(profile?.sharedFolderSync?.enabled);
    const historyValue = document.getElementById('backupRecoveryIdHistoryValue');
    const history = Array.isArray(profile?.backupRecoveryIdHistory)
      ? profile.backupRecoveryIdHistory.filter(Boolean)
      : [];
    if (historyValue) {
      historyValue.hidden = history.length === 0;
      historyValue.textContent = history.length
        ? `Previous Recovery ID${history.length === 1 ? '' : 's'} retained for old backups: ${history.join(', ')}`
        : '';
    }
    const searchInput = document.getElementById('backupRecoverySearchInput');
    if (searchInput) {
      if (recoveryId) {
        searchInput.value = recoveryId;
        searchInput.dataset.activeRecoveryId = recoveryId;
      } else if (searchInput.dataset.activeRecoveryId) {
        searchInput.value = '';
        delete searchInput.dataset.activeRecoveryId;
      }
    }
  }

  function formatDiscoveredDate(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : 'Date unavailable';
  }

  async function useDiscoveredProfile(index) {
    const item = discoveredProfiles[index];
    if (!item) return;
    const input = document.getElementById('backupRecoverySearchInput');
    if (input) input.value = item.recoveryId;
    if (item.syncAvailable && !activeProfile()?.backupRecoveryId) {
      await globalScope.SharedFolderSync.connectExisting({
        recoveryId: item.recoveryId,
        folderPath: item.folderPath
      });
      return;
    }
    if (item.backupAvailable) {
      clearResult();
      setStatus('Opening the newest validated OneDrive backup.');
      try {
        const result = await globalScope.electronAPI.scanKnownBackupFolder(item.recoveryId, item.folderPath);
        if (result.found) showDiscoveredBackup(result);
        else setStatus('The detected backup is no longer available. Refresh the list.', 'error');
      } catch (error) {
        setStatus(error.message || 'The detected backup could not be opened.', 'error');
      }
      return;
    }
    setStatus('This synchronized profile can be connected from a new local profile with an empty Recovery ID.', 'success');
  }

  function renderDiscoveredProfiles(result) {
    const list = document.getElementById('oneDriveBackupDiscoveryList');
    if (!list) return;
    discoveredProfiles = Array.isArray(result?.profiles) ? result.profiles : [];
    if (!result?.roots?.length) {
      list.innerHTML = '<div class="backup-found__empty">OneDrive was not detected on this PC. Start OneDrive, then choose Refresh.</div>';
      return;
    }
    if (!discoveredProfiles.length) {
      list.innerHTML = '<div class="backup-found__empty">No valid E-Class Record profiles were found in the available OneDrive folders.</div>';
      return;
    }
    const currentId = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(activeProfile()?.backupRecoveryId);
    list.innerHTML = discoveredProfiles.map((item, index) => {
      const name = item.profileNameHint || (item.syncAvailable ? 'Synchronized E-Class Record profile' : 'E-Class Record backup');
      const type = item.syncAvailable && item.backupAvailable
        ? 'Backup and multi-PC sync'
        : item.syncAvailable
          ? 'Multi-PC sync'
          : 'Backup';
      const isCurrent = currentId === item.recoveryId;
      const action = isCurrent ? 'Current Profile' : item.syncAvailable && !currentId ? 'Connect' : 'View Backup';
      return `
        <div class="backup-found__item">
          <div class="backup-found__content">
            <strong>${globalScope.esc(name)}</strong>
            <code>${globalScope.esc(item.recoveryId)}</code>
            <span>${globalScope.esc(type)} &middot; ${globalScope.esc(formatDiscoveredDate(item.lastBackupAt))}</span>
            <small>${globalScope.esc(item.folderPath)}</small>
          </div>
          <button class="btn ${isCurrent ? 'btn-ghost' : 'btn-primary'} btn-sm" type="button" data-discovered-index="${index}" ${isCurrent ? 'disabled' : ''}>${action}</button>
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-discovered-index]').forEach(button => {
      button.addEventListener('click', () => useDiscoveredProfile(Number(button.dataset.discoveredIndex)));
    });
  }

  async function discoverOneDriveBackups(force = false) {
    const list = document.getElementById('oneDriveBackupDiscoveryList');
    if (!list || (discoveryLoaded && !force)) return;
    discoveryLoaded = true;
    list.innerHTML = '<div class="backup-found__empty">Checking OneDrive for valid E-Class Record profiles…</div>';
    const refreshButton = document.getElementById('btnRefreshOneDriveBackups');
    if (refreshButton) refreshButton.disabled = true;
    try {
      const result = await globalScope.electronAPI.discoverOneDriveBackups();
      renderDiscoveredProfiles(result);
      if (result.limited) setStatus('OneDrive discovery reached its safety limit. Use manual backup search if a profile is missing.');
    } catch (error) {
      discoveryLoaded = false;
      list.innerHTML = `<div class="backup-found__empty u-text-danger">${globalScope.esc(error.message || 'OneDrive profiles could not be checked.')}</div>`;
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Clipboard access is unavailable.');
  }

  async function copyRecoveryId() {
    const recoveryId = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(activeProfile()?.backupRecoveryId);
    if (!recoveryId) {
      globalScope.toast('Backup Recovery ID is unavailable.', 'error');
      return;
    }
    try {
      await copyText(recoveryId);
      globalScope.toast('Backup Recovery ID copied.', 'success');
    } catch (error) {
      globalScope.toast('Could not copy the Recovery ID: ' + error.message, 'error');
    }
  }

  function regenerateRecoveryId() {
    const profile = activeProfile();
    if (!profile) {
      globalScope.toast('No active profile is available.', 'error');
      return;
    }
    if (!profile.backupRecoveryId) {
      globalScope.toast('Set up OneDrive Sync to generate a Recovery ID.', 'info');
      return;
    }
    if (profile.sharedFolderSync?.enabled) {
      globalScope.toast('Disable synchronization on this PC before starting a new sync identity.', 'warning');
      return;
    }
    globalScope.SharedFolderSync?.startNewIdentity?.();
  }

  function showDiscoveredBackup(result) {
    selectedBackup = {
      handle: result.handle,
      metadata: result.metadata
    };
    document.getElementById('backupDiscoveryProfile').textContent = result.metadata.profileNameHint || 'Unnamed profile';
    document.getElementById('backupDiscoveryCreatedAt').textContent = new Date(result.metadata.createdAt).toLocaleString();
    document.getElementById('backupDiscoveryProtection').textContent = result.metadata.protection === 'pin-aes-256-gcm'
      ? 'Encrypted with PIN'
      : 'Not PIN encrypted';
    document.getElementById('backupDiscoveryResult').hidden = false;
    const ignored = result.invalidMatchingFiles
      ? ` ${result.invalidMatchingFiles} damaged matching file${result.invalidMatchingFiles === 1 ? ' was' : 's were'} ignored.`
      : '';
    setStatus(`Newest valid backup found from ${result.matchCount} matching file${result.matchCount === 1 ? '' : 's'}.${ignored}`, 'success');
  }

  async function scanForBackup() {
    const input = document.getElementById('backupRecoverySearchInput');
    const button = document.getElementById('btnScanBackupFolder');
    const recoveryId = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(input?.value);
    clearResult();
    if (!recoveryId) {
      setStatus('Enter a complete Backup Recovery ID in the format shown.', 'error');
      input?.focus();
      return;
    }
    input.value = recoveryId;
    button.disabled = true;
    setStatus('Choose the OneDrive or local folder that contains your backup.');
    try {
      const result = await globalScope.electronAPI.selectAndScanBackupFolder(recoveryId);
      if (result.canceled) {
        setStatus('Folder selection canceled.');
      } else if (!result.found) {
        const damaged = result.invalidMatchingFiles
          ? ' Matching files were found, but they were damaged or failed validation.'
          : '';
        setStatus(`No valid backup with this Recovery ID was found in that folder.${damaged}`, 'error');
      } else {
        showDiscoveredBackup(result);
      }
    } catch (error) {
      console.error('Backup discovery failed:', error);
      setStatus(error.message || 'The backup folder could not be scanned.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function commitRestoredEnvelope(envelope, pin) {
    const recoveryId = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(envelope.backupRecoveryId);
    if (!recoveryId || recoveryId !== selectedBackup?.metadata?.backupRecoveryId) {
      throw new Error('The selected backup no longer matches this Recovery ID.');
    }
    const restoredDatabase = await globalScope.openBackupEnvelope(envelope, pin);
    const profile = activeProfile();
    if (!profile) throw new Error('No active profile is available for restore.');
    const previousRecoveryId = profile.backupRecoveryId;
    profile.backupRecoveryId = recoveryId;
    try {
      await globalScope.applyRestoredProfileDatabase(restoredDatabase);
    } catch (error) {
      profile.backupRecoveryId = previousRecoveryId;
      throw error;
    }
    clearResult();
    const searchInput = document.getElementById('backupRecoverySearchInput');
    if (searchInput) searchInput.value = recoveryId;
    refreshSettings();
    setStatus('Backup restored successfully.', 'success');
    globalScope.toast('The latest backup was restored successfully.', 'success');
  }

  async function loadAndRestoreSelectedBackup() {
    try {
      setStatus('Opening and validating the selected backup.');
      const result = await globalScope.electronAPI.readDiscoveredBackup(selectedBackup.handle);
      const envelope = JSON.parse(result.content);
      if (envelope.protection === 'pin-aes-256-gcm') {
        globalScope.promptBackupPinModal(async (pin, errorElement, closeModal) => {
          try {
            errorElement.textContent = 'Decrypting and validating backup...';
            await commitRestoredEnvelope(envelope, pin);
            closeModal();
          } catch (error) {
            errorElement.textContent = error.message || 'Incorrect PIN or damaged backup.';
          }
        }, () => {
          clearResult();
          setStatus('Restore canceled. Scan the folder again to reopen this backup.');
        });
      } else {
        await commitRestoredEnvelope(envelope, '');
      }
    } catch (error) {
      console.error('Discovered backup restore failed:', error);
      clearResult();
      setStatus(error.message || 'The selected backup could not be restored.', 'error');
    }
  }

  function restoreSelectedBackup() {
    if (!selectedBackup) {
      setStatus('Scan a backup folder before restoring.', 'error');
      return;
    }
    const profile = activeProfile();
    if (selectedBackup.metadata.protection === 'pin-aes-256-gcm' && !profile?.pinEnabled) {
      setStatus('To keep these records encrypted on this PC, restore them into a profile that has PIN Lock Security enabled.', 'error');
      return;
    }
    const name = selectedBackup.metadata.profileNameHint || 'this profile';
    const savedAt = new Date(selectedBackup.metadata.createdAt).toLocaleString();
    globalScope.confirmModal(
      'Restore Discovered Backup',
      `Restore the backup for ${name}, saved ${savedAt}? This will replace the class-record contents of the active profile.`,
      loadAndRestoreSelectedBackup
    );
  }

  function initBackupRecovery() {
    refreshSettings();
    discoverOneDriveBackups();
    const searchInput = document.getElementById('backupRecoverySearchInput');
    searchInput?.addEventListener('change', () => {
      const normalized = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(searchInput.value);
      if (normalized) searchInput.value = normalized;
      clearResult();
    });
    const settingsView = document.querySelector('[data-view="settings"]');
    if (settingsView) {
      new MutationObserver(refreshSettings).observe(settingsView, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
    const profileOverlay = document.getElementById('profileOverlay');
    if (profileOverlay) {
      new MutationObserver(refreshSettings).observe(profileOverlay, {
        attributes: true,
        attributeFilter: ['style']
      });
    }
  }

  const api = {
    refreshSettings,
    copyRecoveryId,
    regenerateRecoveryId,
    discoverOneDriveBackups,
    useDiscoveredProfile,
    scanForBackup,
    restoreSelectedBackup,
    initBackupRecovery
  };
  globalScope.BackupRecovery = api;
  globalScope.initBackupRecovery = initBackupRecovery;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
