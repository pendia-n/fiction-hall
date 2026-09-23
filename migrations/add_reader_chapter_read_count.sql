CREATE TABLE IF NOT EXISTS reader_chapter_read_count (
  user_id INTEGER NOT NULL,
  writing_id INTEGER NOT NULL,
  totalPerChapterCountRead INTEGER NOT NULL DEFAULT 0,
  first_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, writing_id),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (writing_id) REFERENCES writing(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reader_chapter_read_user_total
  ON reader_chapter_read_count(user_id, totalPerChapterCountRead DESC);
