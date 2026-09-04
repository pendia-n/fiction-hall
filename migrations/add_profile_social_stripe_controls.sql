ALTER TABLE user ADD COLUMN stripe_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user ADD COLUMN twitter_username TEXT;
ALTER TABLE user ADD COLUMN reddit_username TEXT;
ALTER TABLE user ADD COLUMN substack_username TEXT;

UPDATE user SET stripe_enabled = 1 WHERE stripe_account_id IS NOT NULL;
