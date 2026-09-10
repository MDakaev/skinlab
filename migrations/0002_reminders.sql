-- Daily morning/evening reminder settings (bot-managed).
-- next_*_at are precomputed UTC ISO timestamps for cheap cron queries.

CREATE TABLE reminder_settings (
  telegram_id TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  tz_offset_minutes INTEGER NOT NULL DEFAULT 180,
  morning_minute_local INTEGER NOT NULL DEFAULT 480,
  evening_minute_local INTEGER NOT NULL DEFAULT 1260,
  next_morning_at TEXT,
  next_evening_at TEXT,
  setup_step TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

CREATE INDEX idx_reminders_morning_due
  ON reminder_settings (enabled, next_morning_at);

CREATE INDEX idx_reminders_evening_due
  ON reminder_settings (enabled, next_evening_at);
