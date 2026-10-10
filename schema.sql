CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  details TEXT NOT NULL DEFAULT '',
  due_date DATE NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_archived_created_at_idx
  ON tasks (archived, created_at);

CREATE INDEX IF NOT EXISTS tasks_due_date_idx
  ON tasks (due_date);
