CREATE TABLE IF NOT EXISTS stripe_checkout_fulfillment (
  session_id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL,
  flow TEXT NOT NULL CHECK (flow IN ('unlock', 'gift')),
  user_id INTEGER NOT NULL,
  story_id INTEGER,
  payment_method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_cents INTEGER NOT NULL,
  seller_cents INTEGER NOT NULL,
  fulfilled_at TEXT NOT NULL DEFAULT (datetime('now'))
);
