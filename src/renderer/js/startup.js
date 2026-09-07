'use strict';

PerformanceMode.init();
initFontSize();
initSidebarResizer();
if (!window.__ECLASS_SAFE_MODE && typeof initSidebarAd === 'function') initSidebarAd();
initTeacherTools();
initPinRecovery();
initBackupRecovery();
if (!window.__ECLASS_SAFE_MODE) initSharedFolderSync();
if (!window.__ECLASS_SAFE_MODE) CloudGradePilot.init();
UsageAnalytics.init();
UpdateManager.init();

if (window.__ECLASS_SAFE_MODE || window.__ECLASS_RECOVERY_START) {
  if (typeof showProfileSelect === 'function') showProfileSelect();
  const profileOverlay = document.getElementById('profileOverlay');
  if (profileOverlay) {
    profileOverlay.style.display = 'flex';
    const lockObserver = new MutationObserver(() => {
      if (profileOverlay.style.display === 'none') profileOverlay.style.display = 'flex';
    });
    lockObserver.observe(profileOverlay, { attributes: true, attributeFilter: ['style', 'class'] });
    profileOverlay.addEventListener('click', () => lockObserver.disconnect(), { once: true, capture: true });
  }
  const banner = document.createElement('div');
  banner.className = 'safe-mode-banner no-print';
  banner.setAttribute('role', 'status');
  banner.textContent = window.__ECLASS_SAFE_MODE
    ? 'Safe Mode is active. Animations, games, ads, cloud activity, and automatic shared sync are disabled. Profiles, backups, restore, and export remain available.'
    : 'The workspace recovered safely and is locked. Select a profile to continue.';
  document.body.prepend(banner);
}

function installProfilePinAutoUnlock() {
  const field = document.getElementById('passcodeField');
  if (!field || field.dataset.autoUnlockInstalled === '1') return;
  field.dataset.autoUnlockInstalled = '1';
  field.setAttribute('inputmode', 'numeric');
  let busy = false;
  field.addEventListener('input', () => {
    const pin = String(field.value || '').replace(/\D/g, '').slice(0, 6);
    if (field.value !== pin) field.value = pin;
    if (pin.length !== 6 || busy || typeof submitPasscode !== 'function') return;
    busy = true;
    Promise.resolve(submitPasscode()).finally(() => { busy = false; });
  });
}

installProfilePinAutoUnlock();
