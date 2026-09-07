(function initDiagnosticsUi(globalScope) {
  'use strict';

  async function refresh() {
    const api = globalScope.electronAPI;
    const status = document.getElementById('diagnosticPolicyStatus');
    const toggle = document.getElementById('settingDiagnosticCollection');
    if (!api?.getDiagnosticPolicy || !status || !toggle) return;
    try {
      const policy = await api.getDiagnosticPolicy();
      toggle.checked = policy.enabled === true;
      status.textContent = policy.enabled
        ? `Enabled locally. No automatic upload. Logs rotate at ${Math.round(policy.maximumLogBytesPerFile / 1024)} KB and local crash data is retained for up to ${policy.retentionDays} days.`
        : 'Disabled for the next app launch. Existing local diagnostics can still be deleted below.';
    } catch (_error) {
      status.textContent = 'Diagnostic policy is temporarily unavailable.';
    }
    try {
      const permissions = await api?.getPermissionPreferences?.();
      const bluetooth = document.getElementById('settingBluetoothPermission');
      const microphone = document.getElementById('settingMicrophonePermission');
      if (bluetooth) bluetooth.checked = permissions?.bluetooth === true;
      if (microphone) microphone.checked = permissions?.microphone === true;
    } catch (_error) {}
  }

  async function setEnabled() {
    const toggle = document.getElementById('settingDiagnosticCollection');
    if (!toggle || !globalScope.electronAPI?.setDiagnosticCollectionEnabled) return;
    await globalScope.electronAPI.setDiagnosticCollectionEnabled(toggle.checked);
    await refresh();
    globalScope.toast?.('Diagnostic collection preference saved. Restart the app to apply it.', 'success');
  }

  async function exportBundle() {
    const result = await globalScope.electronAPI?.exportDiagnosticSupportBundle?.();
    if (result?.success) globalScope.toast?.('Sanitized support bundle exported.', 'success');
  }

  async function deleteData() {
    const perform = async () => {
      await globalScope.electronAPI?.deleteDiagnosticData?.();
      globalScope.toast?.('Local diagnostic logs and crash dumps deleted.', 'success');
      await refresh();
    };
    if (typeof globalScope.confirmModal === 'function') {
      globalScope.confirmModal('Delete Local Diagnostics', 'Delete all local diagnostic logs and crash dumps? Profile records and backups are not affected.', perform);
    } else {
      await perform();
    }
  }

  async function setPermission(event) {
    const capability = event.currentTarget?.id === 'settingBluetoothPermission' ? 'bluetooth' : 'microphone';
    await globalScope.electronAPI?.setPermissionPreference?.(capability, event.currentTarget.checked);
    globalScope.toast?.(`${capability === 'bluetooth' ? 'Bluetooth' : 'Microphone'} permission preference saved.`, 'success');
    await refresh();
  }

  function bind() {
    document.getElementById('settingDiagnosticCollection')?.addEventListener('change', setEnabled);
    document.getElementById('btnExportDiagnosticBundle')?.addEventListener('click', exportBundle);
    document.getElementById('btnDeleteDiagnosticData')?.addEventListener('click', deleteData);
    document.getElementById('settingBluetoothPermission')?.addEventListener('change', setPermission);
    document.getElementById('settingMicrophonePermission')?.addEventListener('change', setPermission);
    refresh();
  }

  globalScope.DiagnosticsUI = { bind, refresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})(window);
