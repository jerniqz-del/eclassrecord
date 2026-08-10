PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 90),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('subject-teacher', 'adviser', 'ict-admin')),
  public_key_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  created_at TEXT NOT NULL,
  activated_at TEXT
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  school_year TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  section TEXT NOT NULL,
  subject_key TEXT NOT NULL DEFAULT '*',
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('subject-teacher', 'adviser')),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, school_year, grade_level, section, subject_key, assignment_role)
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  recipient_user_id TEXT NOT NULL REFERENCES users(id),
  export_id TEXT NOT NULL,
  replaces_submission_id TEXT,
  school_year TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  section TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  term INTEGER NOT NULL CHECK (term BETWEEN 1 AND 3),
  learner_count INTEGER NOT NULL CHECK (learner_count BETWEEN 1 AND 500),
  payload_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  delete_after TEXT NOT NULL,
  UNIQUE (school_id, export_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  actor_user_id TEXT,
  action TEXT NOT NULL,
  submission_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_assignments_scope ON assignments(school_year, grade_level, section, subject_key, assignment_role);
CREATE INDEX IF NOT EXISTS idx_submissions_inbox ON submissions(recipient_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_retention ON submissions(delete_after);
CREATE INDEX IF NOT EXISTS idx_audit_school_time ON audit_logs(school_id, created_at);
