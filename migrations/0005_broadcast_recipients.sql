-- Store planned recipient count for broadcast progress / history UI.

ALTER TABLE broadcasts ADD COLUMN recipients_total INTEGER NOT NULL DEFAULT 0;
