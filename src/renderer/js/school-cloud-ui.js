(function initializeSchoolCloudUi(globalScope) {
  'use strict';

  const state = {
    enabled: false,
    schoolId: '',
    connection: null,
    contentKey: '',
    workspaceActive: false,
    workspaceConflict: null,
    approvals: [],
    loading: false,
    setupWizard: false,
    setupRecovery: null
  };

  const roleLabels = {
    'school-ict': 'ICT Coordinator',
    'school-admin': 'School Admin',
    'school-head': 'School Head',
    'subject-teacher': 'Subject Teacher',
    adviser: 'Class Adviser'
  };

  function client() {
    if (!globalScope.SchoolCloudClient) throw new Error('School Cloud client is unavailable.');
    return globalScope.SchoolCloudClient;
  }

  function esc(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function notify(message, tone = 'info') {
    const status = document.getElementById('schoolCloudAdminStatus');
    if (status) {
      status.textContent = message;
      status.dataset.tone = tone;
    }
    if (typeof globalScope.toast === 'function' && tone !== 'info') {
      globalScope.toast(message, tone === 'error' ? 'error' : tone);
    }
  }

  function role() {
    return state.connection?.user?.role || '';
  }

  function isAdmin() {
    return client().ADMIN_ROLES.has(role());
  }

  function generatedDeviceId() {
    const value = globalScope.crypto?.randomUUID?.().replace(/-/g, '');
    return value || `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function cardMarkup() {
    return `
      <div class="school-cloud-admin__heading">
        <div>
          <span class="school-cloud-admin__eyebrow">PRIVATE PILOT · DISABLED BY DEFAULT</span>
          <h2 class="card-title">School Cloud &amp; Administration</h2>
          <p class="settings-row__desc">School-owned Cloudflare relay with encrypted payloads, approval controls, announcements, and one active admin workspace per account.</p>
        </div>
        <span id="schoolCloudConnectionBadge" class="school-cloud-admin__badge">Not connected</span>
      </div>
      <div id="schoolCloudAdminStatus" class="school-cloud-admin__status" aria-live="polite">Checking protected connection…</div>
      <div id="schoolCloudAdminBody"></div>
    `;
  }

  function setupMarkup() {
    if (state.setupWizard) return setupWizardMarkup();
    return `
      <div class="school-cloud-admin__notice">
        Enter the permanent personnel activation code issued by your school ICT Coordinator.
      </div>
      <div class="school-cloud-admin__getting-started">
        <div><strong>Setting up a new school?</strong><span>The ICT Coordinator can use the guided setup. It creates the initial ICT Coordinator and School Head codes without storing the school recovery key in Cloudflare.</span></div>
        <button id="schoolCloudStartSetupButton" class="btn btn-ghost btn-sm" type="button">Set Up School Cloud</button>
      </div>
      <form id="schoolCloudConnectForm" class="school-cloud-admin__form">
        <div class="split-row">
          <div class="field">
            <label class="field-label" for="schoolCloudIdInput">School Cloud ID</label>
            <input id="schoolCloudIdInput" class="field-input" required minlength="8" maxlength="80" autocomplete="off" placeholder="Issued by the school relay" />
          </div>
          <div class="field">
            <label class="field-label" for="schoolCloudEndpointInput">School Cloud Address</label>
            <input id="schoolCloudEndpointInput" class="field-input" required type="url" autocomplete="off" spellcheck="false" placeholder="https://school-name.workers.dev" />
          </div>
        </div>
        <div class="split-row u-mt-3">
          <div class="field">
            <label class="field-label" for="schoolCloudActivationCodeInput">Personnel Activation Code</label>
            <input id="schoolCloudActivationCodeInput" class="field-input" required type="password" minlength="35" maxlength="43" autocomplete="off" spellcheck="false" placeholder="ECR-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" />
          </div>
          <div class="field">
            <label class="field-label" for="schoolCloudDeviceLabelInput">This Desktop Name</label>
            <input id="schoolCloudDeviceLabelInput" class="field-input" required maxlength="80" autocomplete="off" value="Desktop app" />
          </div>
        </div>
        <fieldset class="school-cloud-admin__choice u-mt-3">
          <legend>Existing profile data</legend>
          <label><input type="radio" name="schoolCloudStorageMode" value="cloud-backup" checked /> Migrate this profile to an encrypted School Cloud backup.</label>
          <label><input type="radio" name="schoolCloudStorageMode" value="local-only" /> Keep using the former local and backup-folder methods.</label>
        </fieldset>
        <div class="action-cluster u-mt-3">
          <button class="btn btn-primary btn-sm" type="submit">Activate This Desktop</button>
        </div>
      </form>
    `;
  }

  function setupWizardMarkup() {
    if (state.setupRecovery) {
      const pack = state.setupRecovery;
      const codes = pack.administrators.map(item => `<li><strong>${esc(roleLabels[item.role] || item.role)}:</strong> <code>${esc(item.activationCode)}</code></li>`).join('');
      return `
        <section class="school-cloud-admin__wizard school-cloud-admin__wizard--complete">
          <span class="school-cloud-admin__eyebrow">SETUP COMPLETE</span>
          <h3>Keep the recovery pack safe</h3>
          <p>Your school relay is initialized. The codes below are shown only for this handoff. Download the recovery pack before leaving this screen, then activate this desktop with the ICT Coordinator code.</p>
          <ul class="school-cloud-admin__code-list">${codes}</ul>
          <div class="action-cluster u-mt-3">
            <button id="schoolCloudDownloadRecoveryButton" class="btn btn-primary btn-sm" type="button">Download Recovery Pack</button>
            <button id="schoolCloudUseIctCodeButton" class="btn btn-ghost btn-sm" type="button">Activate ICT Desktop</button>
          </div>
        </section>
      `;
    }
    const suggestedId = state.schoolId || `school_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return `
      <section class="school-cloud-admin__wizard">
        <div class="school-cloud-admin__wizard-heading">
          <div><span class="school-cloud-admin__eyebrow">GUIDED SCHOOL SETUP</span><h3>Create School Cloud</h3></div>
          <button id="schoolCloudCancelSetupButton" class="btn btn-ghost btn-sm" type="button">Back</button>
        </div>
        <ol class="school-cloud-admin__steps"><li>Use the school DepEd email to create or access the school-owned Cloudflare account.</li><li>Enter the one-time setup token from the school deployment handoff. It is used only for this page and is never saved.</li><li>Save the recovery pack and privately deliver the initial codes.</li></ol>
        <button id="schoolCloudOpenCloudflareButton" class="btn btn-ghost btn-sm" type="button">Open Cloudflare Account Setup</button>
        <form id="schoolCloudBootstrapForm" class="school-cloud-admin__form">
          <div class="split-row u-mt-3">
            <div class="field"><label class="field-label" for="schoolCloudBootstrapEndpoint">School Cloud Address</label><input id="schoolCloudBootstrapEndpoint" class="field-input" required type="url" placeholder="https://school-name.workers.dev" /></div>
            <div class="field"><label class="field-label" for="schoolCloudBootstrapToken">One-time setup token</label><input id="schoolCloudBootstrapToken" class="field-input" required type="password" minlength="32" maxlength="512" autocomplete="off" /></div>
          </div>
          <div class="split-row u-mt-2">
            <div class="field"><label class="field-label" for="schoolCloudBootstrapId">School Cloud ID</label><input id="schoolCloudBootstrapId" class="field-input" required value="${esc(suggestedId)}" maxlength="80" /></div>
            <div class="field"><label class="field-label" for="schoolCloudBootstrapName">School name</label><input id="schoolCloudBootstrapName" class="field-input" required maxlength="160" /></div>
          </div>
          <div class="split-row u-mt-2">
            <div class="field"><label class="field-label" for="schoolCloudBootstrapEmail">School DepEd email</label><input id="schoolCloudBootstrapEmail" class="field-input" required type="email" placeholder="114239@deped.gov.ph" /></div>
            <div class="field"><label class="field-label" for="schoolCloudBootstrapIct">ICT Coordinator name</label><input id="schoolCloudBootstrapIct" class="field-input" required maxlength="160" /></div>
          </div>
          <div class="field u-mt-2"><label class="field-label" for="schoolCloudBootstrapHead">School Head name</label><input id="schoolCloudBootstrapHead" class="field-input" required maxlength="160" /></div>
          <p class="school-cloud-admin__hint">A recovery key is generated on this desktop. It is not sent to Cloudflare and will be included only in the downloadable recovery pack.</p>
          <button class="btn btn-primary btn-sm u-mt-3" type="submit">Create School Cloud</button>
        </form>
      </section>
    `;
  }

  function connectionMarkup() {
    const user = state.connection?.user || {};
    const badge = document.getElementById('schoolCloudConnectionBadge');
    if (badge) {
      badge.textContent = state.workspaceActive ? 'Admin workspace active' : 'Connected';
      badge.dataset.tone = state.workspaceActive ? 'success' : 'info';
    }
    return `
      <div class="school-cloud-admin__summary">
        <div><span>Role</span><strong>${esc(roleLabels[user.role] || user.role || 'Unknown')}</strong></div>
        <div><span>School Cloud ID</span><strong>${esc(state.schoolId)}</strong></div>
        <div><span>Device</span><strong>${esc(state.connection.deviceId || 'Protected device')}</strong></div>
        <div><span>Storage</span><strong>${state.connection.storageMode === 'cloud-backup' ? 'Encrypted School Cloud backup' : 'Local and backup-folder only'}</strong></div>
      </div>
      ${isAdmin() ? adminWorkspaceMarkup() : '<p class="school-cloud-admin__notice">Administration tools are available only to the ICT Coordinator, School Admin, and School Head.</p>'}
      <div class="action-cluster school-cloud-admin__footer">
        ${state.connection.storageMode === 'cloud-backup' ? '<button id="schoolCloudBackupButton" class="btn btn-primary btn-sm" type="button">Back Up Now</button><button id="schoolCloudRestoreButton" class="btn btn-ghost btn-sm" type="button">Restore Latest Backup</button>' : ''}
        <button id="schoolCloudRefreshButton" class="btn btn-ghost btn-sm" type="button">Refresh</button>
        <button id="schoolCloudDisconnectButton" class="btn btn-danger btn-sm" type="button">Disconnect This Profile</button>
      </div>
    `;
  }

  function adminWorkspaceMarkup() {
    if (!state.workspaceActive) {
      return `
        <section class="school-cloud-admin__panel">
          <h3>Admin workspace</h3>
          <p class="settings-row__desc">${state.workspaceConflict ? 'This administrator is active on another device.' : 'Activate this device before managing accounts or announcements.'}</p>
          <div class="action-cluster u-mt-2">
            <button id="schoolCloudActivateButton" class="btn btn-primary btn-sm" type="button">Activate This Device</button>
            ${state.workspaceConflict ? '<button id="schoolCloudTakeoverButton" class="btn btn-danger btn-sm" type="button">End Other Session &amp; Continue</button>' : ''}
          </div>
        </section>
      `;
    }

    return `
      <div class="school-cloud-admin__grid">
        <section class="school-cloud-admin__panel">
          <h3>Unlock encrypted content</h3>
          <p class="settings-row__desc">The school content key is held in memory only for this app session and is never sent to Cloudflare.</p>
          <div class="school-cloud-admin__inline">
            <input id="schoolCloudContentKeyInput" class="field-input" type="password" minlength="64" maxlength="64" autocomplete="off" spellcheck="false" placeholder="64-character school content key" />
            <button id="schoolCloudUnlockButton" class="btn btn-ghost btn-sm" type="button">Unlock</button>
            ${state.contentKey ? '<button id="schoolCloudLockButton" class="btn btn-ghost btn-sm" type="button">Lock</button>' : ''}
          </div>
        </section>
        ${role() === 'school-ict' ? teacherManagementMarkup() : ''}
        ${['school-ict', 'school-admin', 'school-head'].includes(role()) ? announcementMarkup() : ''}
        <section class="school-cloud-admin__panel school-cloud-admin__panel--wide">
          <div class="school-cloud-admin__panel-heading">
            <div><h3>Approval queue</h3><p class="settings-row__desc">School Head approval is required; scoped one-use override keys remain auditable.</p></div>
            <button id="schoolCloudApprovalRefreshButton" class="btn btn-ghost btn-sm" type="button">Refresh Queue</button>
          </div>
          <div id="schoolCloudApprovalList">${approvalMarkup()}</div>
        </section>
      </div>
    `;
  }

  function teacherManagementMarkup() {
    return `
      <section class="school-cloud-admin__panel">
        <h3>Issue a personnel activation code</h3>
        <form id="schoolCloudTeacherForm">
          <div class="split-row">
            <div class="field"><label class="field-label" for="schoolCloudTeacherName">Personnel name</label><input id="schoolCloudTeacherName" class="field-input" required maxlength="160" autocomplete="off" /></div>
            <div class="field"><label class="field-label" for="schoolCloudTeacherContact">Optional contact reference</label><input id="schoolCloudTeacherContact" class="field-input" maxlength="254" autocomplete="off" placeholder="For school records only" /></div>
          </div>
          <div class="split-row u-mt-2">
            <div class="field"><label class="field-label" for="schoolCloudTeacherRole">Role</label><select id="schoolCloudTeacherRole" class="field-select"><option value="subject-teacher">Subject Teacher</option><option value="adviser">Class Adviser</option><option value="school-admin">School Admin</option></select></div>
            <div class="field"><label class="field-label" for="schoolCloudTeacherLoad">Teaching load / assignment</label><input id="schoolCloudTeacherLoad" class="field-input" maxlength="500" autocomplete="off" placeholder="Grade, section, and subjects" /></div>
          </div>
          <button class="btn btn-primary btn-sm u-mt-3" type="submit">Send for School Head Approval</button>
        </form>
      </section>
    `;
  }

  function announcementMarkup() {
    return `
      <section class="school-cloud-admin__panel">
        <h3>Create announcement</h3>
        <form id="schoolCloudAnnouncementForm">
          <div class="split-row">
            <div class="field"><label class="field-label" for="schoolCloudAnnouncementTitle">Title</label><input id="schoolCloudAnnouncementTitle" class="field-input" required maxlength="160" autocomplete="off" /></div>
            <div class="field"><label class="field-label" for="schoolCloudAnnouncementPriority">Priority</label><select id="schoolCloudAnnouncementPriority" class="field-select"><option value="normal">Normal</option><option value="important">Important</option><option value="emergency">Emergency</option></select></div>
          </div>
          <div class="field u-mt-2"><label class="field-label" for="schoolCloudAnnouncementMessage">Message</label><textarea id="schoolCloudAnnouncementMessage" class="field-input school-cloud-admin__textarea" required maxlength="5000"></textarea></div>
          <label class="school-cloud-admin__check"><input id="schoolCloudAnnouncementAck" type="checkbox" /> Require acknowledgment</label>
          <button class="btn btn-primary btn-sm u-mt-3" type="submit">${role() === 'school-head' ? 'Publish Announcement' : 'Send for School Head Approval'}</button>
        </form>
      </section>
    `;
  }

  function approvalMarkup() {
    if (!state.approvals.length) return '<p class="school-cloud-admin__empty">No pending requests.</p>';
    return state.approvals.map(item => {
      const content = item.content || {};
      const review = item.contentError
        ? 'Encrypted details could not be opened with this key.'
        : !state.contentKey
          ? 'Unlock the school content key to review this request.'
          : item.requestType === 'announcement'
            ? `${content.title || 'Announcement'} - ${content.message || ''}`
            : `${content.displayName || 'Teacher'} - ${content.email || ''} - ${roleLabels[content.role] || content.role || ''}`;
      return `
      <article class="school-cloud-admin__approval" data-approval-id="${esc(item.id)}">
        <div>
          <strong>${esc(item.actionCode || item.requestType)}</strong>
          <span>${esc(item.requestType)} · requested ${esc(new Date(item.requestedAt).toLocaleString())}</span>
          <p class="school-cloud-admin__review">${esc(review)}</p>
        </div>
        <div class="action-cluster">
          ${role() === 'school-head' && state.contentKey && !item.contentError ? `
            <button class="btn btn-primary btn-sm" type="button" data-approval-decision="approved">Approve</button>
            <button class="btn btn-danger btn-sm" type="button" data-approval-decision="rejected">Reject</button>
            <button class="btn btn-ghost btn-sm" type="button" data-approval-grant>Generate One-Use Key</button>
          ` : role() !== 'school-head' && state.contentKey && !item.contentError ? `
            <button class="btn btn-ghost btn-sm" type="button" data-approval-override>Use School Head Key</button>
          ` : ''}
        </div>
      </article>
    `;
    }).join('');
  }

  function render() {
    const body = document.getElementById('schoolCloudAdminBody');
    if (!body) return;
    body.innerHTML = state.connection ? connectionMarkup() : setupMarkup();
    bindEvents();
  }

  async function refreshApprovals() {
    if (!state.workspaceActive) return;
    const result = await client().listApprovals(state.schoolId);
    state.approvals = result.approvals || [];
    if (state.contentKey) {
      for (const approval of state.approvals) {
        try {
          approval.content = await client().decryptEnvelope(approval.envelope, state.contentKey);
        } catch (_error) {
          approval.contentError = true;
        }
      }
    }
    const target = document.getElementById('schoolCloudApprovalList');
    if (target) {
      target.innerHTML = approvalMarkup();
      bindApprovalEvents();
    }
  }

  async function activateWorkspace(takeover) {
    try {
      await client().activateAdminSession(state.schoolId, { takeover });
      state.workspaceActive = true;
      state.workspaceConflict = null;
      render();
      await refreshApprovals();
      notify('This device now holds the active administration workspace.', 'success');
    } catch (error) {
      state.workspaceActive = false;
      state.workspaceConflict = error.code === 'ADMIN_SESSION_ACTIVE' ? error.details || true : null;
      render();
      notify(error.message, error.code === 'ADMIN_SESSION_ACTIVE' ? 'warning' : 'error');
    }
  }

  async function connect(event) {
    event.preventDefault();
    const schoolId = document.getElementById('schoolCloudIdInput').value.trim();
    const endpoint = document.getElementById('schoolCloudEndpointInput').value.trim();
    const activationCode = document.getElementById('schoolCloudActivationCodeInput').value.trim();
    const deviceLabel = document.getElementById('schoolCloudDeviceLabelInput').value.trim();
    const storageMode = document.querySelector('input[name="schoolCloudStorageMode"]:checked')?.value || 'cloud-backup';
    try {
      state.loading = true;
      notify('Verifying the protected school connection…');
      state.schoolId = schoolId;
      state.connection = await client().activate(schoolId, { endpoint, activationCode, deviceLabel, storageMode });
      document.getElementById('schoolCloudActivationCodeInput').value = '';
      if (storageMode === 'cloud-backup') {
        const database = typeof globalScope.getActiveProfileDatabase === 'function'
          ? globalScope.getActiveProfileDatabase() : globalScope.db;
        if (database) await client().backupProfile(schoolId, database);
      }
      render();
      if (isAdmin()) await activateWorkspace(false);
      else notify(storageMode === 'cloud-backup'
        ? 'Desktop activated and the encrypted profile backup was created.'
        : 'Desktop activated. This profile will keep using local and backup-folder storage.', 'success');
    } catch (error) {
      try { await client().disconnect(schoolId); } catch (_disconnectError) {}
      notify(error.message, 'error');
    } finally {
      state.loading = false;
    }
  }

  function newRecoveryKey() {
    const bytes = new Uint8Array(32);
    if (globalScope.crypto?.getRandomValues) globalScope.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function bootstrapSchool(event) {
    event.preventDefault();
    const contentKey = newRecoveryKey();
    const setup = {
      endpoint: document.getElementById('schoolCloudBootstrapEndpoint').value.trim(),
      installToken: document.getElementById('schoolCloudBootstrapToken').value.trim(),
      schoolId: document.getElementById('schoolCloudBootstrapId').value.trim(),
      schoolName: document.getElementById('schoolCloudBootstrapName').value.trim(),
      schoolEmail: document.getElementById('schoolCloudBootstrapEmail').value.trim(),
      ictName: document.getElementById('schoolCloudBootstrapIct').value.trim(),
      headName: document.getElementById('schoolCloudBootstrapHead').value.trim(),
      contentKey
    };
    try {
      notify('Creating the protected school workspace…');
      const result = await client().bootstrap(setup);
      state.schoolId = result.schoolId;
      state.setupRecovery = { ...result, contentKey, createdAt: new Date().toISOString() };
      document.getElementById('schoolCloudBootstrapToken').value = '';
      render();
      notify('School Cloud was created. Download the recovery pack before continuing.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function downloadRecoveryPack() {
    const pack = state.setupRecovery;
    if (!pack) return;
    if (typeof globalScope.electronAPI?.exportJson !== 'function') {
      return notify('Recovery-pack export is unavailable in this desktop build.', 'error');
    }
    const result = await globalScope.electronAPI.exportJson(JSON.stringify({
      type: 'eclassrecord-school-cloud-recovery-pack', version: 1,
      schoolId: pack.schoolId, endpoint: pack.endpoint, contentKey: pack.contentKey,
      createdAt: pack.createdAt, initialAdministrators: pack.administrators
    }, null, 2), `school-cloud-recovery-${pack.schoolId}.json`);
    if (result?.canceled) return;
    notify('Recovery pack saved. Keep it offline and give School Head recovery access.', 'success');
  }

  async function unlockContentKey() {
    const input = document.getElementById('schoolCloudContentKeyInput');
    const value = input?.value.trim() || '';
    if (!/^[a-fA-F0-9]{64}$/.test(value)) {
      notify('Enter the complete 64-character school content key.', 'error');
      return;
    }
    state.contentKey = value;
    input.value = '';
    render();
    await refreshApprovals();
    notify('Encrypted content is unlocked for this app session only.', 'success');
  }

  async function submitTeacher(event) {
    event.preventDefault();
    if (!state.contentKey) return notify('Unlock the school content key first.', 'warning');
    await client().submitPersonnelChange(state.schoolId, role(), {
      actionCode: 'personnel-create',
      payload: {
        contactReference: document.getElementById('schoolCloudTeacherContact').value.trim(),
        displayName: document.getElementById('schoolCloudTeacherName').value.trim(),
        role: document.getElementById('schoolCloudTeacherRole').value,
        teachingLoad: document.getElementById('schoolCloudTeacherLoad').value.trim()
      }
    }, state.contentKey);
    event.currentTarget.reset();
    await refreshApprovals();
    notify('Personnel-code request sent to the School Head.', 'success');
  }

  async function submitAnnouncement(event) {
    event.preventDefault();
    if (!state.contentKey) return notify('Unlock the school content key first.', 'warning');
    const result = await client().createAnnouncement(state.schoolId, role(), {
      title: document.getElementById('schoolCloudAnnouncementTitle').value.trim(),
      message: document.getElementById('schoolCloudAnnouncementMessage').value.trim(),
      priority: document.getElementById('schoolCloudAnnouncementPriority').value,
      requiresAck: document.getElementById('schoolCloudAnnouncementAck').checked
    }, state.contentKey);
    event.currentTarget.reset();
    await refreshApprovals();
    notify(result.approval ? 'Announcement sent to the School Head for approval.' : 'Announcement published.', 'success');
  }

  function bindApprovalEvents() {
    document.querySelectorAll('[data-approval-decision]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.closest('[data-approval-id]')?.dataset.approvalId;
        try {
          const result = await client().decideApproval(state.schoolId, role(), id, button.dataset.approvalDecision, '', state.contentKey);
          if (result.approval?.personnelCode) {
            globalScope.prompt?.(
              'Personnel profile approved. Copy this permanent activation code and deliver it privately. It is valid across school years.',
              result.approval.personnelCode
            );
          }
          await refreshApprovals();
          notify(`Request ${button.dataset.approvalDecision}.`, 'success');
        } catch (error) { notify(error.message, 'error'); }
      });
    });
    document.querySelectorAll('[data-approval-grant]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.closest('[data-approval-id]')?.dataset.approvalId;
        try {
          const result = await client().createOverrideGrant(state.schoolId, role(), {
            scope: 'specific-request',
            requestId: id,
            expiresMinutes: 30
          });
          globalScope.prompt?.('Copy this one-use key and deliver it privately. It will not be shown again.', result.grant.code);
          notify('A scoped one-use key was generated and recorded in the audit trail.', 'success');
        } catch (error) { notify(error.message, 'error'); }
      });
    });
    document.querySelectorAll('[data-approval-override]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.closest('[data-approval-id]')?.dataset.approvalId;
        const code = globalScope.prompt?.('Enter the one-use key provided by the School Head:') || '';
        if (!code) return;
        const reason = globalScope.prompt?.('Enter the reason for bypassing normal approval:') || '';
        if (!reason) return notify('An override reason is required.', 'warning');
        try {
          const result = await client().applyOverride(state.schoolId, role(), id, code, reason, state.contentKey);
          if (result.approval?.personnelCode) {
            globalScope.prompt?.(
              'Copy this permanent personnel activation code and deliver it privately. It is valid across school years.',
              result.approval.personnelCode
            );
          }
          await refreshApprovals();
          notify('Override applied. The School Head notification is required and the action is audited.', 'success');
        } catch (error) { notify(error.message, 'error'); }
      });
    });
  }

  function bindEvents() {
    document.getElementById('schoolCloudConnectForm')?.addEventListener('submit', connect);
    document.getElementById('schoolCloudStartSetupButton')?.addEventListener('click', () => {
      state.setupWizard = true;
      render();
    });
    document.getElementById('schoolCloudCancelSetupButton')?.addEventListener('click', () => {
      state.setupWizard = false;
      render();
    });
    document.getElementById('schoolCloudOpenCloudflareButton')?.addEventListener('click', () => {
      globalScope.open?.('https://dash.cloudflare.com/sign-up', '_blank', 'noopener');
    });
    document.getElementById('schoolCloudBootstrapForm')?.addEventListener('submit', bootstrapSchool);
    document.getElementById('schoolCloudDownloadRecoveryButton')?.addEventListener('click', () => {
      downloadRecoveryPack().catch(error => notify(error.message, 'error'));
    });
    document.getElementById('schoolCloudUseIctCodeButton')?.addEventListener('click', () => {
      state.setupRecovery = null;
      state.setupWizard = false;
      render();
      notify('Enter the ICT Coordinator activation code to activate this desktop.');
    });
    document.getElementById('schoolCloudActivateButton')?.addEventListener('click', () => activateWorkspace(false));
    document.getElementById('schoolCloudTakeoverButton')?.addEventListener('click', () => activateWorkspace(true));
    document.getElementById('schoolCloudUnlockButton')?.addEventListener('click', unlockContentKey);
    document.getElementById('schoolCloudLockButton')?.addEventListener('click', () => {
      state.contentKey = '';
      render();
      notify('Encrypted content key removed from memory.', 'success');
    });
    document.getElementById('schoolCloudTeacherForm')?.addEventListener('submit', event => {
      submitTeacher(event).catch(error => notify(error.message, 'error'));
    });
    document.getElementById('schoolCloudAnnouncementForm')?.addEventListener('submit', event => {
      submitAnnouncement(event).catch(error => notify(error.message, 'error'));
    });
    document.getElementById('schoolCloudApprovalRefreshButton')?.addEventListener('click', () => {
      refreshApprovals().catch(error => notify(error.message, 'error'));
    });
    document.getElementById('schoolCloudRefreshButton')?.addEventListener('click', () => {
      loadConnection().catch(error => notify(error.message, 'error'));
    });
    document.getElementById('schoolCloudBackupButton')?.addEventListener('click', async () => {
      try {
        const database = typeof globalScope.getActiveProfileDatabase === 'function'
          ? globalScope.getActiveProfileDatabase() : globalScope.db;
        if (!database) throw new Error('Open a profile before backing it up.');
        await client().backupProfile(state.schoolId, database);
        await loadConnection();
        notify('Encrypted School Cloud backup created.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    });
    document.getElementById('schoolCloudRestoreButton')?.addEventListener('click', async () => {
      try {
        if (!globalScope.confirm?.('Replace this open local profile with the latest encrypted School Cloud backup?')) return;
        const restored = await client().restoreProfile(state.schoolId);
        if (typeof globalScope.replaceActiveProfileDatabase !== 'function' || typeof globalScope.saveDatabase !== 'function') {
          throw new Error('Profile restore is unavailable in this desktop build.');
        }
        globalScope.replaceActiveProfileDatabase(restored.database);
        await globalScope.saveDatabase();
        notify('Latest backup restored. Reopen the profile to use the restored data.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    });
    document.getElementById('schoolCloudDisconnectButton')?.addEventListener('click', async () => {
      await client().disconnect(state.schoolId);
      state.schoolId = '';
      state.connection = null;
      state.contentKey = '';
      state.workspaceActive = false;
      state.approvals = [];
      const badge = document.getElementById('schoolCloudConnectionBadge');
      if (badge) badge.textContent = 'Not connected';
      render();
      notify('School Cloud profile disconnected from this device.', 'success');
    });
    bindApprovalEvents();
  }

  async function loadConnection() {
    const connections = await client().connections();
    if (!connections.length) {
      state.connection = null;
      render();
      notify('No protected School Cloud profile is connected.');
      return;
    }
    const connection = connections[0];
    state.schoolId = connection.schoolId;
    state.connection = connection;
    render();
    try {
      const identity = await client().request(state.schoolId, 'GET', '/v1/me');
      state.connection.user = identity.user;
      render();
      if (isAdmin()) await activateWorkspace(false);
      else notify('School Cloud connection is ready.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  async function init() {
    try {
      const feature = await client().featureStatus();
      if (!feature?.enabled) return;
      state.enabled = true;
      const existingGradeCard = document.getElementById('cloudGradeStatus')?.closest('.card');
      if (!existingGradeCard || document.getElementById('schoolCloudAdminCard')) return;
      const card = document.createElement('div');
      card.id = 'schoolCloudAdminCard';
      card.className = 'card school-cloud-admin';
      card.innerHTML = cardMarkup();
      existingGradeCard.insertAdjacentElement('afterend', card);
      await loadConnection();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  globalScope.addEventListener?.('beforeunload', () => {
    state.contentKey = '';
    client().stopAdminHeartbeat();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  globalScope.SchoolCloudUi = { init, state };
})(typeof window !== 'undefined' ? window : globalThis);
