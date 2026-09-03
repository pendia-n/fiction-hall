ALTER TABLE user ADD COLUMN arbitrum_wallet TEXT;
ALTER TABLE user ADD COLUMN crypto_okay INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS crypto_purchase_quote (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  item_id TEXT NOT NULL,
  reader_ref TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  story_id INTEGER NOT NULL,
  writer_id INTEGER NOT NULL,
  writer_wallet TEXT NOT NULL,
  token_symbol TEXT NOT NULL CHECK (token_symbol IN ('USDC', 'USDT', 'DAI')),
  token_address TEXT NOT NULL,
  unlock_type TEXT NOT NULL CHECK (unlock_type IN ('TIME_LIMITED', 'PERM_UNLOCK')),
  split_id INTEGER NOT NULL CHECK (split_id IN (0, 1)),
  usd_amount_e6 TEXT NOT NULL,
  token_amount TEXT NOT NULL,
  token_decimals INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  nonce TEXT NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired')),
  tx_hash TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (story_id) REFERENCES story(id),
  FOREIGN KEY (writer_id) REFERENCES user(id)
);

CREATE INDEX IF NOT EXISTS idx_crypto_quote_user ON crypto_purchase_quote(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crypto_quote_story ON crypto_purchase_quote(story_id, status);
