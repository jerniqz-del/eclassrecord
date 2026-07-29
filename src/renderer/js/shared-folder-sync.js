(function (globalScope) {
  'use strict';

  const PUBLISH_DELAY_MS = 3000;
  const POLL_INTERVAL_MS = 30000;
  let publishTimer = null;
  let pollTimer = null;
  let checking = false;
  let suppressPublish = false;
  let pendingReview = null;
  let currentStatus = { state: 'off', label: 'Sync Off', detail: 'Shared Folder Sync is off.' };

  function rootDatabase() {
    return globalScope.getRootDatabase?.();
  }

  function profileDatabase() {
    return globalScope.getActiveProfileDatabase?.();
  }

  function activeProfile() {
    const root = rootDatabase();
    return root?.profiles?.find(profile => profile.id === root.activeProfileId) || null;
  }

  function syncRecord(profile = activeProfile()) {
    if (!profile) return null;
    if (!profile.sharedFolderSync || typeof profile.sharedFolderSync !== 'object') {
      profile.sharedFolderSync = {
        enabled: false,
        baseRevisionId: '',
        ownRevisionId: '',
        integratedRevisionIds: [],
        lastPublishedDigest: '',
        lastFolderWriteAt: '',
        lastCheckedAt: '',
        lastError: ''
      };
    }
    if (!Array.isArray(profile.sharedFolderSync.integratedRevisionIds)) {
      profile.sharedFolderSync.integratedRevisionIds = [];
    }
    return profile.sharedFolderSync;
  }

  function setStatus(state, label, detail) {
    currentStatus = { state, label, detail };
    const indicator = document.getElementById('sharedSyncIndicator');
    const indicatorLabel = document.getElementById('sharedSyncIndicatorLabel');
    if (indicator) {
      indicator.dataset.state = state;
      indicator.title = detail;
    }
    if (indicatorLabel) indicatorLabel.textContent = label;
    const settingsStatus = document.getElementById('sharedSyncSettingsStatus');
    if (settingsStatus) settingsStatus.textContent = detail;
    refreshSettings();
  }

  function formatDate(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : 'Not yet';
  }

  async function refreshSettings() {
    const profile = activeProfile();
    const record = syncRecord(profile);
    const toggle = document.getElementById('btnSharedSyncToggle');
    const check = document.getElementById('btnSharedSyncCheck');
    const review = document.getElementById('btnSharedSyncReview');
    const deviceButton = document.getElementById('btnSharedSyncDevice');
    const connectButton = document.getElementById('btnSharedSyncConnect');
    const disableButton = document.getElementById('btnSharedSyncDisableAdvanced');
    const details = document.getElementById('sharedSyncSettingsDetails');
    const backupDescription = document.getElementById('secondaryBackupPathDesc');
    if (!toggle || !record) return;
    if (backupDescription) {
      backupDescription.textContent = profileDatabase()?.secondaryBackupPath
        ? `Backup folder on this PC: ${profileDatabase().secondaryBackupPath}`
        : 'None configured. Local AppData backups remain active. OneDrive setup creates an organized multi-PC backup folder.';
    }
    toggle.textContent = profile.backupRecoveryId ? 'Resume OneDrive Sync' : 'Create New ID';
    toggle.hidden = record.enabled;
    if (connectButton) connectButton.hidden = Boolean(record.enabled || profile.backupRecoveryId);
    if (disableButton) disableButton.hidden = !record.enabled;
    check.hidden = !record.enabled;
    review.hidden = !pendingReview;
    deviceButton.hidden = !record.enabled;
    if (!record.enabled) {
      details.hidden = true;
      // Keep join, wait, review, and error states visible while the profile is
      // intentionally still disabled and therefore unable to publish.
      if (currentStatus.state === 'current') {
        setStatus('off', 'Sync Off', 'Sync is off. Local saving and ordinary backups remain active.');
      }
      return;
    }
    let device = { deviceLabel: 'This PC' };
    let state = { folderPath: '', available: false };
    try {
      [device, state] = await Promise.all([
        globalScope.electronAPI.getSharedSyncDeviceInfo(),
        globalScope.electronAPI.getSharedSyncState(profile.backupRecoveryId)
      ]);
    } catch (_error) {
      // The current status already carries the actionable error.
    }
    details.hidden = false;
    details.innerHTML = `
      <span><strong>Device:</strong> ${globalScope.esc(device.deviceLabel || 'This PC')}</span>
      <span><strong>Folder:</strong> ${state.folderPath ? `<code>${globalScope.esc(state.folderPath)}</code>` : 'Not configured'}</span>
      <span><strong>Last folder update:</strong> ${globalScope.esc(formatDate(record.lastFolderWriteAt))}</span>
      <span><strong>Last check:</strong> ${globalScope.esc(formatDate(record.lastCheckedAt))}</span>
    `;
  }

  function createModal(title, bodyHtml, actionsHtml, className = '') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-z-confirm';
    overlay.innerHTML = `
      <div class="modal modal--wide ${className}" role="dialog" aria-modal="true">
        <div class="modal__title">${globalScope.esc(title)}</div>
        <div class="modal__body">${bodyHtml}</div>
        <div class="modal__actions">${actionsHtml}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    return { overlay, close };
  }

  async function appVersion() {
    return typeof globalScope.electronAPI.getVersion === 'function'
      ? globalScope.electronAPI.getVersion()
      : '';
  }

  async function envelopeFor(profile, revisionId, baseRevisionId, parentRevisionIds, integratedRevisionIds) {
    const device = await globalScope.electronAPI.getSharedSyncDeviceInfo();
    return globalScope.SharedSyncCrypto.createSyncEnvelope(
      profileDatabase(),
      profileDatabase().sharedSyncKey,
      globalScope.getCurrentProfilePin(),
      {
        appVersion: await appVersion(),
        backupRecoveryId: profile.backupRecoveryId,
        revisionId,
        baseRevisionId,
        parentRevisionIds,
        integratedRevisionIds,
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel
      }
    );
  }

  async function initializeNewSync(profile, record) {
    setStatus('updating', 'Updating Folder', 'Creating the first encrypted synchronization checkpoint.');
    if (!profileDatabase().sharedSyncKey) {
      profileDatabase().sharedSyncKey = globalScope.SharedSyncCrypto.generateSyncKey();
    }
    const revisionId = globalScope.SharedSyncCrypto.generateRevisionId();
    record.enabled = true;
    record.baseRevisionId = revisionId;
    record.ownRevisionId = revisionId;
    record.integratedRevisionIds = [revisionId];
    suppressPublish = true;
    try {
      if (!await globalScope.saveDatabase()) throw new Error('The local synchronization settings could not be saved.');
    } finally {
      suppressPublish = false;
    }
    const envelope = await envelopeFor(profile, revisionId, revisionId, [], [revisionId]);
    const text = JSON.stringify(envelope, null, 2);
    await globalScope.electronAPI.writeSharedSyncBase(profile.backupRecoveryId, text);
    await globalScope.electronAPI.writeSharedSyncHead(profile.backupRecoveryId, text);
    record.lastPublishedDigest = envelope.dataDigest;
    record.lastFolderWriteAt = envelope.createdAt;
    record.lastCheckedAt = envelope.createdAt;
    record.lastError = '';
    await globalScope.saveRootDatabase();
    setStatus('current', 'Folder Up to Date', 'This PC has updated the OneDrive folder. Confirm that OneDrive has uploaded it before connecting another PC.');
  }

  function confirmNewSyncRepository(profile, record, previous) {
    const modal = createModal(
      'No Existing Synchronized Profile Found',
      `<p>No synchronized profile with this Backup Recovery ID is currently visible in the selected folder.</p>
       <p>If another PC already uses this profile, wait for OneDrive to finish downloading before trying again. Start a new synchronized profile only on the first PC.</p>`,
      '<button class="btn btn-cancel btn-sm" data-wait>Wait for OneDrive</button><button class="btn btn-primary btn-sm" data-start>Start New Synchronized Profile</button>'
    );
    modal.overlay.querySelector('[data-wait]').addEventListener('click', () => {
      modal.close();
      setStatus('off', 'Sync Off', 'No synchronization files were created. Try Enable Sync again after OneDrive finishes.');
    });
    modal.overlay.querySelector('[data-start]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      modal.overlay.querySelector('[data-wait]').disabled = true;
      try {
        await initializeNewSync(profile, record);
        modal.close();
      } catch (error) {
        Object.assign(record, previous);
        await globalScope.saveRootDatabase();
        setStatus('error', 'Sync Problem', error.message || 'Shared Folder Sync could not be enabled.');
      }
    });
  }

  async function prepareExistingSyncJoin(profile, record, previous, scan, enrollment = {}) {
    const remoteMeta = newest(scan.heads);
    if (Number(remoteMeta.profileSchemaVersion) > Number(profileDatabase()?.version || 0)) {
      throw new Error('This synchronized profile was created by a newer E-Class Record version. Update this PC before connecting it.');
    }
    let remote;
    try {
      remote = await readEnvelope(remoteMeta.handle, {
        syncKey: profileDatabase().sharedSyncKey || '',
        pin: enrollment.remotePin || globalScope.getCurrentProfilePin()
      });
    } catch (_error) {
      throw new Error('The existing synchronized profile could not be opened. Use the same six-digit profile PIN as the other PC.');
    }
    const localProfile = globalScope.SharedSyncCrypto.canonicalProfile(profileDatabase());
    const localDigest = await globalScope.SharedSyncCrypto.profileDigest(localProfile);
    const common = {
      remoteMeta,
      remoteProfile: remote.profile,
      localProfile,
      localDigest,
      joinSyncKey: remote.syncKey,
      ...(enrollment.recoveryId ? {
        enrollmentRecoveryId: enrollment.recoveryId,
        enrollmentFolderPath: enrollment.folderPath || '',
        enrollmentRemotePin: enrollment.remotePin || ''
      } : {}),
      previousSyncRecord: previous
    };
    pendingReview = {
      ...common,
      mode: 'join',
      merge: globalScope.SharedSyncMerge.mergeTwoWayConservative(localProfile, remote.profile),
      mergeKind: 'two-way'
    };

    if (remoteMeta.dataDigest === localDigest) {
      setStatus('updating', 'Joining Shared Profile', 'The same profile was found. Connecting this PC to its revision history.');
      await applyJoinedProfile(localProfile, remoteMeta, remote.syncKey);
      return;
    }
    if (pendingReview.merge.conflicts.length) {
      setStatus('review', 'Review Needed', `${pendingReview.merge.conflicts.length} differing value${pendingReview.merge.conflicts.length === 1 ? '' : 's'} must be reviewed before this PC can join.`);
    } else {
      setStatus('incoming', 'Profile Found', 'Non-conflicting records from this PC and the shared profile are ready to combine.');
    }
    reviewPending();
  }

  function uniqueRecoveryId() {
    const existing = new Set((rootDatabase()?.profiles || [])
      .map(item => globalScope.BackupRecoveryId.normalizeBackupRecoveryId(item.backupRecoveryId))
      .filter(Boolean));
    let recoveryId = '';
    do {
      recoveryId = globalScope.BackupRecoveryId.generateBackupRecoveryId();
    } while (existing.has(recoveryId));
    return recoveryId;
  }

  async function setupNewOneDriveSync(profile) {
    const record = syncRecord(profile);
    const previousRecord = JSON.parse(JSON.stringify(record));
    const previousId = profile.backupRecoveryId || '';
    const previousPath = profileDatabase().secondaryBackupPath || '';
    const previousKey = profileDatabase().sharedSyncKey || '';
    let recoveryId = '';
    try {
      const selected = await globalScope.electronAPI.selectOneDriveSyncFolder();
      if (selected.canceled) return;
      recoveryId = uniqueRecoveryId();
      profile.backupRecoveryId = recoveryId;
      profileDatabase().secondaryBackupPath = selected.folderPath;
      await globalScope.electronAPI.configureSelectedSharedSyncFolder(recoveryId, selected.folderPath);
      const scan = validateScanMetadata(await globalScope.electronAPI.scanSharedSyncFolder(recoveryId));
      if (scan.heads.length || scan.bases.length) {
        throw new Error('The new Recovery ID unexpectedly matches existing synchronization files. Try setup again.');
      }
      await globalScope.electronAPI.createDatabaseRestorePoint?.('onedrive-sync-setup');
      await initializeNewSync(profile, record);
      if (previousId && previousId !== recoveryId) {
        profile.backupRecoveryIdHistory = Array.from(new Set([
          ...(Array.isArray(profile.backupRecoveryIdHistory) ? profile.backupRecoveryIdHistory : []),
          previousId
        ]));
        await globalScope.saveRootDatabase();
      }
      globalScope.BackupRecovery?.refreshSettings?.();
      globalScope.BackupRecovery?.discoverOneDriveBackups?.(true);
      globalScope.toast('OneDrive synchronization is ready. Keep the Recovery ID and profile PIN safe.', 'success');
    } catch (error) {
      if (recoveryId) {
        try {
          await globalScope.electronAPI.disableSharedSync(recoveryId);
        } catch (_cleanupError) {
          // The failed folder association is harmless and can be replaced later.
        }
      }
      profile.backupRecoveryId = previousId;
      profileDatabase().secondaryBackupPath = previousPath;
      if (previousKey) profileDatabase().sharedSyncKey = previousKey;
      else delete profileDatabase().sharedSyncKey;
      Object.assign(record, previousRecord);
      record.enabled = false;
      suppressPublish = true;
      try {
        await globalScope.saveDatabase();
      } finally {
        suppressPublish = false;
      }
      setStatus('error', 'Sync Setup Failed', error.message || 'OneDrive synchronization could not be set up.');
    }
  }

  function requestExistingProfilePin() {
    return new Promise((resolve, reject) => {
      const modal = createModal(
        'Enter the Existing Profile PIN',
        `<p>Enter the same six-digit PIN used for this profile on the first PC.</p>
         <div class="field"><label class="field-label">Existing Profile PIN</label><input class="field-input" data-remote-pin type="password" maxlength="6" inputmode="numeric" autocomplete="off"></div>
         <div class="unlock-error-msg" data-error></div>`,
        '<button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-open>Verify Profile</button>'
      );
      const input = modal.overlay.querySelector('[data-remote-pin]');
      const error = modal.overlay.querySelector('[data-error]');
      modal.overlay.querySelector('[data-cancel]').addEventListener('click', () => {
        modal.close();
        reject(new Error('Connection canceled.'));
      });
      const submit = () => {
        const pin = String(input.value || '');
        if (!/^\d{6}$/.test(pin)) {
          error.textContent = 'Enter the complete six-digit PIN.';
          return;
        }
        modal.close();
        resolve(pin);
      };
      modal.overlay.querySelector('[data-open]').addEventListener('click', submit);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') submit();
      });
      input.focus();
    });
  }

  function showRepositoryNotReady(retry) {
    const modal = createModal(
      'Profile Not Yet Available',
      '<p>No valid synchronized profile with that Recovery ID is visible yet. OneDrive may still be downloading it.</p><p>No local Recovery ID was assigned and no shared files were written.</p>',
      '<button class="btn btn-cancel btn-sm" data-offline>Continue Working Offline</button><button class="btn btn-primary btn-sm" data-retry>Wait and Check Again</button>'
    );
    modal.overlay.querySelector('[data-offline]').addEventListener('click', () => {
      modal.close();
      setStatus('off', 'Sync Off', 'Working locally. Use Connect Existing Profile after OneDrive finishes.');
    });
    modal.overlay.querySelector('[data-retry]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      modal.close();
      await retry();
    });
  }

  async function connectExisting(options = {}) {
    const profile = activeProfile();
    if (!profile || profile.backupRecoveryId) {
      globalScope.toast('Connect Existing Profile is available only before this profile has a Recovery ID.', 'warning');
      return;
    }
    if (!profile.pinEnabled || !globalScope.getCurrentProfilePin()) {
      globalScope.toast('Enable and unlock PIN Lock Security before connecting an existing profile.', 'warning');
      return;
    }
    const input = document.getElementById('backupRecoverySearchInput');
    const recoveryId = globalScope.BackupRecoveryId.normalizeBackupRecoveryId(options.recoveryId || input?.value);
    if (!recoveryId) {
      globalScope.toast('Enter the Backup Recovery ID from the first PC.', 'warning');
      input?.focus();
      return;
    }
    globalScope.promptPinVerification(async () => {
      const record = syncRecord(profile);
      const previous = JSON.parse(JSON.stringify(record));
      let configured = false;
      try {
        const selected = options.folderPath
          ? { canceled: false, folderPath: options.folderPath }
          : await globalScope.electronAPI.selectOneDriveSyncFolder();
        if (selected.canceled) return;
        setStatus('checking', 'Checking OneDrive', 'Validating the encrypted synchronized profile before changing this PC.');
        const scan = validateScanMetadata(
          await globalScope.electronAPI.inspectSelectedSharedSyncFolder(recoveryId, selected.folderPath)
        );
        if (!scan.heads.length) {
          showRepositoryNotReady(connectExisting);
          return;
        }
        const remotePin = options.remotePin || await requestExistingProfilePin();
        await prepareExistingSyncJoin(profile, record, previous, scan, {
          recoveryId,
          folderPath: selected.folderPath,
          remotePin
        });
      } catch (error) {
        if (configured) {
          try {
            await globalScope.electronAPI.disableSharedSync(recoveryId);
          } catch (_cleanupError) {
            // Best effort only; no profile association has been committed.
          }
        }
        Object.assign(record, previous);
        record.enabled = false;
        setStatus('error', 'Connection Failed', error.message || 'The existing synchronized profile could not be connected.');
      }
    });
  }

  function startNewIdentity() {
    const profile = activeProfile();
    const record = syncRecord(profile);
    if (!profile?.backupRecoveryId) {
      globalScope.toast('Use Set Up OneDrive Sync to create the first Recovery ID.', 'info');
      return;
    }
    if (record?.enabled) {
      globalScope.toast('Disable synchronization on this PC before starting a new sync identity.', 'warning');
      return;
    }
    globalScope.confirmModal(
      'Start a New Sync Identity',
      'This creates a new OneDrive repository and Recovery ID. Existing backups and the previous ID remain available, but other PCs will stay linked to the old identity until you reconnect them.',
      () => globalScope.promptPinVerification(() => setupNewOneDriveSync(profile))
    );
  }

  async function enableSync() {
    const profile = activeProfile();
    if (!profile?.pinEnabled) {
      globalScope.toast('Enable PIN Lock Security before using Multi-PC Shared Folder Sync.', 'warning');
      return;
    }
    if (!globalScope.getCurrentProfilePin()) {
      globalScope.toast('Log out and unlock this profile again before enabling sync.', 'warning');
      return;
    }
    globalScope.promptPinVerification(async () => {
      if (!profile.backupRecoveryId) {
        await setupNewOneDriveSync(profile);
        return;
      }
      const record = syncRecord(profile);
      const previous = JSON.parse(JSON.stringify(record));
      try {
        const configured = await globalScope.electronAPI.configureSharedSyncFolder(profile.backupRecoveryId);
        if (configured.canceled) return;
        setStatus('checking', 'Checking Folder', 'Looking for an existing encrypted profile before this PC writes anything.');
        const scan = validateScanMetadata(await globalScope.electronAPI.scanSharedSyncFolder(profile.backupRecoveryId));
        if (scan.heads.length) {
          await prepareExistingSyncJoin(profile, record, previous, scan);
          return;
        }
        confirmNewSyncRepository(profile, record, previous);
      } catch (error) {
        Object.assign(record, previous);
        await globalScope.saveRootDatabase();
        setStatus('error', 'Sync Problem', error.message || 'Shared Folder Sync could not be enabled.');
      }
    });
  }

  async function disableSync() {
    const profile = activeProfile();
    const record = syncRecord(profile);
    await globalScope.electronAPI.disableSharedSync(profile.backupRecoveryId);
    record.enabled = false;
    record.lastError = '';
    pendingReview = null;
    clearTimeout(publishTimer);
    await globalScope.saveRootDatabase();
    setStatus('off', 'Sync Off', 'Sync is off. Local saving and ordinary backups remain active.');
  }

  function toggleSync() {
    const record = syncRecord();
    if (!record?.enabled) {
      enableSync().catch(error => setStatus('error', 'Sync Problem', error.message));
      return;
    }
    globalScope.confirmModal(
      'Disable Shared Folder Sync',
      'This stops automatic updates on this PC. Local records and existing shared-folder files will not be deleted.',
      () => disableSync().catch(error => setStatus('error', 'Sync Problem', error.message))
    );
  }

  function schedulePublish() {
    if (suppressPublish || !syncRecord()?.enabled) return;
    clearTimeout(publishTimer);
    setStatus(
      navigator.onLine ? 'updating' : 'waiting',
      navigator.onLine ? 'Updating Folder' : 'Waiting for Connection',
      navigator.onLine
        ? 'Local changes are waiting to be written to the shared folder.'
        : 'Changes are saved locally and will be checked again when the connection returns.'
    );
    publishTimer = setTimeout(() => publishNow().catch(error => {
      setStatus('error', 'Sync Problem', error.message || 'The shared folder could not be updated.');
    }), PUBLISH_DELAY_MS);
  }

  async function publishNow(options = {}) {
    const profile = activeProfile();
    const record = syncRecord(profile);
    if (!profile || !record?.enabled || suppressPublish) return false;
    const local = profileDatabase();
    if (!local?.sharedSyncKey || !globalScope.getCurrentProfilePin()) {
      throw new Error('Unlock the PIN-protected profile before synchronizing.');
    }
    if (!options.prechecked) {
      const folderState = await globalScope.electronAPI.getSharedSyncState(profile.backupRecoveryId);
      if (!folderState.configured || !folderState.available) {
        throw new Error('The configured OneDrive folder is unavailable. Changes remain saved locally.');
      }
      const scan = validateScanMetadata(await globalScope.electronAPI.scanSharedSyncFolder(profile.backupRecoveryId));
      const device = await globalScope.electronAPI.getSharedSyncDeviceInfo();
      const integrated = new Set(record.integratedRevisionIds || []);
      const unseenRemote = scan.heads.some(head => (
        head.deviceId !== device.deviceId
        && !integrated.has(head.revisionId)
      ));
      if (unseenRemote) {
        await checkNow({ skipPublish: true });
        return false;
      }
    }
    const digest = await globalScope.SharedSyncCrypto.profileDigest(local);
    if (digest === record.lastPublishedDigest) {
      if (!options.skipCheck) await checkNow({ skipPublish: true });
      return true;
    }
    setStatus('updating', 'Updating Folder', 'Writing an encrypted update to the shared folder.');
    const revisionId = globalScope.SharedSyncCrypto.generateRevisionId();
    const parents = record.ownRevisionId ? [record.ownRevisionId] : [];
    const integrated = Array.from(new Set([...(record.integratedRevisionIds || []), ...parents])).slice(-200);
    const envelope = await envelopeFor(profile, revisionId, record.baseRevisionId || revisionId, parents, integrated);
    await globalScope.electronAPI.writeSharedSyncHead(profile.backupRecoveryId, JSON.stringify(envelope, null, 2));
    record.ownRevisionId = revisionId;
    record.lastPublishedDigest = envelope.dataDigest;
    record.lastFolderWriteAt = envelope.createdAt;
    record.lastError = '';
    await globalScope.saveRootDatabase();
    setStatus('current', 'Folder Up to Date', 'This PC has updated the shared folder. Confirm cloud upload in your sync provider.');
    if (!options.skipCheck) await checkNow({ skipPublish: true });
    return true;
  }

  async function readEnvelope(handle, options = {}) {
    const result = await globalScope.electronAPI.readSharedSyncFile(handle);
    const envelope = JSON.parse(result.content);
    const openOptions = typeof options === 'string' ? { syncKey: options } : options;
    let opened;
    if (openOptions.syncKey && openOptions.pin) {
      try {
        opened = await globalScope.SharedSyncCrypto.openSyncEnvelope(envelope, { syncKey: openOptions.syncKey });
      } catch (_error) {
        opened = await globalScope.SharedSyncCrypto.openSyncEnvelope(envelope, { pin: openOptions.pin });
      }
    } else {
      opened = await globalScope.SharedSyncCrypto.openSyncEnvelope(envelope, openOptions);
    }
    return { envelope, profile: opened.profile, syncKey: opened.syncKey };
  }

  function newest(items) {
    return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
  }

  function validateScanMetadata(scan) {
    const revisions = new Map();
    for (const item of [...(scan?.heads || []), ...(scan?.bases || [])]) {
      const previousDigest = revisions.get(item.revisionId);
      if (previousDigest && previousDigest !== item.dataDigest) {
        throw new Error('OneDrive contains conflicting files for the same synchronization revision. No changes were applied.');
      }
      revisions.set(item.revisionId, item.dataDigest);
    }
    return scan;
  }

  async function checkNow(options = {}) {
    const profile = activeProfile();
    const record = syncRecord(profile);
    if (!profile || !record?.enabled || checking) return;
    checking = true;
    try {
      setStatus('checking', 'Checking Folder', 'Checking the shared folder for changes from another device.');
      const folderState = await globalScope.electronAPI.getSharedSyncState(profile.backupRecoveryId);
      if (!folderState.configured || !folderState.available) throw new Error('The configured shared folder is unavailable on this PC.');
      const localDigest = await globalScope.SharedSyncCrypto.profileDigest(profileDatabase());
      const scan = validateScanMetadata(await globalScope.electronAPI.scanSharedSyncFolder(profile.backupRecoveryId));
      const device = await globalScope.electronAPI.getSharedSyncDeviceInfo();
      const integrated = new Set(record.integratedRevisionIds || []);
      const remoteHeads = scan.heads.filter(head => (
        head.deviceId !== device.deviceId
        && !integrated.has(head.revisionId)
      ));
      if (!options.skipPublish && localDigest !== record.lastPublishedDigest && !remoteHeads.length) {
        checking = false;
        await publishNow({ skipCheck: true, prechecked: true });
        return checkNow({ skipPublish: true });
      }
      record.lastCheckedAt = new Date().toISOString();
      if (!remoteHeads.length) {
        record.lastError = '';
        await globalScope.saveRootDatabase();
        setStatus('current', 'Folder Up to Date', 'No newer device changes were found in the shared folder.');
        return;
      }
      const remoteMeta = newest(remoteHeads);
      if (remoteMeta.dataDigest === localDigest) {
        record.integratedRevisionIds = Array.from(new Set([...integrated, remoteMeta.revisionId])).slice(-200);
        await globalScope.saveRootDatabase();
        setStatus('current', 'Folder Up to Date', 'Both devices contain the same profile data.');
        return;
      }
      const remote = await readEnvelope(remoteMeta.handle, profileDatabase().sharedSyncKey);
      const localCanonical = globalScope.SharedSyncCrypto.canonicalProfile(profileDatabase());
      const fastForward = remoteMeta.integratedRevisionIds.includes(record.ownRevisionId);
      let base = null;
      let merge = null;
      let mergeKind = '';
      if (!fastForward) {
        const commonBaseId = remoteMeta.baseRevisionId === record.baseRevisionId ? record.baseRevisionId : '';
        const baseMeta = scan.bases.find(item => item.revisionId === commonBaseId);
        if (baseMeta) {
          base = await readEnvelope(baseMeta.handle, profileDatabase().sharedSyncKey);
          merge = globalScope.SharedSyncMerge.mergeThreeWay(base.profile, localCanonical, remote.profile);
          mergeKind = 'three-way';
        } else {
          // Older app versions could initialize two PCs with independent bases.
          // Preserve records from both snapshots and require review for every
          // same-path difference instead of offering whole-profile replacement.
          merge = globalScope.SharedSyncMerge.mergeTwoWayConservative(localCanonical, remote.profile);
          mergeKind = 'two-way';
        }
      }
      pendingReview = {
        mode: fastForward ? 'fast-forward' : 'merge',
        remoteMeta,
        remoteProfile: remote.profile,
        baseProfile: base?.profile || null,
        localProfile: localCanonical,
        localDigest,
        merge,
        mergeKind
      };
      await globalScope.saveRootDatabase();
      if (fastForward) {
        setStatus('updating', 'Applying Changes', `Applying verified changes from ${remoteMeta.deviceLabel || 'another device'}.`);
        await applyResolvedProfile(remote.profile, remoteMeta);
        return;
      }
      if (merge?.conflicts.length) {
        setStatus('review', 'Review Needed', `${merge.conflicts.length} conflicting change${merge.conflicts.length === 1 ? '' : 's'} need your decision.`);
        return;
      }
      setStatus('updating', 'Combining Changes', `Combining non-conflicting changes from ${remoteMeta.deviceLabel || 'another device'}.`);
      await applyResolvedProfile(merge.merged, remoteMeta);
    } catch (error) {
      record.lastError = error.message || 'The shared folder could not be checked.';
      await globalScope.saveRootDatabase();
      setStatus('error', 'Sync Problem', record.lastError);
    } finally {
      checking = false;
    }
  }

  function displayValue(value) {
    if (value === undefined) return '(deleted)';
    if (value === null) return 'null';
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return text.length > 300 ? `${text.slice(0, 297)}...` : text;
  }

  function conflictLabel(path) {
    return path
      .replace(/\/@id=/g, ' / record ')
      .replace(/^\//, '')
      .replace(/\//g, ' / ')
      .replace(/~1/g, '/')
      .replace(/~0/g, '~') || 'Profile data';
  }

  async function createPreSyncRestorePoint() {
    const result = await globalScope.electronAPI.createSharedSyncRestorePoint();
    if (!result?.success) {
      throw new Error('A local restore point could not be created. No synchronized changes were applied.');
    }
    return result;
  }

  async function applyResolvedProfile(nextProfile, remoteMeta) {
    const profile = activeProfile();
    const record = syncRecord(profile);
    const latestScan = await globalScope.electronAPI.scanSharedSyncFolder(profile.backupRecoveryId);
    if (!latestScan.heads.some(head => head.revisionId === remoteMeta.revisionId)) {
      pendingReview = null;
      throw new Error('Newer shared-folder changes arrived during review. Check again before applying.');
    }
    const currentDigest = await globalScope.SharedSyncCrypto.profileDigest(profileDatabase());
    if (currentDigest !== pendingReview.localDigest) {
      pendingReview = null;
      throw new Error('This PC changed during review. Check the shared folder again before applying.');
    }
    await createPreSyncRestorePoint();
    const machinePath = profileDatabase().secondaryBackupPath || '';
    const syncKey = profileDatabase().sharedSyncKey;
    nextProfile.secondaryBackupPath = machinePath;
    nextProfile.sharedSyncKey = syncKey;
    globalScope.prepareRestoredDatabase(nextProfile);
    suppressPublish = true;
    try {
      await globalScope.applyRestoredProfileDatabase(nextProfile);
    } finally {
      suppressPublish = false;
    }

    const revisionId = globalScope.SharedSyncCrypto.generateRevisionId();
    const parents = Array.from(new Set([record.ownRevisionId, remoteMeta.revisionId].filter(Boolean)));
    const integrated = Array.from(new Set([
      ...(record.integratedRevisionIds || []),
      ...(remoteMeta.integratedRevisionIds || []),
      ...parents,
      revisionId
    ])).slice(-200);
    const envelope = await envelopeFor(profile, revisionId, revisionId, parents, integrated);
    const text = JSON.stringify(envelope, null, 2);
    await globalScope.electronAPI.writeSharedSyncBase(profile.backupRecoveryId, text);
    await globalScope.electronAPI.writeSharedSyncHead(profile.backupRecoveryId, text);
    record.baseRevisionId = revisionId;
    record.ownRevisionId = revisionId;
    record.integratedRevisionIds = integrated;
    record.lastPublishedDigest = envelope.dataDigest;
    record.lastFolderWriteAt = envelope.createdAt;
    record.lastCheckedAt = envelope.createdAt;
    record.lastError = '';
    pendingReview = null;
    await globalScope.saveRootDatabase();
    setStatus('current', 'Folder Up to Date', 'The selected changes were combined and written to the shared folder.');
    globalScope.toast('Shared-folder changes applied successfully.', 'success');
  }

  async function applyJoinedProfile(nextProfile, remoteMeta, syncKey) {
    const profile = activeProfile();
    const record = syncRecord(profile);
    const enrollment = pendingReview || {};
    const recoveryId = enrollment.enrollmentRecoveryId || profile.backupRecoveryId;
    const enrollmentPath = enrollment.enrollmentFolderPath || profileDatabase().secondaryBackupPath || '';
    const remotePin = enrollment.enrollmentRemotePin || globalScope.getCurrentProfilePin();
    const previousRecoveryId = profile.backupRecoveryId || '';
    const previousPath = profileDatabase().secondaryBackupPath || '';
    const previousSyncKey = profileDatabase().sharedSyncKey || '';
    const previousPin = globalScope.getCurrentProfilePin();
    const previousLocalProfile = enrollment.localProfile
      ? JSON.parse(JSON.stringify(enrollment.localProfile))
      : null;
    let localApplied = false;
    const previousRecord = pendingReview?.previousSyncRecord
      ? JSON.parse(JSON.stringify(pendingReview.previousSyncRecord))
      : JSON.parse(JSON.stringify(record));
    try {
      if (enrollment.enrollmentRecoveryId) {
        await globalScope.electronAPI.configureSelectedSharedSyncFolder(recoveryId, enrollmentPath);
      }
      const latestScan = await globalScope.electronAPI.scanSharedSyncFolder(recoveryId);
      if (!latestScan.heads.some(head => head.revisionId === remoteMeta.revisionId)) {
        throw new Error('The shared profile changed while this PC was joining. Enable Sync again to review the latest version.');
      }
      const currentDigest = await globalScope.SharedSyncCrypto.profileDigest(profileDatabase());
      if (currentDigest !== pendingReview?.localDigest) {
        throw new Error('This PC changed during the join review. Enable Sync again before combining profiles.');
      }

      await createPreSyncRestorePoint();
      nextProfile.secondaryBackupPath = enrollmentPath;
      nextProfile.sharedSyncKey = syncKey;
      globalScope.prepareRestoredDatabase(nextProfile);
      profile.backupRecoveryId = recoveryId;
      if (enrollment.enrollmentRemotePin) {
        await globalScope.replaceActiveProfilePin(remotePin);
      }
      suppressPublish = true;
      try {
        // The normal save path creates a validated local pre-save restore point
        // before this joined profile replaces the active local snapshot.
        await globalScope.applyRestoredProfileDatabase(nextProfile);
        localApplied = true;
      } finally {
        suppressPublish = false;
      }

      const revisionId = globalScope.SharedSyncCrypto.generateRevisionId();
      const parents = [remoteMeta.revisionId];
      const integrated = Array.from(new Set([
        ...(remoteMeta.integratedRevisionIds || []),
        remoteMeta.revisionId,
        revisionId
      ])).slice(-200);
      const envelope = await envelopeFor(profile, revisionId, revisionId, parents, integrated);
      const text = JSON.stringify(envelope, null, 2);
      await globalScope.electronAPI.writeSharedSyncBase(profile.backupRecoveryId, text);
      await globalScope.electronAPI.writeSharedSyncHead(profile.backupRecoveryId, text);

      record.enabled = true;
      record.baseRevisionId = revisionId;
      record.ownRevisionId = revisionId;
      record.integratedRevisionIds = integrated;
      record.lastPublishedDigest = envelope.dataDigest;
      record.lastFolderWriteAt = envelope.createdAt;
      record.lastCheckedAt = envelope.createdAt;
      record.lastError = '';
      pendingReview = null;
      await globalScope.saveRootDatabase();
      setStatus('current', 'Folder Up to Date', 'This PC joined the existing synchronized profile without discarding either PC’s records.');
      globalScope.toast('This PC is now connected to the synchronized profile.', 'success');
    } catch (error) {
      profile.backupRecoveryId = previousRecoveryId;
      profileDatabase().secondaryBackupPath = previousPath;
      if (enrollment.enrollmentRemotePin && previousPin && previousPin !== globalScope.getCurrentProfilePin()) {
        await globalScope.replaceActiveProfilePin(previousPin);
      }
      if (localApplied && previousLocalProfile) {
        previousLocalProfile.secondaryBackupPath = previousPath;
        if (previousSyncKey) previousLocalProfile.sharedSyncKey = previousSyncKey;
        else delete previousLocalProfile.sharedSyncKey;
        globalScope.prepareRestoredDatabase(previousLocalProfile);
        suppressPublish = true;
        try {
          await globalScope.applyRestoredProfileDatabase(previousLocalProfile);
        } finally {
          suppressPublish = false;
        }
      }
      Object.assign(record, previousRecord);
      record.enabled = false;
      record.lastError = error.message || 'This PC could not join the synchronized profile.';
      if (enrollment.enrollmentRecoveryId) {
        try {
          await globalScope.electronAPI.disableSharedSync(enrollment.enrollmentRecoveryId);
        } catch (_cleanupError) {
          // The profile remains unassigned and disabled even if config cleanup fails.
        }
      }
      pendingReview = null;
      await globalScope.saveRootDatabase();
      setStatus('error', 'Sync Problem', record.lastError);
      throw error;
    }
  }

  async function applyReviewedProfile(nextProfile, review) {
    if (review.joinSyncKey) {
      return applyJoinedProfile(nextProfile, review.remoteMeta, review.joinSyncKey);
    }
    return applyResolvedProfile(nextProfile, review.remoteMeta);
  }

  async function cancelPendingEnrollment(review, close) {
    if (review?.enrollmentRecoveryId) {
      try {
        await globalScope.electronAPI.disableSharedSync(review.enrollmentRecoveryId);
      } catch (_error) {
        // No profile ID has been assigned, so a stale device-only mapping is harmless.
      }
      pendingReview = null;
      setStatus('off', 'Sync Off', 'Connection canceled. This profile remains local and has no Recovery ID.');
    }
    close();
  }

  function showSimpleReview(review) {
    const other = review.remoteMeta.deviceLabel || 'another device';
    const noBase = review.mode === 'no-base';
    const joining = Boolean(review.joinSyncKey);
    const body = joining
      ? `<p>An existing synchronized profile was found for this Backup Recovery ID.</p>
         <p>Records found on only one PC will be preserved. Review is required only where both PCs contain different values.</p>
         <p>Shared copy saved ${globalScope.esc(formatDate(review.remoteMeta.createdAt))} by <strong>${globalScope.esc(other)}</strong>.</p>`
      : noBase
      ? `<p>The app could not find a shared base for this PC and ${globalScope.esc(other)}, so record-level combination is unavailable. Choose which complete profile to keep.</p>`
      : `<p>${review.mode === 'fast-forward' ? 'A newer valid profile' : 'Non-conflicting changes'} from <strong>${globalScope.esc(other)}</strong> was found.</p>
         <p>Saved ${globalScope.esc(formatDate(review.remoteMeta.createdAt))}. Confirm before updating this PC.</p>`;
    const actions = joining
      ? '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-primary btn-sm" data-remote>Combine and Join</button>'
      : noBase
      ? '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-ghost btn-sm" data-local>Keep This PC</button><button class="btn btn-primary btn-sm" data-remote>Use Other Device</button>'
      : '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-primary btn-sm" data-remote>Apply Changes</button>';
    const modal = createModal(joining ? 'Join Existing Synchronized Profile' : 'Review Shared-Folder Changes', body, actions);
    modal.overlay.querySelector('[data-close]').addEventListener('click', () => {
      cancelPendingEnrollment(review, modal.close);
    });
    modal.overlay.querySelector('[data-remote]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        await applyReviewedProfile(JSON.parse(JSON.stringify(review.remoteProfile)), review);
        modal.close();
      } catch (error) {
        event.currentTarget.disabled = false;
        globalScope.toast(error.message, 'error');
      }
    });
    modal.overlay.querySelector('[data-local]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        await applyReviewedProfile(JSON.parse(JSON.stringify(review.localProfile)), review);
        modal.close();
      } catch (error) {
        event.currentTarget.disabled = false;
        globalScope.toast(error.message, 'error');
      }
    });
  }

  function showConflictReview(review) {
    const conflicts = review.merge.conflicts;
    const rows = conflicts.map((conflict, index) => `
      <div class="shared-sync-conflict">
        <div class="shared-sync-conflict__path">${globalScope.esc(conflictLabel(conflict.path))}</div>
        <div class="shared-sync-conflict__choices">
          <label class="shared-sync-choice">
            <input type="radio" name="syncConflict${index}" value="local" checked>
            <span><strong>This PC</strong><code>${globalScope.esc(displayValue(conflict.local))}</code></span>
          </label>
          <label class="shared-sync-choice">
            <input type="radio" name="syncConflict${index}" value="remote">
            <span><strong>${globalScope.esc(review.remoteMeta.deviceLabel || 'Other Device')}</strong><code>${globalScope.esc(displayValue(conflict.remote))}</code></span>
          </label>
        </div>
      </div>
    `).join('');
    const modal = createModal(
      'Resolve Synchronization Conflicts',
      `<p>Non-conflicting changes were combined automatically. Choose which value to keep for each conflict.</p>
       <div class="action-cluster u-mb-3"><button class="btn btn-ghost btn-sm" data-all-local>All This PC</button><button class="btn btn-ghost btn-sm" data-all-remote>All Other Device</button></div>
       <div class="shared-sync-conflicts">${rows}</div>`,
      '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-primary btn-sm" data-apply>Combine Selected Changes</button>',
      'shared-sync-review-modal'
    );
    modal.overlay.querySelector('[data-close]').addEventListener('click', () => {
      cancelPendingEnrollment(review, modal.close);
    });
    modal.overlay.querySelector('[data-all-local]').addEventListener('click', () => {
      modal.overlay.querySelectorAll('input[value="local"]').forEach(input => { input.checked = true; });
    });
    modal.overlay.querySelector('[data-all-remote]').addEventListener('click', () => {
      modal.overlay.querySelectorAll('input[value="remote"]').forEach(input => { input.checked = true; });
    });
    modal.overlay.querySelector('[data-apply]').addEventListener('click', async event => {
      const resolutions = {};
      conflicts.forEach((conflict, index) => {
        resolutions[conflict.path] = modal.overlay.querySelector(`input[name="syncConflict${index}"]:checked`)?.value || 'local';
      });
      const resolved = review.mergeKind === 'two-way' || review.joinSyncKey
        ? globalScope.SharedSyncMerge.mergeTwoWayConservative(
          review.localProfile,
          review.remoteProfile,
          resolutions
        )
        : globalScope.SharedSyncMerge.mergeThreeWay(
          review.baseProfile,
          review.localProfile,
          review.remoteProfile,
          resolutions
        );
      event.currentTarget.disabled = true;
      try {
        await applyReviewedProfile(resolved.merged, review);
        modal.close();
      } catch (error) {
        event.currentTarget.disabled = false;
        globalScope.toast(error.message, 'error');
      }
    });
  }

  function reviewPending() {
    if (!pendingReview) {
      globalScope.toast('No incoming shared-folder changes are waiting.', 'info');
      return;
    }
    if ((pendingReview.mode === 'merge' || pendingReview.mode === 'join') && pendingReview.merge.conflicts.length) {
      showConflictReview(pendingReview);
    } else if (pendingReview.mode === 'merge' || pendingReview.mode === 'join') {
      const combined = pendingReview.merge.merged;
      const review = {
        ...pendingReview,
        remoteProfile: combined,
        mode: pendingReview.mode === 'join' ? 'join-combined' : 'combined'
      };
      showSimpleReview(review);
    } else showSimpleReview(pendingReview);
  }

  function openStatus() {
    if (pendingReview) {
      reviewPending();
      return;
    }
    if (typeof globalScope.setView === 'function') globalScope.setView('settings');
    refreshSettings();
  }

  function renameDevice() {
    const modal = createModal(
      'Rename This Device',
      '<div class="field"><label class="field-label">Device Name</label><input class="field-input" data-device-label maxlength="40" placeholder="e.g. Home Laptop"></div>',
      '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-primary btn-sm" data-save>Save Name</button>'
    );
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-save]').addEventListener('click', async () => {
      try {
        await globalScope.electronAPI.renameSharedSyncDevice(modal.overlay.querySelector('[data-device-label]').value);
        modal.close();
        schedulePublish();
        refreshSettings();
      } catch (error) {
        globalScope.toast(error.message, 'error');
      }
    });
    modal.overlay.querySelector('[data-device-label]').focus();
  }

  function initSharedFolderSync() {
    syncRecord();
    refreshSettings();
    globalScope.electronAPI.onSharedSyncFolderChanged?.(recoveryId => {
      if (recoveryId === activeProfile()?.backupRecoveryId) checkNow();
    });
    window.addEventListener('online', () => checkNow());
    window.addEventListener('focus', () => checkNow());
    const settingsView = document.querySelector('[data-view="settings"]');
    if (settingsView) new MutationObserver(refreshSettings).observe(settingsView, { attributes: true, attributeFilter: ['style', 'class'] });
    const profileOverlay = document.getElementById('profileOverlay');
    if (profileOverlay) {
      new MutationObserver(() => {
        refreshSettings();
        if (syncRecord()?.enabled) checkNow();
      }).observe(profileOverlay, { attributes: true, attributeFilter: ['style'] });
    }
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (syncRecord()?.enabled && document.visibilityState !== 'hidden') checkNow();
    }, POLL_INTERVAL_MS);
  }

  const api = {
    initSharedFolderSync,
    schedulePublish,
    publishNow,
    checkNow,
    reviewPending,
    openStatus,
    renameDevice,
    toggleSync,
    connectExisting,
    startNewIdentity,
    refreshSettings,
    getStatus: () => ({ ...currentStatus }),
    isPublishSuppressed: () => suppressPublish
  };
  globalScope.SharedFolderSync = api;
  globalScope.initSharedFolderSync = initSharedFolderSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
