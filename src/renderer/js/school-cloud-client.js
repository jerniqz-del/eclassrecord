(function initializeSchoolCloudClient(globalScope) {
  'use strict';

  const ADMIN_ROLES = new Set(['school-ict', 'school-admin', 'school-head']);
  const HEAD_APPROVAL_TYPES = new Set(['personnel-management', 'announcement']);
  let heartbeatTimer = null;

  function requireApi() {
    const api = globalScope.electronAPI;
    if (!api?.requestSchoolCloud || !api?.getSchoolCloudFeatureStatus) {
      throw new Error('School Cloud is unavailable in this desktop build.');
    }
    return api;
  }

  function requireSchoolId(value) {
    const id = String(value || '').trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error('A valid School Cloud ID is required.');
    return id;
  }

  function requireRole(role, allowed) {
    if (!allowed.includes(role)) throw new Error('This School Cloud role cannot perform that action.');
  }

  async function encryptEnvelope(value, contentKey, purpose) {
    if (typeof globalScope.encryptPayload !== 'function') throw new Error('Secure payload encryption is unavailable.');
    const key = String(contentKey || '');
    if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('Unlock the school encryption key before continuing.');
    return globalScope.encryptPayload(JSON.stringify(value), key, { purpose });
  }

  async function decryptEnvelope(envelope, contentKey) {
    if (typeof globalScope.decryptPayload !== 'function') throw new Error('Secure payload decryption is unavailable.');
    return JSON.parse(await globalScope.decryptPayload(envelope, String(contentKey || '')));
  }

  async function featureStatus() {
    return requireApi().getSchoolCloudFeatureStatus();
  }

  async function configure(schoolId, connection) {
    return requireApi().configureSchoolCloud(requireSchoolId(schoolId), connection);
  }

  async function activate(schoolId, connection) {
    return requireApi().activateSchoolCloud(requireSchoolId(schoolId), connection);
  }

  async function bootstrap(setup) {
    const api = requireApi();
    if (typeof api.bootstrapSchoolCloud !== 'function') throw new Error('The School Cloud setup wizard is unavailable in this desktop build.');
    return api.bootstrapSchoolCloud(setup);
  }

  async function status(schoolId) {
    return requireApi().getSchoolCloudStatus(requireSchoolId(schoolId));
  }

  async function connections() {
    const api = requireApi();
    if (typeof api.listSchoolCloudConnections !== 'function') return [];
    return api.listSchoolCloudConnections();
  }

  async function disconnect(schoolId) {
    stopAdminHeartbeat();
    return requireApi().disconnectSchoolCloud(requireSchoolId(schoolId));
  }

  async function request(schoolId, method, path, body) {
    const result = await requireApi().requestSchoolCloud(requireSchoolId(schoolId), { method, path, body });
    if (!result?.ok) {
      const error = new Error(result?.body?.message || 'School Cloud request failed.');
      error.code = result?.body?.error || 'SCHOOL_CLOUD_ERROR';
      error.status = result?.status || 500;
      error.details = result?.body?.details;
      throw error;
    }
    return result.body;
  }

  async function activateAdminSession(schoolId, options = {}) {
    const result = await request(schoolId, 'POST', '/v1/admin-session/activate', {
      takeover: Boolean(options.takeover)
    });
    startAdminHeartbeat(schoolId);
    return result;
  }

  function startAdminHeartbeat(schoolId, intervalMs = 60_000) {
    stopAdminHeartbeat();
    const id = requireSchoolId(schoolId);
    heartbeatTimer = globalScope.setInterval(async () => {
      try {
        await request(id, 'POST', '/v1/admin-session/heartbeat');
      } catch (error) {
        stopAdminHeartbeat();
        globalScope.dispatchEvent?.(new CustomEvent('school-cloud-admin-session-lost', { detail: {
          code: error.code,
          message: error.message
        } }));
      }
    }, Math.max(30_000, Number(intervalMs) || 60_000));
  }

  function stopAdminHeartbeat() {
    if (heartbeatTimer !== null) globalScope.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function submitPersonnelChange(schoolId, role, change, contentKey) {
    requireRole(role, ['school-ict']);
    const envelope = await encryptEnvelope(change.payload, contentKey, 'school-cloud-personnel-management');
    return request(schoolId, 'POST', '/v1/personnel-changes', {
      actionCode: change.actionCode,
      targetUserId: change.targetUserId || '',
      requestedRole: change.actionCode === 'personnel-create' ? String(change.payload?.role || '') : '',
      expiresHours: change.expiresHours || 48,
      envelope
    });
  }

  async function backupProfile(schoolId, database) {
    return requireApi().backupSchoolCloudProfile(requireSchoolId(schoolId), database);
  }

  async function restoreProfile(schoolId) {
    return requireApi().restoreSchoolCloudProfile(requireSchoolId(schoolId));
  }

  async function createAnnouncement(schoolId, role, announcement, contentKey) {
    requireRole(role, ['school-ict', 'school-admin', 'school-head']);
    const envelope = await encryptEnvelope({
      title: String(announcement.title || '').trim(),
      message: String(announcement.message || '').trim(),
      attachmentRefs: Array.isArray(announcement.attachmentRefs) ? announcement.attachmentRefs : []
    }, contentKey, 'school-cloud-announcement');
    if (!String(announcement.title || '').trim() || !String(announcement.message || '').trim()) {
      throw new Error('Announcement title and message are required.');
    }
    return request(schoolId, 'POST', '/v1/announcements', {
      priority: announcement.priority || 'normal',
      audienceType: announcement.audienceType || 'all',
      audienceRole: announcement.audienceRole || '',
      recipientUserIds: announcement.recipientUserIds || [],
      publishAt: announcement.publishAt || null,
      expiresAt: announcement.expiresAt || null,
      requiresAck: Boolean(announcement.requiresAck),
      approvalExpiresHours: announcement.approvalExpiresHours || 48,
      envelope
    });
  }

  async function listAnnouncements(schoolId, contentKey) {
    const result = await request(schoolId, 'GET', '/v1/announcements');
    const announcements = [];
    for (const item of result.announcements || []) {
      announcements.push({ ...item, content: await decryptEnvelope(item.envelope, contentKey) });
    }
    return announcements;
  }

  async function acknowledgeAnnouncement(schoolId, announcementId) {
    return request(schoolId, 'POST', `/v1/announcements/${encodeURIComponent(announcementId)}/acknowledge`);
  }

  async function listApprovals(schoolId, statusValue = 'pending') {
    return request(schoolId, 'GET', `/v1/approvals?status=${encodeURIComponent(statusValue)}`);
  }

  async function decideApproval(schoolId, role, approvalId, decision, note, contentKey) {
    requireRole(role, ['school-head']);
    const noteEnvelope = note ? await encryptEnvelope({ note }, contentKey, 'school-cloud-approval-note') : undefined;
    return request(schoolId, 'POST', `/v1/approvals/${encodeURIComponent(approvalId)}/decision`, {
      decision,
      noteEnvelope
    });
  }

  async function createOverrideGrant(schoolId, role, options = {}) {
    requireRole(role, ['school-head']);
    if (!HEAD_APPROVAL_TYPES.has(options.scope) && options.scope !== 'specific-request') {
      throw new Error('Override scope is invalid.');
    }
    return request(schoolId, 'POST', '/v1/override-grants', {
      scope: options.scope,
      requestId: options.requestId || '',
      expiresMinutes: options.expiresMinutes || 30
    });
  }

  async function applyOverride(schoolId, role, approvalId, code, reason, contentKey) {
    requireRole(role, ['school-ict', 'school-admin']);
    if (!String(reason || '').trim()) throw new Error('An override reason is required.');
    const reasonEnvelope = await encryptEnvelope({ reason: String(reason).trim() }, contentKey, 'school-cloud-override-reason');
    return request(schoolId, 'POST', `/v1/approvals/${encodeURIComponent(approvalId)}/override`, {
      code: String(code || '').trim(),
      reasonEnvelope
    });
  }

  async function notificationSummary(schoolId) {
    return request(schoolId, 'GET', '/v1/notifications/summary');
  }

  const api = {
    ADMIN_ROLES,
    acknowledgeAnnouncement,
    activate,
    activateAdminSession,
    applyOverride,
    bootstrap,
    configure,
    connections,
    createAnnouncement,
    createOverrideGrant,
    decideApproval,
    decryptEnvelope,
    disconnect,
    encryptEnvelope,
    featureStatus,
    listAnnouncements,
    listApprovals,
    notificationSummary,
    request,
    backupProfile,
    restoreProfile,
    startAdminHeartbeat,
    status,
    stopAdminHeartbeat,
    submitPersonnelChange
  };

  globalScope.SchoolCloudClient = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
