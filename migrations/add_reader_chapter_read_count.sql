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

-- Preserve existing visits where the legacy finger value is an exact user ID.
INSERT OR IGNORE INTO reader_chapter_read_count
  (user_id, writing_id, totalPerChapterCountRead, first_read_at, last_read_at)
SELECT
  u.id,
  w.id,
  COUNT(*),
  MIN(COALESCE(NULLIF(wv.updated, ''), datetime('now'))),
  MAX(COALESCE(NULLIF(wv.updated, ''), datetime('now')))
FROM writing_view wv
JOIN user u ON u.id = CAST(wv.finger AS INTEGER)
JOIN writing w ON w.id = wv.writing_id
WHERE wv.finger <> '' AND wv.finger NOT GLOB '*[^0-9]*'
GROUP BY u.id, w.id;
