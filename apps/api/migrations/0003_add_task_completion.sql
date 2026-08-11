CREATE TABLE achievements_new (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('RESEARCH','EMULATION','TASK_COMPLETION','CERTIFICATE','MEDAL','OTHER')),
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

INSERT INTO achievements_new
SELECT * FROM achievements;

CREATE TABLE attachments_new (
  id TEXT PRIMARY KEY,
  achievement_id TEXT NOT NULL REFERENCES achievements_new(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO attachments_new
SELECT * FROM attachments;

DROP TABLE attachments;
DROP TABLE achievements;
ALTER TABLE achievements_new RENAME TO achievements;
ALTER TABLE attachments_new RENAME TO attachments;

CREATE INDEX idx_achievements_employee ON achievements(employee_id);
CREATE INDEX idx_achievements_filter ON achievements(type, level, year);
