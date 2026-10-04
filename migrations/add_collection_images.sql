CREATE TABLE IF NOT EXISTS collection_image (
  id TEXT PRIMARY KEY,
  story_id INTEGER NOT NULL,
  writing_id INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  thumbnail_key TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (story_id) REFERENCES story(id) ON DELETE CASCADE,
  FOREIGN KEY (writing_id) REFERENCES writing(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_image_story_created
  ON collection_image(story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_image_note_created
  ON collection_image(writing_id, created_at DESC);
