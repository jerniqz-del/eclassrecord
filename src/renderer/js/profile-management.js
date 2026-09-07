(function desktopProfileManagement(globalScope) {
  'use strict';

  const PROFILE_BACKUP_FORMAT = 'eclass-record-profile-backup';
  const PROFILE_BACKUP_VERSION = 1;
  const MAX_PROFILES = 5;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function rootDatabase() {
    return typeof getRootDatabase === 'function' ? getRootDatabase() : null;
  }

  function safeFilePart(value) {
    return String(value || 'profile')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'profile';
  }

  async function buildProfileBackupEnvelope(profile) {
    const appVersion = typeof globalScope.electronAPI?.getVersion === 'function'
      ? await globalScope.electronAPI.getVersion()
      : '';
    const storedProfile = clone(profile);
    delete storedProfile.currentPin;
    const core = {
      format: PROFILE_BACKUP_FORMAT,
      backupVersion: PROFILE_BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: String(appVersion || ''),
      profile: storedProfile,
    };
    return {
      ...core,
      integrity: await createIntegrityDescriptor(core),
    };
  }

  async function validateProfileBackupEnvelope(envelope) {
    if (!envelope || envelope.format !== PROFILE_BACKUP_FORMAT || envelope.backupVersion !== PROFILE_BACKUP_VERSION) {
      throw new Error('This is not an E-Class Record profile backup file.');
    }
    const core = { ...envelope };
    delete core.integrity;
    if (!await verifyIntegrityDescriptor(core, envelope.integrity)) {
      throw new Error('The profile backup integrity check failed. The file may be incomplete or modified.');
    }
    const profile = clone(envelope.profile);
    delete profile.currentPin;
    if (!profile || typeof profile !== 'object'
      || typeof profile.id !== 'string' || !profile.id.trim()
      || typeof profile.name !== 'string' || !profile.name.trim()
      || !profile.data || typeof profile.data !== 'object') {
      throw new Error('The profile backup is missing required profile data.');
    }
    return normalizeProfileRecord(profile);
  }

  function removeBluetoothPairing(profileId) {
    const listKey = 'eclass.bluetooth.pairings.v2';
    const legacyKey = 'eclass.bluetooth.pairing.v1';
    try {
      const values = JSON.parse(localStorage.getItem(listKey) || '[]');
      const remaining = Array.isArray(values)
        ? values.filter(item => String(item?.profileId || '') !== profileId)
        : [];
      localStorage.setItem(listKey, JSON.stringify(remaining));
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || 'null');
      if (String(legacy?.profileId || '') === profileId) localStorage.removeItem(legacyKey);
    } catch (error) {
      console.warn('Could not remove the deleted profile Bluetooth pairing:', error);
    }
  }

  async function deleteProfileWithBackup(profileId) {
    const root = rootDatabase();
    const profile = root?.profiles?.find(item => item.id === profileId);
    if (!profile) throw new Error('The selected profile no longer exists.');
    if (typeof sessionActive !== 'undefined' && sessionActive && root.activeProfileId === profileId) {
      throw new Error('Log out of this profile before deleting it.');
    }

    const envelope = await buildProfileBackupEnvelope(profile);
    const date = new Date().toISOString().slice(0, 10);
    const defaultName = `E-Class-Record-Profile-${safeFilePart(profile.name)}-${date}.json`;
    const exported = await globalScope.electronAPI.exportJson(JSON.stringify(envelope, null, 2), defaultName);
    if (!exported?.success) return { success: false, canceled: true };

    await globalScope.electronAPI.createDatabaseRestorePoint?.('profile-delete');
    const previousRoot = clone(root);
    const wasActive = root.activeProfileId === profileId;
    root.profiles = root.profiles.filter(item => item.id !== profileId);
    if (wasActive) root.activeProfileId = '';
    if (!await saveRootDatabase()) {
      replaceRootDatabase(previousRoot);
      throw new Error('The profile could not be deleted. The saved database was left unchanged.');
    }

    if (wasActive) {
      currentProfilePin = '';
      sessionActive = false;
      selectedProfileIdToUnlock = '';
      await globalScope.electronAPI.stopCompanionWlan?.().catch(() => {});
    }
    removeBluetoothPairing(profileId);
    renderProfiles();
    return { success: true, path: exported.path || '', profileName: profile.name };
  }

  async function restoreProfileBackup() {
    try {
      const imported = await globalScope.electronAPI.importJson();
      if (!imported?.success || !imported.content) return { success: false, canceled: true };
      const profile = await validateProfileBackupEnvelope(JSON.parse(imported.content));
      const root = rootDatabase();
      if (!root || !Array.isArray(root.profiles)) throw new Error('The local profile database is unavailable.');
      if (root.profiles.some(item => item.id === profile.id)) {
        throw new Error('This profile already exists on this desktop.');
      }
      if (root.profiles.length >= MAX_PROFILES) {
        throw new Error(`This desktop already has the maximum of ${MAX_PROFILES} profiles.`);
      }
      const previousRoot = clone(root);
      root.profiles.push(profile);
      if (!await saveRootDatabase()) {
        replaceRootDatabase(previousRoot);
        throw new Error('The restored profile could not be saved.');
      }
      renderProfiles();
      globalScope.toast?.(`Profile restored: ${profile.name}`, 'success');
      return { success: true, profile };
    } catch (error) {
      console.error('Profile restore failed:', error);
      globalScope.toast?.(`Profile restore failed: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  function closeOverlay(id) {
    document.getElementById(id)?.remove();
  }

  function profileRow(profile) {
    const row = document.createElement('div');
    row.className = 'profile-manager-row';
    const identity = document.createElement('div');
    identity.className = 'profile-manager-row__identity';
    const avatar = document.createElement('span');
    avatar.className = 'profile-manager-row__avatar';
    avatar.textContent = String(profile.name || '?').trim().charAt(0).toUpperCase() || '?';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = profile.name || 'Unnamed profile';
    const meta = document.createElement('small');
    meta.textContent = profile.pinEnabled ? 'PIN protected' : 'No PIN lock';
    copy.append(name, meta);
    identity.append(avatar, copy);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-danger btn-sm profile-manager-row__delete';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${profile.name || 'profile'}`);
    remove.addEventListener('click', () => confirmDelete(profile.id));
    row.append(identity, remove);
    return row;
  }

  function renderManagerRows() {
    const list = document.getElementById('desktopProfileManagerList');
    if (!list) return;
    list.innerHTML = '';
    const profiles = rootDatabase()?.profiles || [];
    if (!profiles.length) {
      const empty = document.createElement('p');
      empty.className = 'profile-manager-empty';
      empty.textContent = 'No saved profiles remain. Restore a backup or create a new profile.';
      list.appendChild(empty);
      return;
    }
    profiles.forEach(profile => list.appendChild(profileRow(profile)));
  }

  function openManager() {
    closeOverlay('desktopProfileManagerOverlay');
    const overlay = document.createElement('div');
    overlay.id = 'desktopProfileManagerOverlay';
    overlay.className = 'modal-overlay profile-manager-overlay';
    overlay.innerHTML = `
      <div class="modal profile-manager-modal" role="dialog" aria-modal="true" aria-labelledby="desktopProfileManagerTitle">
        <div class="modal__title" id="desktopProfileManagerTitle">Manage desktop profiles</div>
        <div class="modal__body">
          <p class="profile-manager-note">Deleting a profile requires saving a complete backup file first. PIN-protected profiles remain encrypted in the backup.</p>
          <div id="desktopProfileManagerList" class="profile-manager-list"></div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost btn-sm" id="btnRestoreManagedProfile" type="button">Restore Profile Backup</button>
          <button class="btn btn-primary btn-sm" id="btnCloseProfileManager" type="button">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#btnCloseProfileManager').addEventListener('click', () => closeOverlay(overlay.id));
    overlay.querySelector('#btnRestoreManagedProfile').addEventListener('click', async () => {
      const result = await restoreProfileBackup();
      if (result.success) renderManagerRows();
    });
    renderManagerRows();
  }

  function confirmDelete(profileId) {
    const profile = rootDatabase()?.profiles?.find(item => item.id === profileId);
    if (!profile) return;
    closeOverlay('desktopProfileDeleteOverlay');
    const overlay = document.createElement('div');
    overlay.id = 'desktopProfileDeleteOverlay';
    overlay.className = 'modal-overlay profile-delete-overlay';
    overlay.innerHTML = `
      <div class="modal profile-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="desktopProfileDeleteTitle">
        <div class="modal__title" id="desktopProfileDeleteTitle">Delete desktop profile?</div>
        <div class="modal__body">
          <p id="desktopProfileDeleteMessage"></p>
          <div class="profile-delete-warning">All classes, learners, grades, attendance, calendar data, settings, and sync metadata in this desktop profile will be removed. A complete backup must be saved before deletion.</div>
          <div id="desktopProfileDeleteStatus" class="profile-delete-status" role="status"></div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-cancel btn-sm" id="btnCancelProfileDelete" type="button">Cancel</button>
          <button class="btn btn-danger btn-sm" id="btnConfirmProfileDelete" type="button">Save Backup &amp; Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#desktopProfileDeleteMessage').textContent = `You are about to delete "${profile.name}" from this desktop.`;
    overlay.querySelector('#btnCancelProfileDelete').addEventListener('click', () => closeOverlay(overlay.id));
    overlay.querySelector('#btnConfirmProfileDelete').addEventListener('click', async event => {
      const button = event.currentTarget;
      const status = overlay.querySelector('#desktopProfileDeleteStatus');
      button.disabled = true;
      status.textContent = 'Choose where to save the profile backup...';
      try {
        const result = await deleteProfileWithBackup(profileId);
        if (result.canceled) {
          status.textContent = 'Deletion canceled. The profile was not changed.';
          button.disabled = false;
          return;
        }
        closeOverlay(overlay.id);
        renderManagerRows();
        globalScope.toast?.(`Profile deleted. Backup saved${result.path ? ` to ${result.path}` : '.'}`, 'success');
      } catch (error) {
        status.textContent = error.message || 'The profile could not be deleted.';
        button.disabled = false;
      }
    });
  }

  globalScope.DesktopProfileManager = {
    open: openManager,
    confirmDelete,
    deleteProfileWithBackup,
    restoreProfileBackup,
    buildProfileBackupEnvelope,
    validateProfileBackupEnvelope,
  };
})(window);
