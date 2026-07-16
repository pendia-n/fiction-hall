-- D1 Schema for Nocative
-- Cloudflare Workers + D1 version

-- Users
CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  introduction TEXT DEFAULT '',
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  contact TEXT,
  contact_on INTEGER DEFAULT 0,
  last_view_fiction TEXT,
  crypto_address TEXT,
  admin INTEGER DEFAULT 0
);

-- Security questions
CREATE TABLE IF NOT EXISTS question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL
);

-- User security answers
CREATE TABLE IF NOT EXISTS security (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE CASCADE
);

-- Subscription plans
CREATE TABLE IF NOT EXISTS plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  pre_col_lim INTEGER DEFAULT 0,
  pre_col_up REAL DEFAULT 0,
  own_col_lim INTEGER DEFAULT 0,
  own_col_up REAL DEFAULT 0,
  own_wd_lim INTEGER DEFAULT 0,
  own_wd_up REAL DEFAULT 0
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscription (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'active',
  start_date TEXT DEFAULT (datetime('now')),
  end_date TEXT,
  payment_method TEXT DEFAULT 'visa',
  updated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  plan_id INTEGER NOT NULL,
  autorenew INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'monthly',
  user_id INTEGER NOT NULL,
  pre_col_lim INTEGER DEFAULT 0,
  own_col_lim INTEGER DEFAULT 0,
  own_wd_lim INTEGER DEFAULT 0,
  refunded INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'completed',
  FOREIGN KEY (plan_id) REFERENCES plan(id),
  FOREIGN KEY (user_id) REFERENCES user(id)
);

-- Stories (collections)
CREATE TABLE IF NOT EXISTS story (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  description TEXT DEFAULT '',
  user_id INTEGER NOT NULL,
  tw_lim INTEGER DEFAULT 0,
  genre TEXT,
  num_free INTEGER DEFAULT 0,
  require_free INTEGER DEFAULT 3,
  sellable_count INTEGER DEFAULT 0,
  rental_price INTEGER DEFAULT 14,
  perm_price INTEGER DEFAULT 21,
  pricing_updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Labels
CREATE TABLE IF NOT EXISTS label (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

-- Story-Label junction
CREATE TABLE IF NOT EXISTS story_label (
  story_id INTEGER NOT NULL,
  label_id INTEGER NOT NULL,
  PRIMARY KEY (story_id, label_id),
  FOREIGN KEY (story_id) REFERENCES story(id) ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES label(id) ON DELETE CASCADE
);

-- Writings (notes/chapters)
CREATE TABLE IF NOT EXISTS writing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  text TEXT DEFAULT '',
  story_id INTEGER NOT NULL,
  live INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  free INTEGER DEFAULT 1,
  UNIQUE (story_id, title),
  FOREIGN KEY (story_id) REFERENCES story(id) ON DELETE CASCADE
);

-- Writing-Label junction
CREATE TABLE IF NOT EXISTS writing_label (
  writing_id INTEGER NOT NULL,
  label_id INTEGER NOT NULL,
  PRIMARY KEY (writing_id, label_id),
  FOREIGN KEY (writing_id) REFERENCES writing(id) ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES label(id) ON DELETE CASCADE
);

-- Writing views (for view count)
CREATE TABLE IF NOT EXISTS writing_view (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  writing_id INTEGER NOT NULL,
  finger TEXT DEFAULT '',
  updated TEXT DEFAULT (datetime('now')),
  focused INTEGER DEFAULT 0,
  FOREIGN KEY (writing_id) REFERENCES writing(id) ON DELETE CASCADE
);

-- Story emotions (likes)
CREATE TABLE IF NOT EXISTS story_emotion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emotion TEXT DEFAULT 'like',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (story_id) REFERENCES story(id) ON DELETE CASCADE,
  UNIQUE (story_id, user_id)
);

-- Story unlocks (paid access)
CREATE TABLE IF NOT EXISTS story_unlock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  active INTEGER DEFAULT 1,
  user_id INTEGER NOT NULL,
  story_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  unlock_type TEXT DEFAULT 'TIME_LIMITED',
  FOREIGN KEY (story_id) REFERENCES story(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  UNIQUE (user_id, story_id)
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'completed',
  story_id INTEGER,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  fmv REAL,
  method TEXT DEFAULT 'visa',
  platform_cut REAL NOT NULL,
  purchase_type TEXT NOT NULL,
  seller_cut REAL NOT NULL,
  stripe_id TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id),
  FOREIGN KEY (story_id) REFERENCES story(id)
);

-- Auto-save tracking (replaces WebSocket)
CREATE TABLE IF NOT EXISTS writing_autosave (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  writing_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT DEFAULT '',
  title TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (writing_id) REFERENCES writing(id) ON DELETE CASCADE,
  UNIQUE (writing_id, user_id)
);

-- Insert default plans
INSERT OR IGNORE INTO plan (id, name, price, pre_col_lim, pre_col_up, own_col_lim, own_col_up, own_wd_lim, own_wd_up) VALUES
(1, 'Free', 0, 0, 4, 999, 999999999, 100000, 999999999),
(2, 'Basic', 12.99, 0, 2, 3, 2, 20000, 2),
(3, 'Standard', 29.99, 0, 2, 8, 2, 50000, 2),
(4, 'Exclusive', 69.99, 0, 2, NULL, 0, 125000, 2);

-- Live streams
CREATE TABLE IF NOT EXISTS live_stream (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  room_name TEXT UNIQUE NOT NULL,
  livekit_token TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Gifts (tips during live streams)
CREATE TABLE IF NOT EXISTS gift (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id INTEGER NOT NULL,
  from_user_id INTEGER,
  to_user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  message TEXT DEFAULT '',
  stripe_payment_intent_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (stream_id) REFERENCES live_stream(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES user(id),
  FOREIGN KEY (to_user_id) REFERENCES user(id)
);

-- Insert security questions
INSERT OR IGNORE INTO question (id, question) VALUES
(1, 'Which one film that you will watch at least once a year?'),
(2, 'What transport do you take mostly?'),
(3, 'What kind of wedding cake you like it to be?'),
(4, 'Whose songs you love to indulge into when you are bored?'),
(5, 'Whose songs you love to indulge into when you are sad?'),
(6, 'Whose songs you love to indulge into when you are delighted?'),
(7, 'Why this job?'),
(8, 'What childhood dream that you discarded?'),
(9, 'How would you like the world to be?'),
(10, 'Should you meet your role model, what will do you then?'),
(11, 'Most brilliant actor or actress in your opinion is?'),
(12, 'Favorite genre of films?'),
(13, 'What history you would like to change?'),
(14, 'Pop vs R&B vs Country vs Classical?'),
(15, 'Linux vs Mac vs Windows?'),
(16, 'What are your mbti and horoscope type?'),
(17, 'Any motto or quote from you or from others that you find aspirational?'),
(18, 'Particular meaning of your given name?'),
(19, 'Do you think advancing into workplace without college is great?'),
(20, 'Nickname of your close friend and why?'),
(21, 'Best subject at school being?'),
(22, 'If you have a trendy youtube channel, what content will be your focus?'),
(23, 'Do you like Young Sheldon or Sheldon from BBT?'),
(24, 'If you have a painting as a gift, what content will that be?'),
(25, 'Any habit you will like to develop?'),
(26, 'Coffee vs Tea vs Fruit Juice?'),
(27, 'Show me your best rizz?'),
(28, 'What languages do you know?'),
(29, 'Are you religious?'),
(30, 'Rocket Sport vs Contact Sport?');
