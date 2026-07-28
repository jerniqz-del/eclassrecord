(function (globalScope) {
  'use strict';

  let selectedBackup = null;

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
    value.textContent = recoveryId || 'Unavailable';
    const searchInput = document.getElementById('backupRecoverySearchInput');
    if (searchInput && !searchInput.value && recoveryId) searchInput.value = recoveryId;
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
    globalScope.confirmModal(
      'Regenerate Backup Recovery ID',
      'A new ID will be used for future backups. Existing backups will not be deleted, but the old ID will still be needed to find them.',
      () => globalScope.promptPinVerification(async () => {
        const previousId = profile.backupRecoveryId;
        try {
          profile.backupRecoveryId = globalScope.BackupRecoveryId.generateBackupRecoveryId();
          if (!await globalScope.saveDatabase()) throw new Error('The new Recovery ID could not be saved.');
          clearResult();
          const searchInput = document.getElementById('backupRecoverySearchInput');
          if (searchInput) searchInput.value = profile.backupRecoveryId;
          refreshSettings();
          globalScope.toast('A new Backup Recovery ID is now active.', 'success');
        } catch (error) {
          profile.backupRecoveryId = previousId;
          refreshSettings();
          globalScope.toast(error.message || 'The Recovery ID was not changed.', 'error');
        }
      })
    );
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
    scanForBackup,
    restoreSelectedBackup,
    initBackupRecovery
  };
  globalScope.BackupRecovery = api;
  globalScope.initBackupRecovery = initBackupRecovery;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
