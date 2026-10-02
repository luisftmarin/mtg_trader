-- Run after 005_trades.sql
-- In-trade comments and the notification bell.

CREATE TABLE IF NOT EXISTS trade_comments (
  id SERIAL PRIMARY KEY,
  trade_id INT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  author_id INT NOT NULL REFERENCES friends(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_comments_trade_id_idx ON trade_comments(trade_id);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  friend_id INT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_friend_read_idx ON notifications(friend_id, read_at);
