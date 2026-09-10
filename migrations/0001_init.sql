-- SkinLab core schema: users, subscriptions, payments.

CREATE TABLE users (
  telegram_id TEXT PRIMARY KEY NOT NULL,
  username TEXT,
  first_name TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE subscriptions (
  telegram_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT,
  paid_until TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  telegram_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount_rub INTEGER NOT NULL,
  status TEXT NOT NULL,
  platega_tx_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
);

CREATE INDEX idx_payments_telegram ON payments(telegram_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_platega ON payments(platega_tx_id);
CREATE INDEX idx_subscriptions_paid_until ON subscriptions(paid_until);
