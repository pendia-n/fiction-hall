-- Exact, immutable-on-insert snapshot of each verified on-chain crypto payment.
-- Token amounts are base-unit decimal strings; divide by 10^token_decimals for display.
CREATE TABLE IF NOT EXISTS crypto_payment_receipt (
  quote_id TEXT PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  block_number TEXT NOT NULL,
  transaction_utc TEXT NOT NULL,
  buyer_user_id INTEGER NOT NULL,
  buyer_username TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  seller_user_id INTEGER NOT NULL,
  seller_username TEXT NOT NULL,
  seller_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_decimals INTEGER NOT NULL,
  total_token_amount TEXT NOT NULL,
  seller_token_amount TEXT NOT NULL,
  platform_token_amount TEXT NOT NULL,
  quoted_usd_amount_e6 TEXT NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES crypto_purchase_quote(id)
);
