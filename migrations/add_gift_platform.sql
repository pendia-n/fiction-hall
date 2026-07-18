-- Migration: make gift table support platform_amount + collection_id + nullable stream_id
DROP TABLE IF EXISTS gift;
CREATE TABLE gift (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id INTEGER,
  collection_id INTEGER,
  from_user_id INTEGER,
  to_user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  platform_amount REAL DEFAULT 0,
  message TEXT DEFAULT '',
  stripe_payment_intent_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (stream_id) REFERENCES live_stream(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES story(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES user(id),
  FOREIGN KEY (to_user_id) REFERENCES user(id)
);
