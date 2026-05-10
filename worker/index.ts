import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import { SPA_HTML } from './spa_html';
import bcrypt from 'bcryptjs';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_URL: string;
}

const app = new Hono<{ Bindings: Env; Variables: { userId: number; username: string; publicName: string } }>();

app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }));

// ── Password hashing ──
async function hashPassword(password: string): Promise<string> {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try { return bcrypt.compareSync(password, stored); } catch { return false; }
}

// ── Auth middleware ──
async function authMiddleware(c: any, next: any) {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verify(auth.substring(7), c.env.JWT_SECRET, 'HS256');
    c.set('userId', payload.userId);
    c.set('username', payload.username);
    c.set('publicName', payload.publicName);
    await next();
  } catch { return c.json({ error: 'Invalid token' }, 401); }
}

// ── Optional auth middleware (sets userId if token present, doesn't require it) ──
async function optionalAuth(c: any, next: any) {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = await verify(auth.substring(7), c.env.JWT_SECRET, 'HS256');
      c.set('userId', payload.userId);
      c.set('username', payload.username);
      c.set('publicName', payload.publicName);
    } catch { /* invalid token, continue as anonymous */ }
  }
  await next();
}

// ── Word count helper ──
function wordCount(text: string): number {
  if (!text) return 0;
  return text.replace(/<[^>]*>/g, ' ').replace(/[#*>`~\[\]{}|]/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════

app.get('/api/auth/check/username', async (c) => {
  const username = c.req.query('username');
  if (!username) return c.json({ error: 'Username required' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first();
  return c.json({ available: !existing });
});

app.get('/api/auth/check/display', async (c) => {
  const display = c.req.query('display');
  const userId = c.req.query('userId');
  if (!display) return c.json({ error: 'Display required' }, 400);
  let sql = 'SELECT id FROM user WHERE display = ?';
  const params: any[] = [display];
  if (userId) { sql += ' AND id != ?'; params.push(userId); }
  const existing = await c.env.DB.prepare(sql).bind(...params).first();
  return c.json({ available: !existing });
});

app.post('/api/auth/register', async (c) => {
  const { username, display, password } = await c.req.json();
  if (!username || !display || !password) return c.json({ error: 'All fields required' }, 400);
  if (password.length < 7) return c.json({ error: 'Password must be at least 7 characters' }, 400);
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE username = ? OR display = ?').bind(username, display).first();
  if (existing) return c.json({ error: 'Username or display name already taken' }, 409);
  const hashed = await hashPassword(password);
  const result = await c.env.DB.prepare('INSERT INTO user (username, display, password) VALUES (?, ?, ?)').bind(username, display, hashed).run();
  const userId = result.meta.last_row_id;
  const token = await sign({ userId, username, publicName: display }, c.env.JWT_SECRET);
  return c.json({ token, userId, username, publicName: display }, 201);
});

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM user WHERE username = ?').bind(username).first<any>();
  if (!user || !await verifyPassword(password, user.password)) return c.json({ error: 'Invalid credentials' }, 401);
  const token = await sign({ userId: user.id, username: user.username, publicName: user.display }, c.env.JWT_SECRET);
  return c.json({ token, userId: user.id, username: user.username, publicName: user.display });
});

app.get('/api/auth/status', authMiddleware, async (c) => {
  const user = await c.env.DB.prepare('SELECT id, display, username, introduction, contact, contact_on, totp_enabled, admin FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json(user);
});

app.get('/api/auth/questions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, question FROM question ORDER BY id').all();
  return c.json(results);
});

app.post('/api/auth/questions', authMiddleware, async (c) => {
  const { questions } = await c.req.json();
  if (!Array.isArray(questions) || questions.length < 3) return c.json({ error: 'At least 3 security questions required' }, 400);
  const userId = c.get('userId');
  await c.env.DB.prepare('DELETE FROM security WHERE user_id = ?').bind(userId).run();
  for (const q of questions) {
    await c.env.DB.prepare('INSERT INTO security (user_id, question_id, answer) VALUES (?, ?, ?)').bind(userId, q.questionId, q.answer).run();
  }
  return c.json({ message: 'Security questions saved' });
});

app.get('/api/auth/questions/me', authMiddleware, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT s.id, s.question_id, s.answer, q.question FROM security s JOIN question q ON s.question_id = q.id WHERE s.user_id = ?').bind(c.get('userId')).all();
  return c.json(results);
});

app.post('/api/auth/questions/verify', async (c) => {
  const { username, answers } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first<{ id: number }>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT question_id, answer FROM security WHERE user_id = ?').bind(user.id).all<{ question_id: number; answer: string }>();
  let correct = 0;
  for (const a of answers) {
    const found = results.find(r => r.question_id === a.questionId);
    if (found && found.answer.toLowerCase().trim() === a.answer.toLowerCase().trim()) correct++;
  }
  if (correct < 3) return c.json({ error: 'Incorrect answers' }, 401);
  return c.json({ verified: true, userId: user.id });
});

app.post('/api/auth/reset-password', async (c) => {
  const { userId, newPassword } = await c.req.json();
  if (!userId || !newPassword) return c.json({ error: 'Missing fields' }, 400);
  const hashed = await hashPassword(newPassword);
  await c.env.DB.prepare('UPDATE user SET password = ? WHERE id = ?').bind(hashed, userId).run();
  return c.json({ message: 'Password reset successful' });
});

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════

app.get('/api/profile', authMiddleware, async (c) => {
  const user = await c.env.DB.prepare('SELECT id, display, username, introduction, contact, contact_on, totp_enabled, admin, created_at FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json(user);
});

app.put('/api/profile', authMiddleware, async (c) => {
  const { display, introduction, contact, contact_on } = await c.req.json();
  const userId = c.get('userId');
  if (display) {
    const existing = await c.env.DB.prepare('SELECT id FROM user WHERE display = ? AND id != ?').bind(display, userId).first();
    if (existing) return c.json({ error: 'Display name already taken' }, 409);
  }
  await c.env.DB.prepare('UPDATE user SET display = COALESCE(?, display), introduction = COALESCE(?, introduction), contact = COALESCE(?, contact), contact_on = COALESCE(?, contact_on), updated_at = datetime("now") WHERE id = ?').bind(display, introduction, contact, contact_on, userId).run();
  return c.json({ message: 'Profile updated' });
});

// Get recently viewed notes for the authenticated user
app.get('/api/profile/recent-views', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT last_view_fiction FROM user WHERE id = ?').bind(userId).first<{ last_view_fiction: string }>();
  if (!user?.last_view_fiction) return c.json({ notes: [] });

  const ids = user.last_view_fiction.split(',').map(Number).filter(id => !isNaN(id));
  if (ids.length === 0) return c.json({ notes: [] });

  // Get the notes in the order they were viewed (most recent first)
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.word_count, w.story_id, w.free, w.created_at, s.title as story_title, u.display as author_display
     FROM writing w
     JOIN story s ON w.story_id = s.id
     JOIN user u ON s.user_id = u.id
     WHERE w.id IN (${placeholders})`
  ).bind(...ids).all();

  // Sort by the order in last_view_fiction (most recent last → reverse for display)
  const ordered = [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const found = (results as any[]).find(r => r.id === ids[i]);
    if (found) ordered.push(found);
  }

  return c.json({ notes: ordered });
});

// Get user's own notes
app.get('/api/profile/my-notes', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.title, w.word_count, w.story_id, w.free, w.created_at, w.live, s.title as story_title
     FROM writing w
     JOIN story s ON w.story_id = s.id
     WHERE s.user_id = ?
     ORDER BY w.updated_at DESC
     LIMIT 100`
  ).bind(userId).all();
  return c.json({ notes: results });
});

// ═══════════════════════════════════════════
// TOTP
// ═══════════════════════════════════════════

app.get('/api/auth/totp/status', authMiddleware, async (c) => {
  const user = await c.env.DB.prepare('SELECT totp_enabled, totp_secret FROM user WHERE id = ?').bind(c.get('userId')).first();
  return c.json({ enabled: user?.totp_enabled, hasSecret: !!user?.totp_secret });
});

app.post('/api/auth/totp/setup', authMiddleware, async (c) => {
  const { secret } = await c.req.json();
  // If secret is provided (from registration), use it; otherwise generate new
  const finalSecret = secret || Array.from({ length: 32 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]).join('');
  await c.env.DB.prepare('UPDATE user SET totp_secret = ? WHERE id = ?').bind(finalSecret, c.get('userId')).run();
  return c.json({ secret: finalSecret, qrUrl: `otpauth://totp/Nocative:${c.get('username')}?secret=${finalSecret}&issuer=Nocative` });
});

app.post('/api/auth/totp/verify', authMiddleware, async (c) => {
  const { code } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT totp_secret FROM user WHERE id = ?').bind(c.get('userId')).first<{ totp_secret: string }>();
  if (!user?.totp_secret) return c.json({ error: 'TOTP not set up' }, 400);
  const expected = generateTOTP(user.totp_secret);
  if (code !== expected) return c.json({ error: 'Invalid code' }, 401);
  await c.env.DB.prepare('UPDATE user SET totp_enabled = 1 WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ message: 'TOTP enabled' });
});

app.post('/api/auth/totp/disable', authMiddleware, async (c) => {
  await c.env.DB.prepare('UPDATE user SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').bind(c.get('userId')).run();
  return c.json({ message: 'TOTP disabled' });
});

function generateTOTP(secret: string): string {
  const epoch = Math.floor(Date.now() / 30000);
  const hash = simpleHash(secret + epoch);
  return (hash % 1000000).toString().padStart(6, '0');
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ═══════════════════════════════════════════
// PLANS
// ═══════════════════════════════════════════

app.get('/api/plans', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM plan ORDER BY price').all();
  return c.json(results);
});

app.get('/api/plans/current', authMiddleware, async (c) => {
  const sub = await c.env.DB.prepare('SELECT s.*, p.name as plan_name, p.price FROM subscription s JOIN plan p ON s.plan_id = p.id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 1').bind(c.get('userId')).first();
  return c.json(sub);
});

// ═══════════════════════════════════════════
// STRIPE
// ═══════════════════════════════════════════

app.post('/api/stripe/checkout', authMiddleware, async (c) => {
  const { planId } = await c.req.json();
  const plan = await c.env.DB.prepare('SELECT * FROM plan WHERE id = ?').bind(planId).first<any>();
  if (!plan) return c.json({ error: 'Plan not found' }, 404);

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'payment_method_types[]': 'card', mode: 'payment',
      success_url: `${c.env.APP_URL}/fiction?payment=success`,
      cancel_url: `${c.env.APP_URL}/fiction?payment=cancelled`,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `${plan.name} Plan`,
      'line_items[0][price_data][unit_amount]': Math.round(plan.price * 100).toString(),
      'line_items[0][quantity]': '1',
      'metadata[plan_id]': planId.toString(),
      'metadata[user_id]': c.get('userId').toString(),
    }).toString(),
  }).then((r: any) => r.json());

  return c.json({ url: session.url, sessionId: session.id });
});

app.post('/api/stripe/webhook', async (c) => {
  const body = await c.req.text();
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'No signature' }, 400);
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const planId = parseInt(session.metadata.plan_id);
    const userId = parseInt(session.metadata.user_id);
    const amount = session.amount_total / 100;
    await c.env.DB.prepare("UPDATE subscription SET status = 'expired' WHERE user_id = ? AND status = 'active'").bind(userId).run();
    const endDate = new Date(); endDate.setFullYear(endDate.getFullYear() + 100);
    await c.env.DB.prepare('INSERT INTO subscription (user_id, plan_id, status, end_date, payment_method, mode, pre_col_lim, own_col_lim, own_wd_lim) VALUES (?, ?, "active", ?, "visa", "forever", 0, ?, ?)').bind(userId, planId, endDate.toISOString(), 999, 100000).run();
    await c.env.DB.prepare('INSERT INTO purchase (user_id, amount, platform_cut, seller_cut, purchase_type, method, stripe_id, status) VALUES (?, ?, 0, 0, "PERM_UNLOCK", "visa", ?, "completed")').bind(userId, amount, session.id).run();
  }
  return c.json({ received: true });
});

// ═══════════════════════════════════════════
// COLLECTIONS (STORIES)
// ═══════════════════════════════════════════

app.get('/api/collections', async (c) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const title = url.searchParams.get('title') || '';
  const author = url.searchParams.get('author') || '';
  const genre = url.searchParams.get('genre') || '';
  const labels = url.searchParams.get('labels') || '';
  const twLim = parseInt(url.searchParams.get('twLim') || '0');

  let sql = `SELECT s.*, u.display as author_display,
    (SELECT COALESCE(SUM(w.word_count), 0) FROM writing w WHERE w.story_id = s.id) as total_word_count,
    (SELECT COUNT(*) FROM writing w WHERE w.story_id = s.id) as total_note_count,
    (SELECT COUNT(*) FROM story_emotion se WHERE se.story_id = s.id AND se.emotion = 'like') as total_likes
    FROM story s JOIN user u ON s.user_id = u.id WHERE 1=1`;
  const params: any[] = [];

  if (title) { sql += ' AND s.title LIKE ?'; params.push(`%${title}%`); }
  if (author) { sql += ' AND u.display LIKE ?'; params.push(`%${author}%`); }
  if (genre) { sql += ' AND s.genre = ?'; params.push(genre); }

  sql += ' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  let collections = results as any[];

  if (labels) {
    const labelArr = labels.split(',').map((l: string) => l.trim()).filter((l: any) => l);
    const filtered: any[] = [];
    for (const col of collections) {
      const { results: storyLabels } = await c.env.DB.prepare('SELECT l.name FROM story_label sl JOIN label l ON sl.label_id = l.id WHERE sl.story_id = ?').bind(col.id).all<any>();
      if (labelArr.some((l: string) => storyLabels.some((sl: any) => sl.name === l))) filtered.push(col);
    }
    collections = filtered;
  }
  if (twLim > 0) collections = collections.filter((c: any) => (c.total_word_count || 0) >= twLim);

  for (const col of collections) {
    const { results: storyLabels } = await c.env.DB.prepare('SELECT l.name FROM story_label sl JOIN label l ON sl.label_id = l.id WHERE sl.story_id = ?').bind(col.id).all();
    (col as any).labels = storyLabels;
  }

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as total FROM story').first<{ total: number }>();
  return c.json({ collections, pagination: { page, pageSize, total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / pageSize) } });
});

app.get('/api/collections/author/:display', async (c) => {
  const display = c.req.param('display');
  const user = await c.env.DB.prepare('SELECT id FROM user WHERE display = ?').bind(display).first<{ id: number }>();
  if (!user) return c.json({ error: 'Author not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.user_id = ? ORDER BY s.updated_at DESC').bind(user.id).all();
  return c.json(results);
});

app.get('/api/collections/:id', async (c) => {
  const id = c.req.param('id');
  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(id).first<any>();
  if (!story) return c.json({ error: 'Not found' }, 404);

  const { results: chapters } = await c.env.DB.prepare('SELECT id, title, created_at, updated_at, word_count, live, free FROM writing WHERE story_id = ? ORDER BY created_at').bind(id).all();
  const { results: labels } = await c.env.DB.prepare('SELECT l.name FROM story_label sl JOIN label l ON sl.label_id = l.id WHERE sl.story_id = ?').bind(id).all();
  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM story_emotion WHERE story_id = ? AND emotion = "like"').bind(id).first<{ cnt: number }>();

  // Get pricing
  const pricing = await c.env.DB.prepare('SELECT rental_price, perm_price FROM story WHERE id = ?').bind(id).first<{ rental_price: number; perm_price: number }>();

  return c.json({ ...story, chapters, labels, likeCount: likeCount?.cnt || 0, rental_price: pricing?.rental_price || 14, perm_price: pricing?.perm_price || 21 });
});

app.get('/api/collections/:id/notes', async (c) => {
  const id = c.req.param('id');
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  const { results } = await c.env.DB.prepare('SELECT id, title, created_at, updated_at, word_count, live, free FROM writing WHERE story_id = ? ORDER BY created_at LIMIT ? OFFSET ?').bind(id, pageSize, (page - 1) * pageSize).all();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as total FROM writing WHERE story_id = ?').bind(id).first<{ total: number }>();
  return c.json({ notes: results, pagination: { page, pageSize, total: count?.total || 0, totalPages: Math.ceil((count?.total || 0) / pageSize) } });
});

// Get collection pricing
app.get('/api/collections/:id/pricing', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const pricing = await c.env.DB.prepare('SELECT rental_price, perm_price FROM story WHERE id = ?').bind(id).first<{ rental_price: number; perm_price: number }>();
  return c.json({ rental_price: pricing?.rental_price || 14, perm_price: pricing?.perm_price || 21 });
});

// Set collection pricing (author only)
app.put('/api/collections/:id/pricing', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { rental_price, perm_price } = await c.req.json();
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  await c.env.DB.prepare('UPDATE story SET rental_price = ?, perm_price = ? WHERE id = ?').bind(rental_price || 14, perm_price || 21, id).run();
  return c.json({ message: 'Pricing updated' });
});

app.post('/api/collections', authMiddleware, async (c) => {
  const { title, description, genre, labels } = await c.req.json();
  if (!title) return c.json({ error: 'Title required' }, 400);
  const userId = c.get('userId');
  try {
    const result = await c.env.DB.prepare('INSERT INTO story (title, description, genre, user_id) VALUES (?, ?, ?, ?)').bind(title, description || '', genre || null, userId).run();
    const storyId = result.meta.last_row_id;
    if (labels) {
      const labelArr = (typeof labels === 'string' ? labels.split(',') : labels).map((l: string) => l.trim()).filter((l: string) => l);
      for (const name of labelArr) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
        const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
        if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO story_label (story_id, label_id) VALUES (?, ?)').bind(storyId, label.id).run();
      }
    }
    return c.json({ id: storyId, title, description, genre }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'A collection with this title already exists' }, 409);
    throw e;
  }
});

app.put('/api/collections/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { title, description, genre, labels } = await c.req.json();
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  await c.env.DB.prepare('UPDATE story SET title = COALESCE(?, title), description = COALESCE(?, description), genre = COALESCE(?, genre), updated_at = datetime("now") WHERE id = ?').bind(title, description, genre, id).run();
  if (labels !== undefined) {
    await c.env.DB.prepare('DELETE FROM story_label WHERE story_id = ?').bind(id).run();
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels || []).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO story_label (story_id, label_id) VALUES (?, ?)').bind(id, label.id).run();
    }
  }
  return c.json({ message: 'Updated' });
});

app.delete('/api/collections/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  await c.env.DB.prepare('DELETE FROM story WHERE id = ?').bind(id).run();
  return c.json({ message: 'Deleted' });
});

// Toggle like/emotion on a collection
app.post('/api/collections/:id/emotion', authMiddleware, async (c) => {
  const storyId = c.req.param('id');
  const { emotion } = await c.req.json();
  const userId = c.get('userId');
  if (emotion === 'indifferent') {
    await c.env.DB.prepare('DELETE FROM story_emotion WHERE story_id = ? AND user_id = ?').bind(storyId, userId).run();
  } else {
    await c.env.DB.prepare('INSERT OR REPLACE INTO story_emotion (story_id, user_id, emotion) VALUES (?, ?, ?)').bind(storyId, userId, emotion).run();
  }
  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM story_emotion WHERE story_id = ? AND emotion = "like"').bind(storyId).first<{ cnt: number }>();
  return c.json({ likeCount: likeCount?.cnt || 0 });
});

// Check if user liked a collection
app.get('/api/collections/:id/emotion/status', authMiddleware, async (c) => {
  const storyId = c.req.param('id');
  const userId = c.get('userId');
  const existing = await c.env.DB.prepare('SELECT emotion FROM story_emotion WHERE story_id = ? AND user_id = ?').bind(storyId, userId).first<{ emotion: string }>();
  return c.json({ liked: existing?.emotion === 'like' });
});

// ═══════════════════════════════════════════
// NOTE EMOTION (per-chapter likes)
// ═══════════════════════════════════════════

app.post('/api/notes/:id/emotion', authMiddleware, async (c) => {
  const noteId = c.req.param('id');
  const { emotion } = await c.req.json();
  const userId = c.get('userId');
  if (emotion === 'indifferent') {
    await c.env.DB.prepare('DELETE FROM writing_emotion WHERE writing_id = ? AND user_id = ?').bind(noteId, userId).run();
  } else {
    await c.env.DB.prepare('INSERT OR REPLACE INTO writing_emotion (writing_id, user_id, emotion) VALUES (?, ?, ?)').bind(noteId, userId, emotion).run();
  }
  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_emotion WHERE writing_id = ? AND emotion = "like"').bind(noteId).first<{ cnt: number }>();
  return c.json({ likeCount: likeCount?.cnt || 0 });
});

app.get('/api/notes/:id/emotion/status', authMiddleware, async (c) => {
  const noteId = c.req.param('id');
  const userId = c.get('userId');
  const existing = await c.env.DB.prepare('SELECT emotion FROM writing_emotion WHERE writing_id = ? AND user_id = ?').bind(noteId, userId).first<{ emotion: string }>();
  return c.json({ liked: existing?.emotion === 'like' });
});

// ═══════════════════════════════════════════
// NOTES (WRITINGS)
// ═══════════════════════════════════════════

app.get('/api/notes', async (c) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
  const title = url.searchParams.get('title') || '';
  const author = url.searchParams.get('author') || '';
  const genre = url.searchParams.get('genre') || '';
  const labels = url.searchParams.get('labels') || '';
  const twLim = parseInt(url.searchParams.get('twLim') || '0');
  const sortBy = url.searchParams.get('sortBy') || '';
  const sortOrder = url.searchParams.get('sortOrder') || 'desc';

  let sql = `SELECT w.*, s.title as story_title, s.genre, u.display as author_display,
    (SELECT COUNT(*) FROM story_emotion se WHERE se.story_id = w.story_id AND se.emotion = 'like') as like_count
    FROM writing w
    JOIN story s ON w.story_id = s.id
    JOIN user u ON s.user_id = u.id
    WHERE 1=1`;
  const params: any[] = [];

  if (title) { sql += ' AND w.title LIKE ?'; params.push(`%${title}%`); }
  if (author) { sql += ' AND u.display LIKE ?'; params.push(`%${author}%`); }
  if (genre) { sql += ' AND s.genre = ?'; params.push(genre); }
  if (twLim > 0) { sql += ' AND w.word_count >= ?'; params.push(twLim); }
  else if (sortBy === 'createdAt') sql += ` ORDER BY w.created_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else if (sortBy === 'updatedAt') sql += ` ORDER BY w.updated_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
  else sql += ' ORDER BY w.updated_at DESC';

  sql += ' LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();

  for (const note of results as any[]) {
    const { results: noteLabels } = await c.env.DB.prepare('SELECT l.name FROM writing_label wl JOIN label l ON wl.label_id = l.id WHERE wl.writing_id = ?').bind(note.id).all();
    note.labels = noteLabels;
    note.like_count = note.like_count || 0;
  }

  const countResult = await c.env.DB.prepare('SELECT COUNT(*) as total FROM writing w JOIN story s ON w.story_id = s.id JOIN user u ON s.user_id = u.id').first<{ total: number }>();
  return c.json({ notes: results, pagination: { page, pageSize, total: countResult?.total || 0, totalPages: Math.ceil((countResult?.total || 0) / pageSize) } });
});

app.get('/api/notes/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const note = await c.env.DB.prepare('SELECT w.*, s.title as story_title, s.user_id as story_user_id, u.display as author_display FROM writing w JOIN story s ON w.story_id = s.id JOIN user u ON s.user_id = u.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);

  const userId = c.get('userId');
  // Allow if: note is free, user is the author, or user has unlocked the story
  if (!note.free && note.story_user_id !== userId) {
    if (!userId) return c.json({ error: 'This content is locked. Purchase to read.' }, 403);
    const unlock = await c.env.DB.prepare('SELECT id FROM story_unlock WHERE user_id = ? AND story_id = ? AND active = 1').bind(userId, note.story_id).first();
    if (!unlock) return c.json({ error: 'This content is locked. Purchase to read.' }, 403);
  }

  const likeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM story_emotion WHERE story_id = ? AND emotion = "like"').bind(note.story_id).first<{ cnt: number }>();
  const noteLikeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_emotion WHERE writing_id = ? AND emotion = "like"').bind(id).first<{ cnt: number }>();
  const viewCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_view WHERE writing_id = ?').bind(id).first<{ cnt: number }>();
  const { results: noteLabels } = await c.env.DB.prepare('SELECT l.name FROM writing_label wl JOIN label l ON wl.label_id = l.id WHERE wl.writing_id = ?').bind(id).all();

  return c.json({ ...note, likeCount: likeCount?.cnt || 0, noteLikeCount: noteLikeCount?.cnt || 0, viewCount: viewCount?.cnt || 0, labels: noteLabels });
});

app.post('/api/notes', authMiddleware, async (c) => {
  const { storyId, title, text, labels } = await c.req.json();
  if (!storyId || !title) return c.json({ error: 'storyId and title required' }, 400);
  const userId = c.get('userId');
  const story = await c.env.DB.prepare('SELECT user_id FROM story WHERE id = ?').bind(storyId).first<{ user_id: number }>();
  if (!story) return c.json({ error: 'Story not found' }, 404);
  if (story.user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  const wc = wordCount(text || '');
  const result = await c.env.DB.prepare('INSERT INTO writing (title, text, story_id, word_count) VALUES (?, ?, ?, ?)').bind(title, text || '', storyId, wc).run();
  const noteId = result.meta.last_row_id;

  if (labels) {
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (?, ?)').bind(noteId, label.id).run();
    }
  }

  return c.json({ id: noteId, title, word_count: wc }, 201);
});

app.put('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { title, text, labels, live } = await c.req.json();
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  const wc = text !== undefined ? wordCount(text) : note.word_count;
  await c.env.DB.prepare('UPDATE writing SET title = COALESCE(?, title), text = COALESCE(?, text), word_count = ?, live = COALESCE(?, live), updated_at = datetime("now") WHERE id = ?').bind(title, text, wc, live, id).run();

  if (labels !== undefined) {
    await c.env.DB.prepare('DELETE FROM writing_label WHERE writing_id = ?').bind(id).run();
    const labelArr = (typeof labels === 'string' ? labels.split(',') : labels || []).map((l: string) => l.trim()).filter((l: string) => l);
    for (const name of labelArr) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO label (name) VALUES (?)').bind(name).run();
      const label = await c.env.DB.prepare('SELECT id FROM label WHERE name = ?').bind(name).first<{ id: number }>();
      if (label) await c.env.DB.prepare('INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (?, ?)').bind(id, label.id).run();
    }
  }
  return c.json({ message: 'Updated' });
});

app.patch('/api/notes/:id/autosave', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const { text, title, labels } = await c.req.json();
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  const wc = text !== undefined ? wordCount(text) : note.word_count;
  await c.env.DB.prepare('UPDATE writing SET text = COALESCE(?, text), title = COALESCE(?, title), word_count = ?, updated_at = datetime("now") WHERE id = ?').bind(text, title, wc, id).run();
  await c.env.DB.prepare('INSERT OR REPLACE INTO writing_autosave (writing_id, user_id, text, title, updated_at) VALUES (?, ?, ?, ?, datetime("now"))').bind(id, userId, text || '', title || '').run();

  return c.json({ message: 'Auto-saved', wordCount: wc, updatedAt: new Date().toISOString() });
});

app.delete('/api/notes/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(id).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);
  await c.env.DB.prepare('DELETE FROM writing WHERE id = ?').bind(id).run();
  return c.json({ message: 'Deleted' });
});

// ═══════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════

app.post('/api/notes/:id/view', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  await c.env.DB.prepare('INSERT OR IGNORE INTO writing_view (writing_id, finger) VALUES (?, ?)').bind(id, userId.toString()).run();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_view WHERE writing_id = ?').bind(id).first<{ cnt: number }>();
  return c.json({ viewCount: count?.cnt || 0 });
});

// ═══════════════════════════════════════════
// PURCHASE / UNLOCK
// ═══════════════════════════════════════════

app.post('/api/purchase/unlock', authMiddleware, async (c) => {
  const { storyId, unlockType } = await c.req.json();
  const userId = c.get('userId');

  const story = await c.env.DB.prepare('SELECT s.*, u.display as author_display FROM story s JOIN user u ON s.user_id = u.id WHERE s.id = ?').bind(storyId).first<any>();
  if (!story) return c.json({ error: 'Story not found' }, 404);

  // Use collection's pricing
  const rentalPrice = story.rental_price || 14;
  const permPrice = story.perm_price || 21;
  const price = unlockType === 'PERM_UNLOCK' ? permPrice : rentalPrice;
  const platformCut = unlockType === 'PERM_UNLOCK' ? price * 0.10 : price * 0.05;
  const sellerCut = price - platformCut;

  const session = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'payment_method_types[]': 'card', mode: 'payment',
      success_url: `${c.env.APP_URL}/fiction/collections/${storyId}/notes?unlocked=true`,
      cancel_url: `${c.env.APP_URL}/fiction/collections/${storyId}/notes`,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `${unlockType === 'PERM_UNLOCK' ? 'Permanent' : '1-Year'} Access: ${story.title}`,
      'line_items[0][price_data][unit_amount]': Math.round(price * 100).toString(),
      'line_items[0][quantity]': '1',
      'metadata[story_id]': storyId.toString(),
      'metadata[user_id]': userId.toString(),
      'metadata[unlock_type]': unlockType,
    }).toString(),
  }).then((r: any) => r.json());

  return c.json({ url: session.url });
});

// Stripe webhook for unlock
app.post('/api/stripe/unlock-webhook', async (c) => {
  const body = await c.req.text();
  const event = JSON.parse(body);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const storyId = parseInt(session.metadata.story_id);
    const userId = parseInt(session.metadata.user_id);
    const unlockType = session.metadata.unlock_type;
    const amount = session.amount_total / 100;

    // Deactivate old unlocks
    await c.env.DB.prepare('UPDATE story_unlock SET active = 0 WHERE user_id = ? AND story_id = ?').bind(userId, storyId).run();

    // Calculate dates
    const startDate = new Date().toISOString();
    let endDate = null;
    if (unlockType === 'TIME_LIMITED') {
      const d = new Date(); d.setFullYear(d.getFullYear() + 1);
      endDate = d.toISOString();
    }

    const platformCut = unlockType === 'PERM_UNLOCK' ? amount * 0.10 : amount * 0.05;
    const sellerCut = amount - platformCut;

    await c.env.DB.prepare('INSERT INTO story_unlock (user_id, story_id, unlock_type, start_date, end_date, active) VALUES (?, ?, ?, ?, ?, 1)').bind(userId, storyId, unlockType, startDate, endDate).run();

    await c.env.DB.prepare('INSERT INTO purchase (user_id, amount, platform_cut, seller_cut, purchase_type, method, stripe_id, status) VALUES (?, ?, ?, ?, ?, "visa", ?, "completed")').bind(userId, amount, platformCut, sellerCut, unlockType, session.id).run();
  }
  return c.json({ received: true });
});

// ═══════════════════════════════════════════
// POLLING (replaces WebSocket)
// ═══════════════════════════════════════════

app.get('/api/poll/:writingId', authMiddleware, async (c) => {
  const writingId = c.req.param('writingId');
  const autosave = await c.env.DB.prepare('SELECT text, title, updated_at FROM writing_autosave WHERE writing_id = ?').bind(writingId).first<{ text: string; title: string; updated_at: string }>();
  const watching = await c.env.DB.prepare('SELECT COUNT(DISTINCT user_id) as cnt FROM writing_autosave WHERE writing_id = ? AND updated_at > datetime("now", "-30 seconds")').bind(writingId).first<{ cnt: number }>();
  const views = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing_view WHERE writing_id = ?').bind(writingId).first<{ cnt: number }>();

  return c.json({
    autosave: autosave ? { text: autosave.text, title: autosave.title, updatedAt: autosave.updated_at } : null,
    watchingCount: watching?.cnt || 0,
    viewCount: views?.cnt || 0,
    serverTime: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════
// SECURITY QUESTIONS (forgot password)
// ═══════════════════════════════════════════

app.post('/api/auth/questions/by-username', async (c) => {
  const { username } = await c.req.json();
  if (!username) return c.json({ error: 'Username required' }, 400);
  const user = await c.env.DB.prepare('SELECT id FROM user WHERE username = ?').bind(username).first<{ id: number }>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT s.question_id, q.question FROM security s JOIN question q ON s.question_id = q.id WHERE s.user_id = ?').bind(user.id).all();
  return c.json(results);
});

// ═══════════════════════════════════════════
// SHORT-LIVED TOKEN & LAST VIEW
// ═══════════════════════════════════════════

app.get('/api/fiction/short', authMiddleware, async (c) => {
  const token = await sign({ userId: c.get('userId'), username: c.get('username'), publicName: c.get('publicName'), short: true }, c.env.JWT_SECRET);
  return c.json({ shortLivedToken: token });
});

app.post('/api/fiction/last-view', authMiddleware, async (c) => {
  const { noteId } = await c.req.json();
  const userId = c.get('userId');
  const parsedNoteId = Number(noteId);
  if (isNaN(parsedNoteId)) return c.json({ error: 'Invalid note ID' }, 400);

  const user = await c.env.DB.prepare('SELECT last_view_fiction FROM user WHERE id = ?').bind(userId).first<{ last_view_fiction: string }>();
  let ids: number[] = [];
  if (user?.last_view_fiction) {
    ids = user.last_view_fiction.split(',').map(Number).filter(id => !isNaN(id) && id !== parsedNoteId);
  }
  ids.push(parsedNoteId);
  if (ids.length > 100) ids.shift();

  await c.env.DB.prepare('UPDATE user SET last_view_fiction = ? WHERE id = ?').bind(ids.join(','), userId).run();
  return c.json({ lastViewFiction: ids.join(',') });
});

app.get('/api/fiction/author-col-count', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare('SELECT COUNT(*) as c FROM story WHERE user_id = ?').bind(userId).first<{ c: number }>();
  return c.json({ c: result?.c || 0 });
});

// ═══════════════════════════════════════════
// TOGGLE NOTE FREE/PAID STATUS
// ═══════════════════════════════════════════

app.post('/api/fiction/collections/:collectionId/toggleState/:noteId', authMiddleware, async (c) => {
  const { collectionId, noteId } = c.req.params;
  const userId = c.get('userId');
  const note = await c.env.DB.prepare('SELECT w.*, s.user_id as story_user_id FROM writing w JOIN story s ON w.story_id = s.id WHERE w.id = ?').bind(noteId).first<any>();
  if (!note) return c.json({ error: 'Not found' }, 404);
  if (note.story_user_id !== userId) return c.json({ error: 'Forbidden' }, 403);

  // Check: if setting to free, always allow. If setting to premium, check that at least 3 notes are free
  const newFree = note.free ? 0 : 1;
  if (!newFree) {
    // Setting to premium — check free count
    const freeCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM writing WHERE story_id = ? AND free = 1 AND id != ?').bind(collectionId, noteId).first<{ cnt: number }>();
    if ((freeCount?.cnt || 0) < 3) {
      return c.json({ error: 'At least 3 chapters must remain free. Write more chapters before making this premium.' }, 400);
    }
  }

  await c.env.DB.prepare('UPDATE writing SET free = ? WHERE id = ?').bind(newFree, noteId).run();
  return c.json({ free: !!newFree });
});

// ═══════════════════════════════════════════
// CATCH-ALL
// ═══════════════════════════════════════════

app.all('*', (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith('/api/')) return c.text('Not Found', 404);
  return c.html(SPA_HTML);
});

export default app;
