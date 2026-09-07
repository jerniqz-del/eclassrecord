(function installProfileSessionBridge(globalScope) {
  'use strict';

  const api = globalScope.electronAPI;
  if (!api?.unlockProfile || !api?.lockProfile) return;

  if (typeof globalScope.unlockProfileAndEnter === 'function') {
    const originalUnlock = globalScope.unlockProfileAndEnter;
    globalScope.unlockProfileAndEnter = async function securedUnlock(profile, pin) {
      const unlocked = await api.unlockProfile(String(profile?.id || ''), String(pin || ''));
      if (!unlocked?.unlocked) throw new Error('The desktop profile could not be unlocked.');
      try {
        const entered = await originalUnlock.call(this, profile, pin);
        try {
          await globalScope.MobileSyncBridge?.restoreTrustedLink?.();
        } catch (error) {
          if (!/unlock a desktop profile/i.test(String(error?.message || error || ''))) {
            console.error('Trusted companion restore failed:', error);
          }
        }
        return entered;
      } catch (error) {
        await api.lockProfile();
        throw error;
      }
    };
  }

  if (typeof globalScope.logoutProfile === 'function') {
    const originalLogout = globalScope.logoutProfile;
    globalScope.logoutProfile = async function securedLogout(...args) {
      try {
        return await originalLogout.apply(this, args);
      } finally {
        await api.lockProfile();
      }
    };
  }

  if (typeof api.onProfileSessionLocked === 'function') {
    api.onProfileSessionLocked(() => {
      if (typeof globalScope.showProfileSelect === 'function') globalScope.showProfileSelect();
    });
  }

  if (typeof api.onCompanionWorkspaceResumed === 'function') {
    api.onCompanionWorkspaceResumed((payload) => {
      if (payload?.locked) return;
      if (typeof globalScope.MobileSyncBridge?.restoreTrustedLink === 'function') {
        globalScope.MobileSyncBridge.restoreTrustedLink().catch((error) => {
          console.error('Trusted companion restore failed:', error);
        });
        return;
      }
      if (typeof globalScope.MobileSyncBridge?.flushPublish === 'function') {
        globalScope.MobileSyncBridge.flushPublish();
      }
    });
  }
})(window);
