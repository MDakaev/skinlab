-- Admin broadcasts and users who blocked the bot (skip them next time).

ALTER TABLE users ADD COLUMN bot_blocked INTEGER NOT NULL DEFAULT 0;

CREATE TABLE broadcasts (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  audience TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor_id TEXT NOT NULL DEFAULT '',
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX idx_broadcasts_status ON broadcasts(status, created_at);
