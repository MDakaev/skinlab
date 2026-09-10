-- Mini App skin profile (quiz, shelf, concerns) — JSON blob on users.
-- Source of truth for persistent profile; localStorage is cache only.

ALTER TABLE users ADD COLUMN profile_json TEXT;
ALTER TABLE users ADD COLUMN profile_updated_at TEXT;
