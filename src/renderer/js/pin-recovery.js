/** Offline recovery-key enrollment and atomic PIN replacement. */
(function initPinRecoveryModule(globalScope) {
  'use strict';

  let recoveryTargetProfileId = '';

  function rootDatabase() {
    return globalScope.getRootDatabase();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function requireSixDigitPin(pin) {
    if (!/^\d{6}$/.test(String(pin || ''))) throw new Error('The new PIN must contain exactly 6 digits.');
  }

  function formatRecoveryKey(value) {
    const normalized = globalScope.normalizeRecoveryKey(value);
    return normalized.match(/.{1,4}/g)?.join('-') || normalized;
  }

  async function decodeRecoveryQrPayloadForProfile(payload, profile) {
    const parsed = await globalScope.parseRecoveryQrPayload(payload);
    if (!profile?.recovery?.recoveryId) {
      throw new Error('This profile uses an older recovery key. Replace it in Settings before using QR recovery.');
    }
    if (parsed.recoveryId !== String(profile.recovery.recoveryId).toLowerCase()) {
      throw new Error('This recovery QR belongs to a different profile or an older replaced recovery key.');
    }
    return parsed.recoveryKey;
  }

  async function decryptProfileData(profile, pin) {
    if (!profile?.pinEnabled) throw new Error('This profile does not use PIN protection.');
    const encrypted = profile.data?.secureBackup || profile.data?.ciphertext;
    const payload = encrypted ? JSON.parse(await globalScope.decryptPayload(profile.data, pin)) : clone(profile.data);
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.assignments)) throw new Error('The recovered profile data is invalid. No data was changed.');
    return typeof globalScope.prepareRestoredDatabase === 'function'
      ? globalScope.prepareRestoredDatabase(payload)
      : payload;
  }

  async function buildRecoveredProfile(profile, recoveryKey, newPin) {
    requireSixDigitPin(newPin);
    if (!profile?.recovery) throw new Error('PIN recovery was not set up for this profile.');
    const oldPin = await globalScope.recoverPinFromDescriptor(profile.recovery, recoveryKey);
    if (!await globalScope.verifyPin(oldPin, profile.salt, profile.pinHash)) {
      throw new Error('Recovery verification failed. No data was changed.');
    }
    const profileData = await decryptProfileData(profile, oldPin);
    const nextSalt = globalScope.generateSalt();
    const nextProfile = clone(profile);
    nextProfile.salt = nextSalt;
    nextProfile.pinHash = await globalScope.hashPin(newPin, nextSalt);
    nextProfile.data = await globalScope.encryptPayload(JSON.stringify(profileData), newPin, { purpose: 'profile-data' });
    nextProfile.recovery = await globalScope.createPinRecoveryDescriptor(newPin, recoveryKey, profile.recovery, { preserveRecoveryId: true });
    nextProfile.lastUpdatedAt = new Date().toISOString();
    delete nextProfile.currentPin;
    return { profile: nextProfile, profileData };
  }

  async function commitRecoveredRoot(root, recoveredProfile, persistCandidate) {
    const candidate = clone(root);
    const index = candidate.profiles?.findIndex(item => item.id === recoveredProfile?.id) ?? -1;
    if (index < 0) throw new Error('Profile was not found in the database. No data was changed.');
    candidate.profiles[index] = clone(recoveredProfile);
    candidate.activeProfileId = recoveredProfile.id;
    if (!await persistCandidate(candidate)) throw new Error('The recovered profile could not be saved. No changes were kept.');
    return candidate;
  }

  function profileById(id) {
    return rootDatabase()?.profiles?.find(profile => profile.id === id) || null;
  }

  function activeProfile() {
    return profileById(rootDatabase()?.activeProfileId);
  }

  function refreshRecoveryStatus() {
    const profile = activeProfile();
    const status = document.getElementById('pinRecoveryStatus');
    const action = document.getElementById('btnConfigurePinRecovery');
    if (!status || !action) return;
    if (!profile?.pinEnabled) {
      status.textContent = 'PIN recovery is available after PIN Lock Security is enabled for a profile.';
      action.disabled = true;
      action.textContent = 'Set Up Recovery';
      return;
    }
    action.disabled = false;
    action.textContent = profile.recovery ? 'Replace Recovery Key' : 'Set Up Recovery';
    status.textContent = profile.recovery
      ? `Recovery is enabled. Saved key hint: ••••-${profile.recovery.keyHint || '????'}. Replacing it invalidates the previous recovery key.`
      : 'Recovery is not configured. Without the PIN or a recovery key, encrypted profile data cannot be decrypted.';
  }

  async function showGeneratedRecoveryKey(profile) {
    const key = globalScope.generateRecoveryKey();
    let recoveryDescriptor;
    let qrDataUrl;
    try {
      recoveryDescriptor = await globalScope.createPinRecoveryDescriptor(globalScope.getCurrentProfilePin(), key, profile.recovery || {});
      const qrPayload = await globalScope.createRecoveryQrPayload(recoveryDescriptor, key);
      qrDataUrl = await globalScope.electronAPI.generateRecoveryQr(qrPayload);
    } catch (error) {
      globalScope.toast('Could not create recovery QR: ' + error.message, 'error');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '11000';
    overlay.innerHTML = `
      <div class="modal modal--wide pin-recovery-enrollment">
        <div class="modal__title">Save Your Recovery Key</div>
        <div class="modal__body">
          <p>Save or print this QR recovery card, or copy the key below. Store it separately from this computer. Neither can be shown again.</p>
          <div class="pin-recovery-qr-card"><img src="${qrDataUrl}" alt="Offline PIN recovery QR code" data-recovery-qr /></div>
          <div class="pin-recovery-qr-actions">
            <button class="btn btn-ghost btn-sm" type="button" data-save-qr>Save QR Image</button>
            <button class="btn btn-ghost btn-sm" type="button" data-print-qr>Print Recovery Card</button>
          </div>
          <div class="pin-recovery-key" data-recovery-key>${globalScope.esc(key)}</div>
          <p class="pin-recovery-warning">Anyone holding this QR image or key can replace this profile's PIN.</p>
          <label class="welcome-checkbox-label checkbox-row u-mt-3"><input type="checkbox" data-confirm-saved /> I saved the QR or recovery key in a safe place.</label>
          <div class="unlock-error-msg" data-recovery-error></div>
        </div>
        <div class="modal__actions">
          <button class="btn btn-cancel btn-sm" data-cancel>Cancel</button>
          <button class="btn btn-primary btn-sm" data-enable disabled>Enable Recovery</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const checkbox = overlay.querySelector('[data-confirm-saved]');
    const enable = overlay.querySelector('[data-enable]');
    checkbox.addEventListener('change', () => { enable.disabled = !checkbox.checked; });
    overlay.querySelector('[data-cancel]').addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-save-qr]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await globalScope.electronAPI.exportRecoveryQr(qrDataUrl, `eclass-recovery-${profile.name || 'profile'}.png`);
        if (result?.success) globalScope.toast('Recovery QR image saved.', 'success');
      } catch (error) {
        overlay.querySelector('[data-recovery-error]').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    overlay.querySelector('[data-print-qr]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await globalScope.electronAPI.printRecoveryQr(qrDataUrl, profile.name || 'E-Class Record Profile');
        if (!result?.success && result?.error) overlay.querySelector('[data-recovery-error]').textContent = result.error;
      } catch (error) {
        overlay.querySelector('[data-recovery-error]').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    enable.addEventListener('click', async () => {
      const previousRecovery = profile.recovery ? clone(profile.recovery) : null;
      try {
        enable.disabled = true;
        profile.recovery = recoveryDescriptor;
        if (!await globalScope.saveRootDatabase()) throw new Error('The recovery settings could not be saved. No changes were kept.');
        overlay.remove();
        refreshRecoveryStatus();
        globalScope.toast('PIN recovery enabled. Keep the recovery key safe.', 'success');
      } catch (error) {
        profile.recovery = previousRecovery;
        overlay.querySelector('[data-recovery-error]').textContent = error.message;
        enable.disabled = false;
      }
    });
  }

  function configurePinRecovery() {
    const profile = activeProfile();
    if (!profile?.pinEnabled) {
      globalScope.toast('PIN Lock Security must be enabled before recovery can be configured.', 'warning');
      return;
    }
    if (!globalScope.getCurrentProfilePin()) {
      globalScope.toast('Please log out and unlock this profile again before configuring recovery.', 'warning');
      return;
    }
    globalScope.promptPinVerification(() => showGeneratedRecoveryKey(profile));
  }

  function showPinRecoveryPanel() {
    const profile = profileById(recoveryTargetProfileId);
    const error = document.getElementById('unlockErrorMsg');
    if (!profile?.recovery) {
      if (error) error.textContent = 'Recovery was not set up for this profile. Use the original PIN or restore a backup whose PIN you know.';
      return;
    }
    document.getElementById('profileUnlockPanel').style.display = 'none';
    const panel = document.getElementById('profileRecoveryPanel');
    panel.style.display = 'block';
    document.getElementById('recoveryProfileTitle').textContent = `Recover ${profile.name}`;
    document.getElementById('recoveryKeyField').value = '';
    document.getElementById('recoveryNewPin').value = '';
    document.getElementById('recoveryConfirmPin').value = '';
    document.getElementById('recoveryErrorMsg').textContent = '';
    document.getElementById('recoveryQrStatus').textContent = 'Upload a saved recovery QR image, or enter the recovery key manually.';
    document.getElementById('recoveryQrFile').value = '';
    setTimeout(() => document.getElementById('recoveryKeyField').focus(), 80);
  }

  function readRecoveryQrImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type || '') || file.size > 10 * 1024 * 1024) {
        reject(new Error('Choose a PNG, JPEG, or WebP recovery QR image smaller than 10 MB.'));
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) {
            throw new Error('The selected QR image dimensions are unsupported.');
          }
          const maximum = 2048;
          const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(21, Math.round(image.naturalWidth * scale));
          const height = Math.max(21, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, width, height);
          resolve({ data: context.getImageData(0, 0, width, height).data, width, height });
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected image could not be opened.'));
      };
      image.src = objectUrl;
    });
  }

  async function uploadRecoveryQr(file) {
    const error = document.getElementById('recoveryErrorMsg');
    const status = document.getElementById('recoveryQrStatus');
    try {
      const profile = profileById(recoveryTargetProfileId);
      if (!profile) throw new Error('Profile was not found.');
      status.textContent = 'Reading recovery QR locally…';
      error.textContent = '';
      const pixels = await readRecoveryQrImage(file);
      const payload = await globalScope.electronAPI.decodeRecoveryQrPixels(pixels);
      if (!payload) throw new Error('No readable QR code was found in the selected image.');
      const recoveryKey = await decodeRecoveryQrPayloadForProfile(payload, profile);
      document.getElementById('recoveryKeyField').value = formatRecoveryKey(recoveryKey);
      status.textContent = 'Recovery QR verified. Choose and confirm your new PIN.';
      document.getElementById('recoveryNewPin').focus();
    } catch (uploadError) {
      status.textContent = 'QR recovery image was not accepted.';
      error.textContent = uploadError.message;
    } finally {
      document.getElementById('recoveryQrFile').value = '';
    }
  }

  function cancelPinRecovery() {
    document.getElementById('profileRecoveryPanel').style.display = 'none';
    document.getElementById('profileUnlockPanel').style.display = 'block';
  }

  async function submitPinRecovery() {
    const error = document.getElementById('recoveryErrorMsg');
    const button = document.getElementById('btnSubmitPinRecovery');
    try {
      const profile = profileById(recoveryTargetProfileId);
      if (!profile) throw new Error('Profile was not found.');
      const recoveryKey = document.getElementById('recoveryKeyField').value;
      const newPin = document.getElementById('recoveryNewPin').value;
      const confirmation = document.getElementById('recoveryConfirmPin').value;
      if (newPin !== confirmation) throw new Error('The new PIN entries do not match.');
      button.disabled = true;
      error.textContent = 'Verifying recovery key and profile integrity…';
      const recovered = await buildRecoveredProfile(profile, recoveryKey, newPin);
      const previousRoot = clone(rootDatabase());
      try {
        await commitRecoveredRoot(rootDatabase(), recovered.profile, async candidate => {
          globalScope.replaceRootDatabase(candidate);
          return globalScope.saveRootDatabase();
        });
      } catch (saveError) {
        globalScope.replaceRootDatabase(previousRoot);
        throw saveError;
      }
      document.getElementById('profileRecoveryPanel').style.display = 'none';
      await globalScope.unlockProfileAndEnter(recovered.profile, newPin);
      globalScope.toast('PIN replaced successfully. Your recovery key remains active.', 'success');
    } catch (recoveryError) {
      error.textContent = recoveryError.message || 'PIN recovery failed. No data was changed.';
    } finally {
      button.disabled = false;
    }
  }

  function installProfileSelectionHook() {
    const original = globalScope.selectProfileCard;
    if (typeof original !== 'function' || original.__pinRecoveryWrapped) return;
    const wrapped = function selectProfileCardWithRecovery(id) {
      recoveryTargetProfileId = id;
      const result = original.apply(this, arguments);
      const profile = profileById(id);
      const button = document.getElementById('btnForgotProfilePin');
      if (button) button.hidden = !profile?.pinEnabled;
      return result;
    };
    wrapped.__pinRecoveryWrapped = true;
    globalScope.selectProfileCard = wrapped;
  }

  function initPinRecovery() {
    installProfileSelectionHook();
    refreshRecoveryStatus();
    const profileOverlay = document.getElementById('profileOverlay');
    if (profileOverlay) new MutationObserver(refreshRecoveryStatus).observe(profileOverlay, { attributes: true, attributeFilter: ['style'] });
  }

  const api = { buildRecoveredProfile, commitRecoveredRoot, decodeRecoveryQrPayloadForProfile, refreshRecoveryStatus, configurePinRecovery, showPinRecoveryPanel, uploadRecoveryQr, cancelPinRecovery, submitPinRecovery, initPinRecovery };
  Object.assign(globalScope, api);
  globalScope.PinRecovery = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
