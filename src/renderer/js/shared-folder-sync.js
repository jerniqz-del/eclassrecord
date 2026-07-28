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
    const details = document.getElementById('sharedSyncSettingsDetails');
    if (!toggle || !record) return;
    toggle.textContent = record.enabled ? 'Disable Sync' : 'Enable Sync';
    toggle.classList.toggle('btn-ghost', record.enabled);
    check.hidden = !record.enabled;
    review.hidden = !pendingReview;
    deviceButton.hidden = !record.enabled;
    if (!record.enabled) {
      details.hidden = true;
      if (currentStatus.state !== 'off') setStatus('off', 'Sync Off', 'Sync is off. Local saving and ordinary backups remain active.');
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
      const record = syncRecord(profile);
      const previous = JSON.parse(JSON.stringify(record));
      try {
        const configured = await globalScope.electronAPI.configureSharedSyncFolder(profile.backupRecoveryId);
        if (configured.canceled) return;
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
        setStatus('current', 'Folder Up to Date', 'This PC has updated the shared folder. Confirm cloud upload in your sync provider.');
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

  async function readEnvelope(handle, syncKey) {
    const result = await globalScope.electronAPI.readSharedSyncFile(handle);
    const envelope = JSON.parse(result.content);
    const opened = await globalScope.SharedSyncCrypto.openSyncEnvelope(envelope, { syncKey });
    return { envelope, profile: opened.profile };
  }

  function newest(items) {
    return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
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
      if (!options.skipPublish && localDigest !== record.lastPublishedDigest) {
        checking = false;
        await publishNow({ skipCheck: true });
        return checkNow({ skipPublish: true });
      }
      const scan = await globalScope.electronAPI.scanSharedSyncFolder(profile.backupRecoveryId);
      const device = await globalScope.electronAPI.getSharedSyncDeviceInfo();
      const integrated = new Set(record.integratedRevisionIds || []);
      const remoteHeads = scan.heads.filter(head => (
        head.deviceId !== device.deviceId
        && !integrated.has(head.revisionId)
      ));
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
      if (!fastForward) {
        const commonBaseId = remoteMeta.baseRevisionId === record.baseRevisionId ? record.baseRevisionId : '';
        const baseMeta = scan.bases.find(item => item.revisionId === commonBaseId);
        if (baseMeta) {
          base = await readEnvelope(baseMeta.handle, profileDatabase().sharedSyncKey);
          merge = globalScope.SharedSyncMerge.mergeThreeWay(base.profile, localCanonical, remote.profile);
        }
      }
      pendingReview = {
        mode: fastForward ? 'fast-forward' : (merge ? 'merge' : 'no-base'),
        remoteMeta,
        remoteProfile: remote.profile,
        baseProfile: base?.profile || null,
        localProfile: localCanonical,
        localDigest,
        merge
      };
      await globalScope.saveRootDatabase();
      if (merge?.conflicts.length) {
        setStatus('review', 'Review Needed', `${merge.conflicts.length} conflicting change${merge.conflicts.length === 1 ? '' : 's'} need your decision.`);
      } else {
        setStatus('incoming', 'Newer Changes', `Changes from ${remoteMeta.deviceLabel || 'another device'} are ready to review.`);
      }
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

  function showSimpleReview(review) {
    const other = review.remoteMeta.deviceLabel || 'another device';
    const noBase = review.mode === 'no-base';
    const body = noBase
      ? `<p>The app could not find a shared base for this PC and ${globalScope.esc(other)}, so record-level combination is unavailable. Choose which complete profile to keep.</p>`
      : `<p>${review.mode === 'fast-forward' ? 'A newer valid profile' : 'Non-conflicting changes'} from <strong>${globalScope.esc(other)}</strong> was found.</p>
         <p>Saved ${globalScope.esc(formatDate(review.remoteMeta.createdAt))}. Confirm before updating this PC.</p>`;
    const actions = noBase
      ? '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-ghost btn-sm" data-local>Keep This PC</button><button class="btn btn-primary btn-sm" data-remote>Use Other Device</button>'
      : '<button class="btn btn-cancel btn-sm" data-close>Cancel</button><button class="btn btn-primary btn-sm" data-remote>Apply Changes</button>';
    const modal = createModal('Review Shared-Folder Changes', body, actions);
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
    modal.overlay.querySelector('[data-remote]').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        await applyResolvedProfile(JSON.parse(JSON.stringify(review.remoteProfile)), review.remoteMeta);
        modal.close();
      } catch (error) {
        event.currentTarget.disabled = false;
        globalScope.toast(error.message, 'error');
      }
    });
    modal.overlay.querySelector('[data-local]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        await applyResolvedProfile(JSON.parse(JSON.stringify(review.localProfile)), review.remoteMeta);
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
    modal.overlay.querySelector('[data-close]').addEventListener('click', modal.close);
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
      const resolved = globalScope.SharedSyncMerge.mergeThreeWay(
        review.baseProfile,
        review.localProfile,
        review.remoteProfile,
        resolutions
      );
      event.currentTarget.disabled = true;
      try {
        await applyResolvedProfile(resolved.merged, review.remoteMeta);
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
    if (pendingReview.mode === 'merge' && pendingReview.merge.conflicts.length) showConflictReview(pendingReview);
    else if (pendingReview.mode === 'merge') {
      const combined = pendingReview.merge.merged;
      const review = { ...pendingReview, remoteProfile: combined, mode: 'combined' };
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
    refreshSettings,
    getStatus: () => ({ ...currentStatus }),
    isPublishSuppressed: () => suppressPublish
  };
  globalScope.SharedFolderSync = api;
  globalScope.initSharedFolderSync = initSharedFolderSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
