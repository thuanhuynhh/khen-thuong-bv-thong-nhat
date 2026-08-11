PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','HR','REVIEWER','VIEWER')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_token ON sessions(token_hash, expires_at);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  citizen_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('NAM','NU','KHAC')),
  date_of_birth TEXT NOT NULL,
  education TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  professional_title TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employees_name ON employees(full_name);
CREATE INDEX idx_employees_unit ON employees(unit);
CREATE INDEX idx_employees_citizen_id ON employees(citizen_id);

CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('RESEARCH','EMULATION','CERTIFICATE','MEDAL','OTHER')),
  level TEXT NOT NULL,
  title TEXT NOT NULL,
  accepted_date TEXT NOT NULL,
  year INTEGER NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  decision_number TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_achievements_employee ON achievements(employee_id);
CREATE INDEX idx_achievements_filter ON achievements(type, level, year);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reward_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  reward_level TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

INSERT INTO reward_rules (id, name, reward_type, reward_level, conditions_json, priority)
VALUES ('default-medal-3', 'Thủ tướng + đề tài cấp Bộ', 'MEDAL', 'HANG_BA',
  '{"all":[{"type":"CERTIFICATE","level":"THU_TUONG"},{"type":"RESEARCH","level":"BO"}]}', 100);
