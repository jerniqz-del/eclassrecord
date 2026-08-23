PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name_ciphertext TEXT NOT NULL,
  school_email_hmac TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 3650),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  display_name_ciphertext TEXT NOT NULL,
  personnel_code_hash TEXT NOT NULL,
  personnel_code_version INTEGER NOT NULL DEFAULT 1,
  personnel_code_issued_at TEXT NOT NULL,
  personnel_code_rotated_at TEXT,
  role TEXT NOT NULL CHECK (role IN (
    'subject-teacher', 'adviser', 'school-ict', 'school-admin', 'school-head'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'disabled')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (school_id, personnel_code_hash)
);

CREATE TABLE IF NOT EXISTS activation_attempts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  code_fingerprint TEXT NOT NULL,
  device_id TEXT,
  platform TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'limited', 'blocked')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activation_attempts_window
  ON activation_attempts(school_id, code_fingerprint, created_at);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  label_ciphertext TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('desktop', 'android')),
  platform_slot INTEGER CHECK (platform_slot IN (1, 2)),
  public_encryption_key_json TEXT NOT NULL,
  public_signing_key_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  approved_by_user_id TEXT,
  approved_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (user_id, platform, platform_slot)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_admin_leases (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  school_id TEXT NOT NULL REFERENCES schools(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  lease_version INTEGER NOT NULL DEFAULT 1,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  school_year TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  section_ciphertext TEXT NOT NULL,
  section_lookup_hmac TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('subject-teacher', 'adviser')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, school_year, section_lookup_hmac, subject_key, assignment_role)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('personnel-management', 'announcement')),
  action_code TEXT NOT NULL,
  target_id TEXT,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  encrypted_payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'overridden', 'cancelled', 'failed'
  )),
  decided_by_user_id TEXT,
  override_grant_id TEXT,
  decision_note_ciphertext TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  applied_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS override_grants (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  issued_by_user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL CHECK (scope IN ('personnel-management', 'announcement', 'specific-request')),
  request_id TEXT,
  code_hash TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 10),
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  approval_request_id TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'important', 'emergency')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all', 'role', 'users')),
  audience_role TEXT,
  encrypted_payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending', 'scheduled', 'published', 'rejected', 'archived', 'expired'
  )),
  requires_ack INTEGER NOT NULL DEFAULT 0 CHECK (requires_ack IN (0, 1)),
  publish_at TEXT,
  expires_at TEXT,
  published_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  delivered_at TEXT,
  read_at TEXT,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS announcement_acknowledgments (
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  acknowledged_at TEXT NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS key_envelopes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  key_purpose TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  envelope_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (device_id, key_purpose, key_version)
);

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  source_device_id TEXT NOT NULL REFERENCES devices(id),
  stream_key TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  event_revision INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  encrypted_payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (school_id, idempotency_key),
  UNIQUE (school_id, stream_key, event_revision)
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  stream_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  r2_object_key TEXT NOT NULL UNIQUE,
  encrypted_bytes INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_by_device_id TEXT NOT NULL REFERENCES devices(id),
  created_at TEXT NOT NULL,
  UNIQUE (school_id, stream_key, revision)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  actor_user_id TEXT,
  actor_device_id TEXT,
  action_code TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  encrypted_detail_json TEXT,
  previous_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_school_role ON users(school_id, role, status);
CREATE INDEX IF NOT EXISTS idx_users_personnel_code ON users(school_id, personnel_code_hash, status);
CREATE INDEX IF NOT EXISTS idx_devices_user_status ON devices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_leases_expiry ON active_admin_leases(expires_at);
CREATE INDEX IF NOT EXISTS idx_approvals_head_queue ON approval_requests(school_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_override_expiry ON override_grants(school_id, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_announcements_feed ON announcements(school_id, status, publish_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON announcement_deliveries(user_id, announcement_id);
CREATE INDEX IF NOT EXISTS idx_sync_stream ON sync_events(school_id, stream_key, event_revision);
CREATE INDEX IF NOT EXISTS idx_audit_school_time ON audit_logs(school_id, created_at);

INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
VALUES (2, 'permanent-personnel-code-authentication', datetime('now'));
