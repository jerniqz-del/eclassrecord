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
    nextProfile.recovery = await globalScope.createPinRecoveryDescriptor(newPin, recoveryKey, profile.recovery);
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

  function showGeneratedRecoveryKey(profile) {
    const key = globalScope.generateRecoveryKey();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '11000';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal__title">Save Your Recovery Key</div>
        <div class="modal__body">
          <p>This key is the only offline method for replacing a forgotten PIN. Store it separately from this computer. It cannot be shown again.</p>
          <div class="pin-recovery-key" data-recovery-key>${globalScope.esc(key)}</div>
          <label class="welcome-checkbox-label checkbox-row u-mt-3"><input type="checkbox" data-confirm-saved /> I saved this recovery key in a safe place.</label>
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
    enable.addEventListener('click', async () => {
      const previousRecovery = profile.recovery ? clone(profile.recovery) : null;
      try {
        enable.disabled = true;
        profile.recovery = await globalScope.createPinRecoveryDescriptor(globalScope.getCurrentProfilePin(), key, profile.recovery || {});
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
    setTimeout(() => document.getElementById('recoveryKeyField').focus(), 80);
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

  const api = { buildRecoveredProfile, commitRecoveredRoot, refreshRecoveryStatus, configurePinRecovery, showPinRecoveryPanel, cancelPinRecovery, submitPinRecovery, initPinRecovery };
  Object.assign(globalScope, api);
  globalScope.PinRecovery = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
