ALTER TABLE crypto_purchase_quote ADD COLUMN scan_block TEXT;
CREATE INDEX IF NOT EXISTS idx_crypto_pending ON crypto_purchase_quote(status, confirmed_at);
-- Backfill Stripe rental dates previously stored only in end_date on production.
UPDATE story_unlock SET expires_at = end_date WHERE unlock_type = 'TIME_LIMITED' AND expires_at IS NULL AND end_date IS NOT NULL;
