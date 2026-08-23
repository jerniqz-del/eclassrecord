const MAX_BODY_BYTES = 12_000_000;
const MAX_ENVELOPE_BYTES = 10_000_000;
const ADMIN_ROLES = new Set(['school-ict', 'school-admin', 'school-head']);
const ROLES = new Set(['subject-teacher', 'adviser', ...ADMIN_ROLES]);
const PERSONNEL_ACTIONS = new Set([
  'personnel-create', 'personnel-update', 'personnel-suspend', 'personnel-restore',
  'personnel-transfer', 'teaching-load-change', 'personnel-code-rotate',
  'personnel-device-reset', 'personnel-data-delete'
]);
const ANNOUNCEMENT_PRIORITIES = new Set(['normal', 'important', 'emergency']);
const ENVELOPE_ALGORITHMS = new Set(['AES-256-GCM', 'ECDH-P256/AES-256-GCM']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '86400'
};

class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function nowIso() {
  return new Date().toISOString();
}

function isoAfterSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isoAfterDays(days) {
  return isoAfterSeconds(days * 86400);
}

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = clean(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'Enter a valid institutional email address.');
  }
  return email;
}

function normalizeRole(value) {
  const role = clean(value, 40).toLowerCase();
  if (!ROLES.has(role)) throw new HttpError(400, 'INVALID_ROLE', 'The requested role is not supported.');
  return role;
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

function adminLeaseDecision(existing, current, takeover, at = nowIso()) {
  if (!existing || existing.expires_at <= at || existing.session_id === current.session_id) {
    return { allowed: true, takeover: false };
  }
  if (!takeover) {
    return {
      allowed: false,
      takeover: false,
      activeDeviceId: existing.device_id,
      expiresAt: existing.expires_at
    };
  }
  return { allowed: true, takeover: true, previousDeviceId: existing.device_id };
}

function can(role, capability) {
  if (role === 'school-head') return true;
  const grants = {
    'school-ict': new Set([
      'personnel.manage', 'announcement.submit', 'announcement.read', 'override.use',
      'deployment.manage', 'device.manage', 'audit.read'
    ]),
    'school-admin': new Set(['announcement.submit', 'announcement.read', 'override.use', 'audit.read']),
    adviser: new Set(['announcement.read']),
    'subject-teacher': new Set(['announcement.read'])
  };
  return Boolean(grants[role]?.has(capability));
}

function randomId() {
  return crypto.randomUUID();
}

function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeActivationCode(value) {
  const code = clean(value, 80).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^ECR[A-F0-9]{32}$/.test(code)) {
    throw new HttpError(401, 'ACTIVATION_CODE_INVALID', 'The personnel activation code is invalid.');
  }
  return code;
}

function createPersonnelCode() {
  const raw = `ECR${randomToken(16).toUpperCase()}`;
  return [raw.slice(0, 3), ...raw.slice(3).match(/.{1,4}/g)].join('-');
}

async function personnelCodeHash(env, schoolId, value) {
  const secret = env.SCHOOL_AUTH_SECRET || env.IDENTITY_HMAC_SECRET;
  return hmacSha256(secret, `${schoolId}|${normalizeActivationCode(value)}`);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret, value) {
  if (clean(secret, 4096).length < 32) {
    throw new HttpError(503, 'IDENTITY_SECRET_MISSING', 'The school identity secret is not configured.');
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
  }
  try {
    return JSON.parse(text || '{}');
  } catch (_error) {
    throw new HttpError(400, 'INVALID_JSON', 'Request must contain valid JSON.');
  }
}

function bearer(request) {
  return String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function requireInstallToken(request, env) {
  if (!env.INSTALL_TOKEN || bearer(request) !== env.INSTALL_TOKEN) {
    throw new HttpError(401, 'INSTALL_UNAUTHORIZED', 'The guided setup authorization is invalid.');
  }
}

function validatePublicKey(value, purpose) {
  if (!value || value.kty !== 'EC' || value.crv !== 'P-256' || !value.x || !value.y) {
    throw new HttpError(400, 'INVALID_DEVICE_KEY', `A valid P-256 ${purpose} key is required.`);
  }
  return JSON.stringify(value);
}

function validateEnvelope(value) {
  if (!value || !ENVELOPE_ALGORITHMS.has(value.algorithm) || !clean(value.iv, 256)
    || !clean(value.ciphertext, MAX_ENVELOPE_BYTES * 2)) {
    throw new HttpError(400, 'INVALID_ENVELOPE', 'The encrypted payload envelope is invalid.');
  }
  if (value.wrappedKeys && (!Array.isArray(value.wrappedKeys) || value.wrappedKeys.length > 1000)) {
    throw new HttpError(400, 'INVALID_ENVELOPE', 'The encrypted payload has too many key envelopes.');
  }
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_ENVELOPE_BYTES) {
    throw new HttpError(413, 'ENVELOPE_TOO_LARGE', 'The encrypted payload exceeds the relay limit.');
  }
  return serialized;
}

async function verifyDeviceSignature(env, user, payload, signature) {
  let publicKey;
  let signatureBytes;
  try {
    const device = await env.DB.prepare(`SELECT public_signing_key_json FROM devices
      WHERE id = ? AND user_id = ? AND school_id = ? AND status = 'approved'`)
      .bind(user.device_id, user.id, user.school_id).first();
    if (!device) throw new Error('Device was not found.');
    publicKey = await crypto.subtle.importKey('jwk', JSON.parse(device.public_signing_key_json),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const binary = atob(signature);
    signatureBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (signatureBytes.byteLength !== 64) throw new Error('Signature encoding is invalid.');
  } catch (_error) {
    throw new HttpError(400, 'BACKUP_SIGNATURE_INVALID', 'The backup signature is invalid.');
  }
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey, signatureBytes,
    new TextEncoder().encode(payload)
  );
  if (!verified) throw new HttpError(401, 'BACKUP_SIGNATURE_INVALID',
    'The backup was not signed by this activated device.');
}

function normalizeIso(value, fieldName) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpError(400, 'INVALID_DATE', `${fieldName} is not a valid date and time.`);
  }
  return parsed.toISOString();
}

function publicUser(row) {
  return {
    id: row.id,
    schoolId: row.school_id,
    role: row.role,
    status: row.status
  };
}

function resultChanges(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

async function appendAudit(env, context, actionCode, targetType = '', targetId = '', encryptedDetail = null) {
  const createdAt = nowIso();
  const previous = await env.DB.prepare(
    'SELECT entry_hash FROM audit_logs WHERE school_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
  ).bind(context.schoolId).first();
  const previousHash = previous?.entry_hash || 'GENESIS';
  const encryptedDetailJson = encryptedDetail ? validateEnvelope(encryptedDetail) : null;
  const id = randomId();
  const material = [
    previousHash, id, context.schoolId, context.userId || '', context.deviceId || '',
    actionCode, targetType, targetId, encryptedDetailJson || '', createdAt
  ].join('|');
  const entryHash = await sha256(material);
  await env.DB.prepare(`INSERT INTO audit_logs
    (id, school_id, actor_user_id, actor_device_id, action_code, target_type, target_id,
     encrypted_detail_json, previous_hash, entry_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, context.schoolId, context.userId || null, context.deviceId || null, actionCode,
      clean(targetType, 60) || null, clean(targetId, 100) || null, encryptedDetailJson,
      previousHash, entryHash, createdAt).run();
  return { id, entryHash };
}

async function issueSession(env, user, device) {
  const token = randomToken();
  const id = randomId();
  const createdAt = nowIso();
  const sessionDays = Math.min(30, Math.max(1, Number(env.SESSION_DAYS) || 14));
  const expiresAt = isoAfterDays(sessionDays);
  await env.DB.prepare(`INSERT INTO sessions
    (id, school_id, user_id, device_id, token_hash, expires_at, last_used_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.school_id, user.id, device.id, await sha256(token), expiresAt, createdAt, createdAt).run();
  return { id, token, expiresAt };
}

async function recordActivationAttempt(env, schoolId, fingerprint, deviceId, platform, outcome) {
  await env.DB.prepare(`INSERT INTO activation_attempts
    (id, school_id, code_fingerprint, device_id, platform, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(randomId(), schoolId, fingerprint, deviceId || null, platform || null, outcome, nowIso()).run();
}

async function enforceActivationRateLimit(env, schoolId, fingerprint, deviceId, platform) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM activation_attempts
    WHERE school_id = ? AND code_fingerprint = ? AND outcome IN ('rejected', 'blocked')
      AND created_at >= ?`).bind(schoolId, fingerprint, since).first();
  if (Number(row?.count || 0) >= 5) {
    await recordActivationAttempt(env, schoolId, fingerprint, deviceId, platform, 'blocked');
    throw new HttpError(429, 'ACTIVATION_TEMPORARILY_BLOCKED',
      'Too many unsuccessful attempts. Wait 15 minutes before trying again.');
  }
}

async function activateWithPersonnelCode(request, env) {
  const body = await readJson(request);
  const schoolId = clean(body.schoolId, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(schoolId)) {
    throw new HttpError(400, 'SCHOOL_ID_INVALID', 'A valid School Cloud ID is required.');
  }
  const deviceId = clean(body.deviceId, 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId)) {
    throw new HttpError(400, 'DEVICE_ID_INVALID', 'A valid device identifier is required.');
  }
  const platform = clean(body.platform, 20).toLowerCase();
  if (!['desktop', 'android'].includes(platform)) {
    throw new HttpError(400, 'INVALID_PLATFORM', 'Device platform must be desktop or android.');
  }
  const normalizedCode = normalizeActivationCode(body.activationCode);
  const fingerprint = (await sha256(normalizedCode)).slice(0, 32);
  await enforceActivationRateLimit(env, schoolId, fingerprint, deviceId, platform);
  const codeHash = await personnelCodeHash(env, schoolId, normalizedCode);
  const user = await env.DB.prepare(`SELECT * FROM users
    WHERE school_id = ? AND personnel_code_hash = ?`).bind(schoolId, codeHash).first();
  if (!user || !['pending', 'active'].includes(user.status)) {
    await recordActivationAttempt(env, schoolId, fingerprint, deviceId, platform, 'rejected');
    throw new HttpError(401, 'ACTIVATION_CODE_INVALID',
      'The personnel activation code is invalid or the profile is unavailable.');
  }
  const labelEnvelope = validateEnvelope(body.deviceLabelEnvelope);
  const encryptionKey = validatePublicKey(body.publicEncryptionKey, 'encryption');
  const signingKey = validatePublicKey(body.publicSigningKey, 'signing');
  let device = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(deviceId).first();
  if (device && (device.user_id !== user.id || device.school_id !== user.school_id)) {
    throw new HttpError(409, 'DEVICE_ID_IN_USE', 'This device identifier is already registered.');
  }
  if (device?.status === 'revoked') throw new HttpError(403, 'DEVICE_REVOKED', 'This device has been revoked.');

  if (!device) {
    const slotRows = await env.DB.prepare(`SELECT platform_slot FROM devices
      WHERE user_id = ? AND platform = ? AND status != 'revoked' ORDER BY platform_slot`)
      .bind(user.id, platform).all();
    const usedSlots = new Set((slotRows.results || []).map(row => Number(row.platform_slot)));
    const platformSlot = [1, 2].find(slot => !usedSlots.has(slot));
    if (!platformSlot) {
      await recordActivationAttempt(env, schoolId, fingerprint, deviceId, platform, 'limited');
      throw new HttpError(409, 'DEVICE_LIMIT_REACHED',
        `This personnel profile already has two active ${platform} devices.`, {
          platform,
          limit: 2
        });
    }
    const createdAt = nowIso();
    try {
      await env.DB.prepare(`INSERT INTO devices
        (id, school_id, user_id, label_ciphertext, platform, platform_slot,
         public_encryption_key_json, public_signing_key_json, status,
         approved_by_user_id, approved_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`)
        .bind(deviceId, user.school_id, user.id, labelEnvelope, platform, platformSlot,
          encryptionKey, signingKey, user.id, createdAt, createdAt).run();
    } catch (_error) {
      throw new HttpError(409, 'DEVICE_SLOT_CONFLICT',
        'Another installation claimed this device slot. Try again.');
    }
    device = {
      id: deviceId,
      user_id: user.id,
      school_id: user.school_id,
      status: 'approved',
      platform,
      platform_slot: platformSlot
    };
  }

  const activatedAt = nowIso();
  await env.DB.prepare(`UPDATE users SET status = 'active',
    activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?`)
    .bind(activatedAt, activatedAt, user.id).run();
  const activeUser = { ...user, status: 'active' };
  const session = await issueSession(env, activeUser, device);
  await recordActivationAttempt(env, schoolId, fingerprint, deviceId, platform, 'accepted');
  await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId },
    'PERSONNEL_CODE_ACTIVATED', 'device', deviceId);
  const counts = await env.DB.prepare(`SELECT platform, COUNT(*) AS count FROM devices
    WHERE user_id = ? AND status = 'approved' GROUP BY platform`).bind(user.id).all();
  const deviceCounts = { desktop: 0, android: 0 };
  for (const item of counts.results || []) deviceCounts[item.platform] = Number(item.count || 0);
  return json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: publicUser(activeUser),
    device: {
      id: device.id,
      platform: device.platform || platform,
      slot: Number(device.platform_slot),
      status: device.status
    },
    deviceLimits: { desktop: 2, android: 2 },
    deviceCounts
  }, 201);
}

async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  const row = await env.DB.prepare(`SELECT
      s.id AS session_id, s.device_id, s.expires_at AS session_expires_at,
      u.id, u.school_id, u.role, u.status, d.status AS device_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN devices d ON d.id = s.device_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND u.status = 'active' AND d.status = 'approved'`)
    .bind(await sha256(token), nowIso()).first();
  if (!row) throw new HttpError(401, 'SESSION_INVALID', 'This session is expired, revoked, or unapproved.');
  const seenAt = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?').bind(seenAt, row.session_id),
    env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(seenAt, row.device_id)
  ]);
  return row;
}

function requireCapability(user, capability) {
  if (!can(user.role, capability)) throw new HttpError(403, 'FORBIDDEN', 'This account cannot perform that action.');
}

async function requireActiveAdminLease(env, user) {
  if (!isAdminRole(user.role)) throw new HttpError(403, 'ADMIN_REQUIRED', 'An administrator account is required.');
  const lease = await env.DB.prepare(`SELECT * FROM active_admin_leases
    WHERE user_id = ? AND session_id = ? AND device_id = ? AND expires_at > ?`)
    .bind(user.id, user.session_id, user.device_id, nowIso()).first();
  if (!lease) {
    throw new HttpError(423, 'ADMIN_SESSION_INACTIVE',
      'This administrator account is active on another device or its active lease has expired.');
  }
  return lease;
}

async function bootstrapSchool(request, env) {
  requireInstallToken(request, env);
  const body = await readJson(request);
  const schoolId = clean(body.schoolId, 64) || randomId();
  const schoolNameCiphertext = validateEnvelope(body.schoolNameEnvelope);
  const schoolEmailHmac = await hmacSha256(
    env.SCHOOL_AUTH_SECRET || env.IDENTITY_HMAC_SECRET,
    normalizeEmail(body.schoolEmail)
  );
  const administrators = Array.isArray(body.administrators) ? body.administrators : [];
  const normalizedAdmins = [];
  const usedRoles = new Set();
  for (const item of administrators.slice(0, 6)) {
    const role = normalizeRole(item.role);
    if (!ADMIN_ROLES.has(role)) throw new HttpError(400, 'INVALID_ADMIN_ROLE', 'Bootstrap users must be school administrators.');
    if (usedRoles.has(role)) throw new HttpError(400, 'DUPLICATE_ADMIN_ROLE', 'Only one initial administrator per role is allowed.');
    usedRoles.add(role);
    const activationCode = createPersonnelCode();
    normalizedAdmins.push({
      id: randomId(),
      displayNameCiphertext: validateEnvelope(item.displayNameEnvelope),
      role,
      activationCode,
      personnelCodeHash: await personnelCodeHash(env, schoolId, activationCode)
    });
  }
  if (!usedRoles.has('school-ict') || !usedRoles.has('school-head')) {
    throw new HttpError(400, 'REQUIRED_ADMINS_MISSING', 'The initial ICT Coordinator and School Head are required.');
  }
  const createdAt = nowIso();
  const statements = [
    env.DB.prepare(`INSERT INTO schools
      (id, name_ciphertext, school_email_hmac, retention_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(schoolId, schoolNameCiphertext, schoolEmailHmac,
        Math.min(3650, Math.max(7, Number(body.retentionDays) || 90)), createdAt, createdAt),
    ...normalizedAdmins.map(item => env.DB.prepare(`INSERT INTO users
      (id, school_id, display_name_ciphertext, personnel_code_hash, personnel_code_issued_at,
       role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(item.id, schoolId, item.displayNameCiphertext, item.personnelCodeHash,
        createdAt, item.role, createdAt, createdAt))
  ];
  await env.DB.batch(statements);
  await appendAudit(env, { schoolId }, 'SCHOOL_BOOTSTRAPPED', 'school', schoolId);
  return json({
    success: true,
    schoolId,
    administrators: normalizedAdmins.map(item => ({
      id: item.id,
      role: item.role,
      status: 'pending',
      activationCode: item.activationCode
    }))
  }, 201);
}

async function activateAdminLease(request, env, user) {
  if (!isAdminRole(user.role)) throw new HttpError(403, 'ADMIN_REQUIRED', 'An administrator account is required.');
  const body = await readJson(request);
  const existing = await env.DB.prepare(`SELECT * FROM active_admin_leases WHERE user_id = ? AND expires_at > ?`)
    .bind(user.id, nowIso()).first();
  const decision = adminLeaseDecision(existing, user, Boolean(body.takeover));
  if (!decision.allowed) {
    throw new HttpError(409, 'ADMIN_SESSION_ACTIVE', 'This administrator account is active on another device.', {
      activeDeviceId: decision.activeDeviceId,
      expiresAt: decision.expiresAt
    });
  }
  const leaseSeconds = Math.min(600, Math.max(60, Number(env.ADMIN_LEASE_SECONDS) || 180));
  const heartbeatAt = nowIso();
  const expiresAt = isoAfterSeconds(leaseSeconds);
  await env.DB.prepare(`INSERT INTO active_admin_leases
    (user_id, school_id, session_id, device_id, lease_version, heartbeat_at, expires_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      session_id = excluded.session_id,
      device_id = excluded.device_id,
      lease_version = active_admin_leases.lease_version + 1,
      heartbeat_at = excluded.heartbeat_at,
      expires_at = excluded.expires_at`)
    .bind(user.id, user.school_id, user.session_id, user.device_id, heartbeatAt, expiresAt).run();
  await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId: user.device_id },
    decision.takeover ? 'ADMIN_SESSION_TAKEN_OVER' : 'ADMIN_SESSION_ACTIVATED',
    'session', user.session_id);
  return json({ success: true, activeDeviceId: user.device_id, expiresAt });
}

async function heartbeatAdminLease(env, user) {
  await requireActiveAdminLease(env, user);
  const leaseSeconds = Math.min(600, Math.max(60, Number(env.ADMIN_LEASE_SECONDS) || 180));
  const heartbeatAt = nowIso();
  const expiresAt = isoAfterSeconds(leaseSeconds);
  await env.DB.prepare(`UPDATE active_admin_leases SET heartbeat_at = ?, expires_at = ?
    WHERE user_id = ? AND session_id = ?`).bind(heartbeatAt, expiresAt, user.id, user.session_id).run();
  return json({ success: true, expiresAt });
}

function approvalScopeMatches(grant, request) {
  return grant.scope === request.request_type
    || (grant.scope === 'specific-request' && grant.request_id === request.id);
}

async function insertApproval(env, user, input) {
  const payloadJson = validateEnvelope(input.envelope);
  const id = randomId();
  const requestedAt = nowIso();
  const expiresAt = isoAfterSeconds(Math.min(168, Math.max(1, Number(input.expiresHours) || 48)) * 3600);
  await env.DB.prepare(`INSERT INTO approval_requests
    (id, school_id, request_type, action_code, target_id, requested_by_user_id,
     encrypted_payload_json, payload_hash, status, requested_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(id, user.school_id, input.requestType, input.actionCode, input.targetId || null, user.id,
      payloadJson, await sha256(payloadJson), requestedAt, expiresAt).run();
  await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId: user.device_id },
    'APPROVAL_REQUESTED', input.requestType, id);
  return { id, status: 'pending', requestedAt, expiresAt };
}

async function createPersonnelChange(request, env, user) {
  requireCapability(user, 'personnel.manage');
  await requireActiveAdminLease(env, user);
  if (user.role !== 'school-ict') {
    throw new HttpError(403, 'ICT_REQUIRED', 'Only the School ICT Coordinator manages teacher accounts and data.');
  }
  const body = await readJson(request);
  const actionCode = clean(body.actionCode, 80);
  if (!PERSONNEL_ACTIONS.has(actionCode)) {
    throw new HttpError(400, 'INVALID_PERSONNEL_ACTION', 'Unsupported personnel-management action.');
  }
  let targetId = clean(body.targetUserId, 100);
  if (actionCode === 'personnel-create') {
    const requestedRole = normalizeRole(body.requestedRole);
    if (!['subject-teacher', 'adviser', 'school-admin'].includes(requestedRole)) {
      throw new HttpError(400, 'INVALID_PERSONNEL_ROLE',
        'Personnel profiles may be created as subject teacher, adviser, or school admin.');
    }
    targetId = requestedRole;
  } else if (!targetId) {
    throw new HttpError(400, 'TARGET_USER_REQUIRED', 'Select the teacher account to change.');
  }
  const approval = await insertApproval(env, user, {
    requestType: 'personnel-management',
    actionCode,
    targetId,
    envelope: body.envelope,
    expiresHours: body.expiresHours
  });
  return json({ success: true, approval }, 201);
}

function normalizeAnnouncement(body) {
  const priority = clean(body.priority, 20).toLowerCase() || 'normal';
  if (!ANNOUNCEMENT_PRIORITIES.has(priority)) throw new HttpError(400, 'INVALID_PRIORITY', 'Announcement priority is invalid.');
  const audienceType = clean(body.audienceType, 20).toLowerCase() || 'all';
  if (!['all', 'role', 'users'].includes(audienceType)) throw new HttpError(400, 'INVALID_AUDIENCE', 'Announcement audience is invalid.');
  const audienceRole = audienceType === 'role' ? normalizeRole(body.audienceRole) : null;
  const recipientUserIds = audienceType === 'users'
    ? [...new Set((Array.isArray(body.recipientUserIds) ? body.recipientUserIds : []).map(value => clean(value, 100)).filter(Boolean))].slice(0, 1000)
    : [];
  if (audienceType === 'users' && recipientUserIds.length === 0) {
    throw new HttpError(400, 'RECIPIENTS_REQUIRED', 'Select at least one announcement recipient.');
  }
  const publishAt = normalizeIso(body.publishAt, 'Publication time') || nowIso();
  const expiresAt = normalizeIso(body.expiresAt, 'Expiration time');
  if (expiresAt && expiresAt <= publishAt) throw new HttpError(400, 'INVALID_EXPIRY', 'Announcement expiry must follow publication.');
  return {
    priority,
    audienceType,
    audienceRole,
    recipientUserIds,
    publishAt,
    expiresAt,
    requiresAck: body.requiresAck ? 1 : 0,
    payloadJson: validateEnvelope(body.envelope)
  };
}

function publicationStatus(publishAt, now = nowIso()) {
  return publishAt > now ? 'scheduled' : 'published';
}

async function createAnnouncement(request, env, user) {
  requireCapability(user, 'announcement.submit');
  await requireActiveAdminLease(env, user);
  const body = await readJson(request);
  const item = normalizeAnnouncement(body);
  const id = randomId();
  const createdAt = nowIso();
  const direct = user.role === 'school-head';
  const status = direct ? publicationStatus(item.publishAt, createdAt) : 'pending';
  const statements = [env.DB.prepare(`INSERT INTO announcements
    (id, school_id, created_by_user_id, priority, audience_type, audience_role,
     encrypted_payload_json, payload_hash, status, requires_ack, publish_at, expires_at,
     published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, user.school_id, user.id, item.priority, item.audienceType, item.audienceRole,
      item.payloadJson, await sha256(item.payloadJson), status, item.requiresAck, item.publishAt,
      item.expiresAt, status === 'published' ? createdAt : null, createdAt, createdAt),
  ...item.recipientUserIds.map(userId => env.DB.prepare(`INSERT INTO announcement_deliveries
    (announcement_id, user_id) SELECT ?, id FROM users WHERE id = ? AND school_id = ?`)
    .bind(id, userId, user.school_id))];
  await env.DB.batch(statements);

  let approval = null;
  if (!direct) {
    approval = await insertApproval(env, user, {
      requestType: 'announcement',
      actionCode: 'announcement-publish',
      targetId: id,
      envelope: body.envelope,
      expiresHours: body.approvalExpiresHours
    });
    await env.DB.prepare('UPDATE announcements SET approval_request_id = ? WHERE id = ?')
      .bind(approval.id, id).run();
  } else {
    await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId: user.device_id },
      status === 'published' ? 'ANNOUNCEMENT_PUBLISHED' : 'ANNOUNCEMENT_SCHEDULED', 'announcement', id);
  }
  return json({ success: true, announcement: { id, status, publishAt: item.publishAt }, approval }, 201);
}

async function listApprovals(request, env, user) {
  await requireActiveAdminLease(env, user);
  const url = new URL(request.url);
  const requestedStatus = clean(url.searchParams.get('status'), 20) || 'pending';
  if (!['pending', 'approved', 'rejected', 'overridden', 'cancelled', 'failed'].includes(requestedStatus)) {
    throw new HttpError(400, 'INVALID_STATUS', 'Approval status is invalid.');
  }
  const head = user.role === 'school-head';
  const result = await env.DB.prepare(`SELECT id, request_type, action_code, target_id,
      requested_by_user_id, encrypted_payload_json, payload_hash, status, requested_at,
      decided_at, applied_at, expires_at
    FROM approval_requests
    WHERE school_id = ? AND status = ? AND (? = 1 OR requested_by_user_id = ?)
    ORDER BY requested_at DESC LIMIT 200`)
    .bind(user.school_id, requestedStatus, head ? 1 : 0, user.id).all();
  return json({ approvals: (result.results || []).map(row => ({
    id: row.id,
    requestType: row.request_type,
    actionCode: row.action_code,
    targetId: row.target_id,
    requestedByUserId: row.requested_by_user_id,
    envelope: JSON.parse(row.encrypted_payload_json),
    payloadHash: row.payload_hash,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    appliedAt: row.applied_at,
    expiresAt: row.expires_at
  })) });
}

async function applyApprovalOutcome(env, approval, outcome, actor, overrideGrantId = null, noteEnvelope = null) {
  const decidedAt = nowIso();
  const decisionNoteCiphertext = noteEnvelope ? validateEnvelope(noteEnvelope) : null;
  const changed = await env.DB.prepare(`UPDATE approval_requests
    SET status = ?, decided_by_user_id = ?, override_grant_id = ?, decision_note_ciphertext = ?, decided_at = ?
    WHERE id = ? AND school_id = ? AND status = 'pending' AND expires_at > ?`)
    .bind(outcome, actor.id, overrideGrantId, decisionNoteCiphertext, decidedAt,
      approval.id, actor.school_id, decidedAt).run();
  if (resultChanges(changed) !== 1) {
    throw new HttpError(409, 'APPROVAL_ALREADY_RESOLVED', 'This request was already resolved or has expired.');
  }
  if (approval.request_type === 'announcement') {
    if (outcome === 'rejected') {
      await env.DB.prepare(`UPDATE announcements SET status = 'rejected', updated_at = ?
        WHERE id = ? AND school_id = ?`).bind(decidedAt, approval.target_id, actor.school_id).run();
    } else {
      const announcement = await env.DB.prepare('SELECT publish_at FROM announcements WHERE id = ? AND school_id = ?')
        .bind(approval.target_id, actor.school_id).first();
      const status = publicationStatus(announcement?.publish_at || decidedAt, decidedAt);
      await env.DB.prepare(`UPDATE announcements SET status = ?, published_at = ?, updated_at = ?
        WHERE id = ? AND school_id = ?`)
        .bind(status, status === 'published' ? decidedAt : null, decidedAt, approval.target_id, actor.school_id).run();
    }
  }
  const application = {};
  if (approval.request_type === 'personnel-management' && outcome !== 'rejected') {
    if (approval.action_code === 'personnel-create') {
      const personnelCode = createPersonnelCode();
      const personnelId = randomId();
      await env.DB.prepare(`INSERT INTO users
        (id, school_id, display_name_ciphertext, personnel_code_hash,
         personnel_code_issued_at, role, status, created_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
        .bind(personnelId, actor.school_id, approval.encrypted_payload_json,
          await personnelCodeHash(env, actor.school_id, personnelCode), decidedAt,
          approval.target_id, approval.requested_by_user_id, decidedAt, decidedAt).run();
      application.personnelId = personnelId;
      application.personnelCode = personnelCode;
      application.permanentAcrossSchoolYears = true;
    } else if (approval.action_code === 'personnel-code-rotate') {
      const personnelCode = createPersonnelCode();
      const updated = await env.DB.prepare(`UPDATE users
        SET personnel_code_hash = ?, personnel_code_version = personnel_code_version + 1,
          personnel_code_rotated_at = ?, updated_at = ?
        WHERE id = ? AND school_id = ?
          AND role IN ('subject-teacher', 'adviser', 'school-admin')`)
        .bind(await personnelCodeHash(env, actor.school_id, personnelCode),
          decidedAt, decidedAt, approval.target_id, actor.school_id).run();
      if (resultChanges(updated) !== 1) {
        throw new HttpError(404, 'PERSONNEL_NOT_FOUND', 'Personnel profile was not found.');
      }
      application.personnelCode = personnelCode;
      application.permanentAcrossSchoolYears = true;
    } else if (['personnel-suspend', 'personnel-restore', 'personnel-data-delete'].includes(approval.action_code)) {
      const nextStatus = approval.action_code === 'personnel-restore'
        ? 'active'
        : approval.action_code === 'personnel-suspend' ? 'suspended' : 'disabled';
      const updated = await env.DB.prepare(`UPDATE users SET status = ?, updated_at = ?
        WHERE id = ? AND school_id = ?
          AND role IN ('subject-teacher', 'adviser', 'school-admin')`)
        .bind(nextStatus, decidedAt, approval.target_id, actor.school_id).run();
      if (resultChanges(updated) !== 1) {
        throw new HttpError(404, 'PERSONNEL_NOT_FOUND', 'Personnel profile was not found.');
      }
      if (nextStatus !== 'active') {
        await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
          .bind(decidedAt, approval.target_id).run();
      }
      application.personnelStatus = nextStatus;
    } else if (approval.action_code === 'personnel-device-reset') {
      await env.DB.batch([
        env.DB.prepare(`UPDATE devices SET status = 'revoked', platform_slot = NULL, revoked_at = ?
          WHERE user_id = ? AND school_id = ? AND status != 'revoked'`)
          .bind(decidedAt, approval.target_id, actor.school_id),
        env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
          .bind(decidedAt, approval.target_id)
      ]);
      application.devicesRevoked = true;
    }
  }
  await appendAudit(env, { schoolId: actor.school_id, userId: actor.id, deviceId: actor.device_id },
    outcome === 'overridden' ? 'APPROVAL_OVERRIDDEN' : `APPROVAL_${outcome.toUpperCase()}`,
    approval.request_type, approval.id, noteEnvelope);
  return { id: approval.id, status: outcome, decidedAt, ...application };
}

async function decideApproval(request, env, user, approvalId) {
  if (user.role !== 'school-head') throw new HttpError(403, 'HEAD_APPROVAL_REQUIRED', 'Only the School Head can approve or reject requests.');
  await requireActiveAdminLease(env, user);
  const body = await readJson(request);
  const decision = clean(body.decision, 20).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) throw new HttpError(400, 'INVALID_DECISION', 'Decision must be approved or rejected.');
  const approval = await env.DB.prepare('SELECT * FROM approval_requests WHERE id = ? AND school_id = ?')
    .bind(approvalId, user.school_id).first();
  if (!approval) throw new HttpError(404, 'APPROVAL_NOT_FOUND', 'Approval request was not found.');
  return json({ success: true, approval: await applyApprovalOutcome(env, approval, decision, user, null, body.noteEnvelope) });
}

async function createOverrideGrant(request, env, user) {
  if (user.role !== 'school-head') throw new HttpError(403, 'HEAD_REQUIRED', 'Only the School Head can generate override keys.');
  await requireActiveAdminLease(env, user);
  const body = await readJson(request);
  const scope = clean(body.scope, 40);
  if (!['personnel-management', 'announcement', 'specific-request'].includes(scope)) {
    throw new HttpError(400, 'INVALID_OVERRIDE_SCOPE', 'Override scope is invalid.');
  }
  const requestId = scope === 'specific-request' ? clean(body.requestId, 100) : null;
  if (scope === 'specific-request' && !requestId) throw new HttpError(400, 'REQUEST_REQUIRED', 'A specific request is required.');
  const expiresMinutes = Math.min(1440, Math.max(5, Number(body.expiresMinutes) || 30));
  const code = randomToken(24).toUpperCase();
  const id = randomId();
  const createdAt = nowIso();
  const expiresAt = isoAfterSeconds(expiresMinutes * 60);
  await env.DB.prepare(`INSERT INTO override_grants
    (id, school_id, issued_by_user_id, scope, request_id, code_hash, max_uses, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(id, user.school_id, user.id, scope, requestId, await sha256(code), expiresAt, createdAt).run();
  await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId: user.device_id },
    'OVERRIDE_GRANT_CREATED', 'override-grant', id);
  return json({ success: true, grant: { id, scope, requestId, code, expiresAt, maxUses: 1 } }, 201);
}

async function useOverrideGrant(request, env, user, approvalId) {
  requireCapability(user, 'override.use');
  await requireActiveAdminLease(env, user);
  const body = await readJson(request);
  if (!body.reasonEnvelope) throw new HttpError(400, 'REASON_REQUIRED', 'An encrypted override reason is required.');
  const approval = await env.DB.prepare('SELECT * FROM approval_requests WHERE id = ? AND school_id = ?')
    .bind(approvalId, user.school_id).first();
  if (!approval) throw new HttpError(404, 'APPROVAL_NOT_FOUND', 'Approval request was not found.');
  if (approval.requested_by_user_id !== user.id) {
    throw new HttpError(403, 'REQUEST_OWNER_REQUIRED', 'Only the administrator who submitted this request may apply its override.');
  }
  const grant = await env.DB.prepare(`SELECT * FROM override_grants
    WHERE code_hash = ? AND school_id = ? AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses`)
    .bind(await sha256(clean(body.code, 256).toUpperCase()), user.school_id, nowIso()).first();
  if (!grant || !approvalScopeMatches(grant, approval)) {
    throw new HttpError(401, 'OVERRIDE_INVALID', 'The override key is invalid, expired, used, revoked, or out of scope.');
  }
  const usedAt = nowIso();
  const consumed = await env.DB.prepare(`UPDATE override_grants
    SET use_count = use_count + 1, last_used_at = ?
    WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND use_count < max_uses`)
    .bind(usedAt, grant.id, usedAt).run();
  if (resultChanges(consumed) !== 1) throw new HttpError(409, 'OVERRIDE_ALREADY_USED', 'This override key was already used.');
  const resolved = await applyApprovalOutcome(env, approval, 'overridden', user, grant.id, body.reasonEnvelope);
  return json({ success: true, approval: resolved, schoolHeadNotificationRequired: true });
}

async function listAnnouncements(env, user) {
  requireCapability(user, 'announcement.read');
  const at = nowIso();
  const result = await env.DB.prepare(`SELECT a.*,
      ack.acknowledged_at,
      delivery.read_at
    FROM announcements a
    LEFT JOIN announcement_acknowledgments ack
      ON ack.announcement_id = a.id AND ack.user_id = ?
    LEFT JOIN announcement_deliveries delivery
      ON delivery.announcement_id = a.id AND delivery.user_id = ?
    WHERE a.school_id = ? AND a.status = 'published' AND a.publish_at <= ?
      AND (a.expires_at IS NULL OR a.expires_at > ?)
      AND (a.audience_type = 'all' OR (a.audience_type = 'role' AND a.audience_role = ?)
        OR (a.audience_type = 'users' AND delivery.user_id IS NOT NULL))
    ORDER BY CASE a.priority WHEN 'emergency' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
      a.published_at DESC LIMIT 200`)
    .bind(user.id, user.id, user.school_id, at, at, user.role).all();
  return json({ announcements: (result.results || []).map(row => ({
    id: row.id,
    priority: row.priority,
    requiresAck: Boolean(row.requires_ack),
    envelope: JSON.parse(row.encrypted_payload_json),
    payloadHash: row.payload_hash,
    version: row.version,
    publishAt: row.publish_at,
    expiresAt: row.expires_at,
    readAt: row.read_at,
    acknowledgedAt: row.acknowledged_at
  })) });
}

async function acknowledgeAnnouncement(env, user, announcementId) {
  const announcement = await env.DB.prepare(`SELECT id FROM announcements
    WHERE id = ? AND school_id = ? AND status = 'published'`).bind(announcementId, user.school_id).first();
  if (!announcement) throw new HttpError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement was not found.');
  const acknowledgedAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO announcement_acknowledgments
      (announcement_id, user_id, device_id, acknowledged_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(announcement_id, user_id) DO UPDATE SET device_id = excluded.device_id,
        acknowledged_at = excluded.acknowledged_at`)
      .bind(announcementId, user.id, user.device_id, acknowledgedAt),
    env.DB.prepare(`UPDATE announcement_deliveries SET delivered_at = COALESCE(delivered_at, ?), read_at = ?
      WHERE announcement_id = ? AND user_id = ?`)
      .bind(acknowledgedAt, acknowledgedAt, announcementId, user.id)
  ]);
  await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId: user.device_id },
    'ANNOUNCEMENT_ACKNOWLEDGED', 'announcement', announcementId);
  return json({ success: true, acknowledgedAt });
}

async function notificationSummary(env, user) {
  const at = nowIso();
  const announcement = await env.DB.prepare(`SELECT COUNT(*) AS count
    FROM announcements a
    LEFT JOIN announcement_acknowledgments ack ON ack.announcement_id = a.id AND ack.user_id = ?
    LEFT JOIN announcement_deliveries delivery ON delivery.announcement_id = a.id AND delivery.user_id = ?
    WHERE a.school_id = ? AND a.status = 'published' AND a.publish_at <= ?
      AND (a.expires_at IS NULL OR a.expires_at > ?) AND ack.user_id IS NULL
      AND (a.audience_type = 'all' OR (a.audience_type = 'role' AND a.audience_role = ?)
        OR (a.audience_type = 'users' AND delivery.user_id IS NOT NULL))`)
    .bind(user.id, user.id, user.school_id, at, at, user.role).first();
  let pendingApprovals = 0;
  if (user.role === 'school-head') {
    const pending = await env.DB.prepare(`SELECT COUNT(*) AS count FROM approval_requests
      WHERE school_id = ? AND status = 'pending' AND expires_at > ?`).bind(user.school_id, at).first();
    pendingApprovals = Number(pending?.count || 0);
  }
  return json({ unreadAnnouncements: Number(announcement?.count || 0), pendingApprovals });
}

async function uploadProfileBackup(request, env, user) {
  if (!env.SNAPSHOTS) throw new HttpError(503, 'R2_REQUIRED', 'The private snapshot bucket is not configured.');
  const body = await readJson(request);
  const envelopeJson = validateEnvelope(body.envelope);
  const revision = Math.max(1, Math.floor(Number(body.revision) || Date.now()));
  const signature = clean(body.signature, 4096);
  if (!signature) throw new HttpError(400, 'BACKUP_SIGNATURE_REQUIRED', 'A signed encrypted backup is required.');
  await verifyDeviceSignature(env, user, envelopeJson, signature);
  const streamKey = `profile:${user.id}`;
  const id = randomId();
  const createdAt = nowIso();
  const objectKey = `${user.school_id}/profiles/${user.id}/${revision}-${id}.json`;
  const payloadHash = await sha256(envelopeJson);
  await env.SNAPSHOTS.put(objectKey, envelopeJson, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { schoolId: user.school_id, userId: user.id, revision: String(revision), payloadHash }
  });
  try {
    await env.DB.prepare(`INSERT INTO snapshots
      (id, school_id, stream_key, revision, r2_object_key, encrypted_bytes,
       payload_hash, signature, created_by_device_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.school_id, streamKey, revision, objectKey,
        new TextEncoder().encode(envelopeJson).byteLength, payloadHash, signature,
        user.device_id, createdAt).run();
  } catch (_error) {
    await env.SNAPSHOTS.delete(objectKey);
    throw new HttpError(409, 'BACKUP_REVISION_CONFLICT',
      'This backup revision already exists. Create a newer backup.');
  }
  await appendAudit(env, { schoolId: user.school_id, userId: user.id, deviceId: user.device_id },
    'PROFILE_BACKUP_STORED', 'snapshot', id);
  return json({ success: true, snapshot: { id, revision, payloadHash, createdAt } }, 201);
}

async function latestProfileBackup(env, user) {
  if (!env.SNAPSHOTS) throw new HttpError(503, 'R2_REQUIRED', 'The private snapshot bucket is not configured.');
  const row = await env.DB.prepare(`SELECT * FROM snapshots
    WHERE school_id = ? AND stream_key = ?
    ORDER BY revision DESC, created_at DESC LIMIT 1`)
    .bind(user.school_id, `profile:${user.id}`).first();
  if (!row) throw new HttpError(404, 'BACKUP_NOT_FOUND', 'No encrypted cloud backup exists for this profile.');
  const object = await env.SNAPSHOTS.get(row.r2_object_key);
  if (!object) throw new HttpError(503, 'BACKUP_OBJECT_MISSING', 'The encrypted backup object is unavailable.');
  const envelopeJson = await object.text();
  if (await sha256(envelopeJson) !== row.payload_hash) {
    throw new HttpError(500, 'BACKUP_INTEGRITY_FAILED', 'The encrypted backup failed its integrity check.');
  }
  return json({ snapshot: {
    id: row.id,
    revision: Number(row.revision),
    payloadHash: row.payload_hash,
    signature: row.signature,
    createdAt: row.created_at,
    envelope: JSON.parse(envelopeJson)
  } });
}

async function scheduledMaintenance(env) {
  const at = nowIso();
  await env.DB.batch([
    env.DB.prepare(`UPDATE announcements SET status = 'published', published_at = ?, updated_at = ?
      WHERE status = 'scheduled' AND publish_at <= ?`).bind(at, at, at),
    env.DB.prepare(`UPDATE announcements SET status = 'expired', updated_at = ?
      WHERE status IN ('published', 'scheduled') AND expires_at IS NOT NULL AND expires_at <= ?`).bind(at, at),
    env.DB.prepare(`UPDATE approval_requests SET status = 'cancelled', decided_at = ?
      WHERE status = 'pending' AND expires_at <= ?`).bind(at, at),
    env.DB.prepare('DELETE FROM active_admin_leases WHERE expires_at <= ?').bind(at),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL').bind(at),
    env.DB.prepare('DELETE FROM activation_attempts WHERE created_at <= ?')
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  ]);
}

async function handle(request, env) {
  if (request.method === 'OPTIONS') return json({}, 204);
  if (!env.DB) throw new HttpError(503, 'D1_REQUIRED', 'D1 binding DB is required.');
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({
      ok: true,
      service: 'eclassrecord-school-cloud',
      version: env.SERVICE_VERSION || '0.1.0',
      encryption: 'client-side-required',
      authentication: 'permanent-personnel-code-with-device-keys',
      plaintextLearnerDataAccepted: false
    });
  }
  if (request.method === 'POST' && url.pathname === '/v1/setup/bootstrap') return bootstrapSchool(request, env);
  if (request.method === 'POST' && url.pathname === '/v1/auth/activate') return activateWithPersonnelCode(request, env);

  const user = await authenticate(request, env);
  if (request.method === 'GET' && url.pathname === '/v1/me') return json({ user: publicUser(user), deviceId: user.device_id });
  if (request.method === 'POST' && url.pathname === '/v1/admin-session/activate') return activateAdminLease(request, env, user);
  if (request.method === 'POST' && url.pathname === '/v1/admin-session/heartbeat') return heartbeatAdminLease(env, user);
  if (request.method === 'POST' && url.pathname === '/v1/personnel-changes') return createPersonnelChange(request, env, user);
  if (request.method === 'GET' && url.pathname === '/v1/approvals') return listApprovals(request, env, user);
  if (request.method === 'POST' && url.pathname === '/v1/override-grants') return createOverrideGrant(request, env, user);
  if (request.method === 'POST' && url.pathname === '/v1/announcements') return createAnnouncement(request, env, user);
  if (request.method === 'GET' && url.pathname === '/v1/announcements') return listAnnouncements(env, user);
  if (request.method === 'GET' && url.pathname === '/v1/notifications/summary') return notificationSummary(env, user);
  if (request.method === 'POST' && url.pathname === '/v1/profile-backups') return uploadProfileBackup(request, env, user);
  if (request.method === 'GET' && url.pathname === '/v1/profile-backups/latest') return latestProfileBackup(env, user);

  const decision = url.pathname.match(/^\/v1\/approvals\/([^/]+)\/decision$/);
  if (request.method === 'POST' && decision) return decideApproval(request, env, user, decodeURIComponent(decision[1]));
  const override = url.pathname.match(/^\/v1\/approvals\/([^/]+)\/override$/);
  if (request.method === 'POST' && override) return useOverrideGrant(request, env, user, decodeURIComponent(override[1]));
  const acknowledgment = url.pathname.match(/^\/v1\/announcements\/([^/]+)\/acknowledge$/);
  if (request.method === 'POST' && acknowledgment) {
    return acknowledgeAnnouncement(env, user, decodeURIComponent(acknowledgment[1]));
  }
  throw new HttpError(404, 'NOT_FOUND', 'Not found.');
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({
        error: error instanceof HttpError ? error.code : 'SERVER_ERROR',
        message: error.message || 'Server error.',
        ...(error.details ? { details: error.details } : {})
      }, status);
    }
  },
  async scheduled(_event, env) {
    await scheduledMaintenance(env);
  }
};

export {
  HttpError,
  adminLeaseDecision,
  approvalScopeMatches,
  can,
  handle,
  hmacSha256,
  isAdminRole,
  normalizeAnnouncement,
  normalizeEmail,
  normalizeRole,
  publicationStatus,
  scheduledMaintenance,
  sha256,
  validateEnvelope
};
