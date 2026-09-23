CREATE TABLE IF NOT EXISTS reader_bookmark (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  writing_id INTEGER NOT NULL,
  excerpt TEXT NOT NULL CHECK (length(trim(excerpt)) BETWEEN 1 AND 280),
  reflection TEXT NOT NULL CHECK (length(trim(reflection)) BETWEEN 1 AND 600),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (writing_id) REFERENCES writing(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reader_bookmark_public_feed
  ON reader_bookmark(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reader_bookmark_owner_feed
  ON reader_bookmark(user_id, created_at DESC, id DESC);
