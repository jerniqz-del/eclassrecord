const MAX_BODY_BYTES = 1800000;
const MAX_PAYLOAD_BYTES = 1500000;
const SESSION_DAYS = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function randomId() {
  return crypto.randomUUID();
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readJson(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('Request is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error('Request is too large.');
  try { return JSON.parse(text || '{}'); } catch (_error) { throw new Error('Request must be valid JSON.'); }
}

function bearer(request) {
  return String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function isoAfterDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function audit(env, schoolId, actorUserId, action, submissionId = '', detail = '') {
  await env.DB.prepare(`INSERT INTO audit_logs (id, school_id, actor_user_id, action, submission_id, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(randomId(), schoolId, actorUserId || null, action, submissionId || null, clean(detail, 500), new Date().toISOString()).run();
}

async function authenticate(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT s.id AS session_id, s.expires_at, u.*
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
    .bind(tokenHash, new Date().toISOString()).first();
  if (!row) return null;
  await env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.session_id).run();
  return row;
}

function requireAdmin(request, env) {
  return Boolean(env.ADMIN_SETUP_TOKEN) && bearer(request) === env.ADMIN_SETUP_TOKEN;
}

function publicUser(row) {
  return { id: row.id, schoolId: row.school_id, displayName: row.display_name, role: row.role, status: row.status };
}

async function createSchool(request, env) {
  if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const body = await readJson(request);
  const schoolId = clean(body.schoolId, 40);
  const name = clean(body.name, 160);
  const retentionDays = Math.round(Math.min(90, Math.max(1, Number(body.retentionDays) || 30)));
  if (!schoolId || !name) return json({ error: 'School ID and name are required.' }, 400);
  await env.DB.prepare(`INSERT INTO schools (id, name, retention_days, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, retention_days = excluded.retention_days`)
    .bind(schoolId, name, retentionDays, new Date().toISOString()).run();
  return json({ success: true, school: { id: schoolId, name, retentionDays } }, 201);
}

function normalizeAssignments(items, role) {
  const allowedRole = role === 'adviser' ? 'adviser' : 'subject-teacher';
  return (Array.isArray(items) ? items : []).slice(0, 100).map(item => {
    const assignment = {
      schoolYear: clean(item.schoolYear, 20),
      gradeLevel: clean(item.gradeLevel, 30),
      section: clean(item.section, 80),
      subjectKey: allowedRole === 'adviser' ? '*' : clean(item.subjectKey, 120).toUpperCase(),
      assignmentRole: allowedRole
    };
    if (!assignment.schoolYear || !assignment.gradeLevel || !assignment.section || !assignment.subjectKey) {
      throw new Error('Every assignment needs school year, grade level, section, and subject.');
    }
    return assignment;
  });
}

async function createUser(request, env) {
  if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const body = await readJson(request);
  const schoolId = clean(body.schoolId, 40);
  const displayName = clean(body.displayName, 160);
  const role = clean(body.role, 30);
  if (!schoolId || !displayName || !['subject-teacher', 'adviser', 'ict-admin'].includes(role)) {
    return json({ error: 'School, name, and a valid role are required.' }, 400);
  }
  const school = await env.DB.prepare('SELECT id FROM schools WHERE id = ?').bind(schoolId).first();
  if (!school) return json({ error: 'School was not found.' }, 404);
  const assignments = normalizeAssignments(body.assignments, role);
  const userId = randomId();
  const code = randomCode();
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(`INSERT INTO users (id, school_id, display_name, role, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)`).bind(userId, schoolId, displayName, role, now),
    env.DB.prepare(`INSERT INTO activation_codes (id, user_id, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)`).bind(randomId(), userId, await sha256(code), isoAfterDays(14), now),
    ...assignments.map(item => env.DB.prepare(`INSERT INTO assignments
      (id, user_id, school_year, grade_level, section, subject_key, assignment_role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(randomId(), userId, item.schoolYear, item.gradeLevel, item.section, item.subjectKey, item.assignmentRole, now))
  ];
  await env.DB.batch(statements);
  await audit(env, schoolId, null, 'user-created', '', `${displayName} (${role})`);
  return json({ success: true, user: { id: userId, schoolId, displayName, role }, activationCode: code, expiresAt: isoAfterDays(14) }, 201);
}

async function issueActivationCode(request, env, userId) {
  if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return json({ error: 'User was not found.' }, 404);
  const code = randomCode();
  const now = new Date().toISOString();
  const expiresAt = isoAfterDays(14);
  await env.DB.batch([
    env.DB.prepare('UPDATE activation_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL').bind(now, userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare(`UPDATE users SET public_key_json = NULL, status = 'pending', activated_at = NULL WHERE id = ?`).bind(userId),
    env.DB.prepare(`INSERT INTO activation_codes (id, user_id, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)`).bind(randomId(), userId, await sha256(code), expiresAt, now)
  ]);
  await audit(env, user.school_id, null, 'activation-code-reissued', '', user.display_name);
  return json({ success: true, user: publicUser({ ...user, status: 'pending' }), activationCode: code, expiresAt }, 201);
}

async function setUserStatus(request, env, userId) {
  if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const body = await readJson(request);
  const status = clean(body.status, 20);
  if (!['active', 'disabled'].includes(status)) return json({ error: 'Status must be active or disabled.' }, 400);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return json({ error: 'User was not found.' }, 404);
  if (status === 'active' && !user.public_key_json) return json({ error: 'Issue an activation code and activate this profile first.' }, 409);
  await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();
  if (status === 'disabled') await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await audit(env, user.school_id, null, `user-${status}`, '', user.display_name);
  return json({ success: true, user: publicUser({ ...user, status }) });
}

async function activate(request, env) {
  const body = await readJson(request);
  const code = clean(body.activationCode, 40).replace(/[^0-9A-Z]/gi, '').toUpperCase();
  const publicKey = body.publicKey;
  if (!code || !publicKey || publicKey.kty !== 'EC' || publicKey.crv !== 'P-256') {
    return json({ error: 'A valid activation code and device key are required.' }, 400);
  }
  const codeHash = await sha256(code);
  const row = await env.DB.prepare(`SELECT a.id AS activation_id, a.user_id, u.*
    FROM activation_codes a JOIN users u ON u.id = a.user_id
    WHERE a.code_hash = ? AND a.used_at IS NULL AND a.expires_at > ? AND u.status = 'pending'`)
    .bind(codeHash, new Date().toISOString()).first();
  if (!row) return json({ error: 'Activation code is invalid, expired, or already used.' }, 401);
  const token = randomToken();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET public_key_json = ?, status = 'active', activated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(publicKey), now, row.user_id),
    env.DB.prepare('UPDATE activation_codes SET used_at = ? WHERE id = ?').bind(now, row.activation_id),
    env.DB.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(randomId(), row.user_id, await sha256(token), isoAfterDays(SESSION_DAYS), now, now)
  ]);
  await audit(env, row.school_id, row.user_id, 'user-activated');
  return json({ success: true, token, expiresAt: isoAfterDays(SESSION_DAYS), user: publicUser({ ...row, status: 'active' }) }, 201);
}

async function listRecipients(request, env, user) {
  const url = new URL(request.url);
  const schoolYear = clean(url.searchParams.get('schoolYear'), 20);
  const gradeLevel = clean(url.searchParams.get('gradeLevel'), 30);
  const section = clean(url.searchParams.get('section'), 80);
  const result = await env.DB.prepare(`SELECT DISTINCT u.id, u.display_name, u.public_key_json
    FROM users u JOIN assignments a ON a.user_id = u.id
    WHERE u.school_id = ? AND u.status = 'active' AND u.role IN ('adviser', 'ict-admin')
      AND a.assignment_role = 'adviser' AND a.school_year = ? AND a.grade_level = ? AND UPPER(a.section) = UPPER(?)
    ORDER BY u.display_name`)
    .bind(user.school_id, schoolYear, gradeLevel, section).all();
  return json({ recipients: (result.results || []).map(row => ({
    id: row.id, displayName: row.display_name, publicKey: JSON.parse(row.public_key_json || '{}')
  })) });
}

async function hasAssignment(env, userId, role, metadata) {
  const subjectKey = role === 'adviser' ? '*' : metadata.subjectKey;
  return Boolean(await env.DB.prepare(`SELECT id FROM assignments WHERE user_id = ? AND assignment_role = ?
    AND school_year = ? AND grade_level = ? AND UPPER(section) = UPPER(?) AND subject_key = ?`)
    .bind(userId, role, metadata.schoolYear, metadata.gradeLevel, metadata.section, subjectKey).first());
}

function normalizeSubmission(body) {
  const metadata = {
    recipientUserId: clean(body.recipientUserId, 80),
    exportId: clean(body.exportId, 120),
    replacesSubmissionId: clean(body.replacesSubmissionId, 80),
    schoolYear: clean(body.schoolYear, 20),
    gradeLevel: clean(body.gradeLevel, 30),
    section: clean(body.section, 80),
    subjectName: clean(body.subjectName, 160),
    subjectKey: clean(body.subjectKey, 120).toUpperCase(),
    term: Number(body.term),
    learnerCount: Number(body.learnerCount)
  };
  if (!metadata.recipientUserId || !metadata.exportId || !metadata.schoolYear || !metadata.gradeLevel
    || !metadata.section || !metadata.subjectName || !metadata.subjectKey || ![1, 2, 3].includes(metadata.term)
    || !Number.isInteger(metadata.learnerCount) || metadata.learnerCount < 1 || metadata.learnerCount > 500) {
    throw new Error('Submission metadata is incomplete or invalid.');
  }
  const envelope = body.envelope;
  if (!envelope || envelope.algorithm !== 'ECDH-P256/AES-256-GCM' || !envelope.ephemeralPublicKey
    || !clean(envelope.iv, 100) || !clean(envelope.ciphertext, MAX_PAYLOAD_BYTES * 2)) {
    throw new Error('Encrypted submission envelope is invalid.');
  }
  const payloadJson = JSON.stringify(envelope);
  const payloadBytes = new TextEncoder().encode(payloadJson).byteLength;
  if (payloadBytes > MAX_PAYLOAD_BYTES) throw new Error('Encrypted submission exceeds the pilot size limit.');
  return { ...metadata, payloadJson, payloadBytes };
}

async function createSubmission(request, env, user) {
  if (!['subject-teacher', 'ict-admin'].includes(user.role)) return json({ error: 'This account cannot submit grades.' }, 403);
  const data = normalizeSubmission(await readJson(request));
  const recipient = await env.DB.prepare(`SELECT * FROM users WHERE id = ? AND school_id = ? AND status = 'active'`)
    .bind(data.recipientUserId, user.school_id).first();
  if (!recipient || !['adviser', 'ict-admin'].includes(recipient.role)) return json({ error: 'Adviser was not found.' }, 404);
  if (user.role !== 'ict-admin' && !(await hasAssignment(env, user.id, 'subject-teacher', data))) {
    return json({ error: 'This subject or section is not assigned to the submitting teacher.' }, 403);
  }
  if (recipient.role !== 'ict-admin' && !(await hasAssignment(env, recipient.id, 'adviser', data))) {
    return json({ error: 'The selected adviser is not assigned to this section.' }, 403);
  }
  const school = await env.DB.prepare('SELECT retention_days FROM schools WHERE id = ?').bind(user.school_id).first();
  const id = randomId();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`INSERT INTO submissions
      (id, school_id, sender_user_id, recipient_user_id, export_id, replaces_submission_id, school_year,
       grade_level, section, subject_name, subject_key, term, learner_count, payload_json, payload_bytes,
       status, created_at, delete_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(id, user.school_id, user.id, recipient.id, data.exportId, data.replacesSubmissionId || null,
        data.schoolYear, data.gradeLevel, data.section, data.subjectName, data.subjectKey, data.term,
        data.learnerCount, data.payloadJson, data.payloadBytes, now, isoAfterDays(school?.retention_days || 30)).run();
  } catch (error) {
    if (/unique/i.test(String(error?.message || error))) return json({ error: 'This grade export was already submitted.' }, 409);
    throw error;
  }
  if (data.replacesSubmissionId) {
    await env.DB.prepare(`UPDATE submissions SET status = 'superseded' WHERE id = ? AND sender_user_id = ? AND status = 'pending'`)
      .bind(data.replacesSubmissionId, user.id).run();
  }
  await audit(env, user.school_id, user.id, 'submission-created', id, `${data.subjectName} term ${data.term}`);
  return json({ success: true, submission: { id, status: 'pending', createdAt: now, deleteAfter: isoAfterDays(school?.retention_days || 30) } }, 201);
}

async function listInbox(request, env, user) {
  if (!['adviser', 'ict-admin'].includes(user.role)) return json({ error: 'This account has no adviser inbox.' }, 403);
  const url = new URL(request.url);
  const schoolYear = clean(url.searchParams.get('schoolYear'), 20);
  const gradeLevel = clean(url.searchParams.get('gradeLevel'), 30);
  const section = clean(url.searchParams.get('section'), 80);
  const result = await env.DB.prepare(`SELECT s.id, s.export_id, s.school_year, s.grade_level, s.section,
    s.subject_name, s.subject_key, s.term, s.learner_count, s.status, s.created_at, s.delete_after,
    u.display_name AS sender_name
    FROM submissions s JOIN users u ON u.id = s.sender_user_id
    WHERE s.recipient_user_id = ? AND s.school_year = ? AND s.grade_level = ? AND UPPER(s.section) = UPPER(?)
      AND s.status IN ('pending', 'rejected')
    ORDER BY s.created_at DESC LIMIT 100`)
    .bind(user.id, schoolYear, gradeLevel, section).all();
  return json({ submissions: (result.results || []).map(row => ({
    id: row.id, exportId: row.export_id, schoolYear: row.school_year, gradeLevel: row.grade_level,
    section: row.section, subjectName: row.subject_name, subjectKey: row.subject_key, term: row.term,
    learnerCount: row.learner_count, status: row.status, senderName: row.sender_name,
    createdAt: row.created_at, deleteAfter: row.delete_after
  })) });
}

async function getSubmission(env, user, id) {
  const row = await env.DB.prepare(`SELECT s.*, u.display_name AS sender_name FROM submissions s
    JOIN users u ON u.id = s.sender_user_id WHERE s.id = ? AND s.recipient_user_id = ?`)
    .bind(id, user.id).first();
  if (!row) return json({ error: 'Submission was not found.' }, 404);
  await audit(env, user.school_id, user.id, 'submission-opened', id);
  return json({ submission: {
    id: row.id, exportId: row.export_id, senderName: row.sender_name, status: row.status,
    subjectName: row.subject_name, term: row.term, createdAt: row.created_at,
    envelope: JSON.parse(row.payload_json)
  } });
}

async function acknowledge(request, env, user, id) {
  const body = await readJson(request);
  const status = clean(body.status, 20);
  if (!['accepted', 'rejected'].includes(status)) return json({ error: 'Acknowledgement must be accepted or rejected.' }, 400);
  const current = await env.DB.prepare('SELECT * FROM submissions WHERE id = ? AND recipient_user_id = ?')
    .bind(id, user.id).first();
  if (!current) return json({ error: 'Submission was not found.' }, 404);
  await env.DB.prepare('UPDATE submissions SET status = ?, acknowledged_at = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), id).run();
  await audit(env, user.school_id, user.id, `submission-${status}`, id, clean(body.note, 300));
  return json({ success: true, status });
}

async function cleanup(env) {
  const now = new Date().toISOString();
  const expired = await env.DB.prepare('SELECT id, school_id FROM submissions WHERE delete_after <= ? LIMIT 500')
    .bind(now).all();
  for (const row of expired.results || []) await audit(env, row.school_id, null, 'submission-expired', row.id);
  await env.DB.prepare('DELETE FROM submissions WHERE delete_after <= ?').bind(now).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  return (expired.results || []).length;
}

async function handle(request, env) {
  if (request.method === 'OPTIONS') return json({}, 204);
  if (!env.DB) return json({ error: 'D1 binding DB is required.' }, 500);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'eclassrecord-grade-pilot', storage: 'd1-only' });
  if (request.method === 'POST' && url.pathname === '/v1/admin/schools') return createSchool(request, env);
  if (request.method === 'POST' && url.pathname === '/v1/admin/users') return createUser(request, env);
  const adminActivationMatch = url.pathname.match(/^\/v1\/admin\/users\/([^/]+)\/activation-code$/);
  if (request.method === 'POST' && adminActivationMatch) return issueActivationCode(request, env, decodeURIComponent(adminActivationMatch[1]));
  const adminStatusMatch = url.pathname.match(/^\/v1\/admin\/users\/([^/]+)\/status$/);
  if (request.method === 'POST' && adminStatusMatch) return setUserStatus(request, env, decodeURIComponent(adminStatusMatch[1]));
  if (request.method === 'POST' && url.pathname === '/v1/activate') return activate(request, env);

  const user = await authenticate(request, env);
  if (!user) return json({ error: 'Sign in again using a new activation code from ICT.' }, 401);
  if (request.method === 'GET' && url.pathname === '/v1/me') return json({ user: publicUser(user) });
  if (request.method === 'GET' && url.pathname === '/v1/recipients') return listRecipients(request, env, user);
  if (request.method === 'POST' && url.pathname === '/v1/submissions') return createSubmission(request, env, user);
  if (request.method === 'GET' && url.pathname === '/v1/submissions/inbox') return listInbox(request, env, user);
  const submissionMatch = url.pathname.match(/^\/v1\/submissions\/([^/]+)$/);
  if (request.method === 'GET' && submissionMatch) return getSubmission(env, user, decodeURIComponent(submissionMatch[1]));
  const acknowledgeMatch = url.pathname.match(/^\/v1\/submissions\/([^/]+)\/acknowledge$/);
  if (request.method === 'POST' && acknowledgeMatch) return acknowledge(request, env, user, decodeURIComponent(acknowledgeMatch[1]));
  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) { return json({ error: error.message || 'Server error.' }, /too large/i.test(error.message || '') ? 413 : 500); }
  },
  async scheduled(_event, env) { await cleanup(env); }
};

export { handle, cleanup, normalizeSubmission, normalizeAssignments };
